const fs = require('fs');
const path = require('path');

const LOCAL_ROOT = path.join(__dirname, '../data/quizzes');

function ensureLocalDir(quizId) {
  const dir = path.join(LOCAL_ROOT, String(quizId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function saveQuizHtml(quizId, buffer) {
  const dir = ensureLocalDir(quizId);
  const filePath = path.join(dir, 'content.html');
  fs.writeFileSync(filePath, buffer);
  return `local:${quizId}/content.html`;
}

async function savePrizeImage(quizId, buffer, mimeType) {
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : 'jpg';
  const dir = ensureLocalDir(quizId);
  const filePath = path.join(dir, `prize.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return `local:${quizId}/prize.${ext}`;
}

async function readStorage(key) {
  if (!key) throw new Error('Missing storage key');
  if (key.startsWith('local:')) {
    const rel = key.slice(6);
    const filePath = path.join(LOCAL_ROOT, rel);
    if (!fs.existsSync(filePath)) throw new Error('Quiz file not found');
    return fs.readFileSync(filePath);
  }
  throw new Error('Unknown storage key');
}

async function deleteQuizFiles(quizId) {
  const localDir = path.join(LOCAL_ROOT, String(quizId));
  if (fs.existsSync(localDir)) {
    fs.rmSync(localDir, { recursive: true, force: true });
  }
}

/** Serve prize image bytes with mime for authenticated routes. */
async function readPrizeImage(key) {
  return readStorage(key);
}

module.exports = {
  saveQuizHtml,
  savePrizeImage,
  readStorage,
  readPrizeImage,
  deleteQuizFiles,
};
