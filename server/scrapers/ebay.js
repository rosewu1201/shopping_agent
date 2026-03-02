const cheerio = require('cheerio');
const { fetchPage, parsePrice } = require('./baseScraper');
const { log } = require('../utils/logger');

async function search(query) {
  const searchQuery = query.toLowerCase().includes('barbie') ? query : `barbie ${query}`;
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&_sacat=238&_sop=12&LH_BIN=1`;

  const html = await fetchPage(url, 'ebay');
  const $ = cheerio.load(html);
  const listings = [];

  // Strategy 1: Classic .s-item selectors (legacy, may still work on some pages)
  $('li.s-item').each((i, el) => {
    if (i >= 30) return false;
    const $el = $(el);
    const title = $el.find('.s-item__title span').first().text().trim()
               || $el.find('.s-item__title').first().text().trim();
    if (!title || title === 'Shop on eBay' || title.length < 5) return;

    const priceText = $el.find('.s-item__price').first().text().trim();
    const price = parsePrice(priceText);
    if (!price || price < 1) return;

    const imageUrl = $el.find('.s-item__image-wrapper img').attr('src')
                  || $el.find('.s-item__image-wrapper img').attr('data-src')
                  || '';

    const itemUrl = $el.find('.s-item__link').attr('href') || '';
    const condition = $el.find('.SECONDARY_INFO').text().trim() || 'Not specified';
    const sellerInfo = $el.find('.s-item__seller-info-text').text().trim() || '';

    listings.push({
      title,
      image: imageUrl.replace(/s-l\d+/, 's-l300'),
      price,
      originalPrice: null,
      platform: 'ebay',
      condition,
      rating: null,
      seller: sellerInfo || 'eBay Seller',
      url: itemUrl.split('?')[0],
      date: new Date().toISOString().split('T')[0],
      cached: false,
      _matchScore: 0,
    });
  });

  if (listings.length > 0) {
    log('SCRAPE', `eBay (classic selectors): found ${listings.length} listings for "${query}"`);
    return listings;
  }

  // Strategy 2: New eBay HTML structure (su-card-container / generic li with itm links)
  // Find all <li> elements that contain links to /itm/ pages
  const itemLis = $('ul li').filter((i, el) => {
    return $(el).find('a[href*="ebay.com/itm"]').length > 0 ||
           $(el).find('a[href*="/itm/"]').length > 0;
  });

  itemLis.each((i, el) => {
    if (i >= 30) return false;
    const $el = $(el);

    // Extract product URL
    const linkEl = $el.find('a[href*="ebay.com/itm"]').first();
    if (!linkEl.length) return;
    let itemUrl = linkEl.attr('href') || '';

    // Extract title: try various approaches
    let title = '';
    // Try the link text itself
    title = linkEl.text().trim();
    // Try heading elements
    if (!title || title.length < 5) {
      title = $el.find('h3').first().text().trim()
           || $el.find('[role="heading"]').first().text().trim()
           || $el.find('.s-item__title').first().text().trim();
    }
    // Try the link's title/aria-label attribute
    if (!title || title.length < 5) {
      title = linkEl.attr('title') || linkEl.attr('aria-label') || '';
    }
    // Try span inside the link
    if (!title || title.length < 5) {
      title = linkEl.find('span').first().text().trim();
    }

    if (!title || title === 'Shop on eBay' || title.length < 5) return;

    // Clean eBay tooltip text that leaks into titles
    title = title.replace(/Opens in a new (?:win|tab|window).*$/i, '').trim();
    title = title.replace(/^New Listing/i, '').trim();

    if (title.length < 5) return;
    let price = null;
    // Try specific price selectors
    const priceEl = $el.find('.s-item__price').first();
    if (priceEl.length) {
      price = parsePrice(priceEl.text());
    }
    // Try spans that contain $ sign
    if (!price) {
      $el.find('span').each((j, span) => {
        if (price) return;
        const text = $(span).text().trim();
        if (/^\$[\d,.]+$/.test(text)) {
          price = parsePrice(text);
        }
      });
    }
    // Broader search: any text with price pattern in the item
    if (!price) {
      const itemText = $el.text();
      const priceMatch = itemText.match(/\$(\d{1,5}(?:[.,]\d{2})?)/);
      if (priceMatch) {
        price = parsePrice(priceMatch[0]);
      }
    }

    if (!price || price < 1) return;

    // Extract image
    let image = $el.find('img').first().attr('src')
             || $el.find('img').first().attr('data-src')
             || '';
    // Upgrade to larger eBay image
    if (image) {
      image = image.replace(/s-l\d+/, 's-l300');
    }

    // Extract condition
    let condition = 'Not specified';
    $el.find('span').each((j, span) => {
      const text = $(span).text().trim().toLowerCase();
      if (text === 'new' || text === 'brand new' || text === 'pre-owned' ||
          text === 'used' || text === 'open box' || text === 'refurbished') {
        condition = $(span).text().trim();
      }
    });

    // Clean URL — remove tracking params
    const cleanUrl = itemUrl.split('?')[0];

    listings.push({
      title: title.substring(0, 200), // cap very long titles
      image,
      price,
      originalPrice: null,
      platform: 'ebay',
      condition,
      rating: null,
      seller: 'eBay Seller',
      url: cleanUrl,
      date: new Date().toISOString().split('T')[0],
      cached: false,
      _matchScore: 0,
    });
  });

  log('SCRAPE', `eBay (new selectors): found ${listings.length} listings for "${query}"`);
  return listings;
}

module.exports = { search };
