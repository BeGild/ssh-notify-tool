/**
 * @fileoverview Email notification plugin for SMTP email delivery
 * Provides email notification delivery using nodemailer with support for multiple providers
 */

const nodemailer = require('nodemailer');
const BasePlugin = require('../BasePlugin');

/**
 * Email notification plugin for SMTP email delivery
 * Supports Gmail, Outlook, Yahoo, and custom SMTP servers
 */
class EmailPlugin extends BasePlugin {
  /**
   * Plugin metadata
   * @returns {Object} Plugin metadata
   */
  static get metadata() {
    return {
      name: 'email',
      displayName: 'Email Notifications',
      version: '1.0.0',
      author: 'SSH Notify Tool Project',
      description: 'SMTP email notifications with support for major email providers',
      capabilities: ['text', 'html', 'attachments'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'smtpHost', 'user', 'pass', 'from', 'to'],
        properties: {
          enabled: { type: 'boolean' },
          smtpHost: { type: 'string', minLength: 1 },
          smtpPort: { type: 'number', minimum: 1, maximum: 65535 },
          secure: { type: 'boolean' },
          user: { type: 'string', minLength: 1 },
          pass: { type: 'string', minLength: 1 },
          from: { type: 'string', format: 'email' },
          to: { 
            type: 'array', 
            items: { type: 'string', format: 'email' },
            minItems: 1
          },
          subject: { type: 'string' },
          replyTo: { type: 'string', format: 'email' }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    // Default configuration
    this.defaultConfig = {
      enabled: false,
      smtpPort: 587,
      secure: false, // Use STARTTLS
      subject: 'SSH Notify Tool - {{level}} - {{title}}',
      timeout: 30000 // 30 seconds
    };

    // Merge with provided config
    this.config = { ...this.defaultConfig, ...config };
    
    // SMTP transporter (initialized in setup)
    this.transporter = null;
    
    // Provider presets
    this.providerPresets = {
      'gmail': {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false
      },
      'outlook': {
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false
      },
      'yahoo': {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false
      },
      'icloud': {
        host: 'smtp.mail.me.com',
        port: 587,
        secure: false
      }
    };
  }

  /**
   * Send email notification
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<ChannelResponse>} Response indicating success/failure
   */
  async send(notification) {
    try {
      // Validate notification
      this._validateNotification(notification);

      // Check if email is available
      if (!await this.isAvailable()) {
        return this._createResponse(false, 'Email notifications are not available');
      }

      // Prepare email content
      const mailOptions = this._prepareMailOptions(notification);

      // Send email with retry logic
      const result = await this._retryOperation(
        () => this.transporter.sendMail(mailOptions),
        3,
        2000
      );

      return this._createResponse(true, 'Email notification sent successfully', {
        messageId: result.messageId,
        recipients: mailOptions.to,
        subject: mailOptions.subject,
        envelope: result.envelope
      });

    } catch (error) {
      return this._handleError(error, 'Email notification');
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
      
      // Additional email-specific validation
      if (!this._isValidEmail(config.from)) {
        throw new Error('Invalid sender email address');
      }

      if (!config.to || !Array.isArray(config.to) || config.to.length === 0) {
        throw new Error('At least one recipient email address is required');
      }

      for (const email of config.to) {
        if (!this._isValidEmail(email)) {
          throw new Error(`Invalid recipient email address: ${email}`);
        }
      }

      if (config.replyTo && !this._isValidEmail(config.replyTo)) {
        throw new Error('Invalid reply-to email address');
      }

      // Test SMTP connection if transporter exists
      if (this.transporter) {
        await this.transporter.verify();
      }

      return true;
    } catch (error) {
      console.warn(`Email plugin configuration validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if email notifications are available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.transporter) {
      return false;
    }

    try {
      // Test SMTP connection
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.warn(`Email plugin availability check failed: ${error.message}`);
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
    
    if (!this.config.enabled) {
      console.log('Email plugin disabled');
      return;
    }

    // Create SMTP transporter
    await this._createTransporter();
    
    // Test connection
    try {
      await this.transporter.verify();
      console.log('Email plugin initialized successfully');
    } catch (error) {
      console.warn(`Email plugin setup warning: ${error.message}`);
    }
  }

  /**
   * Cleanup plugin resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
    await super.cleanup();
  }

  /**
   * Health check for email notifications
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    if (!baseHealth.healthy) {
      return baseHealth;
    }

    try {
      const available = await this.isAvailable();
      const connectionInfo = {
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.secure,
        user: this.config.user
      };

      return {
        healthy: available,
        message: available ? 
          `Email notifications available via ${this.config.smtpHost}` : 
          'Email notifications not available - SMTP connection failed',
        metadata: { connection: connectionInfo }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`
      };
    }
  }

  /**
   * Create SMTP transporter
   * @private
   */
  async _createTransporter() {
    // Apply provider preset if detected
    const transporterConfig = this._applyProviderPreset(this.config);

    // Create transporter options
    const transporterOptions = {
      host: transporterConfig.smtpHost,
      port: transporterConfig.smtpPort,
      secure: transporterConfig.secure,
      auth: {
        user: transporterConfig.user,
        pass: transporterConfig.pass
      },
      connectionTimeout: transporterConfig.timeout || 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      // Additional options for better compatibility
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
        ciphers: 'SSLv3'
      },
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    };

    // Create transporter
    this.transporter = nodemailer.createTransporter(transporterOptions);

    // Add event listeners
    this.transporter.on('error', (error) => {
      console.error('SMTP transporter error:', error);
    });
  }

  /**
   * Apply provider preset configuration
   * @private
   * @param {Object} config - Original configuration
   * @returns {Object} Configuration with preset applied
   */
  _applyProviderPreset(config) {
    const smtpHost = config.smtpHost.toLowerCase();
    
    // Detect provider from SMTP host
    let provider = null;
    for (const [providerName, preset] of Object.entries(this.providerPresets)) {
      if (smtpHost.includes(providerName) || smtpHost.includes(preset.host)) {
        provider = providerName;
        break;
      }
    }

    if (provider && this.providerPresets[provider]) {
      const preset = this.providerPresets[provider];
      return {
        ...config,
        smtpHost: preset.host,
        smtpPort: config.smtpPort || preset.port,
        secure: config.secure !== undefined ? config.secure : preset.secure
      };
    }

    return config;
  }

  /**
   * Prepare email options
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {Object} Mail options for nodemailer
   */
  _prepareMailOptions(notification) {
    const subject = this._formatTemplate(this.config.subject || 'SSH Notify Tool Notification', notification);
    
    const mailOptions = {
      from: this.config.from,
      to: Array.isArray(this.config.to) ? this.config.to.join(', ') : this.config.to,
      subject: subject,
      text: this._generateTextContent(notification),
      html: this._generateHtmlContent(notification)
    };

    // Add reply-to if configured
    if (this.config.replyTo) {
      mailOptions.replyTo = this.config.replyTo;
    }

    // Add attachments if present
    if (notification.attachments && notification.attachments.length > 0) {
      mailOptions.attachments = notification.attachments.map(attachment => ({
        filename: attachment.filename || 'attachment',
        content: attachment.content,
        contentType: attachment.contentType || 'application/octet-stream'
      }));
    }

    // Add priority based on notification level
    if (notification.level === 'error') {
      mailOptions.priority = 'high';
    } else if (notification.level === 'warning') {
      mailOptions.priority = 'normal';
    } else {
      mailOptions.priority = 'low';
    }

    return mailOptions;
  }

  /**
   * Generate plain text email content
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {string} Plain text content
   */
  _generateTextContent(notification) {
    const lines = [
      `Title: ${notification.title}`,
      `Level: ${notification.level || 'info'}`,
      `Message: ${notification.message}`,
      '',
      `Timestamp: ${new Date().toISOString()}`,
      '',
      '---',
      'This notification was sent by SSH Notify Tool'
    ];

    if (notification.metadata) {
      lines.splice(-2, 0, '', 'Additional Information:', JSON.stringify(notification.metadata, null, 2));
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML email content
   * @private
   * @param {NotificationRequest} notification - Notification request
   * @returns {string} HTML content
   */
  _generateHtmlContent(notification) {
    const levelColors = {
      info: '#2196F3',
      warning: '#FF9800',
      error: '#F44336'
    };

    const levelColor = levelColors[notification.level] || levelColors.info;
    const timestamp = new Date().toISOString();

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${notification.title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="border-left: 4px solid ${levelColor}; padding-left: 20px; margin-bottom: 20px;">
        <h2 style="color: ${levelColor}; margin-top: 0;">${notification.title}</h2>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <strong>Level:</strong> <span style="color: ${levelColor}; text-transform: uppercase;">${notification.level || 'info'}</span>
        </div>
    </div>
    
    <div style="background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin: 20px 0;">
        <h3>Message:</h3>
        <p style="margin: 0; white-space: pre-wrap;">${this._escapeHtml(notification.message)}</p>
    </div>
    
    ${notification.metadata ? `
    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h4>Additional Information:</h4>
        <pre style="background: #fff; padding: 10px; border-radius: 3px; overflow-x: auto; font-size: 12px;">${this._escapeHtml(JSON.stringify(notification.metadata, null, 2))}</pre>
    </div>
    ` : ''}
    
    <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 30px; text-align: center; color: #666; font-size: 12px;">
        <p>Timestamp: ${timestamp}</p>
        <p>This notification was sent by <strong>SSH Notify Tool</strong></p>
    </div>
</body>
</html>`;
  }

  /**
   * Format template string with notification data
   * @private
   * @param {string} template - Template string
   * @param {NotificationRequest} notification - Notification data
   * @returns {string} Formatted string
   */
  _formatTemplate(template, notification) {
    return template
      .replace(/\{\{title\}\}/g, notification.title || '')
      .replace(/\{\{message\}\}/g, notification.message || '')
      .replace(/\{\{level\}\}/g, notification.level || 'info')
      .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
  }

  /**
   * Escape HTML characters
   * @private
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  _escapeHtml(text) {
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    };
    
    return text.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
  }

  /**
   * Validate email address format
   * @private
   * @param {string} email - Email address to validate
   * @returns {boolean} True if valid
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = EmailPlugin;
