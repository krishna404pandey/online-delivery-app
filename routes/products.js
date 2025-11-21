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
    let products = await enrichProductsWithSellerDetails(productDocs);

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
    
    if (!name || !price || stock === undefined || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newProduct = new Product({
      name,
      description: description || '',
      price: parseFloat(price),
      stock: parseInt(stock),
      category,
      image: image || 'https://via.placeholder.com/300',
      availabilityDate: availabilityDate || new Date(),
      retailerId: req.user.role === 'retailer' ? req.user.userId : null,
      wholesalerId: req.user.role === 'wholesaler' ? req.user.userId : (proxyWholesalerId || null),
      proxyAvailable: req.user.role === 'retailer' && proxyWholesalerId ? true : false,
      region: region || ''
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

module.exports = router;
