const express = require('express');
const router = express.Router();
const { getPriceHistory } = require('../cache/cacheManager');

router.get('/', (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'Missing title parameter' });
  }

  const entries = getPriceHistory(title);
  res.json({ entries });
});

module.exports = router;
