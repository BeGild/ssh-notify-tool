/**
 * {{PLUGIN_DISPLAY_NAME}} Plugin
 * {{DESCRIPTION}}
 */

const BasePlugin = require('ssh-notify-tool/src/plugins/BasePlugin');

class {{PLUGIN_CLASS}} extends BasePlugin {
  static get metadata() {
    return {
      name: '{{PLUGIN_NAME}}',
      displayName: '{{PLUGIN_DISPLAY_NAME}}',
      version: '{{VERSION}}',
      author: '{{AUTHOR}}',
      description: '{{DESCRIPTION}}',
      capabilities: ['text'],
      configSchema: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable or disable the plugin'
          },
          apiUrl: {
            type: 'string',
            format: 'uri',
            description: 'API endpoint URL'
          },
          apiKey: {
            type: 'string',
            description: 'API authentication key'
          },
          timeout: {
            type: 'integer',
            minimum: 1000,
            maximum: 30000,
            default: 5000,
            description: 'Request timeout in milliseconds'
          }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    // Plugin-specific initialization
    this.apiUrl = this.config.apiUrl;
    this.apiKey = this.config.apiKey;
    this.timeout = this.config.timeout || 5000;
  }

  async send(notification) {
    try {
      if (!this.config.enabled) {
        return this._createResponse(false, 'Plugin is disabled');
      }

      this._validateNotification(notification);

      // TODO: Implement your notification sending logic here
      const result = await this._sendNotification(notification);

      return this._createResponse(true, 'Notification sent successfully', {
        messageId: result.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return this._handleError(error, 'send notification');
    }
  }

  async _sendNotification(notification) {
    // TODO: Replace with your actual API call
    // Example using fetch or axios:
    
    const payload = {
      title: notification.title,
      message: notification.message,
      level: notification.level || 'info',
      timestamp: new Date().toISOString()
    };

    // Simulate API call (replace with actual implementation)
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ id: 'mock-message-id-' + Date.now() });
      }, 100);
    });
  }

  async validate(config) {
    try {
      if (typeof config.enabled !== 'boolean') {
        return false;
      }

      if (config.enabled) {
        // Validate required fields when enabled
        if (!config.apiUrl) {
          return false;
        }

        if (!config.apiKey) {
          return false;
        }

        // TODO: Add additional validation logic
        // Example: Test API connectivity
        // return await this._testConnection(config);
      }

      return true;
    } catch (error) {
      console.warn(`Plugin validation failed: ${error.message}`);
      return false;
    }
  }

  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.apiUrl || !this.apiKey) {
      return false;
    }

    // TODO: Test actual connectivity
    // Example: Ping API endpoint
    try {
      // await this._testConnection();
      return true;
    } catch (error) {
      console.warn(`Plugin availability check failed: ${error.message}`);
      return false;
    }
  }

  async setup(config) {
    await super.setup(config);
    
    // TODO: Additional setup logic
    // Example: Initialize connections, validate credentials, etc.
  }

  async cleanup() {
    // TODO: Cleanup resources
    // Example: Close connections, clear timers, etc.
  }

  async healthCheck() {
    if (!this.config.enabled) {
      return {
        healthy: false,
        message: 'Plugin is disabled'
      };
    }

    try {
      // TODO: Perform health check
      // Example: Test API connectivity, check quotas, etc.

      return {
        healthy: true,
        message: 'Plugin is healthy',
        metadata: {
          apiUrl: this.apiUrl,
          timeout: this.timeout,
          lastCheck: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Plugin health check failed: ${error.message}`
      };
    }
  }
}

module.exports = {{PLUGIN_CLASS}};

/*
Example configuration:

{
  "plugins": {
    "{{PLUGIN_NAME}}": {
      "enabled": true,
      "apiUrl": "https://api.example.com/notifications",
      "apiKey": "your-api-key-here",
      "timeout": 10000
    }
  }
}

Usage example:

await notificationClient.notify({
  title: "Test Notification",
  message: "This is a test message",
  level: "info",
  channels: ["{{PLUGIN_NAME}}"]
});
*/