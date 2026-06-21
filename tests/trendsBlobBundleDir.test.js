const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getTrendsBlobsWritableDir,
  getTrendsBlobDirs,
  resetTrendsBlobsDir,
  SEED_DIR,
} = require('../services/plantReports/trendsBlobBundle');

describe('trends blob bundle directory resolution', () => {
  const envBackup = { ...process.env };
  let tmpHome;

  beforeEach(() => {
    resetTrendsBlobsDir();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qipp-trends-home-'));
  });

  afterEach(() => {
    process.env = { ...envBackup };
    resetTrendsBlobsDir();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('uses TRENDS_BLOBS_DIR when set', () => {
    const custom = path.join(tmpHome, 'custom-trends-blobs');
    process.env.TRENDS_BLOBS_DIR = custom;
    expect(getTrendsBlobsWritableDir()).toBe(path.resolve(custom));
  });

  it('derives writable dir from PLANT_TRENDS_CACHE_DIR', () => {
    const cacheRoot = path.join(tmpHome, 'plant-cache');
    process.env.PLANT_TRENDS_CACHE_DIR = cacheRoot;
    expect(getTrendsBlobsWritableDir()).toBe(path.join(path.resolve(cacheRoot), 'trends-blobs'));
  });
});
