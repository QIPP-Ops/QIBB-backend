const ChatRoom = require('../models/ChatRoom');
const AdminConfig = require('../models/AdminConfig');

const DEFAULT_CREW_SLUGS = ['A', 'B', 'C', 'D', 'General'];

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
  const all = await ChatRoom.find().sort({ crew: 1, type: 1, name: 1 }).lean();
  if (isCrossCrewChatViewer(user)) return all;
  const userCrew = String(user.crew || '').trim().toLowerCase();
  return all.filter((room) => {
    if (canViewRoom(user, room)) return true;
    const roomCrew = String(room.crew || '').trim().toLowerCase();
    return roomCrew === userCrew || roomCrew === 'general';
  });
}

async function getRoomById(roomId) {
  return ChatRoom.findById(roomId).lean();
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
  ensureDefaultCrewRooms,
  listRoomsForUser,
  getRoomById,
  createTopicRoom,
  updateRoomSettings,
  serializeRoom,
  DEFAULT_CREW_SLUGS,
};
