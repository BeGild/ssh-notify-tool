/**
 * @fileoverview Unit tests for WeChatWorkPlugin
 * Tests WeChat Work webhook notification functionality
 */

const WeChatWorkPlugin = require('../../../src/plugins/official/WeChatWorkPlugin');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('WeChatWorkPlugin', () => {
  let plugin;
  let mockNotification;

  beforeEach(() => {
    plugin = new WeChatWorkPlugin({
      enabled: true,
      webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key'
    });
    mockNotification = global.testUtils.createMockNotification();
    jest.clearAllMocks();
  });

  describe('Metadata', () => {
    test('should have correct plugin metadata', () => {
      const metadata = WeChatWorkPlugin.metadata;

      expect(metadata.name).toBe('wechatwork');
      expect(metadata.displayName).toBe('WeChat Work Notifications');
      expect(metadata.capabilities).toContain('text');
      expect(metadata.capabilities).toContain('markdown');
      expect(metadata.capabilities).toContain('mentions');
      expect(metadata.capabilities).toContain('images');
    });

    test('should have valid configuration schema', () => {
      const schema = WeChatWorkPlugin.metadata.configSchema;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('enabled');
      expect(schema.required).toContain('webhook');
      expect(schema.properties).toHaveProperty('enabled');
      expect(schema.properties).toHaveProperty('webhook');
    });
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const plugin = new WeChatWorkPlugin();

      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.msgtype).toBe('text');
      expect(plugin.config.timeout).toBe(5000);
    });

    test('should initialize with custom config', () => {
      const config = {
        enabled: true,
        webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=custom',
        msgtype: 'markdown',
        timeout: 10000
      };

      const plugin = new WeChatWorkPlugin(config);

      expect(plugin.config.webhook).toBe('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=custom');
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
      expect(result.message).toBe('WeChat Work notification sent successfully');
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key',
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

    test('should send markdown message when msgtype is markdown', async () => {
      plugin.config.msgtype = 'markdown';

      const notification = {
        ...mockNotification,
        wechatwork: {
          content: '## Markdown Content\n- Item 1\n- Item 2'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'markdown',
          markdown: expect.objectContaining({
            content: '## Markdown Content\n- Item 1\n- Item 2'
          })
        }),
        expect.any(Object)
      );
    });

    test('should handle @mentions correctly', async () => {
      const notification = {
        ...mockNotification,
        wechatwork: {
          mentioned_list: ['user001', 'user002'],
          mentioned_mobile_list: ['13812345678', '13987654321']
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.objectContaining({
            mentioned_list: ['user001', 'user002'],
            mentioned_mobile_list: ['13812345678', '13987654321']
          })
        }),
        expect.any(Object)
      );
    });

    test('should handle @all mentions', async () => {
      const notification = {
        ...mockNotification,
        wechatwork: {
          mentioned_list: ['@all']
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.objectContaining({
            mentioned_list: ['@all']
          })
        }),
        expect.any(Object)
      );
    });

    test('should send image message type', async () => {
      plugin.config.msgtype = 'image';

      const notification = {
        ...mockNotification,
        wechatwork: {
          base64: 'base64-encoded-image-data',
          md5: 'image-md5-hash'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'image',
          image: {
            base64: 'base64-encoded-image-data',
            md5: 'image-md5-hash'
          }
        }),
        expect.any(Object)
      );
    });

    test('should send news message type', async () => {
      plugin.config.msgtype = 'news';

      const notification = {
        ...mockNotification,
        wechatwork: {
          articles: [
            {
              title: 'Article 1',
              description: 'Description 1',
              url: 'https://example.com/article1',
              picurl: 'https://example.com/pic1.jpg'
            },
            {
              title: 'Article 2',
              description: 'Description 2',
              url: 'https://example.com/article2',
              picurl: 'https://example.com/pic2.jpg'
            }
          ]
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'news',
          news: {
            articles: [
              {
                title: 'Article 1',
                description: 'Description 1',
                url: 'https://example.com/article1',
                picurl: 'https://example.com/pic1.jpg'
              },
              {
                title: 'Article 2',
                description: 'Description 2',
                url: 'https://example.com/article2',
                picurl: 'https://example.com/pic2.jpg'
              }
            ]
          }
        }),
        expect.any(Object)
      );
    });

    test('should send file message type', async () => {
      plugin.config.msgtype = 'file';

      const notification = {
        ...mockNotification,
        wechatwork: {
          media_id: 'media123456'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msgtype: 'file',
          file: {
            media_id: 'media123456'
          }
        }),
        expect.any(Object)
      );
    });

    test('should handle WeChat Work API errors', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { errcode: 93000, errmsg: 'invalid webhook url' }
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('WeChat Work API error');
      expect(result.error).toBe('invalid webhook url');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockedAxios.post.mockRejectedValue(networkError);

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('WeChat Work notification failed');
      expect(result.error).toBe('Network timeout');
    });

    test('should fail when plugin is disabled', async () => {
      plugin.config.enabled = false;

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('WeChat Work notifications are not available');
    });

    test('should validate webhook URL before sending', async () => {
      plugin.config.webhook = '';

      await expect(plugin.send(mockNotification)).rejects.toThrow('WeChat Work webhook URL is required');
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
      expect(postedData.markdown.content).toContain('**Source:** test-app');
      expect(postedData.markdown.content).toContain('**Environment:** production');
    });
  });

  describe('Validation', () => {
    test('should validate correct configuration', async () => {
      const validConfig = {
        enabled: true,
        webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=valid-key'
      };

      const result = await plugin.validate(validConfig);

      expect(result).toBe(true);
    });

    test('should reject configuration without webhook URL', async () => {
      const invalidConfig = {
        enabled: true
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should reject invalid webhook URL format', async () => {
      const invalidConfig = {
        enabled: true,
        webhook: 'invalid-url'
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should validate webhook URL format', () => {
      expect(plugin._isValidWebhookUrl('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc')).toBe(true);
      expect(plugin._isValidWebhookUrl('https://qyapi.weixin.qq.com/cgi-bin/webhook/send')).toBe(false);
      expect(plugin._isValidWebhookUrl('invalid-url')).toBe(false);
      expect(plugin._isValidWebhookUrl('')).toBe(false);
    });

    test('should reject invalid message type', async () => {
      const invalidConfig = {
        enabled: true,
        webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
        msgtype: 'invalid'
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });
  });

  describe('Availability', () => {
    test('should be available when enabled and configured', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test';

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
      plugin.config.webhook = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test';

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata).toHaveProperty('msgtype');
    });

    test('should return unhealthy status when unavailable', async () => {
      plugin.config.enabled = false;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not available');
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

      expect(formatted.content).toContain('⚠️ **Test Title**');
      expect(formatted.content).toContain('Test message');
      expect(formatted.content).toContain('**Source:** app');
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

    test('should handle long messages correctly', () => {
      const longMessage = 'A'.repeat(5000); // Exceed WeChat Work limit
      const notification = {
        ...mockNotification,
        message: longMessage
      };

      const formatted = plugin._formatTextMessage(notification);
      expect(formatted.content.length).toBeLessThanOrEqual(4096); // WeChat Work limit
      expect(formatted.content).toContain('...');
    });

    test('should format mentions in text content', () => {
      const notification = {
        ...mockNotification,
        wechatwork: {
          mentioned_list: ['user001'],
          mentioned_mobile_list: ['13812345678']
        }
      };

      const formatted = plugin._formatTextMessage(notification);
      expect(formatted.mentioned_list).toEqual(['user001']);
      expect(formatted.mentioned_mobile_list).toEqual(['13812345678']);
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
        data: { errcode: 93000, errmsg: 'invalid webhook url' }
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

  describe('File and Media Support', () => {
    test('should validate base64 image format', () => {
      expect(plugin._isValidBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')).toBe(true);
      expect(plugin._isValidBase64('invalid-base64')).toBe(false);
      expect(plugin._isValidBase64('')).toBe(false);
    });

    test('should validate media ID format', () => {
      expect(plugin._isValidMediaId('3a040f5e-6b3c-4a3a-bc24-6a8c8d3e3e3e')).toBe(true);
      expect(plugin._isValidMediaId('media123')).toBe(true);
      expect(plugin._isValidMediaId('')).toBe(false);
      expect(plugin._isValidMediaId('invalid media id with spaces')).toBe(false);
    });

    test('should validate news articles format', () => {
      const validArticles = [
        {
          title: 'Article 1',
          description: 'Description 1',
          url: 'https://example.com/article1'
        }
      ];

      const invalidArticles = [
        {
          // Missing title
          description: 'Description 1',
          url: 'https://example.com/article1'
        }
      ];

      expect(plugin._validateArticles(validArticles)).toBe(true);
      expect(plugin._validateArticles(invalidArticles)).toBe(false);
    });

    test('should limit number of articles in news message', async () => {
      plugin.config.msgtype = 'news';

      const manyArticles = Array.from({ length: 10 }, (_, i) => ({
        title: `Article ${i + 1}`,
        description: `Description ${i + 1}`,
        url: `https://example.com/article${i + 1}`
      }));

      const notification = {
        ...mockNotification,
        wechatwork: {
          articles: manyArticles
        }
      };

      await plugin.send(notification);

      const postedData = mockedAxios.post.mock.calls[0][1];
      expect(postedData.news.articles).toHaveLength(8); // WeChat Work limit
    });
  });
});