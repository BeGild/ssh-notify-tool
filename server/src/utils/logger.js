const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

/**
 * Logger utility with configurable transports and formatting
 */
class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'info',
      file: config.file || 'logs/app.log',
      maxSize: config.maxSize || '20m',
      maxFiles: config.maxFiles || '14d',
      format: config.format || 'json',
      console: config.console !== false, // Default to true
      ...config
    };

    this.logger = this._createLogger();
  }

  /**
   * Create Winston logger instance
   * @returns {winston.Logger} Logger instance
   * @private
   */
  _createLogger() {
    const transports = [];
    const format = this._createFormat();

    // Console transport
    if (this.config.console) {
      transports.push(new winston.transports.Console({
        level: this.config.level,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    // File transport with rotation
    if (this.config.file) {
      const logDir = path.dirname(this.config.file);
      
      // Ensure log directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Daily rotate file transport
      transports.push(new DailyRotateFile({
        filename: this.config.file.replace('.log', '-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        level: this.config.level,
        format
      }));

      // Separate error log
      transports.push(new DailyRotateFile({
        filename: this.config.file.replace('.log', '-error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        level: 'error',
        format
      }));
    }

    return winston.createLogger({
      level: this.config.level,
      format,
      transports,
      // Handle uncaught exceptions and rejections
      exceptionHandlers: this.config.file ? [
        new DailyRotateFile({
          filename: this.config.file.replace('.log', '-exceptions-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles
        })
      ] : [],
      rejectionHandlers: this.config.file ? [
        new DailyRotateFile({
          filename: this.config.file.replace('.log', '-rejections-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles
        })
      ] : []
    });
  }

  /**
   * Create Winston format based on configuration
   * @returns {winston.Logform.Format} Format instance
   * @private
   */
  _createFormat() {
    const formats = [
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true })
    ];

    if (this.config.format === 'json') {
      formats.push(winston.format.json());
    } else {
      formats.push(winston.format.simple());
    }

    return winston.format.combine(...formats);
  }

  /**
   * Log error level message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  /**
   * Log warning level message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  /**
   * Log info level message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  /**
   * Log debug level message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * Create child logger with additional context
   * @param {Object} defaultMeta - Default metadata for child logger
   * @returns {Logger} Child logger instance
   */
  child(defaultMeta = {}) {
    const childLogger = this.logger.child(defaultMeta);
    return {
      error: (message, meta = {}) => childLogger.error(message, meta),
      warn: (message, meta = {}) => childLogger.warn(message, meta),
      info: (message, meta = {}) => childLogger.info(message, meta),
      debug: (message, meta = {}) => childLogger.debug(message, meta)
    };
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      level: this.config.level,
      transports: this.logger.transports.length,
      file: this.config.file,
      format: this.config.format
    };
  }

  /**
   * Change log level dynamically
   * @param {string} level - New log level
   */
  setLevel(level) {
    this.config.level = level;
    this.logger.level = level;
    this.logger.transports.forEach(transport => {
      if (transport.level !== 'error') { // Don't change error-only transports
        transport.level = level;
      }
    });
  }

  /**
   * Express middleware for request logging
   * @returns {Function} Express middleware
   */
  middleware() {
    const logger = this.logger;
    
    return (req, res, next) => {
      const startTime = Date.now();
      const originalSend = res.send;

      // Override res.send to capture response
      res.send = function(data) {
        const duration = Date.now() - startTime;
        const logData = {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          statusCode: res.statusCode,
          duration,
          requestId: req.id
        };

        // Log based on status code
        if (res.statusCode >= 500) {
          logger.error('HTTP Request', logData);
        } else if (res.statusCode >= 400) {
          logger.warn('HTTP Request', logData);
        } else {
          logger.info('HTTP Request', logData);
        }

        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Gracefully close logger
   * @returns {Promise} Promise that resolves when logger is closed
   */
  close() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

/**
 * Create logger instance from configuration
 * @param {Object} config - Logger configuration
 * @returns {Logger} Logger instance
 */
function createLogger(config) {
  return new Logger(config);
}

module.exports = {
  Logger,
  createLogger
};