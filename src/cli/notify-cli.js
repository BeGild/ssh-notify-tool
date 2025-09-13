#!/usr/bin/env node

/**
 * @fileoverview Command-line interface for SSH Notify Tool
 * Provides CLI for sending notifications, testing connections, and managing channels
 */

const path = require('path');
const NotificationClient = require('../client/NotificationClient');

class NotifyCLI {
  constructor() {
    this.client = null;
    this.args = process.argv.slice(2);
    this.options = {
      server: process.env.NOTIFY_SERVER_URL || 'http://localhost:3000',
      token: process.env.NOTIFY_AUTH_TOKEN,
      timeout: parseInt(process.env.NOTIFY_TIMEOUT) || 30000,
      retries: parseInt(process.env.NOTIFY_RETRY_ATTEMPTS) || 3,
      verbose: false,
      quiet: false
    };
  }

  /**
   * Parse command line arguments and execute commands
   */
  async run() {
    try {
      if (this.args.length === 0) {
        this.showHelp();
        return;
      }

      this._parseGlobalOptions();
      
      // Initialize client with parsed options
      this.client = new NotificationClient({
        baseURL: this.options.server,
        token: this.options.token,
        timeout: this.options.timeout,
        retryAttempts: this.options.retries
      });

      const command = this.args[0];

      switch (command) {
        case 'send':
        case 'notify':
          await this.handleSend();
          break;
        case 'broadcast':
          await this.handleBroadcast();
          break;
        case 'channels':
          await this.handleChannels();
          break;
        case 'health':
          await this.handleHealth();
          break;
        case 'stats':
          await this.handleStats();
          break;
        case 'plugins':
          await this.handlePlugins();
          break;
        case 'test':
          await this.handleTest();
          break;
        case 'help':
        case '--help':
        case '-h':
          this.showHelp();
          break;
        case 'version':
        case '--version':
        case '-v':
          this.showVersion();
          break;
        default:
          this.error(`Unknown command: ${command}`);
          this.showHelp();
          process.exit(1);
      }

    } catch (error) {
      this.error(`Error: ${error.message}`);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Handle send notification command
   */
  async handleSend() {
    const sendArgs = this.args.slice(1);
    let title = '';
    let message = '';
    let level = 'info';
    let channels = [];
    let metadata = null;

    // Parse send arguments
    for (let i = 0; i < sendArgs.length; i++) {
      const arg = sendArgs[i];
      
      switch (arg) {
        case '-t':
        case '--title':
          title = sendArgs[++i];
          break;
        case '-m':
        case '--message':
          message = sendArgs[++i];
          break;
        case '-l':
        case '--level':
          level = sendArgs[++i];
          break;
        case '-c':
        case '--channels':
          channels = sendArgs[++i].split(',').map(c => c.trim());
          break;
        case '--metadata':
          try {
            metadata = JSON.parse(sendArgs[++i]);
          } catch (error) {
            this.error('Invalid JSON format for metadata');
            process.exit(1);
          }
          break;
        default:
          if (!title) {
            title = arg;
          } else if (!message) {
            message = arg;
          }
          break;
      }
    }

    if (!title || !message) {
      this.error('Title and message are required');
      this.log('Usage: notify send <title> <message> [options]');
      this.log('   or: notify send -t "Title" -m "Message" [options]');
      process.exit(1);
    }

    if (channels.length === 0) {
      this.error('At least one channel must be specified');
      this.log('Use --channels to specify channels or use broadcast command');
      process.exit(1);
    }

    if (!['info', 'warning', 'error'].includes(level)) {
      this.error('Level must be one of: info, warning, error');
      process.exit(1);
    }

    const notification = { title, message, level };
    if (metadata) {
      notification.metadata = metadata;
    }

    this.verbose(`Sending notification to channels: ${channels.join(', ')}`);
    
    const result = await this.client.notify(notification, channels);
    
    if (result.success) {
      this.log(`✓ Notification sent successfully to ${result.successfulChannels}/${result.totalChannels} channels`);
    } else {
      this.log(`⚠ Notification partially sent to ${result.successfulChannels}/${result.totalChannels} channels`);
    }
    
    if (this.options.verbose) {
      this.log('Channel results:');
      result.channelResults.forEach(cr => {
        const status = cr.success ? '✓' : '✗';
        this.log(`  ${status} ${cr.channel}: ${cr.message}`);
      });
    }
  }

  /**
   * Handle broadcast command
   */
  async handleBroadcast() {
    const broadcastArgs = this.args.slice(1);
    let title = '';
    let message = '';
    let level = 'info';
    let metadata = null;

    // Parse broadcast arguments
    for (let i = 0; i < broadcastArgs.length; i++) {
      const arg = broadcastArgs[i];
      
      switch (arg) {
        case '-t':
        case '--title':
          title = broadcastArgs[++i];
          break;
        case '-m':
        case '--message':
          message = broadcastArgs[++i];
          break;
        case '-l':
        case '--level':
          level = broadcastArgs[++i];
          break;
        case '--metadata':
          try {
            metadata = JSON.parse(broadcastArgs[++i]);
          } catch (error) {
            this.error('Invalid JSON format for metadata');
            process.exit(1);
          }
          break;
        default:
          if (!title) {
            title = arg;
          } else if (!message) {
            message = arg;
          }
          break;
      }
    }

    if (!title || !message) {
      this.error('Title and message are required');
      this.log('Usage: notify broadcast <title> <message> [options]');
      process.exit(1);
    }

    const notification = { title, message, level };
    if (metadata) {
      notification.metadata = metadata;
    }

    this.verbose('Broadcasting notification to all available channels');
    
    const result = await this.client.broadcast(notification);
    
    if (result.success) {
      this.log(`✓ Broadcast sent successfully to ${result.successfulChannels}/${result.totalChannels} channels`);
    } else {
      this.log(`⚠ Broadcast partially sent to ${result.successfulChannels}/${result.totalChannels} channels`);
    }
    
    if (this.options.verbose) {
      this.log('Channel results:');
      result.channelResults.forEach(cr => {
        const status = cr.success ? '✓' : '✗';
        this.log(`  ${status} ${cr.channel}: ${cr.message}`);
      });
    }
  }

  /**
   * Handle channels command
   */
  async handleChannels() {
    const subCommand = this.args[1];
    
    switch (subCommand) {
      case 'list':
      case undefined:
        await this.handleChannelsList();
        break;
      case 'health':
        await this.handleChannelsHealth();
        break;
      default:
        this.error(`Unknown channels subcommand: ${subCommand}`);
        this.log('Available subcommands: list, health');
        process.exit(1);
    }
  }

  /**
   * Handle channels list command
   */
  async handleChannelsList() {
    this.verbose('Fetching available channels...');
    
    const channels = await this.client.getChannels();
    
    if (channels.length === 0) {
      this.log('No channels available');
      return;
    }

    this.log('Available channels:');
    channels.forEach(channel => {
      this.log(`  • ${channel}`);
    });
    
    this.log(`\nTotal: ${channels.length} channels`);
  }

  /**
   * Handle channels health command
   */
  async handleChannelsHealth() {
    this.verbose('Checking channel health...');
    
    const health = await this.client.getChannelHealth();
    
    this.log('Channel health status:');
    
    Object.entries(health).forEach(([channel, status]) => {
      const healthIcon = status.healthy ? '✓' : '✗';
      this.log(`  ${healthIcon} ${channel}: ${status.message}`);
    });
  }

  /**
   * Handle health command
   */
  async handleHealth() {
    this.verbose('Checking server health...');
    
    const health = await this.client.getHealth();
    
    this.log(`Server Status: ${health.status}`);
    this.log(`Uptime: ${Math.floor(health.uptime)}s`);
    this.log(`Version: ${health.version}`);
    this.log(`Plugins Loaded: ${health.pluginsLoaded}`);
  }

  /**
   * Handle stats command
   */
  async handleStats() {
    this.verbose('Fetching delivery statistics...');
    
    const stats = await this.client.getStats();
    
    this.log('Delivery Statistics:');
    this.log(`  Total Deliveries: ${stats.totalDeliveries}`);
    this.log(`  Success Rate: ${stats.successRate.toFixed(1)}%`);
    this.log(`  Average Delivery Time: ${stats.averageDeliveryTime.toFixed(0)}ms`);
    
    if (Object.keys(stats.channelStats).length > 0) {
      this.log('\nChannel Statistics:');
      Object.entries(stats.channelStats).forEach(([channel, channelStats]) => {
        this.log(`  ${channel}:`);
        this.log(`    Attempts: ${channelStats.attempts}`);
        this.log(`    Success Rate: ${channelStats.successRate.toFixed(1)}%`);
        this.log(`    Average Time: ${channelStats.averageTime.toFixed(0)}ms`);
      });
    }
  }

  /**
   * Handle plugins command
   */
  async handlePlugins() {
    const subCommand = this.args[1];
    
    if (subCommand && !subCommand.startsWith('-')) {
      // Get specific plugin info
      await this.handlePluginInfo(subCommand);
    } else {
      // List all plugins
      await this.handlePluginsList();
    }
  }

  /**
   * Handle plugins list command
   */
  async handlePluginsList() {
    this.verbose('Fetching plugin information...');
    
    const plugins = await this.client.getPlugins();
    
    if (plugins.length === 0) {
      this.log('No plugins loaded');
      return;
    }

    this.log('Loaded plugins:');
    plugins.forEach(plugin => {
      const status = plugin.available ? '✓' : '✗';
      this.log(`  ${status} ${plugin.name} (${plugin.displayName}) - v${plugin.version}`);
      if (this.options.verbose) {
        this.log(`      ${plugin.description}`);
        this.log(`      Capabilities: ${plugin.capabilities.join(', ')}`);
      }
    });
    
    this.log(`\nTotal: ${plugins.length} plugins`);
  }

  /**
   * Handle plugin info command
   */
  async handlePluginInfo(pluginName) {
    this.verbose(`Fetching information for plugin: ${pluginName}`);
    
    const plugin = await this.client.getPlugin(pluginName);
    
    this.log(`Plugin: ${plugin.name}`);
    this.log(`Display Name: ${plugin.displayName}`);
    this.log(`Version: ${plugin.version}`);
    this.log(`Author: ${plugin.author}`);
    this.log(`Description: ${plugin.description}`);
    this.log(`Capabilities: ${plugin.capabilities.join(', ')}`);
    this.log(`Available: ${plugin.available ? 'Yes' : 'No'}`);
    
    if (plugin.health) {
      this.log(`Health: ${plugin.health.healthy ? 'Healthy' : 'Unhealthy'}`);
      this.log(`Health Message: ${plugin.health.message}`);
    }
  }

  /**
   * Handle test command
   */
  async handleTest() {
    this.verbose('Testing connection to server...');
    
    const connected = await this.client.testConnection();
    
    if (connected) {
      this.log('✓ Connection successful');
      
      // Test each available channel
      const channels = await this.client.getChannels();
      if (channels.length > 0) {
        this.log('\nTesting channels:');
        const health = await this.client.getChannelHealth();
        
        channels.forEach(channel => {
          const status = health[channel]?.healthy ? '✓' : '✗';
          this.log(`  ${status} ${channel}`);
        });
      }
    } else {
      this.log('✗ Connection failed');
      this.log('Please check if the server is running and the URL is correct');
      process.exit(1);
    }
  }

  /**
   * Parse global options from arguments
   * @private
   */
  _parseGlobalOptions() {
    const filteredArgs = [];
    
    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      
      switch (arg) {
        case '--server':
        case '-s':
          this.options.server = this.args[++i];
          break;
        case '--token':
          this.options.token = this.args[++i];
          break;
        case '--timeout':
          this.options.timeout = parseInt(this.args[++i]);
          break;
        case '--retries':
          this.options.retries = parseInt(this.args[++i]);
          break;
        case '--verbose':
          this.options.verbose = true;
          break;
        case '--quiet':
          this.options.quiet = true;
          break;
        default:
          filteredArgs.push(arg);
          break;
      }
    }
    
    this.args = filteredArgs;
  }

  /**
   * Show help information
   */
  showHelp() {
    this.log('SSH Notify Tool CLI');
    this.log('');
    this.log('Usage: notify <command> [options]');
    this.log('');
    this.log('Commands:');
    this.log('  send <title> <message>     Send notification to specific channels');
    this.log('  broadcast <title> <message> Broadcast notification to all channels');
    this.log('  channels [list|health]     List available channels or check health');
    this.log('  health                     Check server health');
    this.log('  stats                      Show delivery statistics');
    this.log('  plugins [name]             List plugins or show plugin details');
    this.log('  test                       Test connection and channels');
    this.log('  help                       Show this help message');
    this.log('  version                    Show version information');
    this.log('');
    this.log('Send/Broadcast Options:');
    this.log('  -t, --title <title>        Notification title');
    this.log('  -m, --message <message>    Notification message');
    this.log('  -l, --level <level>        Notification level (info, warning, error)');
    this.log('  -c, --channels <channels>  Comma-separated list of channels (send only)');
    this.log('  --metadata <json>          Additional metadata as JSON string');
    this.log('');
    this.log('Global Options:');
    this.log('  -s, --server <url>         Notification server URL');
    this.log('  --token <token>            Authentication token');
    this.log('  --timeout <ms>             Request timeout in milliseconds');
    this.log('  --retries <count>          Number of retry attempts');
    this.log('  --verbose                  Enable verbose output');
    this.log('  --quiet                    Suppress non-error output');
    this.log('');
    this.log('Environment Variables:');
    this.log('  NOTIFY_SERVER_URL          Default server URL');
    this.log('  NOTIFY_AUTH_TOKEN          Default authentication token');
    this.log('  NOTIFY_TIMEOUT             Default timeout');
    this.log('  NOTIFY_RETRY_ATTEMPTS      Default retry attempts');
    this.log('');
    this.log('Examples:');
    this.log('  notify send "Deploy Complete" "Version 1.2.3 deployed successfully" -c desktop,email');
    this.log('  notify broadcast "System Alert" "High memory usage detected" -l warning');
    this.log('  notify channels list');
    this.log('  notify test');
  }

  /**
   * Show version information
   */
  showVersion() {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    try {
      const pkg = require(packagePath);
      this.log(`SSH Notify Tool CLI v${pkg.version}`);
    } catch (error) {
      this.log('SSH Notify Tool CLI v1.0.0');
    }
  }

  /**
   * Log message (unless quiet mode is enabled)
   */
  log(message) {
    if (!this.options.quiet) {
      console.log(message);
    }
  }

  /**
   * Log verbose message (only if verbose mode is enabled)
   */
  verbose(message) {
    if (this.options.verbose && !this.options.quiet) {
      console.log(`[VERBOSE] ${message}`);
    }
  }

  /**
   * Log error message
   */
  error(message) {
    console.error(message);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new NotifyCLI();
  cli.run().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = NotifyCLI;