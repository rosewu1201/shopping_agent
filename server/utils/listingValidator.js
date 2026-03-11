/**
 * Shared listing validation — used by all scrapers and cache imports.
 * Catches fake/garbage listings, wrong prices, non-Barbie items, and bad URLs.
 */

const { log } = require('./logger');

// ─── URL PATTERNS: Only accept real product page URLs ───
const PRODUCT_URL_PATTERNS = {
  ebay: /ebay\.com\/itm\/\d+/,
  amazon: /amazon\.com\/(?:.*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/i,
  walmart: /walmart\.com\/ip\/[^?\s]+/,
  target: /target\.com\/p\/[^?\s]+/,
  mattel: /creations\.mattel\.com\/(?:[a-z-]+\/)?products\/[^?\s]+/,
  etsy: /etsy\.com\/(?:[a-z]{2}\/)?listing\/\d+/,
  mercari: /mercari\.com\/(?:us\/)?item\/[a-z0-9]+/i,
  poshmark: /poshmark\.com\/listing\/[^?\s]+/,
};

// URLs that are search pages, not product pages
const SEARCH_URL_PATTERNS = [
  /[?&](q|query|search|s|k|searchTerm)=/i,
  /\/search[/?]/i,
  /\/s\?/i,
  /\/sch\//i,
];

// Non-Barbie brands that contaminate results
const NON_BARBIE_BRANDS = [
  'monster high', 'bratz', 'rainbow high', 'lol surprise', 'our generation',
  'naturalistas', 'hey bestie', 'living dead dolls', 'enchantimals',
  'mermaze mermaidz', 'pullip', 'blythe', 'integrity toys',
  'fashion royalty', 'american girl', 'playmobil', 'hot wheels',
  'mega construx', 'mega pokemon', 'masters of the universe',
  'teenage mutant ninja', 'wwe wrestling', 'power rangers', 'transformers',
  'my little pony', 'polly pocket', 'ever after high',
  'disney princess toys', 'disney descendants', 'disney store',
  'elena of avalor', 'loungefly', 'funko pop', 'joyfy',
];

// Non-doll items
const NON_DOLL_ITEMS = [
  'clipart', 'png bundle', 'svg bundle', 'digital download', 'printable',
  'bath bomb', 'replacement parts', 'vinyl 12 inch', '(cd)', '(vinyl)',
  'record album', 'crazy dog t-shirt', 'snow blanket roll',
  'christmas snow blanket', 'sleeveless dress size', 'tweed jacket size',
];

// Garbage title patterns
const GARBAGE_TITLE_PATTERNS = [
  /^\d+(\.\d+)?\s*out of \d+ stars/i,   // "4.3 out of 5 stars"
  /^\$[\d.]+\$[\d.]+$/,                   // "$29.99$39.99"
  /^!?\[/,                                 // Markdown image syntax
  /\]\(https?:/,                           // Markdown link syntax
  /^- \d+\\/,                             // Numbered list artifact
  /^coming soon$/i,                        // Not yet available
];

/**
 * Validate a single listing. Returns { valid: true } or { valid: false, reason: string }.
 */
function validateListing(listing) {
  const { title, price, url, image, platform } = listing;

  // ─── TITLE CHECKS ───
  if (!title || typeof title !== 'string') {
    return { valid: false, reason: 'missing_title' };
  }
  const t = title.toLowerCase().trim();

  if (title.length < 10) {
    return { valid: false, reason: 'title_too_short' };
  }
  if (title.length > 500) {
    return { valid: false, reason: 'title_too_long' };
  }
  // Strip non-alpha and check remaining length
  if (title.replace(/[^a-zA-Z]/g, '').length < 8) {
    return { valid: false, reason: 'title_no_content' };
  }

  for (const pattern of GARBAGE_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return { valid: false, reason: 'garbage_title' };
    }
  }

  // Non-Barbie brand check (allow if title also mentions "barbie")
  for (const brand of NON_BARBIE_BRANDS) {
    if (t.includes(brand) && !t.includes('barbie')) {
      return { valid: false, reason: `non_barbie_brand:${brand}` };
    }
  }

  // Non-doll item check
  for (const item of NON_DOLL_ITEMS) {
    if (t.includes(item)) {
      return { valid: false, reason: `non_doll_item:${item}` };
    }
  }

  // ─── PRICE CHECKS ───
  if (price == null || typeof price !== 'number' || isNaN(price)) {
    return { valid: false, reason: 'missing_price' };
  }
  if (price < 3) {
    return { valid: false, reason: 'price_too_low' };
  }
  if (price > 3000) {
    return { valid: false, reason: 'price_too_high' };
  }
  // Walmart decimal stripping bug: prices > $500 for common items
  if (platform === 'walmart' && price > 500) {
    // Only allow legitimately expensive items
    const expensiveTerms = ['bob mackie', 'silkstone', 'platinum', 'convention', 'gold label', 'jewel'];
    const isExpensive = expensiveTerms.some(term => t.includes(term));
    if (!isExpensive) {
      return { valid: false, reason: 'walmart_decimal_bug' };
    }
  }

  // ─── URL CHECKS ───
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'missing_url' };
  }
  if (!url.startsWith('http')) {
    return { valid: false, reason: 'invalid_url_scheme' };
  }

  // Check for search page URLs (not product pages)
  for (const pattern of SEARCH_URL_PATTERNS) {
    if (pattern.test(url)) {
      return { valid: false, reason: 'search_url' };
    }
  }

  // Platform-specific URL validation
  if (platform && PRODUCT_URL_PATTERNS[platform]) {
    if (!PRODUCT_URL_PATTERNS[platform].test(url)) {
      return { valid: false, reason: `invalid_${platform}_url` };
    }
  }

  // ─── IMAGE CHECKS ───
  if (!image || typeof image !== 'string' || !image.startsWith('http')) {
    return { valid: false, reason: 'missing_image' };
  }
  if (image.includes('heart-animation.gif')) {
    return { valid: false, reason: 'placeholder_image' };
  }
  if (image.includes('](http')) {
    return { valid: false, reason: 'corrupted_image' };
  }

  return { valid: true };
}

/**
 * Filter an array of listings, removing invalid ones.
 * Returns only valid listings. Logs removal stats.
 */
function filterListings(listings, source = 'unknown') {
  if (!Array.isArray(listings) || listings.length === 0) return [];

  const valid = [];
  const removedReasons = {};

  for (const listing of listings) {
    const result = validateListing(listing);
    if (result.valid) {
      valid.push(listing);
    } else {
      removedReasons[result.reason] = (removedReasons[result.reason] || 0) + 1;
    }
  }

  const removed = listings.length - valid.length;
  if (removed > 0) {
    const reasons = Object.entries(removedReasons).map(([r, c]) => `${r}:${c}`).join(', ');
    log('VALIDATE', `${source}: removed ${removed}/${listings.length} (${reasons})`);
  }

  return valid;
}

/**
 * Deduplicate listings by URL. Keeps the first occurrence.
 */
function deduplicateListings(listings) {
  const seen = new Set();
  return listings.filter(l => {
    const key = (l.url || '').split('?')[0].split('#')[0].toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  validateListing,
  filterListings,
  deduplicateListings,
  PRODUCT_URL_PATTERNS,
};
