const { areEntitiesSame, calculateSimilarity } = require('../nlp/entityExtractor');
const { areLocationsSame } = require('../nlp/locationParser');
const stringSimilarity = require('string-similarity');
const logger = require('../../config/logger');

/**
 * Cross-Reference Service
 * Compares newly extracted entities with existing project items
 */

/**
 * Cross-reference extracted entities with existing items
 */
function crossReference(findings, existingItems) {
  const results = [];

  for (const finding of findings) {
    const match = findBestMatch(finding, existingItems);

    if (match) {
      results.push({
        finding,
        matchedItem: match.item,
        confidence: match.confidence,
        isNew: false,
      });
    } else {
      results.push({
        finding,
        matchedItem: null,
        confidence: 1.0, // High confidence it's new
        isNew: true,
      });
    }
  }

  return results;
}

/**
 * Find best matching item for a finding
 */
function findBestMatch(finding, existingItems) {
  if (!finding || !existingItems || existingItems.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const item of existingItems) {
    const score = calculateMatchScore(finding, item);

    if (score > bestScore && score >= 0.7) {
      // Require at least 70% similarity to consider a match
      bestScore = score;
      bestMatch = {
        item,
        confidence: score,
      };
    }
  }

  return bestMatch;
}

/**
 * Calculate similarity score between a finding and an item
 */
function calculateMatchScore(finding, item) {
  if (!finding.name && !finding.address) {
    return 0;
  }

  const findingName = finding.name || finding.address || '';
  const itemName = item.name || '';

  // Use different matching strategies based on item type
  switch (item.type) {
    case 'location':
      return calculateLocationMatchScore(finding, item);

    case 'entity':
    case 'organization':
      return calculateEntityMatchScore(finding, item);

    default:
      // Generic string similarity
      return stringSimilarity.compareTwoStrings(
        findingName.toLowerCase(),
        itemName.toLowerCase()
      );
  }
}

/**
 * Calculate location matching score
 */
function calculateLocationMatchScore(finding, item) {
  let score = 0;

  // Check if locations are same using location parser
  const findingName = finding.name || finding.address || '';
  const itemName = item.name || '';

  if (areLocationsSame(findingName, itemName)) {
    score = 0.95;
  } else {
    // Try string similarity
    score = stringSimilarity.compareTwoStrings(
      findingName.toLowerCase(),
      itemName.toLowerCase()
    );
  }

  // Bonus if addresses match
  if (finding.address && item.data?.address) {
    if (finding.address.toLowerCase() === item.data.address.toLowerCase()) {
      score = Math.max(score, 0.9);
    }
  }

  // Bonus if coordinates are close
  if (finding.coordinates && item.coords) {
    const distance = calculateDistance(
      finding.coordinates.latitude,
      finding.coordinates.longitude,
      item.coords.latitude,
      item.coords.longitude
    );

    // If within 100 meters, consider them the same
    if (distance < 100) {
      score = Math.max(score, 0.95);
    } else if (distance < 1000) {
      // Within 1km, boost score slightly
      score = Math.max(score, 0.85);
    }
  }

  return score;
}

/**
 * Calculate entity matching score
 */
function calculateEntityMatchScore(finding, item) {
  const findingName = finding.name || '';
  const itemName = item.name || '';

  // Use entity matcher
  if (areEntitiesSame(findingName, itemName, 0.85)) {
    return 0.95;
  }

  // Try string similarity
  const similarity = stringSimilarity.compareTwoStrings(
    findingName.toLowerCase(),
    itemName.toLowerCase()
  );

  return similarity;
}

/**
 * Calculate distance between two coordinates in meters (Haversine)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Generate confidence score for a finding
 */
function generateConfidenceScore(finding, source, context) {
  let score = 0;

  // Base confidence on source credibility
  if (source && source.credibility_score) {
    score += source.credibility_score / 10 * 0.3; // Up to 30% from source
  } else {
    score += 0.15; // Default medium-low source credibility
  }

  // Boost if entity appears multiple times in source
  if (context && context.mentionCount > 1) {
    score += Math.min(context.mentionCount * 0.05, 0.2);
  }

  // Boost if multiple sources mention the same entity
  // (Would need to track across sources - not implemented yet)

  // Boost based on source type
  if (source) {
    switch (source.source_type) {
      case 'news':
        score += 0.1;
        break;
      case 'public_record':
        score += 0.15;
        break;
      case 'web':
        score += 0.05;
        break;
    }
  }

  // Cap at 1.0
  return Math.min(score, 1.0);
}

/**
 * Filter findings by confidence threshold
 */
function filterByConfidence(findings, minConfidence = 0.5) {
  return findings.filter(finding => {
    const confidence = finding.confidence || 0;
    return confidence >= minConfidence;
  });
}

/**
 * Deduplicate findings by name/location
 */
function deduplicateFindings(findings) {
  const seen = new Map();
  const deduplicated = [];

  for (const finding of findings) {
    const key = (finding.name || finding.address || '').toLowerCase().trim();

    if (!seen.has(key)) {
      seen.set(key, finding);
      deduplicated.push(finding);
    } else {
      // Merge with existing finding (keep higher confidence)
      const existing = seen.get(key);
      if (finding.confidence > existing.confidence) {
        seen.set(key, finding);
      }
    }
  }

  return Array.from(seen.values());
}

module.exports = {
  crossReference,
  findBestMatch,
  calculateMatchScore,
  generateConfidenceScore,
  filterByConfidence,
  deduplicateFindings,
};

