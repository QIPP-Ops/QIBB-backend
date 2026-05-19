function getMongoUri() {
  return (process.env.COSMOS_URI || process.env.MONGODB_URI || '').trim();
}

module.exports = { getMongoUri };
