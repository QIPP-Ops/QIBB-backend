const mongoose = require('mongoose');

const connectDB = async () => {
  try {

    // Mongoose will automatically read your Cosmos DB string from Azure!
    await mongoose.connect(process.env.COSMOS_CONNECTION_STRING);
    console.log('✅ Connected to Azure Cosmos DB');
  } catch (err) {
    console.error('❌ Database Connection Error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
