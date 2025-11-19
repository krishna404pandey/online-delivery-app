const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Feedback = require('../models/Feedback');
const Product = require('../models/Product');

// Submit feedback
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { productId, orderId, rating, comment, type } = req.body;
    
    if (!productId && !orderId) {
      return res.status(400).json({ error: 'Product ID or Order ID required' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const newFeedback = new Feedback({
      userId: req.user.userId,
      productId: productId || null,
      orderId: orderId || null,
      rating: parseInt(rating),
      comment: comment || '',
      type: type || 'product'
    });

    await newFeedback.save();

    // Update product average rating if product feedback
    if (productId) {
      const feedbacks = await Feedback.find({ productId });
      const avgRating = feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length;
      
      await Product.findByIdAndUpdate(productId, {
        $push: { ratings: { userId: req.user.userId, rating: parseInt(rating), comment: comment || '', createdAt: new Date() } },
        averageRating: avgRating
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('feedback-added', newFeedback);
    }

    res.status(201).json(newFeedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get feedback for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const feedback = await Feedback.find({ productId: req.params.productId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get feedback for an order
router.get('/order/:orderId', authenticateToken, async (req, res) => {
  try {
    const feedback = await Feedback.find({ orderId: req.params.orderId })
      .populate('userId', 'name');
    
    // Check authorization
    if (feedback.length > 0 && feedback[0].userId._id.toString() !== req.user.userId && 
        req.user.role !== 'retailer' && req.user.role !== 'wholesaler') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all feedback (for retailers/wholesalers)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let feedback;
    
    if (req.user.role === 'customer') {
      feedback = await Feedback.find({ userId: req.user.userId })
        .populate('productId', 'name')
        .sort({ createdAt: -1 });
    } else {
      feedback = await Feedback.find()
        .populate('userId', 'name')
        .populate('productId', 'name')
        .sort({ createdAt: -1 });
    }
    
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
