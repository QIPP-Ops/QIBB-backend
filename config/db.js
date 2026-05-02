const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Mongoose will automatically read your Cosmos DB string from Azure!
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to Azure Cosmos DB');
  } catch (err) {
    console.error('❌ Database Connection Error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
