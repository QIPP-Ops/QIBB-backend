const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const { getAllowedCorsOrigins } = require('../config/corsOrigins');
const {
  canViewRoom,
  canPostInRoom,
  canDeleteMessage,
  canModerateRoom,
} = require('./chatAccessService');
const {
  getRoomById,
  ensureDefaultCrewRooms,
  serializeRoom,
} = require('./chatRoomService');
const {
  createMessage,
  editMessage,
  softDeleteMessage,
  toggleReaction,
  setPinned,
  markRoomRead,
  getCrewRoster,
} = require('./chatMessageService');
const { notifyMentions, notifyRoomMessage } = require('./chatNotifyService');
const { getOnlineUserIds, setUserOnline, setUserOffline } = require('./chatOnlineUsers');

let io = null;

function loadSocketIo() {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  return require('socket.io');
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return secret;
}

function roomChannel(roomId) {
  return `chat:room:${roomId}`;
}

async function getDbUser(userId) {
  return AdminUser.findById(userId).select('-passwordHash').lean();
}

function initChatSocket(httpServer) {
  const { Server } = loadSocketIo();
  const origins = getAllowedCorsOrigins();
  io = new Server(httpServer, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required.'));
      const decoded = jwt.verify(token, jwtSecret());
      const userId = decoded.userId || decoded.id;
      const dbUser = await getDbUser(userId);
      if (!dbUser || dbUser.isActive === false) return next(new Error('User not found.'));
      socket.user = {
        userId: String(dbUser._id),
        email: dbUser.email,
        name: dbUser.name || dbUser.fullName,
        crew: dbUser.crew,
        accessRole: dbUser.accessRole,
        role: dbUser.role,
      };
      socket.dbUser = dbUser;
      next();
    } catch (err) {
      next(new Error('Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    setUserOnline(userId, socket.id);

    socket.on('chat:join', async ({ roomId }) => {
      try {
        const room = await getRoomById(roomId);
        if (!room || !canViewRoom(socket.user, room)) return;
        socket.join(roomChannel(roomId));
        await markRoomRead(roomId, userId);
        socket.emit('chat:joined', { roomId, room: serializeRoom(room) });
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('chat:leave', ({ roomId }) => {
      socket.leave(roomChannel(roomId));
    });

    socket.on('chat:typing', ({ roomId, isTyping }) => {
      socket.to(roomChannel(roomId)).emit('chat:typing', {
        roomId,
        userId,
        name: socket.user.name,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('chat:send', async (payload) => {
      try {
        const { roomId, text, attachments, replyTo } = payload || {};
        const room = await getRoomById(roomId);
        if (!room || !canViewRoom(socket.user, room)) {
          return socket.emit('chat:error', { message: 'Room not accessible.' });
        }
        if (!canPostInRoom(socket.user, room, socket.dbUser)) {
          return socket.emit('chat:error', { message: 'You cannot post in this room.' });
        }
        const message = await createMessage({
          roomId,
          topicId: room.type === 'topic' ? roomId : room.parentRoomId,
          authorId: userId,
          text,
          attachments,
          replyTo,
          crew: room.crew,
        });
        io.to(roomChannel(roomId)).emit('chat:message', { roomId, message });
        const roster = await getCrewRoster(room.crew);
        const memberIds = roster.map((r) => String(r._id));
        const author = socket.dbUser;
        await notifyMentions({
          message,
          room,
          author,
          mentionIds: message.mentions,
          onlineUserIds: getOnlineUserIds(),
        });
        await notifyRoomMessage({
          room,
          message,
          author,
          memberIds,
          onlineUserIds: getOnlineUserIds(),
          mutedUserIds: room.mutedUsers || [],
        });
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('chat:edit', async ({ messageId, roomId, text }) => {
      try {
        const updated = await editMessage(messageId, userId, text);
        if (!updated) return socket.emit('chat:error', { message: 'Message not found.' });
        io.to(roomChannel(roomId)).emit('chat:edited', { roomId, messageId, text, editedAt: updated.editedAt });
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('chat:delete', async ({ messageId, roomId }) => {
      try {
        const room = await getRoomById(roomId);
        const ChatMessage = require('../models/ChatMessage');
        const msg = await ChatMessage.findById(messageId).lean();
        if (!msg || !canDeleteMessage(socket.user, msg, room)) {
          return socket.emit('chat:error', { message: 'Not allowed.' });
        }
        await softDeleteMessage(messageId, userId);
        io.to(roomChannel(roomId)).emit('chat:deleted', { roomId, messageId });
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('chat:react', async ({ messageId, roomId, emoji }) => {
      try {
        const updated = await toggleReaction(messageId, userId, emoji);
        if (!updated) return;
        io.to(roomChannel(roomId)).emit('chat:reaction', {
          roomId,
          messageId,
          reactions: updated.reactions,
        });
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('chat:pin', async ({ messageId, roomId, pinned }) => {
      try {
        const room = await getRoomById(roomId);
        if (!canModerateRoom(socket.user, room)) {
          return socket.emit('chat:error', { message: 'Not allowed.' });
        }
        const updated = await setPinned(messageId, userId, pinned);
        if (!updated) return;
        io.to(roomChannel(roomId)).emit('chat:pinned', {
          roomId,
          messageId,
          pinned: updated.pinned,
        });
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      setUserOffline(userId);
    });
  });

  return io;
}

function getIo() {
  return io;
}

async function seedChatOnStartup() {
  try {
    const result = await ensureDefaultCrewRooms();
    if (result.created) {
      console.log(`[chat] seeded ${result.created} default crew rooms`);
    }
  } catch (err) {
    console.warn('[chat] startup seed skipped:', err.message);
  }
}

module.exports = { initChatSocket, getIo, seedChatOnStartup };
