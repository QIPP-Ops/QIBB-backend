require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const requestLogger = require('./middleware/requestLogger');

const rosterRoutes = require('./routes/rosterRoutes');
const rosterOpsRoutes = require('./routes/rosterOpsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const ptwRoutes = require('./routes/ptwRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const personnelRoutes = require('./routes/personnelRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const personnelKpiRoutes = require('./routes/personnelKpiRoutes');
const kpiGoalsRoutes = require('./routes/kpiGoalsRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

const { getAllowedCorsOrigins } = require('./config/corsOrigins');

const ALLOWED_ORIGINS = getAllowedCorsOrigins();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(requestLogger);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

const { isEmailConfigured, getSmtpUser, getSmtpPassword } = require('./config/smtp');
const {
  verifyEmailConnection,
  smtpFailureHint,
  isLikelyRenderSmtpBlock,
  getSmtpTransportOptions,
  getEmailProvider,
  getFromAddress,
  isResendConfigured,
} = require('./services/emailService');
const { getFrontendBaseUrl } = require('./config/frontendUrl');
const { getMongoUri } = require('./config/database');

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/email', async (req, res) => {
  const transport = isResendConfigured() ? null : (isEmailConfigured() ? getSmtpTransportOptions() : null);
  const payload = {
    emailConfigured: isEmailConfigured(),
    emailProvider: getEmailProvider(),
    fromAddress: getFromAddress() || null,
    resendConfigured: isResendConfigured(),
    smtpConfigured: Boolean(transport),
    smtpHost: transport?.host || process.env.SMTP_HOST || null,
    smtpPort: transport?.port || parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpSecure: transport?.secure ?? (process.env.SMTP_SECURE === 'true'),
    smtpUser: getSmtpUser() || null,
    hasPassword: Boolean(getSmtpPassword()),
    connectionTimeoutMs: transport?.connectionTimeout || null,
    mongoUriSet: Boolean(getMongoUri()),
    frontendUrl: getFrontendBaseUrl(),
    onRender: process.env.RENDER === 'true',
  };

  if (process.env.RENDER === 'true' && !isResendConfigured()) {
    payload.renderSmtpNote =
      'Render free tier blocks outbound SMTP ports 25/465/587. Set RESEND_API_KEY or upgrade to a paid instance.';
  }

  if (req.query.verify === '1' && isEmailConfigured()) {
    try {
      const result = await verifyEmailConnection();
      payload.emailVerify = 'ok';
      payload.emailProvider = result.provider || getEmailProvider();
    } catch (err) {
      payload.emailVerify = 'failed';
      payload.emailVerifyError = err.message;
      payload.smtpVerify = 'failed';
      payload.smtpVerifyError = err.message;
      payload.smtpHint = isResendConfigured() ? err.message : smtpFailureHint(err);
      payload.likelyRenderSmtpBlock = !isResendConfigured() && isLikelyRenderSmtpBlock(err);
    }
  }

  const status = payload.emailVerify === 'failed' ? 503 : 200;
  res.status(status).json(payload);
});

app.get('/ready', async (_req, res) => {
  const mongoose = require('mongoose');
  const dbReady = mongoose.connection.readyState === 1;
  if (!dbReady) {
    return res.status(503).json({ status: 'not_ready', db: 'disconnected' });
  }

  const payload = {
    status: 'ready',
    db: 'connected',
    databaseName: mongoose.connection.db?.databaseName || null,
    timestamp: new Date().toISOString(),
  };

  try {
    const AdminUser = require('./models/AdminUser');
    const { filterProtectedAccounts } = require('./utils/protectedAccounts');
    const users = await AdminUser.find().select('email').lean();
    payload.adminUsersTotal = users.length;
    payload.rosterVisible = filterProtectedAccounts(users).length;
    if (payload.rosterVisible === 0) {
      payload.rosterHint =
        'QIPP.adminusers has no roster employees (only super admin). Run GitHub Action "Seed MongoDB Atlas" with MONGODB_URI (must match Render) + SMTP_USER + SMTP_PASS. Or set SEED_IF_EMPTY=1 on Render to auto-seed on startup.';
    }
  } catch {
    payload.adminUsersTotal = null;
    payload.rosterVisible = null;
  }

  res.json(payload);
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/roster-ops', rosterOpsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ptw', ptwRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/personnel', personnelRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/kpi', personnelKpiRoutes);
app.use('/api/kpi-goals', kpiGoalsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/portal-backgrounds', require('./routes/portalBackgroundRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((err, _req, res, _next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed.' });
  }
  console.error('Unhandled error:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    message: isProd ? 'Internal server error.' : (err.message || 'Internal server error.'),
  });
});

module.exports = app;
