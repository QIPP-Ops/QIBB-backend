const mockSendMail = jest.fn().mockResolvedValue(true);

jest.mock('../models/Notification', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/ChatRoomPreference', () => ({
  findOne: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  sendMail: (...args) => mockSendMail(...args),
  emailTemplate: (title, body) => `<html>${title}${body}</html>`,
  isEmailConfigured: jest.fn(() => true),
}));

jest.mock('../config/frontendUrl', () => ({
  getFrontendBaseUrl: () => 'https://acwaops.com/qipp',
}));

const Notification = require('../models/Notification');
const AdminUser = require('../models/AdminUser');
const ChatRoomPreference = require('../models/ChatRoomPreference');
const { isEmailConfigured } = require('../services/emailService');
const { notifyDmMessage, DM_EMAIL_THROTTLE_MS } = require('../services/chatNotifyService');

const dmRoom = {
  _id: 'room-dm-1',
  type: 'dm',
  name: 'Recipient',
  participants: ['sender-1', 'recipient-1'],
};

const author = { _id: 'sender-1', name: 'Alice Sender' };
const message = { id: 'msg-1', text: 'Hello there, this is a private message.' };

function mockNotificationCreate() {
  Notification.create.mockImplementation((doc) =>
    Promise.resolve({
      ...doc,
      save: jest.fn().mockResolvedValue(doc),
    })
  );
}

describe('notifyDmMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CHAT_EMAIL_ON_DM;
    Notification.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    ChatRoomPreference.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockNotificationCreate();
    AdminUser.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ email: 'recipient@acwapower.com', name: 'Bob' }),
      }),
    });
    isEmailConfigured.mockReturnValue(true);
  });

  test('sends email to offline recipient with sender name, preview, and DM link', async () => {
    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@acwapower.com',
        subject: 'QIPP: New message from Alice Sender',
      })
    );
    const html = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain('Alice Sender');
    expect(html).toContain('Hello there, this is a private message.');
    expect(html).toContain('https://acwaops.com/qipp/crew-chat?dm=sender-1');
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'chat_dm',
        recipientUserId: 'recipient-1',
        dedupeKey: 'chat_dm:msg-1:recipient-1',
      })
    );
  });

  test('does not email the sender', async () => {
    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['sender-1', 'recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: 'recipient-1' })
    );
  });

  test('skips email when recipient is online', async () => {
    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(['recipient-1']),
    });

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(Notification.create).toHaveBeenCalled();
  });

  test('skips email when recipient has no email', async () => {
    AdminUser.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ email: '', name: 'Bob' }),
      }),
    });

    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('skips email for placeholder addresses', async () => {
    AdminUser.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ email: 'noreply@placeholder.local', name: 'Bob' }),
      }),
    });

    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('throttles to one email per DM thread per 15 minutes', async () => {
    const recentEmail = {
      type: 'chat_dm',
      recipientUserId: 'recipient-1',
      metadata: { roomId: 'room-dm-1' },
      emailSentAt: new Date(),
    };
    Notification.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(recentEmail) });

    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });
    await notifyDmMessage({
      room: dmRoom,
      message: { id: 'msg-2', text: 'Second message' },
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(DM_EMAIL_THROTTLE_MS).toBe(15 * 60 * 1000);
  });

  test('skips notification and email when DM room is muted', async () => {
    ChatRoomPreference.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ muted: true }),
    });

    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(Notification.create).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('skips email when CHAT_EMAIL_ON_DM is disabled', async () => {
    process.env.CHAT_EMAIL_ON_DM = '0';

    await notifyDmMessage({
      room: dmRoom,
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(Notification.create).toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('truncates long message preview in email', async () => {
    const longText = 'x'.repeat(600);

    await notifyDmMessage({
      room: dmRoom,
      message: { id: 'msg-long', text: longText },
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    const html = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain('x'.repeat(500));
    expect(html).toContain('…');
  });

  test('no-ops for non-DM rooms', async () => {
    await notifyDmMessage({
      room: { _id: 'crew-1', type: 'crew' },
      message,
      author,
      recipientIds: ['recipient-1'],
      onlineUserIds: new Set(),
    });

    expect(Notification.create).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
