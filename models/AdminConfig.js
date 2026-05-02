const mongoose = require('mongoose');

const AdminConfigSchema = new mongoose.Schema({ // TODO: COSMOS_COMPAT_CHECK
  pinHash: { type: String, default: "" },
  editingLocked: { type: Boolean, default: false },
  availableCrews: { 
    type: [String], 
    default: ["A", "B", "C", "D", "General", "S"] 
  },
  availableRoles: { 
    type: [String], 
    default: [
      "Shift in Charge Engineer",
      "Supervisor",
      "CCR Operator",
      "Local Operator",
      "Field Operator",
      "Management",
      "Operations Support"
    ] 
  }
}, { timestamps: true });

module.exports = mongoose.model('AdminConfig', AdminConfigSchema);
