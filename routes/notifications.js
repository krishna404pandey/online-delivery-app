const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const NotificationRequest = require('../models/NotificationRequest');
const Product = require('../models/Product');

// Subscribe customer for restock notification
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.stock > 0) {
      return res.status(400).json({ error: 'Product is already in stock' });
    }

    const existing = await NotificationRequest.findOne({
      userId: req.user.userId,
      productId
    });

    if (existing) {
      return res.json({ message: 'You are already registered for notifications' });
    }

    await NotificationRequest.create({
      userId: req.user.userId,
      productId,
      email: req.user.email
    });

    res.json({ message: 'You will be notified when this product is back in stock' });
  } catch (error) {
    console.error('Notification subscribe error:', error);
    if (error.code === 11000) {
      return res.json({ message: 'You are already registered for notifications' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

