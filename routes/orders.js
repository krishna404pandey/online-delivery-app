const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendOrderConfirmation, sendDeliveryConfirmation } = require('../config/email');
const { sendDeliverySMS } = require('../config/sms');

// Create order
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { items, paymentMethod, deliveryAddress, scheduledDate, orderType } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order items required' });
    }

    if (!paymentMethod || !['online', 'cod'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method. Must be "online" or "cod"' });
    }

    const products = await Product.find({ _id: { $in: items.map(i => i.productId) } });
    let totalAmount = 0;
    const orderItems = [];
    const stockUpdates = [];

    // Validate items and calculate total
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;
      orderItems.push({
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        price: product.price,
        total: itemTotal
      });

      // Prepare stock update
      stockUpdates.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $inc: { stock: -item.quantity } }
        }
      });
    }

    // Generate tracking number
    const trackingNumber = `TRK${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Determine retailer/wholesaler from products
    const firstProduct = products[0];
    const retailerId = firstProduct.retailerId || null;
    const wholesalerId = firstProduct.wholesalerId || null;

    // Create order
    const newOrder = new Order({
      customerId: req.user.userId,
      retailerId,
      wholesalerId,
      items: orderItems,
      totalAmount,
      status: 'pending',
      paymentMethod,
      paymentStatus: paymentMethod === 'online' ? 'completed' : 'pending',
      deliveryAddress: deliveryAddress || '',
      scheduledDate: scheduledDate || null,
      orderType: orderType || 'online',
      deliveryDetails: {
        status: 'pending',
        trackingNumber,
        estimatedDelivery: scheduledDate ? new Date(scheduledDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      }
    });

    await newOrder.save();

    // Update stock
    await Product.bulkWrite(stockUpdates);

    // Update user purchase history
    await User.findByIdAndUpdate(req.user.userId, {
      $push: {
        purchaseHistory: {
          $each: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            purchasedAt: new Date()
          }))
        }
      }
    });

    // Send order confirmation email
    const customer = await User.findById(req.user.userId);
    if (customer && customer.email) {
      await sendOrderConfirmation(customer.email, newOrder);
      newOrder.emailSent = true;
      await newOrder.save();
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${req.user.userId}`).emit('order-created', newOrder);
      io.emit('order-update', newOrder);
    }

    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'customer') {
      query.customerId = req.user.userId;
    } else if (req.user.role === 'retailer') {
      // Retailers see orders where they are the retailer (customer orders for their products)
      query.retailerId = req.user.userId;
    } else if (req.user.role === 'wholesaler') {
      query.wholesalerId = req.user.userId;
    }

    const orders = await Order.find(query)
      .populate('customerId', 'name email phone')
      .populate('retailerId', 'name email')
      .populate('wholesalerId', 'name email')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('retailerId', 'name email')
      .populate('wholesalerId', 'name email')
      .populate('items.productId', 'name image');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check authorization
    if (req.user.role === 'customer' && order.customerId._id.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status (Retailer/Wholesaler)
router.put('/:id/status', authenticateToken, authorizeRole('retailer', 'wholesaler'), async (req, res) => {
  try {
    const { status, deliveryDetails } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check authorization - retailer can only update orders for their products
    if (req.user.role === 'retailer') {
      const retailerIdStr = order.retailerId ? order.retailerId.toString() : null;
      const userIdStr = req.user.userId ? req.user.userId.toString() : null;
      if (!retailerIdStr || retailerIdStr !== userIdStr) {
        console.error(`Authorization failed - Retailer ID: ${retailerIdStr}, User ID: ${userIdStr}`);
        return res.status(403).json({ error: 'Not authorized to update this order. This order does not belong to you.' });
      }
    }

    // Check authorization - wholesaler can only update orders for their products
    if (req.user.role === 'wholesaler') {
      const wholesalerIdStr = order.wholesalerId ? order.wholesalerId.toString() : null;
      const userIdStr = req.user.userId ? req.user.userId.toString() : null;
      if (!wholesalerIdStr || wholesalerIdStr !== userIdStr) {
        console.error(`Authorization failed - Wholesaler ID: ${wholesalerIdStr}, User ID: ${userIdStr}`);
        return res.status(403).json({ error: 'Not authorized to update this order. This order does not belong to you.' });
      }
    }

    order.status = status;
    order.updatedAt = new Date();
    
    if (deliveryDetails) {
      order.deliveryDetails = { ...order.deliveryDetails, ...deliveryDetails };
    }

    if (status === 'processing') {
      order.deliveryDetails = order.deliveryDetails || {};
      order.deliveryDetails.status = 'processing';
      const estimatedDate = new Date();
      estimatedDate.setDate(estimatedDate.getDate() + 3);
      order.deliveryDetails.estimatedDelivery = estimatedDate;
    }
    
    if (status === 'in_transit') {
      order.deliveryDetails = order.deliveryDetails || {};
      order.deliveryDetails.status = 'in_transit';
      if (!order.deliveryDetails.estimatedDelivery) {
        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + 2);
        order.deliveryDetails.estimatedDelivery = estimatedDate;
      }
    }
    
    if (status === 'delivered') {
      if (order.paymentStatus === 'pending') {
        order.paymentStatus = 'completed';
      }
      order.deliveredAt = new Date();
      order.deliveryDetails = order.deliveryDetails || {};
      order.deliveryDetails.status = 'delivered';

      // Send delivery confirmation
      const customer = await User.findById(order.customerId);
      if (customer) {
        if (customer.email) {
          await sendDeliveryConfirmation(customer.email, order);
        }
        if (customer.phone) {
          await sendDeliverySMS(customer.phone, order);
        }
        order.emailSent = true;
        order.smsSent = true;
      }
    }

    await order.save();

    // Emit real-time update to customer
    const io = req.app.get('io');
    if (io) {
      const customerId = order.customerId.toString ? order.customerId.toString() : order.customerId;
      io.to(`user-${customerId}`).emit('order-status-updated', order);
      io.emit('order-update', order);
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update payment status
router.put('/:id/payment', authenticateToken, async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check authorization
    if (req.user.role === 'customer' && order.customerId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    order.paymentStatus = paymentStatus;
    order.updatedAt = new Date();
    await order.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${order.customerId}`).emit('payment-updated', order);
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
