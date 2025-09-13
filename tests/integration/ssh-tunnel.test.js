/**
 * @fileoverview Integration tests for SSH tunnel functionality
 * Tests remote notification scenarios with SSH port forwarding
 */

const { spawn } = require('child_process');
const axios = require('axios');
const net = require('net');

const NotificationClient = require('../../src/client/NotificationClient');
const SSHHelper = require('../../src/utils/ssh-helper');

describe('SSH Tunnel Integration Tests', () => {
  describe('SSH Helper Utilities', () => {
    test('should generate correct SSH tunnel command', () => {
      const command = SSHHelper.generateTunnelCommand({
        localPort: 3000,
        remoteHost: 'remote-server.com',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'ssh-server.com',
        sshPort: 22
      });

      expect(command).toContain('ssh');
      expect(command).toContain('-L 3000:remote-server.com:8080');
      expect(command).toContain('user@ssh-server.com');
      expect(command).toContain('-p 22');
    });

    test('should generate command with key file', () => {
      const command = SSHHelper.generateTunnelCommand({
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'ssh-server.com',
        keyFile: '/path/to/key.pem'
      });

      expect(command).toContain('-i /path/to/key.pem');
    });

    test('should generate command with additional SSH options', () => {
      const command = SSHHelper.generateTunnelCommand({
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'ssh-server.com',
        sshOptions: ['-o StrictHostKeyChecking=no', '-o UserKnownHostsFile=/dev/null']
      });

      expect(command).toContain('-o StrictHostKeyChecking=no');
      expect(command).toContain('-o UserKnownHostsFile=/dev/null');
    });

    test('should validate SSH configuration', () => {
      const validConfig = {
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'ssh-server.com'
      };

      const invalidConfigs = [
        { ...validConfig, localPort: 'invalid' },
        { ...validConfig, remotePort: -1 },
        { ...validConfig, sshUser: '' },
        { ...validConfig, sshHost: '' },
        { ...validConfig, remoteHost: '' }
      ];

      expect(SSHHelper.validateConfig(validConfig)).toBe(true);
      
      invalidConfigs.forEach(config => {
        expect(SSHHelper.validateConfig(config)).toBe(false);
      });
    });

    test('should parse SSH tunnel status output', () => {
      const mockOutput = `
Local forwards:
  3000 -> localhost:8080
  3001 -> remote-server:8081
Remote forwards:
  (none)
      `;

      const tunnels = SSHHelper.parseTunnelStatus(mockOutput);
      
      expect(tunnels).toHaveLength(2);
      expect(tunnels[0]).toEqual({
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080
      });
      expect(tunnels[1]).toEqual({
        localPort: 3001,
        remoteHost: 'remote-server',
        remotePort: 8081
      });
    });
  });

  describe('Port Availability and Testing', () => {
    test('should check if port is available', async () => {
      // Test with a port that should be available
      const availablePort = await SSHHelper.findAvailablePort(9000, 9100);
      expect(availablePort).toBeGreaterThanOrEqual(9000);
      expect(availablePort).toBeLessThanOrEqual(9100);

      // Verify the port is actually available
      const isAvailable = await SSHHelper.isPortAvailable(availablePort);
      expect(isAvailable).toBe(true);
    });

    test('should detect when port is in use', async () => {
      // Create a temporary server to occupy a port
      const server = net.createServer();
      const port = await new Promise((resolve) => {
        server.listen(0, () => {
          resolve(server.address().port);
        });
      });

      try {
        const isAvailable = await SSHHelper.isPortAvailable(port);
        expect(isAvailable).toBe(false);
      } finally {
        server.close();
      }
    });

    test('should test connection to remote service', async () => {
      // Test connection to a known good service (using HTTP)
      const canConnect = await SSHHelper.testConnection('httpbin.org', 80);
      expect(canConnect).toBe(true);

      // Test connection to a non-existent service
      const cannotConnect = await SSHHelper.testConnection('non-existent-host-12345.com', 80);
      expect(cannotConnect).toBe(false);
    });

    test('should handle connection timeouts', async () => {
      // Test with a very short timeout to a slow-responding service
      const startTime = Date.now();
      const canConnect = await SSHHelper.testConnection('httpbin.org', 80, 1); // 1ms timeout
      const duration = Date.now() - startTime;

      // Should fail quickly due to timeout
      expect(canConnect).toBe(false);
      expect(duration).toBeLessThan(100); // Should fail fast
    });
  });

  describe('Mock SSH Tunnel Scenarios', () => {
    let mockLocalServer;
    let mockLocalPort;

    beforeAll(async () => {
      // Create a mock local server to simulate the tunneled service
      mockLocalServer = net.createServer((socket) => {
        socket.on('data', (data) => {
          const request = data.toString();
          
          if (request.includes('GET /health')) {
            const response = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status":"healthy"}';
            socket.write(response);
          } else if (request.includes('POST /notify')) {
            const response = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"success":true}';
            socket.write(response);
          } else {
            const response = 'HTTP/1.1 404 Not Found\r\n\r\n';
            socket.write(response);
          }
          
          socket.end();
        });
      });

      mockLocalPort = await new Promise((resolve) => {
        mockLocalServer.listen(0, () => {
          resolve(mockLocalServer.address().port);
        });
      });
    });

    afterAll(() => {
      if (mockLocalServer) {
        mockLocalServer.close();
      }
    });

    test('should simulate successful SSH tunnel connection', async () => {
      // Simulate that a tunnel is established to our mock server
      const tunnelConfig = {
        localPort: mockLocalPort,
        remoteHost: 'localhost',
        remotePort: 8080, // This would be the actual remote port
        sshUser: 'user',
        sshHost: 'remote-server.com'
      };

      // Test that we can connect through the "tunnel" (mock server)
      const canConnect = await SSHHelper.testConnection('localhost', mockLocalPort);
      expect(canConnect).toBe(true);

      // Test notification client through the tunnel
      const client = new NotificationClient({
        serverUrl: `http://localhost:${mockLocalPort}`,
        authToken: 'test-token',
        timeout: 5000
      });

      // This would fail with our simple mock server, but tests the client setup
      try {
        await client.notify({
          title: 'SSH Tunnel Test',
          message: 'Testing notification through SSH tunnel'
        });
      } catch (error) {
        // Expected to fail with mock server, but connection should be attempted
        expect(error.message).toContain('400'); // Bad Request from our simple mock
      }
    });

    test('should handle tunnel connection failures', async () => {
      const tunnelConfig = {
        localPort: 9999, // Non-existent port
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'remote-server.com'
      };

      const canConnect = await SSHHelper.testConnection('localhost', 9999);
      expect(canConnect).toBe(false);

      const client = new NotificationClient({
        serverUrl: 'http://localhost:9999',
        authToken: 'test-token',
        timeout: 1000,
        retries: 1
      });

      try {
        await client.notify({
          title: 'Tunnel Failure Test',
          message: 'This should fail'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('ECONNREFUSED');
      }
    });
  });

  describe('SSH Configuration Validation', () => {
    test('should validate complete SSH tunnel configuration', () => {
      const completeConfig = {
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'deploy',
        sshHost: 'production-server.com',
        sshPort: 22,
        keyFile: '~/.ssh/id_rsa',
        sshOptions: ['-o StrictHostKeyChecking=no']
      };

      expect(SSHHelper.validateConfig(completeConfig)).toBe(true);
    });

    test('should reject invalid port numbers', () => {
      const configs = [
        { localPort: 0 },
        { localPort: 65536 },
        { remotePort: -1 },
        { sshPort: 'invalid' }
      ];

      configs.forEach(config => {
        const fullConfig = {
          localPort: 3000,
          remoteHost: 'localhost',
          remotePort: 8080,
          sshUser: 'user',
          sshHost: 'server.com',
          ...config
        };
        
        expect(SSHHelper.validateConfig(fullConfig)).toBe(false);
      });
    });

    test('should validate SSH key file paths', () => {
      const validPaths = [
        '~/.ssh/id_rsa',
        '/home/user/.ssh/private_key',
        './relative/path/to/key',
        '../parent/dir/key.pem'
      ];

      const invalidPaths = [
        '',
        null,
        undefined
      ];

      validPaths.forEach(path => {
        expect(SSHHelper.validateKeyPath(path)).toBe(true);
      });

      invalidPaths.forEach(path => {
        expect(SSHHelper.validateKeyPath(path)).toBe(false);
      });
    });

    test('should validate hostname formats', () => {
      const validHosts = [
        'localhost',
        '192.168.1.1',
        'server.example.com',
        'sub.domain.example.org',
        'server-01.internal'
      ];

      const invalidHosts = [
        '',
        'invalid..domain',
        'server with spaces',
        '256.256.256.256', // Invalid IP
        'server:port' // Port should be separate
      ];

      validHosts.forEach(host => {
        expect(SSHHelper.validateHostname(host)).toBe(true);
      });

      invalidHosts.forEach(host => {
        expect(SSHHelper.validateHostname(host)).toBe(false);
      });
    });
  });

  describe('SSH Tunnel Setup Instructions', () => {
    test('should generate setup instructions for different scenarios', () => {
      // Local development scenario
      const localInstructions = SSHHelper.generateSetupInstructions({
        scenario: 'local-development',
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'dev',
        sshHost: 'dev-server.com'
      });

      expect(localInstructions).toContain('ssh -L 3000:localhost:8080');
      expect(localInstructions).toContain('Local development');

      // Production deployment scenario
      const prodInstructions = SSHHelper.generateSetupInstructions({
        scenario: 'production',
        localPort: 3000,
        remoteHost: 'internal-service',
        remotePort: 8080,
        sshUser: 'deploy',
        sshHost: 'bastion.company.com',
        keyFile: '~/.ssh/production_key'
      });

      expect(prodInstructions).toContain('ssh -L 3000:internal-service:8080');
      expect(prodInstructions).toContain('-i ~/.ssh/production_key');
      expect(prodInstructions).toContain('Production');
    });

    test('should include troubleshooting tips', () => {
      const instructions = SSHHelper.generateSetupInstructions({
        scenario: 'troubleshooting',
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'server.com'
      });

      expect(instructions).toContain('Troubleshooting');
      expect(instructions).toContain('netstat');
      expect(instructions).toContain('ssh -v');
      expect(instructions).toContain('Connection refused');
    });

    test('should provide platform-specific instructions', () => {
      const windowsInstructions = SSHHelper.generateSetupInstructions({
        platform: 'windows',
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'server.com'
      });

      expect(windowsInstructions).toContain('Windows');
      expect(windowsInstructions).toContain('PuTTY');

      const linuxInstructions = SSHHelper.generateSetupInstructions({
        platform: 'linux',
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 8080,
        sshUser: 'user',
        sshHost: 'server.com'
      });

      expect(linuxInstructions).toContain('Linux');
      expect(linuxInstructions).toContain('ssh command');
    });
  });

  describe('Real-world SSH Scenarios', () => {
    test('should handle multi-hop SSH tunneling', () => {
      const multiHopConfig = {
        localPort: 3000,
        remoteHost: 'internal-server',
        remotePort: 8080,
        jumpHost: 'bastion.company.com',
        jumpUser: 'bastion-user',
        sshUser: 'deploy',
        sshHost: 'target-server.internal'
      };

      const command = SSHHelper.generateMultiHopCommand(multiHopConfig);
      
      expect(command).toContain('-J bastion-user@bastion.company.com');
      expect(command).toContain('deploy@target-server.internal');
    });

    test('should handle dynamic port forwarding', () => {
      const dynamicConfig = {
        socksPort: 1080,
        sshUser: 'user',
        sshHost: 'proxy-server.com'
      };

      const command = SSHHelper.generateDynamicPortCommand(dynamicConfig);
      
      expect(command).toContain('-D 1080');
      expect(command).toContain('user@proxy-server.com');
    });

    test('should validate complex tunnel configurations', () => {
      const complexConfig = {
        tunnels: [
          {
            localPort: 3000,
            remoteHost: 'app-server',
            remotePort: 8080
          },
          {
            localPort: 3001,
            remoteHost: 'db-server',
            remotePort: 5432
          },
          {
            localPort: 3002,
            remoteHost: 'redis-server',
            remotePort: 6379
          }
        ],
        sshUser: 'deploy',
        sshHost: 'bastion.company.com',
        keyFile: '~/.ssh/company_key'
      };

      const isValid = SSHHelper.validateComplexConfig(complexConfig);
      expect(isValid).toBe(true);

      const commands = SSHHelper.generateMultipleTunnelCommands(complexConfig);
      expect(commands).toHaveLength(3);
      expect(commands[0]).toContain('-L 3000:app-server:8080');
      expect(commands[1]).toContain('-L 3001:db-server:5432');
      expect(commands[2]).toContain('-L 3002:redis-server:6379');
    });
  });

  describe('Security Considerations', () => {
    test('should recommend secure SSH options', () => {
      const secureOptions = SSHHelper.getSecureSSHOptions();
      
      expect(secureOptions).toContain('-o StrictHostKeyChecking=yes');
      expect(secureOptions).toContain('-o ServerAliveInterval=60');
      expect(secureOptions).toContain('-o ServerAliveCountMax=3');
      expect(secureOptions).toContain('-o ExitOnForwardFailure=yes');
    });

    test('should validate key file permissions', () => {
      // Mock file stat for testing
      const mockFileStats = {
        mode: 0o600, // Correct permissions
        isFile: () => true
      };

      const isSecure = SSHHelper.validateKeyPermissions('/path/to/key', mockFileStats);
      expect(isSecure).toBe(true);

      // Test with insecure permissions
      const insecureMockStats = {
        mode: 0o644, // Too permissive
        isFile: () => true
      };

      const isInsecure = SSHHelper.validateKeyPermissions('/path/to/key', insecureMockStats);
      expect(isInsecure).toBe(false);
    });

    test('should provide security warnings for risky configurations', () => {
      const riskyConfig = {
        sshOptions: [
          '-o StrictHostKeyChecking=no',
          '-o UserKnownHostsFile=/dev/null'
        ]
      };

      const warnings = SSHHelper.getSecurityWarnings(riskyConfig);
      
      expect(warnings).toContain('StrictHostKeyChecking disabled');
      expect(warnings).toContain('UserKnownHostsFile disabled');
    });
  });
});