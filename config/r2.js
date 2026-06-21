function getR2Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = String(process.env.R2_BUCKET_NAME || 'qipp-chats').trim();
  const publicUrl = String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const maxFileMb = parseInt(process.env.CHAT_MAX_FILE_MB || '25', 10);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
    maxFileBytes: Math.max(1, maxFileMb) * 1024 * 1024,
    endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '',
    configured: Boolean(accountId && accessKeyId && secretAccessKey && bucketName),
  };
}

function isR2Configured() {
  return getR2Config().configured;
}

module.exports = { getR2Config, isR2Configured };
