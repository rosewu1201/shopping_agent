module.exports = {
  PORT: process.env.PORT || 8080,
  SCRAPER_TIMEOUTS: {
    ebay: 8000,
    walmart: 10000,
    amazon: 8000,
    mercari: 3000,
  },
  CACHE_MAX_AGE_MS: 2 * 24 * 60 * 60 * 1000, // 2 days
  CRON_SCHEDULE: '0 3 */2 * *', // Every 2 days at 3:00 AM
  CRON_DELAY_BETWEEN_QUERIES: { min: 5000, max: 10000 },
};
