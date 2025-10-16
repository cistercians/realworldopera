require('dotenv').config();

const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT, 10) || 3000,

  // Mapbox
  mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,

  // Session
  sessionSecret: process.env.SESSION_SECRET,

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

  // Validation
  validate() {
    const required = {
      mapboxToken: 'MAPBOX_ACCESS_TOKEN',
      supabaseUrl: 'SUPABASE_URL',
      supabaseAnonKey: 'SUPABASE_ANON_KEY',
      sessionSecret: 'SESSION_SECRET',
    };

    const missing = [];
    for (const [key, envName] of Object.entries(required)) {
      if (!config[key] || config[key].includes('your_') || config[key].includes('your-project')) {
        missing.push(envName);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing or invalid environment variables: ${missing.join(', ')}`);
    }

    if (config.nodeEnv === 'production') {
      if (config.sessionSecret.includes('change') || config.sessionSecret.length < 32) {
        throw new Error(
          'SESSION_SECRET must be changed and be at least 32 characters in production'
        );
      }
      if (!config.supabaseServiceKey) {
        throw new Error('SUPABASE_SERVICE_KEY is required in production');
      }
    }

    return true;
  },
};

// Validate on load
if (config.nodeEnv !== 'test') {
  config.validate();
}

module.exports = config;
