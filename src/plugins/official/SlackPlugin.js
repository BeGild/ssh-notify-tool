/**
 * @fileoverview Slack notification plugin for webhook-based notifications
 * Provides Slack channel notifications with rich formatting and attachments
 */

const axios = require('axios');
const BasePlugin = require('../BasePlugin');

/**
 * Slack notification plugin for webhook notifications
 * Supports rich text formatting, attachments, and channel routing
 */
class SlackPlugin extends BasePlugin {
  /**
   * Plugin metadata
   * @returns {Object} Plugin metadata
   */
  static get metadata() {
    return {
      name: 'slack',
      displayName: 'Slack',
      version: '1.0.0',
      author: 'SSH Notify Tool Project',
      description: 'Slack channel notifications with rich formatting and attachments',
      capabilities: ['text', 'markdown', 'attachments', 'mentions', 'channels'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'webhook'],
        properties: {
          enabled: { type: 'boolean' },
          webhook: { type: 'string', format: 'uri' },
          channel: { 
            type: 'string',
            description: 'Channel to send messages to (optional, webhook default used if not specified)'
          },
          username: { 
            type: 'string',
            description: 'Bot username to display'
          },
          iconEmoji: { 
            type: 'string',
            pattern: '^:[a-zA-Z0-9_+-]+:$',
            description: 'Emoji icon for the bot'
          },
          iconUrl: { 
            type: 'string',
            format: 'uri',
            description: 'URL to an image to use as bot icon'
          },
          linkNames: { 
            type: 'boolean',
            default: true,
            description: 'Enable @mentions and #channel linking'
          },
          unfurlLinks: { 
            type: 'boolean',
            default: true,
            description: 'Enable automatic URL unfurling'
          },
          unfurlMedia: { 
            type: 'boolean',
            default: true,
            description: 'Enable automatic media unfurling'
          }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    // Default configuration
    this.defaultConfig = {
      enabled: false,
      username: 'SSH Notify Tool',
      iconEmoji: ':robot_face:',
      linkNames: true,
      unfurlLinks: true,
      unfurlMedia: true,
      timeout: 30000
    };

    // Merge with provided config
    this.config = { ...this.defaultConfig, ...config };
    
    // HTTP client
    this.httpClient = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send Slack notification
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    try {
      // Validate notification
      this._validateNotification(notification);

      // Check if Slack is available
      if (!await this.isAvailable()) {
        return this._createResponse(false, 'Slack notifications are not available');
      }

      // Prepare webhook payload
      const payload = this._preparePayload(notification);

      // Send with retry logic
      const response = await this._retryOperation(
        () => this._sendWebhook(payload),
        3,
        2000
      );

      return this._createResponse(true, 'Slack notification sent successfully', {
        channel: this.config.channel || 'webhook default',
        response: response.data,
        webhook: this._maskWebhookUrl(this.config.webhook)
      });

    } catch (error) {
      return this._handleError(error, 'Slack notification');
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
      
      // Validate webhook URL format
      if (!this._isValidSlackWebhook(config.webhook)) {
        throw new Error('Invalid Slack webhook URL format');
      }

      // Validate channel format if provided
      if (config.channel && !this._isValidChannelName(config.channel)) {
        throw new Error('Invalid Slack channel format - should start with # or @');
      }

      // Validate emoji format if provided
      if (config.iconEmoji && !this._isValidEmoji(config.iconEmoji)) {
        throw new Error('Invalid emoji format - should be :emoji_name:');
      }

      return true;
    } catch (error) {
      console.warn(`Slack plugin configuration validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if Slack notifications are available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    if (!this.config.enabled || !this.config.webhook) {
      return false;
    }

    try {
      // Don't actually send test message, just validate URL format
      return this._isValidSlackWebhook(this.config.webhook);
    } catch (error) {
      return false;
    }
  }

  /**
   * Health check for Slack notifications
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    if (!baseHealth.healthy) {
      return baseHealth;
    }

    try {
      const available = await this.isAvailable();
      const webhookInfo = {
        webhook: this._maskWebhookUrl(this.config.webhook),
        channel: this.config.channel || 'webhook default',
        username: this.config.username,
        iconEmoji: this.config.iconEmoji,
        linkNames: this.config.linkNames
      };

      return {
        healthy: available,
        message: available ? 
          'Slack notifications available' : 
          'Slack notifications not available - configuration error or network issue',
        metadata: { slack: webhookInfo }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`
      };
    }
  }

  /**
   * Prepare webhook payload
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} Webhook payload
   */
  _preparePayload(notification) {
    const payload = {
      username: this.config.username,
      link_names: this.config.linkNames,
      unfurl_links: this.config.unfurlLinks,
      unfurl_media: this.config.unfurlMedia
    };

    // Set channel if configured
    if (this.config.channel) {
      payload.channel = this.config.channel;
    }

    // Set icon
    if (this.config.iconUrl) {
      payload.icon_url = this.config.iconUrl;
    } else if (this.config.iconEmoji) {
      payload.icon_emoji = this.config.iconEmoji;
    }

    // Prepare message content with attachments
    const attachment = this._prepareAttachment(notification);
    
    if (attachment) {
      payload.text = `SSH Notify Tool - ${notification.title}`;
      payload.attachments = [attachment];
    } else {
      // Fallback to simple text message
      payload.text = this._prepareSimpleText(notification);
    }

    return payload;
  }

  /**
   * Prepare rich attachment
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object|null} Slack attachment object
   */
  _prepareAttachment(notification) {
    const levelColor = this._getLevelColor(notification.level);
    const levelEmoji = this._getLevelEmoji(notification.level);
    
    const attachment = {
      color: levelColor,
      title: `${levelEmoji} ${notification.title}`,
      text: notification.message,
      footer: 'SSH Notify Tool',
      footer_icon: 'https://github.com/fluidicon.png',
      ts: Math.floor(Date.now() / 1000)
    };

    // Add fields for additional information
    const fields = [];
    
    // Add level field
    fields.push({
      title: 'Level',
      value: notification.level || 'info',
      short: true
    });

    // Add timestamp field
    fields.push({
      title: 'Time',
      value: new Date().toLocaleString(),
      short: true
    });

    // Add metadata if present
    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      fields.push({
        title: 'Additional Information',
        value: '```\n' + JSON.stringify(notification.metadata, null, 2) + '\n```',
        short: false
      });
    }

    if (fields.length > 0) {
      attachment.fields = fields;
    }

    return attachment;
  }

  /**
   * Prepare simple text message (fallback)
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {string} Simple text message
   */
  _prepareSimpleText(notification) {
    const levelEmoji = this._getLevelEmoji(notification.level);
    let text = `${levelEmoji} *${notification.title}*\n\n`;
    text += notification.message;
    
    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      text += '\n\n```\n' + JSON.stringify(notification.metadata, null, 2) + '\n```';
    }
    
    text += `\n\n_Sent by SSH Notify Tool at ${new Date().toLocaleString()}_`;
    
    return text;
  }

  /**
   * Get level emoji
   * @private
   * @param {string} level - Notification level
   * @returns {string} Emoji
   */
  _getLevelEmoji(level) {
    const emojis = {
      info: ':information_source:',
      warning: ':warning:',
      error: ':rotating_light:'
    };
    return emojis[level] || emojis.info;
  }

  /**
   * Get level color for attachments
   * @private
   * @param {string} level - Notification level
   * @returns {string} Color code
   */
  _getLevelColor(level) {
    const colors = {
      info: '#36a64f',  // Green
      warning: '#ff9500', // Orange
      error: '#ff0000'   // Red
    };
    return colors[level] || colors.info;
  }

  /**
   * Send webhook request
   * @private
   * @param {Object} payload - Webhook payload
   * @returns {Promise<Object>} Response
   */
  async _sendWebhook(payload) {
    return await this.httpClient.post(this.config.webhook, payload);
  }

  /**
   * Validate Slack webhook URL
   * @private
   * @param {string} webhook - Webhook URL
   * @returns {boolean} True if valid
   */
  _isValidSlackWebhook(webhook) {
    try {
      const url = new URL(webhook);
      return url.hostname === 'hooks.slack.com' && 
             url.pathname.startsWith('/services/');
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate Slack channel name
   * @private
   * @param {string} channel - Channel name
   * @returns {boolean} True if valid
   */
  _isValidChannelName(channel) {
    // Slack channels start with # for public channels or @ for direct messages
    return /^[#@][a-z0-9._-]+$/i.test(channel);
  }

  /**
   * Validate emoji format
   * @private
   * @param {string} emoji - Emoji string
   * @returns {boolean} True if valid
   */
  _isValidEmoji(emoji) {
    return /^:[a-zA-Z0-9_+-]+:$/.test(emoji);
  }

  /**
   * Mask webhook URL for logging
   * @private
   * @param {string} webhook - Webhook URL
   * @returns {string} Masked URL
   */
  _maskWebhookUrl(webhook) {
    try {
      const url = new URL(webhook);
      const pathParts = url.pathname.split('/');
      if (pathParts.length >= 4) {
        // Mask the webhook token (last part of path)
        const token = pathParts[pathParts.length - 1];
        if (token.length > 8) {
          pathParts[pathParts.length - 1] = token.substring(0, 4) + '****' + token.substring(token.length - 4);
          url.pathname = pathParts.join('/');
        }
      }
      return url.toString();
    } catch (error) {
      return 'Invalid URL';
    }
  }
}

module.exports = SlackPlugin;