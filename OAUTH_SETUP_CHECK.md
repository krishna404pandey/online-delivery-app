# OAuth Setup Verification Checklist

## ✅ What I Fixed:

1. **Added `/auth/callback` route** - Server now serves frontend at this path
2. **Fixed callback URLs** - Made them absolute URLs instead of relative
3. **Added catch-all route** - Frontend routing now works properly

## 🔍 Verify Your OAuth Setup:

### Google OAuth Setup:

1. **Google Cloud Console**: https://console.cloud.google.com/apis/credentials
2. **Check these settings:**
   - ✅ OAuth 2.0 Client ID created
   - ✅ Authorized redirect URIs includes: `http://localhost:3000/api/auth/google/callback`
   - ✅ Client ID and Secret are in your `.env` file

3. **In your `.env` file, make sure you have:**
   ```env
   GOOGLE_CLIENT_ID=your-actual-client-id-here
   GOOGLE_CLIENT_SECRET=your-actual-client-secret-here
   CLIENT_URL=http://localhost:3000
   ```

### Facebook OAuth Setup:

1. **Facebook Developers**: https://developers.facebook.com/apps/
2. **Check these settings:**
   - ✅ App created
   - ✅ Facebook Login product added
   - ✅ Valid OAuth Redirect URIs includes: `http://localhost:3000/api/auth/facebook/callback`
   - ✅ App ID and Secret are in your `.env` file

3. **In your `.env` file, make sure you have:**
   ```env
   FACEBOOK_APP_ID=your-actual-app-id-here
   FACEBOOK_APP_SECRET=your-actual-app-secret-here
   CLIENT_URL=http://localhost:3000
   ```

## 🚀 Test Steps:

1. **Restart your server:**
   ```bash
   npm start
   ```

2. **Click "Google" login button**
   - Should redirect to Google login
   - After login, should redirect back to `/auth/callback?token=...`
   - Should automatically log you in

3. **If it still doesn't work:**
   - Check server console for errors
   - Verify redirect URI in Google Console matches exactly: `http://localhost:3000/api/auth/google/callback`
   - Make sure `.env` file has correct values (no extra spaces)
   - Restart server after changing `.env`

## ⚠️ Common Issues:

1. **Redirect URI mismatch** - Must match EXACTLY in Google/Facebook console
2. **Wrong credentials** - Double-check Client ID and Secret in `.env`
3. **Server not restarted** - Always restart after changing `.env`
4. **OAuth consent screen** - Make sure it's configured in Google Console

