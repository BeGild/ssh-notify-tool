/**
 * @fileoverview Unit tests for DesktopPlugin
 * Tests cross-platform desktop notification functionality
 */

const DesktopPlugin = require('../../../src/plugins/builtin/DesktopPlugin');

// Mock node-notifier
jest.mock('node-notifier', () => ({
  notify: jest.fn()
}));

// Mock os module
jest.mock('os', () => ({
  platform: jest.fn().mockReturnValue('linux')
}));

const notifier = require('node-notifier');
const os = require('os');

describe('DesktopPlugin', () => {
  let plugin;
  let mockNotification;

  beforeEach(() => {
    plugin = new DesktopPlugin({ enabled: true });
    mockNotification = global.testUtils.createMockNotification();
    jest.clearAllMocks();
  });

  describe('Metadata', () => {
    test('should have correct plugin metadata', () => {
      const metadata = DesktopPlugin.metadata;

      expect(metadata.name).toBe('desktop');
      expect(metadata.displayName).toBe('Desktop Notifications');
      expect(metadata.capabilities).toContain('text');
      expect(metadata.capabilities).toContain('actions');
      expect(metadata.capabilities).toContain('sound');
    });

    test('should have valid configuration schema', () => {
      const schema = DesktopPlugin.metadata.configSchema;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('enabled');
      expect(schema.properties).toHaveProperty('enabled');
      expect(schema.properties).toHaveProperty('sound');
      expect(schema.properties).toHaveProperty('timeout');
    });
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const plugin = new DesktopPlugin();

      expect(plugin.config.enabled).toBe(true);
      expect(plugin.config.sound).toBe(true);
      expect(plugin.config.timeout).toBe(5);
    });

    test('should initialize with custom config', () => {
      const config = {
        enabled: false,
        sound: false,
        timeout: 10,
        icon: '/path/to/icon.png'
      };

      const plugin = new DesktopPlugin(config);

      expect(plugin.config.enabled).toBe(false);
      expect(plugin.config.sound).toBe(false);
      expect(plugin.config.timeout).toBe(10);
      expect(plugin.config.icon).toBe('/path/to/icon.png');
    });

    test('should detect platform correctly', () => {
      os.platform.mockReturnValue('darwin');
      const plugin = new DesktopPlugin();

      expect(plugin.platform).toBe('darwin');
    });
  });

  describe('Send Method', () => {
    beforeEach(() => {
      notifier.notify.mockImplementation((options, callback) => {
        callback(null, 'activated', { response: 'clicked' });
      });
    });

    test('should send desktop notification successfully', async () => {
      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Desktop notification sent successfully');
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: mockNotification.title,
          message: mockNotification.message,
          sound: true,
          wait: false,
          timeout: 5
        }),
        expect.any(Function)
      );
    });

    test('should handle notification errors', async () => {
      const error = new Error('Notification failed');
      notifier.notify.mockImplementation((options, callback) => {
        callback(error);
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Desktop notification failed');
    });

    test('should fail when plugin is disabled', async () => {
      plugin.config.enabled = false;

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Desktop notifications are not available');
    });

    test('should include platform-specific options for macOS', async () => {
      os.platform.mockReturnValue('darwin');
      plugin.platform = 'darwin';

      await plugin.send(mockNotification);

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'darwin',
          sender: 'com.ssh-notify-tool.notifier'
        }),
        expect.any(Function)
      );
    });

    test('should include platform-specific options for Windows', async () => {
      os.platform.mockReturnValue('win32');
      plugin.platform = 'win32';

      await plugin.send(mockNotification);

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'windows',
          appID: 'SSH Notify Tool'
        }),
        expect.any(Function)
      );
    });

    test('should include platform-specific options for Linux', async () => {
      os.platform.mockReturnValue('linux');
      plugin.platform = 'linux';

      await plugin.send({ ...mockNotification, level: 'error' });

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'linux',
          urgency: 'critical',
          category: 'im.received'
        }),
        expect.any(Function)
      );
    });

    test('should set sound based on notification level for macOS', async () => {
      os.platform.mockReturnValue('darwin');
      plugin.platform = 'darwin';

      await plugin.send({ ...mockNotification, level: 'error' });

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          sound: 'Basso'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Validation', () => {
    test('should validate correct configuration', async () => {
      const validConfig = {
        enabled: true,
        sound: true,
        timeout: 5,
        icon: '/valid/path/icon.png'
      };

      // Mock icon validation
      plugin._isValidIconPath = jest.fn().mockReturnValue(true);

      const result = await plugin.validate(validConfig);

      expect(result).toBe(true);
    });

    test('should reject invalid timeout', async () => {
      const invalidConfig = {
        enabled: true,
        timeout: 50 // exceeds maximum
      };

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });

    test('should reject invalid icon path', async () => {
      const invalidConfig = {
        enabled: true,
        icon: '/nonexistent/path.png'
      };

      // Mock icon validation
      plugin._isValidIconPath = jest.fn().mockReturnValue(false);

      const result = await plugin.validate(invalidConfig);

      expect(result).toBe(false);
    });
  });

  describe('Availability', () => {
    test('should be available when enabled and supported', async () => {
      plugin.config.enabled = true;
      plugin.isSupported = true;
      plugin._isMacNotificationAvailable = jest.fn().mockReturnValue(true);

      const available = await plugin.isAvailable();

      expect(available).toBe(true);
    });

    test('should not be available when disabled', async () => {
      plugin.config.enabled = false;

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });

    test('should not be available on unsupported platform', async () => {
      plugin.config.enabled = true;
      plugin.isSupported = false;

      const available = await plugin.isAvailable();

      expect(available).toBe(false);
    });

    test('should check platform-specific availability', async () => {
      plugin.config.enabled = true;
      plugin.isSupported = true;

      // Test macOS
      os.platform.mockReturnValue('darwin');
      plugin.platform = 'darwin';
      plugin._isMacNotificationAvailable = jest.fn().mockReturnValue(true);

      expect(await plugin.isAvailable()).toBe(true);

      // Test Windows
      os.platform.mockReturnValue('win32');
      plugin.platform = 'win32';
      plugin._isWindowsNotificationAvailable = jest.fn().mockReturnValue(true);

      expect(await plugin.isAvailable()).toBe(true);

      // Test Linux
      os.platform.mockReturnValue('linux');
      plugin.platform = 'linux';
      plugin._isLinuxNotificationAvailable = jest.fn().mockReturnValue(true);

      expect(await plugin.isAvailable()).toBe(true);
    });
  });

  describe('Platform Detection', () => {
    test('should support common platforms', () => {
      expect(plugin._checkPlatformSupport()).toBe(true);

      os.platform.mockReturnValue('darwin');
      plugin.platform = 'darwin';
      expect(plugin._checkPlatformSupport()).toBe(true);

      os.platform.mockReturnValue('win32');
      plugin.platform = 'win32';
      expect(plugin._checkPlatformSupport()).toBe(true);
    });

    test('should not support unsupported platforms', () => {
      os.platform.mockReturnValue('freebsd');
      plugin.platform = 'freebsd';

      expect(plugin._checkPlatformSupport()).toBe(false);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status when available', async () => {
      plugin.config.enabled = true;
      plugin.isSupported = true;
      plugin._isMacNotificationAvailable = jest.fn().mockReturnValue(true);

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('available');
      expect(health.metadata).toHaveProperty('platform');
    });

    test('should return unhealthy status when unavailable', async () => {
      plugin.config.enabled = false;

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not available');
    });
  });

  describe('Icon Handling', () => {
    test('should use custom icon when provided', async () => {
      plugin.config.icon = '/custom/icon.png';

      await plugin.send(mockNotification);

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: '/custom/icon.png'
        }),
        expect.any(Function)
      );
    });

    test('should use default icon when none provided', async () => {
      plugin.config.icon = null;
      plugin._getDefaultIcon = jest.fn().mockReturnValue('/default/icon.png');

      await plugin.send(mockNotification);

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: '/default/icon.png'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Retry Logic', () => {
    test('should retry on notification failure', async () => {
      let attempts = 0;
      notifier.notify.mockImplementation((options, callback) => {
        attempts++;
        if (attempts < 3) {
          callback(new Error('Temporary failure'));
        } else {
          callback(null, 'activated');
        }
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(true);
      expect(notifier.notify).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      notifier.notify.mockImplementation((options, callback) => {
        callback(new Error('Permanent failure'));
      });

      const result = await plugin.send(mockNotification);

      expect(result.success).toBe(false);
      expect(notifier.notify).toHaveBeenCalledTimes(3); // Default retry attempts
    });
  });

  describe('Environment Detection', () => {
    test('should detect GUI environment on Linux', () => {
      process.env.DISPLAY = ':0';
      
      expect(plugin._isLinuxNotificationAvailable()).toBe(true);

      delete process.env.DISPLAY;
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      
      expect(plugin._isLinuxNotificationAvailable()).toBe(true);

      delete process.env.WAYLAND_DISPLAY;
      expect(plugin._isLinuxNotificationAvailable()).toBe(false);
    });

    test('should always be available on macOS', () => {
      expect(plugin._isMacNotificationAvailable()).toBe(true);
    });

    test('should always be available on Windows', () => {
      expect(plugin._isWindowsNotificationAvailable()).toBe(true);
    });
  });
});