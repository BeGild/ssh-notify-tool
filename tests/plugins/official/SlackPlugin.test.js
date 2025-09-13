/**
 * @fileoverview Unit tests for SlackPlugin
 * Tests Slack webhook notification functionality with rich formatting
 */

const SlackPlugin = require('../../../src/plugins/official/SlackPlugin');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('SlackPlugin', () => {
  let plugin;
  let mockNotification;

  beforeEach(() => {
    plugin = new SlackPlugin({
      enabled: true,
      webhook: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
      channel: '#notifications',
      username: 'NotifyBot'
    });
    mockNotification = global.testUtils.createMockNotification();
    jest.clearAllMocks();
  });

  describe('Metadata', () => {
    test('should have correct plugin metadata', () => {
      const metadata = SlackPlugin.metadata;

      expect(metadata.name).toBe('slack');
      expect(metadata.displayName).toBe('Slack Notifications');
      expect(metadata.capabilities).toContain('text');
      expect(metadata.capabilities).toContain('rich_formatting');
      expect(metadata.capabilities).toContain('attachments');
      expect(metadata.capabilities).toContain('buttons');
      expect(metadata.capabilities).toContain('threads');
    });

    test('should have valid configuration schema', () => {
      const schema = SlackPlugin.metadata.configSchema;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('enabled');
      expect(schema.required).toContain('webhook');
      expect(schema.properties).toHaveProperty('enabled');
      expect(schema.properties).toHaveProperty('webhook');
      expect(schema.properties).toHaveProperty('channel');
    });
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const plugin = new SlackPlugin();

      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.username).toBe('NotifyBot');
      expect(plugin.config.timeout).toBe(5000);
      expect(plugin.config.iconEmoji).toBe(':bell:');
    });

    test('should initialize with custom config', () => {
      const config = {
        enabled: true,
        webhook: 'https://hooks.slack.com/services/custom',
        channel: '#custom-channel',
        username: 'CustomBot',
        iconEmoji: ':warning:',
        timeout: 10000
      };

      const plugin = new SlackPlugin(config);

      expect(plugin.config.webhook).toBe('https://hooks.slack.com/services/custom');
      expect(plugin.config.channel).toBe('#custom-channel');
      expect(plugin.config.username).toBe('CustomBot');
      expect(plugin.config.iconEmoji).toBe(':warning:');
      expect(plugin.config.timeout).toBe(10000);
    });
  });

  describe('Send Method', () => {
    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: 'ok'
      });
    });

    test('should send simple text message successfully', async () => {
      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Slack notification sent successfully');
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
        expect.objectContaining({
          channel: '#notifications',
          username: 'NotifyBot',
          icon_emoji: ':bell:',
          text: expect.stringContaining(mockNotification.title)
        }),
        expect.objectContaining({
          timeout: 5000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    test('should send rich message with attachments', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          text: 'Custom message text',
          attachments: [
            {
              color: 'danger',
              title: 'Error Details',
              text: 'Something went wrong',
              fields: [
                {
                  title: 'Error Code',
                  value: '500',
                  short: true
                },
                {
                  title: 'Timestamp',
                  value: '2023-01-01 12:00:00',
                  short: true
                }
              ]
            }
          ]
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: 'Custom message text',
          attachments: [
            expect.objectContaining({
              color: 'danger',
              title: 'Error Details',
              text: 'Something went wrong',
              fields: [
                {
                  title: 'Error Code',
                  value: '500',
                  short: true
                },
                {
                  title: 'Timestamp',
                  value: '2023-01-01 12:00:00',
                  short: true
                }
              ]
            })
          ]
        }),
        expect.any(Object)
      );
    });

    test('should send message with blocks (new format)', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Alert:* Something needs attention'
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Acknowledge'
                  },
                  value: 'acknowledge',
                  action_id: 'acknowledge_button'
                }
              ]
            }
          ]
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Alert:* Something needs attention'
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Acknowledge'
                  },
                  value: 'acknowledge',
                  action_id: 'acknowledge_button'
                }
              ]
            }
          ]
        }),
        expect.any(Object)
      );
    });

    test('should send threaded message', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          thread_ts: '1234567890.123456'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          thread_ts: '1234567890.123456'
        }),
        expect.any(Object)
      );
    });

    test('should handle custom channel override', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          channel: '@john.doe',
          text: 'Direct message'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: '@john.doe',
          text: 'Direct message'
        }),
        expect.any(Object)
      );
    });

    test('should handle custom username and icon', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          username: 'AlertBot',
          icon_url: 'https://example.com/bot-icon.png'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          username: 'AlertBot',
          icon_url: 'https://example.com/bot-icon.png'
        }),
        expect.any(Object)
      );
    });

    test('should handle Slack API errors', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: 'channel_not_found'
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Slack API error');
      expect(result.error).toBe('channel_not_found');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockedAxios.post.mockRejectedValue(networkError);

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Slack notification failed');
      expect(result.error).toBe('Network timeout');
    });

    test('should fail when plugin is disabled', async () => {
      plugin.config.enabled = false;

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Slack notifications are not available');
    });

    test('should validate webhook URL before sending', async () => {
      plugin.config.webhook = '';

      await expect(plugin.send(mockNotification)).rejects.toThrow('Slack webhook URL is required');
    });

    test('should format message with metadata', async () => {
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
      expect(postedData.text).toContain('Source: test-app');
      expect(postedData.text).toContain('Environment: production');
      expect(postedData.text).toContain('Severity: high');
    });

    test('should auto-generate attachment with color based on level', async () => {
      const errorNotification = {
        ...mockNotification,
        level: 'error'
      };

      await plugin.send(errorNotification);

      const postedData = mockedAxios.post.mock.calls[0][1];
      expect(postedData.attachments).toBeDefined();
      expect(postedData.attachments[0].color).toBe('danger');
    });

    test('should use different colors for different levels', async () => {
      const levels = [
        { level: 'error', color: 'danger' },
        { level: 'warning', color: 'warning' },
        { level: 'success', color: 'good' },
        { level: 'info', color: '#439FE0' }
      ];

      for (const { level, color } of levels) {
        const notification = { ...mockNotification, level };
        await plugin.send(notification);

        const postedData = mockedAxios.post.mock.calls[mockedAxios.post.mock.calls.length - 1][1];
        expect(postedData.attachments[0].color).toBe(color);
      }
    });
  });

  describe('Validation', () => {
    test('should validate correct configuration', async () => {
      const validConfig = {
        enabled: true,
        webhook: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'
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
      expect(plugin._isValidWebhookUrl('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX')).toBe(true);
      expect(plugin._isValidWebhookUrl('https://hooks.slack.com/services/invalid')).toBe(false);
      expect(plugin._isValidWebhookUrl('invalid-url')).toBe(false);
      expect(plugin._isValidWebhookUrl('')).toBe(false);
    });

    test('should validate channel format', () => {
      expect(plugin._isValidChannel('#general')).toBe(true);
      expect(plugin._isValidChannel('@username')).toBe(true);
      expect(plugin._isValidChannel('C1234567890')).toBe(true); // Channel ID
      expect(plugin._isValidChannel('D1234567890')).toBe(true); // DM ID
      expect(plugin._isValidChannel('invalid-channel')).toBe(false);
      expect(plugin._isValidChannel('')).toBe(false);
    });

    test('should validate attachment structure', () => {
      const validAttachment = {
        color: 'good',
        title: 'Test Title',
        text: 'Test text'
      };

      const invalidAttachment = {
        invalid_field: 'value'
      };

      expect(plugin._validateAttachment(validAttachment)).toBe(true);
      expect(plugin._validateAttachment(invalidAttachment)).toBe(true); // Slack is flexible
    });

    test('should validate blocks structure', () => {
      const validBlocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Test text'
          }
        }
      ];

      const invalidBlocks = [
        {
          type: 'invalid_block_type'
        }
      ];

      expect(plugin._validateBlocks(validBlocks)).toBe(true);
      expect(plugin._validateBlocks(invalidBlocks)).toBe(false);
    });
  });

  describe('Availability', () => {
    test('should be available when enabled and configured', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';

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
      plugin.config.webhook = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata).toHaveProperty('channel');
      expect(health.metadata).toHaveProperty('username');
    });

    test('should return unhealthy status when unavailable', async () => {
      plugin.config.enabled = false;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not available');
    });
  });

  describe('Message Formatting', () => {
    test('should format simple text message correctly', () => {
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'error',
        metadata: { source: 'app' }
      };

      const formatted = plugin._formatMessage(notification);

      expect(formatted.text).toContain('🚨 Test Title');
      expect(formatted.text).toContain('Test message');
      expect(formatted.text).toContain('Source: app');
    });

    test('should create attachment from notification', () => {
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        level: 'warning',
        metadata: { 
          source: 'app',
          timestamp: '2023-01-01 12:00:00'
        }
      };

      const attachment = plugin._createAttachment(notification);

      expect(attachment.color).toBe('warning');
      expect(attachment.title).toBe('Test Title');
      expect(attachment.text).toBe('Test message');
      expect(attachment.fields).toEqual([
        { title: 'Source', value: 'app', short: true },
        { title: 'Timestamp', value: '2023-01-01 12:00:00', short: true }
      ]);
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
        const formatted = plugin._formatMessage(notification);
        expect(formatted.text).toContain(emoji);
      });
    });

    test('should truncate long messages', () => {
      const longMessage = 'A'.repeat(5000); // Exceed Slack limit
      const notification = {
        ...mockNotification,
        message: longMessage
      };

      const formatted = plugin._formatMessage(notification);
      expect(formatted.text.length).toBeLessThanOrEqual(4000); // Slack limit
      expect(formatted.text).toContain('...');
    });

    test('should handle markdown formatting', () => {
      const notification = {
        ...mockNotification,
        slack: {
          mrkdwn: true
        }
      };

      const formatted = plugin._formatMessage(notification);
      expect(formatted.mrkdwn).toBe(true);
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
          data: 'ok'
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
        data: 'invalid_token'
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

  describe('Advanced Features', () => {
    test('should handle file uploads with webhook', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          file: {
            content: 'file content',
            filename: 'test.txt',
            filetype: 'text'
          }
        }
      };

      // Note: File uploads require different API endpoint than webhooks
      // This test ensures the plugin handles the configuration gracefully
      await plugin.send(notification);

      // Should still use webhook endpoint for regular message
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('hooks.slack.com'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('should handle unfurl links setting', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          unfurl_links: false,
          unfurl_media: false
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          unfurl_links: false,
          unfurl_media: false
        }),
        expect.any(Object)
      );
    });

    test('should handle message updates with ts', async () => {
      const notification = {
        ...mockNotification,
        slack: {
          ts: '1234567890.123456',
          text: 'Updated message'
        }
      };

      await plugin.send(notification);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ts: '1234567890.123456',
          text: 'Updated message'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Workspace Integration', () => {
    test('should extract workspace info from webhook URL', () => {
      const webhookUrl = 'https://hooks.slack.com/services/T1234567890/B1234567890/XXXXXXXXXXXXXXXXXXXXXXXX';
      plugin.config.webhook = webhookUrl;

      const workspaceInfo = plugin._extractWorkspaceInfo();

      expect(workspaceInfo.teamId).toBe('T1234567890');
      expect(workspaceInfo.channelId).toBe('B1234567890');
      expect(workspaceInfo.token).toBe('XXXXXXXXXXXXXXXXXXXXXXXX');
    });

    test('should handle invalid webhook URL gracefully', () => {
      plugin.config.webhook = 'invalid-url';

      const workspaceInfo = plugin._extractWorkspaceInfo();

      expect(workspaceInfo.teamId).toBeNull();
      expect(workspaceInfo.channelId).toBeNull();
      expect(workspaceInfo.token).toBeNull();
    });

    test('should include workspace info in health check', async () => {
      plugin.config.enabled = true;
      plugin.config.webhook = 'https://hooks.slack.com/services/T1234567890/B1234567890/XXXXXXXXXXXXXXXXXXXXXXXX';

      const health = await plugin.healthCheck();

      expect(health.metadata.workspaceId).toBe('T1234567890');
    });
  });
});