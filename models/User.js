const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      return !this.socialLogin;
    }
  },
  phone: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }
  },
  role: {
    type: String,
    enum: ['customer', 'retailer', 'wholesaler'],
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  otp: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Date,
    default: null
  },
  socialLogin: {
    provider: String,
    providerId: String
  },
  purchaseHistory: [{
    productId: mongoose.Schema.Types.ObjectId,
    quantity: Number,
    purchasedAt: Date
  }],
  browsingHistory: [{
    productId: mongoose.Schema.Types.ObjectId,
    viewedAt: Date
  }]
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);


