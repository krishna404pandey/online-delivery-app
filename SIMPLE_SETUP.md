# Live Mart - Simple Setup Guide

## Why Email Password?

The email password is needed because **Live Mart sends OTP (verification code) to users' emails** when they register. This is how the OTP authentication works - users get a code in their email to verify their account.

**BUT** - You can skip email setup for now and still test the app! The OTP will be shown in the server console instead.

---

## 🚀 Quick Start (Minimum Setup)

### Step 1: Install Node.js and MongoDB

1. **Install Node.js**: https://nodejs.org/ (Download LTS version)
2. **Install MongoDB**: 
   - **Option A (Easy)**: Use MongoDB Atlas (cloud, free): https://www.mongodb.com/cloud/atlas
   - **Option B**: Install locally: https://www.mongodb.com/try/download/community

### Step 2: Install Dependencies

Open terminal/command prompt in the project folder and run:
```bash
npm install
```

### Step 3: Create .env File

Create a file named `.env` in the project root with this minimum content:

```env
# MongoDB (REQUIRED)
MONGODB_URI=mongodb://localhost:27017/livemart
# OR if using Atlas, use: mongodb+srv://username:password@cluster.mongodb.net/livemart

# JWT Secret (REQUIRED - just use any random string)
JWT_SECRET=my-super-secret-key-12345

# Session Secret (REQUIRED - just use any random string)
SESSION_SECRET=my-session-secret-12345

# Email (OPTIONAL - skip for now)
EMAIL_USER=
EMAIL_PASS=

# Google OAuth (OPTIONAL - skip for now)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Facebook OAuth (OPTIONAL - skip for now)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

### Step 4: Start the Server

```bash
npm start
```

### Step 5: Open Browser

Go to: `http://localhost:3000`

**That's it!** The app should work now. OTP will be shown in the terminal console instead of email.

---

## 📧 Setting Up Email (Optional - For Real OTP Emails)

If you want real email OTP (instead of console), follow these steps:

### Why You Need This:
- Users register → Get OTP code in email
- More professional and secure

### How to Set Up:

1. **Use a Gmail account** (or any email service)

2. **For Gmail specifically:**
   - Go to your Google Account settings
   - Enable "2-Step Verification"
   - Go to: https://myaccount.google.com/apppasswords
   - Generate an "App Password" (not your regular password!)
   - Copy that app password

3. **Add to .env file:**
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password-here
   ```

4. **Restart the server**

Now OTP will be sent via email!

---

## 🗺️ Setting Up Google Maps (Optional)

Maps won't work without this, but the app will still function.

1. Go to: https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable "Maps JavaScript API"
4. Create API key
5. Open `public/index.html`
6. Find line 11: `YOUR_API_KEY`
7. Replace with your actual API key

---

## 🔐 Setting Up Social Login (Optional)

### Google Login:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add redirect: `http://localhost:3000/api/auth/google/callback`
4. Copy Client ID and Secret to `.env`

### Facebook Login:
1. Go to: https://developers.facebook.com/apps/
2. Create app
3. Add Facebook Login
4. Add redirect: `http://localhost:3000/api/auth/facebook/callback`
5. Copy App ID and Secret to `.env`

---

## ✅ What Works Without Setup:

- ✅ User registration (OTP shown in console)
- ✅ Login
- ✅ Product browsing
- ✅ Adding to cart
- ✅ Placing orders
- ✅ Order tracking
- ✅ All core features

## ❌ What Needs Setup:

- ❌ Email OTP (needs email setup)
- ❌ Google/Facebook login (needs OAuth setup)
- ❌ Google Maps (needs API key)

---

## 🎯 Recommended Setup Order:

1. **First**: Just MongoDB + JWT secrets (minimum to run)
2. **Second**: Add email for OTP (makes it professional)
3. **Third**: Add Google Maps (for location features)
4. **Last**: Add social login (nice to have)

---

## 🆘 Common Issues:

### "Cannot connect to MongoDB"
- Make sure MongoDB is running
- Check `MONGODB_URI` in `.env`
- For Atlas: Check IP whitelist (add 0.0.0.0/0 for testing)

### "OTP not received"
- Check server console - OTP is printed there
- If you want email, set up email credentials

### "Maps not loading"
- Add Google Maps API key to `public/index.html`
- Or skip maps for now - app works without it

---

## 📝 Summary:

**Minimum to run**: MongoDB + JWT secrets  
**For OTP emails**: Add email credentials  
**For maps**: Add Google Maps API key  
**For social login**: Add OAuth credentials

You can start with minimum setup and add features later!

