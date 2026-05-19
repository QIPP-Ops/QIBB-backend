const mongoose = require('mongoose');

const ShiftOverrideSchema = new mongoose.Schema({
  empId:  { type: String, required: true, index: true },
  date:   { type: String, required: true }, // YYYY-MM-DD
  shift:  { type: String, required: true, enum: ['D', 'N', 'O'] },
  note:   { type: String, default: '' },
  setBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
}, { timestamps: true });

ShiftOverrideSchema.index({ empId: 1, date: 1 }, { unique: true });
ShiftOverrideSchema.index({ date: 1 });

module.exports = mongoose.model('ShiftOverride', ShiftOverrideSchema);
