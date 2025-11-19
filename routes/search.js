const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Search products with advanced filters
router.get('/products', async (req, res) => {
  try {
    const { 
      query, 
      category, 
      minPrice, 
      maxPrice, 
      inStock, 
      minQuantity,
      location,
      maxDistance,
      sortBy,
      region
    } = req.query;

    let searchQuery = {};

    // Text search
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      searchQuery.category = category;
    }

    // Price range
    if (minPrice || maxPrice) {
      searchQuery.price = {};
      if (minPrice) searchQuery.price.$gte = parseFloat(minPrice);
      if (maxPrice) searchQuery.price.$lte = parseFloat(maxPrice);
    }

    // Stock filter
    if (inStock === 'true') {
      searchQuery.stock = { $gt: 0 };
    }
    if (minQuantity) {
      searchQuery.stock = { ...searchQuery.stock, $gte: parseInt(minQuantity) };
    }

    // Region filter
    if (region) {
      searchQuery.region = region;
    }

    let products = await Product.find(searchQuery);

    // Location-based filtering
    if (location && maxDistance) {
      const [lat, lng] = location.split(',').map(Number);
      const users = await User.find({
        $or: [{ role: 'retailer' }, { role: 'wholesaler' }],
        location: { $exists: true }
      });

      const productsWithDistance = products.map(product => {
        let productLocation = null;
        if (product.retailerId) {
          const retailer = users.find(u => u._id.toString() === product.retailerId.toString());
          if (retailer && retailer.location) {
            productLocation = retailer.location;
          }
        }
        if (product.wholesalerId) {
          const wholesaler = users.find(u => u._id.toString() === product.wholesalerId.toString());
          if (wholesaler && wholesaler.location) {
            productLocation = wholesaler.location;
          }
        }
        
        if (productLocation) {
          const distance = calculateDistance(lat, lng, productLocation.lat, productLocation.lng);
          return { ...product.toObject(), distance };
        }
        return { ...product.toObject(), distance: null };
      });

      products = productsWithDistance
        .filter(p => p.distance !== null && p.distance <= parseFloat(maxDistance))
        .sort((a, b) => a.distance - b.distance);
    }

    // Sorting
    if (sortBy === 'price-asc') {
      products.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      products.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name') {
      products.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'rating') {
      products.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get personalized recommendations
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.json([]);
    }

    // Get user's purchase history categories
    const orders = await Order.find({ customerId: req.user.userId })
      .populate('items.productId', 'category');
    
    const purchasedCategories = new Set();
    const purchasedProducts = new Set();

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId) {
          purchasedProducts.add(item.productId._id.toString());
          if (item.productId.category) {
            purchasedCategories.add(item.productId.category);
          }
        }
      });
    });

    // Get browsing history categories
    const browsingProducts = await Product.find({
      _id: { $in: user.browsingHistory.map(h => h.productId) }
    });

    browsingProducts.forEach(product => {
      if (product.category) {
        purchasedCategories.add(product.category);
      }
    });

    // Recommend products from same categories
    const recommendations = await Product.find({
      _id: { $nin: Array.from(purchasedProducts) },
      category: { $in: Array.from(purchasedCategories) },
      stock: { $gt: 0 }
    })
    .sort({ averageRating: -1, views: -1 })
    .limit(10);

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get nearby shops
router.get('/shops/nearby', authenticateToken, async (req, res) => {
  try {
    const { lat, lng, maxDistance } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }

    const shops = await User.find({
      $or: [{ role: 'retailer' }, { role: 'wholesaler' }],
      location: { $exists: true }
    });

    const nearbyShops = shops.map(shop => {
      const distance = calculateDistance(
        parseFloat(lat), 
        parseFloat(lng), 
        shop.location.lat, 
        shop.location.lng
      );
      
      return {
        id: shop._id,
        name: shop.name,
        role: shop.role,
        address: shop.address,
        location: shop.location,
        distance: parseFloat(distance.toFixed(2))
      };
    }).filter(shop => {
      if (!maxDistance) return true;
      return shop.distance <= parseFloat(maxDistance);
    });

    nearbyShops.sort((a, b) => a.distance - b.distance);
    res.json(nearbyShops);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
