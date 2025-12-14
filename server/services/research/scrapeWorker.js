const logger = require('../../config/logger');
const webScraper = require('../osint/webScraper');
const entityExtractor = require('../nlp/entityExtractor');
const locationParser = require('../nlp/locationParser');
const config = require('../../config');

/**
 * Scraping Worker for Approved Findings
 * Scrapes approved finding source URLs and extracts new entities
 */
class ScrapeWorker {
  async execute(data, job) {
    const { reviewId, sourceUrl, projectId, findingType, userId } = data;

    logger.info('Scraping worker started', {
      reviewId,
      sourceUrl,
      projectId,
      findingType,
      jobId: job.id,
    });

    // Debug: Log that worker is being called
    console.log('[SCRAPE WORKER] Starting job:', { reviewId, sourceUrl, projectId });

    // Validate URL
    if (!sourceUrl || typeof sourceUrl !== 'string') {
      throw new Error('Invalid source URL');
    }

    // Check if URL is scrapeable
    if (!webScraper.isScrapeable(sourceUrl)) {
      logger.info('URL is not scrapeable', { sourceUrl });
      return {
        scraped: false,
        reason: 'url_not_scrapeable',
        entitiesFound: 0,
        entitiesAdded: 0,
        skipped: 0,
      };
    }

    try {
      // Scrape the URL
      const scrapedContent = await webScraper.scrapeUrl(sourceUrl, {
        timeout: config.scrapingTimeout || 10000,
      });

      // Validate scraped content
      if (!scrapedContent || !scrapedContent.content) {
        logger.warn('No content scraped', { sourceUrl, error: scrapedContent?.error, blocked: scrapedContent?.blocked });
        console.log('[SCRAPE WORKER] No content scraped:', { sourceUrl, error: scrapedContent?.error, blocked: scrapedContent?.blocked });
        
        // Check if it was blocked by anti-bot protection
        if (scrapedContent?.blocked || scrapedContent?.statusCode === 999) {
          return {
            scraped: false,
            reason: 'blocked',
            error: scrapedContent?.error || 'Blocked by anti-bot protection',
            entitiesFound: 0,
            entitiesAdded: 0,
            skipped: 0,
          };
        }
        
        return {
          scraped: false,
          reason: 'no_content',
          error: scrapedContent?.error,
          entitiesFound: 0,
          entitiesAdded: 0,
          skipped: 0,
        };
      }

      // Check minimum content length
      if (scrapedContent.content.length < 100) {
        logger.warn('Scraped content too short', {
          sourceUrl,
          length: scrapedContent.content.length,
        });
        console.log('[SCRAPE WORKER] Content too short:', { sourceUrl, length: scrapedContent.content.length });
        return {
          scraped: false,
          reason: 'content_too_short',
          entitiesFound: 0,
          entitiesAdded: 0,
          skipped: 0,
        };
      }

      console.log('[SCRAPE WORKER] Content scraped successfully:', {
        sourceUrl,
        contentLength: scrapedContent.content.length,
        wordCount: scrapedContent.wordCount,
      });

      // Extract entities from scraped content
      const extracted = entityExtractor.extractFromText(scrapedContent.content, sourceUrl);
      console.log('[SCRAPE WORKER] Entities extracted:', {
        people: extracted.people.length,
        organizations: extracted.organizations.length,
        places: extracted.places.length,
        keywords: extracted.keywords.length,
      });

      // Extract and geocode locations
      const locations = await locationParser.extractAndGeocode(
        scrapedContent.content,
        sourceUrl
      );
      console.log('[SCRAPE WORKER] Locations extracted:', { count: locations.length });

      // Get existing project items for deduplication
      const existingItems = global.MEMORY_ITEMS[projectId] || [];
      
      // Get the review queue - need to require fresh to get the actual reference
      // Since modules are cached, this should work, but let's be explicit
      const researchModule = require('../../js/research');
      if (!researchModule.MEMORY_REVIEW_QUEUE) {
        throw new Error('MEMORY_REVIEW_QUEUE not found in research module');
      }
      const reviewQueue = researchModule.MEMORY_REVIEW_QUEUE;

      // Counters
      let entitiesAdded = 0;
      let entitiesSkipped = 0;
      const maxEntitiesPerType = {
        people: 10,
        organizations: 10,
        locations: 10,
        keywords: 20,
      };

      // Helper to get context snippet
      const getContextSnippet = (text, entityName, maxLength = 200) => {
        const index = text.toLowerCase().indexOf(entityName.toLowerCase());
        if (index === -1) return text.substring(0, maxLength);
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + entityName.length + 150);
        return text.substring(start, end).trim();
      };

      // Helper to check if entity already exists
      const isDuplicate = (name, type) => {
        const normalizedName = name.toLowerCase().trim();

        // Check existing project items
        for (const item of existingItems) {
          if (item.type === type && item.name.toLowerCase().trim() === normalizedName) {
            return true;
          }
          // Fuzzy matching for entities
          if (type === 'entity' && item.type === 'entity') {
            if (entityExtractor.areEntitiesSame(item.name, name)) {
              return true;
            }
          }
        }

        // Check review queue for pending items
        for (const review of reviewQueue) {
          if (review.projectId === projectId && !review.reviewed) {
            const reviewName = review.extractedData?.name || review.extractedData?.address;
            if (reviewName && reviewName.toLowerCase().trim() === normalizedName) {
              return true;
            }
            // Fuzzy matching
            if (type === 'entity' && review.findingType === 'entity') {
              if (entityExtractor.areEntitiesSame(reviewName, name)) {
                return true;
              }
            }
          }
        }

        return false;
      };

      // Process people (entities)
      const peopleToAdd = extracted.people
        .slice(0, maxEntitiesPerType.people)
        .filter((person) => !isDuplicate(person, 'entity'));

      console.log('[SCRAPE WORKER] People processing:', {
        total: extracted.people.length,
        afterLimit: extracted.people.slice(0, maxEntitiesPerType.people).length,
        afterDedup: peopleToAdd.length,
      });

      for (const person of peopleToAdd) {
        const reviewItem = {
          id: `review-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          cycleId: null,
          projectId: projectId,
          findingType: 'entity',
          extractedData: {
            name: person,
          },
          confidence: 5.5, // Lower confidence for scraped entities
          contextSnippet: getContextSnippet(scrapedContent.content, person),
          sourceUrl: sourceUrl,
          reviewed: false,
          status: null,
          scrapedFrom: reviewId,
        };

        reviewQueue.push(reviewItem);
        entitiesAdded++;
        console.log('[SCRAPE WORKER] Added entity to review queue:', {
          name: person,
          reviewId: reviewItem.id,
          queueLength: reviewQueue.length,
        });
      }

      entitiesSkipped += extracted.people.length - peopleToAdd.length;

      // Process organizations
      const orgsToAdd = extracted.organizations
        .slice(0, maxEntitiesPerType.organizations)
        .filter((org) => !isDuplicate(org, 'organization'));

      for (const org of orgsToAdd) {
        const reviewItem = {
          id: `review-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          cycleId: null,
          projectId: projectId,
          findingType: 'organization',
          extractedData: {
            name: org,
          },
          confidence: 5.5,
          contextSnippet: getContextSnippet(scrapedContent.content, org),
          sourceUrl: sourceUrl,
          reviewed: false,
          status: null,
          scrapedFrom: reviewId,
        };

        reviewQueue.push(reviewItem);
        entitiesAdded++;
      }

      entitiesSkipped += extracted.organizations.length - orgsToAdd.length;

      // Process locations
      const locationsToAdd = locations
        .filter((loc) => loc.confidence === 'high')
        .slice(0, maxEntitiesPerType.locations)
        .filter((loc) => !isDuplicate(loc.name, 'location'));

      for (const location of locationsToAdd) {
        const reviewItem = {
          id: `review-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          cycleId: null,
          projectId: projectId,
          findingType: 'location',
          extractedData: {
            name: location.name,
            address: location.address,
            coords: location.coordinates,
          },
          confidence: 6.0, // Slightly higher for geocoded locations
          contextSnippet: getContextSnippet(scrapedContent.content, location.name),
          sourceUrl: sourceUrl,
          reviewed: false,
          status: null,
          scrapedFrom: reviewId,
        };

        reviewQueue.push(reviewItem);
        entitiesAdded++;
      }

      entitiesSkipped += locations.length - locationsToAdd.length;

      // Process keywords
      const keywordsToAdd = extracted.keywords
        .slice(0, maxEntitiesPerType.keywords)
        .filter((keyword) => {
          // Filter out very short keywords and check duplicates
          return (
            keyword.length >= 3 &&
            !isDuplicate(keyword, 'keyword')
          );
        });

      for (const keyword of keywordsToAdd) {
        const reviewItem = {
          id: `review-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          cycleId: null,
          projectId: projectId,
          findingType: 'keyword',
          extractedData: {
            name: keyword,
          },
          confidence: 5.0, // Lower confidence for keywords
          contextSnippet: getContextSnippet(scrapedContent.content, keyword),
          sourceUrl: sourceUrl,
          reviewed: false,
          status: null,
          scrapedFrom: reviewId,
        };

        reviewQueue.push(reviewItem);
        entitiesAdded++;
      }

      entitiesSkipped += extracted.keywords.length - keywordsToAdd.length;

      const totalFound =
        extracted.people.length +
        extracted.organizations.length +
        locations.length +
        extracted.keywords.length;

      // Verify review queue was updated
      const finalQueueLength = researchModule.MEMORY_REVIEW_QUEUE.length;
      console.log('[SCRAPE WORKER] Final review queue length:', finalQueueLength);

      logger.info('Scraping worker completed', {
        reviewId,
        sourceUrl,
        projectId,
        totalFound,
        entitiesAdded,
        entitiesSkipped,
        jobId: job.id,
        finalQueueLength,
      });

      // Debug: Log results
      console.log('[SCRAPE WORKER] Completed:', {
        scraped: true,
        entitiesFound: totalFound,
        entitiesAdded: entitiesAdded,
        skipped: entitiesSkipped,
        reviewQueueLength: finalQueueLength,
        breakdown: {
          people: peopleToAdd.length,
          organizations: orgsToAdd.length,
          locations: locationsToAdd.length,
          keywords: keywordsToAdd.length,
        },
      });

      return {
        scraped: true,
        entitiesFound: totalFound,
        entitiesAdded: entitiesAdded,
        skipped: entitiesSkipped,
        breakdown: {
          people: peopleToAdd.length,
          organizations: orgsToAdd.length,
          locations: locationsToAdd.length,
          keywords: keywordsToAdd.length,
        },
      };
    } catch (error) {
      logger.error('Scraping worker error', {
        reviewId,
        sourceUrl,
        projectId,
        error: error.message,
        stack: error.stack,
        jobId: job.id,
      });

      // Don't throw - return error result instead
      return {
        scraped: false,
        reason: 'error',
        error: error.message,
        entitiesFound: 0,
        entitiesAdded: 0,
        skipped: 0,
      };
    }
  }
}

module.exports = new ScrapeWorker();
