const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['product', 'order', 'service'],
    default: 'product'
  }
}, {
  timestamps: true
});

feedbackSchema.index({ productId: 1 });
feedbackSchema.index({ orderId: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);


