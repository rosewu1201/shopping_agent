const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { log } = require('../utils/logger');

const STOP_WORDS = new Set([
  'barbie', 'doll', 'dolls', 'the', 'a', 'an', 'and', 'or', 'of', 'for',
  'with', 'in', 'on', 'to', 'by', 'is', 'it', 'at', 'as', 'from', 'that',
  'this', 'new',
]);

let barbieProducts = [];

function loadStaticData() {
  try {
    const dataPath = path.join(__dirname, '../../barbie-data_1772270221866_t08ntv.js');
    let content = fs.readFileSync(dataPath, 'utf-8');
    // The file uses `const barbieProducts = [...]` — const doesn't attach to sandbox.
    // Replace leading `const ` with `var ` so vm.runInNewContext makes them sandbox properties.
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

// Try to find a matching image from the cache for a product name
function findCachedImage(productName) {
  try {
    const cachePath = path.join(__dirname, '../cache/cachedData.json');
    if (!fs.existsSync(cachePath)) return '';
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

    const nameLower = productName.toLowerCase();
    // Extract significant words from the product name
    const nameWords = nameLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    for (const query of Object.keys(cache)) {
      for (const [, platformData] of Object.entries(cache[query].platforms)) {
        for (const listing of platformData.listings) {
          if (listing.image && listing.image.startsWith('http')) {
            const titleLower = listing.title.toLowerCase();
            // Check if at least 2 significant words match
            const matchCount = nameWords.filter(w => titleLower.includes(w)).length;
            if (matchCount >= 2 && matchCount >= nameWords.length * 0.4) {
              return listing.image;
            }
          }
        }
      }
    }
  } catch (e) {
    // Silent fail
  }
  return '';
}

// In-memory image cache to avoid re-reading cachedData.json on every call
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
            // Index by title words
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

  // Return the image from any matching significant word
  for (const w of nameWords) {
    if (imageCache[w]) return imageCache[w];
  }
  return '';
}

function searchStaticData(query, platformFilter) {
  const queryWords = query.toLowerCase()
    .replace(/[^a-z0-9\s#]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOP_WORDS.has(w));

  const searchWords = queryWords.length > 0 ? queryWords :
    query.toLowerCase().replace(/[^a-z0-9\s#]/g, '').split(/\s+/)
      .filter(w => w.length > 0 && w !== 'barbie' && w !== 'doll' && w !== 'dolls');

  let matched = barbieProducts;

  if (searchWords.length > 0) {
    matched = barbieProducts.filter(product => {
      const searchable = (product.name + ' ' + product.keywords.join(' ')).toLowerCase();
      return searchWords.some(word => searchable.includes(word));
    });
  }

  const listings = [];
  matched.forEach(product => {
    // Try to get an image: static data img → cached image match → empty
    const productImage = (product.img && product.img.startsWith('http'))
      ? product.img
      : findImageForProduct(product.name);

    product.listings.forEach(listing => {
      if (platformFilter && listing.platform !== platformFilter) return;
      listings.push({
        title: product.name,
        image: productImage,
        price: listing.price,
        originalPrice: listing.originalPrice,
        platform: listing.platform,
        condition: listing.condition,
        rating: listing.rating,
        seller: listing.seller,
        url: listing.url,
        date: listing.date,
        cached: true,
        _matchScore: 0,
      });
    });
  });

  return listings;
}

module.exports = { searchStaticData, barbieProducts };
