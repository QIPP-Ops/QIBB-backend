const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getPlantTrendsCacheDir,
  getPlantTrendsCachePath,
  getPlantRawMetricsPath,
  resetPlantTrendsCacheDir,
  isAzureAppService,
} = require('../services/plantReports/plantTrendsCache');

describe('plant trends cache directory resolution', () => {
  const envBackup = { ...process.env };
  let tmpHome;

  beforeEach(() => {
    resetPlantTrendsCacheDir();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qipp-azure-home-'));
  });

  afterEach(() => {
    process.env = { ...envBackup };
    resetPlantTrendsCacheDir();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('isAzureAppService detects App Service env vars', () => {
    delete process.env.WEBSITE_SITE_NAME;
    delete process.env.WEBSITE_INSTANCE_ID;
    delete process.env.WEBSITE_RUN_FROM_PACKAGE;
    expect(isAzureAppService()).toBe(false);

    process.env.WEBSITE_INSTANCE_ID = 'abc';
    expect(isAzureAppService()).toBe(true);
    delete process.env.WEBSITE_INSTANCE_ID;

    process.env.WEBSITE_SITE_NAME = 'qipp-api';
    expect(isAzureAppService()).toBe(true);
  });

  it('uses PLANT_TRENDS_CACHE_DIR when set', () => {
    const custom = path.join(tmpHome, 'custom-cache');
    process.env.PLANT_TRENDS_CACHE_DIR = custom;
    expect(getPlantTrendsCacheDir()).toBe(path.resolve(custom));
    expect(getPlantTrendsCachePath()).toBe(path.join(path.resolve(custom), 'plant-trends-cache.json'));
    expect(getPlantRawMetricsPath()).toBe(path.join(path.resolve(custom), 'plant-raw-metrics.json'));
  });

  it('on Azure without env uses HOME/data not wwwroot bundle', () => {
    process.env.WEBSITE_SITE_NAME = 'qipp-api';
    delete process.env.PLANT_TRENDS_CACHE_DIR;
    process.env.HOME = tmpHome;

    const dataDir = path.join(tmpHome, 'data');
    expect(getPlantTrendsCacheDir()).toBe(dataDir);
    expect(getPlantTrendsCachePath()).toBe(path.join(dataDir, 'plant-trends-cache.json'));
    expect(fs.existsSync(dataDir)).toBe(true);
  });
});
