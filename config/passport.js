const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

module.exports = (passport) => {
  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
    callbackURL: `${process.env.CLIENT_URL || 'http://localhost:3000'}/api/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ 'socialLogin.providerId': profile.id, 'socialLogin.provider': 'google' });
      
      if (user) {
        return done(null, user);
      }

      // Check if email exists
      user = await User.findOne({ email: profile.emails[0].value });
      if (user) {
        user.socialLogin = {
          provider: 'google',
          providerId: profile.id
        };
        user.verified = true;
        await user.save();
        return done(null, user);
      }

      // Create new user
      user = await User.create({
        name: profile.displayName,
        email: profile.emails[0].value,
        role: 'customer',
        verified: true,
        socialLogin: {
          provider: 'google',
          providerId: profile.id
        }
      });

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));

  // Facebook OAuth Strategy
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || 'your-facebook-app-id',
    clientSecret: process.env.FACEBOOK_APP_SECRET || 'your-facebook-app-secret',
    callbackURL: `${process.env.CLIENT_URL || 'http://localhost:3000'}/api/auth/facebook/callback`,
    profileFields: ['id', 'displayName', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ 'socialLogin.providerId': profile.id, 'socialLogin.provider': 'facebook' });
      
      if (user) {
        return done(null, user);
      }

      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (email) {
        user = await User.findOne({ email });
        if (user) {
          user.socialLogin = {
            provider: 'facebook',
            providerId: profile.id
          };
          user.verified = true;
          await user.save();
          return done(null, user);
        }
      }

      // Create new user
      user = await User.create({
        name: profile.displayName,
        email: email || `facebook_${profile.id}@livemart.com`,
        role: 'customer',
        verified: true,
        socialLogin: {
          provider: 'facebook',
          providerId: profile.id
        }
      });

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));

  // Serialize user
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  // Deserialize user
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};


