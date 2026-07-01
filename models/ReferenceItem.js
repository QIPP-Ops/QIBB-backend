const mongoose = require('mongoose');

const REFERENCE_TYPES = ['manuals', 'policies_procedures'];

const ReferenceItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: REFERENCE_TYPES,
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferenceCategory',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    url: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    storageKey: { type: String, default: '' },
    fileData: { type: Buffer, select: false },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

ReferenceItemSchema.statics.REFERENCE_TYPES = REFERENCE_TYPES;

module.exports = mongoose.model('ReferenceItem', ReferenceItemSchema);
