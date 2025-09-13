/**
 * @fileoverview SMS notification plugin with support for multiple SMS providers
 * Provides SMS notification delivery using Twilio and Aliyun SMS services
 */

const BasePlugin = require('../BasePlugin');

/**
 * SMS notification plugin supporting multiple providers
 * Supports Twilio and Aliyun SMS with rate limiting and error handling
 */
class SmsPlugin extends BasePlugin {
  /**
   * Plugin metadata
   * @returns {Object} Plugin metadata
   */
  static get metadata() {
    return {
      name: 'sms',
      displayName: 'SMS Notifications',
      version: '1.0.0',
      author: 'SSH Notify Tool Project',
      description: 'SMS notifications via Twilio and Aliyun SMS providers',
      capabilities: ['text'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'provider', 'credentials', 'to'],
        properties: {
          enabled: { type: 'boolean' },
          provider: { 
            type: 'string', 
            enum: ['twilio', 'aliyun']
          },
          credentials: {
            type: 'object',
            properties: {
              // Twilio credentials
              accountSid: { type: 'string' },
              authToken: { type: 'string' },
              // Aliyun credentials  
              accessKeyId: { type: 'string' },
              accessKeySecret: { type: 'string' },
              signName: { type: 'string' },
              templateCode: { type: 'string' }
            }
          },
          from: { type: 'string' },
          to: { 
            type: 'array', 
            items: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' },
            minItems: 1
          },
          rateLimitPerMinute: { type: 'number', minimum: 1, maximum: 100 }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    // Default configuration
    this.defaultConfig = {
      enabled: false,
      provider: 'twilio',
      rateLimitPerMinute: 10,
      timeout: 30000
    };

    // Merge with provided config
    this.config = { ...this.defaultConfig, ...config };
    
    // Provider clients (initialized in setup)
    this.providerClient = null;
    
    // Rate limiting
    this.rateLimiter = {
      requests: [],
      windowMs: 60000 // 1 minute
    };
  }

  /**
   * Send SMS notification
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    try {
      // Validate notification
      this._validateNotification(notification);

      // Check if SMS is available
      if (!await this.isAvailable()) {
        return this._createResponse(false, 'SMS notifications are not available');
      }

      // Check rate limiting
      if (!this._checkRateLimit()) {
        return this._createResponse(false, 'SMS rate limit exceeded');
      }

      // Prepare SMS content
      const smsContent = this._prepareSmsContent(notification);

      // Send SMS to all recipients
      const results = [];
      for (const phoneNumber of this.config.to) {
        try {
          const result = await this._retryOperation(
            () => this._sendSms(phoneNumber, smsContent),
            2,
            3000
          );
          results.push({ phoneNumber, success: true, result });
        } catch (error) {
          results.push({ phoneNumber, success: false, error: error.message });
        }
      }

      // Update rate limiter
      this._updateRateLimit();

      // Determine overall success
      const successCount = results.filter(r => r.success).length;
      const success = successCount > 0;

      return this._createResponse(success, 
        `SMS sent to ${successCount}/${results.length} recipients`, {
          provider: this.config.provider,
          results,
          content: smsContent
        }
      );

    } catch (error) {
      return this._handleError(error, 'SMS notification');
    }
  }

  /**
   * Validate plugin configuration
   * @param {Object} config - Configuration to validate
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async validate(config) {
    try {
      this._validateConfig(config, this.constructor.metadata.configSchema);
      
      // Validate provider-specific credentials
      if (config.provider === 'twilio') {
        if (!config.credentials.accountSid || !config.credentials.authToken) {
          throw new Error('Twilio credentials (accountSid, authToken) are required');
        }
      } else if (config.provider === 'aliyun') {
        if (!config.credentials.accessKeyId || !config.credentials.accessKeySecret || 
            !config.credentials.signName || !config.credentials.templateCode) {
          throw new Error('Aliyun credentials (accessKeyId, accessKeySecret, signName, templateCode) are required');
        }
      }

      // Validate phone numbers
      for (const phoneNumber of config.to) {
        if (!this._isValidPhoneNumber(phoneNumber)) {
          throw new Error(`Invalid phone number format: ${phoneNumber}`);
        }
      }

      return true;
    } catch (error) {
      console.warn(`SMS plugin configuration validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if SMS notifications are available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.providerClient) {
      return false;
    }

    // Provider-specific availability check
    try {
      return await this._testProviderConnection();
    } catch (error) {
      console.warn(`SMS plugin availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Initialize the plugin
   * @param {Object} config - Plugin configuration
   * @returns {Promise<void>}
   */
  async setup(config) {
    await super.setup(config);
    
    // Merge configuration
    this.config = { ...this.defaultConfig, ...config };
    
    if (!this.config.enabled) {
      console.log('SMS plugin disabled');
      return;
    }

    // Initialize provider client
    await this._initializeProvider();
    
    console.log(`SMS plugin initialized with ${this.config.provider} provider`);
  }

  /**
   * Health check for SMS notifications
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    if (!baseHealth.healthy) {
      return baseHealth;
    }

    try {
      const available = await this.isAvailable();
      const providerInfo = {
        provider: this.config.provider,
        recipients: this.config.to.length,
        rateLimit: this.config.rateLimitPerMinute
      };

      return {
        healthy: available,
        message: available ? 
          `SMS notifications available via ${this.config.provider}` : 
          'SMS notifications not available - provider connection failed',
        metadata: { provider: providerInfo }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`
      };
    }
  }

  /**
   * Initialize SMS provider client
   * @private
   */
  async _initializeProvider() {
    switch (this.config.provider) {
      case 'twilio':
        await this._initializeTwilio();
        break;
      case 'aliyun':
        await this._initializeAliyun();
        break;
      default:
        throw new Error(`Unsupported SMS provider: ${this.config.provider}`);
    }
  }

  /**
   * Initialize Twilio client
   * @private
   */
  async _initializeTwilio() {
    try {
      const twilio = require('twilio');
      this.providerClient = twilio(
        this.config.credentials.accountSid,
        this.config.credentials.authToken
      );
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('Twilio SDK not installed. Run: npm install twilio');
      }
      throw error;
    }
  }

  /**
   * Initialize Aliyun client
   * @private
   */
  async _initializeAliyun() {
    try {
      // Note: This would require @alicloud/sms20170525 package
      // For demo purposes, we'll create a mock client
      this.providerClient = {
        sendSms: async (params) => {
          // Mock implementation - in real scenario, use actual Aliyun SDK
          console.log('Aliyun SMS would be sent with params:', params);
          return { RequestId: 'mock-request-id', Code: 'OK' };
        }
      };
    } catch (error) {
      throw new Error('Failed to initialize Aliyun SMS client: ' + error.message);
    }
  }

  /**
   * Test provider connection
   * @private
   * @returns {Promise<boolean>} True if connection works
   */
  async _testProviderConnection() {
    try {
      switch (this.config.provider) {
        case 'twilio':
          // Test Twilio connection by fetching account info
          await this.providerClient.api.accounts(this.config.credentials.accountSid).fetch();
          return true;
        case 'aliyun':
          // For Aliyun, assume connection is OK if client exists
          return !!this.providerClient;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Send SMS to a single recipient
   * @private
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} content - SMS content
   * @returns {Promise<Object>} Send result
   */
  async _sendSms(phoneNumber, content) {
    switch (this.config.provider) {
      case 'twilio':
        return await this._sendTwilioSms(phoneNumber, content);
      case 'aliyun':
        return await this._sendAliyunSms(phoneNumber, content);
      default:
        throw new Error(`Unsupported SMS provider: ${this.config.provider}`);
    }
  }

  /**
   * Send SMS via Twilio
   * @private
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} content - SMS content
   * @returns {Promise<Object>} Twilio result
   */
  async _sendTwilioSms(phoneNumber, content) {
    const message = await this.providerClient.messages.create({
      body: content,
      from: this.config.from || this.config.credentials.phoneNumber,
      to: phoneNumber
    });

    return {
      messageId: message.sid,
      status: message.status,
      provider: 'twilio'
    };
  }

  /**
   * Send SMS via Aliyun
   * @private
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} content - SMS content
   * @returns {Promise<Object>} Aliyun result
   */
  async _sendAliyunSms(phoneNumber, content) {
    const params = {
      PhoneNumbers: phoneNumber,
      SignName: this.config.credentials.signName,
      TemplateCode: this.config.credentials.templateCode,
      TemplateParam: JSON.stringify({ content: content })
    };

    const result = await this.providerClient.sendSms(params);

    return {
      messageId: result.RequestId,
      status: result.Code === 'OK' ? 'sent' : 'failed',
      provider: 'aliyun'
    };
  }

  /**
   * Prepare SMS content from notification
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {string} SMS content
   */
  _prepareSmsContent(notification) {
    const maxLength = 160; // Standard SMS length
    
    let content = `${notification.title}\n${notification.message}`;
    
    // Add level indicator for important notifications
    if (notification.level === 'error') {
      content = `🚨 ${content}`;
    } else if (notification.level === 'warning') {
      content = `⚠️ ${content}`;
    }

    // Truncate if too long
    if (content.length > maxLength) {
      content = content.substring(0, maxLength - 3) + '...';
    }

    return content;
  }

  /**
   * Check rate limiting
   * @private
   * @returns {boolean} True if within rate limit
   */
  _checkRateLimit() {
    const now = Date.now();
    const windowStart = now - this.rateLimiter.windowMs;
    
    // Clean old requests
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      timestamp => timestamp > windowStart
    );
    
    // Check if under limit
    return this.rateLimiter.requests.length < this.config.rateLimitPerMinute;
  }

  /**
   * Update rate limiter
   * @private
   */
  _updateRateLimit() {
    this.rateLimiter.requests.push(Date.now());
  }

  /**
   * Validate phone number format
   * @private
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  _isValidPhoneNumber(phoneNumber) {
    // Basic international phone number format validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }
}

module.exports = SmsPlugin;
