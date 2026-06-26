const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');

function isObjectIdString(value) {
  const s = String(value || '').trim();
  return s.length === 24 && mongoose.Types.ObjectId.isValid(s);
}

function looksLikeEmail(value) {
  return String(value || '').includes('@');
}

function displayNameForUser(user) {
  if (!user) return null;
  const name = String(user.name || '').trim();
  if (name) return name;
  const email = String(user.email || '').trim();
  return email || null;
}

async function loadUsersByIds(ids) {
  if (!ids.length) return new Map();
  const users = await AdminUser.find({ _id: { $in: ids } })
    .select('name email')
    .lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

async function loadUsersByEmails(emails) {
  if (!emails.length) return new Map();
  const users = await AdminUser.find({ email: { $in: emails } })
    .select('name email')
    .lean();
  return new Map(
    users.map((u) => [String(u.email || '').trim().toLowerCase(), u])
  );
}

async function buildLoggedByLookup(records) {
  const ids = new Set();
  const emails = new Set();

  for (const record of records) {
    const loggedBy = String(record.loggedBy || '').trim();
    const loggedByEmail = String(record.loggedByEmail || '').trim().toLowerCase();

    if (loggedBy && isObjectIdString(loggedBy)) {
      ids.add(loggedBy);
    } else if (loggedBy && looksLikeEmail(loggedBy)) {
      emails.add(loggedBy.toLowerCase());
    }

    if (loggedByEmail) {
      emails.add(loggedByEmail);
    }
  }

  const [byId, byEmail] = await Promise.all([
    loadUsersByIds([...ids]),
    loadUsersByEmails([...emails]),
  ]);

  return { byId, byEmail };
}

function resolveLoggedByDisplay(record, lookup) {
  const { byId, byEmail } = lookup;
  const loggedBy = String(record.loggedBy || '').trim();
  const loggedByEmail = String(record.loggedByEmail || '').trim().toLowerCase();

  if (!loggedBy && !loggedByEmail) {
    return '';
  }

  if (loggedBy && isObjectIdString(loggedBy)) {
    const user = byId.get(loggedBy);
    if (user) return displayNameForUser(user) || 'Unknown';

    if (loggedByEmail) {
      const emailUser = byEmail.get(loggedByEmail);
      if (emailUser) return displayNameForUser(emailUser) || loggedByEmail;
      return loggedByEmail;
    }

    return 'Unknown';
  }

  if (loggedBy && looksLikeEmail(loggedBy)) {
    const user = byEmail.get(loggedBy.toLowerCase());
    return displayNameForUser(user) || loggedBy;
  }

  if (loggedBy) {
    return loggedBy;
  }

  const user = byEmail.get(loggedByEmail);
  return displayNameForUser(user) || loggedByEmail || 'Unknown';
}

module.exports = {
  buildLoggedByLookup,
  resolveLoggedByDisplay,
  isObjectIdString,
};
