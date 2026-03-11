const { log } = require('./logger');

// ─── BARBIE-SPECIFIC SYNONYM MAP ───
// Maps collector terms, abbreviations, and related concepts to search expansions
const SYNONYM_MAP = {
  // Collection names / abbreviations
  'ddm': ['dia de muertos', 'day of the dead'],
  'dotw': ['dolls of the world'],
  'bmc': ['bob mackie'],
  'hpb': ['happy birthday'],
  'nrfb': ['new in box', 'mint'],
  'mib': ['mint in box'],
  'ooak': ['one of a kind', 'custom'],
  'htf': ['hard to find', 'rare'],
  'le': ['limited edition'],
  'ce': ['collector edition'],
  'se': ['special edition'],
  'aa': ['african american'],
  'gaw': ['grant a wish'],
  'nbdc': ['national barbie doll convention'],
  'bfc': ['barbie fan club'],
  'fmc': ['fashion model collection', 'silkstone'],

  // Well-known Barbie lines and designers
  "gala's best": ['gala collection', 'gala', 'best dressed'],
  'galas best': ['gala collection', 'gala', 'best dressed'],
  'gala best': ['gala collection', 'gala', 'best dressed'],
  "gala's": ['gala collection', 'gala'],
  'reem acra': ['bride barbie', 'reem acra bride', 'gold label'],
  'bob mackie': ['designer', 'jewel essence', 'fantasy goddess'],
  'vera wang': ['vera wang bride', 'romanticist'],
  'byron lars': ['treasures of africa', 'byron lars barbie'],
  'robert best': ['fashion model collection', 'silkstone', 'bfmc'],
  'model muse': ['collector', 'signature'],

  // Common misspellings / variants
  'stevie nix': ['stevie nicks'],
  'steve nicks': ['stevie nicks'],
  'stevy nicks': ['stevie nicks'],
  'margot robie': ['margot robbie'],
  'margo robbie': ['margot robbie'],
  'dia de los muertos': ['dia de muertos'],
  'day of dead': ['dia de muertos'],
  'day of the dead': ['dia de muertos'],
  'silk stone': ['silkstone'],
  'silk-stone': ['silkstone'],
  'bob macky': ['bob mackie'],
  'bob mackey': ['bob mackie'],
  'holliday': ['holiday'],
  'holaday': ['holiday'],
  'cristmas': ['christmas', 'holiday'],
  'xmas': ['christmas', 'holiday'],
  'galas': ['gala'],

  // Barbiepedia-sourced collection names and abbreviations
  'great eras': ['collection', 'egyptian', 'gibson', 'flapper', 'grecian', 'medieval', 'southern belle'],
  'hollywood legends': ['collection', 'scarlett', 'dorothy', 'eliza', 'marilyn'],
  'coca cola': ['coke', 'soda fountain', 'collector'],
  'coca-cola': ['coca cola', 'coke'],
  'coke': ['coca cola'],
  'harley davidson': ['motorcycle', 'collector'],
  'harley-davidson': ['harley davidson'],
  'hard rock': ['hard rock cafe', 'collector'],
  'enchanted seasons': ['collection', 'snow princess', 'autumn glory', 'spring bouquet'],
  'birds of beauty': ['collection', 'peacock', 'flamingo', 'swan'],
  'fairy of the forest': ['enchanted', 'nature'],
  'angels of music': ['collection', 'harpist', 'heartstring'],
  'jewel essence': ['collection', 'bob mackie', 'amethyst', 'emerald', 'ruby', 'sapphire', 'diamond'],
  'celestial': ['collection', 'star', 'moon', 'sun'],
  'zodiac': ['collection', 'astrology'],
  'birthstone': ['collection', 'birthstone beauties', 'gem'],
  'anniversary': ['celebration', 'special edition'],
  'barbiestyle': ['fashion', 'collector', 'style'],
  'i love lucy': ['lucille ball', 'desi arnaz', 'tv show'],
  'alice in wonderland': ['alice', 'mad hatter', 'queen hearts'],
  'oscar de la renta': ['designer', 'gold label'],
  'karl lagerfeld': ['designer', 'chanel'],
  'christian louboutin': ['designer', 'shoes'],
  'nascar': ['racing', 'collector'],
  'grace kelly': ['princess', 'monaco', 'celebrity'],
  'elizabeth taylor': ['celebrity', 'violet eyes', 'cleopatra'],
  'andy warhol': ['pop art', 'campbell soup', 'artist'],
  'portrait collection': ['collector', 'fine art'],
  'women of royalty': ['queen', 'princess', 'royal'],
  'legends of ireland': ['irish', 'celtic', 'faerie'],
  'pin up girls': ['retro', 'vintage', 'glamour', 'pin-up', 'pinup'],
  'grand entrance': ['collector', 'gala', 'evening'],
  'ballroom beauties': ['dance', 'ball', 'evening'],
  'winter princess': ['snow', 'ice', 'holiday'],
  'city seasons': ['autumn', 'spring', 'summer', 'winter'],
  'royal jewels': ['crown', 'gem', 'jewel'],
  'jazz baby': ['flapper', 'roaring twenties', 'charleston'],
  'native spirit': ['indigenous', 'spirit earth', 'native american'],
  'lounge kitties': ['cat', 'leopard', 'collector'],
  'faraway forest': ['fairy', 'elf', 'woodland'],
  'the blonds': ['designer', 'glamour', 'blond'],
  'pop life': ['mod', 'retro', 'sixties', '60s'],
  'timeless sentiments': ['angel', 'collector'],
  'together forever': ['wedding', 'romance', 'love'],
  'modern circle': ['contemporary', 'fashion'],
  'fashion savvy': ['style', 'collector'],
  'great villains': ['villain', 'evil queen', 'cruella'],
  'harlem theater': ['jazz', 'african american', 'collector'],
  'museum collection': ['art', 'masterpiece'],
  'hollywood movie star': ['film', 'cinema', 'actress'],
  'designer spotlight': ['fashion', 'designer', 'collector'],
  'global glamour': ['international', 'world', 'collector'],
  'classical goddess': ['greek', 'athena', 'goddess'],
  'essence of nature': ['nature', 'earth', 'water', 'fire'],
  'ferrari': ['car', 'racing', 'italian'],
  'dancing with the stars': ['dance', 'ballroom', 'tv show'],
  'barbie loves bond': ['james bond', '007', 'spy'],
  'society style': ['socialite', 'high society', 'collector'],

  // Concept expansions — keep these tight (used for synonym scoring only)
  'balmain': ['designer', 'fashion', 'luxury', 'olivier'],
  'moschino': ['designer', 'fashion', 'italian'],
  'coach': ['designer', 'fashion', 'handbag'],
  'vintage': ['retro', 'classic'],
  'retro': ['vintage', 'classic'],
  'holiday': ['christmas', 'seasonal'],
  'christmas': ['holiday', 'seasonal'],
  'collector': ['signature', 'limited edition'],
  'signature': ['collector'],
  'fashion': ['fashionista', 'looks'],
  'fashionista': ['fashion', 'looks'],
  'looks': ['fashionista', 'fashion'],
  'dream': ['dreamhouse'],
  'dreamhouse': ['dream house', 'playset'],
  'ken': ['boyfriend'],
  'princess': ['royal', 'fairy tale'],
  'wedding': ['bride', 'bridal'],
  'bride': ['wedding', 'bridal'],
  'career': ['professional', 'you can be'],
  'movie': ['film'],
  'celebrity': ['pop culture'],
  'silkstone': ['fashion model collection', 'bfmc'],
};

// ─── FUZZY STRING MATCHING ───
// Levenshtein distance for typo tolerance
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

// Check if word approximately matches target (typo tolerance)
function fuzzyMatch(word, target, maxDistance) {
  if (!maxDistance) maxDistance = word.length <= 4 ? 1 : 2;
  if (target.includes(word) || word.includes(target)) return true;
  if (Math.abs(word.length - target.length) > maxDistance) return false;
  return levenshtein(word, target) <= maxDistance;
}

// ─── STOP WORDS ───
const STOP_WORDS = new Set([
  'barbie', 'doll', 'dolls', 'the', 'a', 'an', 'and', 'or', 'of', 'for',
  'with', 'in', 'on', 'to', 'by', 'is', 'it', 'at', 'as', 'from', 'that',
  'this', 'new', 'her', 'his', 'she', 'he', 'mattel',
]);

// ─── QUERY EXPANSION ───
// Takes a raw query and returns an expanded set of search terms
function expandQuery(query) {
  const raw = query.toLowerCase().trim();
  // Keep apostrophes for phrases like "gala's best"
  const cleanRaw = raw.replace(/[^a-z0-9\s#'-]/g, '');
  const allWords = cleanRaw.split(/\s+/).filter(w => w.length > 0);
  // Meaningful words = non-stop-words, used for scoring
  const meaningfulWords = allWords.filter(w => !STOP_WORDS.has(w.replace(/['-]/g, '')));
  const expanded = new Set(meaningfulWords);

  // Track which multi-word SYNONYM_MAP phrases match the query.
  // These phrases should be treated as single scoring units, not split into words.
  const matchedPhrases = [];

  // Check multi-word phrases first (e.g., "gala's best", "reem acra", "bob mackie")
  for (const [phrase, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (cleanRaw.includes(phrase)) {
      synonyms.forEach(s => {
        s.split(/\s+/).forEach(w => expanded.add(w));
      });
      // Track multi-word phrases for scoring
      if (phrase.includes(' ')) {
        matchedPhrases.push({ phrase, synonyms });
      }
    }
  }

  // Check individual words
  for (const word of meaningfulWords) {
    const cleanWord = word.replace(/['-]/g, '');
    if (SYNONYM_MAP[cleanWord]) {
      SYNONYM_MAP[cleanWord].forEach(s => {
        s.split(/\s+/).forEach(w => expanded.add(w));
      });
    }
  }

  // Build per-word synonym map: for each original word, which synonyms apply?
  // Also check multi-word phrase synonyms and assign their expansions to ALL words in the phrase.
  const wordSynonyms = {};
  for (const word of meaningfulWords) {
    const cleanWord = word.replace(/['-]/g, '');
    wordSynonyms[cleanWord] = new Set();
    if (SYNONYM_MAP[cleanWord]) {
      SYNONYM_MAP[cleanWord].forEach(s => {
        s.split(/\s+/).forEach(w => wordSynonyms[cleanWord].add(w));
      });
    }
  }
  // Multi-word phrase synonyms: assign to all words in the phrase
  for (const [phrase, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (phrase.includes(' ') && cleanRaw.includes(phrase)) {
      const phraseWords = phrase.split(/\s+/).map(w => w.replace(/['-]/g, ''));
      for (const pw of phraseWords) {
        if (wordSynonyms[pw]) {
          synonyms.forEach(s => s.split(/\s+/).forEach(w => wordSynonyms[pw].add(w)));
        }
      }
    }
  }

  return {
    originalWords: meaningfulWords,
    expandedWords: [...expanded],
    rawQuery: cleanRaw,
    wordSynonyms, // per-word synonym lookup
    matchedPhrases, // multi-word phrases that matched the query
  };
}

// ─── SMART SCORING ───
// Score a product title + keywords against an expanded query.
// Supports both per-word matching and multi-word phrase matching.
// When a query IS a known collection phrase (e.g., "women of royalty"),
// the phrase's synonyms are checked as a unit rather than splitting words.
function scoreMatch(title, keywords, queryData) {
  const titleLower = title.toLowerCase();
  const keywordsLower = (keywords || []).join(' ').toLowerCase();
  const searchable = titleLower + ' ' + keywordsLower;
  const { originalWords, expandedWords, rawQuery, wordSynonyms, matchedPhrases } = queryData;

  if (originalWords.length === 0) return 1.0; // no meaningful words -> neutral

  let score = 0;
  let matchedOriginalCount = 0;

  // 1. Exact full phrase match in title (strongest signal)
  if (rawQuery.length > 2 && titleLower.includes(rawQuery)) {
    score += 5.0;
  }

  // 2. Multi-word phrase matching: if the query matches a known phrase in SYNONYM_MAP,
  //    check if the phrase or any of its synonyms appear in the title.
  //    This prevents the "split synonym" problem where each word fails individually.
  const phraseMatchedWords = new Set();
  if (matchedPhrases && matchedPhrases.length > 0) {
    for (const { phrase, synonyms } of matchedPhrases) {
      const phraseWords = phrase.split(/\s+/).map(w => w.replace(/['-]/g, ''));

      // Check if the phrase itself is in the title
      if (titleLower.includes(phrase)) {
        score += 4.0;
        phraseWords.forEach(w => phraseMatchedWords.add(w));
        matchedOriginalCount += phraseWords.filter(w => originalWords.includes(w)).length;
        continue;
      }

      // Check if any synonym phrase or word appears in the title
      let bestSynScore = 0;
      for (const syn of synonyms) {
        if (searchable.includes(syn.toLowerCase())) {
          bestSynScore = Math.max(bestSynScore, 2.0);
        }
      }
      if (bestSynScore > 0) {
        score += bestSynScore;
        phraseWords.forEach(w => phraseMatchedWords.add(w));
        matchedOriginalCount += phraseWords.filter(w => originalWords.includes(w)).length;
      }
    }
  }

  // 3. Check each original query word against the title (skip words already matched by phrase)
  const usedSynonyms = new Set();
  for (const word of originalWords) {
    const cleanWord = word.replace(/['-]/g, '');
    if (cleanWord.length < 2) continue;
    if (phraseMatchedWords.has(cleanWord)) continue; // Already matched by phrase

    const variants = [cleanWord];
    if (cleanWord.endsWith('s') && cleanWord.length > 3) {
      variants.push(cleanWord.slice(0, -1));
    }

    let matched = false;
    for (const v of variants) {
      if (titleLower.includes(v)) {
        score += 3.0;
        matchedOriginalCount++;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const v of variants) {
      if (keywordsLower.includes(v)) {
        score += 1.5;
        matchedOriginalCount++;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Try fuzzy match in title words
    const titleWords = titleLower.split(/[\s,.\-()]+/);
    let fuzzyFound = false;
    for (const tw of titleWords) {
      for (const v of variants) {
        if (tw.length >= 3 && v.length >= 3 && fuzzyMatch(v, tw)) {
          score += 1.5;
          matchedOriginalCount++;
          fuzzyFound = true;
          break;
        }
      }
      if (fuzzyFound) break;
    }
    if (fuzzyFound) continue;

    // Synonym recovery
    const syns = wordSynonyms && wordSynonyms[cleanWord];
    let synonymFound = false;
    if (syns) {
      for (const syn of syns) {
        if (syn.length >= 3 && !usedSynonyms.has(syn) && searchable.includes(syn)) {
          score += 1.0;
          matchedOriginalCount++;
          usedSynonyms.add(syn);
          synonymFound = true;
          break;
        }
      }
    }
    if (!synonymFound) {
      score -= 2.0;
    }
  }

  // 4. Match ratio — the fraction of original words that matched
  const matchRatio = matchedOriginalCount / originalWords.length;

  if (matchRatio < 0.5) {
    score *= 0.1;
  } else if (matchRatio < 1.0) {
    score *= (0.4 + matchRatio * 0.6);
  }

  // 5. Expanded (synonym) matches — small bonus
  const synonymWords = expandedWords.filter(w => !originalWords.includes(w));
  for (const word of synonymWords) {
    if (searchable.includes(word)) {
      score += 0.3;
    }
  }

  // 6. Year matching bonus
  const yearMatch = rawQuery.match(/(19\d{2}|20\d{2})/);
  if (yearMatch && searchable.includes(yearMatch[1])) {
    score += 1.5;
  }

  // 7. Barbie relevance boost
  if (titleLower.includes('barbie') || titleLower.includes('mattel')) {
    score += 0.5;
  }

  return score;
}

// ─── MAIN: Enhanced search filter ───
// Returns scored and filtered results from a listings array
function enhancedSearch(listings, query) {
  const queryData = expandQuery(query);

  if (queryData.originalWords.length === 0) {
    return listings; // No meaningful query -> return all
  }

  const scored = listings.map(item => {
    const title = item.title || item.name || '';
    const keywords = item.keywords || [];
    const matchScore = scoreMatch(title, keywords, queryData);
    return { ...item, _matchScore: matchScore };
  });

  // Filter: require a meaningful relevance score
  // With the new scoring, items matching all words score ~6+
  // Items matching 1 out of 2 words score ~1-2
  // Items matching 0 words score negative
  const minScore = 1.5;
  const filtered = scored.filter(item => item._matchScore >= minScore);

  // Sort by score desc, then price asc
  filtered.sort((a, b) => b._matchScore - a._matchScore || a.price - b.price);

  return filtered;
}

module.exports = {
  expandQuery,
  scoreMatch,
  enhancedSearch,
  fuzzyMatch,
  SYNONYM_MAP,
};
