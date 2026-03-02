/**
 * Seed script: Scrapes all popular queries from eBay (most reliable) and
 * stores the results in cachedData.json so the app always has real data
 * with real product URLs, even when live scraping fails for other platforms.
 *
 * Run: node seed-cache.js
 */

const ebay = require('./scrapers/ebay');
const walmart = require('./scrapers/walmart');
const { updateCache, recordPriceHistory } = require('./cache/cacheManager');
const popularQueries = require('./cron/popularQueries');
const { log } = require('./utils/logger');

const DELAY_MS = 4000; // 4s between requests to avoid rate limits

async function seed() {
  log('SEED', `Starting cache seed for ${popularQueries.length} queries`);

  let totalListings = 0;
  let successCount = 0;

  for (let i = 0; i < popularQueries.length; i++) {
    const query = popularQueries[i];
    log('SEED', `[${i + 1}/${popularQueries.length}] Scraping: "${query}"`);

    // Try eBay
    try {
      const listings = await ebay.search(query);
      if (listings.length > 0) {
        updateCache(query, 'ebay', listings);
        listings.forEach(l => recordPriceHistory(l.title, 'ebay', l.price));
        totalListings += listings.length;
        successCount++;
        log('SEED', `  eBay: ${listings.length} listings cached`);
      } else {
        log('SEED', `  eBay: 0 results`);
      }
    } catch (e) {
      log('SEED', `  eBay error: ${e.message}`);
    }

    // Delay between queries
    if (i < popularQueries.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // Also try Walmart (less likely to succeed but worth trying)
    try {
      const listings = await walmart.search(query);
      if (listings.length > 0) {
        updateCache(query, 'walmart', listings);
        listings.forEach(l => recordPriceHistory(l.title, 'walmart', l.price));
        totalListings += listings.length;
        log('SEED', `  Walmart: ${listings.length} listings cached`);
      }
    } catch (e) {
      // Walmart usually blocked, that's fine
    }

    if (i < popularQueries.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS / 2));
    }
  }

  log('SEED', `Done! Cached ${totalListings} total listings from ${successCount}/${popularQueries.length} successful eBay queries`);
}

seed().catch(e => {
  log('SEED', `Fatal error: ${e.message}`);
  process.exit(1);
});
