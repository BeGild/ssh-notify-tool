/**
 * @fileoverview Base plugin class that defines the standard interface for all notification channel plugins
 * All notification channel plugins must extend this class and implement the required methods
 */

const { PluginMetadata, NotificationRequest, ChannelResponse } = require('../types');

/**
 * Abstract base class for all notification channel plugins
 * Provides the standard interface and common functionality that all plugins must implement
 */
class BasePlugin {
  /**
   * Create a new plugin instance
   * @param {Object} config - Plugin-specific configuration
   */
  constructor(config = {}) {
    this.config = config;
    this.isInitialized = false;
    this.lastError = null;
    
    // Validate that this is not being instantiated directly
    if (this.constructor === BasePlugin) {
      throw new Error('BasePlugin is an abstract class and cannot be instantiated directly');
    }
    
    // Validate that required methods are implemented
    this._validateImplementation();
  }

  /**
   * Plugin metadata - must be implemented by subclasses
   * @abstract
   * @returns {PluginMetadata} Plugin metadata object
   */
  static get metadata() {
    throw new Error('Plugin metadata must be implemented by subclass');
  }

  /**
   * Get plugin name (convenience method)
   * @returns {string} Plugin name
   */
  getName() {
    return this.constructor.metadata.name;
  }

  /**
   * Get plugin display name (convenience method)
   * @returns {string} Plugin display name
   */
  getDisplayName() {
    return this.constructor.metadata.displayName;
  }

  /**
   * Get plugin capabilities (convenience method)
   * @returns {string[]} Array of supported capabilities
   */
  getCapabilities() {
    return this.constructor.metadata.capabilities || [];
  }

  /**
   * Get plugin configuration schema (convenience method)
   * @returns {Object} JSON schema for configuration validation
   */
  getConfigSchema() {
    return this.constructor.metadata.configSchema || {};
  }

  /**
   * Send notification through this channel
   * @abstract
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    throw new Error(`send() method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Validate plugin-specific configuration
   * @abstract
   * @param {Object} config - Configuration to validate
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async validate(config) {
    throw new Error(`validate() method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Check if channel is available in current environment
   * @abstract
   * @returns {Promise<boolean>} True if channel is available
   */
  async isAvailable() {
    throw new Error(`isAvailable() method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Initialize the plugin (called once during startup)
   * @optional
   * @param {Object} config - Plugin configuration
   * @returns {Promise<void>}
   */
  async setup(config) {
    this.config = { ...this.config, ...config };
    this.isInitialized = true;
  }

  /**
   * Cleanup plugin resources (called during shutdown)
   * @optional
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.isInitialized = false;
    this.config = {};
  }

  /**
   * Check plugin health status
   * @optional
   * @returns {Promise<{healthy: boolean, message: string}>} Health status
   */
  async healthCheck() {
    return {
      healthy: this.isInitialized && await this.isAvailable(),
      message: this.isInitialized ? 'Plugin is healthy' : 'Plugin not initialized'
    };
  }

  /**
   * Create a standardized channel response
   * @protected
   * @param {boolean} success - Whether the operation was successful
   * @param {string} message - Success or error message
   * @param {Object} metadata - Additional response metadata
   * @returns {ChannelResponse} Standardized response object
   */
  _createResponse(success, message, metadata = {}) {
    return {
      channel: this.getName(),
      success,
      message,
      timestamp: new Date().toISOString(),
      metadata: {
        plugin: this.getDisplayName(),
        version: this.constructor.metadata.version,
        ...metadata
      }
    };
  }

  /**
   * Handle and log errors consistently
   * @protected
   * @param {Error} error - Error to handle
   * @param {string} operation - Operation that failed
   * @returns {ChannelResponse} Error response
   */
  _handleError(error, operation = 'notification') {
    this.lastError = error;
    const message = `${operation} failed: ${error.message}`;
    
    // Log error (in production, this would use a proper logger)
    console.error(`[${this.getName()}] ${message}`, error);
    
    return this._createResponse(false, message, {
      error: error.name,
      stack: error.stack
    });
  }

  /**
   * Validate that required methods are implemented
   * @private
   */
  _validateImplementation() {
    const requiredMethods = ['send', 'validate', 'isAvailable'];
    const missingMethods = [];
    
    for (const method of requiredMethods) {
      if (this[method] === BasePlugin.prototype[method]) {
        missingMethods.push(method);
      }
    }
    
    if (missingMethods.length > 0) {
      throw new Error(
        `Plugin ${this.constructor.name} must implement: ${missingMethods.join(', ')}`
      );
    }
    
    // Validate that metadata is provided
    if (!this.constructor.metadata) {
      throw new Error(`Plugin ${this.constructor.name} must provide static metadata property`);
    }
    
    // Validate required metadata fields
    const metadata = this.constructor.metadata;
    const requiredFields = ['name', 'displayName', 'version', 'author'];
    const missingFields = requiredFields.filter(field => !metadata[field]);
    
    if (missingFields.length > 0) {
      throw new Error(
        `Plugin ${this.constructor.name} metadata missing: ${missingFields.join(', ')}`
      );
    }
  }

  /**
   * Helper method to validate notification request
   * @protected
   * @param {NotificationRequest} notification - Notification to validate
   * @throws {Error} If notification is invalid
   */
  _validateNotification(notification) {
    if (!notification) {
      throw new Error('Notification is required');
    }
    
    if (!notification.title || typeof notification.title !== 'string') {
      throw new Error('Notification title is required and must be a string');
    }
    
    if (!notification.message || typeof notification.message !== 'string') {
      throw new Error('Notification message is required and must be a string');
    }
    
    if (notification.level && !['info', 'warning', 'error'].includes(notification.level)) {
      throw new Error('Notification level must be info, warning, or error');
    }
  }

  /**
   * Helper method to validate configuration against schema
   * @protected
   * @param {Object} config - Configuration to validate
   * @param {Object} schema - JSON schema for validation
   * @returns {boolean} True if valid
   * @throws {Error} If configuration is invalid
   */
  _validateConfig(config, schema) {
    // Basic validation - in a real implementation, you'd use a JSON schema validator
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }
    
    // Check required fields if schema defines them
    if (schema.required && Array.isArray(schema.required)) {
      const missing = schema.required.filter(field => !(field in config));
      if (missing.length > 0) {
        throw new Error(`Missing required configuration fields: ${missing.join(', ')}`);
      }
    }
    
    return true;
  }

  /**
   * Helper method for retry logic with exponential backoff
   * @protected
   * @param {Function} operation - Async operation to retry
   * @param {number} maxAttempts - Maximum retry attempts
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise<any>} Result of successful operation
   */
  async _retryOperation(operation, maxAttempts = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          break;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

module.exports = BasePlugin;
