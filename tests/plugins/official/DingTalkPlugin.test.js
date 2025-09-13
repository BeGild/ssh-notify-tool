/**
 * @fileoverview Unit tests for DingTalkPlugin
 * Tests DingTalk webhook notification functionality with signature verification
 */

const DingTalkPlugin = require('../../../src/plugins/official/DingTalkPlugin');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock crypto for signature testing
const mockCrypto = {
  createHmac: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mocked-signature')
  }))
};

jest.mock('crypto', () => mockCrypto);

describe('DingTalkPlugin', () => {
  let plugin;
  let mockNotification;

  beforeEach(() => {
    plugin = new DingTalkPlugin({
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test-token',
      secret: 'test-secret'
    });
    mockNotification = global.testUtils.createMockNotification();
    jest.clearAllMocks();
  });

  describe('Metadata', () => {
    test('should have correct plugin metadata', () => {
      const metadata = DingTalkPlugin.metadata;

      expect(metadata.name).toBe('dingtalk');
      expect(metadata.displayName).toBe('DingTalk Notifications');
      expect(metadata.capabilities).toContain('text');
      expect(metadata.capabilities).toContain('markdown');
      expect(metadata.capabilities).toContain('mentions');
      expect(metadata.capabilities).toContain('links');
    });

    test('should have valid configuration schema', () => {
      const schema = DingTalkPlugin.metadata.configSchema;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('enabled');
      expect(schema.required).toContain('webhook');
      expect(schema.properties).toHaveProperty('enabled');
      expect(schema.properties).toHaveProperty('webhook');
      expect(schema.properties).toHaveProperty('secret');
    });
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const plugin = new DingTalkPlugin();

      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.msgtype).toBe('text');
      expect(plugin.config.timeout).toBe(5000);
    });

    test('should initialize with custom config', () => {
      const config = {
        enabled: true,
        webhook: 'https://oapi.dingtalk.com/robot/send?access_token=custom',
        secret: 'custom-secret',
        msgtype: 'markdown',
        timeout: 10000
      };

      const plugin = new DingTalkPlugin(config);

      expect(plugin.config.webhook).toBe('https://oapi.dingtalk.com/robot/send?access_token=custom');
      expect(plugin.config.secret).toBe('custom-secret');
      expect(plugin.config.msgtype).toBe('markdown');
      expect(plugin.config.timeout).toBe(10000);
    });
  });

  describe('Send Method', () => {
    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { errcode: 0, errmsg: 'ok' }
      });
    });

    test('should send text message successfully', async () => {
      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('DingTalk notification sent successfully');
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('https://oapi.dingtalk.com/robot/send'),
        expect.objectContaining({
          msgtype: 'text',
          text: expect.objectContaining({
            content: expect.stringContaining(mockNotification.message)
          })
        }),
        expect.objectContaining({
          timeout: 5000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    test('should include signature when secret is provided', async () => {
      plugin.config.secret = 'test-secret';

      await plugin.send(mockNotification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringMatching(/timestamp=\d+&sign=mocked-signature$/),
        expect.any(Object),
        expect.any(Object)
      );
      
      expect(mockCrypto.createHmac).toHaveBeenCalledWith('sha256', 'test-secret');
    });

    test('should send markdown message when msgtype is markdown', async () => {
      plugin.config.msgtype = 'markdown';

      const notification = {
        ...mockNotification,
        dingtalk: {
          title: 'Custom Title',
          text: '## Markdown Content\n- Item 1\n- Item 2'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'markdown',
          markdown: expect.objectContaining({
            title: 'Custom Title',
            text: '## Markdown Content\n- Item 1\n- Item 2'
          })
        }),
        expect.any(Object)
      );
    });

    test('should handle @mentions correctly', async () => {
      const notification = {
        ...mockNotification,
        dingtalk: {
          at: {
            atMobiles: ['13812345678', '13987654321'],
            atUserIds: ['user001', 'user002'],
            isAtAll: false
          }
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          at: {
            atMobiles: ['13812345678', '13987654321'],
            atUserIds: ['user001', 'user002'],
            isAtAll: false
          }
        }),
        expect.any(Object)
      );
    });

    test('should handle @all mentions', async () => {
      const notification = {
        ...mockNotification,
        dingtalk: {
          at: {
            isAtAll: true
          }
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          at: {
            isAtAll: true
          }
        }),
        expect.any(Object)
      );
    });

    test('should send link message type', async () => {
      plugin.config.msgtype = 'link';

      const notification = {
        ...mockNotification,
        dingtalk: {
          title: 'Link Title',
          text: 'Link description',
          messageUrl: 'https://example.com',
          picUrl: 'https://example.com/image.jpg'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'link',
          link: {
            title: 'Link Title',
            text: 'Link description',
            messageUrl: 'https://example.com',
            picUrl: 'https://example.com/image.jpg'
          }
        }),
        expect.any(Object)
      );
    });

    test('should send ActionCard message type', async () => {
      plugin.config.msgtype = 'actionCard';

      const notification = {
        ...mockNotification,
        dingtalk: {
          title: 'Action Card Title',
          text: 'Action card content',
          singleTitle: 'View Details',
          singleURL: 'https://example.com/details'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'actionCard',
          actionCard: {
            title: 'Action Card Title',
            text: 'Action card content',
            singleTitle: 'View Details',
            singleURL: 'https://example.com/details'
          }
        }),
        expect.any(Object)
      );
    });

    test('should handle ActionCard with multiple buttons', async () => {
      plugin.config.msgtype = 'actionCard';

      const notification = {
        ...mockNotification,
        dingtalk: {
          title: 'Multiple Buttons',
          text: 'Choose an action',
          btns: [
            { title: 'Approve', actionURL: 'https://example.com/approve' },
            { title: 'Reject', actionURL: 'https://example.com/reject' }
          ]
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'actionCard',
          actionCard: {
            title: 'Multiple Buttons',
            text: 'Choose an action',
            btns: [
              { title: 'Approve', actionURL: 'https://example.com/approve' },
              { title: 'Reject', actionURL: 'https://example.com/reject' }
            ]
          }
        }),
        expect.any(Object)
      );
    });

    test('should handle DingTalk API errors', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { errcode: 310000, errmsg: 'keywords not in content' }
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('DingTalk API error');
      expect(result.error).toBe('keywords not in content');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockedAxios.post.mockRejectedValue(networkError);

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('DingTalk notification failed');
      expect(result.error).toBe('Network timeout');
    });

    test('should fail when plugin is disabled', async () => {
      plugin.config.enabled = false;

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('DingTalk notifications are not available');
    });

    test('should validate webhook URL before sending', async () => {
      plugin.config.webhook = '';

      await expect(plugin.send(mockNotification)).rejects.toThrow('DingTalk webhook URL is required');
    });

    test('should format text message with metadata', async () => {
      const notification = {
        ...mockNotification,
        metadata: {
          source: 'test-app',
          environment: 'production',
          severity: 'high'
        }
      };

      await plugin.send(notification);

      const postedData = mockedAxios.post.mock.calls[0][1];
      expect(postedData.text.content).toContain('Source: test-app');
      expect(postedData.text.content).toContain('Environment: production');
      expect(postedData.text.content).toContain('Severity: high');
    });

    test('should format markdown message with metadata', async () => {
      plugin.config.msgtype = 'markdown';

      const notification = {
        ...mockNotification,
        metadata: {
          source: 'test-app',
          environment: 'production'
        }
      };

      await plugin.send(notification);

      const postedData = mockedAxios.post.mock.calls[0][1];
      expect(postedData.markdown.text).toContain('**Source:** test-app');
      expect(postedData.markdown.text).toContain('**Environment:** production');
    });
  });

  describe('Validation', () => {
    test('should validate correct configuration', async () => {
      const validConfig = {
        enabled: true,
        webhook: 'https://oapi.dingtalk.com/robot/send?access_token=valid-token',
        secret: 'valid-secret'
      };

      const result = await plugin.validate(validConfig);

      expect(result).toBe(true);
    });

    test('should reject configuration without webhook URL', async () => {
      const invalidConfig = {
        enabled: true,
        secret: 'valid-secret'
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should reject invalid webhook URL format', async () => {
      const invalidConfig = {
        enabled: true,
        webhook: 'invalid-url',
        secret: 'valid-secret'
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should validate webhook URL format', () => {
      expect(plugin._isValidWebhookUrl('https://oapi.dingtalk.com/robot/send?access_token=abc')).toBe(true);
      expect(plugin._isValidWebhookUrl('https://oapi.dingtalk.com/robot/send')).toBe(false);
      expect(plugin._isValidWebhookUrl('invalid-url')).toBe(false);
      expect(plugin._isValidWebhookUrl('')).toBe(false);
    });
  });

  describe('Availability', () => {
    test('should be available when enabled and configured', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = 'https://oapi.dingtalk.com/robot/send?access_token=test';

      const available = await plugin.isAvailable();

      expect(available).toBe(true);
    });

    test('should not be available when disabled', async () => {
      plugin.config.enabled = false;

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });

    test('should not be available when webhook not configured', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = '';

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status when available', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = 'https://oapi.dingtalk.com/robot/send?access_token=test';

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata).toHaveProperty('hasSecret');
      expect(health.metadata).toHaveProperty('msgtype');
    });

    test('should return unhealthy status when unavailable', async () => {
      plugin.config.enabled = false;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not available');
    });

    test('should indicate secret configuration in health check', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = 'https://oapi.dingtalk.com/robot/send?access_token=test';
      plugin.config.secret = 'test-secret';

      const health = await plugin.healthCheck();

      expect(health.metadata.hasSecret).toBe(true);
    });
  });

  describe('Signature Generation', () => {
    test('should generate correct signature', () => {
      const timestamp = 1634567890000;
      const secret = 'test-secret';
      
      plugin.config.secret = secret;
      plugin._generateSignature(timestamp);

      expect(mockCrypto.createHmac).toHaveBeenCalledWith('sha256', secret);
    });

    test('should not add signature when secret not provided', async () => {
      plugin.config.secret = '';

      await plugin.send(mockNotification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.not.stringMatching(/timestamp=\d+&sign=/),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Message Formatting', () => {
    test('should format text message correctly', () => {
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'error',
        metadata: { source: 'app' }
      };

      const formatted = plugin._formatTextMessage(notification);

      expect(formatted.content).toContain('🚨 Test Title');
      expect(formatted.content).toContain('Test message');
      expect(formatted.content).toContain('Source: app');
    });

    test('should format markdown message correctly', () => {
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'warning',
        metadata: { source: 'app' }
      };

      const formatted = plugin._formatMarkdownMessage(notification);

      expect(formatted.title).toBe('Test Title');
      expect(formatted.text).toContain('⚠️ **Test Title**');
      expect(formatted.text).toContain('Test message');
      expect(formatted.text).toContain('**Source:** app');
    });

    test('should use correct emoji for different levels', () => {
      const levels = [
        { level: 'info', emoji: 'ℹ️' },
        { level: 'success', emoji: '✅' },
        { level: 'warning', emoji: '⚠️' },
        { level: 'error', emoji: '🚨' }
      ];

      levels.forEach(({ level, emoji }) => {
        const notification = { ...mockNotification, level };
        const formatted = plugin._formatTextMessage(notification);
        expect(formatted.content).toContain(emoji);
      });
    });
  });

  describe('Retry Logic', () => {
    test('should retry on temporary failures', async () => {
      let attempts = 0;
      mockedAxios.post.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve({
          status: 200,
          data: { errcode: 0, errmsg: 'ok' }
        });
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Permanent failure'));

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3); // Default retry attempts
    });

    test('should not retry on authentication errors', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { errcode: 310000, errmsg: 'invalid access_token' }
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('Rate Limiting', () => {
    test('should respect rate limits', async () => {
      plugin.config.rateLimit = {
        maxRequests: 2,
        windowMs: 1000
      };

      // First two should succeed
      const result1 = await plugin.send(mockNotification);
      const result2 = await plugin.send(mockNotification);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Third should be rate limited
      const result3 = await plugin.send(mockNotification);

      expect(result3.success).toBe(false);
      expect(result3.message).toContain('rate limit');
    });

    test('should reset rate limit after window', async () => {
      plugin.config.rateLimit = {
        maxRequests: 1,
        windowMs: 100
      };

      // First should succeed
      const result1 = await plugin.send(mockNotification);
      expect(result1.success).toBe(true);

      // Second should be rate limited
      const result2 = await plugin.send(mockNotification);
      expect(result2.success).toBe(false);

      // Wait for rate limit window to reset
      await global.testUtils.sleep(150);

      // Third should succeed after reset
      const result3 = await plugin.send(mockNotification);
      expect(result3.success).toBe(true);
    });
  });
});