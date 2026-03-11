const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { searchAllPlatforms } = require('../scrapers/index');
const { scrapeAllPlatforms: firecrawlScrapeAll } = require('../scrapers/firecrawlScraper');
const { updateCache, recordPriceHistory } = require('../cache/cacheManager');
const { filterListings } = require('../utils/listingValidator');
const popularQueries = require('./popularQueries');
const { log } = require('../utils/logger');
const config = require('../config');

const BATCH_STATE_FILE = path.join(__dirname, '../cache/cronBatchState.json');

// Platforms that need Firecrawl enrichment (no live scraper or JS-rendered)
const FIRECRAWL_PLATFORMS = ['target', 'mattel', 'etsy', 'poshmark', 'mercari'];

function loadBatchState() {
  try {
    if (fs.existsSync(BATCH_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(BATCH_STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { batchIndex: 0, lastRun: null, totalRuns: 0 };
}

function saveBatchState(state) {
  try {
    fs.writeFileSync(BATCH_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log('CRON', `Failed to save batch state: ${e.message}`);
  }
}

function initCronJobs() {
  const batchSize = config.CRON_BATCH_SIZE || 40;
  const totalQueries = popularQueries.length;
  const totalBatches = Math.ceil(totalQueries / batchSize);

  cron.schedule(config.CRON_SCHEDULE, async () => {
    const state = loadBatchState();
    const batchIndex = state.batchIndex % totalBatches;
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, totalQueries);
    const batch = popularQueries.slice(start, end);

    log('CRON', `=== Batch ${batchIndex + 1}/${totalBatches}: queries ${start + 1}-${end} of ${totalQueries} ===`);

    let liveSuccessCount = 0;
    let firecrawlSuccessCount = 0;
    let totalListingsFound = 0;

    for (const query of batch) {
      try {
        // Phase 1: Run live scrapers (eBay, Walmart, Amazon, Mercari stub)
        log('CRON', `[Live] Scraping: "${query}"`);
        const result = await searchAllPlatforms(query, 'best');

        if (result._platformResults) {
          for (const [platform, pResult] of Object.entries(result._platformResults)) {
            if (pResult.source === 'live' && pResult.listings.length > 0) {
              updateCache(query, platform, pResult.listings);
              totalListingsFound += pResult.listings.length;
              pResult.listings.forEach(l => {
                recordPriceHistory(l.title, l.platform, l.price);
              });
              liveSuccessCount++;
            }
          }
        }

        // Phase 2: Firecrawl enrichment for platforms without live scrapers
        if (config.FIRECRAWL_API_KEY) {
          const platformsToEnrich = [];
          for (const platform of FIRECRAWL_PLATFORMS) {
            const pResult = result._platformResults?.[platform];
            if (!pResult || pResult.source === 'static' || pResult.source === 'empty') {
              platformsToEnrich.push(platform);
            }
          }

          if (platformsToEnrich.length > 0) {
            log('CRON', `[Firecrawl] Enriching ${platformsToEnrich.length} platforms: ${platformsToEnrich.join(', ')}`);
            try {
              const firecrawlResults = await firecrawlScrapeAll(query, {
                platforms: platformsToEnrich,
                limit: 6,
              });

              for (const [platform, listings] of Object.entries(firecrawlResults)) {
                // Validate Firecrawl results before caching
                const validated = filterListings(listings || [], `Firecrawl-${platform}`);
                if (validated.length > 0) {
                  updateCache(query, platform, validated);
                  totalListingsFound += validated.length;
                  validated.forEach(l => {
                    recordPriceHistory(l.title, l.platform, l.price);
                  });
                  firecrawlSuccessCount++;
                  log('CRON', `[Firecrawl] Cached ${validated.length} validated listings for ${platform}/"${query}"`);
                }
              }
            } catch (err) {
              log('CRON', `[Firecrawl] Enrichment failed for "${query}": ${err.message}`);
            }
          }
        }

        // Delay between queries to avoid rate limits
        const delay = config.CRON_DELAY_BETWEEN_QUERIES.min +
          Math.random() * (config.CRON_DELAY_BETWEEN_QUERIES.max - config.CRON_DELAY_BETWEEN_QUERIES.min);
        await new Promise(r => setTimeout(r, delay));
      } catch (err) {
        log('CRON', `Failed for "${query}": ${err.message}`);
      }
    }

    // Advance to next batch
    const newState = {
      batchIndex: (batchIndex + 1) % totalBatches,
      lastRun: new Date().toISOString(),
      totalRuns: (state.totalRuns || 0) + 1,
      lastBatchStats: {
        batch: batchIndex + 1,
        queriesAttempted: batch.length,
        liveSuccessCount,
        firecrawlSuccessCount,
        totalListingsFound,
      },
    };
    saveBatchState(newState);

    log('CRON', `=== Batch ${batchIndex + 1} complete: ${totalListingsFound} listings (${liveSuccessCount} live, ${firecrawlSuccessCount} firecrawl). Next: ${newState.batchIndex + 1} ===`);
  });

  log('CRON', `Cron initialized: ${config.CRON_SCHEDULE} | ${totalQueries} queries in ${totalBatches} batches of ${batchSize}`);
  if (!config.FIRECRAWL_API_KEY) {
    log('CRON', `Warning: FIRECRAWL_API_KEY not set. Only live scrapers (eBay/Walmart/Amazon) will populate cache.`);
  }
}

/**
 * Manual trigger: run Firecrawl enrichment for a specific query.
 */
async function enrichQuery(query, platforms) {
  if (!config.FIRECRAWL_API_KEY) {
    log('CRON', 'Cannot enrich: FIRECRAWL_API_KEY not set');
    return {};
  }

  const results = await firecrawlScrapeAll(query, {
    platforms: platforms || FIRECRAWL_PLATFORMS,
    limit: 8,
  });

  for (const [platform, listings] of Object.entries(results)) {
    const validated = filterListings(listings || [], `Enrich-${platform}`);
    if (validated.length > 0) {
      updateCache(query, platform, validated);
      validated.forEach(l => {
        recordPriceHistory(l.title, l.platform, l.price);
      });
    }
  }

  return results;
}

module.exports = { initCronJobs, enrichQuery };
