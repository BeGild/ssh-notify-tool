/**
 * @fileoverview Unit tests for SmsPlugin
 * Tests SMS notification functionality with provider mocking (Twilio, Aliyun)
 */

const SmsPlugin = require('../../../src/plugins/builtin/SmsPlugin');

// Mock Twilio
const mockTwilioClient = {
  messages: {
    create: jest.fn()
  }
};

jest.mock('twilio', () => {
  return jest.fn(() => mockTwilioClient);
});

// Mock Aliyun Core
const mockAliyunClient = {
  request: jest.fn()
};

jest.mock('@alicloud/pop-core', () => {
  return jest.fn().mockImplementation(() => mockAliyunClient);
});

const twilio = require('twilio');

describe('SmsPlugin', () => {
  let plugin;
  let mockNotification;

  beforeEach(() => {
    plugin = new SmsPlugin({
      enabled: true,
      provider: 'twilio',
      config: {
        accountSid: 'test-account-sid',
        authToken: 'test-auth-token',
        fromNumber: '+1234567890'
      }
    });
    mockNotification = global.testUtils.createMockNotification();
    jest.clearAllMocks();
  });

  describe('Metadata', () => {
    test('should have correct plugin metadata', () => {
      const metadata = SmsPlugin.metadata;

      expect(metadata.name).toBe('sms');
      expect(metadata.displayName).toBe('SMS Notifications');
      expect(metadata.capabilities).toContain('text');
      expect(metadata.capabilities).toContain('international');
    });

    test('should have valid configuration schema', () => {
      const schema = SmsPlugin.metadata.configSchema;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('enabled');
      expect(schema.required).toContain('provider');
      expect(schema.properties).toHaveProperty('enabled');
      expect(schema.properties).toHaveProperty('provider');
      expect(schema.properties).toHaveProperty('config');
    });
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const plugin = new SmsPlugin();

      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.provider).toBe('twilio');
      expect(plugin.config.maxLength).toBe(160);
    });

    test('should initialize Twilio provider correctly', () => {
      const config = {
        enabled: true,
        provider: 'twilio',
        config: {
          accountSid: 'test-sid',
          authToken: 'test-token',
          fromNumber: '+1234567890'
        }
      };

      const plugin = new SmsPlugin(config);

      expect(plugin.provider).toBe('twilio');
      expect(twilio).toHaveBeenCalledWith('test-sid', 'test-token');
    });

    test('should initialize Aliyun provider correctly', () => {
      const config = {
        enabled: true,
        provider: 'aliyun',
        config: {
          accessKeyId: 'test-access-key',
          accessKeySecret: 'test-secret',
          endpoint: 'https://dysmsapi.aliyuncs.com',
          signName: 'TestSign'
        }
      };

      const plugin = new SmsPlugin(config);

      expect(plugin.provider).toBe('aliyun');
      expect(plugin.aliyunClient).toBeDefined();
    });

    test('should throw error for unsupported provider', () => {
      const config = {
        enabled: true,
        provider: 'unsupported',
        config: {}
      };

      expect(() => new SmsPlugin(config)).toThrow('Unsupported SMS provider: unsupported');
    });
  });

  describe('Twilio Provider', () => {
    beforeEach(() => {
      mockTwilioClient.messages.create.mockResolvedValue({
        sid: 'test-message-sid',
        status: 'queued'
      });
    });

    test('should send SMS via Twilio successfully', async () => {
      const notification = {
        ...mockNotification,
        sms: {
          to: '+1987654321',
          message: 'Test SMS message'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('SMS sent successfully via twilio');
      expect(result.metadata).toHaveProperty('messageId', 'test-message-sid');
      
      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: 'Test SMS message',
        from: '+1234567890',
        to: '+1987654321'
      });
    });

    test('should use notification message when sms.message not provided', async () => {
      const notification = {
        ...mockNotification,
        sms: {
          to: '+1987654321'
        }
      };

      await plugin.send(notification);

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: mockNotification.message,
        from: '+1234567890',
        to: '+1987654321'
      });
    });

    test('should truncate long messages', async () => {
      const longMessage = 'A'.repeat(200);
      const notification = {
        ...mockNotification,
        sms: {
          to: '+1987654321',
          message: longMessage
        }
      };

      await plugin.send(notification);

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: 'A'.repeat(157) + '...', // 160 char limit with ...
        from: '+1234567890',
        to: '+1987654321'
      });
    });

    test('should handle Twilio API errors', async () => {
      const twilioError = new Error('Invalid phone number');
      twilioError.code = 21211;
      
      mockTwilioClient.messages.create.mockRejectedValue(twilioError);

      const notification = {
        ...mockNotification,
        sms: {
          to: '+1987654321',
          message: 'Test message'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('SMS sending failed');
      expect(result.error).toBe('Invalid phone number');
    });

    test('should handle custom from number in notification', async () => {
      const notification = {
        ...mockNotification,
        sms: {
          to: '+1987654321',
          from: '+1111111111',
          message: 'Test message'
        }
      };

      await plugin.send(notification);

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: 'Test message',
        from: '+1111111111',
        to: '+1987654321'
      });
    });
  });

  describe('Aliyun Provider', () => {
    beforeEach(() => {
      plugin = new SmsPlugin({
        enabled: true,
        provider: 'aliyun',
        config: {
          accessKeyId: 'test-access-key',
          accessKeySecret: 'test-secret',
          endpoint: 'https://dysmsapi.aliyuncs.com',
          signName: 'TestSign',
          templateCode: 'SMS_123456789'
        }
      });

      mockAliyunClient.request.mockResolvedValue({
        Code: 'OK',
        Message: 'OK',
        BizId: 'test-biz-id'
      });
    });

    test('should send SMS via Aliyun successfully', async () => {
      const notification = {
        ...mockNotification,
        sms: {
          to: '+8613812345678',
          templateParams: {
            code: '123456',
            product: 'TestApp'
          }
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('SMS sent successfully via aliyun');
      expect(result.metadata).toHaveProperty('bizId', 'test-biz-id');
      
      expect(mockAliyunClient.request).toHaveBeenCalledWith('SendSms', {
        PhoneNumbers: '+8613812345678',
        SignName: 'TestSign',
        TemplateCode: 'SMS_123456789',
        TemplateParam: JSON.stringify({
          code: '123456',
          product: 'TestApp'
        })
      }, { method: 'POST' });
    });

    test('should use default template params when not provided', async () => {
      const notification = {
        ...mockNotification,
        sms: {
          to: '+8613812345678'
        }
      };

      await plugin.send(notification);

      expect(mockAliyunClient.request).toHaveBeenCalledWith('SendSms', {
        PhoneNumbers: '+8613812345678',
        SignName: 'TestSign',
        TemplateCode: 'SMS_123456789',
        TemplateParam: JSON.stringify({
          title: mockNotification.title,
          message: mockNotification.message
        })
      }, { method: 'POST' });
    });

    test('should handle Aliyun API errors', async () => {
      mockAliyunClient.request.mockResolvedValue({
        Code: 'isv.BUSINESS_LIMIT_CONTROL',
        Message: 'Business limit control'
      });

      const notification = {
        ...mockNotification,
        sms: {
          to: '+8613812345678'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('SMS sending failed');
      expect(result.error).toBe('Business limit control');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockAliyunClient.request.mockRejectedValue(networkError);

      const notification = {
        ...mockNotification,
        sms: {
          to: '+8613812345678'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('SMS sending failed');
      expect(result.error).toBe('Network timeout');
    });
  });

  describe('Common Functionality', () => {
    test('should fail when plugin is disabled', async () => {
      plugin.config.enabled = false;

      const notification = {
        ...mockNotification,
        sms: { to: '+1987654321' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('SMS notifications are not available');
    });

    test('should validate phone number before sending', async () => {
      const notification = {
        ...mockNotification,
        sms: {} // Missing 'to' field
      };

      await expect(plugin.send(notification)).rejects.toThrow('SMS recipient phone number (to) is required');
    });

    test('should validate phone number format', () => {
      expect(plugin._isValidPhoneNumber('+1234567890')).toBe(true);
      expect(plugin._isValidPhoneNumber('+8613812345678')).toBe(true);
      expect(plugin._isValidPhoneNumber('invalid-phone')).toBe(false);
      expect(plugin._isValidPhoneNumber('1234567890')).toBe(false); // Missing +
      expect(plugin._isValidPhoneNumber('')).toBe(false);
    });

    test('should normalize phone numbers', () => {
      expect(plugin._normalizePhoneNumber('1234567890')).toBe('+1234567890');
      expect(plugin._normalizePhoneNumber('+1234567890')).toBe('+1234567890');
      expect(plugin._normalizePhoneNumber('86-138-1234-5678')).toBe('+8613812345678');
      expect(plugin._normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
    });
  });

  describe('Validation', () => {
    test('should validate correct Twilio configuration', async () => {
      const validConfig = {
        enabled: true,
        provider: 'twilio',
        config: {
          accountSid: 'ACtest123',
          authToken: 'token123',
          fromNumber: '+1234567890'
        }
      };

      const result = await plugin.validate(validConfig);

      expect(result).toBe(true);
    });

    test('should validate correct Aliyun configuration', async () => {
      const validConfig = {
        enabled: true,
        provider: 'aliyun',
        config: {
          accessKeyId: 'LTAI123',
          accessKeySecret: 'secret123',
          signName: 'TestSign',
          templateCode: 'SMS_123456789'
        }
      };

      const plugin = new SmsPlugin();
      const result = await plugin.validate(validConfig);

      expect(result).toBe(true);
    });

    test('should reject configuration without required fields', async () => {
      const invalidConfig = {
        enabled: true,
        provider: 'twilio',
        config: {
          accountSid: 'ACtest123'
          // Missing authToken and fromNumber
        }
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should reject invalid provider', async () => {
      const invalidConfig = {
        enabled: true,
        provider: 'invalid-provider',
        config: {}
      };

      const plugin = new SmsPlugin();
      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
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
  });

  describe('Health Check', () => {
    test('should return healthy status when available', async () => {
      plugin.config.enabled = true;
      plugin.isConfigured = true;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata).toHaveProperty('provider', 'twilio');
    });

    test('should return unhealthy status when unavailable', async () => {
      plugin.config.enabled = false;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not available');
    });
  });

  describe('Rate Limiting', () => {
    test('should respect rate limits', async () => {
      plugin.config.rateLimit = {
        maxMessages: 2,
        windowMs: 1000
      };

      const notification = {
        ...mockNotification,
        sms: { to: '+1987654321' }
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
        maxMessages: 1,
        windowMs: 100
      };

      const notification = {
        ...mockNotification,
        sms: { to: '+1987654321' }
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

  describe('Retry Logic', () => {
    test('should retry on temporary failures', async () => {
      let attempts = 0;
      mockTwilioClient.messages.create.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Service temporarily unavailable');
        }
        return Promise.resolve({ sid: 'success-after-retry', status: 'queued' });
      });

      const notification = {
        ...mockNotification,
        sms: { to: '+1987654321' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      mockTwilioClient.messages.create.mockRejectedValue(new Error('Permanent failure'));

      const notification = {
        ...mockNotification,
        sms: { to: '+1987654321' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(3); // Default retry attempts
    });

    test('should not retry on authentication errors', async () => {
      const authError = new Error('Authentication failed');
      authError.code = 20003;
      
      mockTwilioClient.messages.create.mockRejectedValue(authError);

      const notification = {
        ...mockNotification,
        sms: { to: '+1987654321' }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(false);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('Multiple Recipients', () => {
    test('should handle multiple recipients for Twilio', async () => {
      const notification = {
        ...mockNotification,
        sms: {
          to: ['+1987654321', '+1987654322'],
          message: 'Test message'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(2);
      expect(mockTwilioClient.messages.create).toHaveBeenNthCalledWith(1, {
        body: 'Test message',
        from: '+1234567890',
        to: '+1987654321'
      });
      expect(mockTwilioClient.messages.create).toHaveBeenNthCalledWith(2, {
        body: 'Test message',
        from: '+1234567890',
        to: '+1987654322'
      });
    });

    test('should handle partial failures with multiple recipients', async () => {
      mockTwilioClient.messages.create
        .mockResolvedValueOnce({ sid: 'success1', status: 'queued' })
        .mockRejectedValueOnce(new Error('Invalid phone number'));

      const notification = {
        ...mockNotification,
        sms: {
          to: ['+1987654321', '+1999999999'],
          message: 'Test message'
        }
      };

      const result = await plugin.send(notification);

      expect(result.success).toBe(true); // Partial success
      expect(result.metadata.results).toHaveLength(2);
      expect(result.metadata.results[0].success).toBe(true);
      expect(result.metadata.results[1].success).toBe(false);
    });
  });
});