jest.mock('../models/ChatRoom', () => ({
  find: jest.fn(),
  findOne: jest.fn(() => ({ lean: jest.fn() })),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(() => ({ lean: jest.fn() })),
}));

const ChatRoom = require('../models/ChatRoom');
const AdminConfig = require('../models/AdminConfig');
const { ensureDefaultCrewRooms, slugify } = require('../services/chatRoomService');

describe('chatRoomService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ availableCrews: ['A', 'B', 'General'] }),
    });
    ChatRoom.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    ChatRoom.create.mockImplementation((doc) => Promise.resolve({ ...doc, _id: 'new-id' }));
  });

  test('slugify normalizes room names', () => {
    expect(slugify('Safety Topics')).toBe('safety-topics');
  });

  test('ensureDefaultCrewRooms seeds missing crew rooms', async () => {
    const result = await ensureDefaultCrewRooms();
    expect(result.created).toBe(3);
    expect(ChatRoom.create).toHaveBeenCalledTimes(3);
  });

  test('ensureDefaultCrewRooms skips existing rooms', async () => {
    ChatRoom.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'existing' }) });
    const result = await ensureDefaultCrewRooms();
    expect(result.created).toBe(0);
    expect(ChatRoom.create).not.toHaveBeenCalled();
  });
});
