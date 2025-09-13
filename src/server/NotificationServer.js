/**
 * @fileoverview Notification server with REST API endpoints and plugin system integration
 * Provides HTTP API for receiving and processing notification requests
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { AuthMiddleware } = require('../middleware/auth');
const PluginManager = require('../plugins/PluginManager');
const ChannelRouter = require('../services/ChannelRouter');
const ConfigManager = require('../config/ConfigManager');

/**
 * Notification server for handling HTTP requests with plugin system integration
 */
class NotificationServer {
  constructor(options = {}) {
    this.options = {
      port: 3000,
      host: '0.0.0.0',
      cors: true,
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      },
      auth: {
        enabled: true
      },
      ...options
    };

    this.app = express();
    this.server = null;
    this.configManager = new ConfigManager();
    this.pluginManager = new PluginManager();
    this.channelRouter = null;
    this.authMiddleware = new AuthMiddleware(this.options.auth);
    
    this._setupMiddleware();
    this._setupRoutes();
    this._setupErrorHandling();
  }

  /**
   * Start the notification server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      // Load configuration
      const config = await this.configManager.loadConfig();
      console.log('Configuration loaded successfully');

      // Initialize plugin manager
      await this.pluginManager.loadPlugins();
      console.log(`Loaded ${this.pluginManager.getPluginCount()} plugins`);

      // Initialize channel router
      this.channelRouter = new ChannelRouter(this.pluginManager, config.routing);
      
      // Setup channel router event listeners
      this._setupChannelRouterEvents();

      // Start HTTP server
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        console.log(`Notification server running on http://${this.options.host}:${this.options.port}`);
        console.log('Available endpoints:');
        console.log('  POST /api/notify - Send notification');
        console.log('  POST /api/notify/broadcast - Broadcast to all channels');
        console.log('  GET  /api/health - Server health check');
        console.log('  GET  /api/channels - List available channels');
        console.log('  GET  /api/channels/health - Channel health status');
        console.log('  GET  /api/stats - Delivery statistics');
        console.log('  GET  /api/plugins - List loaded plugins');
      });

      // Handle graceful shutdown
      this._setupGracefulShutdown();

    } catch (error) {
      console.error('Failed to start notification server:', error.message);
      throw error;
    }
  }

  /**
   * Stop the notification server
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server.close(async (error) => {
          if (error) {
            reject(error);
          } else {
            try {
              // Cleanup plugin manager
              if (this.pluginManager) {
                await this.pluginManager.cleanup();
              }
              console.log('Notification server stopped');
              resolve();
            } catch (cleanupError) {
              reject(cleanupError);
            }
          }
        });
      });
    }
  }

  /**
   * Setup Express middleware
   * @private
   */
  _setupMiddleware() {
    // Security middleware
    this.app.use(helmet());

    // CORS middleware
    if (this.options.cors) {
      this.app.use(cors());
    }

    // Rate limiting
    if (this.options.rateLimit) {
      const limiter = rateLimit(this.options.rateLimit);
      this.app.use('/api/', limiter);
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp} ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  /**
   * Setup API routes
   * @private
   */
  _setupRoutes() {
    // Health check endpoint (no auth required)
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        pluginsLoaded: this.pluginManager ? this.pluginManager.getPluginCount() : 0
      });
    });

    // Apply authentication middleware to protected routes
    if (this.options.auth.enabled) {
      this.app.use('/api/notify', this.authMiddleware.authenticate);
      this.app.use('/api/channels', this.authMiddleware.authenticate);
      this.app.use('/api/stats', this.authMiddleware.authenticate);
      this.app.use('/api/plugins', this.authMiddleware.authenticate);
    }

    // Notification endpoints
    this.app.post('/api/notify', this._handleNotify.bind(this));
    this.app.post('/api/notify/broadcast', this._handleBroadcast.bind(this));

    // Channel management endpoints
    this.app.get('/api/channels', this._handleGetChannels.bind(this));
    this.app.get('/api/channels/health', this._handleChannelHealth.bind(this));

    // Statistics endpoints
    this.app.get('/api/stats', this._handleGetStats.bind(this));

    // Plugin management endpoints
    this.app.get('/api/plugins', this._handleGetPlugins.bind(this));
    this.app.get('/api/plugins/:name', this._handleGetPlugin.bind(this));

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'SSH Notify Tool Server',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Universal notification tool for CLI applications',
        endpoints: {
          health: '/api/health',
          notify: '/api/notify',
          broadcast: '/api/notify/broadcast',
          channels: '/api/channels',
          stats: '/api/stats',
          plugins: '/api/plugins'
        }
      });
    });
  }

  /**
   * Handle notification requests
   * @private
   */
  async _handleNotify(req, res) {
    try {
      const { notification, channels } = req.body;

      if (!notification) {
        return res.status(400).json({
          error: 'Missing notification data',
          message: 'Request body must include notification object'
        });
      }

      if (!channels || !Array.isArray(channels) || channels.length === 0) {
        return res.status(400).json({
          error: 'Missing channels',
          message: 'Request body must include channels array'
        });
      }

      const result = await this.channelRouter.route(notification, channels);
      
      res.status(result.success ? 200 : 207).json(result);

    } catch (error) {
      console.error('Notification request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle broadcast requests
   * @private
   */
  async _handleBroadcast(req, res) {
    try {
      const { notification } = req.body;

      if (!notification) {
        return res.status(400).json({
          error: 'Missing notification data',
          message: 'Request body must include notification object'
        });
      }

      const result = await this.channelRouter.routeToAll(notification);
      
      res.status(result.success ? 200 : 207).json(result);

    } catch (error) {
      console.error('Broadcast request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle get channels request
   * @private
   */
  async _handleGetChannels(req, res) {
    try {
      const channels = await this.channelRouter.getAvailableChannels();
      
      res.json({
        channels,
        count: channels.length
      });

    } catch (error) {
      console.error('Get channels request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle channel health request
   * @private
   */
  async _handleChannelHealth(req, res) {
    try {
      const healthStatus = await this.channelRouter.getChannelHealthStatus();
      
      res.json(healthStatus);

    } catch (error) {
      console.error('Channel health request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle get statistics request
   * @private
   */
  async _handleGetStats(req, res) {
    try {
      const stats = this.channelRouter.getDeliveryStats();
      
      res.json(stats);

    } catch (error) {
      console.error('Get stats request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle get plugins request
   * @private
   */
  async _handleGetPlugins(req, res) {
    try {
      const plugins = [];
      const allPlugins = await this.pluginManager.getAllPlugins();
      
      for (const [name, plugin] of allPlugins) {
        const metadata = plugin.constructor.metadata;
        const isAvailable = await plugin.isAvailable();
        
        plugins.push({
          name,
          ...metadata,
          available: isAvailable
        });
      }
      
      res.json({
        plugins,
        count: plugins.length
      });

    } catch (error) {
      console.error('Get plugins request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle get single plugin request
   * @private
   */
  async _handleGetPlugin(req, res) {
    try {
      const { name } = req.params;
      const plugin = await this.pluginManager.getPlugin(name);
      
      if (!plugin) {
        return res.status(404).json({
          error: 'Plugin not found',
          message: `Plugin '${name}' is not loaded`
        });
      }

      const metadata = plugin.constructor.metadata;
      const isAvailable = await plugin.isAvailable();
      const health = await plugin.healthCheck();
      
      res.json({
        name,
        ...metadata,
        available: isAvailable,
        health
      });

    } catch (error) {
      console.error('Get plugin request failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Setup error handling middleware
   * @private
   */
  _setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      
      if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid JSON in request body'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
      });
    });
  }

  /**
   * Setup channel router event listeners
   * @private
   */
  _setupChannelRouterEvents() {
    this.channelRouter.on('routingStarted', (data) => {
      console.log(`Routing started: ${data.deliveryId} to ${data.channels.length} channels`);
    });

    this.channelRouter.on('routingCompleted', (result) => {
      console.log(`Routing completed: ${result.deliveryId} - ${result.successfulChannels}/${result.totalChannels} successful`);
    });

    this.channelRouter.on('routingFailed', (result) => {
      console.error(`Routing failed: ${result.deliveryId} - ${result.message}`);
    });

    this.channelRouter.on('channelDeliveryFailed', (data) => {
      console.warn(`Channel delivery failed: ${data.deliveryId} to ${data.result.channel} - ${data.result.message}`);
    });
  }

  /**
   * Setup graceful shutdown handling
   * @private
   */
  _setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart
  }
}

module.exports = NotificationServer;