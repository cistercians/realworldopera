const nlp = require('compromise');
const compromiseDates = require('compromise-dates');
const { TfIdf } = require('natural');
const logger = require('../../config/logger');

// Extend compromise with date support
nlp.extend(compromiseDates);

/**
 * NLP Entity Extraction Service
 * Extracts people, places, organizations, dates, and keywords from text
 */

/**
 * Extract all entities from text
 */
function extractFromText(text, sourceUrl = null) {
  if (!text || text.length === 0) {
    return {
      people: [],
      places: [],
      organizations: [],
      dates: [],
      emails: [],
      urls: [],
      keywords: [],
      sentiment: null,
    };
  }

  try {
    const doc = nlp(text);

    // Extract people (names)
    const people = doc.people().out('array')
      .filter(name => name.length > 1) // Filter out single characters
      .map(name => name.trim());

    // Extract places
    const places = doc.places().out('array')
      .filter(place => place.length > 1)
      .map(place => place.trim());

    // Extract organizations (institutions, companies, etc.)
    // Note: compromise doesn't have built-in organization detection,
    // so we'll use a heuristic approach
    const organizations = extractOrganizations(text, doc);

    // Extract dates
    const dates = doc.dates().out('array')
      .map(date => ({
        text: date.text || date,
        parsed: date.start?.iso?.() || null,
      }));

    // Extract emails
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

    // Extract URLs
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];

    // Extract keywords using TF-IDF
    const keywords = extractKeywords(text);

    // Get sentiment - compromise doesn't have built-in sentiment, so we'll skip it
    // or use a simple heuristic if needed
    const sentiment = {
      score: 0,
      comparative: 0,
    };

    const result = {
      people: deduplicateArray(people),
      places: deduplicateArray(places),
      organizations: deduplicateArray(organizations),
      dates: dates.slice(0, 20), // Limit to 20 dates
      emails: [...new Set(emails)],
      urls: [...new Set(urls)],
      keywords: keywords.slice(0, 20), // Top 20 keywords
      sentiment: sentiment,
    };

    logger.info('Entity extraction completed', {
      sourceUrl,
      peopleCount: result.people.length,
      placesCount: result.places.length,
      orgsCount: result.organizations.length,
      datesCount: result.dates.length,
    });

    return result;
  } catch (error) {
    logger.error('Entity extraction failed', { error: error.message });
    return {
      people: [],
      places: [],
      organizations: [],
      dates: [],
      emails: [],
      urls: [],
      keywords: [],
      sentiment: null,
    };
  }
}

/**
 * Extract organizations using heuristics and patterns
 */
function extractOrganizations(text, doc) {
  const orgs = [];

  // Companies ending in Inc, Corp, LLC, Ltd, etc.
  const companyPattern = /\b([A-Z][A-Za-z\s&-]+(?:Inc\.?|Corp\.?|LLC|Ltd\.?|Co\.?|Company|Corporation))\b/g;
  const companies = text.match(companyPattern) || [];
  orgs.push(...companies.map(c => c.trim()));

  // Government agencies, institutions
  const agencyPattern = /\b([A-Z][A-Za-z\s&-]*(?:Agency|Department|Bureau|Administration|Office|Foundation|Institute|University|College))\b/g;
  const agencies = text.match(agencyPattern) || [];
  orgs.push(...agencies.map(a => a.trim()));

  // Look for capitalized phrases (might be organizations)
  const sentences = doc.sentences().out('array');
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    // Look for 2-5 word capitalized phrases
    for (let i = 0; i <= words.length - 2; i++) {
      for (let j = 2; j <= Math.min(5, words.length - i); j++) {
        const phrase = words.slice(i, i + j).join(' ');
        // Check if all words start with capital letter
        if (/^[A-Z][a-z]*(?:\s+[A-Z][a-z]*)+$/.test(phrase)) {
          // Filter out common false positives
          if (!isCommonFalsePositive(phrase)) {
            orgs.push(phrase);
          }
        }
      }
    }
  }

  return deduplicateArray(orgs);
}

/**
 * Check if text is a common false positive for organization names
 */
function isCommonFalsePositive(text) {
  const falsePositives = [
    'United States',
    'New York',
    'Los Angeles',
    'San Francisco',
    'Washington DC',
    'Washington D C',
    'New Jersey',
    'New Mexico',
    'New Hampshire',
    'United Kingdom',
    'Great Britain',
    'United Kingdom of Great Britain',
    'European Union',
    'Asia Pacific',
    'Middle East',
    'North America',
    'South America',
    'Latin America',
    // Add more as needed
  ];
  
  return falsePositives.includes(text);
}

/**
 * Extract keywords using TF-IDF
 */
function extractKeywords(text) {
  try {
    const tfidf = new TfIdf();
    
    // Add the document
    tfidf.addDocument(text);
    
    // Get terms and their TF-IDF scores
    const terms = new Map();
    
    // Extract words directly from text (simpler and more reliable)
    // Split by whitespace and punctuation, then clean
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/) // Split by whitespace
      .filter(word => word.length >= 3) // Only words 3+ chars
      .filter(word => !isStopWord(word)); // Filter stop words
    
    // Get unique words
    const uniqueWords = [...new Set(words)];
    
    // Get TF-IDF scores for all terms
    const tfidfTerms = tfidf.listTerms(0, Infinity);
    
    // Match our words with TF-IDF scores
    for (const word of uniqueWords) {
      const tfidfTerm = tfidfTerms.find(item => 
        item.term.toLowerCase() === word.toLowerCase()
      );
      
      if (tfidfTerm && tfidfTerm.tfidf > 0) {
        if (!terms.has(word)) {
          terms.set(word, {
            term: word,
            score: tfidfTerm.tfidf,
            original: word,
          });
        }
      }
    }
    
    // Sort by TF-IDF score and return top terms
    return Array.from(terms.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20) // Top 20
      .map(item => item.original);
      
  } catch (error) {
    logger.error('Keyword extraction failed', { error: error.message, stack: error.stack });
    return [];
  }
}

/**
 * Check if word is a stop word
 */
function isStopWord(word) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'him', 'her', 'his', 'hers', 'its', 'our', 'their', 'who', 'what',
    'where', 'when', 'why', 'how', 'which', 'whom', 'whose', 'there',
    'then', 'than', 'more', 'most', 'other', 'some', 'many', 'much',
  ]);
  
  return stopWords.has(word.toLowerCase());
}

/**
 * Deduplicate array while preserving order
 */
function deduplicateArray(arr) {
  const seen = new Set();
  const result = [];
  
  for (const item of arr) {
    const lower = item.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(item);
    }
  }
  
  return result;
}

/**
 * Normalize entity name for comparison
 */
function normalizeEntity(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/[^\w\s-]/g, ''); // Remove special chars
}

/**
 * Check if two entities are the same (fuzzy matching)
 */
function areEntitiesSame(entity1, entity2, threshold = 0.85) {
  const norm1 = normalizeEntity(entity1);
  const norm2 = normalizeEntity(entity2);
  
  // Exact match
  if (norm1 === norm2) return true;
  
  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }
  
  // Levenshtein distance similarity
  const similarity = calculateSimilarity(norm1, norm2);
  return similarity >= threshold;
}

/**
 * Calculate similarity between two strings (simple implementation)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  // Simple word overlap similarity
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = words1.size + words2.size - intersection;
  
  return union === 0 ? 0 : intersection / union;
}

module.exports = {
  extractFromText,
  extractOrganizations,
  extractKeywords,
  normalizeEntity,
  areEntitiesSame,
  calculateSimilarity,
};

