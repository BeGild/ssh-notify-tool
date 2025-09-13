/**
 * @fileoverview Unit tests for EmailPlugin
 * Tests SMTP email notification functionality with external service mocking
 */

const EmailPlugin = require('../../../src/plugins/builtin/EmailPlugin');

// Mock nodemailer
const mockTransporter = {
  sendMail: jest.fn()
};

jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => mockTransporter),
  createTransport: jest.fn(() => mockTransporter)
}));

const nodemailer = require('nodemailer');

describe('EmailPlugin', () => {
  let plugin;
  let mockNotification;

  beforeEach(() => {
    plugin = new EmailPlugin({
      enabled: true,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: 'testpass'
      },
      from: 'notifications@example.com'
    });
    mockNotification = global.testUtils.createMockNotification();
    jest.clearAllMocks();
  });

  describe('Metadata', () => {
    test('should have correct plugin metadata', () => {
      const metadata = EmailPlugin.metadata;

      expect(metadata.name).toBe('email');
      expect(metadata.displayName).toBe('Email Notifications');
      expect(metadata.capabilities).toContain('text');
      expect(metadata.capabilities).toContain('html');
      expect(metadata.capabilities).toContain('attachments');
    });

    test('should have valid configuration schema', () => {
      const schema = EmailPlugin.metadata.configSchema;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('enabled');
      expect(schema.required).toContain('smtpHost');
      expect(schema.properties).toHaveProperty('enabled');
      expect(schema.properties).toHaveProperty('smtpHost');
      expect(schema.properties).toHaveProperty('auth');
    });
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const plugin = new EmailPlugin();

      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.smtpPort).toBe(587);
      expect(plugin.config.secure).toBe(false);
    });

    test('should initialize with custom config', () => {
      const config = {
        enabled: true,
        smtpHost: 'smtp.custom.com',
        smtpPort: 465,
        secure: true,
        auth: {
          user: 'custom@example.com',
          pass: 'custompass'
        },
        from: 'custom@example.com'
      };

      const plugin = new EmailPlugin(config);

      expect(plugin.config.smtpHost).toBe('smtp.custom.com');
      expect(plugin.config.smtpPort).toBe(465);
      expect(plugin.config.secure).toBe(true);
      expect(plugin.config.auth.user).toBe('custom@example.com');
    });

    test('should create transporter correctly', () => {
      const plugin = new EmailPlugin({
        enabled: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        auth: { user: 'test@example.com', pass: 'testpass' }
      });

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: 'test@example.com', pass: 'testpass' }
      });
    });
  });

  describe('Send Method', () => {
    beforeEach(() => {
      mockTransporter.sendMail.mockImplementation((mailOptions, callback) => {
        callback(null, { messageId: 'test-message-id-123' });
      });
    });

    test('should send email notification successfully', async () => {
      const notification = {
        ...mockNotification,
        email: {
          to: 'recipient@example.com',
          subject: 'Test Subject'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email sent successfully');
      expect(result.metadata).toHaveProperty('messageId', 'test-message-id-123');
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'notifications@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: mockNotification.message,
        html: `<h3>${mockNotification.title}</h3><p>${mockNotification.message}</p>`
      }, expect.any(Function));
    });

    test('should handle custom email configuration in notification', async () => {
      const notification = {
        ...mockNotification,
        email: {
          to: 'custom@example.com',
          subject: 'Custom Subject',
          cc: ['cc1@example.com', 'cc2@example.com'],
          bcc: ['bcc@example.com'],
          replyTo: 'reply@example.com'
        }
      };

      await plugin.send(notification);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'custom@example.com',
          subject: 'Custom Subject',
          cc: ['cc1@example.com', 'cc2@example.com'],
          bcc: ['bcc@example.com'],
          replyTo: 'reply@example.com'
        }),
        expect.any(Function)
      );
    });

    test('should use default subject when not provided', async () => {
      const notification = {
        ...mockNotification,
        email: {
          to: 'recipient@example.com'
        }
      };

      await plugin.send(notification);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: mockNotification.title
        }),
        expect.any(Function)
      );
    });

    test('should handle custom HTML content', async () => {
      const notification = {
        ...mockNotification,
        email: {
          to: 'recipient@example.com',
          html: '<div>Custom HTML content</div>'
        }
      };

      await plugin.send(notification);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<div>Custom HTML content</div>'
        }),
        expect.any(Function)
      );
    });

    test('should handle email sending errors', async () => {
      const error = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockImplementation((mailOptions, callback) => {
        callback(error);
      });

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Email sending failed');
      expect(result.error).toBe('SMTP connection failed');
    });

    test('should fail when plugin is disabled', async () => {
      plugin.config.enabled = false;

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email notifications are not available');
    });

    test('should validate email configuration before sending', async () => {
      const notification = {
        ...mockNotification,
        email: {} // Missing 'to' field
      };

      await expect(plugin.send(notification)).rejects.toThrow('Email recipient (to) is required');
    });

    test('should handle multiple recipients', async () => {
      const notification = {
        ...mockNotification,
        email: {
          to: ['recipient1@example.com', 'recipient2@example.com'],
          subject: 'Test Subject'
        }
      };

      await plugin.send(notification);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['recipient1@example.com', 'recipient2@example.com']
        }),
        expect.any(Function)
      );
    });

    test('should include notification metadata in email', async () => {
      const notification = {
        ...mockNotification,
        metadata: {
          source: 'test-app',
          environment: 'production'
        },
        email: {
          to: 'recipient@example.com'
        }
      };

      await plugin.send(notification);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Source: test-app'),
          html: expect.stringContaining('<p><strong>Source:</strong> test-app</p>')
        }),
        expect.any(Function)
      );
    });
  });

  describe('Validation', () => {
    test('should validate correct configuration', async () => {
      const validConfig = {
        enabled: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        secure: false,
        auth: {
          user: 'valid@example.com',
          pass: 'validpass'
        },
        from: 'sender@example.com'
      };

      const result = await plugin.validate(validConfig);

      expect(result).toBe(true);
    });

    test('should reject configuration without SMTP host', async () => {
      const invalidConfig = {
        enabled: true,
        smtpPort: 587,
        auth: { user: 'test@example.com', pass: 'pass' }
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should reject configuration without authentication', async () => {
      const invalidConfig = {
        enabled: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should reject invalid port numbers', async () => {
      const invalidConfig = {
        enabled: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 100000, // Invalid port
        auth: { user: 'test@example.com', pass: 'pass' }
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should validate email addresses', () => {
      expect(plugin._isValidEmail('test@example.com')).toBe(true);
      expect(plugin._isValidEmail('user.name+tag@domain.com')).toBe(true);
      expect(plugin._isValidEmail('invalid-email')).toBe(false);
      expect(plugin._isValidEmail('missing@')).toBe(false);
      expect(plugin._isValidEmail('@missing.com')).toBe(false);
    });
  });

  describe('Availability', () => {
    test('should be available when enabled and configured', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = true;

      const available = await plugin.isAvailable();

      expect(available).toBe(true);
    });

    test('should not be available when disabled', async () => {
      plugin.config.enabled = false;

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });

    test('should not be available when not configured', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = false;

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });

    test('should check SMTP connection availability', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = true;
      
      // Mock transporter verify method
      mockTransporter.verify = jest.fn().mockImplementation((callback) => {
        callback(null, true);
      });

      const available = await plugin.isAvailable();

      expect(available).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    test('should handle SMTP connection failures', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = true;
      
      mockTransporter.verify = jest.fn().mockImplementation((callback) => {
        callback(new Error('Connection failed'));
      });

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status when available', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = true;
      mockTransporter.verify = jest.fn().mockImplementation((callback) => {
        callback(null, true);
      });

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata).toHaveProperty('smtpHost');
    });

    test('should return unhealthy status when unavailable', async () => {
      plugin.config.enabled = false;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not available');
    });

    test('should include connection status in health check', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = true;
      mockTransporter.verify = jest.fn().mockImplementation((callback) => {
        callback(new Error('Connection timeout'));
      });

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('Connection timeout');
    });
  });

  describe('Provider Presets', () => {
    test('should apply Gmail preset correctly', () => {
      const plugin = new EmailPlugin({
        enabled: true,
        provider: 'gmail',
        auth: { user: 'test@gmail.com', pass: 'pass' }
      });

      expect(plugin.config.smtpHost).toBe('smtp.gmail.com');
      expect(plugin.config.smtpPort).toBe(587);
      expect(plugin.config.secure).toBe(false);
    });

    test('should apply Outlook preset correctly', () => {
      const plugin = new EmailPlugin({
        enabled: true,
        provider: 'outlook',
        auth: { user: 'test@outlook.com', pass: 'pass' }
      });

      expect(plugin.config.smtpHost).toBe('smtp-mail.outlook.com');
      expect(plugin.config.smtpPort).toBe(587);
      expect(plugin.config.secure).toBe(false);
    });

    test('should apply Yahoo preset correctly', () => {
      const plugin = new EmailPlugin({
        enabled: true,
        provider: 'yahoo',
        auth: { user: 'test@yahoo.com', pass: 'pass' }
      });

      expect(plugin.config.smtpHost).toBe('smtp.mail.yahoo.com');
      expect(plugin.config.smtpPort).toBe(587);
      expect(plugin.config.secure).toBe(false);
    });

    test('should use custom config when provider not specified', () => {
      const plugin = new EmailPlugin({
        enabled: true,
        smtpHost: 'custom.smtp.com',
        smtpPort: 465,
        secure: true,
        auth: { user: 'test@custom.com', pass: 'pass' }
      });

      expect(plugin.config.smtpHost).toBe('custom.smtp.com');
      expect(plugin.config.smtpPort).toBe(465);
      expect(plugin.config.secure).toBe(true);
    });
  });

  describe('Retry Logic', () => {
    test('should retry on temporary SMTP failures', async () => {
      let attempts = 0;
      mockTransporter.sendMail.mockImplementation((mailOptions, callback) => {
        attempts++;
        if (attempts < 3) {
          callback(new Error('Temporary failure'));
        } else {
          callback(null, { messageId: 'success-after-retry' });
        }
      });

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      mockTransporter.sendMail.mockImplementation((mailOptions, callback) => {
        callback(new Error('Permanent failure'));
      });

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3); // Default retry attempts
    });

    test('should not retry on authentication errors', async () => {
      const authError = new Error('Invalid login');
      authError.code = 'EAUTH';
      
      mockTransporter.sendMail.mockImplementation((mailOptions, callback) => {
        callback(authError);
      });

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('Rate Limiting', () => {
    test('should respect rate limits', async () => {
      plugin.config.rateLimit = {
        maxEmails: 2,
        windowMs: 1000
      };

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      // First two should succeed
      const result1 = await plugin.send(notification);
      const result2 = await plugin.send(notification);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Third should be rate limited
      const result3 = await plugin.send(notification);

      expect(result3.success).toBe(false);
      expect(result3.message).toContain('rate limit');
    });

    test('should reset rate limit after window', async () => {
      plugin.config.rateLimit = {
        maxEmails: 1,
        windowMs: 100
      };

      const notification = {
        ...mockNotification,
        email: { to: 'recipient@example.com' }
      };

      // First should succeed
      const result1 = await plugin.send(notification);
      expect(result1.success).toBe(true);

      // Second should be rate limited
      const result2 = await plugin.send(notification);
      expect(result2.success).toBe(false);

      // Wait for rate limit window to reset
      await global.testUtils.sleep(150);

      // Third should succeed after reset
      const result3 = await plugin.send(notification);
      expect(result3.success).toBe(true);
    });
  });
});