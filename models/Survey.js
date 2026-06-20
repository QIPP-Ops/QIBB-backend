const mongoose = require('mongoose');

const SURVEY_TYPES = ['field_count', 'field_inspection', 'dcs_inventory', 'permit_audit', 'custom'];

const ChecklistItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    inputType: { type: String, enum: ['number', 'text', 'photo'], default: 'text' },
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const SurveySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    surveyType: {
      type: String,
      enum: SURVEY_TYPES,
      default: 'custom',
      index: true,
    },
    instructions: { type: String, default: '' },
    location: { type: String, default: '' },
    area: { type: String, default: '' },
    checklist: { type: [ChecklistItemSchema], default: [] },
    assigneeRoleFilter: { type: String, default: '' },
    questions: { type: mongoose.Schema.Types.Mixed, default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

SurveySchema.statics.SURVEY_TYPES = SURVEY_TYPES;

module.exports = mongoose.model('Survey', SurveySchema);
