const cheerio = require('cheerio');
const { fetchPage, parsePrice } = require('./baseScraper');
const { log } = require('../utils/logger');
const { filterListings, deduplicateListings } = require('../utils/listingValidator');

async function search(query) {
  const searchQuery = query.toLowerCase().includes('barbie') ? query : `barbie ${query}`;
  const url = `https://www.walmart.com/search?q=${encodeURIComponent(searchQuery)}&catId=4171_4187`;

  let html;
  try {
    html = await fetchPage(url, 'walmart');
  } catch (err) {
    log('SCRAPE', `Walmart: fetch failed (${err.message}), falling back`);
    return [];
  }

  if (!html || typeof html !== 'string' || html.length < 500) {
    log('SCRAPE', 'Walmart: empty/short response, falling back');
    return [];
  }

  const $ = cheerio.load(html);
  let listings = [];

  // Strategy 1: Extract from __NEXT_DATA__ JSON blob
  const nextDataScript = $('script#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript);
      const stacks = data?.props?.pageProps?.initialData?.searchResult?.itemStacks || [];
      let items = [];
      for (const stack of stacks) {
        if (stack.items) items = items.concat(stack.items);
      }

      for (const item of items.slice(0, 25)) {
        if (!item.name || item.type === 'SHELF' || item.type === 'AD') continue;

        // Try multiple price paths — Walmart's JSON structure varies
        let price = null;
        // Path 1: currentPrice.price (older format)
        if (item.priceInfo?.currentPrice?.price) {
          price = item.priceInfo.currentPrice.price;
        }
        // Path 2: linePriceDisplay e.g. "$46.99" (common current format)
        if (!price && item.priceInfo?.linePriceDisplay) {
          price = parsePrice(item.priceInfo.linePriceDisplay);
        }
        // Path 3: linePrice (numeric string)
        if (!price && item.priceInfo?.linePrice) {
          price = parseFloat(item.priceInfo.linePrice);
        }
        // Path 4: itemPrice
        if (!price && item.priceInfo?.itemPrice) {
          price = parsePrice(String(item.priceInfo.itemPrice));
        }
        // Path 5: minPrice (range pricing)
        if (!price && item.priceInfo?.minPrice) {
          price = parseFloat(item.priceInfo.minPrice);
        }

        if (!price || isNaN(price) || price < 3) continue;

        // Build the direct product URL — must contain /ip/
        let productUrl = '';
        if (item.canonicalUrl) {
          const cleanUrl = item.canonicalUrl.split('?')[0];
          productUrl = `https://www.walmart.com${cleanUrl}`;
        } else if (item.usItemId) {
          productUrl = `https://www.walmart.com/ip/${item.usItemId}`;
        }
        // Skip if no valid product URL
        if (!productUrl || !productUrl.includes('/ip/')) continue;

        // Parse original/was price
        let originalPrice = null;
        if (item.priceInfo?.wasPrice?.price) {
          originalPrice = item.priceInfo.wasPrice.price;
        } else if (item.priceInfo?.wasPriceDisplay) {
          originalPrice = parsePrice(item.priceInfo.wasPriceDisplay);
        }

        listings.push({
          title: item.name,
          image: item.image || '',
          price,
          originalPrice,
          platform: 'walmart',
          condition: 'New',
          rating: item.rating?.averageRating || null,
          seller: item.sellerName || 'Walmart',
          url: productUrl,
          date: new Date().toISOString().split('T')[0],
          cached: false,
          _matchScore: 0,
        });
      }

      if (listings.length > 0) {
        log('SCRAPE', `Walmart (__NEXT_DATA__): found ${listings.length} raw listings for "${query}"`);
        listings = filterListings(deduplicateListings(listings), 'Walmart-live');
        return listings;
      }
    } catch (e) {
      log('SCRAPE', `Walmart __NEXT_DATA__ parse failed: ${e.message}`);
    }
  }

  // Strategy 2: DOM scraping fallback
  // Walmart's DOM is heavily JS-rendered. This fallback is unreliable —
  // price text often lacks decimal points and URLs may be missing.
  // Only accept entries that pass strict validation.
  $('[data-item-id]').each((i, el) => {
    if (i >= 25) return false;
    const $el = $(el);
    const title = $el.find('[data-automation-id="product-title"]').text().trim();
    const priceText = $el.find('[data-automation-id="product-price"]').text().trim();
    const price = parsePrice(priceText);
    if (!title || !price || price < 3) return;

    // Reject obviously broken prices (no decimal in source but large number)
    if (price > 500) return;

    // Extract product URL from the first /ip/ link
    let productUrl = '';
    const link = $el.find('a[href*="/ip/"]').first().attr('href');
    if (link) {
      const cleanLink = link.split('?')[0];
      productUrl = cleanLink.startsWith('http') ? cleanLink : `https://www.walmart.com${cleanLink}`;
    }

    // Require a product URL — search URLs are useless
    if (!productUrl) return;

    listings.push({
      title,
      image: $el.find('img[data-testid="productTileImage"]').attr('src')
          || $el.find('img').first().attr('src') || '',
      price,
      originalPrice: null,
      platform: 'walmart',
      condition: 'New',
      rating: null,
      seller: 'Walmart',
      url: productUrl,
      date: new Date().toISOString().split('T')[0],
      cached: false,
      _matchScore: 0,
    });
  });

  log('SCRAPE', `Walmart (DOM): found ${listings.length} raw listings for "${query}"`);
  listings = filterListings(deduplicateListings(listings), 'Walmart-DOM');
  return listings;
}

module.exports = { search };
