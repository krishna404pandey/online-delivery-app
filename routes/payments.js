const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// Initialize Stripe
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('Warning: STRIPE_SECRET_KEY not set. Online payments will not work.');
}

// Create Stripe Checkout Session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
    }

    const { items, deliveryAddress, scheduledDate } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order items required' });
    }

    if (!deliveryAddress || deliveryAddress.trim() === '') {
      return res.status(400).json({ error: 'Delivery address required' });
    }

    // Validate product IDs before querying
    const productIds = [];
    for (const item of items) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({ error: 'Invalid product ID provided' });
      }
      productIds.push(new mongoose.Types.ObjectId(item.productId));
    }

    // Validate products and calculate total
    const products = await Product.find({ _id: { $in: productIds } });
    let totalAmount = 0;
    const lineItems = [];
    const orderItems = [];

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

      // Use image only if it's a valid HTTP(S) URL under Stripe's limit
      const productImages = [];
      if (product.image && typeof product.image === 'string') {
        const trimmedImage = product.image.trim();
        if (
          trimmedImage.length > 0 &&
          trimmedImage.length <= 2048 &&
          (trimmedImage.startsWith('http://') || trimmedImage.startsWith('https://'))
        ) {
          productImages.push(trimmedImage);
        }
      }

      // Add to Stripe line items
      lineItems.push({
        price_data: {
          currency: 'inr', // Indian Rupees - change to your currency
          product_data: {
            name: product.name,
            description: product.description || product.name,
            images: productImages,
          },
          unit_amount: Math.round(product.price * 100), // Convert to paise/cents
        },
        quantity: item.quantity,
      });

      orderItems.push({
        productId: product._id.toString(),
        productName: product.name,
        quantity: item.quantity,
        price: product.price,
        total: itemTotal
      });
    }

    // Get user details
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment-cancelled`,
      customer_email: user.email,
      metadata: {
        userId: req.user.userId,
        deliveryAddress: deliveryAddress.trim(),
        scheduledDate: scheduledDate || '',
        orderItems: JSON.stringify(orderItems),
        totalAmount: totalAmount.toString()
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify payment and create order
router.post('/verify-payment', authenticateToken, async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Payment session not found' });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Parse metadata
    const { userId, deliveryAddress, scheduledDate, orderItems, totalAmount } = session.metadata;
    
    // Verify user matches
    if (userId !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Parse order items
    const items = JSON.parse(orderItems);
    
    // Check if order already exists for this session by matching user, items, and recent timestamp
    // This prevents duplicate orders if user refreshes the success page
    const recentTime = new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes
    
    const existingOrder = await Order.findOne({
      customerId: req.user.userId,
      paymentMethod: 'online',
      paymentStatus: 'completed',
      totalAmount: parseFloat(totalAmount),
      createdAt: { $gte: recentTime },
      'items.0.productId': items[0]?.productId
    }).sort({ createdAt: -1 });

    if (existingOrder) {
      // Verify it's the same order by checking item count
      if (existingOrder.items.length === items.length) {
        return res.json({ 
          order: existingOrder, 
          message: 'Order already created for this payment' 
        });
      }
    }
    
    // Validate product IDs before querying
    const productIds = [];
    for (const item of items) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({ error: 'Invalid product ID provided' });
      }
      productIds.push(new mongoose.Types.ObjectId(item.productId));
    }

    // Validate items still exist and have stock
    const products = await Product.find({ _id: { $in: productIds } });
    
    // Check if all products are still available
    if (products.length !== items.length) {
      return res.status(400).json({ error: 'Some products are no longer available' });
    }
    
    // Check stock availability
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.productId);
      if (product && product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }
    }
    
    // Determine retailer/wholesaler from products
    const firstProduct = products[0];
    const retailerId = firstProduct.retailerId || null;
    const wholesalerId = firstProduct.wholesalerId || null;

    // Generate tracking number
    const trackingNumber = `TRK${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create order
    const newOrder = new Order({
      customerId: req.user.userId,
      retailerId,
      wholesalerId,
      items: items,
      totalAmount: parseFloat(totalAmount),
      status: 'pending',
      paymentMethod: 'online',
      paymentStatus: 'completed',
      deliveryAddress: deliveryAddress,
      scheduledDate: scheduledDate || null,
      orderType: 'online',
      deliveryDetails: {
        status: 'pending',
        trackingNumber,
        estimatedDelivery: scheduledDate ? new Date(scheduledDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      }
    });

    await newOrder.save();

    // Update stock
    const stockUpdates = items.map(item => ({
      updateOne: {
        filter: { _id: item.productId },
        update: { $inc: { stock: -item.quantity } }
      }
    }));
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
      const { sendOrderConfirmation } = require('../config/email');
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

    res.json({ order: newOrder, paymentStatus: 'completed' });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for Stripe (optional but recommended)
// IMPORTANT: This endpoint requires raw body for webhook signature verification
// Configure in server.js by adding: app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentRoutes);
// For webhook to work:
// 1. Set up webhook in Stripe Dashboard
// 2. Use Stripe CLI for local testing: stripe listen --forward-to localhost:3000/api/payments/webhook
// 3. Add STRIPE_WEBHOOK_SECRET to environment variables
router.post('/webhook', async (req, res) => {
  // Only process if webhook secret is configured
  if (!process.env.STRIPE_WEBHOOK_SECRET || !stripe) {
    console.log('Webhook secret not configured, skipping webhook processing');
    return res.json({ received: true, message: 'Webhook not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // req.body should be raw buffer for webhook verification
    // This requires express.raw() middleware to be applied before this route
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Payment successful for session:', session.id);
    // You can add additional processing here if needed
    // The order is already created via verify-payment endpoint
  }

  res.json({ received: true });
});

module.exports = router;

