const ChatMessage = require('../models/ChatMessage');
const ChatRoom = require('../models/ChatRoom');
const AdminUser = require('../models/AdminUser');
const AuditLog = require('../models/AuditLog');
const { CHAT_AUDIT_ACTIONS } = require('../services/chatAuditService');

async function resolveAuthorFilter(authorEmail) {
  const email = String(authorEmail || '').trim().toLowerCase();
  if (!email) return null;
  const users = await AdminUser.find({ email }).select('_id').lean();
  const ids = users.map((u) => u._id);
  if (!ids.length) return { authorId: null };
  return { authorId: { $in: ids } };
}

exports.searchChatMessages = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const roomFilter = {};
    if (req.query.roomType) {
      roomFilter.type = String(req.query.roomType).trim();
    }
    if (req.query.roomId) {
      roomFilter._id = String(req.query.roomId).trim();
    }

    const rooms = await ChatRoom.find(roomFilter).select('_id type crew name participants').lean();
    const roomIds = rooms.map((r) => r._id);
    if (!roomIds.length) {
      return res.json({ messages: [], total: 0, page, pages: 1 });
    }

    const roomMap = Object.fromEntries(rooms.map((r) => [String(r._id), r]));
    const messageFilter = { roomId: { $in: roomIds }, deletedAt: null };

    if (req.query.from || req.query.to) {
      messageFilter.createdAt = {};
      if (req.query.from) {
        messageFilter.createdAt.$gte = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000Z`);
      }
      if (req.query.to) {
        messageFilter.createdAt.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
      }
    }

    const authorFilter = await resolveAuthorFilter(req.query.authorEmail);
    if (authorFilter) Object.assign(messageFilter, authorFilter);

    const q = String(req.query.q || '').trim();
    if (q) {
      messageFilter.text = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const [rows, total] = await Promise.all([
      ChatMessage.find(messageFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ChatMessage.countDocuments(messageFilter),
    ]);

    const authorIds = [...new Set(rows.map((r) => String(r.authorId)))];
    const authors = await AdminUser.find({ _id: { $in: authorIds } })
      .select('name fullName email crew')
      .lean();
    const authorMap = Object.fromEntries(authors.map((a) => [String(a._id), a]));

    const messages = rows.map((row) => {
      const room = roomMap[String(row.roomId)] || {};
      const author = authorMap[String(row.authorId)];
      return {
        id: String(row._id),
        roomId: String(row.roomId),
        roomType: room.type || '',
        roomName: room.name || '',
        crew: room.crew || '',
        text: row.text,
        createdAt: row.createdAt,
        editedAt: row.editedAt,
        author: author
          ? {
              id: String(author._id),
              name: author.name || author.fullName || author.email,
              email: author.email,
              crew: author.crew,
            }
          : { id: String(row.authorId), name: 'Unknown' },
        participantIds: (room.participants || []).map((id) => String(id)),
      };
    });

    const pages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ messages, total, page, pages });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to search chat messages', error: error.message });
  }
};

exports.getChatAuditLog = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const skip = (page - 1) * limit;

    const filter = { action: { $in: CHAT_AUDIT_ACTIONS } };
    if (req.query.actorEmail) {
      filter.actorEmail = String(req.query.actorEmail).trim().toLowerCase();
    }
    if (req.query.action) {
      filter.action = String(req.query.action).trim();
    }
    if (req.query.roomType) {
      filter['after.roomType'] = String(req.query.roomType).trim();
    }
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) {
        filter.timestamp.$gte = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000Z`);
      }
      if (req.query.to) {
        filter.timestamp.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    const pages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ logs, total, page, pages });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch chat audit log', error: error.message });
  }
};
