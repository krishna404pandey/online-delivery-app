# Live Mart - Complete Setup Guide

## Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Gmail account (for email OTP)
- Google Cloud account (for Maps and OAuth)
- Facebook Developer account (for Facebook OAuth)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up MongoDB

### Option A: Local MongoDB
1. Install MongoDB: https://www.mongodb.com/try/download/community
2. Start MongoDB service
3. MongoDB will run on `mongodb://localhost:27017`

### Option B: MongoDB Atlas (Cloud)
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env`
2. Fill in all required values:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/livemart

# JWT Secret (generate a random string)
JWT_SECRET=your-random-secret-key-here

# Email (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

## Step 4: Set Up Gmail for OTP

1. Enable 2-Step Verification on your Google account
2. Generate App Password: https://support.google.com/accounts/answer/185833
3. Use the app password in `EMAIL_PASS`

## Step 5: Set Up Google OAuth

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
4. Copy Client ID and Secret to `.env`

## Step 6: Set Up Facebook OAuth

1. Go to https://developers.facebook.com/apps/
2. Create new app
3. Add Facebook Login product
4. Add redirect URI: `http://localhost:3000/api/auth/facebook/callback`
5. Copy App ID and Secret to `.env`

## Step 7: Set Up Google Maps

1. Go to https://console.cloud.google.com/google/maps-apis
2. Enable:
   - Maps JavaScript API
   - Places API
   - Geocoding API
3. Create API key
4. Open `public/index.html`
5. Replace `YOUR_API_KEY` on line 11 with your API key

## Step 8: Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## Step 9: Access the Application

Open browser: `http://localhost:3000`

## Testing Features

### 1. Registration with OTP
- Register a new user
- Check email for OTP (or check console if email not configured)
- Verify OTP to activate account

### 2. Social Login
- Click "Google" or "Facebook" login
- Complete OAuth flow
- Should redirect back and log you in

### 3. Order Placement
- Add products to cart
- Click "Place Order"
- Select payment method (Online or COD)
- For COD, select scheduled date
- Order should be created successfully

### 4. Google Maps
- Click "Set Location on Map" during registration
- Click "Map View" to see nearby shops
- Maps should load and show markers

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- For Atlas, check IP whitelist

### Email Not Sending
- Verify Gmail app password
- Check `EMAIL_USER` and `EMAIL_PASS`
- Check console for errors

### OAuth Not Working
- Verify redirect URIs match exactly
- Check client ID/secret in `.env`
- Ensure OAuth consent screen is configured

### Maps Not Loading
- Verify API key in `public/index.html`
- Check API is enabled in Google Cloud Console
- Check browser console for errors

### Orders Not Placing
- Check MongoDB connection
- Verify user is logged in
- Check browser console for errors

## Production Deployment

1. Set `NODE_ENV=production`
2. Use secure MongoDB connection
3. Use strong JWT and session secrets
4. Configure proper CORS origins
5. Use HTTPS
6. Set up proper email service (SendGrid, AWS SES)
7. Configure Twilio for SMS
8. Use environment variables for all secrets


