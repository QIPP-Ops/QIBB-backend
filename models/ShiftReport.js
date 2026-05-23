const mongoose = require('mongoose');

const ShiftReportSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true, index: true },
    employeeName: { type: String, default: '' },
    crew: { type: String, default: '' },
    date: { type: String, required: true, index: true },
    shift: { type: String, enum: ['D', 'N'], required: true },
    status: {
      type: String,
      enum: ['normal', 'watch', 'incident'],
      default: 'normal',
    },
    handoverNotes: { type: String, default: '' },
    equipmentNotes: { type: String, default: '' },
    safetyNotes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

ShiftReportSchema.index({ empId: 1, date: 1, shift: 1 }, { unique: true });

module.exports = mongoose.model('ShiftReport', ShiftReportSchema);
