/**
 * Firecrawl-based scraper for all 8 platforms.
 * Used by the cron job to populate the cache with REAL product data
 * (real product URLs, images, prices) from platforms that can't be
 * scraped with simple cheerio+axios (Target, Mattel, Etsy, Poshmark, Mercari).
 *
 * Also used as a backup for eBay, Walmart, Amazon when their live scrapers fail.
 *
 * Uses firecrawl_search with site: prefix to find real product pages,
 * then extracts structured data via JSON schema extraction.
 */

const axios = require('axios');
const { log } = require('../utils/logger');

// Firecrawl API config — uses the MCP server endpoint
const FIRECRAWL_API_BASE = 'https://api.firecrawl.dev/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

// Platform site domains for search scoping
const PLATFORM_SITES = {
  ebay: 'ebay.com',
  amazon: 'amazon.com',
  walmart: 'walmart.com',
  target: 'target.com',
  mattel: 'creations.mattel.com',
  etsy: 'etsy.com',
  mercari: 'mercari.com',
  poshmark: 'poshmark.com',
};

// Platform-specific URL pattern validators (real product pages, not search pages)
// Allow locale prefixes like /ca/, /en-ca/, /uk/ etc.
const PRODUCT_URL_PATTERNS = {
  ebay: /ebay\.com\/itm\/\d+/,
  amazon: /amazon\.com\/(?:.*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/,
  walmart: /walmart\.com\/ip\/[^?]+/,
  target: /target\.com\/p\/[^?]+/,
  mattel: /creations\.mattel\.com\/(?:[a-z-]+\/)?products\//,
  etsy: /etsy\.com\/(?:[a-z]{2}\/)?listing\/\d+/,
  mercari: /mercari\.com\/(?:us\/)?item\/[a-z0-9]+/i,
  poshmark: /poshmark\.com\/listing\//,
};

/**
 * Search a specific platform for a query using Firecrawl search API.
 * Returns an array of normalized product listings.
 */
async function scrapeplatform(query, platform, options = {}) {
  const site = PLATFORM_SITES[platform];
  if (!site) {
    log('FIRECRAWL', `Unknown platform: ${platform}`);
    return [];
  }

  const searchQuery = `barbie ${query} site:${site}`;
  const limit = options.limit || 8;

  try {
    log('FIRECRAWL', `Searching ${platform}: "${searchQuery}" (limit: ${limit})`);

    const response = await axios.post(
      `${FIRECRAWL_API_BASE}/search`,
      {
        query: searchQuery,
        limit,
        scrapeOptions: {
          formats: [
            {
              type: 'json',
              prompt: 'Extract product information: product title/name, price in USD (numeric), image URL, product page URL, condition (New/Used/Pre-owned), seller name',
              schema: {
                type: 'object',
                properties: {
                  products: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        price: { type: 'number' },
                        image: { type: 'string' },
                        url: { type: 'string' },
                        condition: { type: 'string' },
                        seller: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          ],
          onlyMainContent: true,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const results = response.data?.data || response.data?.results || [];
    return normalizeResults(results, platform, query);
  } catch (err) {
    log('FIRECRAWL', `Search failed for ${platform}/"${query}": ${err.message}`);
    return [];
  }
}

/**
 * Simpler approach: use Firecrawl search without JSON extraction,
 * just get the URLs and basic metadata from search results.
 */
async function scrapeplatformSimple(query, platform, options = {}) {
  const site = PLATFORM_SITES[platform];
  if (!site) return [];

  const searchQuery = `barbie ${query} site:${site}`;
  const limit = options.limit || 10;

  try {
    log('FIRECRAWL', `Simple search ${platform}: "${searchQuery}"`);

    const response = await axios.post(
      `${FIRECRAWL_API_BASE}/search`,
      {
        query: searchQuery,
        limit,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 25000,
      }
    );

    const results = response.data?.data || response.data?.results || [];
    return normalizeSimpleResults(results, platform, query);
  } catch (err) {
    log('FIRECRAWL', `Simple search failed for ${platform}/"${query}": ${err.message}`);
    return [];
  }
}

/**
 * Normalize JSON-extracted Firecrawl results into our standard listing format.
 */
function normalizeResults(results, platform, query) {
  const listings = [];
  const urlPattern = PRODUCT_URL_PATTERNS[platform];

  for (const result of results) {
    // Try to get products from JSON extraction
    const json = result.json || result.extract || {};
    const products = json.products || [];

    for (const product of products) {
      const url = product.url || result.url || '';
      // Only accept real product URLs
      if (urlPattern && !urlPattern.test(url)) continue;
      if (!product.title || product.title.length < 5) continue;

      const price = typeof product.price === 'number' ? product.price : parseFloat(product.price);
      if (!price || isNaN(price) || price < 1 || price > 10000) continue;

      listings.push({
        title: product.title.substring(0, 200),
        image: product.image || '',
        price,
        originalPrice: null,
        platform,
        condition: product.condition || 'New',
        rating: null,
        seller: product.seller || platformDisplayName(platform),
        url,
        date: new Date().toISOString().split('T')[0],
        cached: false,
        isSearchLink: false,
        _matchScore: 0,
      });
    }

    // Also try the page-level URL if it's a product page
    if (listings.length === 0 && result.url && urlPattern && urlPattern.test(result.url)) {
      const title = result.title || result.metadata?.title || '';
      if (title && title.length >= 5) {
        // Try to extract price from markdown content
        const price = extractPriceFromText(result.markdown || result.content || '');
        const image = result.metadata?.ogImage || result.metadata?.image || '';

        if (price) {
          listings.push({
            title: title.substring(0, 200),
            image,
            price,
            originalPrice: null,
            platform,
            condition: 'New',
            rating: null,
            seller: platformDisplayName(platform),
            url: result.url,
            date: new Date().toISOString().split('T')[0],
            cached: false,
            isSearchLink: false,
            _matchScore: 0,
          });
        }
      }
    }
  }

  log('FIRECRAWL', `Normalized ${listings.length} listings from ${platform} for "${query}"`);
  return listings;
}

/**
 * Normalize simple (markdown-only) Firecrawl results.
 * Extracts basic info from page titles, URLs, and content.
 */
function normalizeSimpleResults(results, platform, query) {
  const listings = [];
  const urlPattern = PRODUCT_URL_PATTERNS[platform];

  for (const result of results) {
    const url = result.url || '';
    // Only accept real product URLs
    if (urlPattern && !urlPattern.test(url)) continue;

    const title = result.title || result.metadata?.title || '';
    if (!title || title.length < 5) continue;

    // Clean title — remove site name suffixes
    const cleanTitle = title
      .replace(/\s*[-|]\s*(eBay|Amazon|Walmart|Target|Etsy|Mercari|Poshmark|Mattel).*$/i, '')
      .replace(/\s*[-|]\s*(?:Shop|Buy|Free Shipping).*$/i, '')
      .trim();

    // Extract price from content
    const price = extractPriceFromText(result.markdown || result.content || result.description || '');
    const image = result.metadata?.ogImage || result.metadata?.image || '';

    if (!price || price < 1 || price > 10000) continue;

    listings.push({
      title: cleanTitle.substring(0, 200) || title.substring(0, 200),
      image,
      price,
      originalPrice: null,
      platform,
      condition: 'New',
      rating: null,
      seller: platformDisplayName(platform),
      url,
      date: new Date().toISOString().split('T')[0],
      cached: false,
      isSearchLink: false,
      _matchScore: 0,
    });
  }

  log('FIRECRAWL', `Simple normalized ${listings.length} listings from ${platform} for "${query}"`);
  return listings;
}

/**
 * Extract a price from a text blob. Looks for common price patterns.
 */
function extractPriceFromText(text) {
  if (!text) return null;

  // Look for explicit price patterns: $XX.XX, $XX
  const pricePatterns = [
    /\$(\d{1,5}\.\d{2})/,           // $29.99
    /(?:Price|price|Sale)[:\s]*\$(\d{1,5}(?:\.\d{2})?)/i, // Price: $29.99
    /(?:Now|now)[:\s]*\$(\d{1,5}(?:\.\d{2})?)/i,          // Now $29.99
    /(?:USD|usd)\s*(\d{1,5}(?:\.\d{2})?)/,                // USD 29.99
    /\$(\d{1,5})/,                   // $29 (no cents)
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parseFloat(match[1]);
      if (!isNaN(price) && price >= 1 && price <= 10000) return price;
    }
  }

  return null;
}

function platformDisplayName(platform) {
  const names = {
    ebay: 'eBay',
    amazon: 'Amazon',
    walmart: 'Walmart',
    target: 'Target',
    mattel: 'Mattel Creations',
    etsy: 'Etsy',
    mercari: 'Mercari',
    poshmark: 'Poshmark',
  };
  return names[platform] || platform;
}

/**
 * Scrape ALL platforms for a given query.
 * Returns { platform: listings[] } map.
 * Used by the cron job's enrichment pass.
 */
async function scrapeAllPlatforms(query, options = {}) {
  const platforms = options.platforms || Object.keys(PLATFORM_SITES);
  const results = {};

  // Run all platform searches in parallel (with timeout)
  const promises = platforms.map(async (platform) => {
    try {
      // Try JSON extraction first
      let listings = await scrapeplatform(query, platform, options);
      // Fall back to simple markdown extraction
      if (listings.length === 0) {
        listings = await scrapeplatformSimple(query, platform, options);
      }
      return { platform, listings };
    } catch (err) {
      log('FIRECRAWL', `scrapeAllPlatforms failed for ${platform}: ${err.message}`);
      return { platform, listings: [] };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results[result.value.platform] = result.value.listings;
    }
  }

  return results;
}

module.exports = {
  scrapeplatform,
  scrapeplatformSimple,
  scrapeAllPlatforms,
  PLATFORM_SITES,
  PRODUCT_URL_PATTERNS,
};
