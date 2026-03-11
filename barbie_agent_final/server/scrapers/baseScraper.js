const axios = require('axios');
const { getRandomUserAgent } = require('../utils/userAgents');
const { checkRateLimit } = require('../utils/rateLimiter');
const { log } = require('../utils/logger');

async function fetchPage(url, platform) {
  if (!checkRateLimit(platform)) {
    throw new Error(`Rate limited: ${platform}`);
  }

  log('SCRAPE', `Fetching ${platform}: ${url.substring(0, 80)}...`);

  const response = await axios.get(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://www.google.com/',
    },
    timeout: 10000,
    maxRedirects: 5,
    validateStatus: status => status >= 200 && status < 300,
    decompress: true,
  });

  return response.data;
}

function parsePrice(text) {
  if (!text) return null;
  // Handle price ranges like "$10.00 to $50.00" — take the first price
  const match = text.replace(/,/g, '').match(/\$?([\d]+\.?\d{0,2})/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (isNaN(val) || val < 0) return null;
  return val;
}

module.exports = { fetchPage, parsePrice };
