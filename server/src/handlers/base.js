/**
 * Base class for all notification handlers
 * Provides common interface and lifecycle hooks
 */
class NotificationHandler {
  /**
   * Create notification handler
   * @param {Object} config - Handler configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config = {}, logger = console) {
    this.config = {
      enabled: true,
      retries: 3,
      timeout: 10000,
      ...config
    };
    this.logger = logger;
    this.metrics = {
      sent: 0,
      failed: 0,
      lastSent: null,
      lastError: null
    };
  }

  /**
   * Send notification - must be implemented by subclasses
   * @param {Object} notification - Notification object
   * @returns {Promise<Object>} Send result
   * @abstract
   */
  async send(notification) {
    throw new Error('send() method must be implemented by subclass');
  }

  /**
   * Check if handler is enabled and configured
   * @returns {boolean} True if handler can send notifications
   */
  isEnabled() {
    return this.config.enabled && this.isConfigured();
  }

  /**
   * Check if handler is properly configured - implement in subclasses
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return true; // Override in subclasses
  }

  /**
   * Get handler type name - implement in subclasses
   * @returns {string} Handler type
   */
  getType() {
    return this.constructor.name.replace('Handler', '').toLowerCase();
  }

  /**
   * Validate notification before sending
   * @param {Object} notification - Notification to validate
   * @returns {Object} Validation result
   */
  validate(notification) {
    const errors = [];

    if (!notification) {
      errors.push('Notification is required');
      return { valid: false, errors };
    }

    if (!notification.title || typeof notification.title !== 'string') {
      errors.push('Notification title is required and must be a string');
    }

    if (!notification.message || typeof notification.message !== 'string') {
      errors.push('Notification message is required and must be a string');
    }

    if (notification.level && !['info', 'warning', 'error'].includes(notification.level)) {
      errors.push('Notification level must be info, warning, or error');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute notification sending with error handling and retries
   * @param {Object} notification - Notification to send
   * @returns {Promise<Object>} Send result
   */
  async execute(notification) {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: `${this.getType()} handler is disabled or not configured`,
        timestamp: new Date().toISOString()
      };
    }

    // Validate notification
    const validation = this.validate(notification);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        timestamp: new Date().toISOString()
      };
    }

    const startTime = Date.now();
    let lastError;

    // Try sending with retries
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        this.logger.debug(`Sending ${this.getType()} notification`, {
          attempt,
          notificationId: notification.id,
          title: notification.title
        });

        // Call beforeSend hook
        await this.beforeSend(notification, attempt);

        // Send notification with timeout
        const result = await Promise.race([
          this.send(notification),
          this._createTimeoutPromise()
        ]);

        // Call afterSend hook
        await this.afterSend(result, notification, attempt);

        // Update metrics
        this.metrics.sent++;
        this.metrics.lastSent = new Date().toISOString();

        const duration = Date.now() - startTime;
        
        this.logger.info(`${this.getType()} notification sent successfully`, {
          notificationId: notification.id,
          attempt,
          duration,
          messageId: result.messageId
        });

        return {
          success: true,
          messageId: result.messageId || `${this.getType()}_${Date.now()}`,
          timestamp: new Date().toISOString(),
          attempt,
          duration
        };

      } catch (error) {
        lastError = error;
        this.metrics.failed++;
        this.metrics.lastError = error.message;

        this.logger.warn(`${this.getType()} notification failed`, {
          notificationId: notification.id,
          attempt,
          error: error.message,
          willRetry: attempt < this.config.retries
        });

        // Call onError hook
        await this.onError(error, notification, attempt);

        // Wait before retry (exponential backoff)
        if (attempt < this.config.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this._sleep(delay);
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      attempts: this.config.retries,
      duration
    };
  }

  /**
   * Hook called before sending notification
   * @param {Object} notification - Notification object
   * @param {number} attempt - Current attempt number
   */
  async beforeSend(notification, attempt) {
    // Override in subclasses if needed
  }

  /**
   * Hook called after successful send
   * @param {Object} result - Send result
   * @param {Object} notification - Notification object
   * @param {number} attempt - Attempt number
   */
  async afterSend(result, notification, attempt) {
    // Override in subclasses if needed
  }

  /**
   * Hook called on send error
   * @param {Error} error - Error that occurred
   * @param {Object} notification - Notification object
   * @param {number} attempt - Attempt number
   */
  async onError(error, notification, attempt) {
    // Override in subclasses if needed
  }

  /**
   * Get handler metrics
   * @returns {Object} Handler metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.sent + this.metrics.failed > 0 
        ? (this.metrics.sent / (this.metrics.sent + this.metrics.failed) * 100).toFixed(2)
        : 'N/A'
    };
  }

  /**
   * Reset handler metrics
   */
  resetMetrics() {
    this.metrics = {
      sent: 0,
      failed: 0,
      lastSent: null,
      lastError: null
    };
  }

  /**
   * Get handler status information
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      type: this.getType(),
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      metrics: this.getMetrics(),
      config: {
        retries: this.config.retries,
        timeout: this.config.timeout
      }
    };
  }

  /**
   * Update handler configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Create timeout promise
   * @returns {Promise} Promise that rejects after timeout
   * @private
   */
  _createTimeoutPromise() {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${this.getType()} handler timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sanitize notification data for logging
   * @param {Object} notification - Notification object
   * @returns {Object} Sanitized notification
   * @protected
   */
  _sanitizeForLog(notification) {
    const sanitized = {
      id: notification.id,
      title: notification.title,
      level: notification.level,
      timestamp: notification.timestamp
    };

    // Don't log full message content to avoid log spam
    if (notification.message) {
      sanitized.messageLength = notification.message.length;
      sanitized.messagePreview = notification.message.substring(0, 100);
    }

    return sanitized;
  }
}

module.exports = NotificationHandler;