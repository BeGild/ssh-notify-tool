/**
 * @fileoverview Configuration manager for loading, validating, and managing application configuration
 * Handles configuration from ~/.notifytool/config.json with plugin support and secure defaults
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * Configuration manager for centralized configuration loading and validation
 */
class ConfigManager {
  constructor() {
    /** @type {Object} Current configuration */
    this.config = {};
    
    /** @type {string} Configuration file path */
    this.configPath = path.join(os.homedir(), '.notifytool', 'config.json');
    
    /** @type {string} Configuration directory path */
    this.configDir = path.dirname(this.configPath);
    
    /** @type {boolean} Whether configuration has been loaded */
    this.loaded = false;
    
    /** @type {Object} Default configuration */
    this.defaultConfig = this._getDefaultConfig();
  }

  /**
   * Load configuration from file or create default configuration
   * @returns {Promise<Object>} Loaded configuration
   */
  async loadConfig() {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      // Load existing configuration or create default
      if (fs.existsSync(this.configPath)) {
        await this._loadFromFile();
      } else {
        await this._createDefaultConfig();
      }

      // Validate configuration
      this._validateConfig();
      
      // Merge with defaults for any missing values
      this.config = this._mergeWithDefaults(this.config);
      
      this.loaded = true;
      console.log('Configuration loaded successfully');
      
      return this.config;
    } catch (error) {
      console.error('Failed to load configuration:', error.message);
      
      // Fallback to default configuration
      this.config = this.defaultConfig;
      this.loaded = true;
      
      return this.config;
    }
  }

  /**
   * Save current configuration to file
   * @returns {Promise<void>}
   */
  async saveConfig() {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      // Write configuration with pretty formatting
      const configJson = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, configJson, 'utf8');
      
      console.log('Configuration saved successfully');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Get server configuration
   * @returns {Object} Server configuration
   */
  getServerConfig() {
    return this.getConfig().server;
  }

  /**
   * Get plugin configuration
   * @returns {Object} Plugin configuration
   */
  getPluginConfig() {
    return this.getConfig().plugins;
  }

  /**
   * Get configuration for a specific plugin
   * @param {string} pluginName - Name of the plugin
   * @returns {Object} Plugin-specific configuration
   */
  getPluginSpecificConfig(pluginName) {
    const pluginConfig = this.getPluginConfig();
    return pluginConfig.config[pluginName] || {};
  }

  /**
   * Update plugin configuration
   * @param {string} pluginName - Name of the plugin
   * @param {Object} config - Plugin configuration
   */
  setPluginConfig(pluginName, config) {
    if (!this.config.plugins.config) {
      this.config.plugins.config = {};
    }
    this.config.plugins.config[pluginName] = config;
  }

  /**
   * Get logging configuration
   * @returns {Object} Logging configuration
   */
  getLoggingConfig() {
    return this.getConfig().logging;
  }

  /**
   * Get secure value (decrypt if needed)
   * @param {string} key - Configuration key path (e.g., 'plugins.config.email.pass')
   * @returns {string} Decrypted value
   */
  getSecureValue(key) {
    const value = this._getNestedValue(this.config, key);
    
    // If value is encrypted (starts with 'enc:'), decrypt it
    if (typeof value === 'string' && value.startsWith('enc:')) {
      return this._decrypt(value.substring(4));
    }
    
    return value;
  }

  /**
   * Set secure value (encrypt if needed)
   * @param {string} key - Configuration key path
   * @param {string} value - Value to encrypt and store
   */
  setSecureValue(key, value) {
    const encryptedValue = 'enc:' + this._encrypt(value);
    this._setNestedValue(this.config, key, encryptedValue);
  }

  /**
   * Validate entire configuration
   * @param {Object} [config] - Configuration to validate (defaults to current config)
   * @returns {boolean} True if valid
   * @throws {Error} If configuration is invalid
   */
  validateConfig(config = this.config) {
    try {
      this._validateServerConfig(config.server);
      this._validatePluginConfig(config.plugins);
      this._validateLoggingConfig(config.logging);
      return true;
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  /**
   * Check if configuration file exists
   * @returns {boolean} True if configuration file exists
   */
  configExists() {
    return fs.existsSync(this.configPath);
  }

  /**
   * Get configuration file path
   * @returns {string} Configuration file path
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * Load configuration from file
   * @private
   */
  async _loadFromFile() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      throw new Error(`Failed to parse configuration file: ${error.message}`);
    }
  }

  /**
   * Create default configuration file
   * @private
   */
  async _createDefaultConfig() {
    this.config = this.defaultConfig;
    await this.saveConfig();
    console.log('Created default configuration file');
  }

  /**
   * Get default configuration
   * @private
   * @returns {Object} Default configuration
   */
  _getDefaultConfig() {
    return {
      server: {
        port: 5000,
        host: '127.0.0.1',
        authToken: this._generateToken(),
        timeout: 30000,
        cors: false
      },
      plugins: {
        enabled: ['desktop'],
        searchPaths: [],
        config: {
          desktop: {
            enabled: true,
            sound: true,
            timeout: 5
          },
          email: {
            enabled: false,
            smtpHost: '',
            smtpPort: 587,
            secure: true,
            user: '',
            pass: '',
            from: '',
            to: []
          },
          sms: {
            enabled: false,
            provider: 'twilio',
            credentials: {},
            to: []
          },
          dingtalk: {
            enabled: false,
            webhook: '',
            secret: '',
            atMobiles: [],
            isAtAll: false
          },
          wechatwork: {
            enabled: false,
            webhook: '',
            mentionedList: [],
            mentionedMobileList: []
          },
          slack: {
            enabled: false,
            webhook: '',
            channel: '',
            username: 'notify-bot',
            iconEmoji: ':bell:'
          }
        }
      },
      logging: {
        level: 'info',
        console: true,
        file: path.join(os.homedir(), '.notifytool', 'logs', 'notify.log'),
        maxSize: 10485760, // 10MB
        maxFiles: 5
      }
    };
  }

  /**
   * Merge configuration with defaults
   * @private
   * @param {Object} config - Configuration to merge
   * @returns {Object} Merged configuration
   */
  _mergeWithDefaults(config) {
    return this._deepMerge(this.defaultConfig, config);
  }

  /**
   * Deep merge two objects
   * @private
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Validate configuration
   * @private
   */
  _validateConfig() {
    if (!this.config || typeof this.config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    this._validateServerConfig(this.config.server);
    this._validatePluginConfig(this.config.plugins);
    this._validateLoggingConfig(this.config.logging);
  }

  /**
   * Validate server configuration
   * @private
   * @param {Object} serverConfig - Server configuration
   */
  _validateServerConfig(serverConfig) {
    if (!serverConfig) {
      throw new Error('Server configuration is required');
    }

    if (!serverConfig.port || typeof serverConfig.port !== 'number') {
      throw new Error('Server port must be a number');
    }

    if (serverConfig.port < 1 || serverConfig.port > 65535) {
      throw new Error('Server port must be between 1 and 65535');
    }

    if (!serverConfig.host || typeof serverConfig.host !== 'string') {
      throw new Error('Server host must be a string');
    }

    if (!serverConfig.authToken || typeof serverConfig.authToken !== 'string') {
      throw new Error('Server auth token is required');
    }
  }

  /**
   * Validate plugin configuration
   * @private
   * @param {Object} pluginConfig - Plugin configuration
   */
  _validatePluginConfig(pluginConfig) {
    if (!pluginConfig) {
      throw new Error('Plugin configuration is required');
    }

    if (pluginConfig.enabled && !Array.isArray(pluginConfig.enabled)) {
      throw new Error('Plugin enabled list must be an array');
    }

    if (pluginConfig.searchPaths && !Array.isArray(pluginConfig.searchPaths)) {
      throw new Error('Plugin search paths must be an array');
    }

    if (pluginConfig.config && typeof pluginConfig.config !== 'object') {
      throw new Error('Plugin config must be an object');
    }
  }

  /**
   * Validate logging configuration
   * @private
   * @param {Object} loggingConfig - Logging configuration
   */
  _validateLoggingConfig(loggingConfig) {
    if (!loggingConfig) {
      throw new Error('Logging configuration is required');
    }

    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(loggingConfig.level)) {
      throw new Error(`Logging level must be one of: ${validLevels.join(', ')}`);
    }
  }

  /**
   * Generate a secure random token
   * @private
   * @returns {string} Random token
   */
  _generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt a value
   * @private
   * @param {string} value - Value to encrypt
   * @returns {string} Encrypted value
   */
  _encrypt(value) {
    // Simple encryption for demo - in production, use proper encryption
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync('notify-tool-secret', 'salt', 32);
    const cipher = crypto.createCipher(algorithm, key);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
  }

  /**
   * Decrypt a value
   * @private
   * @param {string} encryptedValue - Value to decrypt
   * @returns {string} Decrypted value
   */
  _decrypt(encryptedValue) {
    try {
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync('notify-tool-secret', 'salt', 32);
      const decipher = crypto.createDecipher(algorithm, key);
      
      let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.warn('Failed to decrypt value, returning as-is');
      return encryptedValue;
    }
  }

  /**
   * Get nested value from object using dot notation
   * @private
   * @param {Object} obj - Object to search
   * @param {string} key - Dot-notation key
   * @returns {any} Value
   */
  _getNestedValue(obj, key) {
    return key.split('.').reduce((current, prop) => current && current[prop], obj);
  }

  /**
   * Set nested value in object using dot notation
   * @private
   * @param {Object} obj - Object to modify
   * @param {string} key - Dot-notation key
   * @param {any} value - Value to set
   */
  _setNestedValue(obj, key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[lastKey] = value;
  }
}

module.exports = ConfigManager;
