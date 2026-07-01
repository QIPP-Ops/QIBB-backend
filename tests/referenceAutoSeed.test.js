jest.mock('../models/ReferenceCategory', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock('../models/ReferenceItem', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  deleteMany: jest.fn(),
}));

const ReferenceCategory = require('../models/ReferenceCategory');
const ReferenceItem = require('../models/ReferenceItem');
const { ensureBuiltinReferencesSeeded, DEFAULT_MANUALS } = require('../services/referenceAutoSeed');

describe('referenceAutoSeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DEFAULT_MANUALS has six seeded entries', () => {
    expect(DEFAULT_MANUALS).toHaveLength(6);
  });

  test('skips when manuals already exist', async () => {
    ReferenceItem.countDocuments.mockResolvedValue(3);
    const result = await ensureBuiltinReferencesSeeded();
    expect(result.seeded).toBe(false);
    expect(result.reason).toBe('already_has_items');
    expect(ReferenceCategory.create).not.toHaveBeenCalled();
  });

  test('creates categories and items when empty', async () => {
    ReferenceItem.countDocuments.mockResolvedValue(0);
    ReferenceCategory.findOne.mockResolvedValue(null);
    ReferenceCategory.create.mockImplementation(async (doc) => ({
      _id: `cat-${doc.name}`,
      ...doc,
    }));
    ReferenceItem.findOne.mockResolvedValue(null);
    ReferenceItem.create.mockResolvedValue({});

    const result = await ensureBuiltinReferencesSeeded();
    expect(result.seeded).toBe(true);
    expect(result.itemsCreated).toBe(6);
    expect(result.categoriesCreated).toBe(6);
    expect(ReferenceItem.create).toHaveBeenCalledTimes(6);
  });
});
