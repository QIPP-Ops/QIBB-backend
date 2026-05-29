/** Minimal HTML validation for uploaded quiz files. */
function isValidHtml(content) {
  const s = String(content || '').trim();
  if (!s || s.length < 10) return false;
  const lower = s.toLowerCase();
  const hasHtmlMarker =
    lower.includes('<!doctype html') ||
    lower.includes('<html') ||
    lower.includes('<body') ||
    lower.includes('<head');
  if (!hasHtmlMarker) return false;
  const openTags = (s.match(/<[a-z][a-z0-9]*[\s>]/gi) || []).length;
  if (openTags < 1) return false;
  const unclosed = (s.match(/<script[^>]*>(?![\s\S]*<\/script>)/gi) || []).length;
  if (unclosed > 0 && !lower.includes('</script>')) return false;
  return true;
}

module.exports = { isValidHtml };
