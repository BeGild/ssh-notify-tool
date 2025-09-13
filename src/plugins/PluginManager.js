/**
 * @fileoverview Plugin manager for discovering, loading, and managing notification channel plugins
 * Provides centralized plugin lifecycle management and registry functionality
 */

const fs = require('fs');
const path = require('path');
const BasePlugin = require('./BasePlugin');

/**
 * Central plugin management system for loading, registering, and coordinating notification channels
 */
class PluginManager {
  constructor() {
    /** @type {Map<string, BasePlugin>} Registry of loaded plugins */
    this.plugins = new Map();
    
    /** @type {Map<string, Function>} Registry of plugin classes */
    this.pluginClasses = new Map();
    
    /** @type {string[]} Default search paths for plugins */
    this.searchPaths = [
      path.join(__dirname, 'builtin'),
      path.join(__dirname, 'official'),
      path.join(process.cwd(), 'plugins'),
      path.join(process.env.HOME || process.env.USERPROFILE || '.', '.notifytool', 'plugins')
    ];
    
    /** @type {boolean} Whether the manager has been initialized */
    this.initialized = false;
    
    /** @type {Object} Plugin configurations */
    this.configs = {};
  }

  /**
   * Initialize the plugin manager
   * @param {Object} options - Initialization options
   * @param {string[]} [options.searchPaths] - Additional search paths
   * @param {string[]} [options.enabledPlugins] - List of enabled plugin names
   * @param {Object} [options.configs] - Plugin configurations
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    // Add additional search paths
    if (options.searchPaths) {
      this.searchPaths.push(...options.searchPaths);
    }

    // Store plugin configurations
    this.configs = options.configs || {};

    // Discover and load plugins
    await this.discoverPlugins();
    
    // Enable specified plugins or all discovered plugins
    const enabledPlugins = options.enabledPlugins || Array.from(this.pluginClasses.keys());
    
    for (const pluginName of enabledPlugins) {
      try {
        await this.enablePlugin(pluginName);
      } catch (error) {
        console.error(`Failed to enable plugin ${pluginName}:`, error.message);
      }
    }

    this.initialized = true;
    console.log(`PluginManager initialized with ${this.plugins.size} plugins`);
  }

  /**
   * Discover plugins in search paths
   * @private
   */
  async discoverPlugins() {
    for (const searchPath of this.searchPaths) {
      try {
        await this._scanDirectory(searchPath);
      } catch (error) {
        // Ignore errors for non-existent directories
        if (error.code !== 'ENOENT') {
          console.warn(`Error scanning plugin directory ${searchPath}:`, error.message);
        }
      }
    }
    
    console.log(`Discovered ${this.pluginClasses.size} plugin classes`);
  }

  /**
   * Scan a directory for plugin files
   * @private
   * @param {string} directory - Directory to scan
   */
  async _scanDirectory(directory) {
    if (!fs.existsSync(directory)) {
      return;
    }

    const entries = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.js') && entry.name.endsWith('Plugin.js')) {
        const pluginPath = path.join(directory, entry.name);
        await this.loadPlugin(pluginPath);
      } else if (entry.isDirectory()) {
        // Recursively scan subdirectories
        await this._scanDirectory(path.join(directory, entry.name));
      }
    }
  }

  /**
   * Load a plugin from file path
   * @param {string} pluginPath - Path to plugin file
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async loadPlugin(pluginPath) {
    try {
      // Clear require cache to allow reloading
      delete require.cache[require.resolve(pluginPath)];
      
      const PluginClass = require(pluginPath);
      
      // Validate plugin class
      const validationResult = this.validatePlugin(PluginClass);
      if (!validationResult.valid) {
        console.error(`Plugin validation failed for ${pluginPath}:`, validationResult.errors);
        return false;
      }

      // Register plugin class
      const pluginName = PluginClass.metadata.name;
      this.pluginClasses.set(pluginName, PluginClass);
      
      console.log(`Loaded plugin: ${pluginName} v${PluginClass.metadata.version}`);
      return true;
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error.message);
      return false;
    }
  }

  /**
   * Enable a plugin by creating an instance
   * @param {string} pluginName - Name of plugin to enable
   * @returns {Promise<BasePlugin>} Plugin instance
   */
  async enablePlugin(pluginName) {
    if (this.plugins.has(pluginName)) {
      return this.plugins.get(pluginName);
    }

    if (!this.pluginClasses.has(pluginName)) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    const PluginClass = this.pluginClasses.get(pluginName);
    const config = this.configs[pluginName] || {};

    // Create plugin instance
    const plugin = new PluginClass(config);
    
    // Setup plugin
    await plugin.setup(config);
    
    // Check if plugin is available
    const isAvailable = await plugin.isAvailable();
    if (!isAvailable) {
      console.warn(`Plugin ${pluginName} is not available in current environment`);
    }

    // Register plugin instance
    this.plugins.set(pluginName, plugin);
    
    console.log(`Enabled plugin: ${pluginName}`);
    return plugin;
  }

  /**
   * Disable a plugin
   * @param {string} pluginName - Name of plugin to disable
   */
  async disablePlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      await plugin.cleanup();
      this.plugins.delete(pluginName);
      console.log(`Disabled plugin: ${pluginName}`);
    }
  }

  /**
   * Get a plugin instance by name
   * @param {string} pluginName - Name of plugin
   * @returns {BasePlugin|null} Plugin instance or null if not found
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName) || null;
  }

  /**
   * Get all available plugin names
   * @returns {string[]} Array of plugin names
   */
  getAvailablePlugins() {
    return Array.from(this.pluginClasses.keys());
  }

  /**
   * Get all enabled plugin names
   * @returns {string[]} Array of enabled plugin names
   */
  getEnabledPlugins() {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugins by capability
   * @param {string} capability - Required capability
   * @returns {BasePlugin[]} Array of plugins with the capability
   */
  getPluginsByCapability(capability) {
    return Array.from(this.plugins.values()).filter(plugin => 
      plugin.getCapabilities().includes(capability)
    );
  }

  /**
   * Validate a plugin class
   * @param {Function} PluginClass - Plugin class to validate
   * @returns {{valid: boolean, errors: string[], warnings: string[]}} Validation result
   */
  validatePlugin(PluginClass) {
    const errors = [];
    const warnings = [];

    try {
      // Check if it's a class
      if (typeof PluginClass !== 'function') {
        errors.push('Plugin must be a class/constructor function');
        return { valid: false, errors, warnings };
      }

      // Check if it extends BasePlugin
      if (!(PluginClass.prototype instanceof BasePlugin)) {
        errors.push('Plugin must extend BasePlugin');
      }

      // Check metadata
      if (!PluginClass.metadata) {
        errors.push('Plugin must have static metadata property');
      } else {
        const metadata = PluginClass.metadata;
        
        // Check required metadata fields
        const requiredFields = ['name', 'displayName', 'version', 'author'];
        for (const field of requiredFields) {
          if (!metadata[field]) {
            errors.push(`Plugin metadata missing required field: ${field}`);
          }
        }

        // Validate version format
        if (metadata.version && !/^\d+\.\d+\.\d+/.test(metadata.version)) {
          warnings.push('Plugin version should follow semantic versioning (x.y.z)');
        }

        // Validate capabilities
        if (metadata.capabilities && !Array.isArray(metadata.capabilities)) {
          warnings.push('Plugin capabilities should be an array');
        }
      }

      // Try to instantiate temporarily to validate implementation
      try {
        const tempConfig = {};
        const tempInstance = new PluginClass(tempConfig);
        
        // Check required methods exist and are functions
        const requiredMethods = ['send', 'validate', 'isAvailable'];
        for (const method of requiredMethods) {
          if (typeof tempInstance[method] !== 'function') {
            errors.push(`Plugin must implement ${method}() method`);
          }
        }
      } catch (error) {
        if (error.message.includes('abstract class')) {
          // This is expected - ignore
        } else if (error.message.includes('must implement')) {
          errors.push(error.message);
        } else {
          warnings.push(`Plugin instantiation warning: ${error.message}`);
        }
      }

    } catch (error) {
      errors.push(`Plugin validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get plugin health status
   * @returns {Promise<Object>} Health status for all plugins
   */
  async getHealthStatus() {
    const status = {};
    
    for (const [name, plugin] of this.plugins.entries()) {
      try {
        status[name] = await plugin.healthCheck();
      } catch (error) {
        status[name] = {
          healthy: false,
          message: `Health check failed: ${error.message}`
        };
      }
    }
    
    return status;
  }

  /**
   * Reload a plugin (disable and enable again)
   * @param {string} pluginName - Name of plugin to reload
   */
  async reloadPlugin(pluginName) {
    if (this.plugins.has(pluginName)) {
      await this.disablePlugin(pluginName);
    }
    
    // Find and reload plugin file
    for (const searchPath of this.searchPaths) {
      const pluginPath = path.join(searchPath, `${pluginName}.js`);
      if (fs.existsSync(pluginPath)) {
        await this.loadPlugin(pluginPath);
        break;
      }
    }
    
    await this.enablePlugin(pluginName);
  }

  /**
   * Shutdown plugin manager and cleanup all plugins
   */
  async shutdown() {
    console.log('Shutting down plugin manager...');
    
    const shutdownPromises = Array.from(this.plugins.values()).map(async (plugin) => {
      try {
        await plugin.cleanup();
      } catch (error) {
        console.error(`Error cleaning up plugin ${plugin.getName()}:`, error.message);
      }
    });
    
    await Promise.all(shutdownPromises);
    
    this.plugins.clear();
    this.pluginClasses.clear();
    this.initialized = false;
    
    console.log('Plugin manager shutdown complete');
  }

  /**
   * Get plugin statistics
   * @returns {Object} Plugin statistics
   */
  getStats() {
    return {
      discovered: this.pluginClasses.size,
      enabled: this.plugins.size,
      searchPaths: this.searchPaths.length,
      initialized: this.initialized
    };
  }
}

module.exports = PluginManager;
