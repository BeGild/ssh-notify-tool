#!/usr/bin/env node

/**
 * @fileoverview Server startup script for SSH Notify Tool
 * Main entry point for running the notification server with plugin system
 */

const path = require('path');
const fs = require('fs');
const NotificationServer = require('../server/NotificationServer');
const ConfigManager = require('../config/ConfigManager');

class ServerLauncher {
  constructor() {
    this.server = null;
    this.configManager = new ConfigManager();
    this.startTime = Date.now();
    
    // Parse command line arguments
    this.parseArguments();
    
    // Setup logging
    this.setupLogging();
  }

  /**
   * Parse command line arguments
   */
  parseArguments() {
    const args = process.argv.slice(2);
    
    this.options = {
      port: parseInt(process.env.PORT) || 3000,
      host: process.env.HOST || '0.0.0.0',
      configPath: process.env.CONFIG_PATH,
      logLevel: process.env.LOG_LEVEL || 'info',
      dev: false,
      daemon: false,
      verbose: false,
      quiet: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '-p':
        case '--port':
          this.options.port = parseInt(args[++i]);
          break;
        case '-h':
        case '--host':
          this.options.host = args[++i];
          break;
        case '-c':
        case '--config':
          this.options.configPath = args[++i];
          break;
        case '--log-level':
          this.options.logLevel = args[++i];
          break;
        case '-d':
        case '--daemon':
          this.options.daemon = true;
          break;
        case '--dev':
          this.options.dev = true;
          process.env.NODE_ENV = 'development';
          break;
        case '-v':
        case '--verbose':
          this.options.verbose = true;
          break;
        case '-q':
        case '--quiet':
          this.options.quiet = true;
          break;
        case '--help':
          this.showHelp();
          process.exit(0);
          break;
        case '--version':
          this.showVersion();
          process.exit(0);
          break;
        default:
          if (arg.startsWith('-')) {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
          }
          break;
      }
    }

    // Validate port
    if (isNaN(this.options.port) || this.options.port < 1 || this.options.port > 65535) {
      console.error('Error: Port must be a number between 1 and 65535');
      process.exit(1);
    }
  }

  /**
   * Setup logging configuration
   */
  setupLogging() {
    // Set log level
    if (this.options.verbose) {
      this.options.logLevel = 'debug';
      process.env.DEBUG = '*';
    }
    
    if (this.options.quiet) {
      this.options.logLevel = 'error';
    }

    // Override console methods for better logging
    if (this.options.quiet && this.options.logLevel !== 'error') {
      console.log = () => {};
      console.info = () => {};
      console.warn = () => {};
    }
  }

  /**
   * Start the notification server
   */
  async start() {
    try {
      this.log('Starting SSH Notify Tool Server...');
      this.verbose(`Process ID: ${process.pid}`);
      this.verbose(`Node.js version: ${process.version}`);
      this.verbose(`Environment: ${process.env.NODE_ENV || 'production'}`);

      // Load and validate configuration
      await this.loadConfiguration();

      // Create server instance
      const serverOptions = {
        port: this.options.port,
        host: this.options.host,
        cors: true,
        rateLimit: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: this.options.dev ? 1000 : 100 // Higher limit for development
        },
        auth: {
          enabled: !this.options.dev // Disable auth in development mode
        }
      };

      this.server = new NotificationServer(serverOptions);

      // Setup process signal handlers
      this.setupSignalHandlers();

      // Setup uncaught exception handlers
      this.setupErrorHandlers();

      // Start the server
      await this.server.start();

      // Log successful startup
      const uptime = Date.now() - this.startTime;
      this.log(`✓ Server started successfully in ${uptime}ms`);
      this.log(`✓ Listening on http://${this.options.host}:${this.options.port}`);
      
      if (this.options.dev) {
        this.log('🔧 Development mode: Authentication disabled, CORS enabled');
      }

      // Log plugin information
      if (this.server.pluginManager) {
        const pluginCount = this.server.pluginManager.getPluginCount();
        this.log(`✓ Loaded ${pluginCount} plugins`);
      }

      // Write PID file if in daemon mode
      if (this.options.daemon) {
        this.writePidFile();
      }

      // Perform health check
      await this.performHealthCheck();

    } catch (error) {
      console.error('Failed to start server:', error.message);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Stop the notification server
   */
  async stop() {
    if (this.server) {
      this.log('Stopping server...');
      
      try {
        await this.server.stop();
        this.log('✓ Server stopped successfully');
        
        // Remove PID file
        if (this.options.daemon) {
          this.removePidFile();
        }
        
      } catch (error) {
        console.error('Error stopping server:', error.message);
        process.exit(1);
      }
    }
  }

  /**
   * Load and validate configuration
   */
  async loadConfiguration() {
    try {
      this.verbose('Loading configuration...');
      
      // Set config path if provided
      if (this.options.configPath) {
        this.configManager.configPath = this.options.configPath;
      }

      const config = await this.configManager.loadConfig();
      this.verbose(`Configuration loaded from: ${this.configManager.getConfigPath()}`);
      
      // Override config with command line options
      if (config.server) {
        config.server.port = this.options.port;
        config.server.host = this.options.host;
      }

      return config;

    } catch (error) {
      if (error.code === 'ENOENT') {
        this.log('⚠ No configuration file found, using defaults');
        return {};
      } else {
        throw new Error(`Configuration error: ${error.message}`);
      }
    }
  }

  /**
   * Setup process signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        this.log(`\nReceived ${signal}, shutting down gracefully...`);
        
        try {
          await this.stop();
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    });
  }

  /**
   * Setup error handlers for uncaught exceptions
   */
  setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      
      // Attempt graceful shutdown
      this.stop().finally(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      
      // Don't exit on unhandled rejection in development
      if (!this.options.dev) {
        this.stop().finally(() => {
          process.exit(1);
        });
      }
    });
  }

  /**
   * Write PID file for daemon mode
   */
  writePidFile() {
    const pidFile = path.join(process.cwd(), 'notify-server.pid');
    
    try {
      fs.writeFileSync(pidFile, process.pid.toString());
      this.verbose(`PID file written: ${pidFile}`);
    } catch (error) {
      console.warn(`Warning: Could not write PID file: ${error.message}`);
    }
  }

  /**
   * Remove PID file
   */
  removePidFile() {
    const pidFile = path.join(process.cwd(), 'notify-server.pid');
    
    try {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
        this.verbose('PID file removed');
      }
    } catch (error) {
      console.warn(`Warning: Could not remove PID file: ${error.message}`);
    }
  }

  /**
   * Perform health check after startup
   */
  async performHealthCheck() {
    try {
      this.verbose('Performing health check...');
      
      // Simple HTTP request to health endpoint
      const http = require('http');
      
      return new Promise((resolve, reject) => {
        const req = http.get(`http://${this.options.host}:${this.options.port}/api/health`, (res) => {
          let data = '';
          
          res.on('data', chunk => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode === 200) {
              this.verbose('✓ Health check passed');
              resolve(true);
            } else {
              reject(new Error(`Health check failed: HTTP ${res.statusCode}`));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(new Error(`Health check failed: ${error.message}`));
        });
        
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Health check timeout'));
        });
      });

    } catch (error) {
      console.warn(`Health check failed: ${error.message}`);
    }
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log('SSH Notify Tool Server');
    console.log('');
    console.log('Usage: notify-server [options]');
    console.log('');
    console.log('Options:');
    console.log('  -p, --port <port>      Server port (default: 3000)');
    console.log('  -h, --host <host>      Server host (default: 0.0.0.0)');
    console.log('  -c, --config <path>    Configuration file path');
    console.log('  --log-level <level>    Log level (debug, info, warn, error)');
    console.log('  -d, --daemon           Run as daemon');
    console.log('  --dev                  Development mode (disables auth)');
    console.log('  -v, --verbose          Verbose output');
    console.log('  -q, --quiet            Quiet mode (errors only)');
    console.log('  --help                 Show this help message');
    console.log('  --version              Show version information');
    console.log('');
    console.log('Environment Variables:');
    console.log('  PORT                   Server port');
    console.log('  HOST                   Server host');
    console.log('  CONFIG_PATH            Configuration file path');
    console.log('  LOG_LEVEL              Logging level');
    console.log('  NODE_ENV               Node environment (development/production)');
    console.log('');
    console.log('Examples:');
    console.log('  notify-server                          # Start with defaults');
    console.log('  notify-server -p 8080 --dev           # Development mode on port 8080');
    console.log('  notify-server -c /etc/notify.json -d  # Daemon with custom config');
  }

  /**
   * Show version information
   */
  showVersion() {
    try {
      const packagePath = path.join(__dirname, '..', '..', 'package.json');
      const pkg = require(packagePath);
      console.log(`SSH Notify Tool Server v${pkg.version}`);
    } catch (error) {
      console.log('SSH Notify Tool Server v1.0.0');
    }
  }

  /**
   * Log message (unless quiet mode is enabled)
   */
  log(message) {
    if (!this.options.quiet) {
      console.log(message);
    }
  }

  /**
   * Log verbose message (only if verbose mode is enabled)
   */
  verbose(message) {
    if (this.options.verbose && !this.options.quiet) {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

// Start server if this file is executed directly
if (require.main === module) {
  const launcher = new ServerLauncher();
  launcher.start().catch(error => {
    console.error('Startup failed:', error);
    process.exit(1);
  });
}

module.exports = ServerLauncher;