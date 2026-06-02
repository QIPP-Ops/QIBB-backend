jest.mock('../models/PlantMetricPoint', () => ({
  find: jest.fn(),
}));

const PlantMetricPoint = require('../models/PlantMetricPoint');
const { fetchMetricSeriesFromMongo, buildMetricKeyClauses } = require('../services/plantReports/metricSeriesQuery');

describe('fetchMetricSeriesFromMongo', () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    PlantMetricPoint.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { metricKey: 'plant_generation', reportDate: '2026-05-01', value: 100 },
          { metricKey: 'plant_generation', reportDate: '2026-05-02', value: 110 },
        ]),
      }),
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('queries PlantMetricPoint with case-insensitive key clauses and logs preview', async () => {
    const { series, rowCount } = await fetchMetricSeriesFromMongo(
      ['Plant_Generation'],
      '2026-01-01',
      '2026-06-01'
    );

    expect(PlantMetricPoint.find).toHaveBeenCalled();
    const query = PlantMetricPoint.find.mock.calls[0][0];
    expect(query.reportDate).toEqual({ $gte: '2026-01-01', $lte: '2026-06-01' });
    expect(query.$or).toBeDefined();
    expect(series.length).toBe(2);
    expect(rowCount).toBe(2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[trend-preview\] keys=Plant_Generation from=2026-01-01 to=2026-06-01 count=2$/)
    );
  });

  it('buildMetricKeyClauses includes exact and _dayN regex matchers', () => {
    const clauses = buildMetricKeyClauses(['fuel_gas']);
    expect(clauses.some((c) => c.metricKey?.$in)).toBe(true);
    expect(clauses.some((c) => c.metricKey?.$regex)).toBe(true);
  });

  it('returns empty series when no keys provided', async () => {
    const { series, rowCount } = await fetchMetricSeriesFromMongo([], '2026-01-01', '2026-06-01');
    expect(series).toEqual([]);
    expect(rowCount).toBe(0);
    expect(PlantMetricPoint.find).not.toHaveBeenCalled();
  });
});
