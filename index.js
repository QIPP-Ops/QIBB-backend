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
const ptwRoutes = require('./routes/ptwRoutes');
const trendsRoutes = require('./routes/trendsRoutes');
const waterBalanceRoutes = require('./routes/waterBalanceRoutes');
const energyRoutes = require('./routes/energyRoutes');
const gtFilterRoutes = require('./routes/gtFilterRoutes');
const dailyOperationRoutes = require('./routes/dailyOperationRoutes');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(requestLogger);

// API Routes
app.use('/api/trends', trendsRoutes);
app.use('/api/environmental-reports', environmentalReportRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ptw', ptwRoutes);
app.use('/api/water-balance', waterBalanceRoutes);
app.use('/api/energy', energyRoutes);
app.use('/api/gt-filter', gtFilterRoutes);
app.use('/api/daily-operation', dailyOperationRoutes);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));
