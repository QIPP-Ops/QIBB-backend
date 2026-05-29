const path = require('path');
const FileMapping = require('../../models/FileMapping');

function escapeRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Glob-like pattern: * matches any substring */
function filenameMatchesPattern(filename, pattern) {
  const base = path.basename(filename);
  const p = String(pattern || '').trim();
  if (!p) return false;
  const parts = p.split('*').map(escapeRegex);
  const re = new RegExp(`^${parts.join('.*')}$`, 'i');
  return re.test(base);
}

function patternSpecificity(pattern) {
  const p = String(pattern || '');
  const stars = (p.match(/\*/g) || []).length;
  return p.length * 10 - stars * 50;
}

async function findBestMappingForFile(filename) {
  const mappings = await FileMapping.find().sort({ updatedAt: -1 }).lean();
  const hits = mappings.filter((m) => filenameMatchesPattern(filename, m.filenamePattern));
  if (!hits.length) return null;
  hits.sort((a, b) => patternSpecificity(b.filenamePattern) - patternSpecificity(a.filenamePattern));
  return hits[0];
}

function mappingCoversFile(mappings, filename) {
  return mappings.some((m) => filenameMatchesPattern(filename, m.filenamePattern));
}

module.exports = {
  filenameMatchesPattern,
  patternSpecificity,
  findBestMappingForFile,
  mappingCoversFile,
};
