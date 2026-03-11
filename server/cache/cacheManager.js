const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const config = require('../config');
const { expandQuery } = require('../utils/smartSearch');

const CACHE_FILE = path.join(__dirname, 'cachedData.json');
const PRICE_HISTORY_FILE = path.join(__dirname, 'priceHistory.json');

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    log('CACHE', `Failed to load ${path.basename(filePath)}: ${e.message}`);
    return {};
  }
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    log('CACHE', `Failed to save ${path.basename(filePath)}: ${e.message}`);
  }
}

function normalizeQuery(q) {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ─── CACHED SCRAPE RESULTS ───

function getCachedResults(query, platform) {
  const cache = loadJSON(CACHE_FILE);
  const key = normalizeQuery(query);

  // Gather listings from ALL matching cache keys (exact + fuzzy)
  let allListings = [];
  const seenUrls = new Set();

  // Helper to add listings from a cache entry
  function addFromEntry(entry) {
    const pd = entry.platforms && entry.platforms[platform];
    if (!pd || !pd.listings || pd.listings.length === 0) return;
    const age = Date.now() - (pd.scrapedAt || entry.timestamp || 0);
    if (age > config.CACHE_MAX_AGE_MS * 2) return;
    for (const listing of pd.listings) {
      if (!seenUrls.has(listing.url)) {
        allListings.push(listing);
        seenUrls.add(listing.url);
      }
    }
  }

  // 1. Exact match
  if (cache[key]) addFromEntry(cache[key]);

  // 2. Fuzzy matches: find cache keys that contain the query words.
  //    Requires ALL original meaningful query words to be present in the cache key.
  //    Uses exact word boundary matching to prevent false positives like
  //    "native spirit" matching "american stories" via synonym "american".
  const queryData = expandQuery(query);
  const origWords = queryData.originalWords.filter(w => w.length > 2);

  if (origWords.length > 0) {
    for (const cacheKey of Object.keys(cache)) {
      if (cacheKey === key) continue;

      // Check if ALL original words appear in the cache key (as substrings)
      const allOrigPresent = origWords.every(w => {
        // Check direct presence or depluralized
        if (cacheKey.includes(w)) return true;
        if (w.endsWith('s') && w.length > 3 && cacheKey.includes(w.slice(0, -1))) return true;
        // Check if a depluralized cache word matches
        const cacheWords = cacheKey.split(/\s+/);
        return cacheWords.some(cw => {
          if (cw === w) return true;
          if (cw.endsWith('s') && cw.length > 3 && cw.slice(0, -1) === w) return true;
          if (w.endsWith('s') && w.length > 3 && w.slice(0, -1) === cw) return true;
          return false;
        });
      });

      if (allOrigPresent) {
        addFromEntry(cache[cacheKey]);
      }
      // Also accept if the cache key contains the full query as a substring
      else if (key.length > 3 && cacheKey.includes(key)) {
        addFromEntry(cache[cacheKey]);
      }
    }
  }

  if (allListings.length > 0) {
    log('CACHE', `Cache hit for "${query}" / ${platform}: ${allListings.length} listings`);
  }
  return allListings;
}

function updateCache(query, platform, listings) {
  const cache = loadJSON(CACHE_FILE);
  const key = normalizeQuery(query);

  if (!cache[key]) {
    cache[key] = { timestamp: Date.now(), platforms: {} };
  }

  cache[key].platforms[platform] = {
    listings,
    scrapedAt: Date.now(),
  };
  cache[key].timestamp = Date.now();

  saveJSON(CACHE_FILE, cache);
  log('CACHE', `Updated cache for "${query}" / ${platform}: ${listings.length} listings`);
}

// ─── PRICE HISTORY ───

function recordPriceHistory(title, platform, price) {
  const history = loadJSON(PRICE_HISTORY_FILE);
  const key = title.toLowerCase().trim();

  if (!history[key]) history[key] = [];

  // Only record if price changed or >24h since last entry for this platform
  const platformEntries = history[key].filter(e => e.platform === platform);
  const lastEntry = platformEntries.length > 0 ? platformEntries[platformEntries.length - 1] : null;
  const now = Date.now();

  if (lastEntry && lastEntry.price === price && (now - lastEntry.timestamp) < 24 * 60 * 60 * 1000) {
    return; // Skip duplicate within 24h
  }

  history[key].push({ platform, price, timestamp: now });

  // Keep max 100 entries per product
  if (history[key].length > 100) {
    history[key] = history[key].slice(-100);
  }

  saveJSON(PRICE_HISTORY_FILE, history);
}

function getPriceHistory(title) {
  const history = loadJSON(PRICE_HISTORY_FILE);
  const key = title.toLowerCase().trim();
  return history[key] || [];
}

module.exports = {
  getCachedResults,
  updateCache,
  recordPriceHistory,
  getPriceHistory,
  normalizeQuery,
};
