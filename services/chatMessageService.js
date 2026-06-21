const ChatMessage = require('../models/ChatMessage');
const ChatRoomPreference = require('../models/ChatRoomPreference');
const AdminUser = require('../models/AdminUser');
const { getSignedDownloadUrl } = require('./chatFileService');

const DEFAULT_PAGE_SIZE = 50;

function extractMentionIds(text, roster) {
  if (!text) return [];
  const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const ids = new Set();
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    ids.add(match[2]);
  }
  const atPattern = /@([a-zA-Z0-9._-]+)/g;
  const lowerText = text.toLowerCase();
  while ((match = atPattern.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    for (const person of roster) {
      const name = String(person.name || person.fullName || '').toLowerCase();
      const email = String(person.email || '').split('@')[0].toLowerCase();
      const empId = String(person.empId || '').toLowerCase();
      if (token === email || token === empId || name.includes(token)) {
        ids.add(String(person._id));
      }
    }
  }
  return [...ids];
}

async function getCrewRoster(crew) {
  const query = crew && crew.toLowerCase() !== 'general'
    ? { crew, isApproved: true, isActive: { $ne: false } }
    : { isApproved: true, isActive: { $ne: false } };
  return AdminUser.find(query).select('_id name fullName email empId crew').lean();
}

async function listMessages({ roomId, before, limit = DEFAULT_PAGE_SIZE }) {
  const query = { roomId, deletedAt: null };
  if (before) query.createdAt = { $lt: new Date(before) };
  const rows = await ChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
  const authorIds = [...new Set(rows.map((r) => String(r.authorId)))];
  const authors = await AdminUser.find({ _id: { $in: authorIds } })
    .select('name fullName email empId crew')
    .lean();
  const authorMap = Object.fromEntries(authors.map((a) => [String(a._id), a]));

  const replyIds = rows.filter((r) => r.replyTo).map((r) => r.replyTo);
  const replies = replyIds.length
    ? await ChatMessage.find({ _id: { $in: replyIds } }).select('text authorId deletedAt').lean()
    : [];
  const replyMap = Object.fromEntries(replies.map((r) => [String(r._id), r]));

  const serialized = [];
  for (const row of rows.reverse()) {
    serialized.push(await serializeMessage(row, authorMap, replyMap));
  }
  return {
    messages: serialized,
    hasMore: rows.length === Math.min(limit, 100),
  };
}

async function serializeMessage(row, authorMap, replyMap) {
  const author = authorMap?.[String(row.authorId)];
  const attachments = [];
  for (const att of row.attachments || []) {
    attachments.push({
      ...att,
      url: await getSignedDownloadUrl(att.key),
    });
  }
  let replyPreview = null;
  if (row.replyTo && replyMap) {
    const ref = replyMap[String(row.replyTo)];
    if (ref && !ref.deletedAt) {
      replyPreview = { id: String(row.replyTo), text: ref.text?.slice(0, 200) || '' };
    }
  }
  return {
    id: String(row._id),
    roomId: String(row.roomId),
    topicId: row.topicId ? String(row.topicId) : null,
    author: author
      ? {
          id: String(author._id),
          name: author.name || author.fullName || author.email,
          email: author.email,
          crew: author.crew,
        }
      : { id: String(row.authorId), name: 'Unknown' },
    text: row.text,
    attachments,
    replyTo: row.replyTo ? String(row.replyTo) : null,
    replyPreview,
    mentions: (row.mentions || []).map(String),
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    reactions: row.reactions || [],
    pinned: Boolean(row.pinned),
    pinnedAt: row.pinnedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function createMessage({ roomId, topicId, authorId, text, attachments, replyTo, crew }) {
  const roster = await getCrewRoster(crew);
  const mentions = extractMentionIds(text, roster);
  const doc = await ChatMessage.create({
    roomId,
    topicId: topicId || null,
    authorId,
    text: String(text || '').trim(),
    attachments: attachments || [],
    replyTo: replyTo || null,
    mentions,
  });
  const author = await AdminUser.findById(authorId).select('name fullName email empId crew').lean();
  const authorMap = { [String(authorId)]: author };
  let replyMap = {};
  if (replyTo) {
    const ref = await ChatMessage.findById(replyTo).select('text authorId deletedAt').lean();
    if (ref) replyMap = { [String(replyTo)]: ref };
  }
  return serializeMessage(doc.toObject(), authorMap, replyMap);
}

async function editMessage(messageId, userId, text) {
  const msg = await ChatMessage.findById(messageId);
  if (!msg || msg.deletedAt) return null;
  if (String(msg.authorId) !== String(userId)) {
    throw Object.assign(new Error('Only the author may edit this message.'), { status: 403 });
  }
  msg.text = String(text || '').trim();
  msg.editedAt = new Date();
  await msg.save();
  return msg.toObject();
}

async function softDeleteMessage(messageId, deletedBy) {
  const msg = await ChatMessage.findById(messageId);
  if (!msg) return null;
  msg.deletedAt = new Date();
  msg.deletedBy = deletedBy;
  msg.text = '';
  msg.attachments = [];
  await msg.save();
  return msg.toObject();
}

async function toggleReaction(messageId, userId, emoji) {
  const msg = await ChatMessage.findById(messageId);
  if (!msg || msg.deletedAt) return null;
  const reactions = msg.reactions || [];
  const idx = reactions.findIndex((r) => String(r.userId) === String(userId) && r.emoji === emoji);
  if (idx >= 0) reactions.splice(idx, 1);
  else reactions.push({ emoji, userId });
  msg.reactions = reactions;
  await msg.save();
  return msg.toObject();
}

async function setPinned(messageId, userId, pinned) {
  const msg = await ChatMessage.findById(messageId);
  if (!msg || msg.deletedAt) return null;
  msg.pinned = Boolean(pinned);
  msg.pinnedAt = pinned ? new Date() : null;
  msg.pinnedBy = pinned ? userId : null;
  await msg.save();
  return msg.toObject();
}

async function searchMessages(roomId, q, limit = 30) {
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const rows = await ChatMessage.find({ roomId, deletedAt: null, text: regex })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50))
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    text: r.text,
    createdAt: r.createdAt,
    authorId: String(r.authorId),
  }));
}

async function markRoomRead(roomId, userId) {
  return ChatRoomPreference.findOneAndUpdate(
    { roomId, userId },
    { lastReadAt: new Date() },
    { upsert: true, new: true }
  ).lean();
}

async function setRoomMuted(roomId, userId, muted) {
  return ChatRoomPreference.findOneAndUpdate(
    { roomId, userId },
    { muted: Boolean(muted) },
    { upsert: true, new: true }
  ).lean();
}

async function getRoomPreferences(roomId, userId) {
  return ChatRoomPreference.findOne({ roomId, userId }).lean();
}

module.exports = {
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
  serializeMessage,
  extractMentionIds,
  getCrewRoster,
  DEFAULT_PAGE_SIZE,
};
