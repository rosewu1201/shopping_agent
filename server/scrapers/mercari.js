const { log } = require('../utils/logger');

// Mercari is JS-rendered (SPA). Cannot be scraped with cheerio+axios.
// Always returns empty, triggering the cache/static fallback chain.
async function search(query) {
  log('SCRAPE', `Mercari: stub — JS-rendered, using cache/static fallback for "${query}"`);
  return [];
}

module.exports = { search };
