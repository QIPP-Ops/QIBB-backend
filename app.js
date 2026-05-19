require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const requestLogger = require('./middleware/requestLogger');

const environmentalReportRoutes = require('./routes/environmentalReportRoutes');
const rosterRoutes = require('./routes/rosterRoutes');
const rosterOpsRoutes = require('./routes/rosterOpsRoutes');
const kpiRoutes = require('./routes/kpiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const ptwRoutes = require('./routes/ptwRoutes');
const trendsRoutes = require('./routes/trendsRoutes');
const waterBalanceRoutes = require('./routes/waterBalanceRoutes');
const energyRoutes = require('./routes/energyRoutes');
const gtFilterRoutes = require('./routes/gtFilterRoutes');
const dailyOperationRoutes = require('./routes/dailyOperationRoutes');
const plantDataRoutes = require('./routes/plantDataRoutes');

const app = express();

const ALLOWED_ORIGINS = [
  'https://qippop.azurewebsites.net',
  'http://localhost:3000',
];

if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL.replace(/\/$/, ''));
}

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
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  const dbReady = require('mongoose').connection.readyState === 1;
  if (!dbReady) {
    return res.status(503).json({ status: 'not_ready', db: 'disconnected' });
  }
  res.json({ status: 'ready', db: 'connected', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/environmental-reports', environmentalReportRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/roster-ops', rosterOpsRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ptw', ptwRoutes);
app.use('/api/water-balance', waterBalanceRoutes);
app.use('/api/energy', energyRoutes);
app.use('/api/gt-filter', gtFilterRoutes);
app.use('/api/daily-operation', dailyOperationRoutes);
app.use('/api/plant-data', plantDataRoutes);

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
