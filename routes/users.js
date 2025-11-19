const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -otp');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, address, location } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (location) user.location = location;

    await user.save();
    
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.otp;
    
    res.json(userObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get purchase history (for customers)
router.get('/purchase-history', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.user.userId })
      .populate('items.productId', 'name image')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update browsing history
router.post('/browsing-history', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (user) {
      // Remove existing entry for this product
      user.browsingHistory = user.browsingHistory.filter(
        h => h.productId.toString() !== productId
      );
      
      // Add new entry
      user.browsingHistory.push({
        productId,
        viewedAt: new Date()
      });
      
      // Keep only last 50 entries
      if (user.browsingHistory.length > 50) {
        user.browsingHistory = user.browsingHistory.slice(-50);
      }
      
      await user.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
