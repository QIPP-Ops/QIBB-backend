const mongoose = require('mongoose');
const Survey = require('../models/Survey');
const SurveyAssignment = require('../models/SurveyAssignment');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { resolveAssignTargets } = require('../services/quizAssignmentService');

const SURVEY_TYPES = Survey.SURVEY_TYPES || [
  'field_count',
  'field_inspection',
  'dcs_inventory',
  'permit_audit',
  'custom',
];

function sanitizeChecklist(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => ({
      id: String(item?.id || `item${index + 1}`).trim(),
      label: String(item?.label || item?.prompt || '').trim(),
      inputType: ['number', 'text', 'photo'].includes(String(item?.inputType || '').trim())
        ? String(item.inputType).trim()
        : 'text',
      required: Boolean(item?.required),
    }))
    .filter((item) => item.label);
}

function sanitizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q, index) => ({
      id: String(q?.id || q?.key || `q${index + 1}`).trim(),
      prompt: String(q?.prompt || q?.text || q?.question || '').trim(),
      type: String(q?.type || 'text').trim() || 'text',
      required: Boolean(q?.required),
      options: Array.isArray(q?.options)
        ? q.options.map((opt) => String(opt || '').trim()).filter(Boolean)
        : [],
    }))
    .filter((q) => q.prompt);
}

function surveyRow(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description || '',
    surveyType: doc.surveyType || 'custom',
    instructions: doc.instructions || '',
    location: doc.location || '',
    area: doc.area || '',
    checklist: doc.checklist || [],
    assigneeRoleFilter: doc.assigneeRoleFilter || '',
    questions: doc.questions || [],
    active: Boolean(doc.active),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function assignmentRow(doc, survey) {
  const checklist = survey?.checklist || doc.surveyId?.checklist || [];
  const questions =
    survey?.questions?.length
      ? survey.questions
      : checklist.length
        ? checklist.map((item) => ({
            id: item.id,
            prompt: item.label,
            type: item.inputType === 'number' ? 'number' : 'text',
            required: item.required,
          }))
        : doc.surveyId?.questions || [];

  return {
    assignmentId: String(doc._id),
    surveyId: String(doc.surveyId?._id || doc.surveyId),
    title: survey?.title || doc.surveyId?.title || 'Survey',
    description: survey?.description || doc.surveyId?.description || '',
    surveyType: survey?.surveyType || doc.surveyId?.surveyType || 'custom',
    instructions: survey?.instructions || doc.surveyId?.instructions || '',
    location: survey?.location || doc.surveyId?.location || '',
    area: survey?.area || doc.surveyId?.area || '',
    checklist,
    questions,
    dueDate: doc.dueDate || null,
    assignedAt: doc.createdAt || null,
    completedAt: doc.completedAt || null,
    responses: doc.responses || null,
  };
}

function matchesRoleFilter(role, filter) {
  const needle = String(filter || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = String(role || '').trim().toLowerCase();
  return hay.includes(needle);
}

exports.listSurveys = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const rows = await Survey.find().sort({ updatedAt: -1 }).lean();
    res.json({ success: true, surveys: rows.map(surveyRow), surveyTypes: SURVEY_TYPES });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createSurvey = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Survey title is required.' });

    const surveyType = SURVEY_TYPES.includes(req.body?.surveyType)
      ? req.body.surveyType
      : 'custom';
    const checklist = sanitizeChecklist(req.body?.checklist);
    const questions = sanitizeQuestions(req.body?.questions);

    const doc = await Survey.create({
      title,
      description: String(req.body?.description || '').trim(),
      surveyType,
      instructions: String(req.body?.instructions || '').trim(),
      location: String(req.body?.location || '').trim(),
      area: String(req.body?.area || '').trim(),
      checklist,
      assigneeRoleFilter: String(req.body?.assigneeRoleFilter || '').trim(),
      questions,
      createdBy: req.user?.id || null,
      active: req.body?.active !== false,
    });

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SURVEY_CREATED,
      targetType: 'survey',
      targetId: String(doc._id),
      targetName: doc.title,
      after: doc.toObject(),
      req,
    });

    res.status(201).json({ success: true, survey: surveyRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.assignSurvey = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const surveyId = String(req.body?.surveyId || '').trim();
    if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ message: 'Valid surveyId is required.' });
    }
    const survey = await Survey.findById(surveyId);
    if (!survey) return res.status(404).json({ message: 'Survey not found.' });
    if (!survey.active) return res.status(400).json({ message: 'Survey is inactive.' });

    let targets = await resolveAssignTargets({
      userIds: req.body?.userIds,
      crew: req.body?.crew,
    });
    const roleFilter = String(req.body?.assigneeRoleFilter || survey.assigneeRoleFilter || '').trim();
    if (roleFilter) {
      targets = targets.filter((user) => matchesRoleFilter(user.role, roleFilter));
    }
    if (!targets.length) {
      return res.status(400).json({
        message: 'Provide userIds or crew with at least one approved member matching the role filter.',
      });
    }

    const due = req.body?.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body?.dueDate && Number.isNaN(due?.getTime())) {
      return res.status(400).json({ message: 'Invalid dueDate.' });
    }

    let assigned = 0;
    for (const user of targets) {
      await SurveyAssignment.findOneAndUpdate(
        { surveyId: survey._id, userId: user._id },
        {
          $set: { dueDate: due },
          $setOnInsert: { completedAt: null, responses: null },
        },
        { upsert: true, new: true }
      );
      assigned += 1;
    }

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SURVEY_ASSIGNED,
      targetType: 'survey',
      targetId: String(survey._id),
      targetName: survey.title,
      after: { assigned, crew: req.body?.crew || null, userCount: targets.length, roleFilter },
      req,
    });

    res.json({ success: true, assigned });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getMyPendingSurveys = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required.' });

    const rows = await SurveyAssignment.find({ userId, completedAt: null })
      .sort({ dueDate: 1, createdAt: -1 })
      .populate(
        'surveyId',
        'title description surveyType instructions location area checklist questions active assigneeRoleFilter'
      )
      .lean();

    const surveys = rows
      .filter((row) => row.surveyId && row.surveyId.active !== false)
      .map((row) => assignmentRow(row, row.surveyId));

    res.json({ success: true, surveys });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submitSurveyResponse = async (req, res) => {
  try {
    const userId = req.user?.id;
    const assignmentId = String(req.params.assignmentId || '').trim();
    if (!userId) return res.status(401).json({ message: 'Authentication required.' });
    if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) {
      return res.status(400).json({ message: 'Valid assignment id is required.' });
    }

    const assignment = await SurveyAssignment.findOne({ _id: assignmentId, userId }).populate(
      'surveyId',
      'title active questions checklist surveyType'
    );
    if (!assignment) return res.status(404).json({ message: 'Survey assignment not found.' });
    if (assignment.completedAt) {
      return res.status(400).json({ message: 'Survey already submitted.' });
    }
    if (!assignment.surveyId || assignment.surveyId.active === false) {
      return res.status(400).json({ message: 'Survey is no longer active.' });
    }

    const responses = req.body?.responses ?? req.body ?? {};
    assignment.responses = responses;
    assignment.completedAt = new Date();
    await assignment.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SURVEY_SUBMITTED,
      targetType: 'survey_assignment',
      targetId: String(assignment._id),
      targetName: assignment.surveyId.title,
      after: { surveyId: String(assignment.surveyId._id), completedAt: assignment.completedAt },
      req,
    });

    res.json({
      success: true,
      assignment: assignmentRow(assignment.toObject(), assignment.surveyId),
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listPendingSurveyAssignmentsForUser = async (userId) => {
  const rows = await SurveyAssignment.find({ userId, completedAt: null })
    .sort({ dueDate: 1, createdAt: -1 })
    .populate(
      'surveyId',
      'title description surveyType instructions location area checklist questions active assigneeRoleFilter'
    )
    .lean();

  return rows
    .filter((row) => row.surveyId && row.surveyId.active !== false)
    .map((row) => assignmentRow(row, row.surveyId));
};

exports.SURVEY_TYPES = SURVEY_TYPES;
