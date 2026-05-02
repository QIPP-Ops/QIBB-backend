const mongoose = require('mongoose');

const lotoKeySafeSchema = new mongoose.Schema({ // TODO: COSMOS_COMPAT_CHECK
  keySafeNo: { type: String, required: true },
  status: String,
  description: String,
  keys: [{
    ref: String,
    keyNo: String,
    secondaryKeySafe: String,
    permitNo: String,
    locked: String,
    manualKeyNo: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('LotoKeySafe', lotoKeySafeSchema);
