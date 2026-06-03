const {
  allowLocalFolderIngest,
  resolveIngestSource,
} = require('../services/plantReports/blobIngestPolicy');

jest.mock('../services/plantReports/blobReports', () => ({
  blobIngestConfigured: jest.fn(() => false),
  getBlobAccessInfo: jest.fn(() => ({ container: 'report', mode: 'test' })),
}));

const { blobIngestConfigured } = require('../services/plantReports/blobReports');

describe('blobIngestPolicy', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.ALLOW_LOCAL_FOLDER_INGEST;
    delete process.env.PLANT_REPORTS_DIR;
    blobIngestConfigured.mockReturnValue(false);
  });

  afterAll(() => {
    process.env = env;
  });

  it('resolveIngestSource returns blob when configured', () => {
    blobIngestConfigured.mockReturnValue(true);
    expect(resolveIngestSource()).toBe('blob');
  });

  it('resolveIngestSource returns local only with ALLOW_LOCAL_FOLDER_INGEST=1', () => {
    process.env.ALLOW_LOCAL_FOLDER_INGEST = '1';
    process.env.PLANT_REPORTS_DIR = 'C:\\reports';
    expect(resolveIngestSource()).toBe('local');
  });

  it('resolveIngestSource returns null without blob or allowed local', () => {
    expect(resolveIngestSource()).toBeNull();
    expect(allowLocalFolderIngest()).toBe(false);
  });
});
