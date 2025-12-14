require('dotenv').config();
const logger = require('./logger');

const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT, 10) || 3000,

  // Mapbox
  mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,

  // Supabase (optional - falls back to in-memory storage if not configured)
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  useSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),

  // Session (optional - generates random secret if not provided)
  sessionSecret: process.env.SESSION_SECRET || 'development_secret_change_in_production_12345',

  // Rate Limiting
  rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  rateLimitMaxRequests: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  rateLimitLoginMax: Number.parseInt(process.env.RATE_LIMIT_LOGIN_MAX, 10) || 5,
  rateLimitRegisterMax: Number.parseInt(process.env.RATE_LIMIT_REGISTER_MAX, 10) || 3,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Socket.io
  socketPingInterval: Number.parseInt(process.env.SOCKET_PING_INTERVAL, 10) || 300000,
  socketPingTimeout: Number.parseInt(process.env.SOCKET_PING_TIMEOUT, 10) || 300000,
  socketUpgradeTimeout: Number.parseInt(process.env.SOCKET_UPGRADE_TIMEOUT, 10) || 150000,

  // Feature flags
  enableGematriaValidation: process.env.ENABLE_GEMATRIA_VALIDATION === 'true', // Keep gematria as fun feature

  // Auto-scraping configuration
  enableAutoScraping: process.env.ENABLE_AUTO_SCRAPING !== 'false', // Default: true
  maxEntitiesPerPage: Number.parseInt(process.env.MAX_ENTITIES_PER_PAGE, 10) || 50,
  scrapingTimeout: Number.parseInt(process.env.SCRAPING_TIMEOUT, 10) || 10000,
  autoScrapeTypes: process.env.AUTO_SCRAPE_TYPES
    ? process.env.AUTO_SCRAPE_TYPES.split(',').map((t) => t.trim())
    : ['entity', 'location', 'organization'], // Which finding types trigger scraping

  // Search API keys (optional)
  bingApiKey: process.env.BING_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY,
  googleCx: process.env.GOOGLE_CX, // Custom Search Engine ID

  // Validation
  validate() {
    const required = {
      mapboxToken: 'MAPBOX_ACCESS_TOKEN',
    };

    const missing = [];
    for (const [key, envName] of Object.entries(required)) {
      if (!config[key] || config[key].includes('your_') || config[key].includes('your-project')) {
        missing.push(envName);
      }
    }

    // Bing and Google keys are optional (DuckDuckGo works without keys)
    if (config.bingApiKey || config.googleApiKey) {
      logger.info('Search APIs: Some providers configured');
    }

    if (missing.length > 0) {
      throw new Error(`Missing or invalid environment variables: ${missing.join(', ')}`);
    }

    return true;
  },
};

// Validate on load
if (config.nodeEnv !== 'test') {
  config.validate();
}

module.exports = config;
