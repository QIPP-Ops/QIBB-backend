const mongoose = require('mongoose');

const LeaveBalanceLogSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true, index: true },
    changeType: {
      type: String,
      required: true,
      enum: ['deduct', 'restore', 'accrual', 'manual_adjust'],
    },
    balanceField: {
      type: String,
      required: true,
      enum: ['annualLeaveBalance', 'bankLeaveBalance', 'compensateDayBalance'],
    },
    delta: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    leaveId: { type: String, default: '' },
    performedBy: { type: String, default: 'system' },
    reason: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LeaveBalanceLogSchema.index({ empId: 1, createdAt: -1 });

module.exports = mongoose.model('LeaveBalanceLog', LeaveBalanceLogSchema);
