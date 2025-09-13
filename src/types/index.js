/**
 * @fileoverview Core type definitions for SSH Notify Tool
 * Provides JSDoc type definitions for all data structures used throughout the application
 */

/**
 * Notification request data structure
 * @typedef {Object} NotificationRequest
 * @property {string} title - The notification title
 * @property {string} message - The main notification content
 * @property {'info'|'warning'|'error'} level - The notification level/severity
 * @property {string[]} channels - Array of channel names to use for delivery
 * @property {Object[]} [attachments] - Optional file attachments
 * @property {Object} [metadata] - Additional channel-specific data
 * @property {number} [timestamp] - Timestamp when notification was created
 * @property {string} [id] - Unique notification identifier
 */

/**
 * System configuration structure
 * @typedef {Object} Configuration
 * @property {ServerConfig} server - Server configuration
 * @property {PluginConfig} plugins - Plugin system configuration
 * @property {LoggingConfig} logging - Logging configuration
 */

/**
 * Server configuration
 * @typedef {Object} ServerConfig
 * @property {number} port - Server listening port (default: 5000)
 * @property {string} host - Bind address (default: '127.0.0.1')
 * @property {string} authToken - Authentication token for API access
 * @property {number} [timeout] - Request timeout in milliseconds
 * @property {boolean} [cors] - Enable CORS support
 */

/**
 * Plugin system configuration
 * @typedef {Object} PluginConfig
 * @property {string[]} enabled - List of enabled plugin names
 * @property {string[]} [searchPaths] - Plugin search directories
 * @property {Object} config - Plugin-specific configurations
 */

/**
 * Logging configuration
 * @typedef {Object} LoggingConfig
 * @property {'debug'|'info'|'warn'|'error'} level - Log level
 * @property {string} [file] - Log file path
 * @property {boolean} [console] - Enable console logging
 * @property {number} [maxSize] - Maximum log file size in bytes
 * @property {number} [maxFiles] - Maximum number of log files to keep
 */

/**
 * Channel response after notification delivery attempt
 * @typedef {Object} ChannelResponse
 * @property {string} channel - Channel name that processed the notification
 * @property {boolean} success - Whether delivery was successful
 * @property {string} message - Success/error message details
 * @property {string} timestamp - ISO timestamp of delivery attempt
 * @property {Object} [metadata] - Channel-specific response data
 * @property {number} [retryAttempt] - Retry attempt number (if applicable)
 * @property {number} [deliveryTime] - Time taken for delivery in milliseconds
 */

/**
 * Plugin metadata structure
 * @typedef {Object} PluginMetadata
 * @property {string} name - Unique plugin identifier
 * @property {string} displayName - Human-readable plugin name
 * @property {string} version - Semantic version string
 * @property {string} author - Plugin author information
 * @property {string} description - Brief plugin description
 * @property {string[]} capabilities - Supported features (text, images, attachments, etc.)
 * @property {Object} configSchema - JSON schema for configuration validation
 * @property {string[]} [dependencies] - Required dependencies
 * @property {Object} [urls] - Related URLs (homepage, repository, issues)
 */

/**
 * Plugin configuration schema for individual plugins
 * @typedef {Object} PluginConfigSchema
 * @property {boolean} enabled - Enable/disable this plugin
 * @property {number} [priority] - Plugin execution priority (higher = earlier)
 * @property {number} [retryAttempts] - Number of retry attempts on failure
 * @property {number} [timeout] - Request timeout in milliseconds
 * @property {Object} [config] - Plugin-specific configuration object
 */

/**
 * Desktop notification plugin configuration
 * @typedef {Object} DesktopPluginConfig
 * @property {boolean} enabled - Enable desktop notifications
 * @property {boolean} [sound] - Play notification sound
 * @property {string} [icon] - Path to custom notification icon
 * @property {number} [timeout] - Notification display timeout in seconds
 */

/**
 * Email plugin configuration
 * @typedef {Object} EmailPluginConfig
 * @property {boolean} enabled - Enable email notifications
 * @property {string} smtpHost - SMTP server hostname
 * @property {number} smtpPort - SMTP server port
 * @property {boolean} [secure] - Use TLS/SSL connection
 * @property {string} user - SMTP username
 * @property {string} pass - SMTP password
 * @property {string} from - Sender email address
 * @property {string[]} to - Recipient email addresses
 * @property {string} [subject] - Email subject template
 */

/**
 * SMS plugin configuration
 * @typedef {Object} SmsPluginConfig
 * @property {boolean} enabled - Enable SMS notifications
 * @property {'twilio'|'aliyun'} provider - SMS service provider
 * @property {Object} credentials - Provider-specific credentials
 * @property {string[]} to - Recipient phone numbers
 * @property {string} [from] - Sender phone number/ID
 */

/**
 * DingTalk plugin configuration
 * @typedef {Object} DingTalkPluginConfig
 * @property {boolean} enabled - Enable DingTalk notifications
 * @property {string} webhook - DingTalk robot webhook URL
 * @property {string} [secret] - Signing secret for security
 * @property {string[]} [atMobiles] - Phone numbers to @mention
 * @property {boolean} [isAtAll] - Whether to @mention everyone
 */

/**
 * WeChat Work plugin configuration
 * @typedef {Object} WeChatWorkPluginConfig
 * @property {boolean} enabled - Enable WeChat Work notifications
 * @property {string} webhook - WeChat Work robot webhook URL
 * @property {string[]} [mentionedList] - UserIDs to @mention
 * @property {string[]} [mentionedMobileList] - Phone numbers to @mention
 */

/**
 * Slack plugin configuration
 * @typedef {Object} SlackPluginConfig
 * @property {boolean} enabled - Enable Slack notifications
 * @property {string} webhook - Slack webhook URL
 * @property {string} [channel] - Target channel name
 * @property {string} [username] - Bot username
 * @property {string} [iconEmoji] - Bot icon emoji
 * @property {boolean} [linkNames] - Link channel/user names
 */

/**
 * SSH tunnel helper configuration
 * @typedef {Object} SshConfig
 * @property {string} [host] - Remote host address
 * @property {number} [port] - Remote SSH port
 * @property {string} [user] - SSH username
 * @property {string} [keyPath] - Path to SSH private key
 * @property {number} [localPort] - Local port for tunnel
 * @property {number} [remotePort] - Remote port for tunnel
 */

/**
 * Notification delivery result
 * @typedef {Object} DeliveryResult
 * @property {boolean} success - Overall delivery success status
 * @property {number} totalChannels - Total number of channels attempted
 * @property {number} successfulChannels - Number of successful deliveries
 * @property {ChannelResponse[]} responses - Individual channel responses
 * @property {string} notificationId - Unique notification identifier
 * @property {number} totalTime - Total processing time in milliseconds
 */

/**
 * Plugin validation result
 * @typedef {Object} PluginValidationResult
 * @property {boolean} valid - Whether plugin passes validation
 * @property {string[]} errors - Array of validation error messages
 * @property {string[]} warnings - Array of validation warnings
 * @property {PluginMetadata} [metadata] - Extracted plugin metadata
 */

/**
 * Client configuration for notification client
 * @typedef {Object} ClientConfig
 * @property {string} serverUrl - Notification server URL
 * @property {string} authToken - Authentication token
 * @property {number} [timeout] - Request timeout in milliseconds
 * @property {number} [retryAttempts] - Number of retry attempts
 * @property {number} [retryDelay] - Delay between retries in milliseconds
 */

// Export types for use in other modules
module.exports = {
  // Type definitions are available via JSDoc comments
  // No runtime exports needed for type-only definitions
};
