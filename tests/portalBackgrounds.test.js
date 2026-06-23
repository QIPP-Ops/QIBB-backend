const {
  isValidPortalBackgroundSectionKey,
  isAllowedPlantImagePath,
  isAllowedBackgroundImageUrl,
} = require('../constants/portalBackgroundSections');

describe('portalBackgroundSections', () => {
  test('validates known section keys', () => {
    expect(isValidPortalBackgroundSectionKey('training-hub')).toBe(true);
    expect(isValidPortalBackgroundSectionKey('crew-chat-navbar')).toBe(true);
    expect(isValidPortalBackgroundSectionKey('unknown')).toBe(false);
  });

  test('allows plant gallery paths only from allowlist', () => {
    expect(isAllowedPlantImagePath('/images/plant/plant-01.jpg')).toBe(true);
    expect(isAllowedPlantImagePath('/images/plant/evil.jpg')).toBe(false);
    expect(isAllowedPlantImagePath('/images/plant/../secret.jpg')).toBe(false);
  });

  test('allows plant paths, data URLs, and remote URLs', () => {
    expect(isAllowedBackgroundImageUrl('/images/plant/training-hub-bg.jpg')).toBe(true);
    expect(isAllowedBackgroundImageUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isAllowedBackgroundImageUrl('https://cdn.example.com/bg.jpg')).toBe(true);
    expect(isAllowedBackgroundImageUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('portalBackgroundService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('stores and returns section backgrounds', async () => {
    const setSetting = jest.fn().mockResolvedValue({});
    const getSetting = jest.fn().mockResolvedValue({});
    jest.doMock('../services/systemSettingsService', () => ({ getSetting, setSetting }));

    const {
      getPortalBackgroundsMap,
      setPortalBackground,
      clearPortalBackground,
    } = require('../services/portalBackgroundService');

    await setPortalBackground('training-hub', '/images/plant/plant-02.jpg');
    expect(setSetting).toHaveBeenCalledWith('portalBackgrounds', {
      'training-hub': '/images/plant/plant-02.jpg',
    });

    getSetting.mockResolvedValueOnce({
      'training-hub': '/images/plant/plant-02.jpg',
      invalid: 'nope',
      'crew-chat-navbar': 'javascript:alert(1)',
    });
    const map = await getPortalBackgroundsMap();
    expect(map).toEqual({ 'training-hub': '/images/plant/plant-02.jpg' });

    await clearPortalBackground('training-hub');
    expect(setSetting).toHaveBeenLastCalledWith('portalBackgrounds', {});
  });

  test('tracks uploaded images separately from plant gallery', async () => {
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
          {
            id: 'bad',
            url: '/images/plant/plant-01.jpg',
            fileName: 'plant.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 100,
            storage: 'base64',
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
    expect(setSetting).toHaveBeenCalledWith(
      'portalBackgroundUploads',
      expect.arrayContaining([
        expect.objectContaining({ fileName: 'new-bg.jpg', uploadedBy: 'user-1' }),
        expect.objectContaining({ id: 'abc123' }),
      ])
    );

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
        return Promise.resolve({ 'training-hub': uploaded.url });
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
    expect(setSetting).toHaveBeenCalledWith('portalBackgroundUploads', [
      expect.objectContaining({ id: 'abc123' }),
    ]);
    expect(setSetting).toHaveBeenCalledWith('portalBackgrounds', {});
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
