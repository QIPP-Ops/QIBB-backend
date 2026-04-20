const mongoose = require('mongoose');

const SafetyPermitSchema = new mongoose.Schema({
  permitId: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    required: true,
    enum: ['Hot Work', 'Cold Work', 'Confined Space', 'Working at Height', 'Electrical Isolation', 'General']
  },
  status: { 
    type: String, 
    required: true,
    enum: ['Pending', 'Active', 'Suspended', 'Closed'],
    default: 'Pending'
  },
  location: { type: String, required: true },
  description: { type: String, required: true },
  issuedBy: { type: String, required: true }, // Name of the requestor
  authorizedBy: { type: String }, // Name of the admin who approved
  contractor: { type: String },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('SafetyPermit', SafetyPermitSchema);
