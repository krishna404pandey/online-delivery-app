const twilio = require('twilio');

// Initialize Twilio client (optional - configure if you want SMS)
const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const sendSMS = async (phone, message) => {
  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log('SMS not configured. Message would be:', message);
    return false;
  }

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
};

const sendDeliverySMS = async (phone, order) => {
  const message = `Live Mart: Your order #${order.id.toString().substring(0, 8)} has been delivered! Thank you for shopping with us.`;
  return await sendSMS(phone, message);
};

module.exports = { sendSMS, sendDeliverySMS };


