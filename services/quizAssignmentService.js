const AdminUser = require('../models/AdminUser');

/** Users eligible for quiz assignment (approved portal members). */
function assignableUserFilter(extra = {}) {
  return {
    ...extra,
    isApproved: true,
    isActive: { $ne: false },
  };
}

async function resolveAssignTargets({ userIds = [], crew } = {}) {
  if (Array.isArray(userIds) && userIds.length) {
    return AdminUser.find(assignableUserFilter({ _id: { $in: userIds } }))
      .select('_id')
      .lean();
  }
  if (crew) {
    return AdminUser.find(assignableUserFilter({ crew: String(crew) }))
      .select('_id')
      .lean();
  }
  return [];
}

module.exports = {
  assignableUserFilter,
  resolveAssignTargets,
};
