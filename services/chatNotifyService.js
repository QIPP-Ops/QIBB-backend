const Notification = require('../models/Notification');
const AdminUser = require('../models/AdminUser');
const ChatRoomPreference = require('../models/ChatRoomPreference');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { emailCtaButton } = require('./emailHtmlHelpers');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');

const DM_EMAIL_THROTTLE_MS = 15 * 60 * 1000;
const DM_PREVIEW_LEN = 280;
const DM_EMAIL_PREVIEW_LEN = 500;

function chatEnabled() {
  return process.env.CHAT_EMAIL_ON_MENTION === '1' || process.env.CHAT_EMAIL_ON_MENTION === 'true';
}

function dmEmailEnabled() {
  const v = process.env.CHAT_EMAIL_ON_DM;
  if (v === '0' || v === 'false') return false;
  return true;
}

async function wasDmEmailSentRecently(recipientId, roomId) {
  const since = new Date(Date.now() - DM_EMAIL_THROTTLE_MS);
  const recent = await Notification.findOne({
    type: 'chat_dm',
    recipientUserId: recipientId,
    'metadata.roomId': String(roomId),
    emailSentAt: { $gte: since },
  }).lean();
  return Boolean(recent);
}

async function notifyMentions({ message, room, author, mentionIds, onlineUserIds = new Set() }) {
  if (!mentionIds?.length) return [];
  const unique = [...new Set(mentionIds.map(String))].filter((id) => id !== String(author._id || author.id));
  const created = [];
  const link = `${getFrontendBaseUrl()}/crew-chat?room=${room._id || room.id}`;

  for (const recipientId of unique) {
    const dedupeKey = `chat_mention:${message.id || message._id}:${recipientId}`;
    const existing = await Notification.findOne({ dedupeKey, recipientUserId: recipientId }).lean();
    if (existing) {
      created.push(existing);
      continue;
    }
    const doc = await Notification.create({
      type: 'chat_mention',
      recipientUserId: recipientId,
      title: `${author.name || 'Someone'} mentioned you in ${room.name}`,
      body: String(message.text || '').slice(0, 280),
      link,
      metadata: {
        roomId: String(room._id || room.id),
        messageId: String(message.id || message._id),
      },
      dedupeKey,
    });
    created.push(doc);

    const isOffline = !onlineUserIds.has(recipientId);
    if (chatEnabled() && isOffline) {
      const user = await AdminUser.findById(recipientId).select('email name').lean();
      const email = (user?.email || '').trim();
      if (email && !isPlaceholderEmail(email) && isEmailConfigured()) {
        try {
          await sendMail({
            to: email,
            subject: `QIPP: ${author.name || 'Someone'} mentioned you in ${room.name}`,
            html: emailTemplate(
              'Chat mention',
              `<p><strong>${author.name || 'A teammate'}</strong> mentioned you in <strong>${room.name}</strong>:</p>
               <p>${String(message.text || '').slice(0, 500)}</p>
               ${emailCtaButton(link, 'Open Crew Chat')}`
            ),
          });
          doc.emailSentAt = new Date();
          await doc.save();
        } catch (err) {
          console.error('[chat] mention email failed:', err.message);
        }
      }
    }
  }
  return created;
}

async function notifyRoomMessage({ room, message, author, memberIds, onlineUserIds = new Set(), mutedUserIds = [] }) {
  const muted = new Set((mutedUserIds || []).map(String));
  const authorId = String(author._id || author.id || author.userId);
  const link = `${getFrontendBaseUrl()}/crew-chat?room=${room._id || room.id}`;
  const created = [];

  for (const recipientId of memberIds) {
    if (recipientId === authorId || muted.has(recipientId) || onlineUserIds.has(recipientId)) continue;
    const dedupeKey = `chat_msg:${message.id || message._id}:${recipientId}`;
    const existing = await Notification.findOne({ dedupeKey, recipientUserId: recipientId }).lean();
    if (existing) continue;
    const doc = await Notification.create({
      type: 'chat_message',
      recipientUserId: recipientId,
      title: `New message in ${room.name}`,
      body: `${author.name || 'Someone'}: ${String(message.text || '').slice(0, 120)}`,
      link,
      metadata: { roomId: String(room._id || room.id), messageId: String(message.id || message._id) },
      dedupeKey,
    });
    created.push(doc);
  }
  return created;
}

async function notifyDmMessage({ room, message, author, recipientIds, onlineUserIds = new Set() }) {
  if (!room || room.type !== 'dm') return [];
  const authorId = String(author._id || author.id || author.userId);
  const recipients = [...new Set((recipientIds || []).map(String))].filter((id) => id && id !== authorId);
  const created = [];
  const roomId = String(room._id || room.id);
  const senderName = author.name || author.fullName || 'Someone';
  const link = `${getFrontendBaseUrl()}/crew-chat?dm=${authorId}`;
  const messageText = String(message.text || '');

  for (const recipientId of recipients) {
    const dedupeKey = `chat_dm:${message.id || message._id}:${recipientId}`;
    const existing = await Notification.findOne({ dedupeKey, recipientUserId: recipientId }).lean();
    if (existing) {
      created.push(existing);
      continue;
    }

    const pref = await ChatRoomPreference.findOne({ roomId, userId: recipientId }).lean();
    if (pref?.muted) continue;

    const doc = await Notification.create({
      type: 'chat_dm',
      recipientUserId: recipientId,
      title: `New message from ${senderName}`,
      body: messageText.slice(0, DM_PREVIEW_LEN),
      link,
      metadata: {
        roomId,
        messageId: String(message.id || message._id),
        authorId,
      },
      dedupeKey,
    });
    created.push(doc);

    if (!dmEmailEnabled() || onlineUserIds.has(recipientId)) continue;
    if (await wasDmEmailSentRecently(recipientId, roomId)) continue;

    const user = await AdminUser.findById(recipientId).select('email name').lean();
    const email = (user?.email || '').trim();
    if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) continue;

    try {
      const preview = messageText.slice(0, DM_EMAIL_PREVIEW_LEN);
      const truncated = messageText.length > DM_EMAIL_PREVIEW_LEN;
      await sendMail({
        to: email,
        subject: `QIPP: New message from ${senderName}`,
        html: emailTemplate(
          'Private message',
          `<p><strong>${senderName}</strong> sent you a private message:</p>
           <p>${preview}${truncated ? '…' : ''}</p>
           ${emailCtaButton(link, 'Open Crew Chat')}`
        ),
      });
      doc.emailSentAt = new Date();
      await doc.save();
    } catch (err) {
      console.error('[chat] DM email failed:', err.message);
    }
  }
  return created;
}

module.exports = {
  notifyMentions,
  notifyRoomMessage,
  notifyDmMessage,
  chatEnabled,
  dmEmailEnabled,
  DM_EMAIL_THROTTLE_MS,
};
