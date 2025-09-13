/**
 * @fileoverview Unit tests for BasePlugin class
 * Tests the base plugin interface and common functionality
 */

const BasePlugin = require('../../src/plugins/BasePlugin');

// Mock plugin class for testing
class MockPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'mock',
      displayName: 'Mock Plugin',
      version: '1.0.0',
      author: 'Test Suite',
      description: 'Mock plugin for testing',
      capabilities: ['test'],
      configSchema: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' },
          testValue: { type: 'string' }
        }
      }
    };
  }

  async send(notification) {
    if (!this.config.enabled) {
      return this._createResponse(false, 'Plugin disabled');
    }
    
    return this._createResponse(true, 'Mock notification sent', {
      notification,
      timestamp: Date.now()
    });
  }

  async isAvailable() {
    return this.config.enabled;
  }
}

// Invalid mock plugin (missing required methods)
class InvalidMockPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'invalid',
      displayName: 'Invalid Plugin',
      version: '1.0.0'
    };
  }
  // Missing send() method
}

describe('BasePlugin', () => {
  describe('Constructor', () => {
    test('should create plugin with default config', () => {
      const plugin = new MockPlugin();
      
      expect(plugin.config).toBeDefined();
      expect(plugin.config.enabled).toBe(false);
    });

    test('should create plugin with provided config', () => {
      const config = {
        enabled: true,
        testValue: 'test123'
      };
      
      const plugin = new MockPlugin(config);
      
      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.testValue).toBe('test123');
    });

    test('should merge provided config with defaults', () => {
      const config = { enabled: true };
      const plugin = new MockPlugin(config);
      
      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config).toHaveProperty('enabled');
    });
  });

  describe('Metadata', () => {
    test('should have required metadata properties', () => {
      const metadata = MockPlugin.metadata;
      
      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('displayName');
      expect(metadata).toHaveProperty('version');
      expect(metadata).toHaveProperty('author');
      expect(metadata).toHaveProperty('description');
      expect(metadata).toHaveProperty('capabilities');
      expect(metadata).toHaveProperty('configSchema');
    });

    test('should have valid metadata types', () => {
      const metadata = MockPlugin.metadata;
      
      expect(typeof metadata.name).toBe('string');
      expect(typeof metadata.displayName).toBe('string');
      expect(typeof metadata.version).toBe('string');
      expect(Array.isArray(metadata.capabilities)).toBe(true);
      expect(typeof metadata.configSchema).toBe('object');
    });
  });

  describe('Abstract Methods', () => {
    test('should throw error when calling abstract send method', async () => {
      const plugin = new BasePlugin();
      
      await expect(plugin.send({})).rejects.toThrow('send method must be implemented');
    });

    test('should throw error when calling abstract validate method', async () => {
      const plugin = new BasePlugin();
      
      await expect(plugin.validate({})).rejects.toThrow('validate method must be implemented');
    });

    test('should throw error when calling abstract isAvailable method', async () => {
      const plugin = new BasePlugin();
      
      await expect(plugin.isAvailable()).rejects.toThrow('isAvailable method must be implemented');
    });
  });

  describe('Send Method', () => {
    test('should send notification successfully', async () => {
      const plugin = new MockPlugin({ enabled: true });
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'info'
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Mock notification sent');
      expect(result.metadata).toHaveProperty('notification');
      expect(result.metadata).toHaveProperty('timestamp');
    });

    test('should fail when plugin is disabled', async () => {
      const plugin = new MockPlugin({ enabled: false });
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'info'
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Plugin disabled');
    });

    test('should validate notification before sending', async () => {
      const plugin = new MockPlugin({ enabled: true });
      
      // Test with invalid notification (missing title)
      await expect(plugin.send({ message: 'test' })).rejects.toThrow('Notification title is required');
      
      // Test with invalid notification (missing message)
      await expect(plugin.send({ title: 'test' })).rejects.toThrow('Notification message is required');
    });
  });

  describe('Validation', () => {
    test('should validate notification with required fields', () => {
      const plugin = new MockPlugin();
      
      const validNotification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'info'
      };

      expect(() => plugin._validateNotification(validNotification)).not.toThrow();
    });

    test('should reject notification without title', () => {
      const plugin = new MockPlugin();
      
      const invalidNotification = {
        message: 'Test message'
      };

      expect(() => plugin._validateNotification(invalidNotification)).toThrow('Notification title is required');
    });

    test('should reject notification without message', () => {
      const plugin = new MockPlugin();
      
      const invalidNotification = {
        title: 'Test Title'
      };

      expect(() => plugin._validateNotification(invalidNotification)).toThrow('Notification message is required');
    });

    test('should set default level if not provided', () => {
      const plugin = new MockPlugin();
      
      const notification = {
        title: 'Test Title',
        message: 'Test message'
      };

      plugin._validateNotification(notification);
      expect(notification.level).toBe('info');
    });
  });

  describe('Response Creation', () => {
    test('should create successful response', () => {
      const plugin = new MockPlugin();
      const metadata = { test: 'data' };
      
      const response = plugin._createResponse(true, 'Success message', metadata);
      
      expect(response.success).toBe(true);
      expect(response.message).toBe('Success message');
      expect(response.metadata).toEqual(metadata);
      expect(response.timestamp).toBeDefined();
      expect(response.plugin).toBe('mock');
    });

    test('should create error response', () => {
      const plugin = new MockPlugin();
      
      const response = plugin._createResponse(false, 'Error message');
      
      expect(response.success).toBe(false);
      expect(response.message).toBe('Error message');
      expect(response.timestamp).toBeDefined();
      expect(response.plugin).toBe('mock');
    });
  });

  describe('Error Handling', () => {
    test('should handle plugin errors correctly', () => {
      const plugin = new MockPlugin();
      const error = new Error('Test error');
      
      const response = plugin._handleError(error, 'Test operation');
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('Test operation failed');
      expect(response.error).toBe('Test error');
      expect(response.plugin).toBe('mock');
    });

    test('should handle network errors', () => {
      const plugin = new MockPlugin();
      const error = new Error('Network error');
      error.code = 'ECONNREFUSED';
      
      const response = plugin._handleError(error, 'Network operation');
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('Network operation failed');
      expect(response.error).toBe('Network error');
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed operations', async () => {
      const plugin = new MockPlugin();
      let attemptCount = 0;
      
      const operation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve('Success');
      });

      const result = await plugin._retryOperation(operation, 3, 10);
      
      expect(result).toBe('Success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      const plugin = new MockPlugin();
      
      const operation = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      await expect(plugin._retryOperation(operation, 2, 10)).rejects.toThrow('Permanent failure');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should succeed on first attempt', async () => {
      const plugin = new MockPlugin();
      
      const operation = jest.fn().mockResolvedValue('Immediate success');

      const result = await plugin._retryOperation(operation, 3, 10);
      
      expect(result).toBe('Immediate success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lifecycle Methods', () => {
    test('should call setup method', async () => {
      const plugin = new MockPlugin();
      const config = { enabled: true, testValue: 'setup' };
      
      await plugin.setup(config);
      
      expect(plugin.config).toEqual(expect.objectContaining(config));
    });

    test('should call cleanup method', async () => {
      const plugin = new MockPlugin();
      
      // Should not throw
      await expect(plugin.cleanup()).resolves.toBeUndefined();
    });

    test('should perform health check', async () => {
      const plugin = new MockPlugin({ enabled: true });
      
      const health = await plugin.healthCheck();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('message');
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.message).toBe('string');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate config against schema', () => {
      const plugin = new MockPlugin();
      const validConfig = {
        enabled: true,
        testValue: 'valid'
      };
      
      expect(() => plugin._validateConfig(validConfig, MockPlugin.metadata.configSchema)).not.toThrow();
    });

    test('should reject config missing required fields', () => {
      const plugin = new MockPlugin();
      const invalidConfig = {
        testValue: 'missing enabled field'
      };
      
      expect(() => plugin._validateConfig(invalidConfig, MockPlugin.metadata.configSchema)).toThrow();
    });

    test('should reject config with wrong types', () => {
      const plugin = new MockPlugin();
      const invalidConfig = {
        enabled: 'should be boolean',
        testValue: 'valid'
      };
      
      expect(() => plugin._validateConfig(invalidConfig, MockPlugin.metadata.configSchema)).toThrow();
    });
  });

  describe('IsAvailable Method', () => {
    test('should return true when enabled', async () => {
      const plugin = new MockPlugin({ enabled: true });
      
      const available = await plugin.isAvailable();
      
      expect(available).toBe(true);
    });

    test('should return false when disabled', async () => {
      const plugin = new MockPlugin({ enabled: false });
      
      const available = await plugin.isAvailable();
      
      expect(available).toBe(false);
    });
  });
});