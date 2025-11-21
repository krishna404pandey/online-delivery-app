const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const Product = require('../models/Product');
const User = require('../models/User');
const NotificationRequest = require('../models/NotificationRequest');
const { sendRestockNotification } = require('../config/email');

const normalizeLocation = (location) => {
  if (
    location &&
    typeof location.lat === 'number' &&
    typeof location.lng === 'number' &&
    !Number.isNaN(location.lat) &&
    !Number.isNaN(location.lng)
  ) {
    return { lat: location.lat, lng: location.lng };
  }
  return null;
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const enrichProductsWithSellerDetails = async (products) => {
  if (!products || products.length === 0) {
    return [];
  }

  const sellerIds = new Set();
  products.forEach(product => {
    if (product.retailerId) {
      sellerIds.add(product.retailerId.toString());
    } else if (product.wholesalerId) {
      sellerIds.add(product.wholesalerId.toString());
    }
  });

  const sellers = sellerIds.size > 0
    ? await User.find({ _id: { $in: Array.from(sellerIds) } }).select('name role address location')
    : [];

  const sellerMap = new Map();
  sellers.forEach(user => {
    sellerMap.set(user._id.toString(), user);
  });

  return products.map(product => {
    const obj = product.toObject();
    const sellerId = product.retailerId
      ? product.retailerId.toString()
      : product.wholesalerId
        ? product.wholesalerId.toString()
        : null;
    const seller = sellerId ? sellerMap.get(sellerId) : null;

    return {
      ...obj,
      sellerName: seller ? seller.name : null,
      sellerRole: seller ? seller.role : null,
      sellerAddress: seller ? seller.address : null,
      sellerLocation: seller ? normalizeLocation(seller.location) : null
    };
  });
};

// Get all products (with filters)
router.get('/', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, inStock, retailerId, wholesalerId, region, sortBy, customerLat, customerLng } = req.query;
    
    // Get user role from token if available (optional authentication)
    let userRole = null;
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token) {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'livemart-secret-key-change-in-production');
          userRole = decoded.role ? String(decoded.role).toLowerCase().trim() : null;
        }
      }
    } catch (err) {
      // Token not provided or invalid - treat as customer
      userRole = null;
    }
    
    let query = {};

    if (category) {
      query.category = category;
    }
    if (minPrice) {
      query.price = { ...query.price, $gte: parseFloat(minPrice) };
    }
    if (maxPrice) {
      query.price = { ...query.price, $lte: parseFloat(maxPrice) };
    }
    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    }
    if (retailerId) {
      query.retailerId = retailerId;
    }
    if (wholesalerId) {
      query.wholesalerId = wholesalerId;
    }
    if (region) {
      query.region = region;
    }

    const productDocs = await Product.find(query).sort({ createdAt: -1 });
    
    // Filter products based on user role:
    // - Customers: Only see retailer products (retailerId exists, wholesalerId is null, proxyAvailable is false) and proxy products
    // - Retailers: See all products (retailer products, wholesaler products, and proxy products)
    // - Wholesalers: See all products
    let filteredProducts = productDocs;
    if (userRole === 'customer' || !userRole) {
      // Customers can only see:
      // 1. Products owned by retailers (retailerId exists, wholesalerId is null, proxyAvailable is false)
      // 2. Proxy products (proxyAvailable is true, regardless of retailerId/wholesalerId)
      filteredProducts = productDocs.filter(product => {
        const hasRetailer = product.retailerId && product.retailerId.toString() !== 'null';
        const hasWholesaler = product.wholesalerId && product.wholesalerId.toString() !== 'null';
        const isProxy = product.proxyAvailable === true;
        
        // Customer can see: retailer products (not proxy) OR proxy products
        return (hasRetailer && !hasWholesaler && !isProxy) || isProxy;
      });
    }
    // Retailers and wholesalers can see all products (no filtering needed)

    let products = await enrichProductsWithSellerDetails(filteredProducts);

    if (sortBy === 'distance' && customerLat && customerLng) {
      const lat = parseFloat(customerLat);
      const lng = parseFloat(customerLng);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid customer coordinates' });
      }

      products = products
        .map(product => {
          const distance = product.sellerLocation
            ? calculateDistance(lat, lng, product.sellerLocation.lat, product.sellerLocation.lng)
            : null;
          return { ...product, distance };
        })
        .sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Increment view count
    product.views += 1;
    await product.save();

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add product (Retailer/Wholesaler only)
router.post('/', authenticateToken, authorizeRole('retailer', 'wholesaler'), async (req, res) => {
  try {
    const { name, description, price, stock, category, image, availabilityDate, proxyWholesalerId, region } = req.body;
    
    // Debug logging
    console.log('Product creation request:', {
      userRole: req.user.role,
      userId: req.user.userId,
      hasName: !!name,
      hasPrice: !!price,
      hasStock: stock !== undefined,
      hasCategory: !!category
    });
    
    if (!name || !price || stock === undefined || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize role for comparison (case-insensitive)
    const userRole = req.user.role ? String(req.user.role).toLowerCase().trim() : null;
    const isRetailer = userRole === 'retailer';
    const isWholesaler = userRole === 'wholesaler';

    // For proxy products: retailer creates a product that references a wholesaler product
    // The proxyAvailable flag makes it visible to customers
    const newProduct = new Product({
      name,
      description: description || '',
      price: parseFloat(price),
      stock: parseInt(stock),
      category,
      image: image || 'https://via.placeholder.com/300',
      availabilityDate: availabilityDate || new Date(),
      retailerId: isRetailer ? req.user.userId : null,
      wholesalerId: isWholesaler ? req.user.userId : (proxyWholesalerId || null),
      proxyAvailable: isRetailer && proxyWholesalerId ? true : false,
      region: region || ''
    });

    console.log('Creating product:', {
      name: newProduct.name,
      retailerId: newProduct.retailerId,
      wholesalerId: newProduct.wholesalerId,
      proxyAvailable: newProduct.proxyAvailable,
      userRole: userRole
    });

    await newProduct.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('product-added', newProduct);
    }

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product (Retailer/Wholesaler only)
router.put('/:id', authenticateToken, authorizeRole('retailer', 'wholesaler'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check ownership
    if (req.user.role === 'retailer' && product.retailerId?.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (req.user.role === 'wholesaler' && product.wholesalerId?.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { name, description, price, stock, category, image, availabilityDate, region } = req.body;
    
    // Track if stock changed from 0 to > 0 (restock)
    const wasOutOfStock = product.stock === 0;
    const previousStock = product.stock;
    
    if (name) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = parseFloat(price);
    if (stock !== undefined) product.stock = parseInt(stock);
    if (category) product.category = category;
    if (image) product.image = image;
    if (availabilityDate) product.availabilityDate = availabilityDate;
    if (region) product.region = region;

    await product.save();

    // Check if product was restocked (went from 0 to > 0)
    if (wasOutOfStock && product.stock > 0) {
      // Find all notification requests for this product that haven't been notified yet
      const notificationRequests = await NotificationRequest.find({
        productId: product._id,
        notified: false
      }).populate('userId', 'email name');

      // Send notifications to all customers who requested to be notified
      for (const notification of notificationRequests) {
        try {
          const email = notification.email || (notification.userId?.email);
          if (email) {
            await sendRestockNotification(email, product);
            // Mark as notified
            notification.notified = true;
            notification.notifiedAt = new Date();
            await notification.save();
          }
        } catch (error) {
          console.error(`Error sending restock notification to ${notification.email}:`, error);
          // Continue with other notifications even if one fails
        }
      }

      if (notificationRequests.length > 0) {
        console.log(`✅ Sent restock notifications to ${notificationRequests.length} customer(s) for product ${product.name}`);
      }
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('product-updated', product);
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product (Retailer/Wholesaler only)
router.delete('/:id', authenticateToken, authorizeRole('retailer', 'wholesaler'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check ownership
    if (req.user.role === 'retailer' && product.retailerId?.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (req.user.role === 'wholesaler' && product.wholesalerId?.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await Product.findByIdAndDelete(req.params.id);

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('product-deleted', req.params.id);
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get proxy products for retailer
router.get('/proxy/:retailerId', async (req, res) => {
  try {
    const products = await Product.find({
      retailerId: req.params.retailerId,
      proxyAvailable: true
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get wholesaler products (for retailers to purchase)
router.get('/wholesaler/list', authenticateToken, authorizeRole('retailer'), async (req, res) => {
  try {
    // Get all products from wholesalers (not proxy products)
    const products = await Product.find({
      wholesalerId: { $exists: true, $ne: null },
      proxyAvailable: false
    }).sort({ createdAt: -1 });
    
    const enrichedProducts = await enrichProductsWithSellerDetails(products);
    res.json(enrichedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Purchase from wholesaler (Retailer only)
router.post('/purchase-from-wholesaler', authenticateToken, authorizeRole('retailer'), async (req, res) => {
  try {
    const { items } = req.body; // [{ productId, quantity }]
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    // Validate all products exist and are from wholesalers
    const productIds = items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    if (products.length !== items.length) {
      return res.status(400).json({ error: 'Some products not found' });
    }

    // Check all products are from wholesalers
    for (const product of products) {
      if (!product.wholesalerId || product.proxyAvailable) {
        return res.status(400).json({ error: `Product ${product.name} is not available for purchase from wholesaler` });
      }
      if (product.stock <= 0) {
        return res.status(400).json({ error: `Product ${product.name} is out of stock` });
      }
    }

    // Check stock availability
    const retailerProducts = [];
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.productId);
      if (!product) {
        return res.status(400).json({ error: 'Product not found' });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      // Check if retailer already has this product
      let retailerProduct = await Product.findOne({
        retailerId: req.user.userId,
        name: product.name,
        category: product.category,
        // Match by name and category to avoid duplicates
      });

      if (retailerProduct) {
        // Update existing product stock
        retailerProduct.stock += item.quantity;
        retailerProduct.price = product.price; // Update price to match wholesaler
        await retailerProduct.save();
      } else {
        // Create new product for retailer
        retailerProduct = new Product({
          name: product.name,
          description: product.description,
          price: product.price, // Retailer can set their own price later
          stock: item.quantity,
          category: product.category,
          image: product.image,
          retailerId: req.user.userId,
          wholesalerId: null, // This is now a retailer product
          proxyAvailable: false,
          region: product.region || ''
        });
        await retailerProduct.save();
      }

      // Update wholesaler product stock
      product.stock -= item.quantity;
      await product.save();

      retailerProducts.push(retailerProduct);
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('products-purchased', { retailerId: req.user.userId, products: retailerProducts });
    }

    res.status(201).json({
      message: 'Products purchased successfully and added to your inventory',
      products: retailerProducts
    });
  } catch (error) {
    console.error('Purchase from wholesaler error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
