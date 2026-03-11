const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { log } = require('../utils/logger');
const { expandQuery, scoreMatch, fuzzyMatch } = require('../utils/smartSearch');

const STOP_WORDS = new Set([
  'barbie', 'doll', 'dolls', 'the', 'a', 'an', 'and', 'or', 'of', 'for',
  'with', 'in', 'on', 'to', 'by', 'is', 'it', 'at', 'as', 'from', 'that',
  'this', 'new',
]);

// Platform search URL builders — these generate HONEST search links
const PLATFORM_SEARCH_URLS = {
  ebay:     q => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=238`,
  amazon:   q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=toys-and-games`,
  walmart:  q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}&catId=4171_4187`,
  target:   q => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}&category=5xtd6`,
  mattel:   q => `https://creations.mattel.com/search#q=${encodeURIComponent(q)}&type=product`,
  etsy:     q => `https://www.etsy.com/search?q=${encodeURIComponent(q)}`,
  mercari:  q => `https://www.mercari.com/search/?keyword=${encodeURIComponent(q)}`,
  poshmark: q => `https://poshmark.com/search?query=${encodeURIComponent(q)}&type=listings`,
};

let barbieProducts = [];

function loadStaticData() {
  try {
    const dataPath = path.join(__dirname, '../../barbie-data_1772270221866_t08ntv.js');
    let content = fs.readFileSync(dataPath, 'utf-8');
    content = content.replace(/^const /gm, 'var ');
    const sandbox = {};
    vm.runInNewContext(content, sandbox);
    barbieProducts = sandbox.barbieProducts || [];
    log('STATIC', `Loaded ${barbieProducts.length} products from static data`);
  } catch (e) {
    log('STATIC', `Failed to load static data: ${e.message}`);
    barbieProducts = [];
  }
}

loadStaticData();

// In-memory image cache from cached scrape data
let imageCache = {};
let imageCacheBuilt = false;

function buildImageCache() {
  if (imageCacheBuilt) return;
  try {
    const cachePath = path.join(__dirname, '../cache/cachedData.json');
    if (!fs.existsSync(cachePath)) return;
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    for (const query of Object.keys(cache)) {
      for (const [, platformData] of Object.entries(cache[query].platforms)) {
        for (const listing of platformData.listings) {
          if (listing.image && listing.image.startsWith('http')) {
            const words = listing.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
              .filter(w => w.length > 2);
            for (const w of words) {
              if (!imageCache[w]) imageCache[w] = listing.image;
            }
          }
        }
      }
    }
    imageCacheBuilt = true;
  } catch (e) {
    // Silent fail
  }
}

function findImageForProduct(productName) {
  buildImageCache();
  const nameLower = productName.toLowerCase();
  const nameWords = nameLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  for (const w of nameWords) {
    if (imageCache[w]) return imageCache[w];
  }
  return '';
}

// Check if a URL is a real product page (not a search/browse page)
function isRealProductUrl(url) {
  if (!url) return false;
  // Real product URL patterns
  return /\/dp\/[A-Z0-9]/.test(url)           // Amazon /dp/ASIN
    || /\/ip\/[^/]+\/\d+/.test(url)            // Walmart /ip/name/ID
    || /\/-\/A-\d+/.test(url)                  // Target /-/A-ID
    || /\/products\/[a-z]/.test(url)            // Mattel /products/slug
    || /\/itm\/\d+/.test(url)                   // eBay /itm/ID
    || /\/listing\/[a-z0-9]/.test(url)          // Etsy/Mercari /listing/
    || /\/item\/[a-z0-9]/.test(url);            // Poshmark /item/
}

function searchStaticData(query, platformFilter) {
  const queryData = expandQuery(query);
  const { originalWords, expandedWords } = queryData;

  const searchWords = originalWords.filter(w => !STOP_WORDS.has(w));
  const allSearchWords = expandedWords.filter(w => !STOP_WORDS.has(w));

  let matched = barbieProducts;

  if (allSearchWords.length > 0) {
    matched = barbieProducts.filter(product => {
      const searchable = (product.name + ' ' + product.keywords.join(' ')).toLowerCase();
      return allSearchWords.some(word => searchable.includes(word));
    });

    // Fuzzy matching fallback
    if (matched.length === 0 && searchWords.length > 0) {
      matched = barbieProducts.filter(product => {
        const titleWords = product.name.toLowerCase().split(/\s+/);
        const kwWords = product.keywords.map(k => k.toLowerCase());
        const allTargetWords = [...titleWords, ...kwWords];
        return searchWords.some(sw =>
          allTargetWords.some(tw => fuzzyMatch(sw, tw))
        );
      });
    }
  }

  const listings = [];
  matched.forEach(product => {
    const productImage = (product.img && product.img.startsWith('http'))
      ? product.img
      : findImageForProduct(product.name);

    // If product has per-platform listings, use those
    if (product.listings && product.listings.length > 0) {
      product.listings.forEach(listing => {
        if (platformFilter && listing.platform !== platformFilter) return;

        // Determine if this is a real product URL or a search URL
        const hasRealUrl = isRealProductUrl(listing.url);

        listings.push({
          title: product.name,
          image: productImage || '',
          price: listing.price,
          originalPrice: listing.originalPrice || null,
          platform: listing.platform,
          condition: listing.condition || 'New',
          rating: listing.rating || null,
          seller: listing.seller || listing.platform,
          url: hasRealUrl ? listing.url : PLATFORM_SEARCH_URLS[listing.platform]
            ? PLATFORM_SEARCH_URLS[listing.platform](product.name)
            : listing.url,
          date: listing.date || '2026-02-28',
          cached: true,
          isSearchLink: !hasRealUrl, // Flag so frontend knows this is a search link
          _matchScore: 0,
        });
      });
    }
  });

  return listings;
}

module.exports = { searchStaticData, barbieProducts };
