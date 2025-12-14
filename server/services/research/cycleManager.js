const { supabase } = require('../../config/supabase');
const logger = require('../../config/logger');
const jobQueue = require('../queue/jobQueue');
const { generateSmartQueries } = require('./queryGenerator');
const { extractFromText } = require('../nlp/entityExtractor');
const { extractAndGeocode } = require('../nlp/locationParser');
const { crossReference, generateConfidenceScore, deduplicateFindings } = require('./crossReference');
const { searchAll } = require('../osint/searchEngine');
const { scrapeUrl, isScrapeable } = require('../osint/webScraper');

/**
 * Research Cycle Manager
 * Orchestrates automated research cycles
 */
class ResearchCycleManager {
  constructor() {
    this.activeCycles = new Map(); // projectId -> cycle info
    this.io = null; // Socket.io instance
  }

  /**
   * Set Socket.io instance for real-time updates
   */
  setIO(io) {
    this.io = io;
    jobQueue.setEventEmitter(io);
  }

  /**
   * Start a research cycle for a project
   */
  async startCycle(projectId, userId, options = {}) {
    try {
      // Get current cycle number
      const { data: lastCycle } = await supabase
        .from('research_cycles')
        .select('cycle_number')
        .eq('project_id', projectId)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const cycleNumber = (lastCycle?.cycle_number || 0) + 1;

      // Create cycle record
      const { data: cycle, error: cycleError } = await supabase
        .from('research_cycles')
        .insert({
          project_id: projectId,
          cycle_number: cycleNumber,
          status: 'generating_queries',
          auto_search: options.autoSearch || false,
          max_depth: options.maxDepth || 3,
        })
        .select()
        .single();

      if (cycleError || !cycle) {
        logger.error('Failed to create cycle', { error: cycleError?.message });
        throw new Error('Failed to start research cycle');
      }

      this.activeCycles.set(projectId, {
        id: cycle.id,
        projectId,
        cycleNumber,
        status: 'generating_queries',
        userId,
      });

      logger.info('Starting research cycle', { projectId, cycleId: cycle.id, cycleNumber });

      // Emit to user
      this.emitProgress(projectId, userId, 'research:cycle_started', { cycle });

      // Execute cycle steps
      this.executeCycle(cycle, userId);

      return cycle;
    } catch (error) {
      logger.error('Start cycle failed', { projectId, error: error.message });
      throw error;
    }
  }

  /**
   * Execute the research cycle steps
   */
  async executeCycle(cycle, userId) {
    try {
      // Step 1: Generate queries
      await this.updateCycleStatus(cycle.id, 'generating_queries');
      const queries = await this.generateQueries(cycle.project_id);

      if (queries.length === 0) {
        await this.updateCycleStatus(cycle.id, 'completed');
        this.emitProgress(cycle.project_id, userId, 'research:cycle_complete', { 
          cycle, 
          message: 'No queries to execute' 
        });
        return;
      }

      this.emitProgress(cycle.project_id, userId, 'research:query_generation_complete', {
        queryCount: queries.length,
      });

      // Step 2: Execute searches
      await this.updateCycleStatus(cycle.id, 'searching');
      const sources = await this.executeSearches(cycle, queries, userId);

      if (sources.length === 0) {
        await this.updateCycleStatus(cycle.id, 'completed');
        this.emitProgress(cycle.project_id, userId, 'research:cycle_complete', {
          cycle,
          message: 'No sources found',
        });
        return;
      }

      await this.updateCycleSourceCount(cycle.id, sources.length);

      // Step 3: Scrape and extract
      await this.updateCycleStatus(cycle.id, 'scraping');
      const findings = await this.scrapeAndExtract(cycle, sources, userId);

      this.emitProgress(cycle.project_id, userId, 'research:extraction_complete', {
        findingCount: findings.length,
      });

      // Step 4: Cross-reference
      await this.updateCycleStatus(cycle.id, 'extracting');
      const reviewedFindings = await this.crossReferenceFindings(cycle, findings, userId);

      // Step 5: Add to review queue
      const queuedCount = await this.addToReviewQueue(cycle, reviewedFindings, userId);

      await this.updateCycleStats(cycle.id, {
        findings_count: queuedCount,
      });

      // Complete cycle
      await this.updateCycleStatus(cycle.id, 'completed', true);
      this.emitProgress(cycle.project_id, userId, 'research:cycle_complete', {
        cycle,
        sourcesFound: sources.length,
        findingsQueued: queuedCount,
      });

      // Cleanup
      this.activeCycles.delete(cycle.project_id);

      logger.info('Cycle completed', { cycleId: cycle.id, sources: sources.length, findings: queuedCount });
    } catch (error) {
      logger.error('Cycle execution failed', { cycleId: cycle.id, error: error.message });
      await this.updateCycleStatus(cycle.id, 'failed');
      this.activeCycles.delete(cycle.project_id);
    }
  }

  /**
   * Generate search queries from project items
   */
  async generateQueries(projectId) {
    // Get project items
    const { data: items, error } = await supabase.rpc('get_project_items', {
      p_project_id: projectId,
    });

    if (error || !items || items.length === 0) {
      logger.warn('No items found for project', { projectId });
      return [];
    }

    // Generate queries
    const queries = generateSmartQueries(items);
    return queries;
  }

  /**
   * Execute searches for all queries
   */
  async executeSearches(cycle, queries, userId) {
    const allSources = [];

    for (const queryDef of queries.slice(0, 50)) {
      // Save query record
      const { data: searchQuery, error: queryError } = await supabase
        .from('search_queries')
        .insert({
          project_id: cycle.project_id,
          cycle_id: cycle.id,
          query_string: queryDef.query,
          entity_combinations: queryDef.items.map(i => i.name),
          status: 'searching',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      try {
        const results = await searchAll(queryDef.query, { maxResults: 10 });

        // Save sources
        for (const result of results) {
          const { data: source, error: sourceError } = await supabase
            .from('sources')
            .insert({
              url: result.url,
              title: result.title || '',
              snippet: result.snippet || '',
              discovered_date: new Date().toISOString(),
              source_type: 'web',
              provider: result.provider,
              credibility_score: 5.0,
              metadata: {
                provider_name: result.providerName,
              },
            })
            .select()
            .single();

          if (!sourceError && source) {
            allSources.push(source);

            // Update search query
            await supabase
              .from('search_queries')
              .update({
                status: 'completed',
                results_count: results.length,
                providers_succeeded: [result.provider],
                completed_at: new Date().toISOString(),
              })
              .eq('id', searchQuery.id);
          }
        }

        this.emitProgress(cycle.project_id, userId, 'research:searching', {
          query: queryDef.query,
          resultsFound: results.length,
          totalSources: allSources.length,
        });
      } catch (error) {
        logger.error('Search failed', { query: queryDef.query, error: error.message });

        await supabase
          .from('search_queries')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq('id', searchQuery.id);
      }
    }

    return allSources;
  }

  /**
   * Scrape sources and extract entities
   */
  async scrapeAndExtract(cycle, sources, userId) {
    const allFindings = [];

    for (const source of sources) {
      try {
        // Skip non-scrapeable URLs
        if (!isScrapeable(source.url)) {
          continue;
        }

        // Scrape content
        const content = await scrapeUrl(source.url, { timeout: 5000 });

        if (!content || !content.content) {
          continue;
        }

        // Update source with full text
        await supabase
          .from('sources')
          .update({ full_text: content.content.substring(0, 50000) }) // Limit to 50KB
          .eq('id', source.id);

        // Extract entities
        const extracted = extractFromText(content.content, source.url);

        // Extract and geocode locations
        const locations = await extractAndGeocode(content.content, source.url);

        // Add entities to findings
        for (const person of extracted.people) {
          allFindings.push({
            type: 'entity',
            name: person,
            source: source,
            context: this.getContext(content.content, person),
          });
        }

        for (const org of extracted.organizations) {
          allFindings.push({
            type: 'organization',
            name: org,
            source: source,
            context: this.getContext(content.content, org),
          });
        }

        for (const location of locations) {
          if (location.confidence === 'high') {
            allFindings.push({
              type: 'location',
              name: location.name,
              address: location.address,
              coordinates: location.coordinates,
              source: source,
              context: this.getContext(content.content, location.name),
            });
          }
        }
      } catch (error) {
        logger.error('Scraping/extraction failed', { 
          sourceId: source.id, 
          error: error.message 
        });
      }
    }

    return deduplicateFindings(allFindings);
  }

  /**
   * Cross-reference findings with existing items
   */
  async crossReferenceFindings(cycle, findings, userId) {
    // Get existing project items
    const { data: existingItems } = await supabase.rpc('get_project_items', {
      p_project_id: cycle.project_id,
    });

    // Cross-reference
    const referenced = crossReference(findings, existingItems || []);

    // Generate confidence scores
    for (const finding of referenced) {
      if (finding.isNew) {
        finding.confidence = generateConfidenceScore(
          finding.finding,
          finding.finding.source,
          { mentionCount: 1 }
        );
      } else {
        finding.confidence = 0.3; // Lower confidence for duplicates
      }
    }

    return referenced;
  }

  /**
   * Add findings to review queue
   */
  async addToReviewQueue(cycle, findings, userId) {
    let queuedCount = 0;

    for (const finding of findings) {
      // Only queue new findings with sufficient confidence
      if (finding.isNew && finding.confidence >= 0.5) {
        try {
          const { error } = await supabase
            .from('review_queue')
            .insert({
              project_id: cycle.project_id,
              cycle_id: cycle.id,
              source_id: finding.finding.source.id,
              finding_type: finding.finding.type,
              extracted_data: {
                name: finding.finding.name,
                address: finding.finding.address,
                coordinates: finding.finding.coordinates,
              },
              confidence_score: Math.round(finding.confidence * 10) / 10,
              context_snippet: finding.finding.context || '',
              source_url: finding.finding.source.url,
            });

          if (!error) {
            queuedCount++;
          }
        } catch (error) {
          logger.error('Failed to add to review queue', { error: error.message });
        }
      }
    }

    return queuedCount;
  }

  /**
   * Get context snippet around a term
   */
  getContext(text, term, snippetLength = 150) {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - snippetLength / 2);
    const end = Math.min(text.length, index + term.length + snippetLength / 2);

    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Update cycle status
   */
  async updateCycleStatus(cycleId, status, isComplete = false) {
    const update = {
      status,
    };

    if (isComplete) {
      update.completed_at = new Date().toISOString();
    }

    await supabase
      .from('research_cycles')
      .update(update)
      .eq('id', cycleId);
  }

  /**
   * Update cycle source count
   */
  async updateCycleSourceCount(cycleId, count) {
    await supabase
      .from('research_cycles')
      .update({ sources_found: count })
      .eq('id', cycleId);
  }

  /**
   * Update cycle statistics
   */
  async updateCycleStats(cycleId, stats) {
    await supabase
      .from('research_cycles')
      .update(stats)
      .eq('id', cycleId);
  }

  /**
   * Emit progress event
   */
  emitProgress(projectId, userId, event, data) {
    if (this.io) {
      this.io.to(`project:${projectId}`).emit(event, data);
    }
  }
}

// Create singleton instance
const cycleManager = new ResearchCycleManager();

module.exports = cycleManager;

