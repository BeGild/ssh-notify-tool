/**
 * @fileoverview Desktop notification plugin for cross-platform native notifications
 * Provides desktop notification delivery using node-notifier for Windows, macOS, and Linux
 */

const notifier = require('node-notifier');
const path = require('path');
const os = require('os');
const BasePlugin = require('../BasePlugin');

/**
 * Desktop notification plugin for native desktop notifications
 * Supports Windows Toast, macOS Notification Center, and Linux notify-send
 */
class DesktopPlugin extends BasePlugin {
  /**
   * Plugin metadata
   * @returns {Object} Plugin metadata
   */
  static get metadata() {
    return {
      name: 'desktop',
      displayName: 'Desktop Notifications',
      version: '1.0.0',
      author: 'SSH Notify Tool Project',
      description: 'Cross-platform desktop notifications using native system APIs',
      capabilities: ['text', 'actions', 'sound'],
      configSchema: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' },
          sound: { type: 'boolean' },
          timeout: { type: 'number', minimum: 1, maximum: 30 },
          icon: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    // Default configuration
    this.defaultConfig = {
      enabled: true,
      sound: true,
      timeout: 5,
      icon: null,
      actions: []
    };

    // Merge with provided config
    this.config = { ...this.defaultConfig, ...config };
    
    // Platform-specific settings
    this.platform = os.platform();
    this.isSupported = this._checkPlatformSupport();
  }

  /**
   * Send desktop notification
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    try {
      // Validate notification
      this._validateNotification(notification);

      // Check if desktop notifications are available
      if (!await this.isAvailable()) {
        return this._createResponse(false, 'Desktop notifications are not available');
      }

      // Prepare notification options
      const notificationOptions = this._prepareNotificationOptions(notification);

      // Send notification with retry logic
      const result = await this._retryOperation(
        () => this._sendNotification(notificationOptions),
        3,
        1000
      );

      return this._createResponse(true, 'Desktop notification sent successfully', {
        platform: this.platform,
        options: notificationOptions,
        result
      });

    } catch (error) {
      return this._handleError(error, 'Desktop notification');
    }
  }

  /**
   * Validate plugin configuration
   * @param {Object} config - Configuration to validate
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async validate(config) {
    try {
      this._validateConfig(config, this.constructor.metadata.configSchema);
      
      // Additional desktop-specific validation
      if (config.timeout && (config.timeout < 1 || config.timeout > 30)) {
        throw new Error('Timeout must be between 1 and 30 seconds');
      }

      if (config.icon && !this._isValidIconPath(config.icon)) {
        throw new Error('Icon path is invalid or file does not exist');
      }

      return true;
    } catch (error) {
      console.warn(`Desktop plugin configuration validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if desktop notifications are available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.isSupported) {
      return false;
    }

    // Platform-specific availability checks
    switch (this.platform) {
      case 'darwin':
        return this._isMacNotificationAvailable();
      case 'win32':
        return this._isWindowsNotificationAvailable();
      case 'linux':
        return this._isLinuxNotificationAvailable();
      default:
        return false;
    }
  }

  /**
   * Initialize the plugin
   * @param {Object} config - Plugin configuration
   * @returns {Promise<void>}
   */
  async setup(config) {
    await super.setup(config);
    
    // Merge configuration
    this.config = { ...this.defaultConfig, ...config };
    
    // Test notification capability
    try {
      await this._testNotification();
      console.log('Desktop plugin initialized successfully');
    } catch (error) {
      console.warn(`Desktop plugin setup warning: ${error.message}`);
    }
  }

  /**
   * Health check for desktop notifications
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    if (!baseHealth.healthy) {
      return baseHealth;
    }

    try {
      const available = await this.isAvailable();
      const platformInfo = {
        platform: this.platform,
        supported: this.isSupported,
        available
      };

      return {
        healthy: available,
        message: available ? 
          `Desktop notifications available on ${this.platform}` : 
          `Desktop notifications not available on ${this.platform}`,
        metadata: platformInfo
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`
      };
    }
  }

  /**
   * Prepare notification options for node-notifier
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} Notification options
   */
  _prepareNotificationOptions(notification) {
    const options = {
      title: notification.title,
      message: notification.message,
      sound: this.config.sound,
      wait: false, // Don't wait for user action
      timeout: this.config.timeout
    };

    // Set icon
    if (this.config.icon) {
      options.icon = this.config.icon;
    } else {
      options.icon = this._getDefaultIcon();
    }

    // Platform-specific options
    switch (this.platform) {
      case 'darwin':
        this._addMacOptions(options, notification);
        break;
      case 'win32':
        this._addWindowsOptions(options, notification);
        break;
      case 'linux':
        this._addLinuxOptions(options, notification);
        break;
    }

    return options;
  }

  /**
   * Send notification using node-notifier
   * @private
   * @param {Object} options - Notification options
   * @returns {Promise<Object>} Notification result
   */
  _sendNotification(options) {
    return new Promise((resolve, reject) => {
      notifier.notify(options, (error, response, metadata) => {
        if (error) {
          reject(error);
        } else {
          resolve({ response, metadata });
        }
      });
    });
  }

  /**
   * Add macOS-specific notification options
   * @private
   * @param {Object} options - Notification options
   * @param {NotificationRequest} notification - Notification request
   */
  _addMacOptions(options, notification) {
    // Use terminal-notifier for macOS
    options.type = 'darwin';
    
    // Add severity-based sound
    if (notification.level === 'error') {
      options.sound = 'Basso';
    } else if (notification.level === 'warning') {
      options.sound = 'Blow';
    } else {
      options.sound = this.config.sound ? 'default' : false;
    }

    // Add actions if supported
    if (this.config.actions && this.config.actions.length > 0) {
      options.actions = this.config.actions;
    }

    // Add app bundle identifier
    options.sender = 'com.ssh-notify-tool.notifier';
  }

  /**
   * Add Windows-specific notification options
   * @private
   * @param {Object} options - Notification options
   * @param {NotificationRequest} notification - Notification request
   */
  _addWindowsOptions(options, notification) {
    // Use Windows Toast notifications
    options.type = 'windows';
    
    // Add app ID for Windows 10+ toast notifications
    options.appID = 'SSH Notify Tool';
    
    // Remove unsupported options
    delete options.timeout; // Windows handles timeout automatically
  }

  /**
   * Add Linux-specific notification options
   * @private
   * @param {Object} options - Notification options
   * @param {NotificationRequest} notification - Notification request
   */
  _addLinuxOptions(options, notification) {
    // Use notify-send for Linux
    options.type = 'linux';
    
    // Add urgency level based on notification level
    if (notification.level === 'error') {
      options.urgency = 'critical';
    } else if (notification.level === 'warning') {
      options.urgency = 'normal';
    } else {
      options.urgency = 'low';
    }

    // Add category
    options.category = 'im.received';
  }

  /**
   * Check platform support
   * @private
   * @returns {boolean} True if platform is supported
   */
  _checkPlatformSupport() {
    const supportedPlatforms = ['darwin', 'win32', 'linux'];
    return supportedPlatforms.includes(this.platform);
  }

  /**
   * Check if macOS notifications are available
   * @private
   * @returns {boolean} True if available
   */
  _isMacNotificationAvailable() {
    try {
      // Check if we're in a GUI environment
      return process.env.DISPLAY !== undefined || process.platform === 'darwin';
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Windows notifications are available
   * @private
   * @returns {boolean} True if available
   */
  _isWindowsNotificationAvailable() {
    try {
      // Windows notifications should be available in most cases
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Linux notifications are available
   * @private
   * @returns {boolean} True if available
   */
  _isLinuxNotificationAvailable() {
    try {
      // Check if we're in a GUI environment
      return process.env.DISPLAY !== undefined || process.env.WAYLAND_DISPLAY !== undefined;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get default icon path
   * @private
   * @returns {string} Default icon path
   */
  _getDefaultIcon() {
    const iconName = this.platform === 'win32' ? 'icon.ico' : 'icon.png';
    return path.join(__dirname, '..', '..', 'assets', 'icons', iconName);
  }

  /**
   * Validate icon path
   * @private
   * @param {string} iconPath - Icon path to validate
   * @returns {boolean} True if valid
   */
  _isValidIconPath(iconPath) {
    try {
      const fs = require('fs');
      return fs.existsSync(iconPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Test notification capability
   * @private
   */
  async _testNotification() {
    if (!await this.isAvailable()) {
      throw new Error('Desktop notifications not available');
    }

    // Send a silent test notification
    const testOptions = {
      title: 'SSH Notify Tool',
      message: 'Desktop notifications are working',
      sound: false,
      wait: false
    };

    await this._sendNotification(testOptions);
  }
}

module.exports = DesktopPlugin;
