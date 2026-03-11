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

    // Build response with source metadata for each listing
    const listings = result.listings.map(l => ({
      ...l,
      // Ensure isSearchLink flag passes through
      isSearchLink: l.isSearchLink || false,
    }));

    // Platform search URL builders for "Search on X" links when no real data
    const PLATFORM_SEARCH_URLS = {
      ebay:     q => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=238`,
      amazon:   q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=toys-and-games`,
      walmart:  q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}&catId=4171_4187`,
      target:   q => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}&category=5xtd6`,
      mattel:   q => `https://creations.mattel.com/search#q=${encodeURIComponent(q)}&type=product`,
      etsy:     q => `https://www.etsy.com/search?q=${encodeURIComponent(q)}`,
      mercari:  q => `https://www.mercari.com/search/?keyword=${encodeURIComponent(q)}`,
      poshmark: q => `https://poshmark.com/search?query=${encodeURIComponent(q)}&type=listings`,
    };

    // Platform summaries with source info and search links for empty platforms
    const platforms = result.platforms.map(p => ({
      platform: p.platform,
      count: p.count,
      source: p.source, // 'live', 'cache', 'empty'
      error: p.error,
      searchUrl: p.count === 0 && PLATFORM_SEARCH_URLS[p.platform]
        ? PLATFORM_SEARCH_URLS[p.platform](query)
        : null,
    }));

    const response = {
      listings,
      totalListings: listings.length,
      activePlatforms: result.activePlatforms,
      cachedCount: result.cachedCount,
      elapsed: result.elapsed,
      platforms,
    };

    log('API', `Search complete: ${listings.length} listings in ${result.elapsed}`);
    res.json(response);
  } catch (err) {
    log('API', `Search error: ${err.message}`);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

module.exports = router;
