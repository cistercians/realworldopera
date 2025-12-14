const logger = require('../../config/logger');

/**
 * Query Generator Service
 * Creates search query combinations from project items
 */

/**
 * Generate search queries from project items
 */
function generateQueries(items, options = {}) {
  const maxQueries = options.maxQueries || 50;
  const maxCombinations = options.maxCombinations || 3; // Max 3 items per query

  const entities = items.filter(i => i.type === 'entity');
  const organizations = items.filter(i => i.type === 'organization');
  const keywords = items.filter(i => i.type === 'keyword');
  const locations = items.filter(i => i.type === 'location');

  const queries = [];
  
  // Strategy 1: Single item queries
  for (const item of [...entities, ...organizations, ...keywords]) {
    queries.push({
      query: item.name,
      items: [item],
      priority: 1,
    });
  }

  // Strategy 2: Entity + Keyword combinations
  for (const entity of entities.slice(0, 10)) { // Limit to first 10 to avoid explosion
    for (const keyword of keywords.slice(0, 10)) {
      queries.push({
        query: `"${entity.name}" ${keyword.name}`,
        items: [entity, keyword],
        priority: 2,
      });
    }
  }

  // Strategy 3: Entity + Location combinations
  for (const entity of entities.slice(0, 10)) {
    for (const location of locations.slice(0, 10)) {
      queries.push({
        query: `"${entity.name}" "${location.name}"`,
        items: [entity, location],
        priority: 3,
      });
    }
  }

  // Strategy 4: Organization + Location
  for (const org of organizations.slice(0, 5)) {
    for (const location of locations.slice(0, 10)) {
      queries.push({
        query: `"${org.name}" "${location.name}"`,
        items: [org, location],
        priority: 2,
      });
    }
  }

  // Strategy 5: Triple combinations (Entity + Keyword + Location)
  if (maxCombinations >= 3) {
    for (const entity of entities.slice(0, 5)) {
      for (const keyword of keywords.slice(0, 5)) {
        for (const location of locations.slice(0, 5)) {
          queries.push({
            query: `"${entity.name}" ${keyword.name} "${location.name}"`,
            items: [entity, keyword, location],
            priority: 3,
          });
        }
      }
    }
  }

  // Strategy 6: Special queries for specific combinations
  // Entity + Organization
  for (const entity of entities.slice(0, 10)) {
    for (const org of organizations.slice(0, 5)) {
      queries.push({
        query: `"${entity.name}" "${org.name}"`,
        items: [entity, org],
        priority: 2,
      });
    }
  }

  // Sort by priority (lower = more important)
  queries.sort((a, b) => a.priority - b.priority);

  // Limit to maxQueries
  const finalQueries = queries.slice(0, maxQueries);

  logger.info('Generated search queries', {
    totalGenerated: queries.length,
    finalCount: finalQueries.length,
    entityCount: entities.length,
    keywordCount: keywords.length,
    locationCount: locations.length,
    orgCount: organizations.length,
  });

  return finalQueries;
}

/**
 * Generate smart queries based on investigation type
 */
function generateSmartQueries(items, investigationType = 'general') {
  const baseQueries = generateQueries(items, { maxQueries: 100 });
  
  let filteredQueries = baseQueries;

  // Filter and reorder based on investigation type
  switch (investigationType) {
    case 'person':
      // Prioritize entity-centric queries
      filteredQueries = baseQueries.filter(q => 
        q.items.some(i => i.type === 'entity')
      ).sort((a, b) => {
        // Single entity queries first
        if (a.items.length === 1 && a.items[0].type === 'entity') return -1;
        if (b.items.length === 1 && b.items[0].type === 'entity') return 1;
        return a.priority - b.priority;
      });
      break;

    case 'organization':
      // Prioritize organization-centric queries
      filteredQueries = baseQueries.filter(q => 
        q.items.some(i => i.type === 'organization')
      );
      break;

    case 'location':
      // Prioritize location-centric queries
      filteredQueries = baseQueries.filter(q => 
        q.items.some(i => i.type === 'location')
      );
      break;

    case 'keyword':
      // Prioritize keyword expansion
      filteredQueries = baseQueries.filter(q => 
        q.items.some(i => i.type === 'keyword')
      );
      break;

    default:
      filteredQueries = baseQueries;
  }

  return filteredQueries.slice(0, 50);
}

/**
 * Deduplicate queries by string similarity
 */
function deduplicateQueries(queries, similarityThreshold = 0.9) {
  const deduplicated = [];
  const seen = new Set();

  for (const query of queries) {
    const normalized = query.query.toLowerCase().trim();
    
    let isDuplicate = false;
    for (const seenQuery of seen) {
      const similarity = calculateSimilarity(normalized, seenQuery);
      if (similarity >= similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.add(normalized);
      deduplicated.push(query);
    }
  }

  return deduplicated;
}

/**
 * Simple similarity calculation between two strings
 */
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;

  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));

  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);

  return intersection.length / union.size;
}

/**
 * Expand query with related terms
 */
function expandQuery(query, relatedTerms = []) {
  const expanded = [query];

  for (const term of relatedTerms.slice(0, 3)) {
    expanded.push(`${query} ${term}`);
  }

  return expanded;
}

module.exports = {
  generateQueries,
  generateSmartQueries,
  deduplicateQueries,
  expandQuery,
};

