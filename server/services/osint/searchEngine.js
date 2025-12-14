const axios = require('axios');
const config = require('../../config');
const logger = require('../../config/logger');

// Rate limiters for each provider
const Bottleneck = require('bottleneck');

const limiters = {
  duckduckgo: new Bottleneck({ minTime: 1000 }), // 1 req/sec
  bing: new Bottleneck({ minTime: 500 }),        // 2 req/sec
  google: new Bottleneck({ minTime: 500 }),      // 2 req/sec
};

/**
 * Search providers configuration
 */
const providers = {
  duckduckgo: {
    name: 'DuckDuckGo',
    enabled: true,
    priority: 1, // Try first (no API key needed)
  },
  bing: {
    name: 'Bing',
    enabled: !!config.bingApiKey,
    priority: 2,
    apiKey: config.bingApiKey,
  },
  google: {
    name: 'Google Custom Search',
    enabled: !!config.googleApiKey && !!config.googleCx,
    priority: 3,
    apiKey: config.googleApiKey,
    cx: config.googleCx,
  },
};

/**
 * Search DuckDuckGo (no API key required)
 */
async function searchDuckDuckGo(query, options = {}) {
  const maxResults = options.maxResults || 10;

  try {
    // Simple DuckDuckGo HTML scraping
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000,
    });

    const results = [];
    const html = response.data;
    
    // Check if DuckDuckGo is showing a CAPTCHA/challenge page
    if (html.includes('anomaly-modal') || html.includes('Please complete the following challenge') || html.includes('bots use DuckDuckGo') || html.includes('Select all squares containing')) {
      logger.warn('DuckDuckGo CAPTCHA detected - bot protection active', { query });
      // Return empty results - this will trigger fallback to other providers if available
      // Note: User should configure Bing or Google API keys for reliable searching
      return [];
    }
    
    // Log a sample of the HTML for debugging if no results found
    if (html.length < 5000) {
      logger.debug('DuckDuckGo HTML sample', { 
        query, 
        htmlLength: html.length,
        hasResults: html.includes('result'),
        htmlPreview: html.substring(0, 500)
      });
    }
    
    // DuckDuckGo HTML structure
    // Find all result blocks - need to handle multiple classes
    const resultBlocks = html.match(/<div class="[^"]*result[^"]*results_links[^"]*">[\s\S]*?<\/div>\s*<\/div>/g) || [];
    
    // Also try alternative HTML structure patterns
    if (resultBlocks.length === 0) {
      // Try alternative patterns for DuckDuckGo results
      const altPatterns = [
        /<div[^>]*class="[^"]*web-result[^"]*"[^>]*>[\s\S]*?<\/div>/g,
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<\/div>/g,
      ];
      
      for (const pattern of altPatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          resultBlocks.push(...matches);
          break;
        }
      }
    }
    
    for (const block of resultBlocks.slice(0, maxResults)) {
      // Extract title and URL - try multiple patterns
      let titleMatch = block.match(/<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
      
      // Try alternative patterns if first doesn't match
      if (!titleMatch) {
        titleMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]*)<\/a>/);
      }
      if (!titleMatch) {
        titleMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
      }
      
      if (titleMatch) {
        let url = titleMatch[1];
        
        // Skip if it's a DuckDuckGo internal link
        if (url.includes('duckduckgo.com') && !url.includes('uddg=')) {
          continue;
        }
        
        // DuckDuckGo uses redirect URLs, extract the actual URL
        if (url.startsWith('//duckduckgo.com/l/?uddg=') || url.includes('uddg=')) {
          const uddgMatch = url.match(/uddg=([^&]+)/);
          if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
          }
        } else if (url.startsWith('//')) {
          url = 'https:' + url;
        }
        
        // Extract snippet - try multiple patterns
        let snippet = '';
        const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/);
        if (snippetMatch) {
          snippet = snippetMatch[1].trim();
        } else {
          // Try alternative snippet patterns
          const altSnippet = block.match(/<span[^>]*class="[^"]*snippet[^"]*"[^>]*>([^<]*)<\/span>/);
          if (altSnippet) {
            snippet = altSnippet[1].trim();
          }
        }
        
        // Only add if we have a valid URL
        if (url && url.startsWith('http')) {
          results.push({
            title: titleMatch[2].trim(),
            url: url,
            snippet: snippet,
          });
        }
      }
    }

    logger.info('DuckDuckGo search completed', { 
      query, 
      resultsCount: results.length 
    });

    return results;
  } catch (error) {
    logger.error('DuckDuckGo search failed', { 
      query, 
      error: error.message 
    });
    return [];
  }
}

/**
 * Search Bing Web Search API
 */
async function searchBing(query, options = {}) {
  if (!config.bingApiKey) {
    logger.warn('Bing search skipped - no API key');
    return [];
  }

  const maxResults = options.maxResults || 10;

  try {
    const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
      params: {
        q: query,
        count: maxResults,
        offset: 0,
        mkt: 'en-US',
        safeSearch: 'Moderate',
      },
      headers: {
        'Ocp-Apim-Subscription-Key': config.bingApiKey,
      },
      timeout: 10000,
    });

    const results = [];
    
    if (response.data.webPages && response.data.webPages.value) {
      for (const page of response.data.webPages.value) {
        results.push({
          title: page.name,
          url: page.url,
          snippet: page.snippet,
        });
      }
    }

    logger.info('Bing search completed', { 
      query, 
      resultsCount: results.length 
    });

    return results;
  } catch (error) {
    logger.error('Bing search failed', { 
      query, 
      error: error.message 
    });
    return [];
  }
}

/**
 * Search Google Custom Search API
 */
async function searchGoogle(query, options = {}) {
  if (!config.googleApiKey || !config.googleCx) {
    logger.warn('Google search skipped - no API key or CX');
    return [];
  }

  const maxResults = options.maxResults || 10;

  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: config.googleApiKey,
        cx: config.googleCx,
        q: query,
        num: maxResults,
        safe: 'active',
      },
      timeout: 10000,
    });

    const results = [];
    
    if (response.data.items) {
      for (const item of response.data.items) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
        });
      }
    }

    logger.info('Google search completed', { 
      query, 
      resultsCount: results.length 
    });

    return results;
  } catch (error) {
    logger.error('Google search failed', { 
      query, 
      error: error.message 
    });
    return [];
  }
}

/**
 * Search a single provider
 */
async function searchProvider(providerName, query, options = {}) {
  const provider = providers[providerName];
  
  if (!provider || !provider.enabled) {
    logger.warn(`Provider ${providerName} not available`);
    return [];
  }

  try {
    let results;
    const limiter = limiters[providerName];

    switch (providerName) {
      case 'duckduckgo':
        results = await limiter.schedule(() => searchDuckDuckGo(query, options));
        break;
      case 'bing':
        results = await limiter.schedule(() => searchBing(query, options));
        break;
      case 'google':
        results = await limiter.schedule(() => searchGoogle(query, options));
        break;
      default:
        logger.error(`Unknown provider: ${providerName}`);
        return [];
    }

    // Add provider info to results
    return results.map(r => ({
      ...r,
      provider: providerName,
      providerName: provider.name,
    }));

  } catch (error) {
    logger.error(`Provider ${providerName} error`, { 
      query, 
      error: error.message 
    });
    return [];
  }
}

/**
 * Search across all enabled providers
 */
async function searchAll(query, options = {}) {
  const enabledProviders = Object.keys(providers)
    .filter(p => providers[p].enabled)
    .sort((a, b) => providers[a].priority - providers[b].priority);

  logger.info('Starting multi-provider search', { 
    query, 
    providers: enabledProviders 
  });

  // Search all providers in parallel
  const results = await Promise.allSettled(
    enabledProviders.map(provider => searchProvider(provider, query, options))
  );

  // Combine results
  let allResults = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults = allResults.concat(result.value);
    } else {
      logger.error('Provider search failed', { 
        error: result.reason.message 
      });
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const deduplicated = [];
  
  for (const result of allResults) {
    const url = result.url.toLowerCase().trim();
    if (!seen.has(url)) {
      seen.add(url);
      deduplicated.push(result);
    }
  }

  // Sort by provider priority (DuckDuckGo first, then Bing, then Google)
  const providerPriority = { duckduckgo: 1, bing: 2, google: 3 };
  deduplicated.sort((a, b) => {
    const priorityA = providerPriority[a.provider] || 999;
    const priorityB = providerPriority[b.provider] || 999;
    return priorityA - priorityB;
  });

  logger.info('Multi-provider search complete', { 
    query, 
    totalResults: allResults.length,
    deduplicatedCount: deduplicated.length 
  });

  return deduplicated;
}

/**
 * Get available providers
 */
function getAvailableProviders() {
  return Object.entries(providers)
    .filter(([_, p]) => p.enabled)
    .map(([name, p]) => ({
      name,
      displayName: p.name,
      priority: p.priority,
    }));
}

module.exports = {
  searchAll,
  searchProvider,
  searchDuckDuckGo,
  searchBing,
  searchGoogle,
  getAvailableProviders,
  providers,
};

