require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;



// Middleware
const requestLogger = require('./middleware/requestLogger');

// Routers
const environmentalReportRoutes = require('./routes/environmentalReportRoutes');
const rosterRoutes = require('./routes/rosterRoutes');
const kpiRoutes = require('./routes/kpiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const safetyRoutes = require('./routes/safetyRoutes');
const roReportRoutes = require('./routes/roReportRoutes');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(requestLogger);

// API Routes
app.use('/api/environmental-reports', environmentalReportRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/ro-reports', roReportRoutes);


// Database Connection
const connectDB = require('./config/db');
connectDB();

// Health Check Endpoints
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    message: 'QIPP Backend Operational',
    timestamp: new Date() 
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
});
