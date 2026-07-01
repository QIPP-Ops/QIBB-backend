const mongoose = require('mongoose');

const REFERENCE_TYPES = ['manuals', 'policies_procedures'];

const ReferenceCategorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: REFERENCE_TYPES,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

ReferenceCategorySchema.index({ type: 1, name: 1 }, { unique: true });

ReferenceCategorySchema.statics.REFERENCE_TYPES = REFERENCE_TYPES;

module.exports = mongoose.model('ReferenceCategory', ReferenceCategorySchema);
