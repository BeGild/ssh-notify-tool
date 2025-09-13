/**
 * @fileoverview Integration tests for plugin system
 * Tests plugin discovery, loading, lifecycle management, and extensibility
 */

const path = require('path');
const fs = require('fs');

const PluginManager = require('../../src/plugins/PluginManager');
const ConfigManager = require('../../src/config/ConfigManager');
const BasePlugin = require('../../src/plugins/BasePlugin');

// Mock plugin for testing extensibility
class TestExtensionPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'test-extension',
      displayName: 'Test Extension Plugin',
      version: '1.0.0',
      author: 'Integration Test Suite',
      description: 'Test plugin for integration testing',
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

  constructor(config = {}) {
    super(config);
    this.testCallCount = 0;
  }

  async send(notification) {
    if (!this.config.enabled) {
      return this._createResponse(false, 'Test extension plugin is disabled');
    }

    this.testCallCount++;
    
    return this._createResponse(true, 'Test extension notification sent', {
      callCount: this.testCallCount,
      notification: notification.title,
      testValue: this.config.testValue || 'default'
    });
  }

  async validate(config) {
    return typeof config.enabled === 'boolean';
  }

  async isAvailable() {
    return this.config.enabled;
  }

  async setup(config) {
    await super.setup(config);
    this.testCallCount = 0;
  }

  async cleanup() {
    this.testCallCount = 0;
  }

  async healthCheck() {
    const available = await this.isAvailable();
    return {
      healthy: available,
      message: available ? 'Test extension plugin is available' : 'Test extension plugin is not available',
      metadata: {
        callCount: this.testCallCount,
        testValue: this.config.testValue || 'default'
      }
    };
  }
}

describe('Plugin System Integration Tests', () => {
  let pluginManager;
  let testPluginDir;
  let configManager;

  beforeAll(async () => {
    // Create temporary plugin directory for testing
    testPluginDir = path.join(__dirname, '../fixtures/test-plugins');
    await fs.promises.mkdir(testPluginDir, { recursive: true });

    // Write test plugin to file
    const testPluginPath = path.join(testPluginDir, 'TestExtensionPlugin.js');
    const testPluginCode = `
const BasePlugin = require('../../src/plugins/BasePlugin');

class TestExtensionPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'test-extension',
      displayName: 'Test Extension Plugin',
      version: '1.0.0',
      author: 'Integration Test Suite',
      description: 'Test plugin for integration testing',
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
      return this._createResponse(false, 'Test extension plugin is disabled');
    }

    return this._createResponse(true, 'Test extension notification sent', {
      notification: notification.title,
      testValue: this.config.testValue || 'default'
    });
  }

  async validate(config) {
    return typeof config.enabled === 'boolean';
  }

  async isAvailable() {
    return this.config.enabled;
  }
}

module.exports = TestExtensionPlugin;
    `;

    await fs.promises.writeFile(testPluginPath, testPluginCode);

    configManager = new ConfigManager();
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.promises.rm(testPluginDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    pluginManager = new PluginManager({
      builtinPaths: [path.join(__dirname, '../../src/plugins/builtin')],
      officialPaths: [path.join(__dirname, '../../src/plugins/official')],
      customPaths: [testPluginDir]
    });
  });

  afterEach(async () => {
    if (pluginManager) {
      await pluginManager.cleanup();
    }
  });

  describe('Plugin Discovery and Loading', () => {
    test('should discover and load built-in plugins', async () => {
      await pluginManager.loadPlugins();

      expect(pluginManager.plugins.has('desktop')).toBe(true);
      expect(pluginManager.plugins.has('email')).toBe(true);
      expect(pluginManager.plugins.has('sms')).toBe(true);
    });

    test('should discover and load official plugins', async () => {
      await pluginManager.loadPlugins();

      expect(pluginManager.plugins.has('dingtalk')).toBe(true);
      expect(pluginManager.plugins.has('wechatwork')).toBe(true);
      expect(pluginManager.plugins.has('slack')).toBe(true);
    });

    test('should discover and load custom plugins', async () => {
      await pluginManager.loadPlugins();

      expect(pluginManager.plugins.has('test-extension')).toBe(true);
      
      const testPlugin = pluginManager.plugins.get('test-extension');
      expect(testPlugin).toBeDefined();
      expect(testPlugin.constructor.metadata.name).toBe('test-extension');
    });

    test('should load plugins with configuration', async () => {
      const config = {
        plugins: {
          'test-extension': {
            enabled: true,
            testValue: 'configured-value'
          },
          desktop: {
            enabled: true,
            timeout: 10
          }
        }
      };

      await pluginManager.loadPlugins(config);

      const testPlugin = pluginManager.plugins.get('test-extension');
      expect(testPlugin.config.enabled).toBe(true);
      expect(testPlugin.config.testValue).toBe('configured-value');

      const desktopPlugin = pluginManager.plugins.get('desktop');
      expect(desktopPlugin.config.enabled).toBe(true);
      expect(desktopPlugin.config.timeout).toBe(10);
    });

    test('should handle plugin loading errors gracefully', async () => {
      // Create a plugin with syntax errors
      const invalidPluginPath = path.join(testPluginDir, 'InvalidPlugin.js');
      await fs.promises.writeFile(invalidPluginPath, 'invalid javascript syntax {{{');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await pluginManager.loadPlugins();

      expect(consoleSpy).toHaveBeenCalled();
      expect(pluginManager.plugins.has('invalid')).toBe(false);

      consoleSpy.mockRestore();
      await fs.promises.unlink(invalidPluginPath).catch(() => {});
    });
  });

  describe('Plugin Lifecycle Management', () => {
    test('should setup all plugins correctly', async () => {
      await pluginManager.loadPlugins();
      await pluginManager.setupPlugins();

      const plugins = await pluginManager.getAllPlugins();
      
      for (const [name, plugin] of plugins) {
        expect(plugin.config).toBeDefined();
        expect(typeof plugin.config.enabled).toBe('boolean');
      }
    });

    test('should cleanup all plugins correctly', async () => {
      await pluginManager.loadPlugins();
      await pluginManager.setupPlugins();

      // Register a cleanup spy on test plugin
      const testPlugin = pluginManager.plugins.get('test-extension');
      const cleanupSpy = jest.spyOn(testPlugin, 'cleanup');

      await pluginManager.cleanup();

      expect(cleanupSpy).toHaveBeenCalled();
    });

    test('should handle plugin setup errors gracefully', async () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin);

      const testPlugin = pluginManager.plugins.get('test-extension');
      const setupSpy = jest.spyOn(testPlugin, 'setup').mockRejectedValue(new Error('Setup failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await pluginManager.setupPlugins();

      expect(setupSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      setupSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    test('should handle plugin cleanup errors gracefully', async () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin);

      const testPlugin = pluginManager.plugins.get('test-extension');
      const cleanupSpy = jest.spyOn(testPlugin, 'cleanup').mockRejectedValue(new Error('Cleanup failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await pluginManager.cleanup();

      expect(cleanupSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      cleanupSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('Plugin Validation and Registration', () => {
    test('should validate plugin class before registration', () => {
      class ValidPlugin extends BasePlugin {
        static get metadata() {
          return {
            name: 'valid-test',
            displayName: 'Valid Test Plugin',
            version: '1.0.0',
            author: 'Test',
            description: 'Valid plugin',
            capabilities: ['test'],
            configSchema: {
              type: 'object',
              properties: { enabled: { type: 'boolean' } }
            }
          };
        }
        async send() { return this._createResponse(true, 'ok'); }
        async validate() { return true; }
        async isAvailable() { return true; }
      }

      class InvalidPlugin {
        // Does not extend BasePlugin
        static get metadata() {
          return { name: 'invalid' };
        }
      }

      expect(() => {
        pluginManager.registerPlugin('valid-test', ValidPlugin);
      }).not.toThrow();

      expect(() => {
        pluginManager.registerPlugin('invalid-test', InvalidPlugin);
      }).toThrow();
    });

    test('should validate plugin metadata', () => {
      class IncompleteMetadataPlugin extends BasePlugin {
        static get metadata() {
          return {
            name: 'incomplete',
            // Missing required fields
          };
        }
      }

      expect(() => {
        pluginManager.registerPlugin('incomplete', IncompleteMetadataPlugin);
      }).toThrow();
    });

    test('should prevent duplicate plugin registration', () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin);

      expect(() => {
        pluginManager.registerPlugin('test-extension', TestExtensionPlugin);
      }).toThrow();
    });
  });

  describe('Plugin Configuration Management', () => {
    test('should apply default configuration when none provided', async () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin);

      const testPlugin = pluginManager.plugins.get('test-extension');
      expect(testPlugin.config.enabled).toBe(false); // BasePlugin default
    });

    test('should merge provided configuration with defaults', async () => {
      const config = {
        plugins: {
          'test-extension': {
            enabled: true,
            testValue: 'custom-value',
            additionalField: 'extra'
          }
        }
      };

      await pluginManager.loadPlugins(config);

      const testPlugin = pluginManager.plugins.get('test-extension');
      expect(testPlugin.config.enabled).toBe(true);
      expect(testPlugin.config.testValue).toBe('custom-value');
      expect(testPlugin.config.additionalField).toBe('extra');
    });

    test('should validate plugin configuration', async () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin);

      const testPlugin = pluginManager.plugins.get('test-extension');

      const validConfig = { enabled: true, testValue: 'valid' };
      const invalidConfig = { enabled: 'not-boolean' };

      expect(await testPlugin.validate(validConfig)).toBe(true);
      expect(await testPlugin.validate(invalidConfig)).toBe(false);
    });
  });

  describe('Plugin Availability and Health', () => {
    test('should check plugin availability correctly', async () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin, { enabled: true });

      const availablePlugins = await pluginManager.getAvailablePlugins();
      expect(availablePlugins.has('test-extension')).toBe(true);

      // Disable plugin
      pluginManager.plugins.get('test-extension').config.enabled = false;

      const unavailablePlugins = await pluginManager.getAvailablePlugins();
      expect(unavailablePlugins.has('test-extension')).toBe(false);
    });

    test('should handle availability check errors', async () => {
      pluginManager.registerPlugin('test-extension', TestExtensionPlugin);

      const testPlugin = pluginManager.plugins.get('test-extension');
      const availabilitySpy = jest.spyOn(testPlugin, 'isAvailable')
        .mockRejectedValue(new Error('Availability check failed'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const availablePlugins = await pluginManager.getAvailablePlugins();
      expect(availablePlugins.has('test-extension')).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      availabilitySpy.mockRestore();
      consoleSpy.mockRestore();
    });

    test('should perform health checks on all plugins', async () => {
      await pluginManager.loadPlugins({
        plugins: {
          'test-extension': { enabled: true, testValue: 'health-test' }
        }
      });

      const testPlugin = pluginManager.plugins.get('test-extension');
      const health = await testPlugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata.testValue).toBe('health-test');
    });
  });

  describe('Plugin System Integration', () => {
    test('should integrate with configuration management', async () => {
      const testConfig = {
        plugins: {
          'test-extension': {
            enabled: true,
            testValue: 'integration-test'
          },
          desktop: {
            enabled: false
          }
        }
      };

      // Save configuration
      await configManager.saveConfig(testConfig);
      
      // Load configuration and apply to plugin manager
      const loadedConfig = await configManager.loadConfig();
      await pluginManager.loadPlugins(loadedConfig);

      const testPlugin = pluginManager.plugins.get('test-extension');
      expect(testPlugin.config.testValue).toBe('integration-test');

      const desktopPlugin = pluginManager.plugins.get('desktop');
      expect(desktopPlugin.config.enabled).toBe(false);
    });

    test('should support plugin hot-reload', async () => {
      await pluginManager.loadPlugins({
        plugins: {
          'test-extension': { enabled: true, testValue: 'initial' }
        }
      });

      let testPlugin = pluginManager.plugins.get('test-extension');
      expect(testPlugin.config.testValue).toBe('initial');

      // Simulate configuration change
      await testPlugin.setup({
        ...testPlugin.config,
        testValue: 'updated'
      });

      expect(testPlugin.config.testValue).toBe('updated');
    });

    test('should handle plugin dependencies gracefully', async () => {
      // Test that plugins can be loaded independently
      await pluginManager.loadPlugins();

      const plugins = await pluginManager.getAllPlugins();
      expect(plugins.size).toBeGreaterThan(0);

      // Each plugin should be functional independently
      for (const [name, plugin] of plugins) {
        expect(plugin.constructor.metadata.name).toBe(name);
        expect(typeof plugin.isAvailable).toBe('function');
        expect(typeof plugin.send).toBe('function');
      }
    });

    test('should support plugin extension and customization', async () => {
      // Test that custom plugins can extend built-in functionality
      class ExtendedDesktopPlugin extends BasePlugin {
        static get metadata() {
          return {
            name: 'extended-desktop',
            displayName: 'Extended Desktop Plugin',
            version: '1.0.0',
            author: 'Test',
            description: 'Extended desktop notifications',
            capabilities: ['text', 'images', 'sounds'],
            configSchema: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                customSound: { type: 'string' }
              }
            }
          };
        }

        async send(notification) {
          return this._createResponse(true, 'Extended desktop notification sent', {
            customSound: this.config.customSound,
            notification: notification.title
          });
        }

        async validate(config) {
          return typeof config.enabled === 'boolean';
        }

        async isAvailable() {
          return this.config.enabled;
        }
      }

      pluginManager.registerPlugin('extended-desktop', ExtendedDesktopPlugin, {
        enabled: true,
        customSound: '/path/to/custom/sound.wav'
      });

      const extendedPlugin = pluginManager.plugins.get('extended-desktop');
      expect(extendedPlugin.constructor.metadata.capabilities).toContain('images');
      expect(extendedPlugin.config.customSound).toBe('/path/to/custom/sound.wav');

      const result = await extendedPlugin.send({
        title: 'Extended Test',
        message: 'Testing extended functionality'
      });

      expect(result.success).toBe(true);
      expect(result.metadata.customSound).toBe('/path/to/custom/sound.wav');
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should isolate plugin failures', async () => {
      class FailingPlugin extends BasePlugin {
        static get metadata() {
          return {
            name: 'failing-plugin',
            displayName: 'Failing Plugin',
            version: '1.0.0',
            author: 'Test',
            description: 'Plugin that always fails',
            capabilities: ['test'],
            configSchema: {
              type: 'object',
              properties: { enabled: { type: 'boolean' } }
            }
          };
        }

        async send() {
          throw new Error('Plugin always fails');
        }

        async validate() {
          return true;
        }

        async isAvailable() {
          return true;
        }
      }

      pluginManager.registerPlugin('test-extension', TestExtensionPlugin, { enabled: true });
      pluginManager.registerPlugin('failing-plugin', FailingPlugin, { enabled: true });

      const testPlugin = pluginManager.plugins.get('test-extension');
      const failingPlugin = pluginManager.plugins.get('failing-plugin');

      // Test plugin should work
      const testResult = await testPlugin.send({
        title: 'Test',
        message: 'Test message'
      });
      expect(testResult.success).toBe(true);

      // Failing plugin should fail gracefully
      try {
        await failingPlugin.send({
          title: 'Test',
          message: 'Test message'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Plugin always fails');
      }

      // Other plugins should remain unaffected
      const testResult2 = await testPlugin.send({
        title: 'Test 2',
        message: 'Second test message'
      });
      expect(testResult2.success).toBe(true);
    });

    test('should handle plugin registration edge cases', () => {
      // Test various invalid registration scenarios
      expect(() => {
        pluginManager.registerPlugin('', TestExtensionPlugin);
      }).toThrow();

      expect(() => {
        pluginManager.registerPlugin(null, TestExtensionPlugin);
      }).toThrow();

      expect(() => {
        pluginManager.registerPlugin('test', null);
      }).toThrow();

      expect(() => {
        pluginManager.registerPlugin('test', 'not-a-class');
      }).toThrow();
    });

    test('should maintain plugin state consistency', async () => {
      await pluginManager.loadPlugins({
        plugins: {
          'test-extension': { enabled: true, testValue: 'state-test' }
        }
      });

      const testPlugin = pluginManager.plugins.get('test-extension');
      
      // Send notifications and verify state consistency
      const result1 = await testPlugin.send({
        title: 'State Test 1',
        message: 'First state test'
      });

      const result2 = await testPlugin.send({
        title: 'State Test 2',
        message: 'Second state test'
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.metadata.callCount).toBe(2);

      // Verify plugin configuration remains consistent
      expect(testPlugin.config.testValue).toBe('state-test');
      expect(testPlugin.config.enabled).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple plugins efficiently', async () => {
      // Register multiple test plugins
      const pluginCount = 10;
      for (let i = 0; i < pluginCount; i++) {
        pluginManager.registerPlugin(`test-plugin-${i}`, TestExtensionPlugin, {
          enabled: true,
          testValue: `plugin-${i}`
        });
      }

      const startTime = Date.now();
      await pluginManager.setupPlugins();
      const setupDuration = Date.now() - startTime;

      expect(pluginManager.getPluginCount()).toBe(pluginCount);
      expect(setupDuration).toBeLessThan(1000); // Should complete quickly

      // Test plugin operations
      const plugins = await pluginManager.getAllPlugins();
      const operations = [];

      for (const [name, plugin] of plugins) {
        operations.push(
          plugin.send({
            title: `Test ${name}`,
            message: `Testing plugin ${name}`
          })
        );
      }

      const operationStartTime = Date.now();
      const results = await Promise.all(operations);
      const operationDuration = Date.now() - operationStartTime;

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      expect(operationDuration).toBeLessThan(500); // Should be fast
      console.log(`${pluginCount} plugins completed operations in ${operationDuration}ms`);
    });

    test('should manage memory efficiently', async () => {
      await pluginManager.loadPlugins();

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      const operations = [];
      for (let i = 0; i < 100; i++) {
        const testPlugin = pluginManager.plugins.get('test-extension');
        if (testPlugin) {
          operations.push(
            testPlugin.send({
              title: `Memory Test ${i}`,
              message: `Testing memory usage ${i}`
            })
          );
        }
      }

      await Promise.all(operations);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB for test operations)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });
});