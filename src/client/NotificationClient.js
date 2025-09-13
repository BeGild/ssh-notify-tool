/**
 * @fileoverview Notification client for sending notifications to the server
 * Provides HTTP client with retry logic and error handling for network failures
 */

const axios = require('axios');
const { URL } = require('url');

/**
 * HTTP client for sending notifications to the notification server
 * Includes retry logic with exponential backoff and comprehensive error handling
 */
class NotificationClient {
  constructor(options = {}) {
    this.options = {
      baseURL: 'http://localhost:3000',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      retryMultiplier: 2,
      maxRetryDelay: 10000,
      ...options
    };

    // Create axios instance
    this.httpClient = axios.create({
      baseURL: this.options.baseURL,
      timeout: this.options.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SSH-Notify-Tool-Client/1.0.0'
      }
    });

    // Set authentication token if provided
    if (this.options.token) {
      this.setAuthToken(this.options.token);
    }

    // Add request/response interceptors
    this._setupInterceptors();
  }

  /**
   * Set authentication token
   * @param {string} token - Authentication token
   */
  setAuthToken(token) {
    if (token) {
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.httpClient.defaults.headers.common['Authorization'];
    }
  }

  /**
   * Send notification to specific channels
   * @param {NotificationRequest} notification - Notification to send
   * @param {string[]} channels - Target channels
   * @returns {Promise<RoutingResult>} Routing result
   */
  async notify(notification, channels) {
    if (!notification) {
      throw new Error('Notification is required');
    }

    if (!Array.isArray(channels) || channels.length === 0) {
      throw new Error('At least one channel must be specified');
    }

    const payload = {
      notification: this._validateNotification(notification),
      channels
    };

    return await this._sendWithRetry('POST', '/api/notify', payload);
  }

  /**
   * Broadcast notification to all available channels
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<RoutingResult>} Routing result
   */
  async broadcast(notification) {
    if (!notification) {
      throw new Error('Notification is required');
    }

    const payload = {
      notification: this._validateNotification(notification)
    };

    return await this._sendWithRetry('POST', '/api/notify/broadcast', payload);
  }

  /**
   * Get list of available channels
   * @returns {Promise<string[]>} Available channel names
   */
  async getChannels() {
    const response = await this._sendWithRetry('GET', '/api/channels');
    return response.channels || [];
  }

  /**
   * Get channel health status
   * @returns {Promise<Object>} Channel health status
   */
  async getChannelHealth() {
    return await this._sendWithRetry('GET', '/api/channels/health');
  }

  /**
   * Get server health status
   * @returns {Promise<Object>} Server health status
   */
  async getHealth() {
    return await this._sendWithRetry('GET', '/api/health');
  }

  /**
   * Get delivery statistics
   * @returns {Promise<Object>} Delivery statistics
   */
  async getStats() {
    return await this._sendWithRetry('GET', '/api/stats');
  }

  /**
   * Get list of loaded plugins
   * @returns {Promise<Object[]>} Plugin information
   */
  async getPlugins() {
    const response = await this._sendWithRetry('GET', '/api/plugins');
    return response.plugins || [];
  }

  /**
   * Get specific plugin information
   * @param {string} name - Plugin name
   * @returns {Promise<Object>} Plugin information
   */
  async getPlugin(name) {
    return await this._sendWithRetry('GET', `/api/plugins/${encodeURIComponent(name)}`);
  }

  /**
   * Test connection to the server
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      await this.getHealth();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send HTTP request with retry logic
   * @private
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {Object} [data] - Request data
   * @returns {Promise<Object>} Response data
   */
  async _sendWithRetry(method, path, data) {
    let lastError = null;
    let delay = this.options.retryDelay;

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        const config = {
          method,
          url: path,
          ...(data && { data })
        };

        const response = await this.httpClient.request(config);
        return response.data;

      } catch (error) {
        lastError = error;

        // Don't retry on authentication errors or client errors (4xx except 429)
        if (error.response) {
          const status = error.response.status;
          if (status === 401 || status === 403 || (status >= 400 && status < 500 && status !== 429)) {
            throw this._createClientError(error);
          }
        }

        // Don't retry on last attempt
        if (attempt === this.options.retryAttempts) {
          break;
        }

        // Log retry attempt
        console.warn(`Request failed (attempt ${attempt}/${this.options.retryAttempts}): ${error.message}`);
        console.warn(`Retrying in ${delay}ms...`);

        // Wait before retry
        await this._sleep(delay);

        // Exponential backoff with jitter
        delay = Math.min(
          delay * this.options.retryMultiplier + Math.random() * 1000,
          this.options.maxRetryDelay
        );
      }
    }

    // All retries failed, throw the last error
    throw this._createClientError(lastError);
  }

  /**
   * Validate notification object
   * @private
   * @param {NotificationRequest} notification - Notification to validate
   * @returns {NotificationRequest} Validated notification
   */
  _validateNotification(notification) {
    if (!notification.title) {
      throw new Error('Notification title is required');
    }

    if (!notification.message) {
      throw new Error('Notification message is required');
    }

    // Set default level if not provided
    const validLevels = ['info', 'warning', 'error'];
    if (!notification.level || !validLevels.includes(notification.level)) {
      notification.level = 'info';
    }

    return {
      title: String(notification.title),
      message: String(notification.message),
      level: notification.level,
      ...(notification.metadata && { metadata: notification.metadata })
    };
  }

  /**
   * Create client-specific error
   * @private
   * @param {Error} error - Original error
   * @returns {Error} Client error
   */
  _createClientError(error) {
    if (error.code === 'ECONNREFUSED') {
      return new Error('Unable to connect to notification server. Please check if the server is running.');
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return new Error('Network timeout or server not found. Please check your connection and server address.');
    }

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      let message = `Server error (${status})`;
      if (data && data.message) {
        message += `: ${data.message}`;
      }

      const clientError = new Error(message);
      clientError.status = status;
      clientError.response = data;
      return clientError;
    }

    return error;
  }

  /**
   * Setup request/response interceptors
   * @private
   */
  _setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        // Log request in debug mode
        if (process.env.DEBUG) {
          console.debug(`Sending ${config.method.toUpperCase()} request to ${config.url}`);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        // Log response in debug mode
        if (process.env.DEBUG) {
          console.debug(`Received ${response.status} response from ${response.config.url}`);
        }
        return response;
      },
      (error) => {
        // Log error in debug mode
        if (process.env.DEBUG && error.response) {
          console.debug(`Request failed with ${error.response.status}: ${error.response.statusText}`);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Sleep for specified milliseconds
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a new client instance with different options
   * @param {Object} options - Client options
   * @returns {NotificationClient} New client instance
   */
  static create(options = {}) {
    return new NotificationClient(options);
  }

  /**
   * Create client from environment variables
   * @returns {NotificationClient} Configured client instance
   */
  static fromEnvironment() {
    const options = {};

    if (process.env.NOTIFY_SERVER_URL) {
      options.baseURL = process.env.NOTIFY_SERVER_URL;
    }

    if (process.env.NOTIFY_AUTH_TOKEN) {
      options.token = process.env.NOTIFY_AUTH_TOKEN;
    }

    if (process.env.NOTIFY_TIMEOUT) {
      options.timeout = parseInt(process.env.NOTIFY_TIMEOUT, 10);
    }

    if (process.env.NOTIFY_RETRY_ATTEMPTS) {
      options.retryAttempts = parseInt(process.env.NOTIFY_RETRY_ATTEMPTS, 10);
    }

    return new NotificationClient(options);
  }

  /**
   * Quick notification helper
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} [level='info'] - Notification level
   * @param {string[]} [channels] - Target channels (if not provided, broadcasts to all)
   * @param {Object} [clientOptions] - Client options
   * @returns {Promise<RoutingResult>} Routing result
   */
  static async quickNotify(title, message, level = 'info', channels = null, clientOptions = {}) {
    const client = new NotificationClient(clientOptions);
    const notification = { title, message, level };

    if (channels && channels.length > 0) {
      return await client.notify(notification, channels);
    } else {
      return await client.broadcast(notification);
    }
  }
}

module.exports = NotificationClient;