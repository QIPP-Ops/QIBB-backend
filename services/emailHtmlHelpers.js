/** Reusable HTML fragments for branded QIPP / ACWA Operations emails. */

function emailCtaButton(href, label) {
  const url = String(href || '').trim();
  const text = String(label || 'Open in QIPP').trim();
  if (!url) return '';
  return `<div class="btn-block"><a href="${url}" class="btn">${text}</a></div>`;
}

function emailCallout(html, variant = 'info') {
  const cls = variant === 'warning' ? 'callout callout-warning' : 'callout';
  return `<div class="${cls}">${html}</div>`;
}

function emailHighlightBox(content, size = 'lg') {
  const fontSize = size === 'sm' ? '22px' : '40px';
  const letterSpacing = size === 'sm' ? '0.05em' : '0.3em';
  return `<div class="highlight-box"><span style="font-size:${fontSize};letter-spacing:${letterSpacing};">${content}</span></div>`;
}

function emailInfoList(items) {
  const lis = (items || [])
    .filter(Boolean)
    .map((item) => `<li>${item}</li>`)
    .join('');
  if (!lis) return '';
  return `<ul class="info-list">${lis}</ul>`;
}

function emailSectionTitle(title) {
  return `<h3 class="section-title">${title}</h3>`;
}

function emailDetailTable(rows) {
  const trs = (rows || [])
    .filter((row) => row?.label)
    .map(
      (row) =>
        `<tr><td class="detail-label">${row.label}</td><td class="detail-value">${row.value ?? '—'}</td></tr>`
    )
    .join('');
  if (!trs) return '';
  return `<table class="detail-table" role="presentation"><tbody>${trs}</tbody></table>`;
}

function emailSignoff() {
  return '<p class="signoff">— Acwa Operations, QIPP</p>';
}

function emailMuted(text) {
  return `<p class="muted">${text}</p>`;
}

module.exports = {
  emailCtaButton,
  emailCallout,
  emailHighlightBox,
  emailInfoList,
  emailSectionTitle,
  emailDetailTable,
  emailSignoff,
  emailMuted,
};
