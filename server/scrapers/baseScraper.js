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
    timeout: 7000,
    maxRedirects: 3,
    validateStatus: status => status === 200,
    decompress: true,
  });

  return response.data;
}

function parsePrice(text) {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/\$?([\d]+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

module.exports = { fetchPage, parsePrice };
