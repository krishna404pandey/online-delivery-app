const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  retailerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  wholesalerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: Number,
    total: Number
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'in_transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'cod'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },
  deliveryAddress: {
    type: String,
    required: true
  },
  scheduledDate: {
    type: Date,
    default: null
  },
  deliveryDetails: {
    status: {
      type: String,
      enum: ['pending', 'in_transit', 'delivered'],
      default: 'pending'
    },
    estimatedDelivery: Date,
    trackingNumber: String,
    deliveryPerson: String,
    deliveryPhone: String
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  smsSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

orderSchema.index({ customerId: 1 });
orderSchema.index({ retailerId: 1 });
orderSchema.index({ wholesalerId: 1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);


