# Module 1: Registration and Sign-Up

## Table of Contents
1. [Overview](#overview)
2. [Multi-Role Registration](#multi-role-registration)
3. [Authentication via OTP](#authentication-via-otp)
4. [Social Logins (Google/Facebook)](#social-logins-googlefacebook)
5. [Google API Integration for Location](#google-api-integration-for-location)
6. [Tech Stack](#tech-stack)
7. [API Keys and Configuration](#api-keys-and-configuration)
8. [How It Works - Step by Step](#how-it-works---step-by-step)

---

## Overview

Module 1 handles all user registration and authentication processes for the Live Mart platform. It supports three types of users (Customers, Retailers, and Wholesalers) and provides multiple authentication methods including traditional email/password with OTP verification, as well as social login options through Google and Facebook.

---

## Multi-Role Registration

### What It Does
The system allows users to register with three different roles:
- **Customer**: Regular users who can browse and purchase products
- **Retailer**: Users who can list products and sell to customers
- **Wholesaler**: Users who can sell products in bulk to retailers

### How It Works

1. **User Registration Form**
   - Users fill out a registration form with:
     - Name (required)
     - Email (required, must be unique)
     - Password (required)
     - Phone (optional)
     - Role selection (Customer/Retailer/Wholesaler)
     - Address (optional)
     - Location coordinates (optional, can be set via map)

2. **Backend Processing** (`routes/auth.js`)
   - Validates all required fields
   - Checks if email already exists in database
   - Validates role is one of the allowed roles
   - Generates a 6-digit OTP code
   - Creates user account with `verified: false` status
   - Stores OTP and expiry time (10 minutes)
   - Sends OTP via email (if email configured)

3. **Database Storage** (`models/User.js`)
   - User data stored in MongoDB
   - Password is hashed using bcryptjs before saving
   - Role is stored as enum: 'customer', 'retailer', or 'wholesaler'
   - User marked as unverified until OTP is confirmed

### Technical Implementation

**File**: `routes/auth.js` (lines 26-82)
```javascript
router.post('/register', async (req, res) => {
  // Validates email, password, name, role
  // Generates 6-digit OTP
  // Creates user with verified: false
  // Sends OTP via email
})
```

**File**: `models/User.js` (lines 35-38)
```javascript
role: {
  type: String,
  enum: ['customer', 'retailer', 'wholesaler'],
  required: true
}
```

---

## Authentication via OTP

### What It Does
OTP (One-Time Password) authentication provides an extra layer of security. Users must verify their email address using a 6-digit code sent to their email before they can log in.

### How It Works

1. **OTP Generation**
   - When user registers, a random 6-digit OTP is generated
   - OTP is stored in database with expiry time (10 minutes)
   - OTP is sent to user's email address

2. **OTP Verification Process**
   - User receives OTP in email
   - User enters OTP in verification form
   - System checks:
     - OTP matches the stored OTP
     - OTP hasn't expired (within 10 minutes)
   - If valid, user account is marked as `verified: true`
   - OTP is cleared from database

3. **Login with OTP**
   - After registration verification, users can log in
   - Login also requires OTP verification
   - User enters email and password
   - System sends new OTP to email
   - User enters OTP to complete login
   - JWT token is generated upon successful login

### Technical Implementation

**OTP Generation** (`routes/auth.js` lines 21-23):
```javascript
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
```

**OTP Verification** (`routes/auth.js` lines 85-111):
```javascript
router.post('/verify-otp', async (req, res) => {
  // Checks if OTP matches
  // Validates OTP expiry
  // Marks user as verified
  // Clears OTP from database
})
```

**Email Sending** (`config/email.js`):
- Uses Nodemailer library
- Sends HTML formatted email with OTP code
- Falls back to console log if email not configured

### Email Configuration
- **Service**: Gmail (configurable)
- **Required**: EMAIL_USER and EMAIL_PASS in .env file
- **Note**: Must use Gmail App Password, not regular password
- **Fallback**: If email not configured, OTP shown in server console

---

## Social Logins (Google/Facebook)

### What It Does
Users can sign in using their Google or Facebook accounts instead of creating a new account with email/password. This provides a faster, more convenient registration and login experience.

### How It Works

1. **Google Login Flow**
   - User clicks "Sign in with Google" button
   - User selects their role (Customer/Retailer/Wholesaler)
   - Redirects to Google OAuth consent screen
   - User grants permission
   - Google redirects back with user profile
   - System checks if user exists:
     - If exists: Logs them in
     - If new: Creates account with Google profile data
   - JWT token generated and user logged in

2. **Facebook Login Flow**
   - Similar to Google login
   - User clicks "Sign in with Facebook" button
   - User selects their role
   - Redirects to Facebook OAuth consent screen
   - User grants permission
   - Facebook redirects back with user profile
   - System creates or logs in user
   - JWT token generated

3. **Account Linking**
   - If user already registered with email, system links social account
   - User can use either email/password or social login
   - Social login users are automatically verified (no OTP needed)

### Technical Implementation

**Passport.js Configuration** (`config/passport.js`):
- Uses Passport.js middleware for OAuth
- Google Strategy: `passport-google-oauth20`
- Facebook Strategy: `passport-facebook`
- Handles user creation and authentication

**Google OAuth** (`config/passport.js` lines 10-58):
```javascript
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (req, accessToken, refreshToken, profile, done) => {
  // Creates or finds user
  // Links Google account
  // Returns user object
}))
```

**Facebook OAuth** (`config/passport.js` lines 61-112):
```javascript
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: '/api/auth/facebook/callback'
}, async (req, accessToken, refreshToken, profile, done) => {
  // Creates or finds user
  // Links Facebook account
  // Returns user object
}))
```

**Routes** (`routes/auth.js`):
- `/api/auth/google` - Initiates Google login
- `/api/auth/google/callback` - Handles Google callback
- `/api/auth/facebook` - Initiates Facebook login
- `/api/auth/facebook/callback` - Handles Facebook callback

### Required API Keys
- **Google**: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- **Facebook**: FACEBOOK_APP_ID and FACEBOOK_APP_SECRET

---

## Google API Integration for Location

### What It Does
The system uses location services to help users set their address and find nearby products. However, the current implementation uses **OpenStreetMap** (free alternative) instead of Google Maps API to avoid API key requirements and costs.

### How It Works

1. **Location Picker During Registration**
   - User clicks "Set Location" button
   - Browser requests geolocation permission
   - If granted, shows user's current location on map
   - User can drag marker to adjust location
   - System converts coordinates to address (reverse geocoding)
   - Address and coordinates saved to user profile

2. **Reverse Geocoding**
   - Converts latitude/longitude to readable address
   - Uses OpenStreetMap Nominatim API (free, no API key needed)
   - Returns formatted address string

3. **Location Storage**
   - Coordinates stored as: `{ lat: number, lng: number }`
   - Address stored as text string
   - Used for:
     - Finding nearby products
     - Calculating delivery distances
     - Showing user location on maps

### Technical Implementation

**Location Picker** (`public/app.js` lines 3001-3031):
```javascript
async function reverseGeocode(lat, lng) {
  // Calls OpenStreetMap Nominatim API
  // Converts coordinates to address
  // Returns formatted address
}
```

**Map Integration**:
- Uses **Leaflet.js** library (open-source)
- Uses **OpenStreetMap** tiles (free, no API key)
- No Google Maps API required
- Works immediately without configuration

**Note**: While the module title mentions "Google API", the actual implementation uses OpenStreetMap which is completely free and requires no API keys. This was done to reduce costs and simplify setup.

---

## Tech Stack

### Backend Technologies

1. **Node.js**
   - Runtime environment for JavaScript
   - Version: Latest LTS

2. **Express.js**
   - Web framework for Node.js
   - Handles HTTP requests and routing
   - Version: ^4.18.2

3. **MongoDB with Mongoose**
   - Database: MongoDB (NoSQL)
   - ODM: Mongoose for schema management
   - Version: ^8.0.3

4. **Passport.js**
   - Authentication middleware
   - Handles OAuth strategies
   - Version: ^0.7.0

5. **JWT (JSON Web Tokens)**
   - Token-based authentication
   - Library: jsonwebtoken
   - Version: ^9.0.2

6. **bcryptjs**
   - Password hashing
   - Version: ^2.4.3

7. **Nodemailer**
   - Email sending service
   - Version: ^7.0.10

### Frontend Technologies

1. **HTML5**
   - Structure and forms

2. **CSS3**
   - Styling and responsive design

3. **JavaScript (Vanilla)**
   - Client-side logic
   - No frameworks required

4. **Leaflet.js**
   - Interactive maps
   - Open-source, free

### OAuth Libraries

1. **passport-google-oauth20**
   - Google OAuth integration
   - Version: ^2.0.0

2. **passport-facebook**
   - Facebook OAuth integration
   - Version: ^3.0.0

### Additional Libraries

1. **express-session**
   - Session management for OAuth
   - Version: ^1.17.3

2. **dotenv**
   - Environment variable management
   - Version: ^16.3.1

---

## API Keys and Configuration

### Required Environment Variables

All configuration is stored in `.env` file. Here's what's needed:

#### 1. Database (REQUIRED)
```
MONGODB_URI=mongodb://localhost:27017/livemart
```
- Local MongoDB or MongoDB Atlas connection string
- **Required**: Yes

#### 2. Security Keys (REQUIRED)
```
JWT_SECRET=your-random-secret-key-here
SESSION_SECRET=your-random-session-secret-here
```
- Random strings for JWT token signing and session encryption
- **Required**: Yes
- **Note**: Use strong, random strings in production

#### 3. Email Configuration (OPTIONAL)
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```
- Gmail account for sending OTP emails
- **Required**: No (OTP will show in console if not set)
- **Note**: Must use Gmail App Password, not regular password
- **How to get**: https://myaccount.google.com/apppasswords

#### 4. Google OAuth (OPTIONAL)
```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```
- **Required**: No (Google login won't work without it)
- **How to get**:
  1. Go to https://console.cloud.google.com/apis/credentials
  2. Create new OAuth 2.0 Client ID
  3. Add redirect URI: `http://localhost:3000/api/auth/google/callback`
  4. Copy Client ID and Client Secret

#### 5. Facebook OAuth (OPTIONAL)
```
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```
- **Required**: No (Facebook login won't work without it)
- **How to get**:
  1. Go to https://developers.facebook.com/apps/
  2. Create new app
  3. Add "Facebook Login" product
  4. Add redirect URI: `http://localhost:3000/api/auth/facebook/callback`
  5. Copy App ID and App Secret

#### 6. Server Configuration
```
PORT=3000
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```
- Server port and client URL
- **Required**: Yes

### Location Services
- **No API keys needed!**
- Uses OpenStreetMap (free)
- Uses Leaflet.js (open-source)
- Works immediately without configuration

---

## How It Works - Step by Step

### Traditional Registration Flow

1. **User fills registration form**
   - Enters name, email, password, role, phone, address
   - Optionally sets location via map

2. **Form submission**
   - Frontend sends POST request to `/api/auth/register`
   - Data validated on backend

3. **Account creation**
   - System checks if email exists
   - Password hashed with bcrypt
   - 6-digit OTP generated
   - User created with `verified: false`

4. **OTP email sent**
   - OTP sent to user's email (or shown in console)
   - OTP expires in 10 minutes

5. **User verifies OTP**
   - User enters OTP in verification form
   - POST request to `/api/auth/verify-otp`
   - System validates OTP and expiry
   - User marked as `verified: true`

6. **User logs in**
   - User enters email and password
   - System sends new OTP to email
   - User enters OTP
   - JWT token generated
   - User logged in

### Social Login Flow (Google/Facebook)

1. **User clicks social login button**
   - Selects role (Customer/Retailer/Wholesaler)
   - Redirects to OAuth provider

2. **OAuth consent**
   - User grants permission on provider's site
   - Provider redirects back with profile data

3. **Account handling**
   - System checks if user exists by provider ID
   - If exists: Logs in
   - If new: Creates account with profile data
   - User automatically verified (no OTP needed)

4. **JWT token generated**
   - Token includes user ID, email, and role
   - Token valid for 7 days
   - User logged in

### Location Setting Flow

1. **User clicks "Set Location"**
   - Browser requests geolocation permission
   - If granted, shows map with user's location

2. **Location adjustment**
   - User can drag marker to adjust
   - Coordinates updated in real-time

3. **Address conversion**
   - System calls reverse geocoding API
   - Converts coordinates to address
   - Address displayed and saved

4. **Data storage**
   - Coordinates saved: `{ lat: number, lng: number }`
   - Address saved as text
   - Used for nearby product search

---

## Security Features

1. **Password Hashing**
   - All passwords hashed with bcrypt (10 rounds)
   - Never stored in plain text

2. **OTP Expiry**
   - OTPs expire after 10 minutes
   - Prevents reuse of old codes

3. **JWT Tokens**
   - Secure token-based authentication
   - Tokens expire after 7 days
   - Include user ID, email, and role

4. **Email Verification**
   - Users must verify email before login
   - Prevents fake account creation

5. **Session Management**
   - Secure session handling for OAuth
   - Session secrets for encryption

---

## Summary

Module 1 provides a comprehensive registration and authentication system that:
- Supports three user roles (Customer, Retailer, Wholesaler)
- Uses OTP verification for email confirmation
- Offers social login via Google and Facebook
- Includes location services for address setting
- Uses secure password hashing and JWT tokens
- Works with minimal configuration (only database and JWT secret required)

The system is designed to be flexible, secure, and user-friendly, with optional features (email, OAuth) that enhance the user experience but aren't required for basic functionality.

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Platform**: Live Mart E-Commerce Platform

