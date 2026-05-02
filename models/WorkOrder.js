const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({ // TODO: COSMOS_COMPAT_CHECK
  woNo: { type: String, required: true, unique: true },
  status: { type: String, required: true },
  equipmentNo: String,
  workDesc: String,
  equipmentDesc: String,
  planStart: Date,
  planFinish: Date,
  priority: String,
  type: { type: String, enum: ['assess', 'all'], default: 'all' }
}, { timestamps: true });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
