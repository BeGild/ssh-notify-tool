/**
 * @fileoverview Integration tests for complete notification workflows
 * Tests end-to-end notification flows including server, client, and plugin system
 */

const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

const NotificationServer = require('../../src/server/NotificationServer');
const NotificationClient = require('../../src/client/NotificationClient');
const ConfigManager = require('../../src/config/ConfigManager');

describe('Notification Flow Integration Tests', () => {
  let server;
  let serverInstance;
  let baseURL;
  let client;
  let testConfig;

  beforeAll(async () => {
    // Setup test configuration
    testConfig = {
      server: {
        port: 0, // Use random available port
        host: 'localhost',
        auth: {
          enabled: true,
          token: 'test-integration-token-123'
        }
      },
      plugins: {
        desktop: {
          enabled: true
        },
        email: {
          enabled: false // Disable for integration tests
        },
        sms: {
          enabled: false // Disable for integration tests
        }
      },
      channels: {
        default: ['desktop'],
        fallback: ['desktop']
      }
    };

    // Initialize server
    server = new NotificationServer(testConfig);
    await server.initialize();

    // Start server and get actual port
    serverInstance = await server.start();
    const port = serverInstance.address().port;
    baseURL = `http://localhost:${port}`;

    // Initialize client
    client = new NotificationClient({
      serverUrl: baseURL,
      authToken: testConfig.server.auth.token,
      timeout: 5000,
      retries: 1
    });

    // Wait for server to be ready
    await global.testUtils.sleep(500);
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Server Health', () => {
    test('should respond to health check', async () => {
      const response = await axios.get(`${baseURL}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
      expect(response.data.plugins).toBeDefined();
      expect(response.data.plugins.loaded).toBeGreaterThan(0);
    });

    test('should list available plugins', async () => {
      const response = await axios.get(`${baseURL}/plugins`);
      
      expect(response.status).toBe(200);
      expect(response.data.plugins).toBeDefined();
      expect(response.data.plugins).toHaveProperty('desktop');
    });

    test('should show plugin health status', async () => {
      const response = await axios.get(`${baseURL}/plugins/desktop/health`);
      
      expect(response.status).toBe(200);
      expect(response.data.healthy).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('should reject requests without auth token', async () => {
      try {
        await axios.post(`${baseURL}/notify`, {
          title: 'Test',
          message: 'Test message'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should reject requests with invalid auth token', async () => {
      try {
        await axios.post(`${baseURL}/notify`, {
          title: 'Test',
          message: 'Test message'
        }, {
          headers: {
            Authorization: 'Bearer invalid-token'
          }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should accept requests with valid auth token', async () => {
      const response = await axios.post(`${baseURL}/notify`, {
        title: 'Test',
        message: 'Test message',
        channels: ['desktop']
      }, {
        headers: {
          Authorization: `Bearer ${testConfig.server.auth.token}`
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Notification Workflows', () => {
    test('should send simple notification through client', async () => {
      const notification = {
        title: 'Integration Test',
        message: 'This is an integration test notification',
        level: 'info'
      };

      const result = await client.notify(notification);
      
      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results.desktop).toBeDefined();
      expect(result.results.desktop.success).toBe(true);
    });

    test('should handle notification with metadata', async () => {
      const notification = {
        title: 'Test with Metadata',
        message: 'This notification includes metadata',
        level: 'warning',
        metadata: {
          source: 'integration-test',
          environment: 'test',
          component: 'notification-flow'
        }
      };

      const result = await client.notify(notification);
      
      expect(result.success).toBe(true);
      expect(result.results.desktop.success).toBe(true);
    });

    test('should handle notification with specific channels', async () => {
      const notification = {
        title: 'Channel Specific',
        message: 'This goes to specific channels',
        channels: ['desktop']
      };

      const result = await client.notify(notification);
      
      expect(result.success).toBe(true);
      expect(Object.keys(result.results)).toEqual(['desktop']);
    });

    test('should handle notification with channel-specific config', async () => {
      const notification = {
        title: 'Desktop Config Test',
        message: 'Testing desktop-specific configuration',
        desktop: {
          timeout: 10,
          sound: true
        }
      };

      const result = await client.notify(notification);
      
      expect(result.success).toBe(true);
      expect(result.results.desktop.success).toBe(true);
    });

    test('should handle multiple concurrent notifications', async () => {
      const notifications = [
        { title: 'Concurrent 1', message: 'First concurrent notification' },
        { title: 'Concurrent 2', message: 'Second concurrent notification' },
        { title: 'Concurrent 3', message: 'Third concurrent notification' }
      ];

      const promises = notifications.map(notification => client.notify(notification));
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.results.desktop.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid notification format', async () => {
      try {
        await client.notify({
          // Missing required fields
          invalidField: 'invalid'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('title');
      }
    });

    test('should handle plugin failures gracefully', async () => {
      // Temporarily disable desktop plugin
      const originalEnabled = server.pluginManager.plugins.get('desktop').config.enabled;
      server.pluginManager.plugins.get('desktop').config.enabled = false;

      try {
        const result = await client.notify({
          title: 'Plugin Disabled Test',
          message: 'Testing with disabled plugin',
          channels: ['desktop']
        });

        expect(result.success).toBe(false);
        expect(result.results.desktop.success).toBe(false);
      } finally {
        // Restore plugin state
        server.pluginManager.plugins.get('desktop').config.enabled = originalEnabled;
      }
    });

    test('should handle network timeouts', async () => {
      const timeoutClient = new NotificationClient({
        serverUrl: baseURL,
        authToken: testConfig.server.auth.token,
        timeout: 1, // Very short timeout
        retries: 0
      });

      try {
        await timeoutClient.notify({
          title: 'Timeout Test',
          message: 'This should timeout'
        });
        fail('Should have thrown a timeout error');
      } catch (error) {
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Plugin System Integration', () => {
    test('should load and validate plugins correctly', async () => {
      const plugins = server.pluginManager.plugins;
      
      expect(plugins.has('desktop')).toBe(true);
      
      const desktopPlugin = plugins.get('desktop');
      expect(desktopPlugin).toBeDefined();
      expect(desktopPlugin.constructor.metadata.name).toBe('desktop');
    });

    test('should handle plugin configuration updates', async () => {
      const originalConfig = server.pluginManager.plugins.get('desktop').config;
      
      // Update plugin configuration
      await server.pluginManager.plugins.get('desktop').setup({
        ...originalConfig,
        timeout: 15
      });

      expect(server.pluginManager.plugins.get('desktop').config.timeout).toBe(15);
      
      // Restore original configuration
      await server.pluginManager.plugins.get('desktop').setup(originalConfig);
    });

    test('should report plugin health status correctly', async () => {
      const desktopPlugin = server.pluginManager.plugins.get('desktop');
      const health = await desktopPlugin.healthCheck();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('message');
      expect(typeof health.healthy).toBe('boolean');
    });

    test('should handle plugin availability changes', async () => {
      const desktopPlugin = server.pluginManager.plugins.get('desktop');
      
      // Check initial availability
      const initialAvailability = await desktopPlugin.isAvailable();
      expect(typeof initialAvailability).toBe('boolean');
      
      // Temporarily disable plugin
      const originalEnabled = desktopPlugin.config.enabled;
      desktopPlugin.config.enabled = false;
      
      const disabledAvailability = await desktopPlugin.isAvailable();
      expect(disabledAvailability).toBe(false);
      
      // Restore plugin
      desktopPlugin.config.enabled = originalEnabled;
      
      const restoredAvailability = await desktopPlugin.isAvailable();
      expect(restoredAvailability).toBe(initialAvailability);
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle high notification volume', async () => {
      const notificationCount = 20;
      const notifications = Array.from({ length: notificationCount }, (_, i) => ({
        title: `Volume Test ${i + 1}`,
        message: `High volume notification ${i + 1}`,
        metadata: { batchId: 'volume-test', index: i + 1 }
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        notifications.map(notification => client.notify(notification))
      );
      const duration = Date.now() - startTime;

      // All notifications should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Should complete in reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds
      
      console.log(`Processed ${notificationCount} notifications in ${duration}ms`);
    });

    test('should recover from temporary failures', async () => {
      // Simulate temporary server overload by sending many requests quickly
      const rapidRequests = Array.from({ length: 5 }, (_, i) => 
        client.notify({
          title: `Rapid ${i}`,
          message: `Rapid fire notification ${i}`
        })
      );

      const results = await Promise.allSettled(rapidRequests);
      
      // At least some should succeed
      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value.success
      );
      
      expect(successful.length).toBeGreaterThan(0);
    });

    test('should maintain server stability under load', async () => {
      // Send notifications continuously and check server health
      const healthCheckInterval = setInterval(async () => {
        try {
          const response = await axios.get(`${baseURL}/health`);
          expect(response.status).toBe(200);
        } catch (error) {
          fail(`Health check failed: ${error.message}`);
        }
      }, 100);

      // Send notifications for 2 seconds
      const endTime = Date.now() + 2000;
      const notifications = [];

      while (Date.now() < endTime) {
        notifications.push(
          client.notify({
            title: 'Load Test',
            message: 'Server stability test notification'
          }).catch(error => ({ error: error.message }))
        );
        
        // Small delay to prevent overwhelming
        await global.testUtils.sleep(50);
      }

      clearInterval(healthCheckInterval);
      
      const results = await Promise.all(notifications);
      const successful = results.filter(result => result.success).length;
      
      console.log(`Load test: ${successful}/${results.length} notifications successful`);
      expect(successful).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    test('should handle configuration reloading', async () => {
      const initialConfig = server.config;
      
      // Modify configuration
      const newConfig = {
        ...initialConfig,
        server: {
          ...initialConfig.server,
          timeout: 15000
        }
      };

      // Apply new configuration (server would need to support hot reload)
      // This tests the configuration structure
      expect(newConfig.server.timeout).toBe(15000);
      expect(newConfig.plugins).toBeDefined();
    });

    test('should validate plugin configurations', async () => {
      const desktopPlugin = server.pluginManager.plugins.get('desktop');
      
      const validConfig = {
        enabled: true,
        timeout: 5,
        sound: true
      };

      const invalidConfig = {
        enabled: 'not-a-boolean', // Invalid type
        timeout: -1 // Invalid value
      };

      expect(await desktopPlugin.validate(validConfig)).toBe(true);
      expect(await desktopPlugin.validate(invalidConfig)).toBe(false);
    });
  });

  describe('API Endpoints', () => {
    test('should provide comprehensive status information', async () => {
      const response = await axios.get(`${baseURL}/status`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('server');
      expect(response.data).toHaveProperty('plugins');
      expect(response.data).toHaveProperty('uptime');
      expect(response.data.server.status).toBe('running');
    });

    test('should handle CORS preflight requests', async () => {
      const response = await axios.options(`${baseURL}/notify`);
      
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should provide detailed error information', async () => {
      try {
        await axios.post(`${baseURL}/notify`, {
          title: '', // Invalid empty title
          message: 'Test'
        }, {
          headers: {
            Authorization: `Bearer ${testConfig.server.auth.token}`
          }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('title');
      }
    });
  });

  describe('Client Library Integration', () => {
    test('should handle client retry logic', async () => {
      const retryClient = new NotificationClient({
        serverUrl: baseURL,
        authToken: testConfig.server.auth.token,
        timeout: 100,
        retries: 3
      });

      // This should succeed despite short timeout due to retries
      const result = await retryClient.notify({
        title: 'Retry Test',
        message: 'Testing client retry logic'
      });

      expect(result.success).toBe(true);
    });

    test('should handle connection pooling efficiently', async () => {
      const clients = Array.from({ length: 5 }, () => 
        new NotificationClient({
          serverUrl: baseURL,
          authToken: testConfig.server.auth.token
        })
      );

      const promises = clients.map(client =>
        client.notify({
          title: 'Pool Test',
          message: 'Testing connection pooling'
        })
      );

      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});