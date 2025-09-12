const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');
const { createLogger } = require('./utils/logger');

/**
 * Main application server
 */
class NotificationServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.config = config.load();
    this.logger = createLogger(this.config.logging);
    this.handlers = new Map();
    this.isShuttingDown = false;

    this._setupApp();
  }

  /**
   * Setup Express application
   * @private
   */
  _setupApp() {
    // Trust proxy if behind reverse proxy
    this.app.set('trust proxy', 1);

    // Request ID middleware
    this.app.use(this._requestIdMiddleware());

    // Security middleware
    if (this.config.security.helmetEnabled) {
      this.app.use(helmet());
    }

    // CORS middleware
    if (this.config.security.corsEnabled) {
      this.app.use(cors(this.config.server.cors));
    }

    // Rate limiting
    if (this.config.security.rateLimitEnabled) {
      const limiter = rateLimit({
        windowMs: this.config.server.rateLimit.windowMs,
        max: this.config.server.rateLimit.max,
        message: {
          error: 'Too many requests',
          retryAfter: Math.ceil(this.config.server.rateLimit.windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false
      });
      this.app.use('/api/', limiter);
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(this.logger.middleware());

    // Health check endpoint (before auth)
    this.app.get('/health', this._healthCheck.bind(this));

    // Setup routes
    this._setupRoutes();

    // Error handling
    this._setupErrorHandlers();
  }

  /**
   * Request ID middleware
   * @returns {Function} Express middleware
   * @private
   */
  _requestIdMiddleware() {
    return (req, res, next) => {
      req.id = req.headers['x-request-id'] || uuidv4();
      res.setHeader('X-Request-ID', req.id);
      next();
    };
  }

  /**
   * Setup API routes
   * @private
   */
  _setupRoutes() {
    // API v1 routes
    const apiV1Router = express.Router();
    
    // Auth middleware for API routes
    apiV1Router.use(this._authMiddleware.bind(this));
    
    // Notification routes
    const notifyRouter = require('./routes/notify');
    apiV1Router.use('/notify', notifyRouter);

    this.app.use('/api/v1', apiV1Router);

    // Catch-all for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });
  }

  /**
   * Authentication middleware
   * @private
   */
  _authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
        expected: 'Authorization: Bearer <token>'
      });
    }

    const token = authHeader.substring(7);
    
    if (token !== this.config.auth.token) {
      this.logger.warn('Invalid authentication token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id
      });
      
      return res.status(401).json({
        error: 'Invalid authentication token'
      });
    }

    next();
  }

  /**
   * Health check endpoint
   * @private
   */
  _healthCheck(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: require('../../package.json').version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      handlers: {}
    };

    // Check handler status
    for (const [name, handler] of this.handlers) {
      try {
        health.handlers[name] = handler.isEnabled() ? 'enabled' : 'disabled';
      } catch (error) {
        health.handlers[name] = 'error';
      }
    }

    res.json(health);
  }

  /**
   * Setup error handlers
   * @private
   */
  _setupErrorHandlers() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
        requestId: req.id
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      const statusCode = error.statusCode || error.status || 500;
      const isDev = process.env.NODE_ENV !== 'production';

      this.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        statusCode,
        method: req.method,
        url: req.url,
        requestId: req.id
      });

      res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal Server Error' : error.message,
        requestId: req.id,
        timestamp: new Date().toISOString(),
        ...(isDev && { stack: error.stack })
      });
    });
  }

  /**
   * Register notification handler
   * @param {string} type - Handler type
   * @param {Object} handler - Handler instance
   */
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
    this.logger.info(`Registered ${type} handler`, {
      enabled: handler.isEnabled(),
      type
    });
  }

  /**
   * Get registered handler
   * @param {string} type - Handler type
   * @returns {Object|null} Handler instance
   */
  getHandler(type) {
    return this.handlers.get(type) || null;
  }

  /**
   * Get all registered handlers
   * @returns {Map} Handlers map
   */
  getHandlers() {
    return this.handlers;
  }

  /**
   * Start the server
   * @returns {Promise} Promise that resolves when server is listening
   */
  async start() {
    if (this.server) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(
        this.config.server.port,
        this.config.server.host,
        (error) => {
          if (error) {
            this.logger.error('Failed to start server', { error: error.message });
            return reject(error);
          }

          this.logger.info('Server started', {
            host: this.config.server.host,
            port: this.config.server.port,
            env: process.env.NODE_ENV || 'development'
          });

          resolve();
        }
      );

      // Handle server errors
      this.server.on('error', (error) => {
        this.logger.error('Server error', { error: error.message });
      });
    });
  }

  /**
   * Stop the server gracefully
   * @returns {Promise} Promise that resolves when server is closed
   */
  async stop() {
    if (!this.server) {
      return;
    }

    this.isShuttingDown = true;

    return new Promise((resolve) => {
      this.logger.info('Shutting down server...');

      this.server.close(() => {
        this.logger.info('Server shut down complete');
        resolve();
      });

      // Force close after timeout
      setTimeout(() => {
        this.logger.warn('Forcing server shutdown after timeout');
        process.exit(1);
      }, 10000);
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await this.stop();
        await this.logger.close();
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });
  }
}

module.exports = NotificationServer;