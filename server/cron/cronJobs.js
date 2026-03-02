const cron = require('node-cron');
const { searchAllPlatforms } = require('../scrapers/index');
const { updateCache, recordPriceHistory } = require('../cache/cacheManager');
const popularQueries = require('./popularQueries');
const { log } = require('../utils/logger');
const config = require('../config');

function initCronJobs() {
  cron.schedule(config.CRON_SCHEDULE, async () => {
    log('CRON', `Starting scheduled re-scrape of ${popularQueries.length} popular queries`);

    for (const query of popularQueries) {
      try {
        log('CRON', `Scraping: "${query}"`);
        const result = await searchAllPlatforms(query, 'best');

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

        // Delay between queries to avoid rate limits
        const delay = config.CRON_DELAY_BETWEEN_QUERIES.min +
          Math.random() * (config.CRON_DELAY_BETWEEN_QUERIES.max - config.CRON_DELAY_BETWEEN_QUERIES.min);
        await new Promise(r => setTimeout(r, delay));
      } catch (err) {
        log('CRON', `Failed for "${query}": ${err.message}`);
      }
    }

    log('CRON', 'Scheduled re-scrape completed');
  });

  log('CRON', `Cron initialized: re-scrape every 2 days at 3:00 AM (${config.CRON_SCHEDULE})`);
}

module.exports = { initCronJobs };
