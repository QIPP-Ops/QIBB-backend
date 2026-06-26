const AdminUser = require('../models/AdminUser');

function normalizePersonName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function plantManagerNameScore(user) {
  const name = normalizePersonName(user?.name);
  const full = normalizePersonName(user?.fullName);
  const blob = `${name} ${full}`.trim();
  let score = 0;
  if (blob.includes('bandar')) score += 2;
  if (blob.includes('aldogaish') || blob.includes('aldogais')) score += 3;
  return score;
}

function isPlantManagerUser(user) {
  if (!user) return false;
  if (user.isPlantManager === true) return true;
  const role = normalizePersonName(user.role);
  if (role.includes('plant manager') || role.includes('operations manager')) return true;
  const blob = `${user.name || ''} ${user.fullName || ''}`.toLowerCase();
  if (blob.includes('bandar') && (blob.includes('aldogaish') || blob.includes('aldogais'))) return true;
  return false;
}

/** JWT / request user shape — same rules as {@link isPlantManagerUser}. */
function isPlantManagerFromToken(user) {
  return isPlantManagerUser(user);
}

async function findPlantManagerUser() {
  const flagged = await AdminUser.findOne({ isPlantManager: true })
    .select('-passwordHash')
    .lean();
  if (flagged) return flagged;

  return AdminUser.findOne({
    $or: [{ role: /plant manager/i }, { role: /operations manager/i }],
  })
    .select('-passwordHash')
    .lean();
}

module.exports = {
  isPlantManagerUser,
  isPlantManagerFromToken,
  findPlantManagerUser,
  plantManagerNameScore,
};
