/**
 * @fileoverview Unit tests for PluginManager class
 * Tests plugin loading, validation, and lifecycle management
 */

const PluginManager = require('../../src/plugins/PluginManager');
const BasePlugin = require('../../src/plugins/BasePlugin');
const fs = require('fs');
const path = require('path');

// Mock plugin classes for testing
class MockValidPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'mock-valid',
      displayName: 'Mock Valid Plugin',
      version: '1.0.0',
      author: 'Test Suite',
      description: 'Valid mock plugin for testing',
      capabilities: ['test'],
      configSchema: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' }
        }
      }
    };
  }

  async send(notification) {
    return this._createResponse(true, 'Mock sent');
  }

  async validate(config) {
    return config.enabled !== undefined;
  }

  async isAvailable() {
    return this.config.enabled;
  }
}

class MockInvalidPlugin {
  // Missing BasePlugin inheritance and required methods
  static get metadata() {
    return { name: 'invalid' };
  }
}

class MockFailingPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'mock-failing',
      displayName: 'Mock Failing Plugin',
      version: '1.0.0',
      author: 'Test Suite',
      description: 'Failing mock plugin for testing',
      capabilities: ['test'],
      configSchema: {
        type: 'object',
        properties: { enabled: { type: 'boolean' } }
      }
    };
  }

  constructor(config) {
    super(config);
    throw new Error('Plugin initialization failed');
  }

  async send() { return this._createResponse(false, 'Always fails'); }
  async validate() { return false; }
  async isAvailable() { return false; }
}

// Mock fs functions
jest.mock('fs');
jest.mock('path');

describe('PluginManager', () => {
  let pluginManager;
  
  beforeEach(() => {
    pluginManager = new PluginManager();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should create PluginManager with default options', () => {
      const pm = new PluginManager();
      
      expect(pm.plugins).toBeInstanceOf(Map);
      expect(pm.plugins.size).toBe(0);
      expect(pm.builtinPaths).toContain('builtin');
      expect(pm.officialPaths).toContain('official');
    });

    test('should create PluginManager with custom options', () => {
      const options = {
        builtinPaths: ['custom-builtin'],
        officialPaths: ['custom-official'],
        customPaths: ['custom-path']
      };
      
      const pm = new PluginManager(options);
      
      expect(pm.builtinPaths).toEqual(['custom-builtin']);
      expect(pm.officialPaths).toEqual(['custom-official']);
      expect(pm.customPaths).toEqual(['custom-path']);
    });
  });

  describe('Plugin Registration', () => {
    test('should register valid plugin', () => {
      const config = { enabled: true };
      
      pluginManager.registerPlugin('mock-valid', MockValidPlugin, config);
      
      expect(pluginManager.plugins.has('mock-valid')).toBe(true);
      expect(pluginManager.getPluginCount()).toBe(1);
    });

    test('should not register invalid plugin', () => {
      expect(() => {
        pluginManager.registerPlugin('invalid', MockInvalidPlugin);
      }).toThrow('Plugin invalid does not extend BasePlugin');
    });

    test('should not register plugin with invalid metadata', () => {
      class InvalidMetadataPlugin extends BasePlugin {
        static get metadata() {
          return { /* missing required fields */ };
        }
      }

      expect(() => {
        pluginManager.registerPlugin('invalid-meta', InvalidMetadataPlugin);
      }).toThrow('Plugin metadata validation failed');
    });

    test('should handle plugin initialization failure', () => {
      expect(() => {
        pluginManager.registerPlugin('failing', MockFailingPlugin);
      }).toThrow('Failed to initialize plugin failing');
    });

    test('should not allow duplicate plugin names', () => {
      pluginManager.registerPlugin('mock-valid', MockValidPlugin);
      
      expect(() => {
        pluginManager.registerPlugin('mock-valid', MockValidPlugin);
      }).toThrow('Plugin mock-valid is already registered');
    });
  });

  describe('Plugin Discovery', () => {
    beforeEach(() => {
      // Mock fs.existsSync to return true for test paths
      fs.existsSync.mockReturnValue(true);
      // Mock fs.readdirSync to return test files
      fs.readdirSync.mockReturnValue(['TestPlugin.js', 'AnotherPlugin.js', 'readme.md']);
      // Mock path.join to return predictable paths
      path.join.mockImplementation((...args) => args.join('/'));
      path.extname.mockImplementation((file) => file.endsWith('.js') ? '.js' : '');
      path.basename.mockImplementation((file, ext) => file.replace(ext || '', ''));
    });

    test('should discover plugins in builtin paths', () => {
      const plugins = pluginManager._discoverPlugins(['test-builtin']);
      
      expect(plugins).toEqual([
        'test-builtin/TestPlugin.js',
        'test-builtin/AnotherPlugin.js'
      ]);
    });

    test('should skip non-JS files', () => {
      fs.readdirSync.mockReturnValue(['Plugin.js', 'README.md', 'config.json']);
      
      const plugins = pluginManager._discoverPlugins(['test-path']);
      
      expect(plugins).toEqual(['test-path/Plugin.js']);
    });

    test('should handle missing directories gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      
      const plugins = pluginManager._discoverPlugins(['nonexistent-path']);
      
      expect(plugins).toEqual([]);
    });
  });

  describe('Plugin Loading', () => {
    test('should load plugins from paths', async () => {
      // Mock successful plugin loading
      const mockRequire = jest.fn().mockReturnValue(MockValidPlugin);
      pluginManager._requirePlugin = mockRequire;
      
      // Mock discovery
      pluginManager._discoverPlugins = jest.fn().mockReturnValue([
        'builtin/MockPlugin.js'
      ]);

      await pluginManager.loadPlugins();
      
      expect(mockRequire).toHaveBeenCalledWith('builtin/MockPlugin.js');
      expect(pluginManager.getPluginCount()).toBe(1);
    });

    test('should handle plugin loading errors gracefully', async () => {
      const mockRequire = jest.fn().mockImplementation(() => {
        throw new Error('Module not found');
      });
      pluginManager._requirePlugin = mockRequire;
      
      pluginManager._discoverPlugins = jest.fn().mockReturnValue([
        'builtin/FailingPlugin.js'
      ]);

      // Should not throw, but log warnings
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await pluginManager.loadPlugins();
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(pluginManager.getPluginCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });

    test('should load plugins with configuration', async () => {
      const config = {
        plugins: {
          'mock-valid': { enabled: true, testValue: 'configured' }
        }
      };

      const mockRequire = jest.fn().mockReturnValue(MockValidPlugin);
      pluginManager._requirePlugin = mockRequire;
      pluginManager._discoverPlugins = jest.fn().mockReturnValue(['builtin/MockPlugin.js']);

      await pluginManager.loadPlugins(config);
      
      const plugin = await pluginManager.getPlugin('mock-valid');
      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.testValue).toBe('configured');
    });
  });

  describe('Plugin Retrieval', () => {
    beforeEach(() => {
      pluginManager.registerPlugin('mock-valid', MockValidPlugin, { enabled: true });
    });

    test('should get plugin by name', async () => {
      const plugin = await pluginManager.getPlugin('mock-valid');
      
      expect(plugin).toBeInstanceOf(MockValidPlugin);
    });

    test('should return null for non-existent plugin', async () => {
      const plugin = await pluginManager.getPlugin('non-existent');
      
      expect(plugin).toBeNull();
    });

    test('should get all plugins', async () => {
      const plugins = await pluginManager.getAllPlugins();
      
      expect(plugins).toBeInstanceOf(Map);
      expect(plugins.size).toBe(1);
      expect(plugins.has('mock-valid')).toBe(true);
    });

    test('should get plugin names', () => {
      const names = pluginManager.getPluginNames();
      
      expect(names).toEqual(['mock-valid']);
    });

    test('should get plugin count', () => {
      const count = pluginManager.getPluginCount();
      
      expect(count).toBe(1);
    });
  });

  describe('Plugin Validation', () => {
    test('should validate plugin class correctly', () => {
      expect(() => {
        pluginManager._validatePlugin(MockValidPlugin);
      }).not.toThrow();
    });

    test('should reject non-BasePlugin classes', () => {
      expect(() => {
        pluginManager._validatePlugin(MockInvalidPlugin);
      }).toThrow('Plugin invalid does not extend BasePlugin');
    });

    test('should validate plugin metadata', () => {
      const validMetadata = MockValidPlugin.metadata;
      
      expect(() => {
        pluginManager._validatePluginMetadata(validMetadata);
      }).not.toThrow();
    });

    test('should reject incomplete metadata', () => {
      const incompleteMetadata = { name: 'test' };
      
      expect(() => {
        pluginManager._validatePluginMetadata(incompleteMetadata);
      }).toThrow('Plugin metadata validation failed');
    });

    test('should reject metadata with invalid types', () => {
      const invalidMetadata = {
        ...MockValidPlugin.metadata,
        capabilities: 'should be array'
      };
      
      expect(() => {
        pluginManager._validatePluginMetadata(invalidMetadata);
      }).toThrow('Plugin metadata validation failed');
    });
  });

  describe('Plugin Lifecycle', () => {
    let mockPlugin;

    beforeEach(() => {
      pluginManager.registerPlugin('mock-valid', MockValidPlugin, { enabled: true });
      mockPlugin = pluginManager.plugins.get('mock-valid');
      
      // Mock lifecycle methods
      mockPlugin.setup = jest.fn();
      mockPlugin.cleanup = jest.fn();
    });

    test('should setup all plugins', async () => {
      await pluginManager.setupPlugins();
      
      expect(mockPlugin.setup).toHaveBeenCalled();
    });

    test('should cleanup all plugins', async () => {
      await pluginManager.cleanup();
      
      expect(mockPlugin.cleanup).toHaveBeenCalled();
    });

    test('should handle setup errors gracefully', async () => {
      mockPlugin.setup.mockRejectedValue(new Error('Setup failed'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await pluginManager.setupPlugins();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should handle cleanup errors gracefully', async () => {
      mockPlugin.cleanup.mockRejectedValue(new Error('Cleanup failed'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await pluginManager.cleanup();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Plugin Filtering', () => {
    beforeEach(() => {
      pluginManager.registerPlugin('mock-valid', MockValidPlugin, { enabled: true });
    });

    test('should get available plugins only', async () => {
      const mockPlugin = pluginManager.plugins.get('mock-valid');
      mockPlugin.isAvailable = jest.fn().mockResolvedValue(true);

      const available = await pluginManager.getAvailablePlugins();
      
      expect(available.size).toBe(1);
      expect(available.has('mock-valid')).toBe(true);
    });

    test('should filter out unavailable plugins', async () => {
      const mockPlugin = pluginManager.plugins.get('mock-valid');
      mockPlugin.isAvailable = jest.fn().mockResolvedValue(false);

      const available = await pluginManager.getAvailablePlugins();
      
      expect(available.size).toBe(0);
    });

    test('should handle availability check errors', async () => {
      const mockPlugin = pluginManager.plugins.get('mock-valid');
      mockPlugin.isAvailable = jest.fn().mockRejectedValue(new Error('Availability check failed'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const available = await pluginManager.getAvailablePlugins();
      
      expect(available.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing plugin gracefully', async () => {
      const result = await pluginManager.getPlugin('missing-plugin');
      
      expect(result).toBeNull();
    });

    test('should validate plugin name', () => {
      expect(() => {
        pluginManager.registerPlugin('', MockValidPlugin);
      }).toThrow('Plugin name is required');

      expect(() => {
        pluginManager.registerPlugin(123, MockValidPlugin);
      }).toThrow('Plugin name must be a string');
    });

    test('should validate plugin class', () => {
      expect(() => {
        pluginManager.registerPlugin('test', null);
      }).toThrow('Plugin class is required');

      expect(() => {
        pluginManager.registerPlugin('test', 'not-a-class');
      }).toThrow('Plugin class must be a constructor function');
    });
  });

  describe('Configuration Handling', () => {
    test('should apply plugin-specific configuration', async () => {
      const config = {
        plugins: {
          'mock-valid': { enabled: true, customValue: 'test' }
        }
      };

      const mockRequire = jest.fn().mockReturnValue(MockValidPlugin);
      pluginManager._requirePlugin = mockRequire;
      pluginManager._discoverPlugins = jest.fn().mockReturnValue(['builtin/MockPlugin.js']);

      await pluginManager.loadPlugins(config);
      
      const plugin = await pluginManager.getPlugin('mock-valid');
      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.customValue).toBe('test');
    });

    test('should use default configuration when none provided', async () => {
      const mockRequire = jest.fn().mockReturnValue(MockValidPlugin);
      pluginManager._requirePlugin = mockRequire;
      pluginManager._discoverPlugins = jest.fn().mockReturnValue(['builtin/MockPlugin.js']);

      await pluginManager.loadPlugins();
      
      const plugin = await pluginManager.getPlugin('mock-valid');
      expect(plugin.config.enabled).toBe(false); // Default from BasePlugin
    });
  });
});