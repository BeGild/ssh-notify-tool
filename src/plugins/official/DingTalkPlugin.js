/**
 * @fileoverview DingTalk notification plugin for webhook-based notifications
 * Provides DingTalk group notifications with @mentions, signing, and rich formatting
 */

const crypto = require('crypto');
const axios = require('axios');
const BasePlugin = require('../BasePlugin');

/**
 * DingTalk notification plugin for webhook notifications
 * Supports text, markdown, ActionCard, and FeedCard message types
 */
class DingTalkPlugin extends BasePlugin {
  /**
   * Plugin metadata
   * @returns {Object} Plugin metadata
   */
  static get metadata() {
    return {
      name: 'dingtalk',
      displayName: '钉钉 (DingTalk)',
      version: '1.0.0',
      author: 'SSH Notify Tool Project',
      description: '钉钉群机器人通知，支持@群成员、加签验证和消息格式化',
      capabilities: ['text', 'markdown', 'mentions', 'signing'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'webhook'],
        properties: {
          enabled: { type: 'boolean' },
          webhook: { type: 'string', format: 'uri' },
          secret: { type: 'string' },
          atMobiles: { 
            type: 'array', 
            items: { type: 'string', pattern: '^1[3-9]\\d{9}$' }
          },
          atUserIds: { 
            type: 'array', 
            items: { type: 'string' }
          },
          isAtAll: { type: 'boolean', default: false },
          messageType: { 
            type: 'string', 
            enum: ['text', 'markdown', 'actionCard'],
            default: 'markdown'
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
      messageType: 'markdown',
      atMobiles: [],
      atUserIds: [],
      isAtAll: false,
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
   * Send DingTalk notification
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    try {
      // Validate notification
      this._validateNotification(notification);

      // Check if DingTalk is available
      if (!await this.isAvailable()) {
        return this._createResponse(false, 'DingTalk notifications are not available');
      }

      // Prepare webhook payload
      const payload = this._preparePayload(notification);

      // Send with retry logic
      const response = await this._retryOperation(
        () => this._sendWebhook(payload),
        3,
        2000
      );

      return this._createResponse(true, '钉钉通知发送成功', {
        messageType: this.config.messageType,
        response: response.data,
        webhook: this._maskWebhookUrl(this.config.webhook)
      });

    } catch (error) {
      return this._handleError(error, 'DingTalk notification');
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
      if (!this._isValidDingTalkWebhook(config.webhook)) {
        throw new Error('Invalid DingTalk webhook URL format');
      }

      // Validate mobile numbers
      if (config.atMobiles) {
        for (const mobile of config.atMobiles) {
          if (!this._isValidMobile(mobile)) {
            throw new Error(`Invalid mobile number: ${mobile}`);
          }
        }
      }

      return true;
    } catch (error) {
      console.warn(`DingTalk plugin configuration validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if DingTalk notifications are available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    if (!this.config.enabled || !this.config.webhook) {
      return false;
    }

    try {
      // Test webhook connectivity
      const testPayload = {
        msgtype: 'text',
        text: { content: 'SSH Notify Tool connectivity test' },
        at: { atMobiles: [], isAtAll: false }
      };
      
      // Don't actually send test message, just validate URL format
      return this._isValidDingTalkWebhook(this.config.webhook);
    } catch (error) {
      return false;
    }
  }

  /**
   * Health check for DingTalk notifications
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
        messageType: this.config.messageType,
        hasSigning: !!this.config.secret,
        atMentions: this.config.atMobiles.length + this.config.atUserIds.length
      };

      return {
        healthy: available,
        message: available ? 
          '钉钉通知功能可用' : 
          '钉钉通知不可用 - 配置错误或网络问题',
        metadata: { dingtalk: webhookInfo }
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
      msgtype: this.config.messageType,
      at: this._prepareAtMentions()
    };

    // Add message content based on type
    switch (this.config.messageType) {
      case 'text':
        payload.text = this._prepareTextMessage(notification);
        break;
      case 'markdown':
        payload.markdown = this._prepareMarkdownMessage(notification);
        break;
      case 'actionCard':
        payload.actionCard = this._prepareActionCardMessage(notification);
        break;
      default:
        payload.msgtype = 'text';
        payload.text = this._prepareTextMessage(notification);
    }

    return payload;
  }

  /**
   * Prepare @mentions configuration
   * @private
   * @returns {Object} At mentions object
   */
  _prepareAtMentions() {
    return {
      atMobiles: this.config.atMobiles || [],
      atUserIds: this.config.atUserIds || [],
      isAtAll: this.config.isAtAll || false
    };
  }

  /**
   * Prepare text message
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} Text message object
   */
  _prepareTextMessage(notification) {
    let content = `${notification.title}\n${notification.message}`;
    
    // Add level indicator
    const levelEmoji = this._getLevelEmoji(notification.level);
    if (levelEmoji) {
      content = `${levelEmoji} ${content}`;
    }

    // Add timestamp
    content += `\n\n时间: ${new Date().toLocaleString('zh-CN')}`;

    return { content };
  }

  /**
   * Prepare markdown message
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} Markdown message object
   */
  _prepareMarkdownMessage(notification) {
    const levelEmoji = this._getLevelEmoji(notification.level);
    const levelColor = this._getLevelColor(notification.level);
    
    const title = `SSH Notify Tool - ${notification.title}`;
    
    let text = `## ${levelEmoji} ${notification.title}\n\n`;
    text += `**级别**: <font color="${levelColor}">${notification.level || 'info'}</font>\n\n`;
    text += `**消息**: ${notification.message}\n\n`;
    
    if (notification.metadata) {
      text += `**详细信息**:\n\`\`\`json\n${JSON.stringify(notification.metadata, null, 2)}\n\`\`\`\n\n`;
    }
    
    text += `**时间**: ${new Date().toLocaleString('zh-CN')}`;

    return { title, text };
  }

  /**
   * Prepare ActionCard message
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} ActionCard message object
   */
  _prepareActionCardMessage(notification) {
    const levelEmoji = this._getLevelEmoji(notification.level);
    
    return {
      title: `${levelEmoji} ${notification.title}`,
      text: `### ${notification.title}\n\n${notification.message}\n\n时间: ${new Date().toLocaleString('zh-CN')}`,
      hideAvatar: '0',
      btnOrientation: '0'
    };
  }

  /**
   * Get level emoji
   * @private
   * @param {string} level - Notification level
   * @returns {string} Emoji
   */
  _getLevelEmoji(level) {
    const emojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨'
    };
    return emojis[level] || emojis.info;
  }

  /**
   * Get level color for markdown
   * @private
   * @param {string} level - Notification level
   * @returns {string} Color code
   */
  _getLevelColor(level) {
    const colors = {
      info: '#2196F3',
      warning: '#FF9800',
      error: '#F44336'
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
    let url = this.config.webhook;
    
    // Add signature if secret is configured
    if (this.config.secret) {
      const timestamp = Date.now();
      const sign = this._generateSignature(timestamp, this.config.secret);
      
      // Add timestamp and sign to URL
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    return await this.httpClient.post(url, payload);
  }

  /**
   * Generate webhook signature
   * @private
   * @param {number} timestamp - Timestamp
   * @param {string} secret - Secret key
   * @returns {string} Signature
   */
  _generateSignature(timestamp, secret) {
    const stringToSign = `${timestamp}\n${secret}`;
    return crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('base64');
  }

  /**
   * Validate DingTalk webhook URL
   * @private
   * @param {string} webhook - Webhook URL
   * @returns {boolean} True if valid
   */
  _isValidDingTalkWebhook(webhook) {
    try {
      const url = new URL(webhook);
      return url.hostname === 'oapi.dingtalk.com' && 
             url.pathname.startsWith('/robot/send');
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate mobile number
   * @private
   * @param {string} mobile - Mobile number
   * @returns {boolean} True if valid
   */
  _isValidMobile(mobile) {
    // Chinese mobile number format
    const mobileRegex = /^1[3-9]\d{9}$/;
    return mobileRegex.test(mobile);
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
      const accessToken = url.searchParams.get('access_token');
      if (accessToken && accessToken.length > 8) {
        const maskedToken = accessToken.substring(0, 4) + '****' + accessToken.substring(accessToken.length - 4);
        url.searchParams.set('access_token', maskedToken);
      }
      return url.toString();
    } catch (error) {
      return 'Invalid URL';
    }
  }
}

module.exports = DingTalkPlugin;
