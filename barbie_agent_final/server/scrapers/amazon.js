const cheerio = require('cheerio');
const { fetchPage, parsePrice } = require('./baseScraper');
const { log } = require('../utils/logger');
const { filterListings, deduplicateListings } = require('../utils/listingValidator');

async function search(query) {
  const searchQuery = query.toLowerCase().includes('barbie') ? query : `barbie ${query}`;
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&i=toys-and-games`;

  let html;
  try {
    html = await fetchPage(url, 'amazon');
  } catch (err) {
    // Amazon frequently returns 503. Log and bail fast — triggers fallback chain.
    if (err.message && (err.message.includes('503') || err.message.includes('status code'))) {
      log('SCRAPE', `Amazon: blocked (${err.message}), falling back`);
      return [];
    }
    throw err;
  }

  // Detect CAPTCHA / bot block — return empty instead of throwing
  if (typeof html === 'string' &&
     (html.includes('Robot Check') || html.includes('captcha') ||
      html.includes('Type the characters') || html.includes('automated access'))) {
    log('SCRAPE', 'Amazon: CAPTCHA detected, falling back');
    return [];
  }

  const $ = cheerio.load(html);
  let listings = [];

  $('[data-asin]').each((i, el) => {
    if (i >= 20) return false;
    const asin = $(el).attr('data-asin');
    if (!asin || asin.length < 5) return;

    const $el = $(el);
    const title = $el.find('h2 .a-text-normal').text().trim()
               || $el.find('h2 a span').text().trim();

    const priceWhole = $el.find('.a-price .a-price-whole').first().text().trim().replace(/[.,]/g, '');
    const priceFraction = $el.find('.a-price .a-price-fraction').first().text().trim();
    const price = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
    if (!title || isNaN(price) || price < 3) return;

    const image = $el.find('.s-image').attr('src') || '';
    const ratingText = $el.find('.a-icon-star-small .a-icon-alt').text();
    const ratingMatch = ratingText.match(/([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    listings.push({
      title,
      image,
      price,
      originalPrice: null,
      platform: 'amazon',
      condition: 'New',
      rating,
      seller: 'Amazon',
      url: `https://www.amazon.com/dp/${asin}`,
      date: new Date().toISOString().split('T')[0],
      cached: false,
      _matchScore: 0,
    });
  });

  log('SCRAPE', `Amazon: found ${listings.length} raw listings for "${query}"`);
  listings = filterListings(deduplicateListings(listings), 'Amazon-live');
  return listings;
}

module.exports = { search };
