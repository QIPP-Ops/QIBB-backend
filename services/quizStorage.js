const fs = require('fs');
const path = require('path');
const Quiz = require('../models/Quiz');

const LOCAL_ROOT = path.join(__dirname, '../data/quizzes');

function mongoHtmlKey(quizId) {
  return `mongo:${quizId}:html`;
}

function mongoPrizeKey(quizId) {
  return `mongo:${quizId}:prize`;
}

function ensureLocalDir(quizId) {
  const dir = path.join(LOCAL_ROOT, String(quizId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readLocalFile(relPath) {
  const filePath = path.join(LOCAL_ROOT, relPath);
  if (!fs.existsSync(filePath)) throw new Error('Quiz file not found');
  return fs.readFileSync(filePath);
}

async function saveQuizHtml(quizId, buffer) {
  await Quiz.updateOne(
    { _id: quizId },
    { $set: { htmlContent: buffer, htmlStorageKey: mongoHtmlKey(quizId) } }
  );
  return mongoHtmlKey(quizId);
}

async function savePrizeImage(quizId, buffer, mimeType) {
  const mime = mimeType || 'image/jpeg';
  await Quiz.updateOne(
    { _id: quizId },
    {
      $set: {
        prizeImageData: buffer,
        prizeImageMime: mime,
        prizeImageUrl: mongoPrizeKey(quizId),
      },
    }
  );
  return mongoPrizeKey(quizId);
}

async function readMongoHtml(key) {
  const match = /^mongo:([^:]+):html$/.exec(key);
  if (!match) return null;
  const quiz = await Quiz.findById(match[1]).select('htmlContent').lean();
  if (!quiz?.htmlContent?.length) return null;
  return Buffer.from(quiz.htmlContent);
}

async function readMongoPrize(key) {
  const match = /^mongo:([^:]+):prize$/.exec(key);
  if (!match) return null;
  const quiz = await Quiz.findById(match[1]).select('prizeImageData').lean();
  if (!quiz?.prizeImageData?.length) return null;
  return Buffer.from(quiz.prizeImageData);
}

async function readStorage(key) {
  if (!key) throw new Error('Missing storage key');

  if (key.startsWith('mongo:')) {
    const buffer = await readMongoHtml(key);
    if (buffer) return buffer;
    throw new Error('Quiz file not found');
  }

  if (key.startsWith('local:')) {
    const rel = key.slice(6);
    const buffer = readLocalFile(rel);
    const quizId = rel.split('/')[0];
    if (quizId) {
      await Quiz.updateOne(
        { _id: quizId, htmlContent: { $in: [null, Buffer.alloc(0)] } },
        { $set: { htmlContent: buffer, htmlStorageKey: mongoHtmlKey(quizId) } }
      ).catch(() => {});
    }
    return buffer;
  }

  throw new Error('Unknown storage key');
}

async function readPrizeImage(key) {
  if (!key) throw new Error('Missing storage key');

  if (key.startsWith('mongo:')) {
    const buffer = await readMongoPrize(key);
    if (buffer) return buffer;
    throw new Error('Prize image not found');
  }

  if (key.startsWith('local:')) {
    return readStorage(key);
  }

  throw new Error('Unknown storage key');
}

async function deleteQuizFiles(quizId) {
  await Quiz.updateOne(
    { _id: quizId },
    { $unset: { htmlContent: '', prizeImageData: '', prizeImageMime: '' } }
  );
  const localDir = path.join(LOCAL_ROOT, String(quizId));
  if (fs.existsSync(localDir)) {
    fs.rmSync(localDir, { recursive: true, force: true });
  }
}

/** One-time migration: copy any legacy local quiz files into MongoDB. */
async function migrateLocalQuizzesToMongo() {
  if (!fs.existsSync(LOCAL_ROOT)) return { migrated: 0 };

  let migrated = 0;
  const entries = fs.readdirSync(LOCAL_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const quizId = entry.name;
    const htmlPath = path.join(LOCAL_ROOT, quizId, 'content.html');
    if (!fs.existsSync(htmlPath)) continue;

    const quiz = await Quiz.findById(quizId).select('htmlContent htmlStorageKey').lean();
    if (!quiz || quiz.htmlContent?.length) continue;

    const buffer = fs.readFileSync(htmlPath);
    await Quiz.updateOne(
      { _id: quizId },
      { $set: { htmlContent: buffer, htmlStorageKey: mongoHtmlKey(quizId) } }
    );
    migrated += 1;

    const prizeDir = path.join(LOCAL_ROOT, quizId);
    for (const ext of ['jpg', 'png', 'webp', 'gif']) {
      const prizePath = path.join(prizeDir, `prize.${ext}`);
      if (!fs.existsSync(prizePath)) continue;
      const mime =
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      await Quiz.updateOne(
        { _id: quizId },
        {
          $set: {
            prizeImageData: fs.readFileSync(prizePath),
            prizeImageMime: mime,
            prizeImageUrl: mongoPrizeKey(quizId),
          },
        }
      );
      break;
    }
  }

  return { migrated };
}

module.exports = {
  saveQuizHtml,
  savePrizeImage,
  readStorage,
  readPrizeImage,
  deleteQuizFiles,
  migrateLocalQuizzesToMongo,
  mongoHtmlKey,
  mongoPrizeKey,
};
