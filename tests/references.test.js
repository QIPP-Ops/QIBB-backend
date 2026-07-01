jest.mock('../models/ReferenceCategory', () => ({
  REFERENCE_TYPES: ['manuals', 'policies_procedures'],
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/ReferenceItem', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock('../services/referenceFileService', () => ({
  uploadReferenceFile: jest.fn(),
  readReferenceFile: jest.fn(),
  deleteReferenceFile: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const ReferenceCategory = require('../models/ReferenceCategory');
const ReferenceItem = require('../models/ReferenceItem');
const referenceFileService = require('../services/referenceFileService');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

const operator = {
  _id: '507f1f77bcf86cd799439011',
  empId: 'EMP-100',
  name: 'Test Operator',
  crew: 'A',
  role: 'CCR Operator',
};

const adminUser = {
  _id: '507f1f77bcf86cd799439012',
  empId: 'EMP-200',
  name: 'Crew Admin',
  crew: 'A',
  role: 'admin',
  accessRole: 'admin',
};

function tokenFor(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('training references API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /references requires valid type', async () => {
    const res = await request(app)
      .get('/api/training/references')
      .set('Authorization', `Bearer ${tokenFor(operator)}`);
    expect(res.status).toBe(400);
  });

  test('GET /references returns grouped categories and items', async () => {
    const catId = '507f1f77bcf86cd799439099';
    ReferenceCategory.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: catId, type: 'manuals', name: 'Safety', sortOrder: 0 },
        ]),
      }),
    });
    ReferenceItem.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: '507f1f77bcf86cd799439098',
            type: 'manuals',
            categoryId: catId,
            title: 'ERT Guide',
            description: 'Emergency response',
            url: '',
            sortOrder: 0,
          },
        ]),
      }),
    });

    const res = await request(app)
      .get('/api/training/references?type=manuals')
      .set('Authorization', `Bearer ${tokenFor(operator)}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('manuals');
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].name).toBe('Safety');
    expect(res.body.categories[0].items).toHaveLength(1);
    expect(res.body.categories[0].items[0].title).toBe('ERT Guide');
  });

  test('POST /references/categories requires admin', async () => {
    const res = await request(app)
      .post('/api/training/references/categories')
      .set('Authorization', `Bearer ${tokenFor(operator)}`)
      .send({ type: 'manuals', name: 'Operations' });
    expect(res.status).toBe(403);
  });

  test('POST /references/categories creates category for admin', async () => {
    ReferenceCategory.findOne.mockResolvedValue(null);
    ReferenceCategory.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439088',
      type: 'manuals',
      name: 'Operations',
      sortOrder: 0,
    });

    const res = await request(app)
      .post('/api/training/references/categories')
      .set('Authorization', `Bearer ${tokenFor(adminUser)}`)
      .send({ type: 'manuals', name: 'Operations' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Operations');
    expect(ReferenceCategory.create).toHaveBeenCalled();
  });

  test('POST /references/items creates item for admin', async () => {
    const catId = '507f1f77bcf86cd799439077';
    ReferenceCategory.findById.mockResolvedValue({
      _id: catId,
      type: 'manuals',
      name: 'Safety',
    });
    ReferenceItem.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439066',
      type: 'manuals',
      categoryId: catId,
      title: 'New SOP',
      description: 'Details',
      url: '/docs',
    });

    const res = await request(app)
      .post('/api/training/references/items')
      .set('Authorization', `Bearer ${tokenFor(adminUser)}`)
      .send({
        type: 'manuals',
        categoryId: catId,
        title: 'New SOP',
        description: 'Details',
        url: '/docs',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New SOP');
  });

  test('DELETE /references/categories/:id removes category and items', async () => {
    const catId = '507f1f77bcf86cd799439055';
    const deleteOne = jest.fn().mockResolvedValue(undefined);
    ReferenceCategory.findById.mockResolvedValue({
      _id: catId,
      type: 'manuals',
      name: 'Legacy',
      deleteOne,
    });
    ReferenceItem.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });
    ReferenceItem.deleteMany.mockResolvedValue({ deletedCount: 2 });

    const res = await request(app)
      .delete(`/api/training/references/categories/${catId}`)
      .set('Authorization', `Bearer ${tokenFor(adminUser)}`);

    expect(res.status).toBe(200);
    expect(ReferenceItem.deleteMany).toHaveBeenCalledWith({ categoryId: catId });
    expect(deleteOne).toHaveBeenCalled();
  });

  test('POST /references/items/:id/file uploads file for admin', async () => {
    const itemId = '507f1f77bcf86cd799439044';
    const save = jest.fn().mockResolvedValue(undefined);
    ReferenceItem.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: itemId,
        storageKey: '',
        fileUrl: '',
        fileName: '',
        mimeType: '',
        save,
      }),
    });
    referenceFileService.uploadReferenceFile.mockResolvedValue({
      storageKey: `mongo:${itemId}:file`,
      fileUrl: `/api/training/references/files/${itemId}`,
      fileName: 'manual.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('%PDF-1.4'),
      storage: 'mongo',
    });

    const res = await request(app)
      .post(`/api/training/references/items/${itemId}/file`)
      .set('Authorization', `Bearer ${tokenFor(adminUser)}`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'manual.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(referenceFileService.uploadReferenceFile).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
    expect(res.body.fileName).toBe('manual.pdf');
  });

  test('GET /references/files/:id serves uploaded file', async () => {
    const itemId = '507f1f77bcf86cd799439033';
    ReferenceItem.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: itemId,
        storageKey: `mongo:${itemId}:file`,
        fileName: 'manual.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('%PDF-1.4'),
      }),
    });
    referenceFileService.readReferenceFile.mockResolvedValue(Buffer.from('%PDF-1.4'));

    const res = await request(app)
      .get(`/api/training/references/files/${itemId}`)
      .set('Authorization', `Bearer ${tokenFor(operator)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(referenceFileService.readReferenceFile).toHaveBeenCalled();
  });
});
