jest.mock('../models/SafetyObservation', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock('../models/SafetyCaseCounter', () => ({
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/notificationService', () => ({
  notifySafetyObservationReminder: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const SafetyObservation = require('../models/SafetyObservation');
const SafetyCaseCounter = require('../models/SafetyCaseCounter');
const AdminUser = require('../models/AdminUser');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

const operator = {
  _id: '507f1f77bcf86cd799439011',
  empId: 'EMP-100',
  name: 'Test Operator',
  crew: 'A',
  role: 'CCR Operator',
  department: 'Operation',
};

const crewAdmin = {
  _id: '507f1f77bcf86cd799439012',
  empId: 'EMP-200',
  name: 'Crew Admin',
  crew: 'A',
  role: 'admin',
  accessRole: 'admin',
};

function tokenFor(user = {}) {
  return jwt.sign(
    {
      id: user.id || user._id || '507f1f77bcf86cd799439011',
      email: user.email || 'user@acwapower.com',
      role: user.role || 'viewer',
      accessRole: user.accessRole || 'viewer',
      empId: user.empId || 'EMP-100',
      crew: user.crew || 'A',
      name: user.name || 'Test',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockObservation(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    caseNumber: 'SO-2026-00001',
    empId: 'EMP-100',
    employeeName: 'Test Operator',
    crew: 'A',
    categories: ['Unsafe condition'],
    observedAt: new Date('2026-06-20T10:00:00Z'),
    location: 'KSA - KSA - QIPP / SIWPP plant areas',
    title: 'Poor housekeeping',
    description: 'Spill near pump',
    status: 'registered',
    observationMonth: '2026-06',
    beforePhoto: '',
    afterPhoto: '',
    attachments: [],
    comments: [],
    actions: [],
    links: [],
    processingLog: [],
    createdAt: new Date('2026-06-20T10:00:00Z'),
    toObject() {
      return { ...this };
    },
    save: jest.fn().mockResolvedValue(this),
    deleteOne: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Safety Observations API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SafetyCaseCounter.findOneAndUpdate.mockResolvedValue({ year: 2026, seq: 1 });
    AdminUser.findById.mockImplementation((id) => {
      if (String(id) === String(crewAdmin._id)) return { select: () => ({ lean: async () => crewAdmin }) };
      return { select: () => ({ lean: async () => operator }) };
    });
  });

  test('GET /api/personnel/safety-observations/options returns picklists', async () => {
    const res = await request(app)
      .get('/api/personnel/safety-observations/options')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.categories).toContain('Unsafe act');
    expect(res.body.riskCategories.some((r) => r.code === '13')).toBe(true);
    expect(res.body.monthlyMinimum).toBe(2);
  });

  test('POST /api/personnel/safety-observations creates case with SO number', async () => {
    const doc = mockObservation();
    SafetyObservation.create.mockResolvedValue(doc);

    const res = await request(app)
      .post('/api/personnel/safety-observations')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        categories: ['Unsafe condition'],
        title: 'Poor housekeeping',
        description: 'Spill near pump',
        observedAt: '2026-06-20T10:00:00Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.observation.caseNumber).toBe('SO-2026-00001');
    expect(SafetyObservation.create).toHaveBeenCalled();
    const payload = SafetyObservation.create.mock.calls[0][0];
    expect(payload.categories).toEqual(['Unsafe condition']);
    expect(payload.caseNumber).toMatch(/^SO-\d{4}-\d{5}$/);
  });

  test('POST rejects missing categories', async () => {
    const res = await request(app)
      .post('/api/personnel/safety-observations')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ title: 'No category' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category/i);
  });

  test('GET /api/personnel/safety-observations/case/:caseNumber', async () => {
    SafetyObservation.findOne.mockReturnValue({ lean: async () => mockObservation() });
    const res = await request(app)
      .get('/api/personnel/safety-observations/case/SO-2026-00001')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.observation.title).toBe('Poor housekeeping');
  });

  test('GET compliance/mine returns quota progress', async () => {
    SafetyObservation.countDocuments.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/personnel/safety-observations/compliance/mine')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.minimum).toBe(2);
    expect(res.body.remaining).toBe(1);
  });

  test('crew admin can list pending review', async () => {
    SafetyObservation.find.mockReturnValue({
      sort: () => ({ lean: async () => [mockObservation()] }),
    });
    const res = await request(app)
      .get('/api/personnel/safety-observations/pending')
      .set('Authorization', `Bearer ${tokenFor(crewAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.observations).toHaveLength(1);
  });
});
