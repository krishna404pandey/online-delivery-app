const mongoose = require('mongoose');

const querySchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  retailerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  wholesalerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  type: {
    type: String,
    enum: ['query', 'help', 'feedback', 'complaint'],
    default: 'query',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  response: {
    type: String,
    required: false
  },
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  respondedAt: {
    type: Date,
    required: false
  },
  attachments: [{
    type: String // URLs to attachment files
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Query', querySchema);

