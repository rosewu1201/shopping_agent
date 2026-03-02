const { fetchPage } = require('./scrapers/baseScraper');
const cheerio = require('cheerio');

async function testWalmart() {
  console.log('=== WALMART ===');
  try {
    const html = await fetchPage('https://www.walmart.com/search?q=holiday+barbie+2025&catId=4171_4187', 'walmart');
    const $ = cheerio.load(html);

    const nd = $('script#__NEXT_DATA__').html();
    if (nd) {
      console.log('__NEXT_DATA__ found, length:', nd.length);
      const d = JSON.parse(nd);
      const stacks = d?.props?.pageProps?.initialData?.searchResult?.itemStacks || [];
      let items = [];
      stacks.forEach(s => { if (s.items) items = items.concat(s.items); });
      console.log('Items:', items.length);
      const first = items.find(i => i.name && i.type !== 'SHELF' && i.type !== 'AD');
      if (first) {
        console.log('Keys:', Object.keys(first).join(', '));
        console.log('name:', first.name);
        console.log('canonicalUrl:', first.canonicalUrl);
        console.log('priceInfo:', JSON.stringify(first.priceInfo));
        console.log('image:', first.image);
        console.log('type:', first.type);
      }
    } else {
      console.log('No __NEXT_DATA__. Checking DOM...');
      // Check various selector patterns
      console.log('[data-item-id] count:', $('[data-item-id]').length);

      // Look for links with /ip/
      const links = [];
      $('a[href*="/ip/"]').each((i, el) => { if (i < 5) links.push($(el).attr('href')); });
      console.log('/ip/ links:', links);

      // Check what the DOM actually has
      const tags = new Set();
      $('*').each((i, el) => {
        const attrs = el.attribs || {};
        Object.keys(attrs).forEach(a => {
          if (a.startsWith('data-')) tags.add(a + '=' + attrs[a].substring(0, 30));
        });
        if (i > 2000) return false;
      });
      const dataAttrs = [...tags].filter(t => t.includes('product') || t.includes('item') || t.includes('price'));
      console.log('Data attrs with product/item/price:', dataAttrs.slice(0, 20));
    }
  } catch (e) { console.log('Error:', e.message); }
}

async function testEbay() {
  console.log('\n=== EBAY ===');
  try {
    const html = await fetchPage('https://www.ebay.com/sch/i.html?_nkw=holiday+barbie+2025&_sacat=238&_sop=12&LH_BIN=1', 'ebay');
    const $ = cheerio.load(html);

    console.log('li.s-item count:', $('li.s-item').length);
    console.log('.srp-results count:', $('.srp-results').length);

    // Try alternate selectors
    const cards = $('[class*="s-item"]');
    console.log('[class*="s-item"] count:', cards.length);

    // Check what classes exist on the page
    const firstItem = $('li.s-item').first();
    if (firstItem.length) {
      console.log('First s-item HTML preview:', firstItem.html()?.substring(0, 300));
    } else {
      // Dump some page structure
      console.log('Page title:', $('title').text());
      console.log('Body classes:', $('body').attr('class'));
      // Check for results container
      console.log('.srp-river count:', $('.srp-river').length);
      console.log('#srp-river-results count:', $('#srp-river-results').length);
      // Try other patterns
      const listItems = $('ul li').filter((i, el) => {
        return $(el).find('a[href*="ebay.com/itm"]').length > 0;
      });
      console.log('LIs with ebay.com/itm links:', listItems.length);
      if (listItems.length > 0) {
        console.log('First match:', listItems.first().html()?.substring(0, 300));
      }
    }
  } catch (e) { console.log('Error:', e.message); }
}

(async () => {
  await testWalmart();
  await testEbay();
})();
