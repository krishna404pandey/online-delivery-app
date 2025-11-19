# Live Mart

A comprehensive, production-ready multi-role e-commerce platform for seamless interaction between customers, retailers, and wholesalers. Built with MongoDB, Express.js, and modern web technologies.

## Features

### User Roles
- **Customers**: Browse, search, filter items, add to cart, place orders, make payments, provide feedback
- **Retailers**: Manage inventory, track customer purchase history, place orders with wholesalers, handle payments
- **Wholesalers**: Manage inventory for retailers, set pricing, maintain retailer transaction history

### Core Modules

1. **Registration & Authentication**
   - Multi-role registration (Customer/Retailer/Wholesaler)
   - OTP-based email verification
   - Social login support (Google/Facebook - UI ready, backend integration needed)
   - JWT token-based authentication

2. **User Dashboards**
   - Category-wise item listing with images
   - Item details: price, stock status, availability date
   - Role-specific dashboards

3. **Search & Navigation**
   - Smart filtering (cost, quantity, stock availability)
   - Location-based shop listings
   - Distance filters for nearby options
   - Personalized recommendations based on purchase history

4. **Order & Payment Management**
   - Online and offline order placement
   - Calendar integration for offline orders (scheduled date support)
   - Real-time order tracking with status updates
   - Automatic stock updates after transactions
   - Payment status management

5. **Feedback & Dashboard Updates**
   - Real-time order status updates via WebSocket
   - Product-specific feedback collection
   - Feedback visible on item pages
   - Average rating display

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time**: Socket.io for live updates
- **Authentication**: JWT tokens + OAuth 2.0 (Google/Facebook)
- **Email**: Nodemailer for OTP and notifications
- **SMS**: Twilio integration (optional)
- **Maps**: Google Maps API
- **Styling**: Custom CSS with pink-blue gradient theme

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Gmail account (for email OTP)
- Google Cloud account (for Maps and OAuth)
- Facebook Developer account (optional, for Facebook login)

### Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Environment Variables**
   - Copy `.env.example` to `.env`
   - Fill in MongoDB connection, email credentials, OAuth keys
   - See `SETUP.md` for detailed instructions

3. **Start MongoDB**
   - Local: Ensure MongoDB service is running
   - Atlas: Use connection string in `.env`

4. **Start the Server**
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the Application**
   - Open your browser: `http://localhost:3000`
   - Register a new account or use social login

**⚠️ Important**: See `SETUP.md` for complete configuration guide including:
- MongoDB setup
- Email configuration for OTP
- Google OAuth setup
- Facebook OAuth setup
- Google Maps API key configuration

## Project Structure

```
OOP_Project/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── routes/                # API routes
│   ├── auth.js           # Authentication routes
│   ├── users.js          # User management routes
│   ├── products.js       # Product management routes
│   ├── orders.js         # Order management routes
│   ├── feedback.js       # Feedback routes
│   └── search.js         # Search and recommendations
├── middleware/
│   └── auth.js           # Authentication middleware
├── public/               # Frontend files
│   ├── index.html        # Main HTML file
│   ├── styles.css        # Styling
│   └── app.js            # Frontend JavaScript
└── data/                 # JSON data storage (auto-created)
    ├── users.json
    ├── products.json
    ├── orders.json
    └── feedback.json
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/login` - Login user
- `POST /api/auth/social-login` - Social login
- `POST /api/auth/resend-otp` - Resend OTP

### Products
- `GET /api/products` - Get all products (with filters)
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Add product (Retailer/Wholesaler)
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `GET /api/products/categories/list` - Get all categories

### Orders
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/payment` - Update payment status

### Search
- `GET /api/search/products` - Search products with filters
- `GET /api/search/recommendations` - Get personalized recommendations
- `GET /api/search/shops/nearby` - Find nearby shops

### Feedback
- `POST /api/feedback` - Submit feedback
- `GET /api/feedback/product/:productId` - Get product feedback
- `GET /api/feedback/order/:orderId` - Get order feedback

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/purchase-history` - Get purchase history

## Usage Guide

### For Customers

1. **Register/Login**
   - Register with email, password, and role as "Customer"
   - Verify email with OTP
   - Login to access the platform

2. **Browse Products**
   - View products on the Products page
   - Use search and filters to find specific items
   - Click "Nearby" to find products near your location (requires location permission)

3. **Add to Cart & Order**
   - Click "Add to Cart" on any product
   - View cart from the cart icon
   - Place order (online or offline payment)
   - For offline orders, provide scheduled date

4. **Track Orders**
   - View all orders in "Orders" section
   - See real-time status updates

5. **Provide Feedback**
   - View product details
   - Submit rating and comment
   - View feedback from other users

### For Retailers

1. **Register/Login**
   - Register with role as "Retailer"
   - Verify and login

2. **Manage Inventory**
   - Go to Dashboard
   - Add products with name, price, stock, category
   - Edit or delete existing products

3. **Manage Orders**
   - View customer orders in Dashboard > Orders
   - Update order status (pending → processing → delivered)
   - Track order history

### For Wholesalers

1. **Register/Login**
   - Register with role as "Wholesaler"
   - Verify and login

2. **Manage Inventory**
   - Add products for retailers
   - Set pricing and stock levels
   - Update inventory as needed

3. **Track Retailer Orders**
   - View orders from retailers
   - Update order status
   - Maintain transaction history

## Real-time Features

The platform uses Socket.io for real-time updates:
- Order status changes
- Product updates
- New product additions
- Stock updates

## Important Setup Notes

### Google Maps API Key
1. Get your Google Maps API key from [Google Cloud Console](https://console.cloud.google.com/google/maps-apis)
2. Enable the following APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API
3. Replace `YOUR_API_KEY` in `public/index.html` (line 9) with your actual API key

### Payment System
- **Online Payments**: Automatically marked as "completed" when order is placed
- **Offline Payments**: Marked as "pending" until delivery, then auto-completed
- For production, integrate with payment gateways (Stripe, PayPal, etc.)

### OTP Verification
- Currently, OTP is displayed in browser toast for demo purposes
- In production, integrate with email service (SendGrid, AWS SES) or SMS service (Twilio)

### Social Login
- UI is ready for Google/Facebook login
- For production, implement OAuth 2.0 flow with proper authentication

### Data Storage
- Currently uses JSON files in `data/` directory
- For production, migrate to MongoDB, PostgreSQL, or another database

### Location Services
- Uses browser geolocation API
- Ensure location permissions are granted in browser
- Google Maps integration requires valid API key

## Environment Variables

Create a `.env` file for production:
```
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
```

## Future Enhancements

- Database integration (MongoDB/PostgreSQL)
- Email/SMS service integration for OTP
- OAuth 2.0 for social logins
- Payment gateway integration (Stripe, PayPal, etc.)
- Advanced analytics dashboard
- Image upload functionality
- Email notifications for order updates
- Calendar integration for offline orders
- Advanced recommendation engine

## Troubleshooting

1. **Port already in use**: Change PORT in server.js or .env file
2. **CORS errors**: Ensure server is running and CORS is enabled
3. **Socket connection issues**: Check if Socket.io server is running
4. **Location not working**: Grant browser location permissions

## License

ISC

## Support

For issues or questions, please check the code comments or create an issue in the repository.

