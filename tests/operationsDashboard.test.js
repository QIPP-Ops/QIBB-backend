jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/ShiftReport', () => ({
  find: jest.fn(),
}));

jest.mock('../models/QuizAssignment', () => ({
  find: jest.fn(),
}));

jest.mock('../models/CourseAssignment', () => ({
  find: jest.fn(),
}));

jest.mock('../services/onDutyService', () => ({
  fmtDate: jest.fn(() => '2026-06-20'),
  getEmployeeDutyStatus: jest.fn().mockResolvedValue({
    date: '2026-06-20',
    empId: 'EMP-100',
    crew: 'A',
    shift: 'D',
    onDuty: true,
    onLeave: false,
    dutyLabel: 'Day',
  }),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const ShiftReport = require('../models/ShiftReport');
const QuizAssignment = require('../models/QuizAssignment');
const CourseAssignment = require('../models/CourseAssignment');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

const userDoc = {
  _id: '507f1f77bcf86cd799439011',
  empId: 'EMP-100',
  name: 'Test Operator',
  crew: 'A',
  role: 'CCR Operator',
  kpis: [{ title: 'Safety walk', progress: 40, weight: 20 }],
  kpiSubmissionStatus: 'draft',
};

function tokenFor(user = {}) {
  return jwt.sign(
    {
      id: user.id || '507f1f77bcf86cd799439011',
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

describe('GET /api/personnel/me/operations-dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminUser.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(userDoc),
      }),
    });
    ShiftReport.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    QuizAssignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: 'qa1',
              quizId: { _id: 'q1', title: 'Safety quiz' },
              dueDate: new Date('2026-06-25'),
              assignedAt: new Date('2026-06-18'),
              completedAt: null,
            },
          ]),
        }),
      }),
    });
    CourseAssignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'ca1',
            courseId: 'hse-101',
            courseTitle: 'HSE Basics',
            dueDate: new Date('2026-06-30'),
            completedAt: null,
            createdAt: new Date('2026-06-10'),
          },
        ]),
      }),
    });
  });

  test('returns aggregated pending work for signed-in user', async () => {
    const res = await request(app)
      .get('/api/personnel/me/operations-dashboard')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pendingQuizzes).toHaveLength(1);
    expect(res.body.data.pendingCourses).toHaveLength(1);
    expect(res.body.data.kpiSummary.goalCount).toBe(1);
    expect(res.body.data.pendingCounts.total).toBe(2);
    expect(res.body.data.shiftReport.canEdit).toBe(true);
    expect(res.body.data.surveys).toEqual([]);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/personnel/me/operations-dashboard');
    expect(res.status).toBe(401);
  });
});
