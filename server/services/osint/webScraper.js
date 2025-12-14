const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../../config/logger');

/**
 * Web Scraping Service
 * Extracts text content from web pages using Cheerio
 */

// Rate limiter
const Bottleneck = require('bottleneck');
const limiter = new Bottleneck({ minTime: 1000 }); // 1 req/sec

/**
 * Fetch and parse a web page
 */
async function scrapeUrl(url, options = {}) {
  try {
    logger.info('Scraping URL', { url });

    const response = await axios.get(url, {
      timeout: options.timeout || 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RealWorldOpera/1.0; +http://realworldopera.app/)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      validateStatus: (status) => status < 500, // Don't throw on 404s
    });

    if (response.status >= 400) {
      logger.warn('Scraping failed', { url, status: response.status });
      
      // Return error details for specific status codes
      if (response.status === 999) {
        // LinkedIn and some sites use 999 for anti-bot protection
        return {
          url,
          title: null,
          description: null,
          content: null,
          author: null,
          datePublished: null,
          statusCode: response.status,
          wordCount: 0,
          error: 'Blocked by anti-bot protection (requires authentication)',
          blocked: true,
        };
      }
      
      return null;
    }

    const $ = cheerio.load(response.data);

    // Remove script and style tags
    $('script, style, noscript, iframe, embed').remove();

    // Extract title
    let title = $('title').text().trim() || 
                $('meta[property="og:title"]').attr('content') ||
                $('h1').first().text().trim();

    // Extract main content
    let mainContent = '';

    // Try to find main content area
    const mainSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-body',
      '#content',
      '#main-content',
    ];

    let $main = null;
    for (const selector of mainSelectors) {
      $main = $(selector).first();
      if ($main.length > 0 && $main.text().length > 100) {
        break;
      }
    }

    // If no main content found, use body
    if (!$main || $main.length === 0) {
      $main = $('body');
    }

    // Extract text
    mainContent = $main.find('p, h1, h2, h3, h4, h5, h6, li, blockquote')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(text => text.length > 0)
      .join('\n\n')
      .substring(0, 10000); // Limit to 10KB

    // If still empty, just get all text
    if (mainContent.length < 100) {
      mainContent = $main.text().trim().substring(0, 10000);
    }

    // Extract meta description
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       mainContent.substring(0, 200);

    // Extract author
    const author = $('meta[name="author"]').attr('content') ||
                   $('.author').first().text().trim() ||
                   $('[rel="author"]').first().text().trim();

    // Extract publication date
    const datePublished = $('meta[property="article:published_time"]').attr('content') ||
                         $('time[datetime]').first().attr('datetime') ||
                         null;

    const result = {
      url,
      title: title || 'Untitled',
      description: description || '',
      content: mainContent || '',
      author: author || null,
      datePublished: datePublished || null,
      statusCode: response.status,
      wordCount: mainContent.split(/\s+/).length,
    };

    logger.info('Scraping completed', { 
      url, 
      title: result.title.substring(0, 50),
      wordCount: result.wordCount 
    });

    return result;

  } catch (error) {
    logger.error('Scraping error', { 
      url, 
      error: error.message 
    });
    
    // Return minimal result for error cases
    return {
      url,
      title: null,
      description: null,
      content: null,
      author: null,
      datePublished: null,
      statusCode: 0,
      wordCount: 0,
      error: error.message,
    };
  }
}

/**
 * Scrape multiple URLs with rate limiting
 */
async function scrapeUrls(urls, options = {}) {
  const results = [];
  
  for (const url of urls) {
    const result = await limiter.schedule(() => scrapeUrl(url, options));
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

/**
 * Extract links from a scraped page
 */
function extractLinks(content, baseUrl) {
  try {
    const $ = cheerio.load(content);
    const links = [];
    
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      let fullUrl;
      
      try {
        fullUrl = new URL(href, baseUrl).href;
        
        // Only external links
        if (fullUrl !== baseUrl && !fullUrl.startsWith(baseUrl + '#')) {
          links.push({
            url: fullUrl,
            text: $(el).text().trim(),
          });
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });
    
    return [...new Set(links.map(l => l.url))]; // Deduplicate
  } catch (error) {
    logger.error('Link extraction failed', { url: baseUrl, error: error.message });
    return [];
  }
}

/**
 * Check if URL is likely scrapeable
 */
function isScrapeable(url) {
  // Check for common non-scrapeable patterns
  const skipPatterns = [
    /\.pdf$/i,
    /\.docx?$/i,
    /\.xlsx?$/i,
    /\.zip$/i,
    /\.rar$/i,
    /\.mp4$/i,
    /\.avi$/i,
    /\.mov$/i,
    /^mailto:/,
    /^tel:/,
    /^javascript:/,
  ];
  
  for (const pattern of skipPatterns) {
    if (pattern.test(url)) {
      return false;
    }
  }
  
  return true;
}

module.exports = {
  scrapeUrl,
  scrapeUrls,
  extractLinks,
  isScrapeable,
};

