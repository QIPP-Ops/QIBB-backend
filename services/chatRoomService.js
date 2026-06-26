const ChatRoom = require('../models/ChatRoom');
const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');

const DEFAULT_CREW_SLUGS = ['A', 'B', 'C', 'D', 'General'];

function buildDmKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':');
}

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'room';
}

async function getAvailableCrews() {
  const config = await AdminConfig.findOne().lean();
  const crews = config?.availableCrews?.length ? config.availableCrews : DEFAULT_CREW_SLUGS;
  return [...new Set(crews.map((c) => String(c).trim()).filter(Boolean))];
}

async function ensureDefaultCrewRooms() {
  const crews = await getAvailableCrews();
  const created = [];
  for (const crew of crews) {
    const slug = slugify(crew);
    const existing = await ChatRoom.findOne({ crew, slug, type: 'crew' }).lean();
    if (!existing) {
      const doc = await ChatRoom.create({
        crew,
        name: crew === 'General' ? 'General' : `Crew ${crew}`,
        slug,
        type: 'crew',
        isDefault: true,
        postingMode: 'open',
      });
      created.push(doc);
    }
  }
  return { crews, created: created.length };
}

async function listRoomsForUser(user, access) {
  await ensureDefaultCrewRooms();
  const { canViewRoom, isCrossCrewChatViewer } = access;
  const userId = String(user.userId || user.id || user._id || '');
  const crewRooms = await ChatRoom.find({ type: { $ne: 'dm' } })
    .sort({ crew: 1, type: 1, name: 1 })
    .lean();
  const dmRooms = userId
    ? await ChatRoom.find({ type: 'dm', participants: userId }).sort({ updatedAt: -1 }).lean()
    : [];

  let visibleCrew = crewRooms;
  if (!isCrossCrewChatViewer(user)) {
    const userCrew = String(user.crew || '').trim().toLowerCase();
    visibleCrew = crewRooms.filter((room) => {
      if (canViewRoom(user, room)) return true;
      const roomCrew = String(room.crew || '').trim().toLowerCase();
      return roomCrew === userCrew || roomCrew === 'general';
    });
  }
  return [...visibleCrew, ...dmRooms];
}

async function getRoomById(roomId) {
  return ChatRoom.findById(roomId).lean();
}

async function getRoomMemberIds(room, authorId) {
  if (!room) return [];
  if (room.type === 'dm') {
    return (room.participants || [])
      .map((id) => String(id))
      .filter((id) => id && id !== String(authorId || ''));
  }
  const { getCrewRoster } = require('./chatMessageService');
  const roster = await getCrewRoster(room.crew);
  return roster.map((r) => String(r._id));
}

async function getApprovedUsersForDm(excludeUserId) {
  const exclude = String(excludeUserId || '');
  const users = await AdminUser.find({
    isApproved: true,
    isActive: { $ne: false },
    ...(exclude ? { _id: { $ne: exclude } } : {}),
  })
    .select('_id name fullName email empId crew')
    .sort({ name: 1, fullName: 1 })
    .lean();
  return users;
}

async function createOrGetDmRoom({ userId, recipientUserId }) {
  const senderId = String(userId || '');
  const recipientId = String(recipientUserId || '');
  if (!senderId || !recipientId) {
    throw Object.assign(new Error('Recipient is required.'), { status: 400 });
  }
  if (senderId === recipientId) {
    throw Object.assign(new Error('You cannot start a chat with yourself.'), { status: 400 });
  }

  const recipient = await AdminUser.findById(recipientId)
    .select('_id name fullName email isApproved isActive')
    .lean();
  if (!recipient || recipient.isApproved !== true || recipient.isActive === false) {
    throw Object.assign(new Error('Recipient is not available for private chat.'), { status: 404 });
  }

  const dmKey = buildDmKey(senderId, recipientId);
  const existing = await ChatRoom.findOne({ type: 'dm', dmKey }).lean();
  if (existing) return existing;

  const recipientName = recipient.name || recipient.fullName || recipient.email || 'User';
  const slug = `dm-${dmKey.replace(/:/g, '-')}`;
  return ChatRoom.create({
    crew: 'DM',
    name: recipientName,
    slug,
    type: 'dm',
    participants: [senderId, recipientId],
    dmKey,
    postingMode: 'open',
    createdBy: senderId,
  });
}

async function enrichDmRooms(rooms, viewerUserId) {
  const viewerId = String(viewerUserId || '');
  const dmRooms = rooms.filter((r) => r.type === 'dm');
  if (!dmRooms.length) return rooms;

  const otherIds = [
    ...new Set(
      dmRooms.flatMap((room) =>
        (room.participants || [])
          .map((id) => String(id))
          .filter((id) => id && id !== viewerId)
      )
    ),
  ];
  const others = otherIds.length
    ? await AdminUser.find({ _id: { $in: otherIds } })
        .select('_id name fullName email crew')
        .lean()
    : [];
  const otherMap = Object.fromEntries(others.map((u) => [String(u._id), u]));

  return rooms.map((room) => {
    if (room.type !== 'dm') return room;
    const otherId = (room.participants || [])
      .map((id) => String(id))
      .find((id) => id !== viewerId);
    const other = otherId ? otherMap[otherId] : null;
    return {
      ...room,
      otherParticipant: other
        ? {
            id: String(other._id),
            name: other.name || other.fullName || other.email,
            email: other.email,
            crew: other.crew,
          }
        : null,
      name: other ? other.name || other.fullName || other.email : room.name,
    };
  });
}

async function createTopicRoom({ crew, name, parentRoomId, createdBy }) {
  const parent = await ChatRoom.findById(parentRoomId).lean();
  if (!parent || parent.type !== 'crew') {
    throw Object.assign(new Error('Parent crew room not found.'), { status: 400 });
  }
  const slug = `${parent.slug}-${slugify(name)}`;
  const existing = await ChatRoom.findOne({ crew, slug }).lean();
  if (existing) {
    throw Object.assign(new Error('A topic with this name already exists.'), { status: 409 });
  }
  return ChatRoom.create({
    crew,
    name: String(name).trim(),
    slug,
    type: 'topic',
    parentRoomId,
    createdBy,
    postingMode: 'open',
  });
}

async function updateRoomSettings(roomId, patch) {
  const room = await ChatRoom.findById(roomId);
  if (!room) return null;
  if (patch.postingMode) room.postingMode = patch.postingMode;
  if (Array.isArray(patch.restrictedPosters)) {
    room.restrictedPosters = patch.restrictedPosters;
  }
  if (Array.isArray(patch.mutedUsers)) {
    room.mutedUsers = patch.mutedUsers;
  }
  if (patch.name) room.name = String(patch.name).trim();
  await room.save();
  return room.toObject();
}

function serializeRoom(room) {
  if (!room) return null;
  return {
    id: String(room._id),
    crew: room.crew,
    name: room.name,
    slug: room.slug,
    type: room.type,
    parentRoomId: room.parentRoomId ? String(room.parentRoomId) : null,
    participants: (room.participants || []).map(String),
    otherParticipant: room.otherParticipant || null,
    postingMode: room.postingMode,
    restrictedPosters: (room.restrictedPosters || []).map(String),
    mutedUsers: (room.mutedUsers || []).map(String),
    isDefault: Boolean(room.isDefault),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

module.exports = {
  slugify,
  buildDmKey,
  ensureDefaultCrewRooms,
  listRoomsForUser,
  getRoomById,
  getRoomMemberIds,
  getApprovedUsersForDm,
  createOrGetDmRoom,
  enrichDmRooms,
  createTopicRoom,
  updateRoomSettings,
  serializeRoom,
  DEFAULT_CREW_SLUGS,
};
