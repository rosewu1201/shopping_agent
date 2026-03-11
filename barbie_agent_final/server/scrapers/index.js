const ebay = require('./ebay');
const walmart = require('./walmart');
const amazon = require('./amazon');
const mercari = require('./mercari');
const { getCachedResults } = require('../cache/cacheManager');
const { log } = require('../utils/logger');
const config = require('../config');
const { expandQuery, scoreMatch, fuzzyMatch } = require('../utils/smartSearch');
const { filterListings, deduplicateListings } = require('../utils/listingValidator');

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

// Platforms that have no live scraper (data comes from cache or static)
const STATIC_ONLY_PLATFORMS = ['target', 'mattel', 'etsy', 'poshmark'];

// All platform keys
const ALL_PLATFORMS = Object.keys(PLATFORM_NAMES);

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

  // Phase 2: Apply 2-tier fallback for scraped platforms (live → cache)
  // We no longer mix in static barbieProducts data — those have fake/search URLs.
  // Only real scraped data (live or cached) is shown as product cards.
  for (const result of liveResults) {
    const { key, listings, source, error } = result;

    if (listings && listings.length > 0) {
      platformResults[key] = { listings, source: 'live', error: null };
    } else {
      // Fallback: Cached scraped data (real product URLs + images)
      const cached = getCachedResults(query, key);
      if (cached.length > 0) {
        platformResults[key] = {
          listings: cached.map(l => ({ ...l, cached: true })),
          source: 'cache',
          error: error || null,
        };
      } else {
        platformResults[key] = {
          listings: [],
          source: 'empty',
          error: error || null,
        };
      }
    }
  }

  // Phase 3: Static-only platforms use cache only (no fake static fallback)
  for (const key of STATIC_ONLY_PLATFORMS) {
    const cached = getCachedResults(query, key);
    if (cached.length > 0) {
      platformResults[key] = {
        listings: cached.map(l => ({ ...l, cached: true })),
        source: 'cache',
        error: null,
      };
    } else {
      platformResults[key] = {
        listings: [],
        source: 'empty',
        error: null,
      };
    }
  }

  // Phase 4: Merge all listings and deduplicate across platforms
  let allListings = [];
  let cachedCount = 0;

  const platformSummaries = ALL_PLATFORMS.map(key => {
    const result = platformResults[key] || { listings: [], source: 'empty', error: null };
    allListings.push(...result.listings);
    if (result.source === 'cache') {
      cachedCount += result.listings.length;
    }
    return {
      platform: key,
      source: result.source,
      count: result.listings.length,
      listings: result.listings,
      error: result.error || null,
    };
  });

  // Validate and deduplicate merged listings
  allListings = filterListings(allListings, 'merged');
  allListings = deduplicateListings(allListings);

  // Phase 5: Score and sort
  allListings = scoreAndSort(allListings, query, sort);

  const elapsed = Date.now() - startTime;

  return {
    listings: allListings,
    totalListings: allListings.length,
    activePlatforms: platformSummaries.filter(p => p.count > 0).length,
    cachedCount,
    elapsed: elapsed + 'ms',
    platforms: platformSummaries,
    _platformResults: platformResults,
  };
}

function scoreAndSort(listings, query, sort) {
  const queryData = expandQuery(query);
  const { originalWords, expandedWords } = queryData;

  if (originalWords.length > 0) {
    listings.forEach(l => {
      const title = l.title || '';
      l._matchScore = scoreMatch(title, [], queryData);
    });

    // Filter: require meaningful relevance (all/most query words must match)
    listings = listings.filter(l => l._matchScore >= 1.5);
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
