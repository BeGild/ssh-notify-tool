/**
 * @fileoverview Generic Webhook Plugin Example
 * Demonstrates how to create a flexible webhook-based notification plugin
 */

const axios = require('axios');
const BasePlugin = require('../../src/plugins/BasePlugin');

class WebhookPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'webhook',
      displayName: 'Generic Webhook Notifications',
      version: '1.0.0',
      author: 'SSH Notify Tool Team',
      description: 'Send notifications to any webhook endpoint with customizable payloads',
      capabilities: ['text', 'json', 'custom_headers'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'webhookUrl'],
        properties: {
          enabled: { 
            type: 'boolean',
            description: 'Enable or disable the webhook plugin'
          },
          webhookUrl: { 
            type: 'string', 
            format: 'uri',
            description: 'The webhook endpoint URL'
          },
          method: {
            type: 'string',
            enum: ['POST', 'PUT', 'PATCH'],
            default: 'POST',
            description: 'HTTP method to use'
          },
          headers: {
            type: 'object',
            description: 'Custom HTTP headers',
            additionalProperties: { type: 'string' }
          },
          payloadTemplate: {
            type: 'string',
            description: 'Custom payload template (JSON string with placeholders)'
          },
          timeout: {
            type: 'integer',
            minimum: 1000,
            maximum: 30000,
            default: 5000,
            description: 'Request timeout in milliseconds'
          },
          retries: {
            type: 'integer',
            minimum: 0,
            maximum: 5,
            default: 3,
            description: 'Number of retry attempts'
          },
          auth: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['bearer', 'basic', 'api-key']
              },
              token: { type: 'string' },
              username: { type: 'string' },
              password: { type: 'string' },
              apiKey: { type: 'string' },
              headerName: { type: 'string', default: 'X-API-Key' }
            }
          }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    // Set up HTTP client with default configuration
    this.httpClient = axios.create({
      timeout: this.config.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SSH-Notify-Tool/1.0.0',
        ...(this.config.headers || {})
      }
    });

    // Set up authentication
    this._setupAuth();
  }

  _setupAuth() {
    if (!this.config.auth) return;

    const { type, token, username, password, apiKey, headerName } = this.config.auth;

    switch (type) {
      case 'bearer':
        this.httpClient.defaults.headers.Authorization = `Bearer ${token}`;
        break;
      
      case 'basic':
        const credentials = Buffer.from(`${username}:${password}`).toString('base64');
        this.httpClient.defaults.headers.Authorization = `Basic ${credentials}`;
        break;
      
      case 'api-key':
        this.httpClient.defaults.headers[headerName || 'X-API-Key'] = apiKey;
        break;
    }
  }

  async send(notification) {
    try {
      if (!this.config.enabled) {
        return this._createResponse(false, 'Webhook plugin is disabled');
      }

      this._validateNotification(notification);

      // Prepare payload
      const payload = this._createPayload(notification);
      
      // Send webhook request with retry logic
      const response = await this._retryOperation(
        () => this._sendWebhook(payload),
        this.config.retries || 3,
        1000
      );

      return this._createResponse(true, 'Webhook notification sent successfully', {
        webhookUrl: this.config.webhookUrl,
        statusCode: response.status,
        responseTime: response.responseTime,
        responseHeaders: response.headers
      });

    } catch (error) {
      return this._handleError(error, 'send webhook notification');
    }
  }

  async _sendWebhook(payload) {
    const startTime = Date.now();
    
    const response = await this.httpClient.request({
      method: this.config.method || 'POST',
      url: this.config.webhookUrl,
      data: payload
    });

    response.responseTime = Date.now() - startTime;
    return response;
  }

  _createPayload(notification) {
    // Use custom payload template if provided
    if (this.config.payloadTemplate) {
      return this._processTemplate(this.config.payloadTemplate, notification);
    }

    // Default payload structure
    return {
      title: notification.title,
      message: notification.message,
      level: notification.level || 'info',
      timestamp: new Date().toISOString(),
      metadata: notification.metadata || {},
      source: 'ssh-notify-tool'
    };
  }

  _processTemplate(template, notification) {
    try {
      // Replace placeholders in the template
      let processedTemplate = template
        .replace(/\{\{title\}\}/g, notification.title || '')
        .replace(/\{\{message\}\}/g, notification.message || '')
        .replace(/\{\{level\}\}/g, notification.level || 'info')
        .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
        .replace(/\{\{source\}\}/g, 'ssh-notify-tool');

      // Process metadata placeholders
      if (notification.metadata) {
        Object.keys(notification.metadata).forEach(key => {
          const placeholder = new RegExp(`\\{\\{metadata\\.${key}\\}\\}`, 'g');
          processedTemplate = processedTemplate.replace(placeholder, notification.metadata[key]);
        });
      }

      return JSON.parse(processedTemplate);
    } catch (error) {
      throw new Error(`Invalid payload template: ${error.message}`);
    }
  }

  async validate(config) {
    try {
      // Basic validation
      if (typeof config.enabled !== 'boolean') {
        return false;
      }

      if (config.enabled && !config.webhookUrl) {
        return false;
      }

      // Validate URL format
      if (config.webhookUrl && !this._isValidUrl(config.webhookUrl)) {
        return false;
      }

      // Validate payload template if provided
      if (config.payloadTemplate) {
        try {
          JSON.parse(config.payloadTemplate);
        } catch (error) {
          return false;
        }
      }

      // Validate authentication configuration
      if (config.auth && !this._validateAuth(config.auth)) {
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`Webhook plugin validation failed: ${error.message}`);
      return false;
    }
  }

  _validateAuth(authConfig) {
    const { type, token, username, password, apiKey } = authConfig;

    switch (type) {
      case 'bearer':
        return !!token;
      case 'basic':
        return !!(username && password);
      case 'api-key':
        return !!apiKey;
      default:
        return false;
    }
  }

  _isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.config.webhookUrl) {
      return false;
    }

    // Test webhook connectivity
    try {
      await this._testWebhookConnection();
      return true;
    } catch (error) {
      console.warn(`Webhook availability check failed: ${error.message}`);
      return false;
    }
  }

  async _testWebhookConnection() {
    // Send a minimal test request (HEAD or OPTIONS)
    const testClient = axios.create({
      timeout: 2000,
      headers: this.httpClient.defaults.headers
    });

    try {
      await testClient.head(this.config.webhookUrl);
    } catch (error) {
      // If HEAD fails, try OPTIONS
      if (error.response && error.response.status === 405) {
        await testClient.options(this.config.webhookUrl);
      } else {
        throw error;
      }
    }
  }

  async setup(config) {
    await super.setup(config);
    this._setupAuth();
  }

  async cleanup() {
    // Clean up HTTP client resources
    if (this.httpClient) {
      this.httpClient.defaults.timeout = 1000;
    }
  }

  async healthCheck() {
    const available = await this.isAvailable();
    
    if (!available) {
      return {
        healthy: false,
        message: 'Webhook plugin is not available',
        metadata: {
          enabled: this.config.enabled,
          hasWebhookUrl: !!this.config.webhookUrl,
          hasAuth: !!this.config.auth
        }
      };
    }

    try {
      // Test actual webhook connectivity
      const startTime = Date.now();
      await this._testWebhookConnection();
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        message: 'Webhook plugin is healthy and reachable',
        metadata: {
          webhookUrl: this.config.webhookUrl,
          method: this.config.method || 'POST',
          responseTime,
          hasAuth: !!this.config.auth,
          timeout: this.config.timeout || 5000
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Webhook endpoint is not reachable: ${error.message}`,
        metadata: {
          error: error.message,
          webhookUrl: this.config.webhookUrl
        }
      };
    }
  }
}

module.exports = WebhookPlugin;

/*
Example configuration:

{
  "plugins": {
    "webhook": {
      "enabled": true,
      "webhookUrl": "https://api.example.com/notifications",
      "method": "POST",
      "headers": {
        "X-Custom-Header": "custom-value"
      },
      "auth": {
        "type": "bearer",
        "token": "your-bearer-token"
      },
      "payloadTemplate": "{\"alert\":{\"title\":\"{{title}}\",\"body\":\"{{message}}\",\"severity\":\"{{level}}\",\"timestamp\":\"{{timestamp}}\",\"source\":\"{{metadata.source}}\"}}",
      "timeout": 10000,
      "retries": 2
    }
  }
}

Usage examples:

// Simple webhook notification
await notificationClient.notify({
  title: "Deployment Complete",
  message: "Application deployed successfully to production",
  level: "success",
  metadata: {
    environment: "production",
    version: "v1.2.3"
  }
});

// With custom webhook-specific data
await notificationClient.notify({
  title: "System Alert",
  message: "High CPU usage detected",
  level: "warning",
  webhook: {
    customField: "additional data for webhook"
  }
});
*/