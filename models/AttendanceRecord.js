const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true, index: true },
    employeeName: { type: String, default: '' },
    crew: { type: String, default: '', index: true },
    date: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'partial'],
      required: true,
    },
    isLate: { type: Boolean, default: false },
    lateMinutes: { type: Number, default: 0, min: 0 },
    isLeftEarly: { type: Boolean, default: false },
    leftEarlyMinutes: { type: Number, default: 0, min: 0 },
    remarks: { type: String, default: '' },
    loggedBy: { type: String, default: '' },
    loggedByEmail: { type: String, default: '' },
    loggedAt: { type: Date, default: null },
    derivedFromLeave: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AttendanceRecordSchema.index({ empId: 1, date: 1 }, { unique: true });
AttendanceRecordSchema.index({ crew: 1, date: 1 });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);
