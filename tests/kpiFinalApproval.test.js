const { isPlantManagerUser, plantManagerNameScore } = require('../services/plantManagerService');

describe('plantManagerService', () => {
  test('identifies Bandar Aldogaish as plant manager', () => {
    const user = { name: 'Bandar Aldogaish', fullName: 'Bander Khalid Aldogaish', role: 'Plant Manager' };
    expect(plantManagerNameScore(user)).toBeGreaterThanOrEqual(5);
    expect(isPlantManagerUser(user)).toBe(true);
  });

  test('rejects unrelated personnel', () => {
    expect(isPlantManagerUser({ name: 'Other Person', role: 'CCR Operator' })).toBe(false);
  });
});

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/notificationService', () => ({
  notifyKpiSubmitted: jest.fn().mockResolvedValue(undefined),
  notifyKpiFinalized: jest.fn().mockResolvedValue(undefined),
  notifyKpiPendingFinal: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

function plantManagerToken() {
  return jwt.sign(
    {
      id: '507f1f77bcf86cd799439020',
      email: 'bandar@acwapower.com',
      role: 'Plant Manager',
      accessRole: 'management',
      empId: 'EMP-PM',
      crew: 'General',
      name: 'Bandar Aldogaish',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('KPI final approval routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/kpi-goals/pending-final allows plant manager', async () => {
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { empId: 'EMP-2', name: 'Crew Member', kpiSubmissionStatus: 'pending_final', kpis: [] },
          ]),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/kpi-goals/pending-final')
      .set('Authorization', `Bearer ${plantManagerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('POST /api/kpi-goals/submissions/:empId/final-approve finalizes pending_final', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    AdminUser.findOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439021',
      empId: 'EMP-2',
      name: 'Crew Member',
      email: 'crew@acwapower.com',
      kpiSubmissionStatus: 'pending_final',
      kpiReviewNotes: 'Looks good',
      kpis: [{ title: 'Safety', weight: 50, progress: 10 }],
      toObject: () => ({ empId: 'EMP-2', name: 'Crew Member', email: 'crew@acwapower.com', kpis: [] }),
      save,
    });

    const res = await request(app)
      .post('/api/kpi-goals/submissions/EMP-2/final-approve')
      .set('Authorization', `Bearer ${plantManagerToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });
});
