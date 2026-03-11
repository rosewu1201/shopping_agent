const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initCronJobs } = require('./cron/cronJobs');
const { log } = require('./utils/logger');

const app = express();

app.use(cors());
app.use(express.json()); // Parse JSON bodies for auth routes

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, '../server-public')));

// API routes
app.use('/api/search', require('./routes/search'));
app.use('/api/price-history', require('./routes/priceHistory'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/enrich', require('./routes/enrich'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../server-public/index.html'));
});

app.listen(config.PORT, () => {
  log('SERVER', `Barbie Collector Hub running on port ${config.PORT}`);
  log('SERVER', `Frontend: http://localhost:${config.PORT}`);
  initCronJobs();
});
