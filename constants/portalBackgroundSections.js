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

const PLANT_IMAGE_PATHS = [
  '/images/plant/plant-01.jpg',
  '/images/plant/plant-02.jpg',
  '/images/plant/plant-03.jpg',
  '/images/plant/plant-04.jpg',
  '/images/plant/plant-05.jpg',
  '/images/plant/plant-06.jpg',
  '/images/plant/plant-07.jpg',
  '/images/plant/plant-08.jpg',
  '/images/plant/plant-09.jpg',
  '/images/plant/plant-10.jpg',
  '/images/plant/timesheet-navbar-v2.jpg',
  '/images/plant/operation-team-card.jpg',
  '/images/plant/safety-observations-bg.jpg',
  '/images/plant/training-hub-bg.jpg',
  '/images/plant/crew-chat-navbar-bg.jpg',
  '/images/plant/crew-chat-sidebar-bg.jpg',
];

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

function isAllowedPlantImagePath(pathValue) {
  const normalized = String(pathValue || '').trim();
  if (!normalized.startsWith('/images/plant/')) return false;
  if (normalized.includes('..')) return false;
  return PLANT_IMAGE_PATHS.includes(normalized);
}

function isAllowedBackgroundImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (isAllowedPlantImagePath(value)) return true;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  return false;
}

module.exports = {
  PORTAL_BACKGROUND_SECTION_KEYS,
  PLANT_IMAGE_PATHS,
  PORTAL_BACKGROUND_SECTION_LABELS,
  isValidPortalBackgroundSectionKey,
  isAllowedPlantImagePath,
  isAllowedBackgroundImageUrl,
};
