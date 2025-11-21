const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOTP } = require('../config/email');

const ALLOWED_ROLES = ['customer', 'retailer', 'wholesaler'];

const setOAuthRoleInSession = (req) => {
  if (!req || !req.session) return;
  const requestedRole = req.query.role;
  if (requestedRole && ALLOWED_ROLES.includes(requestedRole)) {
    req.session.oauthRole = requestedRole;
  } else {
    req.session.oauthRole = 'customer';
  }
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone, address, location } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['customer', 'retailer', 'wholesaler'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 10);

    // Create user
    const newUser = new User({
      email,
      password,
      name,
      role,
      phone: phone || '',
      address: address || '',
      location: location || { lat: 0, lng: 0 },
      verified: false,
      otp: otp,
      otpExpiry: otpExpires
    });

    await newUser.save();

    // Send OTP via email
    const emailSent = await sendOTP(email, otp);
    if (!emailSent) {
      console.log(`\n📧 OTP for ${email}: ${otp}`);
      console.log('(Email not sent - check console above for details)\n');
    }

    res.json({ 
      message: emailSent ? 'Registration successful. OTP sent to email.' : 'Registration successful. OTP shown in console.',
      userId: newUser._id,
      emailSent,
      otp: emailSent ? undefined : otp // Only show OTP in response if email failed
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.otp || user.otp.toString() !== otp.toString()) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (user.otpExpiry && new Date() > user.otpExpiry) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    user.verified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send OTP for login
router.post('/login/send-otp', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please register first.' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Please use social login for this account' });
    }

    if (!user.verified) {
      return res.status(400).json({ error: 'Please complete registration OTP verification first' });
    }

    const validPassword = await user.comparePassword(password || '');
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send OTP via email
    const otpSent = await sendOTP(user.email, otp);
    if (otpSent) {
      res.json({ 
        message: 'OTP sent to your email. Please check your inbox (and spam folder).',
        otp: undefined // Don't send OTP in response if email was sent successfully
      });
    } else {
      console.log(`\n📧 Login OTP for ${user.email}: ${otp}\n`);
      res.json({ 
        message: 'OTP generated. Check console/server logs for OTP code (email not configured or failed).',
        otp: otp // Send OTP in response only if email failed
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login with OTP
router.post('/login', async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.password) {
      return res.status(401).json({ error: 'Please use social login for this account' });
    }

    const validPassword = await user.comparePassword(password || '');
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.verified) {
      return res.status(401).json({ error: 'Please verify your account first' });
    }

    // Verify OTP
    if (!otp) {
      return res.status(400).json({ error: 'OTP is required' });
    }

    if (!user.otp || user.otp.toString() !== otp.toString()) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    if (user.otpExpiry && new Date() > user.otpExpiry) {
      return res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Clear OTP after successful login
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'livemart-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.otp;

    res.json({ token, user: userObj });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOTP();
    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 10);

    user.otp = otp;
    user.otpExpiry = otpExpires;
    await user.save();

    const emailSent = await sendOTP(email, otp);
    if (!emailSent) {
      console.log(`\n📧 Resend OTP for ${email}: ${otp}\n`);
    }

    res.json({ 
      message: emailSent ? 'OTP resent to your email. Please check your inbox (and spam folder).' : 'OTP regenerated. Check console/server logs for OTP code.',
      emailSent,
      otp: emailSent ? undefined : otp // Only send OTP in response if email failed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Google OAuth routes
router.get('/google', (req, res, next) => {
  setOAuthRoleInSession(req);
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const user = req.user;
      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'livemart-secret-key-change-in-production',
        { expiresIn: '7d' }
      );

      // Redirect to frontend with token
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
    } catch (error) {
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }
  }
);

// Facebook OAuth routes
router.get('/facebook', (req, res, next) => {
  setOAuthRoleInSession(req);
  passport.authenticate('facebook', { scope: ['email'] })(req, res, next);
});

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const user = req.user;
      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'livemart-secret-key-change-in-production',
        { expiresIn: '7d' }
      );

      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
    } catch (error) {
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }
  }
);

module.exports = router;
