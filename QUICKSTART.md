# Quick Start Guide

## Step 1: Install Dependencies
```bash
npm install
```

## Step 2: Start the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

## Step 3: Open in Browser
Navigate to: `http://localhost:3000`

## Testing the Platform

### Test as Customer:
1. Click "Register"
2. Fill in details, select "Customer" as role
3. After registration, you'll see an OTP (for demo purposes, it's shown in the toast notification)
4. Enter the OTP to verify
5. Login with your credentials
6. Browse products, add to cart, and place orders

### Test as Retailer:
1. Register with role "Retailer"
2. Verify OTP and login
3. Go to Dashboard
4. Add products to your inventory
5. View and manage customer orders

### Test as Wholesaler:
1. Register with role "Wholesaler"
2. Verify OTP and login
3. Go to Dashboard
4. Add products for retailers
5. Manage retailer orders

## Important Notes:
- OTP is displayed in the browser for demo purposes (in production, it would be sent via email/SMS)
- Location-based features require browser location permissions
- All data is stored in JSON files in the `data/` directory (created automatically)
- Real-time updates work via WebSocket (Socket.io)

## Troubleshooting:
- If port 3000 is busy, change it in `server.js` or set PORT environment variable
- Make sure Node.js version is 14 or higher
- Clear browser cache if you see old data

