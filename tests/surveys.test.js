jest.mock('../models/Survey', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  SURVEY_TYPES: ['field_count', 'field_inspection', 'dcs_inventory', 'permit_audit', 'custom'],
}));

jest.mock('../models/SurveyAssignment', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/quizAssignmentService', () => ({
  resolveAssignTargets: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const Survey = require('../models/Survey');
const SurveyAssignment = require('../models/SurveyAssignment');
const { resolveAssignTargets } = require('../services/quizAssignmentService');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

function adminToken() {
  return jwt.sign(
    {
      id: '507f1f77bcf86cd799439011',
      email: 'admin@acwaops.com',
      role: 'admin',
      accessRole: 'admin',
      empId: 'EMP-1',
      crew: 'A',
      name: 'Admin',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function userToken() {
  return jwt.sign(
    {
      id: '507f1f77bcf86cd799439012',
      email: 'user@acwapower.com',
      role: 'viewer',
      accessRole: 'viewer',
      empId: 'EMP-100',
      crew: 'A',
      name: 'User',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Survey APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/admin/surveys creates a field_count survey with checklist', async () => {
    Survey.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      title: 'Pump count audit',
      description: '',
      surveyType: 'field_count',
      instructions: 'Count pumps per block',
      location: 'Power block',
      area: 'Block 1',
      checklist: [{ id: 'pb1', label: 'Pump count', inputType: 'number', required: true }],
      assigneeRoleFilter: 'local operator',
      questions: [],
      active: true,
      createdAt: new Date('2026-06-20'),
      updatedAt: new Date('2026-06-20'),
      toObject: () => ({
        _id: '507f1f77bcf86cd799439099',
        title: 'Pump count audit',
      }),
    });

    const res = await request(app)
      .post('/api/admin/surveys')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        title: 'Pump count audit',
        surveyType: 'field_count',
        instructions: 'Count pumps per block',
        location: 'Power block',
        area: 'Block 1',
        assigneeRoleFilter: 'local operator',
        checklist: [{ id: 'pb1', label: 'Pump count', inputType: 'number', required: true }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.survey.surveyType).toBe('field_count');
    expect(res.body.survey.checklist).toHaveLength(1);
  });

  test('POST /api/admin/surveys/assign filters by role when assigneeRoleFilter is set', async () => {
    Survey.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      title: 'DCS inventory',
      active: true,
      assigneeRoleFilter: 'ccr operator',
    });
    resolveAssignTargets.mockResolvedValue([
      { _id: '507f1f77bcf86cd799439012', role: 'CCR Operator Group 1-2' },
      { _id: '507f1f77bcf86cd799439013', role: 'Local Operator Group 1-2' },
    ]);
    SurveyAssignment.findOneAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .post('/api/admin/surveys/assign')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ surveyId: '507f1f77bcf86cd799439099', crew: 'A' });

    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(1);
    expect(SurveyAssignment.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('GET /api/personnel/me/surveys returns pending assignments with instructions', async () => {
    SurveyAssignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: '507f1f77bcf86cd799439088',
              surveyId: {
                _id: '507f1f77bcf86cd799439099',
                title: 'Permit audit',
                description: '',
                surveyType: 'permit_audit',
                instructions: 'Verify PTW surrendered',
                location: 'Plant',
                area: 'Key safe',
                checklist: [{ id: 'ptw', label: 'Open PTW count', inputType: 'number', required: true }],
                questions: [],
                active: true,
              },
              dueDate: new Date('2026-06-30'),
              createdAt: new Date('2026-06-20'),
              completedAt: null,
              responses: null,
            },
          ]),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/personnel/me/surveys')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.surveys).toHaveLength(1);
    expect(res.body.surveys[0].instructions).toContain('PTW');
    expect(res.body.surveys[0].checklist).toHaveLength(1);
  });
});
