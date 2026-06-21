const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getPlantTrendsCacheDir,
  getPlantTrendsCachePath,
  getPlantRawMetricsPath,
  resetPlantTrendsCacheDir,
} = require('../services/plantReports/plantTrendsCache');

describe('plant trends cache directory resolution', () => {
  const envBackup = { ...process.env };
  let tmpHome;

  beforeEach(() => {
    resetPlantTrendsCacheDir();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qipp-cache-home-'));
  });

  afterEach(() => {
    process.env = { ...envBackup };
    resetPlantTrendsCacheDir();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('uses PLANT_TRENDS_CACHE_DIR when set', () => {
    const custom = path.join(tmpHome, 'custom-cache');
    process.env.PLANT_TRENDS_CACHE_DIR = custom;
    expect(getPlantTrendsCacheDir()).toBe(path.resolve(custom));
    expect(getPlantTrendsCachePath()).toBe(path.join(path.resolve(custom), 'plant-trends-cache.json'));
    expect(getPlantRawMetricsPath()).toBe(path.join(path.resolve(custom), 'plant-raw-metrics.json'));
  });
});
