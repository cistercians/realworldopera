const rateLimit = require('express-rate-limit');
const config = require('../config');

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login rate limiter (stricter)
const loginLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitLoginMax,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Register rate limiter (strictest)
const registerLimiter = rateLimit({
  windowMs: 3600000, // 1 hour
  max: config.rateLimitRegisterMax,
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Socket event rate limiter (in-memory tracking)
class SocketRateLimiter {
  constructor(maxEvents = 20, windowMs = 60000) {
    this.maxEvents = maxEvents;
    this.windowMs = windowMs;
    this.events = new Map();
  }

  check(socketId, eventType) {
    const key = `${socketId}:${eventType}`;
    const now = Date.now();

    if (!this.events.has(key)) {
      this.events.set(key, []);
    }

    const eventTimes = this.events.get(key);

    // Remove old events outside the window
    const validEvents = eventTimes.filter((time) => now - time < this.windowMs);

    if (validEvents.length >= this.maxEvents) {
      return false; // Rate limit exceeded
    }

    validEvents.push(now);
    this.events.set(key, validEvents);

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup();
    }

    return true; // OK
  }

  cleanup() {
    const now = Date.now();
    for (const [key, times] of this.events.entries()) {
      const validTimes = times.filter((time) => now - time < this.windowMs);
      if (validTimes.length === 0) {
        this.events.delete(key);
      } else {
        this.events.set(key, validTimes);
      }
    }
  }

  reset(socketId) {
    const keysToDelete = [];
    for (const key of this.events.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.events.delete(key));
  }
}

module.exports = {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  SocketRateLimiter,
};
