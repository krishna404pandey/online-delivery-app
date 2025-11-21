# Stripe Payment Gateway Integration - Setup Instructions

This document provides step-by-step instructions to set up Stripe payment gateway for online payments in the Live Mart application.

## Quick Start Summary

1. **Create Stripe account** at [stripe.com](https://stripe.com) (free, no credit card needed for test mode)
2. **Get API keys**:
   - Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **API keys**
   - Make sure you're in **Test mode** (toggle in top right)
   - Copy **Publishable key** (starts with `pk_test_`)
   - Click "Reveal test key" and copy **Secret key** (starts with `sk_test_`)
3. **Add keys to `.env`** file in `online-delivery-app` directory:
   ```env
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
   ```
4. **Restart server**: `npm start` or `npm run dev`
5. **Test payment**: Use test card `4242 4242 4242 4242` with any future date and any 3-digit CVC

See detailed instructions below for step-by-step guidance.

## Overview

The application now supports Stripe Checkout for secure online payments. When customers select "Online Payment" during checkout, they are redirected to Stripe's secure payment page to complete their transaction.

## Step 1: Create a Stripe Account

1. Go to [https://stripe.com](https://stripe.com)
2. Click "Start now" or "Sign up"
3. Create a free account (no credit card required for test mode)
4. Verify your email address

## Step 2: Get Your API Keys

### How to Get Stripe API Keys - Step by Step

**Direct Link**: [https://dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)

#### Detailed Steps:

1. **Log in to Stripe Dashboard**
   - Go to [https://dashboard.stripe.com](https://dashboard.stripe.com)
   - Sign in or create a free account

2. **Switch to Test Mode**
   - Look at the top right of the dashboard
   - You'll see a toggle that says either "Test mode" or "Live mode"
   - **Make sure it says "Test mode"** (gray/blue toggle)
   - If it says "Live mode", click the toggle to switch to Test mode
   - Test mode is FREE and uses test cards - no real charges

3. **Navigate to API Keys**
   - Click on **"Developers"** in the left sidebar
   - Click on **"API keys"** (or use direct link above)
   - You'll see a page with your API keys

4. **Copy Your Keys**
   - **Publishable key** (starts with `pk_test_`):
     - This is visible by default in a text box
     - Click the copy icon or select and copy the entire key
   - **Secret key** (starts with `sk_test_`):
     - This is hidden by default for security
     - Click the **"Reveal test key"** button
     - Copy the entire key that appears
     - ⚠️ **Keep this secret!** Never share it publicly

5. **You now have both keys** - Save them somewhere safe temporarily while you add them to `.env`

### For Live Mode (Production)

1. Switch to **Live mode** in the Stripe Dashboard (toggle in top right)
2. Navigate to **Developers** → **API keys**
3. Get your live keys:
   - **Publishable key** (starts with `pk_live_`)
   - **Secret key** (starts with `sk_live_`)

⚠️ **Important**: Never share your secret keys publicly. Always use environment variables.

## Step 3: Configure Environment Variables

1. Copy the `env.template` file to `.env` in the `online-delivery-app` directory:
   ```bash
   cp env.template .env
   ```

2. Open the `.env` file and add your Stripe keys:

   ```env
   # Stripe Payment Gateway
   STRIPE_SECRET_KEY=sk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
   STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
   ```

   **Example:**
   - If your Secret key is `sk_test_51AbC...`, paste it after `STRIPE_SECRET_KEY=`
   - If your Publishable key is `pk_test_51AbC...`, paste it after `STRIPE_PUBLISHABLE_KEY=`
   - **Important:** 
     - Don't include quotes around the keys, just paste them directly
     - Make sure there are no spaces before or after the `=` sign
     - The `STRIPE_SECRET_KEY` is required for payments to work
     - The `STRIPE_PUBLISHABLE_KEY` is included for reference (not currently used in this implementation)

3. Make sure `CLIENT_URL` is set correctly:
   ```env
   CLIENT_URL=http://localhost:3000
   ```
   (Update this to your production URL when deploying)

## Step 4: Install Dependencies

The Stripe package should already be installed. If not, run:

```bash
npm install stripe
```

## Step 5: Start the Application

```bash
npm start
# or for development with auto-reload
npm run dev
```

## Step 6: Test the Payment Flow

### Test Card Numbers

Stripe provides test card numbers that always succeed in test mode:

| Card Number | Description |
|-------------|-------------|
| `4242 4242 4242 4242` | Visa - Success |
| `4000 0000 0000 0002` | Visa - Card declined |
| `4000 0025 0000 3155` | Visa - Requires authentication |
| `5555 5555 5555 4444` | Mastercard - Success |

**Test Details:**
- Use any future expiry date (e.g., 12/25)
- Use any 3-digit CVC (e.g., 123)
- Use any ZIP code (e.g., 12345)

### Testing Steps

1. Start the application
2. Register/Login as a customer
3. Add products to cart
4. Click "Place Order"
5. Select "Online Payment"
6. Click "Proceed to Payment"
7. You'll be redirected to Stripe Checkout
8. Use test card `4242 4242 4242 4242` with any future date and CVC
9. Complete the payment
10. You'll be redirected back to the app with order confirmation

## Payment Flow Explanation

1. **User selects online payment** → Confirmation dialog appears
2. **User confirms** → Frontend calls `/api/payments/create-checkout-session`
3. **Backend creates Stripe session** → Returns checkout URL with order details in metadata
4. **User redirected to Stripe** → Secure payment page (hosted by Stripe)
5. **User completes payment** → Stripe processes payment and redirects to success URL with `session_id`
6. **Backend verifies payment** → Frontend calls `/api/payments/verify-payment` with session ID
7. **Backend verifies with Stripe** → Checks payment status, validates stock, creates order
8. **Order created** → Cart cleared, user sees confirmation with order details

**Important**: The order is only created AFTER successful payment verification. This ensures payment is confirmed before order creation.

## Currency Configuration

The integration is currently set to **Indian Rupees (INR)**. To change the currency:

1. Open `online-delivery-app/routes/payments.js`
2. Find the line: `currency: 'inr'`
3. Change to your desired currency code (e.g., 'usd', 'eur', 'gbp')
4. Restart the server

## Webhook Setup (Optional but Recommended)

Webhooks allow Stripe to notify your server about payment events in real-time.

### For Local Development:

1. Install Stripe CLI: [https://stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/payments/webhook`
4. Copy the webhook signing secret (starts with `whsec_`)
5. Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_your_secret_here`

### For Production:

1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click "Add endpoint"
3. Enter your production URL: `https://yourdomain.com/api/payments/webhook`
4. Select events: `checkout.session.completed`
5. Copy the webhook signing secret
6. Add to production environment variables

## Troubleshooting

### "Stripe is not defined" or "Stripe is not configured" error
- Make sure `STRIPE_SECRET_KEY` is set in `.env`
- Check that the key starts with `sk_test_` (for test mode) or `sk_live_` (for live mode)
- Restart the server after adding environment variables
- Verify the `.env` file is in the `online-delivery-app` directory
- Check server console for "Warning: STRIPE_SECRET_KEY not set" message

### Payment succeeds but order not created
- Check server logs for errors
- Verify the `verify-payment` endpoint is being called
- Check that user is authenticated (token in localStorage)

### Redirect not working
- Verify `CLIENT_URL` in `.env` matches your application URL
- Check browser console for errors
- Ensure success/cancel URLs are correct in `routes/payments.js`

### Test cards not working
- Make sure you're in **Test mode** in Stripe Dashboard
- Verify you're using test API keys (start with `sk_test_` and `pk_test_`)
- Check card number is correct (no spaces when typing)

## Security Notes

1. **Never commit `.env` file** - It's already in `.gitignore`
2. **Use test keys for development** - Never use live keys in development
3. **Secret keys are server-side only** - Never expose `STRIPE_SECRET_KEY` to frontend
4. **Always verify payments server-side** - The `verify-payment` endpoint ensures payment was actually completed
5. **Use HTTPS in production** - Required for Stripe Checkout

## Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Checkout Guide](https://stripe.com/docs/payments/checkout)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Stripe API Reference](https://stripe.com/docs/api)

## Support

If you encounter issues:
1. Check Stripe Dashboard → **Developers** → **Logs** for API errors
2. Check server console for backend errors
3. Check browser console for frontend errors
4. Verify all environment variables are set correctly

