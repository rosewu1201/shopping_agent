const cache = require('./cache/cachedData.json');
const fs = require('fs');

let badCount = 0;
let goodCount = 0;
for (const q of Object.keys(cache)) {
  const wm = cache[q].platforms.walmart;
  if (wm) {
    for (const l of wm.listings) {
      if (l.url === '' || l.price > 1000) {
        badCount++;
      } else {
        goodCount++;
      }
    }
  }
}
console.log("Walmart: good entries:", goodCount, "| bad entries:", badCount);

let ebayBadTitle = 0;
let ebayTotal = 0;
for (const q of Object.keys(cache)) {
  const eb = cache[q].platforms.ebay;
  if (eb) {
    for (const l of eb.listings) {
      ebayTotal++;
      if (l.title.includes("Opens in a new")) ebayBadTitle++;
    }
  }
}
console.log("eBay: total:", ebayTotal, "| titles with tooltip leak:", ebayBadTitle);

// Clean up bad entries
let cleaned = 0;
for (const q of Object.keys(cache)) {
  // Remove bad Walmart entries
  const wm = cache[q].platforms.walmart;
  if (wm && wm.listings) {
    const before = wm.listings.length;
    wm.listings = wm.listings.filter(l => l.url && l.price < 1000);
    cleaned += before - wm.listings.length;
    if (wm.listings.length === 0) {
      delete cache[q].platforms.walmart;
    }
  }

  // Clean eBay titles - remove "Opens in a new win..." suffix
  const eb = cache[q].platforms.ebay;
  if (eb && eb.listings) {
    for (const l of eb.listings) {
      l.title = l.title.replace(/Opens in a new (?:win|tab|window).*$/i, '').trim();
      l.title = l.title.replace(/New Listing/g, '').trim();
    }
  }
}

fs.writeFileSync('./cache/cachedData.json', JSON.stringify(cache, null, 2));
console.log("Cleaned", cleaned, "bad Walmart entries");
console.log("Done cleaning cache");
