const logger = require('../config/logger');
const searchEngine = require('../services/osint/searchEngine');

// In-memory research storage
const MEMORY_CYCLES = {};
const MEMORY_SOURCES = {};
const MEMORY_REVIEW_QUEUE = [];
const MEMORY_SEARCH_QUERIES = {};

let cycleCounter = 0;

/**
 * Start a research cycle
 */
async function startResearch(socket) {
  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  try {
    // Get project items for query generation
    const items = getProjectItemsInMemory(socket.projectId);
    
    logger.info('Starting research', { projectId: socket.projectId, itemsCount: items.length });

    if (!items || items.length === 0) {
      socket.emit('notif', { msg: 'no items in project to search' });
      socket.emit('chat', { msg: 'add items with +entity, +loc, or +coords' });
      return;
    }

    socket.emit('chat', { msg: 'starting research cycle...' });
    
    // Create cycle
    cycleCounter++;
    const cycle = {
      id: `cycle-${Date.now()}-${cycleCounter}`,
      projectId: socket.projectId,
      cycleNumber: cycleCounter,
      status: 'generating_queries',
      startedAt: new Date().toISOString(),
      sourcesFound: 0,
      findingsQueued: 0,
    };

    MEMORY_CYCLES[cycle.id] = cycle;
    MEMORY_SEARCH_QUERIES[cycle.id] = [];

    // Generate simple queries from items
    const queries = generateSimpleQueries(items);
    logger.info('Queries generated', { queryCount: queries.length, queries: queries.map(q => q.query) });
    socket.emit('chat', { msg: `generated ${queries.length} search queries` });

    // Update status
    cycle.status = 'searching';
    socket.emit('chat', { msg: 'searching the web...' });
    
    // Execute real searches
    const allSources = [];
    for (const queryDef of queries) {
      try {
        logger.info('Searching', { query: queryDef.query });
        const results = await searchEngine.searchAll(queryDef.query, { maxResults: 5 });
        logger.info('Search results', { query: queryDef.query, resultCount: results.length });
        
        for (const result of results) {
          allSources.push({
            id: `source-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            provider: result.provider,
            cycleId: cycle.id,
            query: queryDef.query,
          });
        }
        
        if (allSources.length % 5 === 0) {
          socket.emit('chat', { msg: `found ${allSources.length} sources...` });
        }
      } catch (error) {
        logger.error('Search failed', { query: queryDef.query, error: error.message, stack: error.stack });
      }
    }
    
    logger.info('All searches complete', { totalSources: allSources.length });
    
    cycle.status = 'scraping';
    socket.emit('chat', { msg: `analyzing ${allSources.length} sources...` });
    
    // Extract findings from snippets
    const findings = [];
    for (const source of allSources) {
      const extracted = extractFindingsFromSnippet(source);
      findings.push(...extracted);
    }
    
    socket.emit('chat', { msg: `extracted ${findings.length} findings from ${allSources.length} sources` });
    
    cycle.status = 'completed';
    cycle.completedAt = new Date().toISOString();
    cycle.sourcesFound = allSources.length;
    cycle.findingsQueued = findings.length;

    // Add to review queue
    for (const finding of findings) {
      const reviewItem = {
        id: `review-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        cycleId: cycle.id,
        projectId: socket.projectId,
        findingType: finding.type,
        extractedData: finding,
        confidence: finding.confidence || 7.5,
        contextSnippet: finding.context || '',
        sourceUrl: finding.sourceUrl || 'https://example.com',
        reviewed: false,
      };
      MEMORY_REVIEW_QUEUE.push(reviewItem);
    }

    socket.emit('chat', { msg: `research complete: ${cycle.sourcesFound} sources found` });
    socket.emit('chat', { msg: `${cycle.findingsQueued} findings queued for review` });
    socket.emit('chat', { msg: 'use /review to open findings panel' });
    
    logger.info('Research cycle started', { cycleId: cycle.id, projectId: socket.projectId });
    
  } catch (error) {
    logger.error('Start research failed', { error: error.message });
    socket.emit('notif', { msg: 'failed to start research' });
  }
}

/**
 * Generate queries from project items
 * All items are treated equally regardless of type (entity, location, keyword)
 * Generates all pairs and uses quoted syntax to ensure both terms are present
 */
function generateSimpleQueries(items) {
  const queries = [];
  
  if (!items || items.length === 0) {
    return queries;
  }

  // Need at least 2 items to generate pairs
  if (items.length < 2) {
    return queries;
  }

  // Helper to format terms for search engines
  // For DuckDuckGo HTML scraping, use AND operator instead of quotes
  // Format: term1 AND term2 ensures both terms are present
  const formatTerm = (term) => {
    // Remove quotes if present
    const cleaned = term.trim().replace(/^["']|["']$/g, '');
    return cleaned;
  };

  // Generate all pairs from all items (regardless of type)
  // This ensures A+B, A+C, B+C, etc. for any combination of items
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const item1 = items[i];
      const item2 = items[j];
      
      // Use AND operator to ensure BOTH terms are present in results
      // Format: term1 AND term2 - works better with DuckDuckGo HTML scraping
      // Most search engines interpret AND as requiring both terms
      queries.push({
        query: `${formatTerm(item1.name)} AND ${formatTerm(item2.name)}`,
        items: [item1, item2],
      });
    }
  }

  // Limit total queries to prevent overwhelming the system
  const maxQueries = 20;
  return queries.slice(0, maxQueries);
}

/**
 * Extract findings from search result snippets
 */
function extractFindingsFromSnippet(source) {
  const findings = [];
  const text = source.snippet || '';
  const lowerText = text.toLowerCase();
  
  // Strip HTML entities and tags from snippet
  const cleanText = text.replace(/&[a-z]+;/gi, ' ').replace(/<[^>]*>/g, ' ');
  
  // Look for potential entities (capitalized words, common names)
  const entityMatches = cleanText.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g);
  if (entityMatches && entityMatches.length > 0) {
    for (const match of entityMatches.slice(0, 2)) {
      findings.push({
        type: 'entity',
        name: match.trim(),
        sourceUrl: source.url,
        context: text.substring(0, 200), // Limit context length
        confidence: 6.0,
      });
    }
  }
  
  // Look for locations (city, state patterns, "in [location]", etc.)
  const locationMatches = cleanText.match(/\b(?:in|at|from|near|located in)\s+([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/g);
  if (locationMatches && locationMatches.length > 0) {
    for (const match of locationMatches.slice(0, 2)) {
      const locationName = match.replace(/^(?:in|at|from|near|located in)\s+/i, '').trim();
      findings.push({
        type: 'location',
        name: locationName.split(',')[0], // Just the city
        address: locationName,
        coords: null, // Would need to geocode
        sourceUrl: source.url,
        context: text.substring(0, 200),
        confidence: 6.5,
      });
    }
  }
  
  // If no specific findings, at least add the title as a general keyword finding
  if (findings.length === 0 && source.title) {
    findings.push({
      type: 'keyword',
      name: source.title.trim(),
      sourceUrl: source.url,
      context: text.substring(0, 200),
      confidence: 5.0,
    });
  }
  
  return findings;
}

/**
 * Get project items (helper function)
 */
function getProjectItemsInMemory(projectId) {
  return global.MEMORY_ITEMS[projectId] || [];
}

/**
 * Stop a research cycle
 */
async function stopResearch(socket) {
  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  socket.emit('chat', { msg: 'stopping research cycle...' });
  socket.emit('chat', { msg: 'cycle stopped (in-memory mode)' });
}

/**
 * Show research status
 */
async function researchStatus(socket) {
  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  // Count cycles for this project
  const cycles = Object.values(MEMORY_CYCLES).filter(c => c.projectId === socket.projectId);
  const pendingReviews = MEMORY_REVIEW_QUEUE.filter(r => !r.reviewed && r.projectId === socket.projectId);

  socket.emit('chat', { msg: `research cycles: ${cycles.length}` });
  socket.emit('chat', { msg: `pending reviews: ${pendingReviews.length}` });
  
  if (cycles.length > 0) {
    const lastCycle = cycles[cycles.length - 1];
    socket.emit('chat', { msg: `last cycle: ${lastCycle.status}` });
  }
}

/**
 * Show review queue
 */
async function showReviewQueue(socket) {
  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  // Get all reviews for this project (including reviewed ones for display)
  const allReviews = MEMORY_REVIEW_QUEUE.filter(r => r.projectId === socket.projectId);
  const pendingReviews = allReviews.filter(r => !r.reviewed);

  if (pendingReviews.length === 0 && allReviews.length === 0) {
    socket.emit('chat', { msg: 'no pending reviews' });
    return;
  }

  // Emit notification to chat
  if (pendingReviews.length > 0) {
    socket.emit('chat', { msg: `opening research findings... (${pendingReviews.length} pending)` });
  } else {
    socket.emit('chat', { msg: 'opening research findings... (all reviewed)' });
  }

  // Emit structured review queue data for modal
  const findings = allReviews.map(review => ({
    id: review.id,
    findingType: review.findingType,
    type: review.findingType, // Alias for compatibility
    name: review.extractedData?.name || review.extractedData?.address || 'unknown',
    sourceUrl: review.sourceUrl || '#',
    confidence: review.confidence || 0,
    contextSnippet: review.contextSnippet || '',
    context: review.contextSnippet || '', // Alias for compatibility
    status: review.reviewed ? (review.status || 'pending') : 'pending',
    extractedData: review.extractedData,
  }));

  socket.emit('reviewQueue', {
    projectId: socket.projectId,
    findings: findings,
  });
}

/**
 * Approve a finding
 */
async function approveFinding(socket, reviewId) {
  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  try {
    // Find review by ID or index (backward compatibility)
    let review;
    if (typeof reviewId === 'string' && reviewId.startsWith('review-')) {
      // ID lookup
      review = MEMORY_REVIEW_QUEUE.find(r => r.id === reviewId && r.projectId === socket.projectId);
    } else {
      // Index lookup (backward compatibility with /approve command)
      const reviews = MEMORY_REVIEW_QUEUE.filter(r => !r.reviewed && r.projectId === socket.projectId);
      const reviewIndex = typeof reviewId === 'number' ? reviewId : Number.parseInt(reviewId, 10);
      if (Number.isNaN(reviewIndex) || reviewIndex < 1) {
        socket.emit('notif', { msg: 'invalid review ID' });
        return;
      }
      review = reviews[reviewIndex - 1];
    }

    if (!review) {
      socket.emit('notif', { msg: 'review not found' });
      return;
    }
    
    if (review.reviewed) {
      socket.emit('notif', { msg: 'review already processed' });
      return;
    }

    // Mark as reviewed
    review.reviewed = true;
    review.status = 'approved';
    
    // Notify client to update the display
    socket.emit('reviewUpdated', {
      reviewId: review.id,
      status: 'approved'
    });

    // Add to project based on type
    const name = review.extractedData.name || review.extractedData.address;
    
    // Get project items
    const items = global.MEMORY_ITEMS[socket.projectId] || [];
    global.MEMORY_ITEMS[socket.projectId] = items;

    if (review.findingType === 'location') {
      // Try to geocode if no coordinates
      let coords = review.extractedData.coords;
      const address = review.extractedData.address || name;
      
      if (!coords) {
        try {
          socket.emit('chat', { msg: `geocoding location: ${address}...` });
          const geocoder = require('../services/nlp/locationParser');
          const geocodeResult = await geocoder.geocode(address);
          
          if (geocodeResult && geocodeResult.length > 0) {
            coords = geocodeResult[0].coords;
            socket.emit('chat', { msg: `✓ location geocoded successfully` });
          } else {
            socket.emit('chat', { msg: `could not geocode location, skipping` });
            return;
          }
        } catch (error) {
          socket.emit('chat', { msg: `geocoding failed: ${error.message}` });
          return;
        }
      }
      
      // Add as location
      const item = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: name.toLowerCase(),
        type: 'location',
        description: null,
        links: [],
        notes: [],
        data: {
          address: address,
          sourceUrl: review.sourceUrl,
        },
        coords: coords,
        added_by: socket.userId,
        created_at: new Date().toISOString(),
      };
      
      items.push(item);
      socket.emit('chat', { msg: `✓ location added: ${name}` });
      
    } else if (review.findingType === 'entity') {
      // Add as entity
      const item = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: name.toLowerCase(),
        type: 'entity',
        description: null,
        links: [],
        notes: [],
        data: {
          sourceUrl: review.sourceUrl,
        },
        added_by: socket.userId,
        created_at: new Date().toISOString(),
      };
      
      items.push(item);
      socket.emit('chat', { msg: `✓ entity added: ${name}` });
      
    } else if (review.findingType === 'keyword') {
      // For keyword findings that are actually webpages (have sourceUrl),
      // don't add them as keywords - just scrape them for entities
      // Only add as keyword if it's a genuine keyword without a webpage source
      if (review.sourceUrl && review.sourceUrl !== '#' && review.sourceUrl.startsWith('http')) {
        // This is a webpage, not a keyword - just notify that we'll scrape it
        socket.emit('chat', { msg: `✓ webpage approved, scraping for entities...` });
        // Don't add it as a keyword item - the scraping will extract entities
      } else {
        // This is a genuine keyword (no source URL), add it
        const item = {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: name.toLowerCase(),
          type: 'keyword',
          description: null,
          links: [],
          notes: [],
          data: {
            sourceUrl: review.sourceUrl,
          },
          added_by: socket.userId,
          created_at: new Date().toISOString(),
        };
        
        items.push(item);
        socket.emit('chat', { msg: `✓ keyword added: ${name}` });
      }
    } else {
      socket.emit('chat', { msg: `✓ finding approved: ${name}` });
    }
    
    // Refresh project view to show new item
    if (socket.projectId) {
      const project = global.MEMORY_PROJECTS[socket.key];
      const projects = require('./projects');
      const formattedProject = projects.formatProjectForClient(project, items);
      socket.emit('project', { project: formattedProject });
    }

    logger.info('Finding approved', { reviewId: review.id });

    // Queue scraping job for approved finding if it has a source URL
    if (review.sourceUrl && review.sourceUrl !== '#' && review.sourceUrl.startsWith('http')) {
      try {
        const jobQueue = require('../services/queue/jobQueue');
        const webScraper = require('../services/osint/webScraper');
        const config = require('../config');

        // Check if auto-scraping is enabled (default: true)
        const enableAutoScraping = config.enableAutoScraping !== false;

        // Scrape if:
        // 1. Auto-scraping is enabled
        // 2. URL is scrapeable
        // 3. Either the finding type is in autoScrapeTypes, OR it's a keyword with a sourceUrl (webpage)
        const autoScrapeTypes = config.autoScrapeTypes || ['entity', 'location', 'organization'];
        const isKeywordWebpage = review.findingType === 'keyword' && review.sourceUrl && review.sourceUrl.startsWith('http');
        const shouldScrape = enableAutoScraping && 
          (autoScrapeTypes.includes(review.findingType) || isKeywordWebpage) &&
          webScraper.isScrapeable(review.sourceUrl);

        if (shouldScrape) {
          const job = await jobQueue.add(
            'scrape-approved-finding',
            {
              reviewId: review.id,
              sourceUrl: review.sourceUrl,
              projectId: socket.projectId,
              findingType: review.findingType,
              userId: socket.userId,
            },
            5 // Medium priority
          );

          socket.emit('chat', { msg: 'scraping page for additional entities...' });
          logger.info('Scraping job queued', {
            reviewId: review.id,
            sourceUrl: review.sourceUrl,
            projectId: socket.projectId,
            jobId: job.id,
          });
          console.log('[APPROVE] Scraping job queued:', { jobId: job.id, sourceUrl: review.sourceUrl });
        } else {
          const isScrapeable = webScraper.isScrapeable(review.sourceUrl);
          const isKeywordWebpage = review.findingType === 'keyword' && review.sourceUrl && review.sourceUrl.startsWith('http');
          logger.info('Scraping skipped', {
            reviewId: review.id,
            sourceUrl: review.sourceUrl,
            shouldScrape,
            isScrapeable,
            findingType: review.findingType,
            isKeywordWebpage,
            enableAutoScraping: config.enableAutoScraping !== false,
            autoScrapeTypes: config.autoScrapeTypes || ['entity', 'location', 'organization'],
          });
          console.log('[APPROVE] Scraping skipped:', {
            shouldScrape,
            isScrapeable,
            findingType: review.findingType,
            isKeywordWebpage,
            enableAutoScraping: config.enableAutoScraping !== false,
            autoScrapeTypes: config.autoScrapeTypes || ['entity', 'location', 'organization'],
          });
        }
      } catch (error) {
        // Don't fail approval if scraping job queue fails
        logger.error('Failed to queue scraping job', {
          reviewId: review.id,
          error: error.message,
        });
      }
    }
    
  } catch (error) {
    logger.error('Approve finding failed', { error: error.message });
    socket.emit('notif', { msg: 'failed to approve finding' });
  }
}

/**
 * Reject a finding
 */
async function rejectFinding(socket, reviewId) {
  if (!socket.projectId) {
    socket.emit('notif', { msg: 'no #project open' });
    return;
  }

  try {
    // Find review by ID or index (backward compatibility)
    let review;
    if (typeof reviewId === 'string' && reviewId.startsWith('review-')) {
      // ID lookup
      review = MEMORY_REVIEW_QUEUE.find(r => r.id === reviewId && r.projectId === socket.projectId);
    } else {
      // Index lookup (backward compatibility with /reject command)
      const reviews = MEMORY_REVIEW_QUEUE.filter(r => !r.reviewed && r.projectId === socket.projectId);
      const reviewIndex = typeof reviewId === 'number' ? reviewId : Number.parseInt(reviewId, 10);
      if (Number.isNaN(reviewIndex) || reviewIndex < 1) {
        socket.emit('notif', { msg: 'invalid review ID' });
        return;
      }
      review = reviews[reviewIndex - 1];
    }

    if (!review) {
      socket.emit('notif', { msg: 'review not found' });
      return;
    }
    
    if (review.reviewed) {
      socket.emit('notif', { msg: 'review already processed' });
      return;
    }

    review.reviewed = true;
    review.status = 'rejected';
    
    // Notify client to update the display
    socket.emit('reviewUpdated', {
      reviewId: review.id,
      status: 'rejected'
    });

    const name = review.extractedData.name || review.extractedData.address || 'finding';
    socket.emit('chat', { msg: `× finding rejected: ${name}` });
    
    logger.info('Finding rejected', { reviewId: review.id });
    
  } catch (error) {
    logger.error('Reject finding failed', { error: error.message });
    socket.emit('notif', { msg: 'failed to reject finding' });
  }
}

module.exports = {
  startResearch,
  stopResearch,
  researchStatus,
  showReviewQueue,
  approveFinding,
  rejectFinding,
  MEMORY_REVIEW_QUEUE, // Export for workers
};
