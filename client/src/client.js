const axios = require('axios');

/**
 * HTTP client for notification service
 * Handles communication with the notification server
 */
class NotificationClient {
  /**
   * Create notification client
   * @param {Object} config - Client configuration
   */
  constructor(config = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:5000',
      token: config.token || '',
      timeout: config.timeout || 10000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    // Create axios instance
    this.httpClient = axios.create({
      baseURL: this.config.serverUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ssh-notify-tool-client/1.0.0'
      }
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use(
      (config) => {
        if (this.config.token) {
          config.headers.Authorization = `Bearer ${this.config.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        const enhancedError = this._enhanceError(error);
        return Promise.reject(enhancedError);
      }
    );
  }

  /**
   * Send notification to server
   * @param {Object} notification - Notification to send
   * @returns {Promise<Object>} Server response
   */
  async send(notification) {
    const validatedNotification = this._validateNotification(notification);
    
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.httpClient.post('/api/v1/notify', validatedNotification);
        
        return {
          success: true,
          data: response.data,
          attempt,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.config.retries) {
          const delay = Math.min(
            this.config.retryDelay * Math.pow(2, attempt - 1),
            10000
          );
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Test connection to notification server
   * @returns {Promise<Object>} Health check response
   */
  async testConnection() {
    try {
      const response = await this.httpClient.get('/health');
      return {
        success: true,
        status: response.data.status,
        version: response.data.version,
        handlers: response.data.handlers,
        timestamp: response.data.timestamp
      };
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Get server status
   * @returns {Promise<Object>} Server status
   */
  async getStatus() {
    return this.testConnection();
  }

  /**
   * Validate notification object
   * @param {Object} notification - Notification to validate
   * @returns {Object} Validated notification
   * @private
   */
  _validateNotification(notification) {
    if (!notification || typeof notification !== 'object') {
      throw new Error('Notification must be an object');
    }

    const validated = {
      title: this._validateString(notification.title, 'title'),
      message: this._validateString(notification.message, 'message'),
      level: this._validateLevel(notification.level),
      channels: this._validateChannels(notification.channels),
      metadata: this._validateMetadata(notification.metadata),
      options: this._validateOptions(notification.options)
    };

    return validated;
  }

  /**
   * Validate string field
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @returns {string} Validated string
   * @private
   */
  _validateString(value, fieldName) {
    if (!value || typeof value !== 'string') {
      throw new Error(`${fieldName} is required and must be a string`);
    }
    
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${fieldName} cannot be empty`);
    }
    
    return trimmed;
  }

  /**
   * Validate notification level
   * @param {*} level - Level to validate
   * @returns {string} Validated level
   * @private
   */
  _validateLevel(level) {
    const validLevels = ['info', 'warning', 'error'];
    
    if (!level) {
      return 'info'; // Default level
    }
    
    if (!validLevels.includes(level)) {
      throw new Error(`Level must be one of: ${validLevels.join(', ')}`);
    }
    
    return level;
  }

  /**
   * Validate notification channels
   * @param {*} channels - Channels to validate
   * @returns {string[]} Validated channels
   * @private
   */
  _validateChannels(channels) {
    const validChannels = ['desktop', 'email', 'sms'];
    
    if (!channels) {
      return ['desktop']; // Default channel
    }
    
    if (typeof channels === 'string') {
      channels = channels.split(',').map(c => c.trim());
    }
    
    if (!Array.isArray(channels)) {
      throw new Error('Channels must be an array or comma-separated string');
    }
    
    const validated = channels.filter(channel => validChannels.includes(channel));
    
    if (validated.length === 0) {
      return ['desktop']; // Fallback to default
    }
    
    return validated;
  }

  /**
   * Validate notification metadata
   * @param {*} metadata - Metadata to validate
   * @returns {Object|undefined} Validated metadata
   * @private
   */
  _validateMetadata(metadata) {
    if (!metadata) {
      return undefined;
    }
    
    if (typeof metadata !== 'object') {
      throw new Error('Metadata must be an object');
    }
    
    const validated = {};
    
    if (metadata.priority !== undefined) {
      validated.priority = Number(metadata.priority) || 1;
    }
    
    if (metadata.tags) {
      if (Array.isArray(metadata.tags)) {
        validated.tags = metadata.tags.filter(tag => typeof tag === 'string');
      } else if (typeof metadata.tags === 'string') {
        validated.tags = metadata.tags.split(',').map(tag => tag.trim());
      }
    }
    
    if (metadata.attachments && Array.isArray(metadata.attachments)) {
      validated.attachments = metadata.attachments;
    }
    
    return Object.keys(validated).length > 0 ? validated : undefined;
  }

  /**
   * Validate notification options
   * @param {*} options - Options to validate
   * @returns {Object|undefined} Validated options
   * @private
   */
  _validateOptions(options) {
    if (!options || typeof options !== 'object') {
      return undefined;
    }
    
    const validated = {};
    
    // Desktop options
    if (options.desktop && typeof options.desktop === 'object') {
      validated.desktop = {
        timeout: Number(options.desktop.timeout) || 5000,
        sound: Boolean(options.desktop.sound),
        actions: Array.isArray(options.desktop.actions) ? options.desktop.actions : []
      };
    }
    
    // Email options
    if (options.email && typeof options.email === 'object') {
      validated.email = {
        to: Array.isArray(options.email.to) ? options.email.to : [],
        subject: options.email.subject || '',
        html: Boolean(options.email.html)
      };
    }
    
    // SMS options
    if (options.sms && typeof options.sms === 'object') {
      validated.sms = {
        to: Array.isArray(options.sms.to) ? options.sms.to : []
      };
    }
    
    return Object.keys(validated).length > 0 ? validated : undefined;
  }

  /**
   * Enhance axios error with additional information
   * @param {Error} error - Axios error
   * @returns {Error} Enhanced error
   * @private
   */
  _enhanceError(error) {
    const enhanced = new Error();
    enhanced.name = 'NotificationClientError';
    
    if (error.response) {
      // Server responded with error status
      enhanced.message = error.response.data?.error || error.message;
      enhanced.status = error.response.status;
      enhanced.statusText = error.response.statusText;
      enhanced.data = error.response.data;
    } else if (error.request) {
      // Request was made but no response
      enhanced.message = 'No response from notification server';
      enhanced.code = 'CONNECTION_ERROR';
    } else {
      // Error in setting up request
      enhanced.message = error.message;
      enhanced.code = 'REQUEST_ERROR';
    }
    
    enhanced.originalError = error;
    return enhanced;
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
   * Update client configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update axios instance
    if (newConfig.serverUrl) {
      this.httpClient.defaults.baseURL = newConfig.serverUrl;
    }
    
    if (newConfig.timeout) {
      this.httpClient.defaults.timeout = newConfig.timeout;
    }
  }

  /**
   * Get current configuration (without sensitive data)
   * @returns {Object} Current configuration
   */
  getConfig() {
    const config = { ...this.config };
    
    // Hide sensitive information
    if (config.token) {
      config.token = '***hidden***';
    }
    
    return config;
  }
}

module.exports = NotificationClient;