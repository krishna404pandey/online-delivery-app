const express = require('express');
const router = express.Router();
const Query = require('../models/Query');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Create query/help/feedback (Customer)
router.post('/', authenticateToken, authorizeRole('customer'), async (req, res) => {
  try {
    const { orderId, productId, type, subject, message, priority } = req.body;
    const customerId = req.user.userId;

    let retailerId = null;
    let wholesalerId = null;

    // If orderId is provided, get retailer/wholesaler from order
    if (orderId) {
      const order = await Order.findById(orderId).populate('items.productId');
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (order.customerId.toString() !== customerId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      retailerId = order.retailerId;
      wholesalerId = order.wholesalerId;
    } else if (productId) {
      // If productId is provided, get retailer/wholesaler from product
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      retailerId = product.retailerId;
      wholesalerId = product.wholesalerId;
    }

    const query = new Query({
      customerId,
      retailerId,
      wholesalerId,
      orderId: orderId || null,
      productId: productId || null,
      type: type || 'query',
      subject,
      message,
      priority: priority || 'medium'
    });

    await query.save();
    await query.populate('customerId', 'name email');
    await query.populate('retailerId', 'name email');
    await query.populate('wholesalerId', 'name email');
    await query.populate('orderId', 'orderNumber');
    await query.populate('productId', 'name');

    // Emit real-time notification to retailer/wholesaler
    const io = req.app.get('io');
    if (io) {
      if (retailerId) {
        io.to(`user-${retailerId}`).emit('new-query', query);
      }
      if (wholesalerId) {
        io.to(`user-${wholesalerId}`).emit('new-query', query);
      }
    }

    res.status(201).json(query);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get queries (Customer - their own queries)
router.get('/customer', authenticateToken, authorizeRole('customer'), async (req, res) => {
  try {
    const queries = await Query.find({ customerId: req.user.userId })
      .populate('retailerId', 'name email')
      .populate('wholesalerId', 'name email')
      .populate('orderId', 'orderNumber')
      .populate('productId', 'name')
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(queries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get queries (Retailer - queries for their products/orders)
router.get('/retailer', authenticateToken, authorizeRole('retailer'), async (req, res) => {
  try {
    const queries = await Query.find({ retailerId: req.user.userId })
      .populate('customerId', 'name email phone')
      .populate('orderId', 'orderNumber')
      .populate('productId', 'name')
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(queries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get queries (Wholesaler - queries for their products/orders)
router.get('/wholesaler', authenticateToken, authorizeRole('wholesaler'), async (req, res) => {
  try {
    const queries = await Query.find({ wholesalerId: req.user.userId })
      .populate('customerId', 'name email phone')
      .populate('orderId', 'orderNumber')
      .populate('productId', 'name')
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(queries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single query
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const query = await Query.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('retailerId', 'name email')
      .populate('wholesalerId', 'name email')
      .populate('orderId', 'orderNumber')
      .populate('productId', 'name')
      .populate('respondedBy', 'name email');

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    // Check authorization
    if (req.user.role === 'customer' && query.customerId._id.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (req.user.role === 'retailer' && (!query.retailerId || query.retailerId._id.toString() !== req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (req.user.role === 'wholesaler' && (!query.wholesalerId || query.wholesalerId._id.toString() !== req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(query);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Respond to query (Retailer/Wholesaler)
router.put('/:id/respond', authenticateToken, authorizeRole('retailer', 'wholesaler'), async (req, res) => {
  try {
    const { response, status } = req.body;
    const query = await Query.findById(req.params.id);

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    // Check authorization
    if (req.user.role === 'retailer' && (!query.retailerId || query.retailerId.toString() !== req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (req.user.role === 'wholesaler' && (!query.wholesalerId || query.wholesalerId.toString() !== req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    query.response = response;
    query.respondedBy = req.user.userId;
    query.respondedAt = new Date();
    if (status) {
      query.status = status;
    } else if (response) {
      query.status = 'in_progress';
    }

    await query.save();
    await query.populate('customerId', 'name email');
    await query.populate('respondedBy', 'name email');

    // Emit real-time update to customer
    const io = req.app.get('io');
    if (io) {
      const customerId = query.customerId._id.toString();
      io.to(`user-${customerId}`).emit('query-response', query);
    }

    res.json(query);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update query status
router.put('/:id/status', authenticateToken, authorizeRole('retailer', 'wholesaler'), async (req, res) => {
  try {
    const { status } = req.body;
    const query = await Query.findById(req.params.id);

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    // Check authorization
    if (req.user.role === 'retailer' && (!query.retailerId || query.retailerId.toString() !== req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (req.user.role === 'wholesaler' && (!query.wholesalerId || query.wholesalerId.toString() !== req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    query.status = status;
    await query.save();

    res.json(query);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;



