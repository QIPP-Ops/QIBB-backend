const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');
const { isPlantManagerUser } = require('./plantManagerService');

function isSuperAdminEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e && e === SUPER_ADMIN_EMAIL;
}

function isSuperAdminActor(user) {
  return isSuperAdminEmail(user?.email);
}

/** Operation manager (Bandar) — cross-crew chat access; same detection as plant manager service. */
function isOperationManagerUser(user) {
  return isPlantManagerUser(user);
}

function isCrossCrewChatViewer(user) {
  if (!user) return false;
  if (isSuperAdminActor(user)) return true;
  return isOperationManagerUser(user);
}

function isCrewAdminFor(user, crew) {
  if (!user || !crew) return false;
  if (isSuperAdminActor(user)) return true;
  if (isOperationManagerUser(user)) return true;
  if (!hasPortalAdminAccess({ user })) return false;
  const userCrew = String(user.crew || '').trim();
  return userCrew && userCrew.toLowerCase() === String(crew).trim().toLowerCase();
}

function isDmParticipant(user, room) {
  if (!user || !room || room.type !== 'dm') return false;
  const userId = String(user.userId || user.id || user._id || '');
  if (!userId) return false;
  return (room.participants || []).some((id) => String(id) === userId);
}

function canViewRoom(user, room) {
  if (!user || !room) return false;
  if (room.type === 'dm') return isDmParticipant(user, room);
  if (isCrossCrewChatViewer(user)) return true;
  const userCrew = String(user.crew || '').trim().toLowerCase();
  const roomCrew = String(room.crew || '').trim().toLowerCase();
  if (room.type === 'topic' && room.parentRoomId) {
    return userCrew === roomCrew;
  }
  return userCrew === roomCrew || roomCrew === 'general';
}

function canPostInRoom(user, room, dbUser) {
  if (!canViewRoom(user, room)) return false;
  if (room.type === 'dm') return true;
  const actor = dbUser || user;
  if (room.postingMode === 'read_only') {
    return isCrewAdminFor(actor, room.crew) || isCrossCrewChatViewer(actor);
  }
  const userId = String(actor.userId || actor._id || actor.id || '');
  if (userId && Array.isArray(room.restrictedPosters)) {
    const blocked = room.restrictedPosters.some((id) => String(id) === userId);
    if (blocked) return false;
  }
  return true;
}

function canModerateRoom(user, room) {
  if (!user || !room) return false;
  if (room.type === 'dm') return false;
  if (isCrossCrewChatViewer(user)) return true;
  return isCrewAdminFor(user, room.crew);
}

function canDeleteMessage(user, message, room) {
  if (!user || !message) return false;
  const userId = String(user.userId || user.id || '');
  if (userId && String(message.authorId) === userId) return true;
  return canModerateRoom(user, room);
}

function canManageRoomSettings(user, room) {
  if (!room || room.type === 'dm') return false;
  return isCrewAdminFor(user, room?.crew);
}

function getDmRecipientIds(room, authorId) {
  if (!room || room.type !== 'dm') return [];
  const author = String(authorId || '');
  return (room.participants || [])
    .map((id) => String(id))
    .filter((id) => id && id !== author);
}

module.exports = {
  isOperationManagerUser,
  isCrossCrewChatViewer,
  isCrewAdminFor,
  isDmParticipant,
  getDmRecipientIds,
  canViewRoom,
  canPostInRoom,
  canModerateRoom,
  canDeleteMessage,
  canManageRoomSettings,
};
