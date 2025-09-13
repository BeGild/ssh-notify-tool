/**
 * @fileoverview Telegram Bot Plugin Example
 * Demonstrates how to integrate with the Telegram Bot API for notifications
 */

const axios = require('axios');
const BasePlugin = require('../../src/plugins/BasePlugin');

class TelegramPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'telegram',
      displayName: 'Telegram Bot Notifications',
      version: '1.0.0',
      author: 'SSH Notify Tool Team',
      description: 'Send notifications via Telegram Bot API',
      capabilities: ['text', 'markdown', 'html', 'buttons', 'files'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'botToken', 'chatId'],
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable or disable Telegram notifications'
          },
          botToken: {
            type: 'string',
            description: 'Telegram Bot API token from @BotFather',
            pattern: '^[0-9]+:[A-Za-z0-9_-]+$'
          },
          chatId: {
            oneOf: [
              { type: 'string' },
              { type: 'integer' },
              { 
                type: 'array',
                items: { oneOf: [{ type: 'string' }, { type: 'integer' }] }
              }
            ],
            description: 'Chat ID(s) to send notifications to'
          },
          parseMode: {
            type: 'string',
            enum: ['Markdown', 'MarkdownV2', 'HTML'],
            default: 'Markdown',
            description: 'Message formatting mode'
          },
          disableWebPagePreview: {
            type: 'boolean',
            default: true,
            description: 'Disable web page previews in messages'
          },
          disableNotification: {
            type: 'boolean',
            default: false,
            description: 'Send messages silently'
          },
          timeout: {
            type: 'integer',
            minimum: 1000,
            maximum: 30000,
            default: 10000,
            description: 'Request timeout in milliseconds'
          },
          retries: {
            type: 'integer',
            minimum: 0,
            maximum: 5,
            default: 3,
            description: 'Number of retry attempts'
          },
          threadId: {
            type: 'integer',
            description: 'Message thread ID for forum groups'
          }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    this.baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;
    
    this.httpClient = axios.create({
      timeout: this.config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async send(notification) {
    try {
      if (!this.config.enabled) {
        return this._createResponse(false, 'Telegram plugin is disabled');
      }

      this._validateNotification(notification);

      // Prepare message
      const message = this._formatMessage(notification);
      const chatIds = Array.isArray(this.config.chatId) ? this.config.chatId : [this.config.chatId];
      
      // Send to all specified chats
      const results = [];
      for (const chatId of chatIds) {
        try {
          const result = await this._sendMessage(chatId, message, notification);
          results.push({ chatId, success: true, messageId: result.message_id });
        } catch (error) {
          results.push({ chatId, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const success = successCount > 0;

      return this._createResponse(success, 
        `Telegram notification sent to ${successCount}/${chatIds.length} chats`,
        { results }
      );

    } catch (error) {
      return this._handleError(error, 'send Telegram notification');
    }
  }

  async _sendMessage(chatId, message, notification) {
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: this.config.parseMode || 'Markdown',
      disable_web_page_preview: this.config.disableWebPagePreview !== false,
      disable_notification: this.config.disableNotification || false
    };

    // Add thread ID if specified
    if (this.config.threadId) {
      payload.message_thread_id = this.config.threadId;
    }

    // Add inline keyboard if buttons are specified
    if (notification.telegram && notification.telegram.buttons) {
      payload.reply_markup = {
        inline_keyboard: this._createInlineKeyboard(notification.telegram.buttons)
      };
    }

    return await this._retryOperation(
      () => this._apiRequest('sendMessage', payload),
      this.config.retries || 3,
      1000
    );
  }

  async _apiRequest(method, payload) {
    const response = await this.httpClient.post(`${this.baseUrl}/${method}`, payload);
    
    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description}`);
    }
    
    return response.data.result;
  }

  _formatMessage(notification) {
    const { title, message, level, metadata } = notification;
    
    // Use custom Telegram formatting if provided
    if (notification.telegram && notification.telegram.text) {
      return notification.telegram.text;
    }

    // Get level emoji
    const emoji = this._getLevelEmoji(level);
    
    let formattedMessage = '';

    // Format based on parse mode
    switch (this.config.parseMode) {
      case 'HTML':
        formattedMessage = this._formatHTML(emoji, title, message, metadata);
        break;
      case 'MarkdownV2':
        formattedMessage = this._formatMarkdownV2(emoji, title, message, metadata);
        break;
      default: // Markdown
        formattedMessage = this._formatMarkdown(emoji, title, message, metadata);
    }

    return formattedMessage;
  }

  _formatMarkdown(emoji, title, message, metadata) {
    let text = `${emoji} *${this._escapeMarkdown(title)}*\n\n${this._escapeMarkdown(message)}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      text += '\n\n_Metadata:_';
      Object.entries(metadata).forEach(([key, value]) => {
        text += `\n• *${this._escapeMarkdown(key)}*: ${this._escapeMarkdown(String(value))}`;
      });
    }
    
    return text;
  }

  _formatMarkdownV2(emoji, title, message, metadata) {
    let text = `${emoji} *${this._escapeMarkdownV2(title)}*\n\n${this._escapeMarkdownV2(message)}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      text += '\n\n_Metadata:_';
      Object.entries(metadata).forEach(([key, value]) => {
        text += `\n• *${this._escapeMarkdownV2(key)}*: ${this._escapeMarkdownV2(String(value))}`;
      });
    }
    
    return text;
  }

  _formatHTML(emoji, title, message, metadata) {
    let text = `${emoji} <b>${this._escapeHTML(title)}</b>\n\n${this._escapeHTML(message)}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      text += '\n\n<i>Metadata:</i>';
      Object.entries(metadata).forEach(([key, value]) => {
        text += `\n• <b>${this._escapeHTML(key)}</b>: ${this._escapeHTML(String(value))}`;
      });
    }
    
    return text;
  }

  _escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  _escapeMarkdownV2(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  _escapeHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _getLevelEmoji(level) {
    const emojiMap = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '🚨',
      debug: '🔍'
    };
    return emojiMap[level] || 'ℹ️';
  }

  _createInlineKeyboard(buttons) {
    if (!Array.isArray(buttons)) return [];
    
    return buttons.map(row => {
      if (Array.isArray(row)) {
        return row.map(button => ({
          text: button.text,
          url: button.url || undefined,
          callback_data: button.callback_data || undefined
        }));
      } else {
        return [{
          text: row.text,
          url: row.url || undefined,
          callback_data: row.callback_data || undefined
        }];
      }
    });
  }

  async validate(config) {
    try {
      if (typeof config.enabled !== 'boolean') {
        return false;
      }

      if (config.enabled) {
        // Validate bot token format
        if (!config.botToken || !this._isValidBotToken(config.botToken)) {
          return false;
        }

        // Validate chat ID(s)
        if (!config.chatId) {
          return false;
        }

        if (Array.isArray(config.chatId)) {
          if (config.chatId.length === 0) {
            return false;
          }
          for (const chatId of config.chatId) {
            if (!this._isValidChatId(chatId)) {
              return false;
            }
          }
        } else if (!this._isValidChatId(config.chatId)) {
          return false;
        }

        // Test bot token validity
        if (config.botToken) {
          return await this._testBotToken(config.botToken);
        }
      }

      return true;
    } catch (error) {
      console.warn(`Telegram plugin validation failed: ${error.message}`);
      return false;
    }
  }

  _isValidBotToken(token) {
    return /^[0-9]+:[A-Za-z0-9_-]+$/.test(token);
  }

  _isValidChatId(chatId) {
    return typeof chatId === 'string' || typeof chatId === 'number';
  }

  async _testBotToken(token) {
    try {
      const testClient = axios.create({ timeout: 5000 });
      const response = await testClient.get(`https://api.telegram.org/bot${token}/getMe`);
      return response.data.ok;
    } catch (error) {
      return false;
    }
  }

  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.config.botToken || !this.config.chatId) {
      return false;
    }

    // Test bot connectivity
    try {
      const me = await this._apiRequest('getMe', {});
      return me && me.is_bot;
    } catch (error) {
      console.warn(`Telegram availability check failed: ${error.message}`);
      return false;
    }
  }

  async healthCheck() {
    const available = await this.isAvailable();
    
    if (!available) {
      return {
        healthy: false,
        message: 'Telegram plugin is not available',
        metadata: {
          enabled: this.config.enabled,
          hasBotToken: !!this.config.botToken,
          hasChatId: !!this.config.chatId
        }
      };
    }

    try {
      // Get bot information
      const me = await this._apiRequest('getMe', {});
      
      return {
        healthy: true,
        message: 'Telegram plugin is healthy and connected',
        metadata: {
          botUsername: me.username,
          botName: me.first_name,
          canJoinGroups: me.can_join_groups,
          canReadAllGroupMessages: me.can_read_all_group_messages,
          supportsInlineQueries: me.supports_inline_queries,
          chatCount: Array.isArray(this.config.chatId) ? this.config.chatId.length : 1
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Telegram bot API error: ${error.message}`,
        metadata: {
          error: error.message
        }
      };
    }
  }

  async sendFile(chatId, filePath, caption) {
    // Helper method for sending files
    try {
      const FormData = require('form-data');
      const fs = require('fs');
      
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('document', fs.createReadStream(filePath));
      
      if (caption) {
        form.append('caption', caption);
      }

      const response = await this.httpClient.post(`${this.baseUrl}/sendDocument`, form, {
        headers: form.getHeaders()
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error) {
      throw new Error(`Failed to send file: ${error.message}`);
    }
  }
}

module.exports = TelegramPlugin;

/*
Example configuration:

{
  "plugins": {
    "telegram": {
      "enabled": true,
      "botToken": "123456789:ABCdefGHijKLmnoPQRstUVwxyz",
      "chatId": "-1001234567890",
      "parseMode": "Markdown",
      "disableWebPagePreview": true,
      "disableNotification": false,
      "timeout": 10000,
      "retries": 3
    }
  }
}

Multiple chat IDs:
{
  "chatId": ["-1001234567890", "123456789", "@channel_username"]
}

Usage examples:

// Simple notification
await notificationClient.notify({
  title: "Server Alert",
  message: "High memory usage detected on server-01",
  level: "warning"
});

// With Telegram-specific features
await notificationClient.notify({
  title: "Deployment Status",
  message: "Application deployed successfully",
  level: "success",
  telegram: {
    text: "🚀 *Deployment Complete*\n\nApplication `myapp v1.2.3` deployed to production",
    buttons: [
      [
        { text: "View Logs", url: "https://logs.example.com" },
        { text: "Monitoring", url: "https://monitor.example.com" }
      ],
      [
        { text: "Rollback", callback_data: "rollback_v1.2.3" }
      ]
    ]
  }
});

// Send file notification
await plugin.sendFile(chatId, "/path/to/report.pdf", "Daily system report");
*/