const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const Product = require('../models/Product');
const User = require('../models/User');

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

    let products = await Product.find(query).sort({ createdAt: -1 });

    if (sortBy === 'distance' && customerLat && customerLng) {
      const lat = parseFloat(customerLat);
      const lng = parseFloat(customerLng);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid customer coordinates' });
      }

      const retailerIds = [];
      const wholesalerIds = [];

      products.forEach(product => {
        if (product.retailerId) {
          retailerIds.push(product.retailerId.toString());
        } else if (product.wholesalerId) {
          wholesalerIds.push(product.wholesalerId.toString());
        }
      });

      const uniqueUserIds = [...new Set([...retailerIds, ...wholesalerIds])];
      const users = await User.find({ _id: { $in: uniqueUserIds } }).select('location');
      const userLocationMap = new Map();
      users.forEach(user => {
        if (user.location && typeof user.location.lat === 'number' && typeof user.location.lng === 'number') {
          userLocationMap.set(user._id.toString(), user.location);
        }
      });

      const productsWithDistance = products.map(product => {
        let sellerLocation = null;
        if (product.retailerId && userLocationMap.has(product.retailerId.toString())) {
          sellerLocation = userLocationMap.get(product.retailerId.toString());
        } else if (product.wholesalerId && userLocationMap.has(product.wholesalerId.toString())) {
          sellerLocation = userLocationMap.get(product.wholesalerId.toString());
        }

        const distance = sellerLocation
          ? calculateDistance(lat, lng, sellerLocation.lat, sellerLocation.lng)
          : null;

        return { ...product.toObject(), distance };
      });

      products = productsWithDistance.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    } else {
      products = products.map(product => product.toObject());
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
    
    if (name) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = parseFloat(price);
    if (stock !== undefined) product.stock = parseInt(stock);
    if (category) product.category = category;
    if (image) product.image = image;
    if (availabilityDate) product.availabilityDate = availabilityDate;
    if (region) product.region = region;

    await product.save();

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
