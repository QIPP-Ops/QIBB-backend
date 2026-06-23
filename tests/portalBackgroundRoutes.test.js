jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
}));

jest.mock('../services/systemSettingsService', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn().mockResolvedValue({}),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const { getSetting, setSetting } = require('../services/systemSettingsService');
const app = require('../app');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

const superAdmin = {
  _id: '507f1f77bcf86cd799439011',
  email: 'admin@acwaops.com',
  name: 'Super Admin',
  accessRole: 'admin',
  empId: '100001',
  crew: 'A',
};

function tokenFor(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.accessRole || 'admin',
      accessRole: user.accessRole || 'admin',
      empId: user.empId,
      crew: user.crew,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  AdminUser.findById.mockReturnValue({
    select: () => ({
      lean: async () => superAdmin,
    }),
  });
  getSetting.mockImplementation((key) => {
    if (key === 'portalBackgroundUploads') return Promise.resolve([]);
    if (key === 'portalBackgrounds') return Promise.resolve({});
    return Promise.resolve(null);
  });
});

describe('portal background routes', () => {
  test('POST /upload accepts multipart file field "file"', async () => {
    const res = await request(app)
      .post('/api/portal-backgrounds/upload')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`)
      .attach('file', Buffer.from('fake-image-bytes'), {
        filename: 'hero.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileName: 'hero.jpg',
      mimeType: 'image/jpeg',
    });
    expect(res.body.url).toBeTruthy();
    expect(setSetting).toHaveBeenCalledWith(
      'portalBackgroundUploads',
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'hero.jpg',
          mimeType: 'image/jpeg',
        }),
      ])
    );
  });

  test('POST /upload returns 400 when multipart file is missing', async () => {
    const res = await request(app)
      .post('/api/portal-backgrounds/upload')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`)
      .set('Content-Type', 'application/json')
      .send({ file: 'not-a-real-upload' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No file uploaded.');
  });

  test('POST /upload is not captured by /:sectionKey routes', async () => {
    const res = await request(app)
      .post('/api/portal-backgrounds/upload')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`)
      .attach('file', Buffer.from('fake'), {
        filename: 'bg.png',
        contentType: 'image/png',
      });

    expect(res.status).not.toBe(404);
    expect(res.body.message).not.toBe('imageUrl is required.');
  });
});
