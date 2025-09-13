# Plugin Development Guide

This guide explains how to create custom notification plugins for the SSH Notify Tool. The plugin system is designed to be extensible and allows developers to add new notification channels with minimal effort.

## Table of Contents

1. [Plugin Architecture](#plugin-architecture)
2. [Getting Started](#getting-started)
3. [BasePlugin Interface](#baseplugin-interface)
4. [Plugin Metadata](#plugin-metadata)
5. [Configuration Schema](#configuration-schema)
6. [Implementing Plugin Methods](#implementing-plugin-methods)
7. [Error Handling](#error-handling)
8. [Testing Plugins](#testing-plugins)
9. [Plugin Distribution](#plugin-distribution)
10. [Examples](#examples)

## Plugin Architecture

The SSH Notify Tool uses a plugin-based architecture where each notification channel is implemented as a separate plugin. All plugins must extend the `BasePlugin` class and implement specific methods defined in the interface.

### Plugin Types

- **Built-in Plugins**: Core plugins shipped with the tool (desktop, email, SMS)
- **Official Plugins**: Maintained by the project team (DingTalk, WeChat Work, Slack)
- **Third-party Plugins**: Community-developed plugins for additional services

### Plugin Discovery

The plugin manager automatically discovers and loads plugins from several locations:

- `src/plugins/builtin/` - Built-in plugins
- `src/plugins/official/` - Official plugins
- `~/.notifytool/plugins/` - User-installed plugins
- Custom paths specified in configuration

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- Basic understanding of JavaScript/TypeScript
- Familiarity with the notification service you want to integrate

### Development Environment Setup

1. Clone the SSH Notify Tool repository
2. Install dependencies: `npm install`
3. Create your plugin directory: `mkdir -p ~/.notifytool/plugins/my-plugin`
4. Create your plugin file: `touch ~/.notifytool/plugins/my-plugin/MyPlugin.js`

### Basic Plugin Structure

```javascript
const BasePlugin = require('ssh-notify-tool/src/plugins/BasePlugin');

class MyPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'my-plugin',
      displayName: 'My Custom Plugin',
      version: '1.0.0',
      author: 'Your Name',
      description: 'Description of what your plugin does',
      capabilities: ['text', 'images'],
      configSchema: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' },
          apiKey: { type: 'string' }
        }
      }
    };
  }

  async send(notification) {
    // Implement notification sending logic
    return this._createResponse(true, 'Notification sent successfully');
  }

  async validate(config) {
    // Implement configuration validation logic
    return typeof config.enabled === 'boolean';
  }

  async isAvailable() {
    // Check if plugin can send notifications
    return this.config.enabled && this.config.apiKey;
  }
}

module.exports = MyPlugin;
```

## BasePlugin Interface

All plugins must extend the `BasePlugin` class and implement the following methods:

### Required Methods

#### `send(notification)`
Sends a notification using the plugin's channel.

**Parameters:**
- `notification` (Object): The notification data

**Returns:**
- Promise<Object>: Response object with `success`, `message`, and optional `metadata`

#### `validate(config)`
Validates plugin configuration.

**Parameters:**
- `config` (Object): Configuration to validate

**Returns:**
- Promise<boolean>: `true` if configuration is valid

#### `isAvailable()`
Checks if the plugin is available for sending notifications.

**Returns:**
- Promise<boolean>: `true` if plugin is available

### Optional Methods

#### `setup(config)`
Called during plugin initialization.

**Parameters:**
- `config` (Object): Plugin configuration

**Returns:**
- Promise<void>

#### `cleanup()`
Called during plugin shutdown.

**Returns:**
- Promise<void>

#### `healthCheck()`
Performs health check on the plugin.

**Returns:**
- Promise<Object>: Health status with `healthy`, `message`, and optional `metadata`

## Plugin Metadata

The `metadata` static getter must return an object with the following properties:

```javascript
static get metadata() {
  return {
    name: 'unique-plugin-name',           // Required: Unique identifier
    displayName: 'Human Readable Name',   // Required: Display name
    version: '1.0.0',                     // Required: Semantic version
    author: 'Your Name or Organization',  // Required: Author info
    description: 'Plugin description',    // Required: What the plugin does
    capabilities: ['text', 'images'],     // Required: Supported features
    configSchema: { /* JSON Schema */ }   // Required: Configuration schema
  };
}
```

### Supported Capabilities

- `text`: Plain text messages
- `html`: HTML formatted messages
- `markdown`: Markdown formatted messages
- `images`: Image attachments
- `files`: File attachments
- `buttons`: Interactive buttons
- `mentions`: @mentions support
- `threads`: Threaded conversations
- `reactions`: Message reactions
- `scheduling`: Scheduled delivery

## Configuration Schema

Use JSON Schema to define your plugin's configuration structure:

```javascript
configSchema: {
  type: 'object',
  required: ['enabled'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Enable or disable the plugin'
    },
    apiKey: {
      type: 'string',
      description: 'API key for authentication',
      minLength: 1
    },
    baseUrl: {
      type: 'string',
      format: 'uri',
      default: 'https://api.example.com',
      description: 'Base URL for the API'
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
    }
  }
}
```

## Implementing Plugin Methods

### Send Method Implementation

```javascript
async send(notification) {
  try {
    // Validate plugin is enabled
    if (!this.config.enabled) {
      return this._createResponse(false, 'Plugin is disabled');
    }

    // Validate notification
    this._validateNotification(notification);

    // Extract notification data
    const { title, message, level, metadata } = notification;
    
    // Prepare API request
    const payload = {
      title: title,
      message: message,
      priority: this._mapLevelToPriority(level),
      ...metadata
    };

    // Send notification
    const response = await this._sendToAPI(payload);

    // Return success response
    return this._createResponse(true, 'Notification sent successfully', {
      messageId: response.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return this._handleError(error, 'send notification');
  }
}
```

### Validation Method Implementation

```javascript
async validate(config) {
  try {
    // Check required fields
    if (typeof config.enabled !== 'boolean') {
      return false;
    }

    if (config.enabled && !config.apiKey) {
      return false;
    }

    // Validate API key format
    if (config.apiKey && !this._isValidApiKey(config.apiKey)) {
      return false;
    }

    // Test API connection if enabled
    if (config.enabled && config.apiKey) {
      return await this._testConnection(config);
    }

    return true;
  } catch (error) {
    console.warn(`Plugin validation failed: ${error.message}`);
    return false;
  }
}
```

### Availability Check Implementation

```javascript
async isAvailable() {
  try {
    // Check if plugin is enabled
    if (!this.config.enabled) {
      return false;
    }

    // Check if required configuration is present
    if (!this.config.apiKey) {
      return false;
    }

    // Test API connectivity
    return await this._testConnection();

  } catch (error) {
    console.warn(`Availability check failed: ${error.message}`);
    return false;
  }
}
```

## Error Handling

### Using Built-in Error Handling

```javascript
// Use inherited error handling method
return this._handleError(error, 'send notification');

// Custom error response
return this._createResponse(false, 'Custom error message', {
  error: error.message,
  code: error.code
});
```

### Common Error Scenarios

```javascript
async send(notification) {
  try {
    // ... implementation
  } catch (error) {
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return this._createResponse(false, 'Network connection failed', {
        error: error.message,
        retryable: true
      });
    }

    // Authentication errors
    if (error.response && error.response.status === 401) {
      return this._createResponse(false, 'Authentication failed', {
        error: 'Invalid API key',
        retryable: false
      });
    }

    // Rate limiting
    if (error.response && error.response.status === 429) {
      return this._createResponse(false, 'Rate limit exceeded', {
        error: error.message,
        retryAfter: error.response.headers['retry-after'],
        retryable: true
      });
    }

    // Generic error
    return this._handleError(error, 'send notification');
  }
}
```

### Retry Logic

```javascript
async _sendWithRetry(payload, maxRetries = 3) {
  return await this._retryOperation(
    () => this._sendToAPI(payload),
    maxRetries,
    1000 // delay between retries
  );
}
```

## Testing Plugins

### Unit Test Structure

Create a test file for your plugin: `MyPlugin.test.js`

```javascript
const MyPlugin = require('./MyPlugin');

// Mock external dependencies
jest.mock('axios');

describe('MyPlugin', () => {
  let plugin;

  beforeEach(() => {
    plugin = new MyPlugin({
      enabled: true,
      apiKey: 'test-api-key'
    });
  });

  describe('Metadata', () => {
    test('should have correct metadata', () => {
      const metadata = MyPlugin.metadata;
      expect(metadata.name).toBe('my-plugin');
      expect(metadata.capabilities).toContain('text');
    });
  });

  describe('Send Method', () => {
    test('should send notification successfully', async () => {
      // Mock successful API response
      const mockResponse = { id: 'msg-123' };
      plugin._sendToAPI = jest.fn().mockResolvedValue(mockResponse);

      const result = await plugin.send({
        title: 'Test',
        message: 'Test message'
      });

      expect(result.success).toBe(true);
      expect(result.metadata.messageId).toBe('msg-123');
    });

    test('should handle API errors', async () => {
      // Mock API error
      plugin._sendToAPI = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await plugin.send({
        title: 'Test',
        message: 'Test message'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Validation', () => {
    test('should validate correct configuration', async () => {
      const result = await plugin.validate({
        enabled: true,
        apiKey: 'valid-key'
      });

      expect(result).toBe(true);
    });

    test('should reject invalid configuration', async () => {
      const result = await plugin.validate({
        enabled: 'not-boolean'
      });

      expect(result).toBe(false);
    });
  });
});
```

### Integration Testing

Test your plugin with the full system:

```javascript
const PluginManager = require('ssh-notify-tool/src/plugins/PluginManager');

describe('MyPlugin Integration', () => {
  let pluginManager;

  beforeAll(async () => {
    pluginManager = new PluginManager();
    pluginManager.registerPlugin('my-plugin', MyPlugin, {
      enabled: true,
      apiKey: 'test-key'
    });
    await pluginManager.setupPlugins();
  });

  test('should load and initialize correctly', async () => {
    const plugin = pluginManager.plugins.get('my-plugin');
    expect(plugin).toBeDefined();
    expect(await plugin.isAvailable()).toBe(true);
  });
});
```

## Plugin Distribution

### NPM Package Structure

Create a proper NPM package for your plugin:

```
my-notification-plugin/
├── package.json
├── README.md
├── index.js
├── lib/
│   └── MyPlugin.js
├── test/
│   └── MyPlugin.test.js
└── examples/
    └── config.json
```

### Package.json

```json
{
  "name": "ssh-notify-plugin-my-service",
  "version": "1.0.0",
  "description": "My Service notification plugin for SSH Notify Tool",
  "main": "index.js",
  "keywords": ["ssh-notify-tool", "plugin", "notifications"],
  "author": "Your Name",
  "license": "MIT",
  "peerDependencies": {
    "ssh-notify-tool": "^1.0.0"
  },
  "dependencies": {
    "axios": "^0.27.0"
  },
  "devDependencies": {
    "jest": "^28.0.0"
  },
  "scripts": {
    "test": "jest",
    "lint": "eslint lib/"
  }
}
```

### Installation Instructions

Users can install your plugin via:

```bash
# Install globally
npm install -g ssh-notify-plugin-my-service

# Or locally in ~/.notifytool/plugins/
mkdir -p ~/.notifytool/plugins/my-service
cd ~/.notifytool/plugins/my-service
npm install ssh-notify-plugin-my-service
```

## Examples

See the [plugin-examples/](./plugin-examples/) directory for complete working examples:

- [WebhookPlugin.js](./plugin-examples/WebhookPlugin.js) - Generic webhook notifications
- [DatabaseLoggerPlugin.js](./plugin-examples/DatabaseLoggerPlugin.js) - Log notifications to database
- [FileLoggerPlugin.js](./plugin-examples/FileLoggerPlugin.js) - Simple file logging
- [HttpPlugin.js](./plugin-examples/HttpPlugin.js) - Custom HTTP API integration
- [TelegramPlugin.js](./plugin-examples/TelegramPlugin.js) - Telegram bot integration

## Best Practices

### Configuration Management

- Use environment variables for sensitive data (API keys, passwords)
- Provide sensible defaults for optional configuration
- Validate all configuration thoroughly
- Support hot-reloading of configuration when possible

### Error Handling

- Always handle errors gracefully
- Provide meaningful error messages
- Distinguish between retryable and permanent errors
- Log errors appropriately without exposing sensitive data

### Performance

- Implement connection pooling for HTTP clients
- Use async/await for all I/O operations
- Implement proper timeout handling
- Consider rate limiting and backoff strategies

### Security

- Never log sensitive information (API keys, passwords)
- Validate and sanitize all input data
- Use HTTPS for all external communications
- Follow the principle of least privilege

### Testing

- Write comprehensive unit tests
- Mock all external dependencies
- Test error scenarios thoroughly
- Include integration tests where applicable

### Documentation

- Document all configuration options
- Provide clear setup instructions
- Include troubleshooting guides
- Add usage examples

## Plugin Lifecycle

Understanding the plugin lifecycle helps in proper implementation:

1. **Discovery**: Plugin manager finds plugin files
2. **Loading**: Plugin class is loaded and validated
3. **Registration**: Plugin is registered with configuration
4. **Setup**: `setup()` method is called for initialization
5. **Runtime**: Plugin receives `send()` calls
6. **Health Checks**: Periodic `healthCheck()` and `isAvailable()` calls
7. **Cleanup**: `cleanup()` method is called during shutdown

## Common Patterns

### Rate Limiting

```javascript
class RateLimitedPlugin extends BasePlugin {
  constructor(config) {
    super(config);
    this.requestQueue = [];
    this.lastRequest = 0;
    this.rateLimitDelay = config.rateLimitDelay || 1000;
  }

  async send(notification) {
    await this._enforceRateLimit();
    return await this._sendNotification(notification);
  }

  async _enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequest = Date.now();
  }
}
```

### Connection Pooling

```javascript
class PooledHttpPlugin extends BasePlugin {
  constructor(config) {
    super(config);
    this.httpClient = axios.create({
      timeout: config.timeout || 5000,
      maxContentLength: 10000000,
      maxBodyLength: 10000000,
      httpsAgent: new https.Agent({ keepAlive: true })
    });
  }

  async cleanup() {
    if (this.httpClient) {
      this.httpClient.defaults.httpsAgent.destroy();
    }
  }
}
```

### Configuration Encryption

```javascript
class EncryptedConfigPlugin extends BasePlugin {
  constructor(config) {
    super(config);
    this.apiKey = this._decryptConfig(config.encryptedApiKey);
  }

  _decryptConfig(encryptedValue) {
    // Implement your decryption logic
    return decrypt(encryptedValue, process.env.PLUGIN_ENCRYPTION_KEY);
  }
}
```

## Troubleshooting

### Common Issues

1. **Plugin not loaded**: Check file naming and location
2. **Configuration errors**: Validate against schema
3. **Network timeouts**: Implement proper timeout handling
4. **Authentication failures**: Verify API credentials
5. **Rate limiting**: Implement backoff strategies

### Debug Mode

Enable debug logging in your plugin:

```javascript
const debug = require('debug')('ssh-notify:my-plugin');

async send(notification) {
  debug('Sending notification:', notification.title);
  
  try {
    const result = await this._sendToAPI(notification);
    debug('Notification sent successfully:', result.id);
    return this._createResponse(true, 'Success');
  } catch (error) {
    debug('Send failed:', error.message);
    return this._handleError(error, 'send');
  }
}
```

Run with debug output:

```bash
DEBUG=ssh-notify:* notify-cli "Test message"
```

## Contributing

If you've created a useful plugin, consider contributing it back to the project:

1. Fork the repository
2. Add your plugin to `src/plugins/official/`
3. Include comprehensive tests
4. Update documentation
5. Submit a pull request

## Support

- GitHub Issues: Report bugs and request features
- Discussion Forum: Get help from the community
- Documentation: Check the official docs for updates

---

For more examples and advanced techniques, see the [plugin-examples](./plugin-examples/) directory and the existing built-in plugins in `src/plugins/builtin/`.