const multer = require('multer');
const AdminUser = require('../models/AdminUser');
const {
  canViewRoom,
  canPostInRoom,
  canDeleteMessage,
  canModerateRoom,
  canManageRoomSettings,
  isCrossCrewChatViewer,
  isOperationManagerUser,
} = require('../services/chatAccessService');
const {
  listRoomsForUser,
  getRoomById,
  createTopicRoom,
  updateRoomSettings,
  serializeRoom,
  ensureDefaultCrewRooms,
  enrichDmRooms,
  createOrGetDmRoom,
  getApprovedUsersForDm,
  getRoomMemberIds,
} = require('../services/chatRoomService');
const {
  listMessages,
  createMessage,
  editMessage,
  softDeleteMessage,
  toggleReaction,
  setPinned,
  searchMessages,
  markRoomRead,
  setRoomMuted,
  getRoomPreferences,
  getCrewRoster,
  getDmMentionRoster,
} = require('../services/chatMessageService');
const { uploadChatFile, getSignedDownloadUrl } = require('../services/chatFileService');
const { notifyMentions, notifyRoomMessage, notifyDmMessage } = require('../services/chatNotifyService');
const { getOnlineUserIds } = require('../services/chatOnlineUsers');
const { logChatMessageAction } = require('../services/chatAuditService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const ChatMessage = require('../models/ChatMessage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.CHAT_MAX_FILE_MB || '25', 10) * 1024 * 1024 },
});

function userId(req) {
  return req.user?.userId || req.user?.id;
}

async function loadDbUser(req) {
  if (req.dbUser) return req.dbUser;
  req.dbUser = await AdminUser.findById(userId(req)).select('-passwordHash').lean();
  return req.dbUser;
}

async function resolveMentionRoster(room) {
  if (room.type === 'dm') {
    return getDmMentionRoster(room.participants || []);
  }
  return getCrewRoster(room.crew);
}

async function assertMessageRoomAccess(req, messageId) {
  const msg = await ChatMessage.findById(messageId).lean();
  if (!msg) return null;
  const room = await getRoomById(msg.roomId);
  const dbUser = await loadDbUser(req);
  if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
    throw Object.assign(new Error('Room not accessible.'), { status: 403 });
  }
  return { msg, room, dbUser };
}

exports.listRooms = async (req, res) => {
  try {
    await ensureDefaultCrewRooms();
    const dbUser = await loadDbUser(req);
    const rooms = await listRoomsForUser(
      { ...req.user, crew: dbUser?.crew },
      require('../services/chatAccessService')
    );
    const enriched = await enrichDmRooms(rooms, userId(req));
    const prefs = await Promise.all(
      rooms.map((r) => getRoomPreferences(r._id, userId(req)))
    );
    const prefMap = Object.fromEntries(prefs.filter(Boolean).map((p) => [String(p.roomId), p]));
    res.json({
      rooms: enriched.map((r) => ({
        ...serializeRoom(r),
        muted: Boolean(prefMap[String(r._id)]?.muted),
        lastReadAt: prefMap[String(r._id)]?.lastReadAt || null,
      })),
      crossCrewAccess: isCrossCrewChatViewer(dbUser),
      isOperationManager: isOperationManagerUser(dbUser),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const dbUser = await loadDbUser(req);
    if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
      return res.status(403).json({ message: 'Room not accessible.' });
    }
    const { before, limit } = req.query;
    const result = await listMessages({ roomId: room._id, before, limit: parseInt(limit, 10) || 50 });
    await markRoomRead(room._id, userId(req));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.postMessage = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const dbUser = await loadDbUser(req);
    if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
      return res.status(403).json({ message: 'Room not accessible.' });
    }
    if (!canPostInRoom(req.user, room, dbUser)) {
      return res.status(403).json({ message: 'You cannot post in this room.' });
    }
    const { text, attachments, replyTo } = req.body || {};
    const mentionRoster = await resolveMentionRoster(room);
    const message = await createMessage({
      roomId: room._id,
      topicId: room.type === 'topic' ? room._id : null,
      authorId: userId(req),
      text,
      attachments,
      replyTo,
      crew: room.crew,
      mentionRoster,
    });
    await logChatMessageAction({
      req,
      action: AUDIT_ACTIONS.CHAT_MESSAGE_SENT,
      message,
      room,
      author: dbUser,
    });
    const roster = mentionRoster;
    await notifyMentions({
      message,
      room,
      author: dbUser,
      mentionIds: message.mentions,
      onlineUserIds: getOnlineUserIds(),
    });
    const memberIds =
      room.type === 'dm'
        ? await getRoomMemberIds(room, userId(req))
        : roster.map((r) => String(r._id));
    if (room.type === 'dm') {
      await notifyDmMessage({
        room,
        message,
        author: dbUser,
        recipientIds: memberIds,
        onlineUserIds: getOnlineUserIds(),
      });
    } else {
      await notifyRoomMessage({
        room,
        message,
        author: dbUser,
        memberIds,
        onlineUserIds: getOnlineUserIds(),
        mutedUserIds: room.mutedUsers || [],
      });
    }
    res.status(201).json({ message });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const access = await assertMessageRoomAccess(req, req.params.messageId);
    if (!access) return res.status(404).json({ message: 'Message not found.' });
    const beforeText = access.msg.text;
    const updated = await editMessage(req.params.messageId, userId(req), req.body?.text);
    if (!updated) return res.status(404).json({ message: 'Message not found.' });
    await logChatMessageAction({
      req,
      action: AUDIT_ACTIONS.CHAT_MESSAGE_EDITED,
      message: updated,
      room: access.room,
      author: access.dbUser,
      beforeText,
    });
    res.json({ messageId: req.params.messageId, text: updated.text, editedAt: updated.editedAt });
  } catch (err) {
    res.status(err.status || 403).json({ message: err.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const msg = await ChatMessage.findById(req.params.messageId).lean();
    if (!msg || !canDeleteMessage(req.user, msg, room)) {
      return res.status(403).json({ message: 'Not allowed.' });
    }
    const dbUser = await loadDbUser(req);
    await logChatMessageAction({
      req,
      action: AUDIT_ACTIONS.CHAT_MESSAGE_DELETED,
      message: msg,
      room,
      author: dbUser,
    });
    await softDeleteMessage(req.params.messageId, userId(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.uploadFile = [
  upload.single('file'),
  async (req, res) => {
    try {
      const room = await getRoomById(req.params.roomId);
      const dbUser = await loadDbUser(req);
      if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
        return res.status(403).json({ message: 'Room not accessible.' });
      }
      if (!canPostInRoom(req.user, room, dbUser)) {
        return res.status(403).json({ message: 'You cannot post in this room.' });
      }
      const attachment = await uploadChatFile({
        roomId: String(room._id),
        userId: userId(req),
        file: req.file,
      });
      const url = await getSignedDownloadUrl(attachment.key);
      res.status(201).json({ attachment: { ...attachment, url } });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
];

exports.createTopic = async (req, res) => {
  try {
    const { crew, name, parentRoomId } = req.body || {};
    if (!canManageRoomSettings(req.user, { crew })) {
      return res.status(403).json({ message: 'Only crew admins may create topics.' });
    }
    const room = await createTopicRoom({
      crew,
      name,
      parentRoomId,
      createdBy: userId(req),
    });
    res.status(201).json({ room: serializeRoom(room.toObject()) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.patchRoom = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    if (!room || !canManageRoomSettings(req.user, room)) {
      return res.status(403).json({ message: 'Not allowed.' });
    }
    const updated = await updateRoomSettings(room._id, req.body || {});
    res.json({ room: serializeRoom(updated) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.getRoster = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const dbUser = await loadDbUser(req);
    if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
      return res.status(403).json({ message: 'Room not accessible.' });
    }
    if (room.type === 'dm') {
      const viewerId = userId(req);
      const otherId = (room.participants || [])
        .map((id) => String(id))
        .find((id) => id !== String(viewerId));
      if (!otherId) return res.json({ roster: [] });
      const other = await AdminUser.findById(otherId)
        .select('_id name fullName email empId crew')
        .lean();
      if (!other) return res.json({ roster: [] });
      return res.json({
        roster: [
          {
            id: String(other._id),
            name: other.name || other.fullName || other.email,
            email: other.email,
            empId: other.empId,
            crew: other.crew,
          },
        ],
      });
    }
    const roster = await getCrewRoster(room.crew);
    res.json({
      roster: roster.map((r) => ({
        id: String(r._id),
        name: r.name || r.fullName || r.email,
        email: r.email,
        empId: r.empId,
        crew: r.crew,
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.search = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const dbUser = await loadDbUser(req);
    if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
      return res.status(403).json({ message: 'Room not accessible.' });
    }
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const results = await searchMessages(room._id, q);
    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.react = async (req, res) => {
  try {
    const access = await assertMessageRoomAccess(req, req.params.messageId);
    if (!access) return res.status(404).json({ message: 'Message not found.' });
    const updated = await toggleReaction(req.params.messageId, userId(req), req.body?.emoji);
    if (!updated) return res.status(404).json({ message: 'Message not found.' });
    res.json({ reactions: updated.reactions });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.pin = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    if (!canModerateRoom(req.user, room)) {
      return res.status(403).json({ message: 'Not allowed.' });
    }
    const updated = await setPinned(req.params.messageId, userId(req), req.body?.pinned);
    if (!updated) return res.status(404).json({ message: 'Message not found.' });
    res.json({ pinned: updated.pinned });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.muteRoom = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const dbUser = await loadDbUser(req);
    if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
      return res.status(403).json({ message: 'Room not accessible.' });
    }
    const pref = await setRoomMuted(room._id, userId(req), req.body?.muted);
    res.json({ muted: pref.muted });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId);
    const dbUser = await loadDbUser(req);
    if (!room || !canViewRoom({ ...req.user, crew: dbUser?.crew }, room)) {
      return res.status(403).json({ message: 'Room not accessible.' });
    }
    const pref = await markRoomRead(req.params.roomId, userId(req));
    res.json({ lastReadAt: pref.lastReadAt });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.getDmRoster = async (req, res) => {
  try {
    const users = await getApprovedUsersForDm(userId(req));
    res.json({
      roster: users.map((r) => ({
        id: String(r._id),
        name: r.name || r.fullName || r.email,
        email: r.email,
        empId: r.empId,
        crew: r.crew,
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.createDm = async (req, res) => {
  try {
    const recipientUserId = req.body?.recipientUserId;
    const room = await createOrGetDmRoom({
      userId: userId(req),
      recipientUserId,
    });
    const [enriched] = await enrichDmRooms([room.toObject ? room.toObject() : room], userId(req));
    res.status(201).json({ room: serializeRoom(enriched) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};
