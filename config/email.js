const nodemailer = require('nodemailer');

// Create transporter - using Gmail for demo (configure with your email)
let transporter = null;

// Only create transporter if email credentials are provided
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// For production, use environment variables:
// EMAIL_USER=your-email@gmail.com
// EMAIL_PASS=your-app-specific-password

const sendOTP = async (email, otp) => {
  // If email not configured, just log to console
  if (!transporter) {
    console.log('\n========================================');
    console.log(`📧 OTP for ${email}: ${otp}`);
    console.log('(Email not configured - OTP shown in console)');
    console.log('========================================\n');
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Live Mart - OTP Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b9d;">Live Mart</h2>
          <p>Your OTP for verification is:</p>
          <h1 style="color: #4a90e2; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
          <p>This OTP will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error.message);
    console.log(`📧 OTP for ${email}: ${otp} (Email failed, showing in console)`);
    return false;
  }
};

const sendOrderConfirmation = async (email, order) => {
  if (!transporter) {
    console.log(`📧 Order confirmation would be sent to ${email} (email not configured)`);
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Live Mart - Order Confirmation #${order.id.toString().substring(0, 8)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b9d;">Live Mart - Order Confirmation</h2>
          <p>Thank you for your order!</p>
          <h3>Order Details:</h3>
          <p><strong>Order ID:</strong> #${order.id.toString().substring(0, 8)}</p>
          <p><strong>Total Amount:</strong> ₹${order.totalAmount.toFixed(2)}</p>
          <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
          <p><strong>Tracking Number:</strong> ${order.deliveryDetails?.trackingNumber || 'N/A'}</p>
          ${order.scheduledDate ? `<p><strong>Scheduled Date:</strong> ${new Date(order.scheduledDate).toLocaleDateString()}</p>` : ''}
          <p>We'll keep you updated on your order status.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    return false;
  }
};

const sendDeliveryConfirmation = async (email, order) => {
  if (!transporter) {
    console.log(`📧 Delivery confirmation would be sent to ${email} (email not configured)`);
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Live Mart - Order Delivered #${order.id.toString().substring(0, 8)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b9d;">Live Mart - Delivery Confirmation</h2>
          <p>Great news! Your order has been delivered.</p>
          <h3>Order Details:</h3>
          <p><strong>Order ID:</strong> #${order.id.toString().substring(0, 8)}</p>
          <p><strong>Delivered At:</strong> ${new Date(order.deliveredAt).toLocaleString()}</p>
          <p>Thank you for shopping with Live Mart!</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending delivery confirmation:', error);
    return false;
  }
};

module.exports = { sendOTP, sendOrderConfirmation, sendDeliveryConfirmation };


