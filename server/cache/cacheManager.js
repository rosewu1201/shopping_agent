const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const config = require('../config');

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
  const entry = cache[key];
  if (!entry) return [];

  const platformData = entry.platforms && entry.platforms[platform];
  if (!platformData || !platformData.listings || platformData.listings.length === 0) return [];

  // Check staleness: reject if older than 2x max age
  const age = Date.now() - (platformData.scrapedAt || entry.timestamp || 0);
  if (age > config.CACHE_MAX_AGE_MS * 2) {
    log('CACHE', `Stale cache for "${query}" / ${platform} (${Math.round(age / 3600000)}h old)`);
    return [];
  }

  log('CACHE', `Cache hit for "${query}" / ${platform}: ${platformData.listings.length} listings`);
  return platformData.listings;
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
