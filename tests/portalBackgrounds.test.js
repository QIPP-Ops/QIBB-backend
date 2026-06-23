const {

  isValidPortalBackgroundSectionKey,

  isAllowedBackgroundImageUrl,

  normalizeBackgroundEntry,

} = require('../constants/portalBackgroundSections');



describe('portalBackgroundSections', () => {

  test('validates known section keys', () => {

    expect(isValidPortalBackgroundSectionKey('training-hub')).toBe(true);

    expect(isValidPortalBackgroundSectionKey('crew-chat-navbar')).toBe(true);

    expect(isValidPortalBackgroundSectionKey('login')).toBe(true);

    expect(isValidPortalBackgroundSectionKey('unknown')).toBe(false);

  });



  test('allows data URLs, remote URLs, and sidebar hero path', () => {

    expect(isAllowedBackgroundImageUrl('/hero-image.jpeg')).toBe(true);

    expect(isAllowedBackgroundImageUrl('data:image/jpeg;base64,abc')).toBe(true);

    expect(isAllowedBackgroundImageUrl('https://cdn.example.com/bg.jpg')).toBe(true);

    expect(isAllowedBackgroundImageUrl('/images/plant/plant-01.jpg')).toBe(false);

    expect(isAllowedBackgroundImageUrl('javascript:alert(1)')).toBe(false);

  });



  test('normalizes legacy string entries and styled objects', () => {

    expect(normalizeBackgroundEntry('https://cdn.example.com/bg.jpg')).toEqual({

      imageUrl: 'https://cdn.example.com/bg.jpg',

    });

    expect(

      normalizeBackgroundEntry({

        imageUrl: 'https://cdn.example.com/bg.jpg',

        objectFit: 'contain',

        objectPosition: 'top center',

      })

    ).toEqual({

      imageUrl: 'https://cdn.example.com/bg.jpg',

      objectFit: 'contain',

      objectPosition: 'top center',

    });

  });

});



describe('portalBackgroundService', () => {

  beforeEach(() => {

    jest.resetModules();

  });



  test('stores and returns section backgrounds with display styles', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockResolvedValue({});

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));



    const {

      getPortalBackgroundsMap,

      setPortalBackground,

      clearPortalBackground,

    } = require('../services/portalBackgroundService');



    await setPortalBackground('training-hub', {

      imageUrl: 'https://cdn.example.com/bg.jpg',

      objectFit: 'contain',

      objectPosition: 'top center',

    });

    expect(setSetting).toHaveBeenCalledWith('portalBackgrounds', {

      'training-hub': {

        imageUrl: 'https://cdn.example.com/bg.jpg',

        objectFit: 'contain',

        objectPosition: 'top center',

      },

    });



    getSetting.mockResolvedValueOnce({

      'training-hub': {

        imageUrl: 'https://cdn.example.com/bg.jpg',

        objectFit: 'contain',

      },

      invalid: 'nope',

      'crew-chat-navbar': { imageUrl: 'javascript:alert(1)' },

    });

    const map = await getPortalBackgroundsMap();

    expect(map).toEqual({

      'training-hub': {

        imageUrl: 'https://cdn.example.com/bg.jpg',

        objectFit: 'contain',

      },

    });



    await clearPortalBackground('training-hub');

    expect(setSetting).toHaveBeenLastCalledWith('portalBackgrounds', {});

  });



  test('tracks uploaded images and clears sections on delete', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockImplementation((key) => {

      if (key === 'portalBackgroundUploads') {

        return Promise.resolve([

          {

            id: 'abc123',

            url: 'data:image/jpeg;base64,abc',

            fileName: 'hero.jpg',

            mimeType: 'image/jpeg',

            sizeBytes: 1200,

            storage: 'base64',

            uploadedAt: '2026-01-01T00:00:00.000Z',

          },

        ]);

      }

      return Promise.resolve({});

    });

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));



    const {

      getPortalBackgroundUploads,

      uploadPortalBackgroundImage,

      deletePortalBackgroundUpload,

    } = require('../services/portalBackgroundService');



    const uploads = await getPortalBackgroundUploads();

    expect(uploads).toHaveLength(1);

    expect(uploads[0]).toMatchObject({

      id: 'abc123',

      url: 'data:image/jpeg;base64,abc',

      fileName: 'hero.jpg',

      storage: 'base64',

    });



    const file = {

      buffer: Buffer.from('fake-image'),

      size: 500,

      mimetype: 'image/jpeg',

      originalname: 'new-bg.jpg',

    };

    const uploaded = await uploadPortalBackgroundImage({ userId: 'user-1', file });

    expect(uploaded.fileName).toBe('new-bg.jpg');

    expect(uploaded.url).toMatch(/^data:image\/jpeg;base64,/);



    getSetting.mockImplementation((key) => {

      if (key === 'portalBackgroundUploads') {

        return Promise.resolve([

          uploaded,

          {

            id: 'abc123',

            url: 'data:image/jpeg;base64,abc',

            fileName: 'hero.jpg',

            mimeType: 'image/jpeg',

            sizeBytes: 1200,

            storage: 'base64',

          },

        ]);

      }

      if (key === 'portalBackgrounds') {

        return Promise.resolve({

          'training-hub': { imageUrl: uploaded.url, objectFit: 'cover' },

        });

      }

      return Promise.resolve({});

    });



    const deleted = await deletePortalBackgroundUpload(uploaded.id);

    expect(deleted).toMatchObject({

      deleted: true,

      uploadId: uploaded.id,

      url: uploaded.url,

      clearedSections: ['training-hub'],

    });

  });



  test('deletePortalBackgroundUpload returns 404 for unknown id', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockResolvedValue([]);

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));



    const { deletePortalBackgroundUpload } = require('../services/portalBackgroundService');



    await expect(deletePortalBackgroundUpload('missing')).rejects.toMatchObject({

      message: 'Upload not found.',

      status: 404,

    });

  });



  test('uploadPortalBackgroundImage uses base64 when R2 is not configured', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockResolvedValue([]);

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));

    jest.doMock('../config/r2', () => ({

      isR2Configured: () => false,

      getR2Config: () => ({ configured: false }),

    }));



    const { uploadPortalBackgroundImage } = require('../services/portalBackgroundService');

    const file = {

      buffer: Buffer.from('fake-image'),

      size: 500,

      mimetype: 'image/jpeg',

      originalname: 'bg.jpg',

    };

    const uploaded = await uploadPortalBackgroundImage({ userId: 'user-1', file });

    expect(uploaded.storage).toBe('base64');

    expect(uploaded.url).toMatch(/^data:image\/jpeg;base64,/);

    expect(setSetting).toHaveBeenCalledWith(

      'portalBackgroundUploads',

      expect.arrayContaining([expect.objectContaining({ storage: 'base64' })])

    );

  });



  test('uploadPortalBackgroundImage falls back to base64 when R2 has no public URL', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockResolvedValue([]);

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));

    jest.doMock('../config/r2', () => ({

      isR2Configured: () => true,

      getR2Config: () => ({

        configured: true,

        accountId: 'acct',

        accessKeyId: 'key',

        secretAccessKey: 'secret',

        bucketName: 'bucket',

        publicUrl: '',

        endpoint: 'https://acct.r2.cloudflarestorage.com',

      }),

    }));



    const { uploadPortalBackgroundImage } = require('../services/portalBackgroundService');

    const file = {

      buffer: Buffer.from('fake-image'),

      size: 500,

      mimetype: 'image/png',

      originalname: 'bg.png',

    };

    const uploaded = await uploadPortalBackgroundImage({ userId: 'user-1', file });

    expect(uploaded.storage).toBe('base64');

    expect(uploaded.url).toMatch(/^data:image\/png;base64,/);

  });



  test('uploadPortalBackgroundImage uses R2 when public URL is configured', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockResolvedValue([]);

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));

    const send = jest.fn().mockResolvedValue({});

    jest.doMock('../config/r2', () => ({

      isR2Configured: () => true,

      getR2Config: () => ({

        configured: true,

        accountId: 'acct',

        accessKeyId: 'key',

        secretAccessKey: 'secret',

        bucketName: 'bucket',

        publicUrl: 'https://cdn.example.com',

        endpoint: 'https://acct.r2.cloudflarestorage.com',

      }),

    }));

    jest.doMock('@aws-sdk/client-s3', () => ({

      S3Client: jest.fn().mockImplementation(() => ({ send })),

      PutObjectCommand: jest.fn().mockImplementation((input) => input),

      GetObjectCommand: jest.fn(),

      DeleteObjectCommand: jest.fn(),

    }));

    jest.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));



    const { uploadPortalBackgroundImage } = require('../services/portalBackgroundService');

    const file = {

      buffer: Buffer.from('fake-image'),

      size: 500,

      mimetype: 'image/jpeg',

      originalname: 'hero.jpg',

    };

    const uploaded = await uploadPortalBackgroundImage({ userId: 'user-1', file });

    expect(send).toHaveBeenCalled();

    expect(uploaded.storage).toBe('r2');

    expect(uploaded.url).toMatch(/^https:\/\/cdn\.example\.com\/portal-backgrounds\/user-1\//);

    expect(uploaded.r2Key).toMatch(/^portal-backgrounds\/user-1\//);

  });



  test('uploadPortalBackgroundImage falls back to base64 when R2 upload throws', async () => {

    const setSetting = jest.fn().mockResolvedValue({});

    const getSetting = jest.fn().mockResolvedValue([]);

    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));

    const send = jest.fn().mockRejectedValue(new Error('R2 credentials invalid'));

    jest.doMock('../config/r2', () => ({

      isR2Configured: () => true,

      getR2Config: () => ({

        configured: true,

        accountId: 'acct',

        accessKeyId: 'key',

        secretAccessKey: 'secret',

        bucketName: 'bucket',

        publicUrl: 'https://cdn.example.com',

        endpoint: 'https://acct.r2.cloudflarestorage.com',

      }),

    }));

    jest.doMock('@aws-sdk/client-s3', () => ({

      S3Client: jest.fn().mockImplementation(() => ({ send })),

      PutObjectCommand: jest.fn().mockImplementation((input) => input),

      GetObjectCommand: jest.fn(),

      DeleteObjectCommand: jest.fn(),

    }));

    jest.doMock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));



    const { uploadPortalBackgroundImage } = require('../services/portalBackgroundService');

    const file = {

      buffer: Buffer.from('fake-image'),

      size: 500,

      mimetype: 'image/jpeg',

      originalname: 'hero.jpg',

    };

    const uploaded = await uploadPortalBackgroundImage({ userId: 'user-1', file });

    expect(uploaded.storage).toBe('base64');

    expect(uploaded.url).toMatch(/^data:image\/jpeg;base64,/);

  });

});


