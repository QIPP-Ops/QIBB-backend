/** Keys for customizable portal hero / dimmed backdrop sections. */
const PORTAL_BACKGROUND_SECTION_KEYS = [
  'safety-observations',
  'training-hub',
  'crew-chat-navbar',
  'crew-chat-sidebar',
  'timesheet-navbar',
  'operation-team-card',
  'trainings',
  'management',
  'admin',
  'ptw',
  'personnel',
  'crew-chat',
  'leave',
  'maintenance',
  'settings',
  'dashboard',
  'login',
];

const PORTAL_BACKGROUND_FIT_VALUES = new Set(['cover', 'contain', 'fill', 'none']);

const PORTAL_BACKGROUND_SECTION_LABELS = {
  'safety-observations': 'Safety Observations',
  'training-hub': 'Training Hub',
  'crew-chat-navbar': 'Crew Chat navbar',
  'crew-chat-sidebar': 'Crew Chat sidebar (crew list)',
  'timesheet-navbar': 'Timesheet navbar',
  'operation-team-card': 'Operation Team card',
  trainings: 'Trainings route navbar',
  management: 'Management navbar',
  admin: 'Admin portal navbar',
  ptw: 'PTW navbar',
  personnel: 'Personnel navbar',
  'crew-chat': 'Crew Chat route navbar',
  leave: 'Leave / timesheet route navbar',
  maintenance: 'Maintenance navbar',
  settings: 'Settings navbar',
  dashboard: 'Dashboard hero',
  login: 'Login page backdrop',
};

function isValidPortalBackgroundSectionKey(key) {
  return PORTAL_BACKGROUND_SECTION_KEYS.includes(String(key || '').trim());
}

function isValidObjectFit(value) {
  return PORTAL_BACKGROUND_FIT_VALUES.has(String(value || '').trim());
}

function isAllowedBackgroundImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('/hero-image')) return true;
  return false;
}

function normalizeStyleFields(raw) {
  const style = {};
  if (raw && typeof raw === 'object') {
    if (isValidObjectFit(raw.objectFit)) style.objectFit = String(raw.objectFit).trim();
    if (raw.objectPosition && String(raw.objectPosition).trim()) {
      style.objectPosition = String(raw.objectPosition).trim().slice(0, 120);
    }
    if (raw.backgroundSize && String(raw.backgroundSize).trim()) {
      style.backgroundSize = String(raw.backgroundSize).trim().slice(0, 120);
    }
    if (raw.backgroundPosition && String(raw.backgroundPosition).trim()) {
      style.backgroundPosition = String(raw.backgroundPosition).trim().slice(0, 120);
    }
  }
  return style;
}

function normalizeBackgroundEntry(raw) {
  if (typeof raw === 'string') {
    const imageUrl = raw.trim();
    if (!isAllowedBackgroundImageUrl(imageUrl)) return null;
    return { imageUrl };
  }
  if (!raw || typeof raw !== 'object') return null;
  const imageUrl = String(raw.imageUrl || raw.url || '').trim();
  if (!isAllowedBackgroundImageUrl(imageUrl)) return null;
  return {
    imageUrl,
    ...normalizeStyleFields(raw),
  };
}

module.exports = {
  PORTAL_BACKGROUND_SECTION_KEYS,
  PORTAL_BACKGROUND_SECTION_LABELS,
  PORTAL_BACKGROUND_FIT_VALUES,
  isValidPortalBackgroundSectionKey,
  isValidObjectFit,
  isAllowedBackgroundImageUrl,
  normalizeBackgroundEntry,
  normalizeStyleFields,
};
