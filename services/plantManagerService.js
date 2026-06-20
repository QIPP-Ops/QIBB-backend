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
  const role = normalizePersonName(user.role);
  if (role.includes('plant manager') || role.includes('operations manager')) return true;
  return plantManagerNameScore(user) >= 3;
}

async function findPlantManagerUser() {
  const candidates = await AdminUser.find({
    $or: [
      { role: /plant manager/i },
      { role: /operations manager/i },
      { name: /bandar/i },
      { fullName: /bandar/i },
    ],
  })
    .select('-passwordHash')
    .lean();

  const scored = candidates
    .map((user) => ({ user, score: plantManagerNameScore(user) }))
    .filter((row) => row.score >= 3 || /plant manager/i.test(row.user.role || ''))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.user || null;
}

module.exports = {
  isPlantManagerUser,
  findPlantManagerUser,
  plantManagerNameScore,
};
