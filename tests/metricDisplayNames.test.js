const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, 'fixtures', 'trends-blobs');
const BUNDLE_DIR = path.join(__dirname, '..', 'data', 'trends-blobs');

jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
}));

jest.mock('../models/TrendDisplayConfig', () => ({
  findOne: jest.fn(),
}));

const TrendDisplayConfig = require('../models/TrendDisplayConfig');
const { buildMetricDisplayNameMap } = require('../services/plantReports/metricDisplayNames');
const { resetTrendsBundleCache } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');

function seedFixtures() {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  for (const file of fs.readdirSync(FIXTURES)) {
    fs.copyFileSync(path.join(FIXTURES, file), path.join(BUNDLE_DIR, file));
  }
  resetTrendsBundleCache();
}

describe('buildMetricDisplayNameMap (six-blob bundle)', () => {
  beforeAll(seedFixtures);
  beforeEach(() => {
    resetTrendsBundleCache();
    jest.clearAllMocks();
    TrendDisplayConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  it('builds display names and date ranges from bundle metrics', async () => {
    const data = await buildMetricDisplayNameMap();

    const keys = Object.keys(data);
    expect(keys.length).toBeGreaterThan(0);
    const sample = data[keys[0]];
    expect(sample).toHaveProperty('displayName');
    expect(sample).toHaveProperty('dateRange');
  });

  it('applies TrendDisplayConfig overrides when Mongo is available', async () => {
    const data = await buildMetricDisplayNameMap();
    const firstKey = Object.keys(data)[0];
    TrendDisplayConfig.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          metricLabels: { [firstKey]: 'Override Label' },
        }),
    });
    resetTrendsBundleCache();

    const withOverride = await buildMetricDisplayNameMap();
    expect(withOverride[firstKey].displayName).toBe('Override Label');
  });

  it('returns empty map when bundle is unavailable', async () => {
    const original = fs.readdirSync(BUNDLE_DIR);
    for (const file of original) {
      fs.unlinkSync(path.join(BUNDLE_DIR, file));
    }
    resetTrendsBundleCache();

    const data = await buildMetricDisplayNameMap();
    expect(data).toEqual({});

    seedFixtures();
  });
});
