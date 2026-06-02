const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  buildPlantTrendsCacheFromPoints,
  hasUsablePlantTrendsCache,
} = require('../services/plantReports/plantTrendsCache');

describe('rebuild trends cache from points', () => {
  it('buildPlantTrendsCacheFromPoints produces usable series', () => {
    const payload = buildPlantTrendsCacheFromPoints([
      {
        metricKey: 'plant_generation',
        label: 'Generation',
        category: 'energy',
        unit: 'MWh',
        reportDate: '2026-05-01',
        value: 100,
      },
      {
        metricKey: 'plant_generation',
        label: 'Generation',
        category: 'energy',
        unit: 'MWh',
        reportDate: '2026-05-02',
        value: 110,
      },
    ]);
    expect(hasUsablePlantTrendsCache(payload)).toBe(true);
    expect(payload.seriesByKey.plant_generation.length).toBe(2);
  });

  it('rebuild script logic writes JSON with series', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qipp-cache-'));
    const rawPath = path.join(dir, 'raw.json');
    const points = [
      {
        metricKey: 'plant_load',
        label: 'Load',
        category: 'energy',
        reportDate: '2026-04-01',
        value: 50,
      },
    ];
    fs.writeFileSync(rawPath, JSON.stringify({ points, filesParsed: 1 }));
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const cachePayload = buildPlantTrendsCacheFromPoints(raw.points);
    const cachePath = path.join(dir, 'plant-trends-cache.json');
    fs.writeFileSync(cachePath, JSON.stringify(cachePayload));
    const read = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(hasUsablePlantTrendsCache(read)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
