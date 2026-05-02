const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.COSMOS_CONNECTION_STRING, {
      ssl: true,
      retrywrites: false,
      maxIdleTimeMS: 120000,
    });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
