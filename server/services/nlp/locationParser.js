const nlp = require('compromise');
const logger = require('../../config/logger');
// Import getCoords from global scope (defined in utils.js)
const getCoords = global.getCoords;

/**
 * Location Parser Service
 * Extracts and geocodes location entities from text
 */

/**
 * Extract and geocode locations from text
 */
async function extractAndGeocode(text, sourceUrl = null) {
  if (!text || text.length === 0) {
    return [];
  }

  const locations = [];

  try {
    const doc = nlp(text);

    // Extract places using compromise
    const places = doc.places().out('array');

    // Extract addresses using regex patterns
    const addresses = extractAddresses(text);

    // Combine all location candidates
    const candidates = [...new Set([...places, ...addresses])];

    logger.info('Extracted location candidates', {
      sourceUrl,
      count: candidates.length,
      candidates: candidates.slice(0, 5),
    });

    // Geocode each candidate
    for (const location of candidates) {
      try {
        const geocodeData = await getCoords(location);

        if (geocodeData) {
          locations.push({
            name: location.toLowerCase(),
            address: geocodeData.formattedAddress || location,
            coordinates: {
              latitude: geocodeData.latitude,
              longitude: geocodeData.longitude,
            },
            city: geocodeData.city,
            state: geocodeData.state,
            country: geocodeData.country,
            confidence: 'high', // Geocoded successfully
          });

          logger.info('Location geocoded', {
            location,
            address: geocodeData.formattedAddress,
          });
        } else {
          // Still add to list but with lower confidence
          locations.push({
            name: location.toLowerCase(),
            address: location,
            coordinates: null,
            city: null,
            state: null,
            country: null,
            confidence: 'low', // Could not geocode
          });

          logger.warn('Location could not be geocoded', { location });
        }
      } catch (error) {
        logger.error('Geocoding error', {
          location,
          error: error.message,
        });
      }

      // Rate limit geocoding requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info('Location extraction complete', {
      sourceUrl,
      extractedCount: locations.length,
      geocodedCount: locations.filter(l => l.confidence === 'high').length,
    });

    return locations;
  } catch (error) {
    logger.error('Location extraction failed', {
      sourceUrl,
      error: error.message,
    });
    return [];
  }
}

/**
 * Extract addresses using regex patterns
 */
function extractAddresses(text) {
  const addresses = [];

  // Street addresses: 123 Main St, New York, NY
  const streetPattern = /\b\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Circle|Cir|Court|Ct)[,\s]+[\w\s]+/gi;
  const streetMatches = text.match(streetPattern) || [];
  addresses.push(...streetMatches.map(addr => addr.trim()));

  // Postal addresses: P.O. Box 123, City, State 12345
  const poBoxPattern = /P\.?O\.?\s+Box\s+\d+[,\s]+[\w\s]+/gi;
  const poBoxMatches = text.match(poBoxPattern) || [];
  addresses.push(...poBoxMatches.map(addr => addr.trim()));

  // City, State patterns
  const cityStatePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})\b/g;
  const cityStateMatches = text.match(cityStatePattern) || [];
  addresses.push(...cityStateMatches.map(addr => addr.trim()));

  return addresses;
}

/**
 * Extract city names from text
 */
function extractCities(text) {
  const doc = nlp(text);
  const places = doc.places().out('array');

  // Filter to likely cities (places with more than one word, ending with common city suffixes)
  const cities = places.filter(place => {
    const lower = place.toLowerCase();
    return (
      place.split(/\s+/).length <= 3 && // Max 3 words
      !lower.includes('street') &&
      !lower.includes('avenue') &&
      !lower.includes('road') &&
      place.length > 3
    );
  });

  return cities;
}

/**
 * Extract countries from text
 */
function extractCountries(text) {
  // Common countries list
  const countries = [
    'United States', 'USA', 'US',
    'United Kingdom', 'UK',
    'Canada', 'France', 'Germany', 'Italy', 'Spain',
    'Australia', 'New Zealand', 'Japan', 'China', 'India',
    'Brazil', 'Mexico', 'Argentina', 'South Africa',
    'Russia', 'South Korea', 'North Korea',
  ];

  const found = [];
  for (const country of countries) {
    if (text.includes(country)) {
      found.push(country);
    }
  }

  return found;
}

/**
 * Normalize location name
 */
function normalizeLocation(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/i, '') // Remove leading "The"
    .replace(/,$/, ''); // Remove trailing comma
}

/**
 * Check if two locations are the same
 */
function areLocationsSame(loc1, loc2, threshold = 0.85) {
  const norm1 = normalizeLocation(loc1);
  const norm2 = normalizeLocation(loc2);

  // Exact match
  if (norm1 === norm2) return true;

  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }

  // Fuzzy matching for abbreviations (NY vs New York)
  if (areAbbreviationsOf(norm1, norm2) || areAbbreviationsOf(norm2, norm1)) {
    return true;
  }

  return false;
}

/**
 * Check if one string is an abbreviation of another
 */
function areAbbreviationsOf(short, long) {
  if (short.length >= long.length) return false;

  // Common abbreviations
  const abbreviations = {
    'ny': 'new york',
    'nyc': 'new york city',
    'la': 'los angeles',
    'sf': 'san francisco',
    'dc': 'washington dc',
    'uk': 'united kingdom',
    'us': 'united states',
    'usa': 'united states',
  };

  return abbreviations[short] === long;
}

/**
 * Geocode a single address (simplified wrapper)
 */
async function geocode(address) {
  if (!address) {
    return [];
  }

  try {
    logger.info('🔍 Starting geocode', { address });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=10&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'RealWorldOpera/1.0 (research tool)',
        },
      }
    );

    if (!response.ok) {
      logger.error('❌ Geocoding API error', { status: response.status });
      return [];
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      logger.warn('⚠️ No results found', { address });
      return [];
    }

    // Transform to our format
    const results = data.map(item => {
      return {
        coords: {
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        },
        address: item.display_name || address,
      };
    });

    logger.info('✅ Geocoding successful', { resultsCount: results.length });
    return results;

  } catch (error) {
    logger.error('❌ Geocoding error', { error: error.message, stack: error.stack, address });
    return [];
  }
}

module.exports = {
  extractAndGeocode,
  extractAddresses,
  extractCities,
  extractCountries,
  normalizeLocation,
  areLocationsSame,
  geocode,
};

