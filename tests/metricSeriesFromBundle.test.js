jest.mock('../services/plantReports/buildTrendsBundleFromSixBlobs', () => ({
  buildTrendsBundleFromSixBlobs: jest.fn(() => ({
    payload: {
      seriesByKey: {
        plant_generation: [
          { date: '2026-05-01', value: 100, plant_generation: 100 },
          { date: '2026-05-02', value: 110, plant_generation: 110 },
        ],
      },
      metrics: [{ metricKey: 'plant_generation', label: 'Plant Generation' }],
    },
  })),
  slugMetricKey: (k) => String(k).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
}));

const { fetchMetricSeriesFromBundle } = require('../services/plantReports/metricSeriesFromBundle');

describe('fetchMetricSeriesFromBundle', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('reads series from six-blob bundle without Mongo', () => {
    const { series, rowCount } = fetchMetricSeriesFromBundle(
      ['plant_generation'],
      '2026-01-01',
      '2026-06-01'
    );

    expect(series.length).toBe(2);
    expect(rowCount).toBe(2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[trend-preview\] bundle keys=plant_generation/)
    );
  });

  it('returns empty series when no keys provided', () => {
    const { series, rowCount } = fetchMetricSeriesFromBundle([], '2026-01-01', '2026-06-01');
    expect(series).toEqual([]);
    expect(rowCount).toBe(0);
  });
});
