const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String,
    default: 'https://via.placeholder.com/300'
  },
  availabilityDate: {
    type: Date,
    default: Date.now
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
  proxyAvailable: {
    type: Boolean,
    default: false
  },
  region: {
    type: String,
    default: ''
  },
  views: {
    type: Number,
    default: 0
  },
  ratings: [{
    userId: mongoose.Schema.Types.ObjectId,
    rating: Number,
    comment: String,
    createdAt: Date
  }],
  averageRating: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

productSchema.index({ category: 1 });
productSchema.index({ retailerId: 1 });
productSchema.index({ wholesalerId: 1 });
productSchema.index({ region: 1 });

module.exports = mongoose.model('Product', productSchema);


