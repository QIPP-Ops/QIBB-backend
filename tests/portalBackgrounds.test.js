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
});
