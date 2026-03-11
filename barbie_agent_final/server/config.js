module.exports = {
  PORT: process.env.PORT || 8080,
  JWT_SECRET: process.env.JWT_SECRET || 'barbie-collector-hub-dev-secret-change-in-production',
  JWT_EXPIRY: '7d', // Token expires in 7 days
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  SCRAPER_TIMEOUTS: {
    ebay: 8000,
    walmart: 10000,
    amazon: 8000,
    mercari: 3000,
  },
  CACHE_MAX_AGE_MS: 14 * 24 * 60 * 60 * 1000, // 14 days (cache lives 2 weeks)
  CRON_SCHEDULE: '0 3 * * 1', // Every Monday at 3:00 AM (weekly)
  CRON_DELAY_BETWEEN_QUERIES: { min: 5000, max: 10000 },
  CRON_BATCH_SIZE: 40, // queries per cron run (rotates through full list)
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '', // For Target/Mattel/Etsy/Poshmark/Mercari enrichment
};
