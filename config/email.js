const nodemailer = require('nodemailer');

// Create transporter - using Gmail for demo (configure with your email)
let transporter = null;
let emailConfigured = false;

// Initialize email transporter if credentials are provided
function initializeEmail() {
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPass = process.env.EMAIL_PASS?.trim();

  // Check if email credentials are provided and not empty
  if (!emailUser || !emailPass || emailUser === '' || emailPass === '') {
    console.log('\n⚠️  Email Configuration Missing:');
    console.log('   EMAIL_USER and EMAIL_PASS are not set in .env file');
    console.log('   OTP will be shown in console instead of being sent via email');
    console.log('   To enable email: Set EMAIL_USER and EMAIL_PASS in your .env file\n');
    emailConfigured = false;
    return;
  }

  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    // Verify email connection on startup
    transporter.verify((error, success) => {
      if (error) {
        console.error('\n❌ Email Configuration Error:');
        console.error('   Failed to connect to email service:', error.message);
        console.error('   Common issues:');
        console.error('   1. Make sure EMAIL_USER is your full email address (e.g., yourname@gmail.com)');
        console.error('   2. Use App Password, not your regular Gmail password');
        console.error('   3. Enable 2-Step Verification in your Google account');
        console.error('   4. Generate App Password: https://myaccount.google.com/apppasswords');
        console.error('   OTP will be shown in console until email is configured correctly\n');
        emailConfigured = false;
        transporter = null;
      } else {
        console.log('✅ Email service configured successfully');
        console.log(`   Sender: ${emailUser}\n`);
        emailConfigured = true;
      }
    });
  } catch (error) {
    console.error('\n❌ Email Configuration Error:', error.message);
    console.error('   OTP will be shown in console instead\n');
    emailConfigured = false;
    transporter = null;
  }
}

// Initialize email on module load
initializeEmail();

// For production, use environment variables:
// EMAIL_USER=your-email@gmail.com
// EMAIL_PASS=your-app-specific-password

const sendOTP = async (email, otp) => {
  // Re-check email configuration in case it changed
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPass = process.env.EMAIL_PASS?.trim();
  
  if (!emailUser || !emailPass || emailUser === '' || emailPass === '') {
    console.log('\n========================================');
    console.log(`📧 OTP for ${email}: ${otp}`);
    console.log('(Email not configured - OTP shown in console)');
    console.log('To fix: Set EMAIL_USER and EMAIL_PASS in your .env file');
    console.log('========================================\n');
    return false;
  }

  // If transporter is null, try to create it again
  if (!transporter || !emailConfigured) {
    try {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass
        }
      });
      emailConfigured = true;
    } catch (error) {
      console.error('❌ Failed to create email transporter:', error.message);
      console.log(`📧 OTP for ${email}: ${otp} (Email configuration error, showing in console)`);
      return false;
    }
  }

  try {
    const mailOptions = {
      from: `"Live Mart" <${emailUser}>`,
      to: email,
      subject: 'Live Mart - OTP Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ff6b9d 0%, #4a90e2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="color: white; margin: 0;">Live Mart</h2>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h3 style="color: #333; margin-top: 0;">Your OTP Verification Code</h3>
            <p style="color: #666; font-size: 16px;">Use the following code to complete your verification:</p>
            <div style="background: white; border: 2px dashed #4a90e2; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #4a90e2; font-size: 36px; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">${otp}</h1>
            </div>
            <p style="color: #666; font-size: 14px;">
              <strong>⏰ This OTP will expire in 10 minutes.</strong><br>
              If you didn't request this code, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
      text: `Your Live Mart OTP Verification Code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent successfully to ${email}`);
    console.log(`   Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('\n❌ Error sending OTP email:');
    console.error(`   To: ${email}`);
    console.error(`   Error: ${error.message}`);
    
    // Provide helpful error messages based on common issues
    if (error.code === 'EAUTH') {
      console.error('\n   Authentication failed. Common causes:');
      console.error('   1. Incorrect email or password');
      console.error('   2. Using regular password instead of App Password');
      console.error('   3. App Password not generated or revoked');
    } else if (error.code === 'ECONNECTION') {
      console.error('\n   Connection failed. Check your internet connection.');
    } else if (error.message && error.message.includes('Invalid login')) {
      console.error('\n   Invalid login credentials. Please check:');
      console.error('   1. EMAIL_USER should be your full email (e.g., yourname@gmail.com)');
      console.error('   2. EMAIL_PASS should be an App Password, not your regular password');
      console.error('   3. Generate App Password: https://myaccount.google.com/apppasswords');
    }
    
    console.log(`\n📧 OTP for ${email}: ${otp} (Email failed, showing in console)`);
    console.log('========================================\n');
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


