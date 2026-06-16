const { getAllowedFrontendOrigins } = require('./frontendUrl');

/** Static origins always allowed (legacy Azure + production custom domain). */
const BASE_CORS_ORIGINS = [
  'https://acwaops.com',
  'https://www.acwaops.com',
  'https://qipp.live',
  'https://www.qipp.live',
  'https://qippop.azurewebsites.net',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/**
 * Comma-separated extra origins, e.g. GitHub Pages preview:
 * CORS_ORIGINS=https://qipp-ops.github.io,https://qipp-ops.github.io/QIBB-frontend
 */
function getExtraCorsOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function getAllowedCorsOrigins() {
  return [...new Set([
    ...BASE_CORS_ORIGINS,
    ...getAllowedFrontendOrigins(),
    ...getExtraCorsOrigins(),
  ])];
}

module.exports = {
  BASE_CORS_ORIGINS,
  getExtraCorsOrigins,
  getAllowedCorsOrigins,
};
