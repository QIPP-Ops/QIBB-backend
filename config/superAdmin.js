/** Designated super administrator — sole viewer of audit trails. */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'admin@acwaops.com')
  .trim()
  .toLowerCase();

/** Bander Khalid AlDogaish — default delegated super admin. */
const BANDER_SUPER_ADMIN_EMAIL = 'b.aldogaish@nomac.com';

/** Mohammad Algarni — may grant/revoke delegated super-admin access. */
const MOHAMMAD_ALGARNI_EMAILS = new Set([
  SUPER_ADMIN_EMAIL,
  'm.algarni@nomac.com',
  'm.algarni@acwapower.com',
]);

module.exports = {
  SUPER_ADMIN_EMAIL,
  BANDER_SUPER_ADMIN_EMAIL,
  MOHAMMAD_ALGARNI_EMAILS,
};
