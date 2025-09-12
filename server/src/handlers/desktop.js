const notifier = require('node-notifier');
const path = require('path');
const NotificationHandler = require('./base');

/**
 * Desktop notification handler using node-notifier
 * Supports Windows, macOS, and Linux desktop notifications
 */
class DesktopHandler extends NotificationHandler {
  constructor(config = {}, logger = console) {
    super(config, logger);
    
    // Desktop-specific configuration
    this.config = {
      defaultTimeout: 5000,
      sound: true,
      wait: false,
      ...this.config
    };
  }

  /**
   * Check if desktop notifications are available
   * @returns {boolean} True if desktop notifications are supported
   */
  isConfigured() {
    try {
      // Check if we're in a desktop environment
      return process.platform !== undefined && !process.env.CI;
    } catch (error) {
      this.logger.warn('Desktop notification availability check failed', { 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Send desktop notification
   * @param {Object} notification - Notification object
   * @returns {Promise<Object>} Send result
   */
  async send(notification) {
    return new Promise((resolve, reject) => {
      const options = this._buildNotificationOptions(notification);
      
      this.logger.debug('Sending desktop notification', {
        options: this._sanitizeOptions(options),
        notificationId: notification.id
      });

      notifier.notify(options, (error, response, metadata) => {
        if (error) {
          reject(new Error(`Desktop notification failed: ${error.message}`));
          return;
        }

        const messageId = `desktop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        resolve({
          messageId,
          response,
          metadata,
          platform: process.platform
        });
      });
    });
  }

  /**
   * Build notification options for node-notifier
   * @param {Object} notification - Notification object
   * @returns {Object} Notification options
   * @private
   */
  _buildNotificationOptions(notification) {
    const options = {
      title: notification.title,
      message: notification.message,
      sound: this.config.sound,
      wait: this.config.wait
    };

    // Platform-specific options
    switch (process.platform) {
      case 'darwin': // macOS
        return this._buildMacOSOptions(notification, options);
      case 'win32': // Windows
        return this._buildWindowsOptions(notification, options);
      case 'linux': // Linux
        return this._buildLinuxOptions(notification, options);
      default:
        return options;
    }
  }

  /**
   * Build macOS-specific notification options
   * @param {Object} notification - Notification object
   * @param {Object} baseOptions - Base options
   * @returns {Object} macOS notification options
   * @private
   */
  _buildMacOSOptions(notification, baseOptions) {
    const options = { ...baseOptions };
    
    // Set timeout
    const timeout = this._getTimeout(notification);
    if (timeout > 0) {
      options.timeout = timeout / 1000; // macOS uses seconds
    }

    // Set icon based on level
    const icon = this._getIcon(notification.level);
    if (icon) {
      options.contentImage = icon;
    }

    // Add subtitle for additional context
    if (notification.metadata?.tags?.length) {
      options.subtitle = notification.metadata.tags.join(', ');
    }

    // Add actions if specified
    if (notification.options?.desktop?.actions?.length) {
      options.actions = notification.options.desktop.actions.map(action => action.label);
    }

    // Set app name
    options.sender = 'com.ssh-notify-tool.app';

    return options;
  }

  /**
   * Build Windows-specific notification options
   * @param {Object} notification - Notification object
   * @param {Object} baseOptions - Base options
   * @returns {Object} Windows notification options
   * @private
   */
  _buildWindowsOptions(notification, baseOptions) {
    const options = { ...baseOptions };
    
    // Set timeout
    const timeout = this._getTimeout(notification);
    if (timeout > 0) {
      options.time = timeout;
    }

    // Set icon based on level
    const icon = this._getIcon(notification.level);
    if (icon) {
      options.icon = icon;
    }

    // Windows Toast notification type
    options.type = 'balloon';

    // Add app ID for Windows 10+ toast notifications
    options.appID = 'SSH Notify Tool';

    return options;
  }

  /**
   * Build Linux-specific notification options
   * @param {Object} notification - Notification object
   * @param {Object} baseOptions - Base options
   * @returns {Object} Linux notification options
   * @private
   */
  _buildLinuxOptions(notification, baseOptions) {
    const options = { ...baseOptions };
    
    // Set timeout
    const timeout = this._getTimeout(notification);
    if (timeout > 0) {
      options.time = timeout;
    }

    // Set urgency based on level
    switch (notification.level) {
      case 'error':
        options.urgency = 'critical';
        break;
      case 'warning':
        options.urgency = 'normal';
        break;
      case 'info':
      default:
        options.urgency = 'low';
        break;
    }

    // Set icon based on level
    const icon = this._getIcon(notification.level);
    if (icon) {
      options.icon = icon;
    }

    // Set category
    options.category = 'im.received';

    return options;
  }

  /**
   * Get timeout from notification or config
   * @param {Object} notification - Notification object
   * @returns {number} Timeout in milliseconds
   * @private
   */
  _getTimeout(notification) {
    return notification.options?.desktop?.timeout || this.config.defaultTimeout;
  }

  /**
   * Get icon based on notification level
   * @param {string} level - Notification level
   * @returns {string|null} Icon path or system icon name
   * @private
   */
  _getIcon(level) {
    // Use system icons for different levels
    switch (level) {
      case 'error':
        if (process.platform === 'darwin') return 'Terminal'; // macOS system app icon
        if (process.platform === 'linux') return 'dialog-error';
        return path.join(__dirname, '../assets/error.ico'); // Windows
      
      case 'warning':
        if (process.platform === 'darwin') return 'Terminal';
        if (process.platform === 'linux') return 'dialog-warning';
        return path.join(__dirname, '../assets/warning.ico');
      
      case 'info':
      default:
        if (process.platform === 'darwin') return 'Terminal';
        if (process.platform === 'linux') return 'dialog-information';
        return path.join(__dirname, '../assets/info.ico');
    }
  }

  /**
   * Sanitize options for logging (remove sensitive data)
   * @param {Object} options - Notification options
   * @returns {Object} Sanitized options
   * @private
   */
  _sanitizeOptions(options) {
    const sanitized = { ...options };
    
    // Truncate long messages for logging
    if (sanitized.message && sanitized.message.length > 100) {
      sanitized.message = sanitized.message.substring(0, 100) + '...';
    }
    
    return sanitized;
  }

  /**
   * Test desktop notification functionality
   * @returns {Promise<Object>} Test result
   */
  async test() {
    const testNotification = {
      id: 'test_' + Date.now(),
      title: 'SSH Notify Tool - Test',
      message: 'Desktop notification test successful!',
      level: 'info',
      timestamp: new Date().toISOString()
    };

    try {
      const result = await this.execute(testNotification);
      return {
        success: true,
        platform: process.platform,
        result
      };
    } catch (error) {
      return {
        success: false,
        platform: process.platform,
        error: error.message
      };
    }
  }

  /**
   * Get desktop environment information
   * @returns {Object} Desktop environment info
   */
  getDesktopInfo() {
    const info = {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      desktop: 'unknown'
    };

    // Try to detect desktop environment on Linux
    if (process.platform === 'linux') {
      const desktopSession = process.env.DESKTOP_SESSION || '';
      const xdgCurrentDesktop = process.env.XDG_CURRENT_DESKTOP || '';
      
      if (xdgCurrentDesktop.toLowerCase().includes('gnome')) {
        info.desktop = 'GNOME';
      } else if (xdgCurrentDesktop.toLowerCase().includes('kde')) {
        info.desktop = 'KDE';
      } else if (xdgCurrentDesktop.toLowerCase().includes('xfce')) {
        info.desktop = 'XFCE';
      } else if (desktopSession) {
        info.desktop = desktopSession;
      }
    } else if (process.platform === 'darwin') {
      info.desktop = 'macOS';
    } else if (process.platform === 'win32') {
      info.desktop = 'Windows';
    }

    return info;
  }
}

module.exports = DesktopHandler;