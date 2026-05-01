const mongoose = require('mongoose');

const SafetyPermitSchema = new mongoose.Schema({
  permitId: { type: String, required: true, unique: true }, // "Doc No"
  status: { 
    type: String, 
    required: true,
    default: 'Prepared'
  },
  type: { 
    type: String, 
    required: true
  },
  equipmentNo: { type: String }, // "Equipment No"
  plantSummary: { type: String }, // "Plant Summary"
  description: { type: String, required: true }, // "Work Desc"
  location: { type: String, required: true }, // "Location"
  validFrom: { type: Date, required: true }, // "Valid From"
  workers: { type: String, default: "0" }, // "Workers"
  
  // Keep these for system functionality
  issuedBy: { type: String, default: 'Legacy System' },
  authorizedBy: { type: String },
  contractor: { type: String, default: 'NOMAC' },
  validTo: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('SafetyPermit', SafetyPermitSchema);
