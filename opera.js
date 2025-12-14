const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./server/config');
const logger = require('./server/config/logger');
const { generalLimiter } = require('./server/middleware/rateLimiter');

const app = express();
const http = require('http').Server(app);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now to allow Mapbox, will configure later
}));
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));
app.use(express.json());
app.use(generalLimiter);

// Socket.io
const io = require('socket.io')(http, {
  transports: ['websocket'],
  pingInterval: config.socketPingInterval,
  pingTimeout: config.socketPingTimeout,
  upgradeTimeout: config.socketUpgradeTimeout,
});

// Load server modules
require('./server/js/commands');
require('./server/js/gematria');
require('./server/js/utils');
require('./server/js/projects');
require('./server/js/research');

// Initialize research services
const cycleManager = require('./server/services/research/cycleManager');
const jobQueue = require('./server/services/queue/jobQueue');
const scrapeWorker = require('./server/services/research/scrapeWorker');
const EventEmitter = require('events');

// Create a dedicated event emitter for job queue events
const jobEventEmitter = new EventEmitter();

// Set Socket.io instance after it's created
setTimeout(() => {
  cycleManager.setIO(io);
  jobQueue.setEventEmitter(jobEventEmitter);
  // Register scraping worker
  jobQueue.registerWorker('scrape-approved-finding', scrapeWorker);

  // Listen for job completion events from job queue
  jobEventEmitter.on('job:completed', (job) => {
    console.log('[JOB EVENT] job:completed received:', { type: job.type, hasResult: !!job.result });
    if (job.type === 'scrape-approved-finding' && job.result) {
      const { projectId, sourceUrl } = job.data;
      const result = job.result;

      if (result.scraped && result.entitiesAdded > 0) {
        // Notify all sockets in the project room
        io.to(`project:${projectId}`).emit('chat', {
          msg: `found ${result.entitiesAdded} new entities from ${sourceUrl}, use /review to view`,
        });
        
        // Optionally refresh review queue for users with modal open
        const research = require('./server/js/research');
        const allReviews = research.MEMORY_REVIEW_QUEUE.filter(
          (r) => r.projectId === projectId
        );
        
        io.to(`project:${projectId}`).emit('reviewQueue', {
          projectId: projectId,
          findings: allReviews.map((review) => ({
            id: review.id,
            findingType: review.findingType,
            type: review.findingType,
            name: review.extractedData?.name || review.extractedData?.address || 'unknown',
            sourceUrl: review.sourceUrl || '#',
            confidence: review.confidence || 0,
            contextSnippet: review.contextSnippet || '',
            context: review.contextSnippet || '',
            status: review.reviewed ? (review.status || 'pending') : 'pending',
            extractedData: review.extractedData,
          })),
        });
      } else if (result.scraped === false && result.reason !== 'url_not_scrapeable') {
        // Notify on errors and blocked sites
        if (result.reason === 'error') {
          io.to(`project:${projectId}`).emit('chat', {
            msg: `failed to scrape ${sourceUrl}: ${result.error || 'unknown error'}`,
          });
        } else if (result.reason === 'blocked') {
          io.to(`project:${projectId}`).emit('chat', {
            msg: `cannot scrape ${sourceUrl}: ${result.error || 'blocked by anti-bot protection (requires authentication)'}`,
          });
        } else if (result.reason === 'no_content') {
          io.to(`project:${projectId}`).emit('chat', {
            msg: `no content found at ${sourceUrl}`,
          });
        }
      }
    }
  });

  // Listen for job failures
  jobEventEmitter.on('job:failed', (job) => {
    if (job.type === 'scrape-approved-finding') {
      const { projectId, sourceUrl } = job.data;
      io.to(`project:${projectId}`).emit('chat', {
        msg: `scraping failed for ${sourceUrl}: ${job.error || 'unknown error'}`,
      });
    }
  });
}, 100);

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

// API endpoint to get Mapbox token (secured, no longer in client code)
app.get('/api/config', (req, res) => {
  res.json({
    mapboxToken: config.mapboxToken,
  });
});

SOCKET_LIST = {};
USERS = {};

io.sockets.on('connection', (socket) => {
  socket.id = Math.random();
  SOCKET_LIST[socket.id] = socket;
  logger.info('Socket connected', { socketId: socket.id });
  socket.emit('chat', { msg: 'welcome to the real world opera' });
  socket.emit('chat', { msg: 'simplified mode - projects stored in memory' });
  socket.emit('chat', { msg: '/login [username] to start - no password needed' });
  socket.emit('chat', { msg: '#projectname to create/open project' });
  socket.emit('chat', { msg: 'add items: +entity [name], +loc [address], +coords [lat,lng]' });
  
  // Join project-specific rooms for research updates
  socket.on('join-project', (projectId) => {
    socket.join(`project:${projectId}`);
    logger.info('Socket joined project room', { socketId: socket.id, projectId });
  });

  socket.on('disconnect', (reason) => {
    if (socket.name) {
      delete USERS[socket.name];
      logger.info('User logged out', { username: socket.name });
    }
    delete SOCKET_LIST[socket.id];
    logger.info('Socket disconnected', { socketId: socket.id, reason });
  });

  socket.on('loc', (data) => {
    SOCKET_LIST[socket.id].loc = data;
  });

  socket.on('action', async (data) => {
    logger.info('Action received', { type: data.type, id: data.id, socketId: socket.id });
    const research = require('./server/js/research');
    if (data.type === 'approve') {
      await research.approveFinding(socket, data.id);
    } else if (data.type === 'reject') {
      await research.rejectFinding(socket, data.id);
    }
  });

  socket.on('text', (data) => {
    if (data.msg[0] === '/') {
      const cmd = data.msg.split('/');
      EvalCmd({ id: socket.id, cmd: cmd[1] });
    } else if (data.msg[0] === '#') {
      const key = data.msg.split('#');
      EvalKey({ id: socket.id, key: key[1] });
    } else if (data.msg[0] === '+') {
      if (socket.key) {
        const item = data.msg.split('+');
        EvalAdd({ id: socket.id, item: item[1] });
      } else {
        socket.emit('notif', { msg: 'no #project open' });
      }
    } else if (data.msg[0] === '!') {
      if (socket.key) {
        const item = data.msg.split('!');
        EvalItem({ id: socket.id, item: item[1] });
      } else {
        socket.emit('notif', { msg: 'no #project open' });
      }
    } else {
      if (data.name) {
        io.emit('chat', data);
      } else {
        socket.emit('chat', { msg: '/register or /login to chat' });
      }
    }
  });
});

// Graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn(`${signal} received again, forcing exit`);
    process.exit(1);
  }
  
  isShuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);

  // Set a timeout to force exit if shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    logger.error('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 10000); // 10 second timeout

  try {
    // Disconnect all sockets first
    const sockets = Array.from(io.sockets.sockets.values());
    sockets.forEach((socket) => {
      socket.disconnect(true);
    });
    logger.info(`Disconnected ${sockets.length} socket connections`);

    // Stop job queue processing
    jobQueue.clear();
    logger.info('Job queue cleared');

    // Close Socket.io server
    await new Promise((resolve) => {
      io.close(() => {
        logger.info('Socket.io server closed');
        resolve();
      });
    });

    // Close HTTP server
    await new Promise((resolve) => {
      http.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    // Clear the force exit timer
    clearTimeout(forceExitTimer);
    
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
http.listen(config.port, () => {
  logger.info(`Server is listening on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info('Supabase: Connected');
  logger.info('Ready to accept connections');
});
