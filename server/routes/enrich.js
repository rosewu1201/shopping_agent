const express = require('express');
const router = express.Router();
const { enrichQuery } = require('../cron/cronJobs');
const { log } = require('../utils/logger');

/**
 * POST /api/enrich
 * Trigger Firecrawl-based enrichment for a specific query.
 * Populates cache with real product data from platforms that lack live scrapers.
 *
 * Body: { query: string, platforms?: string[] }
 */
router.post('/', async (req, res) => {
  const { query, platforms } = req.body || {};

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or empty query' });
  }

  log('API', `Enrich request: "${query}" platforms: ${platforms ? platforms.join(',') : 'all'}`);

  try {
    const results = await enrichQuery(query.trim(), platforms);

    const summary = {};
    let total = 0;
    for (const [platform, listings] of Object.entries(results)) {
      summary[platform] = listings.length;
      total += listings.length;
    }

    res.json({
      query: query.trim(),
      enriched: total,
      platforms: summary,
    });
  } catch (err) {
    log('API', `Enrich error: ${err.message}`);
    res.status(500).json({ error: 'Enrichment failed', message: err.message });
  }
});

module.exports = router;
