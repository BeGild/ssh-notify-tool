/**
 * @fileoverview WeChat Work notification plugin for webhook-based notifications
 * Provides WeChat Work group notifications with @mentions and rich formatting
 */

const axios = require('axios');
const BasePlugin = require('../BasePlugin');

/**
 * WeChat Work notification plugin for webhook notifications
 * Supports text, markdown, image, and news message types
 */
class WeChatWorkPlugin extends BasePlugin {
  /**
   * Plugin metadata
   * @returns {Object} Plugin metadata
   */
  static get metadata() {
    return {
      name: 'wechat-work',
      displayName: '企业微信 (WeChat Work)',
      version: '1.0.0',
      author: 'SSH Notify Tool Project',
      description: '企业微信群机器人通知，支持@群成员和消息格式化',
      capabilities: ['text', 'markdown', 'mentions', 'images'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'webhook'],
        properties: {
          enabled: { type: 'boolean' },
          webhook: { type: 'string', format: 'uri' },
          mentionedList: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'User IDs to mention'
          },
          mentionedMobileList: { 
            type: 'array', 
            items: { type: 'string', pattern: '^1[3-9]\\d{9}$' },
            description: 'Mobile numbers to mention'
          },
          messageType: { 
            type: 'string', 
            enum: ['text', 'markdown', 'image', 'news'],
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
      mentionedList: [],
      mentionedMobileList: [],
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
   * Send WeChat Work notification
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    try {
      // Validate notification
      this._validateNotification(notification);

      // Check if WeChat Work is available
      if (!await this.isAvailable()) {
        return this._createResponse(false, 'WeChat Work notifications are not available');
      }

      // Prepare webhook payload
      const payload = this._preparePayload(notification);

      // Send with retry logic
      const response = await this._retryOperation(
        () => this._sendWebhook(payload),
        3,
        2000
      );

      return this._createResponse(true, '企业微信通知发送成功', {
        messageType: this.config.messageType,
        response: response.data,
        webhook: this._maskWebhookUrl(this.config.webhook)
      });

    } catch (error) {
      return this._handleError(error, 'WeChat Work notification');
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
      if (!this._isValidWeChatWorkWebhook(config.webhook)) {
        throw new Error('Invalid WeChat Work webhook URL format');
      }

      // Validate mobile numbers
      if (config.mentionedMobileList) {
        for (const mobile of config.mentionedMobileList) {
          if (!this._isValidMobile(mobile)) {
            throw new Error(`Invalid mobile number: ${mobile}`);
          }
        }
      }

      return true;
    } catch (error) {
      console.warn(`WeChat Work plugin configuration validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if WeChat Work notifications are available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    if (!this.config.enabled || !this.config.webhook) {
      return false;
    }

    try {
      // Don't actually send test message, just validate URL format
      return this._isValidWeChatWorkWebhook(this.config.webhook);
    } catch (error) {
      return false;
    }
  }

  /**
   * Health check for WeChat Work notifications
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
        mentionedUsers: this.config.mentionedList.length,
        mentionedMobiles: this.config.mentionedMobileList.length
      };

      return {
        healthy: available,
        message: available ? 
          '企业微信通知功能可用' : 
          '企业微信通知不可用 - 配置错误或网络问题',
        metadata: { wechatWork: webhookInfo }
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
      msgtype: this.config.messageType
    };

    // Add message content based on type
    switch (this.config.messageType) {
      case 'text':
        payload.text = this._prepareTextMessage(notification);
        break;
      case 'markdown':
        payload.markdown = this._prepareMarkdownMessage(notification);
        break;
      case 'image':
        payload.image = this._prepareImageMessage(notification);
        break;
      case 'news':
        payload.news = this._prepareNewsMessage(notification);
        break;
      default:
        payload.msgtype = 'text';
        payload.text = this._prepareTextMessage(notification);
    }

    return payload;
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

    return {
      content,
      mentioned_list: this.config.mentionedList || [],
      mentioned_mobile_list: this.config.mentionedMobileList || []
    };
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
    
    let content = `## ${levelEmoji} ${notification.title}\n\n`;
    content += `**级别**: <font color="${levelColor}">${notification.level || 'info'}</font>\n\n`;
    content += `**消息**: ${notification.message}\n\n`;
    
    if (notification.metadata) {
      content += `**详细信息**:\n\`\`\`json\n${JSON.stringify(notification.metadata, null, 2)}\n\`\`\`\n\n`;
    }
    
    content += `**时间**: ${new Date().toLocaleString('zh-CN')}`;

    return {
      content
    };
  }

  /**
   * Prepare image message
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} Image message object
   */
  _prepareImageMessage(notification) {
    // For image messages, we need a base64 encoded image or image URL
    // This is a placeholder implementation
    return {
      base64: notification.metadata?.imageBase64 || '',
      md5: notification.metadata?.imageMd5 || ''
    };
  }

  /**
   * Prepare news message
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} News message object
   */
  _prepareNewsMessage(notification) {
    const levelEmoji = this._getLevelEmoji(notification.level);
    
    return {
      articles: [{
        title: `${levelEmoji} ${notification.title}`,
        description: notification.message,
        url: notification.metadata?.url || '',
        picurl: notification.metadata?.imageUrl || ''
      }]
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
    return await this.httpClient.post(this.config.webhook, payload);
  }

  /**
   * Validate WeChat Work webhook URL
   * @private
   * @param {string} webhook - Webhook URL
   * @returns {boolean} True if valid
   */
  _isValidWeChatWorkWebhook(webhook) {
    try {
      const url = new URL(webhook);
      return url.hostname === 'qyapi.weixin.qq.com' && 
             url.pathname.startsWith('/cgi-bin/webhook/send');
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
      const key = url.searchParams.get('key');
      if (key && key.length > 8) {
        const maskedKey = key.substring(0, 4) + '****' + key.substring(key.length - 4);
        url.searchParams.set('key', maskedKey);
      }
      return url.toString();
    } catch (error) {
      return 'Invalid URL';
    }
  }
}

module.exports = WeChatWorkPlugin;