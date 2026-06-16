const DEFAULT_FRONTEND_URL = 'https://acwaops.com/qipp';

/** Ensure https:// and no trailing slash (e.g. qipp.live → https://qipp.live) */
function normalizeFrontendUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return DEFAULT_FRONTEND_URL;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/$/, '');
}

function getFrontendBaseUrl() {
  return normalizeFrontendUrl(process.env.FRONTEND_URL);
}

function getAllowedFrontendOrigins() {
  const base = getFrontendBaseUrl();
  const origins = new Set([base]);
  try {
    const parsed = new URL(base);
    if (parsed.hostname.startsWith('www.')) {
      origins.add(`${parsed.protocol}//${parsed.hostname.slice(4)}`);
    } else {
      origins.add(`${parsed.protocol}//www.${parsed.hostname}`);
    }
  } catch {
    /* ignore */
  }
  return [...origins];
}

module.exports = {
  DEFAULT_FRONTEND_URL,
  normalizeFrontendUrl,
  getFrontendBaseUrl,
  getAllowedFrontendOrigins,
};
