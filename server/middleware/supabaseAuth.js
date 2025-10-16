const { supabase } = require('../config/supabase');
const logger = require('../config/logger');

// Verify Supabase auth token middleware
const verifySupabaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided',
    });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid auth token attempt', { error: error?.message });
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth verification error', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

// Verify socket token (returns user or null)
const verifySocketAuth = async (token) => {
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid socket token attempt', { error: error?.message });
      return { valid: false, error: error?.message || 'Invalid token' };
    }

    return { valid: true, user };
  } catch (error) {
    logger.error('Socket auth verification error', { error: error.message });
    return { valid: false, error: error.message };
  }
};

module.exports = {
  verifySupabaseAuth,
  verifySocketAuth,
};
