const { logAction } = require('./auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

const CHAT_AUDIT_ACTIONS = [
  AUDIT_ACTIONS.CHAT_MESSAGE_SENT,
  AUDIT_ACTIONS.CHAT_MESSAGE_EDITED,
  AUDIT_ACTIONS.CHAT_MESSAGE_DELETED,
];

function truncateText(text, max = 500) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function buildChatAuditPayload({ message, room, author, beforeText }) {
  const messageId = message?.id || message?._id;
  const payload = {
    roomId: String(room?._id || message?.roomId || ''),
    roomType: room?.type || '',
    roomName: room?.name || '',
    crew: room?.crew || '',
    text: truncateText(message?.text),
    authorEmail: author?.email || '',
    authorName: author?.name || author?.fullName || '',
    participantIds: (room?.participants || []).map((id) => String(id)),
  };
  if (beforeText != null) {
    payload.beforeText = truncateText(beforeText);
  }
  return {
    targetType: 'chat_message',
    targetId: messageId != null ? String(messageId) : '',
    targetName:
      room?.type === 'dm'
        ? `DM: ${room?.name || 'private'}`
        : `${room?.crew || ''}/${room?.name || 'channel'}`.replace(/^\//, ''),
    before: beforeText != null ? { text: truncateText(beforeText) } : null,
    after: payload,
  };
}

async function logChatMessageAction({ req, action, message, room, author, beforeText }) {
  const audit = buildChatAuditPayload({ message, room, author, beforeText });
  await logAction({
    actor: author || req?.user,
    action,
    targetType: audit.targetType,
    targetId: audit.targetId,
    targetName: audit.targetName,
    before: audit.before,
    after: audit.after,
    req,
  });
}

module.exports = {
  CHAT_AUDIT_ACTIONS,
  logChatMessageAction,
  buildChatAuditPayload,
  truncateText,
};
