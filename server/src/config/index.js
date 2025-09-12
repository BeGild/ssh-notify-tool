const fs = require('fs');
const path = require('path');
const os = require('os');
const Joi = require('joi');
require('dotenv').config();

/**
 * Configuration Manager
 * Handles loading, validation, and merging of configuration from various sources
 */
class ConfigManager {
  constructor() {
    this.config = null;
    this.schema = this._buildValidationSchema();
    this.configPaths = this._getConfigPaths();
    this.notFoundSymbol = Symbol('not-found'); // Use a single symbol instance
  }

  /**
   * Load and validate configuration
   * @returns {Object} Merged and validated configuration
   */
  load() {
    if (this.config) {
      return this.config;
    }

    // Load configuration from multiple sources
    const defaultConfig = this._loadDefaultConfig();
    const fileConfig = this._loadFileConfig();
    const envConfig = this._loadEnvConfig();

    // Merge configurations (env > file > default)
    this.config = this._mergeConfigs(defaultConfig, fileConfig, envConfig);

    // Validate final configuration
    this._validateConfig(this.config);

    return this.config;
  }

  /**
   * Get configuration value by path
   * @param {string} keyPath - Dot-separated path (e.g., 'server.port')
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value
   */
  get(keyPath, defaultValue = undefined) {
    if (!this.config) {
      this.load();
    }

    return this._getNestedValue(this.config, keyPath, defaultValue);
  }

  /**
   * Set configuration value by path
   * @param {string} keyPath - Dot-separated path
   * @param {*} value - Value to set
   */
  set(keyPath, value) {
    if (!this.config) {
      this.load();
    }

    this._setNestedValue(this.config, keyPath, value);
  }

  /**
   * Check if configuration key exists
   * @param {string} keyPath - Dot-separated path
   * @returns {boolean} True if key exists
   */
  has(keyPath) {
    if (!this.config) {
      this.load();
    }

    return this._getNestedValue(this.config, keyPath, this.notFoundSymbol) !== this.notFoundSymbol;
  }

  /**
   * Reload configuration (useful for hot-reload)
   */
  reload() {
    this.config = null;
    return this.load();
  }

  /**
   * Get possible configuration file paths
   * @returns {string[]} Array of config file paths
   * @private
   */
  _getConfigPaths() {
    const homeDir = os.homedir();
    const cwd = process.cwd();
    
    return [
      path.join(homeDir, '.notifytool', 'config.json'),
      path.join(cwd, 'config', 'local.json'),
      path.join(cwd, 'config.json'),
      process.env.NOTIFY_CONFIG_PATH
    ].filter(Boolean);
  }

  /**
   * Load default configuration
   * @returns {Object} Default configuration
   * @private
   */
  _loadDefaultConfig() {
    try {
      const defaultPath = path.join(__dirname, 'default.json');
      const content = fs.readFileSync(defaultPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load default config: ${error.message}`);
    }
  }

  /**
   * Load configuration from file
   * @returns {Object} File configuration or empty object
   * @private
   */
  _loadFileConfig() {
    for (const configPath of this.configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(content);
          console.log(`Loaded config from: ${configPath}`);
          return config;
        }
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}: ${error.message}`);
      }
    }
    
    return {};
  }

  /**
   * Load configuration from environment variables
   * @returns {Object} Environment configuration
   * @private
   */
  _loadEnvConfig() {
    const envConfig = {};

    // Map environment variables to config structure
    const envMappings = {
      'NOTIFY_SERVER_PORT': 'server.port',
      'NOTIFY_SERVER_HOST': 'server.host',
      'NOTIFY_AUTH_TOKEN': 'auth.token',
      'NOTIFY_LOG_LEVEL': 'logging.level',
      'NOTIFY_EMAIL_HOST': 'handlers.email.smtp.host',
      'NOTIFY_EMAIL_PORT': 'handlers.email.smtp.port',
      'NOTIFY_EMAIL_USER': 'handlers.email.smtp.auth.user',
      'NOTIFY_EMAIL_PASS': 'handlers.email.smtp.auth.pass',
      'NOTIFY_SMS_ACCOUNT_SID': 'handlers.sms.config.accountSid',
      'NOTIFY_SMS_AUTH_TOKEN': 'handlers.sms.config.authToken',
      'NOTIFY_SMS_FROM_NUMBER': 'handlers.sms.config.fromNumber',
      'NODE_ENV': 'env'
    };

    for (const [envKey, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        this._setNestedValue(envConfig, configPath, this._parseEnvValue(envValue));
      }
    }

    return envConfig;
  }

  /**
   * Parse environment variable value to appropriate type
   * @param {string} value - Environment variable value
   * @returns {*} Parsed value
   * @private
   */
  _parseEnvValue(value) {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Numeric values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
    
    // JSON values (arrays, objects)
    if ((value.startsWith('[') && value.endsWith(']')) || 
        (value.startsWith('{') && value.endsWith('}'))) {
      try {
        return JSON.parse(value);
      } catch {
        // If JSON parsing fails, return as string
      }
    }
    
    return value;
  }

  /**
   * Merge multiple configuration objects
   * @param {...Object} configs - Configuration objects to merge
   * @returns {Object} Merged configuration
   * @private
   */
  _mergeConfigs(...configs) {
    return configs.reduce((merged, config) => {
      return this._deepMerge(merged, config);
    }, {});
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (this._isObject(source[key]) && this._isObject(target[key])) {
          result[key] = this._deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Check if value is a plain object
   * @param {*} obj - Value to check
   * @returns {boolean} True if plain object
   * @private
   */
  _isObject(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
  }

  /**
   * Get nested value from object using dot-separated path
   * @param {Object} obj - Target object
   * @param {string} path - Dot-separated path
   * @param {*} defaultValue - Default value
   * @returns {*} Found value or default
   * @private
   */
  _getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * Set nested value in object using dot-separated path
   * @param {Object} obj - Target object
   * @param {string} path - Dot-separated path
   * @param {*} value - Value to set
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Build Joi validation schema
   * @returns {Joi.Schema} Validation schema
   * @private
   */
  _buildValidationSchema() {
    return Joi.object({
      server: Joi.object({
        port: Joi.number().port().required(),
        host: Joi.string().hostname().required(),
        cors: Joi.object({
          origin: Joi.array().items(Joi.string()),
          credentials: Joi.boolean()
        }),
        rateLimit: Joi.object({
          windowMs: Joi.number().positive(),
          max: Joi.number().positive()
        })
      }),
      auth: Joi.object({
        token: Joi.string().min(8).required(),
        tokenExpiry: Joi.number().positive()
      }),
      handlers: Joi.object({
        desktop: Joi.object({
          enabled: Joi.boolean(),
          defaultTimeout: Joi.number().positive(),
          sound: Joi.boolean()
        }),
        email: Joi.object({
          enabled: Joi.boolean(),
          smtp: Joi.object({
            host: Joi.string(),
            port: Joi.number().port(),
            secure: Joi.boolean(),
            auth: Joi.object({
              user: Joi.string().allow(''),
              pass: Joi.string().allow('')
            })
          }),
          defaults: Joi.object({
            from: Joi.string().email(),
            to: Joi.array().items(Joi.string().email())
          })
        }),
        sms: Joi.object({
          enabled: Joi.boolean(),
          provider: Joi.string().valid('twilio'),
          config: Joi.object({
            accountSid: Joi.string().allow(''),
            authToken: Joi.string().allow(''),
            fromNumber: Joi.string().allow('')
          })
        })
      }),
      logging: Joi.object({
        level: Joi.string().valid('error', 'warn', 'info', 'debug'),
        file: Joi.string(),
        maxSize: Joi.string(),
        maxFiles: Joi.number().positive(),
        format: Joi.string().valid('json', 'simple')
      }),
      queue: Joi.object({
        concurrency: Joi.number().positive(),
        retries: Joi.number().min(0),
        retryDelay: Joi.number().positive(),
        removeOnComplete: Joi.number().min(0),
        removeOnFail: Joi.number().min(0)
      }),
      security: Joi.object({
        rateLimitEnabled: Joi.boolean(),
        corsEnabled: Joi.boolean(),
        helmetEnabled: Joi.boolean()
      }),
      env: Joi.string().optional()
    }).unknown(false);
  }

  /**
   * Validate configuration against schema
   * @param {Object} config - Configuration to validate
   * @private
   */
  _validateConfig(config) {
    const { error, value } = this.schema.validate(config, {
      abortEarly: false,
      allowUnknown: false
    });

    if (error) {
      const details = error.details.map(d => d.message).join(', ');
      throw new Error(`Configuration validation failed: ${details}`);
    }

    // Additional custom validations
    this._validateCustomRules(value);
  }

  /**
   * Custom validation rules
   * @param {Object} config - Configuration to validate
   * @private
   */
  _validateCustomRules(config) {
    // Validate email handler configuration
    if (config.handlers.email.enabled) {
      const emailConfig = config.handlers.email;
      if (!emailConfig.smtp.auth.user || !emailConfig.smtp.auth.pass) {
        throw new Error('Email handler is enabled but SMTP credentials are not configured');
      }
      if (!emailConfig.defaults.to.length) {
        throw new Error('Email handler is enabled but no default recipients configured');
      }
    }

    // Validate SMS handler configuration
    if (config.handlers.sms.enabled) {
      const smsConfig = config.handlers.sms;
      if (!smsConfig.config.accountSid || !smsConfig.config.authToken || !smsConfig.config.fromNumber) {
        throw new Error('SMS handler is enabled but provider credentials are not configured');
      }
    }

    // Validate authentication token in production
    if (config.env === 'production' && config.auth.token === 'default-dev-token-change-in-production') {
      throw new Error('Default development token must be changed in production environment');
    }
  }
}

// Singleton instance
const configManager = new ConfigManager();

module.exports = configManager;