const ebay = require('./ebay');
const walmart = require('./walmart');
const amazon = require('./amazon');
const mercari = require('./mercari');
const { getCachedResults } = require('../cache/cacheManager');
const { searchStaticData } = require('../fallback/staticData');
const { log } = require('../utils/logger');
const config = require('../config');

const PLATFORM_NAMES = {
  ebay: 'eBay', amazon: 'Amazon', walmart: 'Walmart', target: 'Target',
  mattel: 'Mattel Creations', etsy: 'Etsy', mercari: 'Mercari', poshmark: 'Poshmark',
};

const SCRAPERS = [
  { key: 'ebay',    scraper: ebay,    timeout: config.SCRAPER_TIMEOUTS.ebay },
  { key: 'walmart', scraper: walmart, timeout: config.SCRAPER_TIMEOUTS.walmart },
  { key: 'amazon',  scraper: amazon,  timeout: config.SCRAPER_TIMEOUTS.amazon },
  { key: 'mercari', scraper: mercari, timeout: config.SCRAPER_TIMEOUTS.mercari },
];

// Platforms that are only in static data (no scraper)
const STATIC_ONLY_PLATFORMS = ['target', 'mattel', 'etsy', 'poshmark'];

async function searchAllPlatforms(query, sort) {
  const startTime = Date.now();
  const platformResults = {};

  // Phase 1: Run live scrapers in parallel with per-platform timeouts
  const livePromises = SCRAPERS.map(({ key, scraper, timeout }) => {
    return Promise.race([
      scraper.search(query).then(listings => ({ key, listings, source: 'live' })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]).catch(err => ({ key, listings: [], source: 'failed', error: err.message }));
  });

  const liveResults = await Promise.all(livePromises);

  // Phase 2: Apply fallback chain for each scraped platform
  for (const result of liveResults) {
    const { key, listings, source, error } = result;

    if (listings && listings.length > 0) {
      platformResults[key] = { listings, source: 'live', error: null };
    } else {
      // Fallback 1: Cached scraped data
      const cached = getCachedResults(query, key);
      if (cached.length > 0) {
        platformResults[key] = {
          listings: cached.map(l => ({ ...l, cached: true })),
          source: 'cache',
          error: error || null,
        };
      } else {
        // Fallback 2: Static barbieProducts data
        const staticResults = searchStaticData(query, key);
        if (staticResults.length > 0) {
          platformResults[key] = {
            listings: staticResults,
            source: 'static',
            error: error || null,
            note: 'Showing pre-loaded data',
          };
        } else {
          platformResults[key] = {
            listings: [],
            source: 'empty',
            error: error || null,
            note: 'No results',
          };
        }
      }
    }
  }

  // Phase 3: Add static-only platforms (target, mattel, etsy, poshmark)
  for (const key of STATIC_ONLY_PLATFORMS) {
    const staticResults = searchStaticData(query, key);
    platformResults[key] = {
      listings: staticResults,
      source: staticResults.length > 0 ? 'static' : 'empty',
      error: null,
      note: staticResults.length === 0 ? 'No results' : null,
    };
  }

  // Phase 4: Merge all listings
  let allListings = [];
  let cachedCount = 0;

  const platformSummaries = Object.entries(PLATFORM_NAMES).map(([key]) => {
    const result = platformResults[key] || { listings: [], source: 'empty', error: null, note: 'No results' };
    allListings.push(...result.listings);
    if (result.source === 'cache' || result.source === 'static') {
      cachedCount += result.listings.length;
    }
    return {
      platform: key,
      listings: result.listings,
      note: result.note || null,
      error: result.error || null,
    };
  });

  // Phase 5: Score and sort
  allListings = scoreAndSort(allListings, query, sort);

  const elapsed = Date.now() - startTime;

  return {
    listings: allListings,
    totalListings: allListings.length,
    activePlatforms: platformSummaries.filter(p => p.listings.length > 0).length,
    cachedCount,
    elapsed: elapsed + 'ms',
    platforms: platformSummaries,
    _platformResults: platformResults, // internal: used by cron to know which were live
  };
}

function scoreAndSort(listings, query, sort) {
  const STOP = new Set(['barbie', 'doll', 'dolls', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'to', 'by', 'is', 'it', 'at', 'as', 'from', 'that', 'this', 'new']);
  const words = query.toLowerCase().replace(/[^a-z0-9\s#]/g, '').split(/\s+/).filter(w => w.length > 0 && !STOP.has(w));

  if (words.length > 0) {
    listings.forEach(l => {
      const titleLower = l.title.toLowerCase();
      l._matchScore = words.filter(w => titleLower.includes(w)).length / words.length;
    });

    // Filter: at least one meaningful keyword must match the title
    listings = listings.filter(l => l._matchScore > 0);
  }

  switch (sort) {
    case 'price-asc':
    case 'price_asc':
      listings.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
    case 'price_desc':
      listings.sort((a, b) => b.price - a.price);
      break;
    default:
      listings.sort((a, b) => b._matchScore - a._matchScore || a.price - b.price);
  }

  return listings;
}

module.exports = { searchAllPlatforms };
