/**
 * @fileoverview SSH tunnel helper utilities for port forwarding setup and validation
 * Provides guidance and testing functions for SSH tunnels without storing credentials
 */

const { spawn, exec } = require('child_process');
const net = require('net');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * SSH tunnel helper utilities for remote notification server access
 */
class SSHTunnelHelper {
  constructor(options = {}) {
    this.options = {
      defaultLocalPort: 3001,
      defaultRemotePort: 3000,
      connectionTimeout: 10000,
      ...options
    };
  }

  /**
   * Generate SSH tunnel command for port forwarding
   * @param {Object} config - SSH configuration
   * @param {string} config.remoteHost - Remote server hostname/IP
   * @param {string} [config.remoteUser] - Remote SSH username
   * @param {number} [config.remotePort] - Remote notification server port (default: 3000)
   * @param {number} [config.localPort] - Local port for tunnel (default: 3001)
   * @param {number} [config.sshPort] - SSH port (default: 22)
   * @param {string} [config.keyFile] - SSH private key file path
   * @returns {string} SSH command for port forwarding
   */
  generateTunnelCommand(config) {
    this._validateTunnelConfig(config);
    
    const {
      remoteHost,
      remoteUser,
      remotePort = this.options.defaultRemotePort,
      localPort = this.options.defaultLocalPort,
      sshPort = 22,
      keyFile
    } = config;

    let command = 'ssh -L ';
    command += `${localPort}:localhost:${remotePort}`;
    
    if (sshPort !== 22) {
      command += ` -p ${sshPort}`;
    }
    
    if (keyFile) {
      command += ` -i "${keyFile}"`;
    }
    
    // Add common SSH options for tunneling
    command += ' -N'; // Don't execute remote command
    command += ' -f'; // Go to background after authentication
    command += ' -o ServerAliveInterval=30'; // Keep connection alive
    command += ' -o ServerAliveCountMax=3'; // Max missed keepalives
    command += ' -o ExitOnForwardFailure=yes'; // Exit if port forwarding fails
    
    if (remoteUser) {
      command += ` ${remoteUser}@${remoteHost}`;
    } else {
      command += ` ${remoteHost}`;
    }

    return command;
  }

  /**
   * Generate interactive SSH tunnel setup guide
   * @param {Object} config - SSH configuration
   * @returns {Object} Setup guide with commands and instructions
   */
  generateSetupGuide(config) {
    const tunnelCommand = this.generateTunnelCommand(config);
    const killCommand = this.generateKillCommand(config);
    const testCommand = this.generateTestCommand(config);
    
    const localPort = config.localPort || this.options.defaultLocalPort;
    
    return {
      summary: `SSH tunnel from localhost:${localPort} to ${config.remoteHost}:${config.remotePort || this.options.defaultRemotePort}`,
      
      steps: [
        {
          step: 1,
          title: 'Setup SSH Tunnel',
          description: 'Create SSH tunnel for port forwarding',
          command: tunnelCommand,
          notes: [
            'This command will prompt for password/passphrase if needed',
            'The tunnel will run in the background after authentication',
            'Use -f flag to fork to background, or remove it for foreground mode'
          ]
        },
        {
          step: 2,
          title: 'Test Connection',
          description: 'Verify the tunnel is working',
          command: testCommand,
          notes: [
            'This tests if the local port is accessible',
            'Should return server health information if tunnel is working'
          ]
        },
        {
          step: 3,
          title: 'Configure Client',
          description: 'Update notification client configuration',
          command: `export NOTIFY_SERVER_URL=http://localhost:${localPort}`,
          notes: [
            'Set environment variable to use tunneled connection',
            'Or update your application configuration accordingly'
          ]
        },
        {
          step: 4,
          title: 'Cleanup (when done)',
          description: 'Stop the SSH tunnel',
          command: killCommand,
          notes: [
            'Find and kill the SSH tunnel process',
            'Or use Ctrl+C if running in foreground mode'
          ]
        }
      ],

      troubleshooting: [
        {
          issue: 'Authentication failed',
          solutions: [
            'Check SSH key permissions (chmod 600 ~/.ssh/id_rsa)',
            'Verify username and hostname are correct',
            'Test basic SSH connection first: ssh user@host',
            'Check SSH agent: ssh-add -l'
          ]
        },
        {
          issue: 'Port already in use',
          solutions: [
            'Check if tunnel is already running',
            'Use different local port: -L 3002:localhost:3000',
            'Kill existing process using the port'
          ]
        },
        {
          issue: 'Connection refused',
          solutions: [
            'Verify notification server is running on remote host',
            'Check firewall rules on remote server',
            'Ensure server is listening on correct port',
            'Test with: netstat -tlnp | grep :3000'
          ]
        },
        {
          issue: 'Tunnel dies/disconnects',
          solutions: [
            'Check network stability',
            'Use autossh for automatic reconnection',
            'Increase ServerAliveInterval',
            'Check server SSH configuration'
          ]
        }
      ],

      commands: {
        tunnel: tunnelCommand,
        test: testCommand,
        kill: killCommand
      }
    };
  }

  /**
   * Generate command to kill SSH tunnel
   * @param {Object} config - SSH configuration
   * @returns {string} Command to kill tunnel process
   */
  generateKillCommand(config) {
    const localPort = config.localPort || this.options.defaultLocalPort;
    return `pkill -f "ssh.*-L.*${localPort}:localhost"`;
  }

  /**
   * Generate test command for tunnel
   * @param {Object} config - SSH configuration
   * @returns {string} Command to test tunnel
   */
  generateTestCommand(config) {
    const localPort = config.localPort || this.options.defaultLocalPort;
    return `curl -f http://localhost:${localPort}/api/health || echo "Connection failed"`;
  }

  /**
   * Check if SSH is available on the system
   * @returns {Promise<boolean>} True if SSH is available
   */
  async isSSHAvailable() {
    try {
      await execAsync('ssh -V');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test if local port is available
   * @param {number} port - Port number to test
   * @returns {Promise<boolean>} True if port is available
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  /**
   * Test if remote port is accessible via SSH tunnel
   * @param {number} localPort - Local tunnel port
   * @param {number} [timeout] - Connection timeout in ms
   * @returns {Promise<boolean>} True if tunnel is working
   */
  async testTunnel(localPort, timeout = this.options.connectionTimeout) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);
      
      socket.connect(localPort, 'localhost', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  /**
   * Find running SSH tunnel processes
   * @returns {Promise<Array>} List of running tunnel processes
   */
  async findTunnelProcesses() {
    try {
      const { stdout } = await execAsync('ps aux | grep "ssh.*-L.*localhost" | grep -v grep');
      const processes = stdout.trim().split('\n').filter(line => line.length > 0);
      
      return processes.map(process => {
        const parts = process.trim().split(/\s+/);
        const pid = parts[1];
        const command = parts.slice(10).join(' ');
        
        // Extract port information from command
        const portMatch = command.match(/-L\s+(\d+):localhost:(\d+)/);
        const localPort = portMatch ? parseInt(portMatch[1]) : null;
        const remotePort = portMatch ? parseInt(portMatch[2]) : null;
        
        return {
          pid,
          command,
          localPort,
          remotePort
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Kill SSH tunnel by local port
   * @param {number} localPort - Local port of tunnel to kill
   * @returns {Promise<boolean>} True if successfully killed
   */
  async killTunnelByPort(localPort) {
    try {
      await execAsync(`pkill -f "ssh.*-L.*${localPort}:localhost"`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create autossh command for persistent tunnels
   * @param {Object} config - SSH configuration
   * @returns {string} Autossh command
   */
  generateAutosshCommand(config) {
    const tunnelCommand = this.generateTunnelCommand(config);
    
    // Replace ssh with autossh and add autossh-specific options
    const autosshCommand = tunnelCommand
      .replace('ssh ', 'autossh ')
      .replace(' -f', ''); // Remove -f flag as autossh handles backgrounding
    
    // Add autossh monitoring options
    const localPort = config.localPort || this.options.defaultLocalPort;
    const monitorPort = localPort + 1000; // Use different port for monitoring
    
    return `AUTOSSH_POLL=30 AUTOSSH_PORT=${monitorPort} ${autosshCommand} -M ${monitorPort}`;
  }

  /**
   * Validate SSH tunnel configuration
   * @private
   * @param {Object} config - Configuration to validate
   */
  _validateTunnelConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('SSH tunnel configuration is required');
    }

    if (!config.remoteHost) {
      throw new Error('Remote host is required');
    }

    if (config.localPort && (config.localPort < 1 || config.localPort > 65535)) {
      throw new Error('Local port must be between 1 and 65535');
    }

    if (config.remotePort && (config.remotePort < 1 || config.remotePort > 65535)) {
      throw new Error('Remote port must be between 1 and 65535');
    }

    if (config.sshPort && (config.sshPort < 1 || config.sshPort > 65535)) {
      throw new Error('SSH port must be between 1 and 65535');
    }
  }

  /**
   * Create helper functions for common scenarios
   */
  static createQuickHelpers() {
    return {
      /**
       * Generate standard SSH tunnel setup for notification server
       * @param {string} remoteHost - Remote server hostname
       * @param {string} [remoteUser] - SSH username
       * @returns {Object} Setup guide
       */
      setupNotificationTunnel: (remoteHost, remoteUser) => {
        const helper = new SSHTunnelHelper();
        return helper.generateSetupGuide({
          remoteHost,
          remoteUser,
          localPort: 3001,
          remotePort: 3000
        });
      },

      /**
       * Quick tunnel test
       * @param {number} [localPort=3001] - Local port to test
       * @returns {Promise<boolean>} True if tunnel is working
       */
      testNotificationTunnel: async (localPort = 3001) => {
        const helper = new SSHTunnelHelper();
        return await helper.testTunnel(localPort);
      },

      /**
       * Quick tunnel cleanup
       * @param {number} [localPort=3001] - Local port to clean up
       * @returns {Promise<boolean>} True if successfully cleaned up
       */
      cleanupNotificationTunnel: async (localPort = 3001) => {
        const helper = new SSHTunnelHelper();
        return await helper.killTunnelByPort(localPort);
      }
    };
  }
}

module.exports = SSHTunnelHelper;