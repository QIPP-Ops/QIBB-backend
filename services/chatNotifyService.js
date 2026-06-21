const Notification = require('../models/Notification');
const AdminUser = require('../models/AdminUser');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { emailCtaButton } = require('./emailHtmlHelpers');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');

function chatEnabled() {
  return process.env.CHAT_EMAIL_ON_MENTION === '1' || process.env.CHAT_EMAIL_ON_MENTION === 'true';
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

module.exports = { notifyMentions, notifyRoomMessage, chatEnabled };
