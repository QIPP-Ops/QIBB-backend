jest.mock('../models/ChatRoom', () => ({
  findOne: jest.fn(() => ({ lean: jest.fn() })),
  create: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

const ChatRoom = require('../models/ChatRoom');
const AdminUser = require('../models/AdminUser');
const { buildDmKey, createOrGetDmRoom } = require('../services/chatRoomService');

describe('chat DM service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildDmKey is order-independent', () => {
    expect(buildDmKey('aaa', 'bbb')).toBe('aaa:bbb');
    expect(buildDmKey('bbb', 'aaa')).toBe('aaa:bbb');
  });

  test('createOrGetDmRoom rejects self-DM', async () => {
    await expect(
      createOrGetDmRoom({ userId: 'u1', recipientUserId: 'u1' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('createOrGetDmRoom returns existing room', async () => {
    const existing = { _id: 'dm1', type: 'dm', dmKey: 'u1:u2' };
    ChatRoom.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) });
    AdminUser.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'u2',
            name: 'Recipient',
            isApproved: true,
            isActive: true,
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'u1',
            isApproved: true,
            isActive: true,
          }),
        }),
      });

    const room = await createOrGetDmRoom({ userId: 'u1', recipientUserId: 'u2' });
    expect(room).toEqual(existing);
    expect(ChatRoom.create).not.toHaveBeenCalled();
  });

  test('createOrGetDmRoom creates room for approved recipient', async () => {
    ChatRoom.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    AdminUser.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'u2',
            name: 'Recipient',
            isApproved: true,
            isActive: true,
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'u1',
            isApproved: true,
            isActive: true,
          }),
        }),
      });
    ChatRoom.create.mockResolvedValue({ _id: 'new-dm', type: 'dm' });

    const room = await createOrGetDmRoom({ userId: 'u1', recipientUserId: 'u2' });
    expect(ChatRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dm',
        participants: ['u1', 'u2'],
        dmKey: 'u1:u2',
      })
    );
    expect(room._id).toBe('new-dm');
  });

  test('createOrGetDmRoom rejects unapproved sender', async () => {
    AdminUser.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'u2',
            name: 'Recipient',
            isApproved: true,
            isActive: true,
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'u1',
            isApproved: false,
            isActive: true,
          }),
        }),
      });

    await expect(
      createOrGetDmRoom({ userId: 'u1', recipientUserId: 'u2' })
    ).rejects.toMatchObject({ status: 403 });
  });
});
