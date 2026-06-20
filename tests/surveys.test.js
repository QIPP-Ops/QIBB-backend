jest.mock('../models/Survey', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
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

  test('POST /api/admin/surveys creates a survey', async () => {
    Survey.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      title: 'Safety culture pulse',
      description: 'Monthly check-in',
      questions: [{ id: 'q1', prompt: 'How safe do you feel?', type: 'text' }],
      active: true,
      createdAt: new Date('2026-06-20'),
      updatedAt: new Date('2026-06-20'),
      toObject: () => ({
        _id: '507f1f77bcf86cd799439099',
        title: 'Safety culture pulse',
      }),
    });

    const res = await request(app)
      .post('/api/admin/surveys')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        title: 'Safety culture pulse',
        description: 'Monthly check-in',
        questions: [{ prompt: 'How safe do you feel?' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.survey.title).toBe('Safety culture pulse');
  });

  test('POST /api/admin/surveys/assign upserts assignments', async () => {
    Survey.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      title: 'Safety culture pulse',
      active: true,
    });
    resolveAssignTargets.mockResolvedValue([{ _id: '507f1f77bcf86cd799439012' }]);
    SurveyAssignment.findOneAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .post('/api/admin/surveys/assign')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ surveyId: '507f1f77bcf86cd799439099', crew: 'A' });

    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(1);
    expect(SurveyAssignment.findOneAndUpdate).toHaveBeenCalled();
  });

  test('GET /api/personnel/me/surveys returns pending assignments', async () => {
    SurveyAssignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: '507f1f77bcf86cd799439088',
              surveyId: {
                _id: '507f1f77bcf86cd799439099',
                title: 'Safety culture pulse',
                description: '',
                questions: [{ id: 'q1', prompt: 'How safe do you feel?' }],
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
    expect(res.body.surveys[0].title).toBe('Safety culture pulse');
  });
});
