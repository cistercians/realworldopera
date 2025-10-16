const { createClient } = require('@supabase/supabase-js');
const config = require('./index');
const logger = require('./logger');

// Client for server-side operations (uses anon key for most operations)
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // Server doesn't need session persistence
  },
});

// Admin client for privileged operations (uses service role key)
let supabaseAdmin = null;
if (config.supabaseServiceKey) {
  supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  logger.info('Supabase: Admin client initialized');
} else {
  logger.warn('Supabase: Service key not provided, admin operations will be limited');
}

logger.info('Supabase: Client initialized', {
  url: config.supabaseUrl,
});

module.exports = {
  supabase,
  supabaseAdmin,
};
