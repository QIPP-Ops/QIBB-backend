const mongoose = require('mongoose');

const OrgLayoutSchema = new mongoose.Schema(
  {
    crewId: { type: String, required: true, unique: true, index: true },
    /** Slot-key → empId (template) or { empId, role?, groupLabel?, parentSlotKey?, direction? } (dynamic slots). */
    slots: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedByEmail: { type: String, default: '' },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrgLayout', OrgLayoutSchema);
