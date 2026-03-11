// Per-platform rate limiting: max N requests per minute window
const limits = {
  ebay:    { max: 10, windowMs: 60000, timestamps: [] },
  walmart: { max: 5,  windowMs: 60000, timestamps: [] },
  amazon:  { max: 3,  windowMs: 60000, timestamps: [] },
  mercari: { max: 5,  windowMs: 60000, timestamps: [] },
};

function checkRateLimit(platform) {
  const limit = limits[platform];
  if (!limit) return true;

  const now = Date.now();
  limit.timestamps = limit.timestamps.filter(t => now - t < limit.windowMs);

  if (limit.timestamps.length >= limit.max) {
    return false;
  }

  limit.timestamps.push(now);
  return true;
}

module.exports = { checkRateLimit };
