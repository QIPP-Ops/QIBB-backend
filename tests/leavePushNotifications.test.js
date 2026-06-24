const jwt = require('jsonwebtoken');

jest.mock('../models/Notification', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  sendMail: jest.fn(),
  emailTemplate: (t, b) => `${t}${b}`,
  isEmailConfigured: () => false,
}));

jest.mock('../services/adminEmailService', () => ({
  sendAdminBulkEmail: jest.fn().mockResolvedValue({ sent: 0 }),
}));

describe('leave push notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  });

  test('createLeavePushNotification stores leave notification for employee', async () => {
    const Notification = require('../models/Notification');
    const AdminUser = require('../models/AdminUser');

    AdminUser.findOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: 'user1', empId: 'E100' }),
      }),
    });
    Notification.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    Notification.create.mockImplementation((doc) =>
      Promise.resolve({ ...doc, save: jest.fn().mockResolvedValue(doc) })
    );

    const { createLeavePushNotification } = require('../services/notificationService');
    const doc = await createLeavePushNotification(
      'E100',
      'leave_approved',
      'Your leave has been approved.',
      'leave123'
    );

    expect(Notification.create).toHaveBeenCalled();
    expect(doc.type).toBe('leave_approved');
    expect(doc.recipientEmpId).toBe('E100');
    expect(doc.message).toBe('Your leave has been approved.');
    expect(doc.leaveId).toBe('leave123');
  });

  test('getUnreadForUser counts unread notifications by empId', async () => {
    const Notification = require('../models/Notification');
    const AdminUser = require('../models/AdminUser');

    AdminUser.findOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: 'user1' }),
      }),
    });
    Notification.countDocuments.mockResolvedValue(3);

    const { getUnreadForUser } = require('../services/notificationService');
    const count = await getUnreadForUser('E100');

    expect(count).toBe(3);
    expect(Notification.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: 'user1' })
    );
  });

  test('GET /api/notifications returns own notifications', async () => {
    const Notification = require('../models/Notification');
    Notification.find.mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: 'n1',
                type: 'leave_approved',
                title: 'Leave approved',
                body: 'Approved',
                read: false,
                createdAt: new Date(),
              },
            ]),
        }),
      }),
    });
    Notification.countDocuments.mockResolvedValue(1);

    const request = require('supertest');
    const app = require('../app');
    const token = jwt.sign(
      { id: 'user1', email: 'u@test.com', role: 'CCR Operator', accessRole: 'viewer', empId: 'E100', name: 'User' },
      process.env.JWT_SECRET
    );

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.unread).toBe(1);
  });

  test('PATCH /api/notifications/read-all marks all read', async () => {
    const Notification = require('../models/Notification');
    Notification.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const request = require('supertest');
    const app = require('../app');
    const token = jwt.sign(
      { id: 'user1', email: 'u@test.com', role: 'CCR Operator', accessRole: 'viewer', empId: 'E100', name: 'User' },
      process.env.JWT_SECRET
    );

    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Notification.updateMany).toHaveBeenCalled();
  });
});
