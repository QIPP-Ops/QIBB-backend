const fs = require('fs');
const path = require('path');

const PRESETS_PATH = path.join(__dirname, '../data/email-presets.json');
const MONTHLY_PRESET_ID = 'monthly-planned-leaves';

let cachedBundled = null;

function loadBundledEmailPresets() {
  if (cachedBundled) return cachedBundled;
  const raw = fs.readFileSync(PRESETS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('Bundled email presets file is empty or invalid');
  }
  cachedBundled = parsed;
  return cachedBundled;
}

function resetBundledEmailPresetsCache() {
  cachedBundled = null;
}

/**
 * Merge shipped defaults with Mongo overrides. Bundled presets are always present;
 * Mongo may override subject/body/name for known ids or add custom presets.
 */
function mergeEmailPresets(mongoPresets) {
  const bundled = loadBundledEmailPresets();
  const byId = new Map(bundled.map((p) => [p.id, { ...p }]));

  for (const preset of mongoPresets || []) {
    if (!preset?.id) continue;
    const id = String(preset.id).trim();
    if (!id) continue;
    if (byId.has(id)) {
      byId.set(id, {
        ...byId.get(id),
        ...preset,
        id,
      });
    } else {
      byId.set(id, {
        id,
        name: String(preset.name || '').trim(),
        subject: String(preset.subject || '').trim(),
        body: String(preset.body || '').trim(),
      });
    }
  }

  const monthlyBundled = bundled.find((p) => p.id === MONTHLY_PRESET_ID);
  if (monthlyBundled && !byId.has(MONTHLY_PRESET_ID)) {
    byId.set(MONTHLY_PRESET_ID, { ...monthlyBundled });
  }

  const ordered = [];
  const seen = new Set();
  for (const preset of bundled) {
    if (byId.has(preset.id)) {
      ordered.push(byId.get(preset.id));
      seen.add(preset.id);
    }
  }
  for (const [id, preset] of byId) {
    if (!seen.has(id)) ordered.push(preset);
  }
  return ordered;
}

function findEmailPreset(presets, presetId) {
  return (presets || []).find((p) => p.id === presetId) || null;
}

module.exports = {
  PRESETS_PATH,
  MONTHLY_PRESET_ID,
  loadBundledEmailPresets,
  resetBundledEmailPresetsCache,
  mergeEmailPresets,
  findEmailPreset,
};
