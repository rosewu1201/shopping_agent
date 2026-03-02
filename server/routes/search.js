const express = require('express');
const router = express.Router();
const { searchAllPlatforms } = require('../scrapers/index');
const { updateCache, recordPriceHistory } = require('../cache/cacheManager');
const { log } = require('../utils/logger');

router.get('/', async (req, res) => {
  const query = (req.query.q || '').trim();
  const sort = req.query.sort || 'best';

  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  log('API', `Search: "${query}" (sort: ${sort})`);

  try {
    const result = await searchAllPlatforms(query, sort);

    // Cache live results and record price history
    if (result._platformResults) {
      for (const [platform, pResult] of Object.entries(result._platformResults)) {
        if (pResult.source === 'live' && pResult.listings.length > 0) {
          updateCache(query, platform, pResult.listings);
          pResult.listings.forEach(l => {
            recordPriceHistory(l.title, l.platform, l.price);
          });
        }
      }
    }

    // Remove internal field before sending
    const response = { ...result };
    delete response._platformResults;

    log('API', `Search complete: ${result.totalListings} listings in ${result.elapsed}`);
    res.json(response);
  } catch (err) {
    log('API', `Search error: ${err.message}`);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

module.exports = router;
