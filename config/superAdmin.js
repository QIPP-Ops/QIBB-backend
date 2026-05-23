/** Designated super administrator — sole viewer of audit trails. */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'admin@acwaops.com')
  .trim()
  .toLowerCase();

module.exports = { SUPER_ADMIN_EMAIL };
