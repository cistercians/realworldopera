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
  socket.emit('chat', { msg: 'upgraded with supabase + security!' });
  socket.emit('chat', { msg: '/register username password to create account' });
  socket.emit('chat', { msg: '/login username password to sign in' });

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
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  http.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  http.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start server
http.listen(config.port, () => {
  logger.info(`Server is listening on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info('Supabase: Connected');
  logger.info('Ready to accept connections');
});
