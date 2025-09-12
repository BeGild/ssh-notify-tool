const nodemailer = require('nodemailer');
const NotificationHandler = require('./base');

/**
 * Email notification handler using nodemailer
 * Supports SMTP and various email providers
 */
class EmailHandler extends NotificationHandler {
  constructor(config = {}, logger = console) {
    super(config, logger);
    
    this.transporter = null;
    this.isTransporterValid = false;
    
    // Initialize transporter if configured
    if (this.isConfigured()) {
      this._initializeTransporter();
    }
  }

  /**
   * Check if email handler is properly configured
   * @returns {boolean} True if SMTP settings are present
   */
  isConfigured() {
    const smtp = this.config.smtp;
    return !!(
      smtp &&
      smtp.host &&
      smtp.port &&
      smtp.auth &&
      smtp.auth.user &&
      smtp.auth.pass
    );
  }

  /**
   * Initialize SMTP transporter
   * @private
   */
  async _initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransporter({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure || false,
        auth: {
          user: this.config.smtp.auth.user,
          pass: this.config.smtp.auth.pass
        },
        // Connection timeout
        connectionTimeout: this.config.timeout || 10000,
        greetingTimeout: this.config.timeout || 10000,
        socketTimeout: this.config.timeout || 10000,
        // Additional options
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 10 // max 10 messages per second
      });

      // Verify transporter configuration
      await this._verifyTransporter();
      
    } catch (error) {
      this.logger.error('Failed to initialize email transporter', {
        error: error.message,
        host: this.config.smtp.host,
        port: this.config.smtp.port
      });
      this.isTransporterValid = false;
    }
  }

  /**
   * Verify SMTP transporter configuration
   * @private
   */
  async _verifyTransporter() {
    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    try {
      await this.transporter.verify();
      this.isTransporterValid = true;
      
      this.logger.info('Email transporter verified successfully', {
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        user: this.config.smtp.auth.user
      });
      
    } catch (error) {
      this.isTransporterValid = false;
      throw new Error(`SMTP verification failed: ${error.message}`);
    }
  }

  /**
   * Send email notification
   * @param {Object} notification - Notification object
   * @returns {Promise<Object>} Send result
   */
  async send(notification) {
    if (!this.transporter || !this.isTransporterValid) {
      await this._initializeTransporter();
    }

    const mailOptions = this._buildMailOptions(notification);
    
    this.logger.debug('Sending email notification', {
      to: mailOptions.to,
      subject: mailOptions.subject,
      notificationId: notification.id
    });

    try {
      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        messageId: result.messageId,
        response: result.response,
        envelope: result.envelope,
        accepted: result.accepted,
        rejected: result.rejected
      };
      
    } catch (error) {
      // Handle specific SMTP errors
      if (error.code === 'EAUTH') {
        throw new Error('SMTP authentication failed - check email credentials');
      } else if (error.code === 'ECONNECTION') {
        throw new Error('SMTP connection failed - check host and port');
      } else if (error.code === 'EMESSAGE') {
        throw new Error('Invalid email message - check recipients and content');
      }
      
      throw new Error(`Email send failed: ${error.message}`);
    }
  }

  /**
   * Build email options for nodemailer
   * @param {Object} notification - Notification object
   * @returns {Object} Mail options
   * @private
   */
  _buildMailOptions(notification) {
    const options = {
      from: this._getSenderAddress(notification),
      to: this._getRecipients(notification),
      subject: this._getSubject(notification),
      text: this._getTextContent(notification),
      html: this._getHtmlContent(notification),
      priority: this._getPriority(notification.level)
    };

    // Add attachments if present
    if (notification.metadata?.attachments?.length) {
      options.attachments = this._processAttachments(notification.metadata.attachments);
    }

    // Add custom headers
    options.headers = this._getCustomHeaders(notification);

    return options;
  }

  /**
   * Get sender email address
   * @param {Object} notification - Notification object
   * @returns {string} Sender address
   * @private
   */
  _getSenderAddress(notification) {
    const defaultFrom = this.config.defaults?.from || `noreply@${this.config.smtp.host}`;
    return notification.options?.email?.from || defaultFrom;
  }

  /**
   * Get recipient email addresses
   * @param {Object} notification - Notification object
   * @returns {string|string[]} Recipients
   * @private
   */
  _getRecipients(notification) {
    const recipients = notification.options?.email?.to || this.config.defaults?.to || [];
    
    if (!recipients.length) {
      throw new Error('No email recipients specified');
    }
    
    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecipients = recipients.filter(email => emailRegex.test(email));
    
    if (!validRecipients.length) {
      throw new Error('No valid email recipients found');
    }
    
    return validRecipients;
  }

  /**
   * Get email subject
   * @param {Object} notification - Notification object
   * @returns {string} Email subject
   * @private
   */
  _getSubject(notification) {
    const customSubject = notification.options?.email?.subject;
    if (customSubject) {
      return customSubject;
    }

    // Build subject with level prefix
    const levelPrefix = {
      error: '[ERROR]',
      warning: '[WARNING]',
      info: '[INFO]'
    }[notification.level] || '[NOTIFY]';

    return `${levelPrefix} ${notification.title}`;
  }

  /**
   * Get email text content
   * @param {Object} notification - Notification object
   * @returns {string} Text content
   * @private
   */
  _getTextContent(notification) {
    let content = `${notification.title}\n\n${notification.message}\n\n`;
    
    // Add metadata
    content += `---\n`;
    content += `Time: ${notification.timestamp}\n`;
    content += `Level: ${notification.level?.toUpperCase() || 'INFO'}\n`;
    content += `ID: ${notification.id}\n`;
    
    if (notification.metadata?.tags?.length) {
      content += `Tags: ${notification.metadata.tags.join(', ')}\n`;
    }
    
    content += `\nSent by SSH Notify Tool`;
    
    return content;
  }

  /**
   * Get email HTML content
   * @param {Object} notification - Notification object
   * @returns {string|null} HTML content
   * @private
   */
  _getHtmlContent(notification) {
    // Only generate HTML if explicitly requested or if rich content is present
    if (!notification.options?.email?.html && !notification.metadata?.attachments?.length) {
      return null;
    }

    const levelColors = {
      error: '#d32f2f',
      warning: '#f57c00',
      info: '#1976d2'
    };

    const color = levelColors[notification.level] || levelColors.info;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${notification.title}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${color}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .metadata { background: #e9e9e9; padding: 10px; margin-top: 20px; border-radius: 3px; font-size: 0.9em; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 0.8em; }
            pre { background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${this._escapeHtml(notification.title)}</h1>
          </div>
          <div class="content">
            <p>${this._escapeHtml(notification.message).replace(/\\n/g, '<br>')}</p>
            <div class="metadata">
              <strong>Details:</strong><br>
              Time: ${new Date(notification.timestamp).toLocaleString()}<br>
              Level: ${(notification.level || 'info').toUpperCase()}<br>
              ID: ${notification.id}
              ${notification.metadata?.tags?.length ? `<br>Tags: ${notification.metadata.tags.join(', ')}` : ''}
            </div>
          </div>
          <div class="footer">
            Sent by SSH Notify Tool
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Get email priority based on notification level
   * @param {string} level - Notification level
   * @returns {string} Email priority
   * @private
   */
  _getPriority(level) {
    switch (level) {
      case 'error':
        return 'high';
      case 'warning':
        return 'normal';
      case 'info':
      default:
        return 'low';
    }
  }

  /**
   * Process attachments for email
   * @param {Array} attachments - Attachment objects
   * @returns {Array} Processed attachments
   * @private
   */
  _processAttachments(attachments) {
    return attachments.map(attachment => {
      if (attachment.type === 'image' && attachment.url) {
        return {
          filename: attachment.filename || 'image.png',
          path: attachment.url,
          cid: attachment.cid || 'image'
        };
      } else if (attachment.type === 'file' && attachment.content) {
        return {
          filename: attachment.filename || 'attachment.txt',
          content: attachment.content
        };
      }
      return null;
    }).filter(Boolean);
  }

  /**
   * Get custom email headers
   * @param {Object} notification - Notification object
   * @returns {Object} Custom headers
   * @private
   */
  _getCustomHeaders(notification) {
    return {
      'X-Notification-ID': notification.id,
      'X-Notification-Level': notification.level || 'info',
      'X-Notification-Source': 'ssh-notify-tool',
      'X-Notification-Timestamp': notification.timestamp
    };
  }

  /**
   * Escape HTML characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   * @private
   */
  _escapeHtml(text) {
    if (typeof text !== 'string') return text;
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Test email functionality
   * @param {string} testRecipient - Test email address
   * @returns {Promise<Object>} Test result
   */
  async test(testRecipient) {
    if (!testRecipient) {
      throw new Error('Test recipient email address is required');
    }

    const testNotification = {
      id: 'test_' + Date.now(),
      title: 'SSH Notify Tool - Email Test',
      message: 'This is a test email notification. If you received this, email notifications are working correctly!',
      level: 'info',
      timestamp: new Date().toISOString(),
      options: {
        email: {
          to: [testRecipient],
          html: true
        }
      }
    };

    try {
      const result = await this.execute(testNotification);
      return {
        success: true,
        testRecipient,
        result
      };
    } catch (error) {
      return {
        success: false,
        testRecipient,
        error: error.message
      };
    }
  }

  /**
   * Get SMTP connection status
   * @returns {Promise<Object>} Connection status
   */
  async getConnectionStatus() {
    try {
      if (!this.transporter) {
        await this._initializeTransporter();
      }
      
      await this._verifyTransporter();
      
      return {
        connected: true,
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        user: this.config.smtp.auth.user,
        secure: this.config.smtp.secure || false
      };
      
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        host: this.config.smtp.host,
        port: this.config.smtp.port
      };
    }
  }

  /**
   * Close SMTP transporter
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.isTransporterValid = false;
    }
  }
}

module.exports = EmailHandler;