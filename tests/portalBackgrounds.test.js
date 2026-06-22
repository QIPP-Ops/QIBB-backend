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
});
