#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const boxen = require('boxen');
const fs = require('fs');
const path = require('path');
const os = require('os');

const NotificationClient = require('./client');
const packageJson = require('../../package.json');

/**
 * CLI Application for sending notifications
 */
class NotifyCLI {
  constructor() {
    this.program = new Command();
    this.client = null;
    this.config = null;
    
    this.setupCommands();
  }

  /**
   * Setup CLI commands and options
   */
  setupCommands() {
    this.program
      .name('notify')
      .description('Send notifications through SSH Notify Tool')
      .version(packageJson.version);

    // Main notification command
    this.program
      .argument('[title]', 'Notification title')
      .argument('[message]', 'Notification message')
      .option('-l, --level <level>', 'Notification level (info, warning, error)', 'info')
      .option('-c, --channels <channels>', 'Notification channels (desktop,email,sms)', 'desktop')
      .option('-s, --server <url>', 'Server URL', 'http://localhost:5000')
      .option('-t, --token <token>', 'Authentication token')
      .option('--config <path>', 'Configuration file path')
      .option('--timeout <ms>', 'Request timeout in milliseconds', '10000')
      .option('--retries <count>', 'Number of retries', '3')
      .option('--json', 'Output in JSON format')
      .option('--test', 'Test server connection')
      .option('--interactive', 'Interactive mode')
      .action(async (title, message, options) => {
        await this.handleNotify(title, message, options);
      });

    // Configuration commands
    const configCmd = this.program
      .command('config')
      .description('Manage configuration');

    configCmd
      .command('init')
      .description('Initialize configuration')
      .option('--force', 'Overwrite existing configuration')
      .action(async (options) => {
        await this.handleConfigInit(options);
      });

    configCmd
      .command('show')
      .description('Show current configuration')
      .action(async () => {
        await this.handleConfigShow();
      });

    configCmd
      .command('test')
      .description('Test configuration and server connection')
      .action(async () => {
        await this.handleConfigTest();
      });

    // Server commands
    const serverCmd = this.program
      .command('server')
      .description('Server management commands');

    serverCmd
      .command('status')
      .description('Check server status')
      .option('-s, --server <url>', 'Server URL', 'http://localhost:5000')
      .option('-t, --token <token>', 'Authentication token')
      .action(async (options) => {
        await this.handleServerStatus(options);
      });

    // Error handling
    this.program.exitOverride();
  }

  /**
   * Handle main notification command
   */
  async handleNotify(title, message, options) {
    try {
      // Load configuration
      await this.loadConfig(options);

      // Handle test mode
      if (options.test) {
        return await this.handleTest();
      }

      // Handle interactive mode
      if (options.interactive || (!title && !message)) {
        return await this.handleInteractive();
      }

      // Validate required arguments
      if (!title || !message) {
        console.error(chalk.red('Error: Both title and message are required'));
        console.log('Usage: notify <title> <message> [options]');
        process.exit(1);
      }

      // Create notification
      const notification = {
        title,
        message,
        level: options.level,
        channels: this.parseChannels(options.channels),
        metadata: {
          tags: ['cli'],
          priority: this.getLevelPriority(options.level)
        }
      };

      // Send notification
      await this.sendNotification(notification, options);

    } catch (error) {
      this.handleError(error, options);
    }
  }

  /**
   * Handle configuration initialization
   */
  async handleConfigInit(options) {
    try {
      const configPath = this.getConfigPath();
      
      // Check if config exists
      if (fs.existsSync(configPath) && !options.force) {
        const { overwrite } = await inquirer.prompt([{
          type: 'confirm',
          name: 'overwrite',
          message: 'Configuration file already exists. Overwrite?',
          default: false
        }]);
        
        if (!overwrite) {
          console.log(chalk.yellow('Configuration initialization cancelled'));
          return;
        }
      }

      // Collect configuration
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'serverUrl',
          message: 'Server URL:',
          default: 'http://localhost:5000'
        },
        {
          type: 'password',
          name: 'token',
          message: 'Authentication token:',
          mask: '*'
        },
        {
          type: 'checkbox',
          name: 'defaultChannels',
          message: 'Default notification channels:',
          choices: [
            { name: 'Desktop', value: 'desktop', checked: true },
            { name: 'Email', value: 'email' },
            { name: 'SMS', value: 'sms' }
          ]
        },
        {
          type: 'list',
          name: 'defaultLevel',
          message: 'Default notification level:',
          choices: ['info', 'warning', 'error'],
          default: 'info'
        }
      ]);

      // Create config directory
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write configuration
      const config = {
        serverUrl: answers.serverUrl,
        token: answers.token,
        defaultChannels: answers.defaultChannels,
        defaultLevel: answers.defaultLevel,
        timeout: 10000,
        retries: 3
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      console.log(chalk.green('✅ Configuration saved successfully'));
      console.log(chalk.dim(`Config file: ${configPath}`));

    } catch (error) {
      console.error(chalk.red(`Failed to initialize configuration: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Handle configuration display
   */
  async handleConfigShow() {
    try {
      const configPath = this.getConfigPath();
      
      if (!fs.existsSync(configPath)) {
        console.log(chalk.yellow('No configuration file found'));
        console.log(chalk.dim(`Expected location: ${configPath}`));
        console.log(chalk.dim('Run "notify config init" to create one'));
        return;
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Hide sensitive information
      const displayConfig = { ...config };
      if (displayConfig.token) {
        displayConfig.token = '*'.repeat(displayConfig.token.length);
      }

      console.log(chalk.bold('Current Configuration:'));
      console.log(boxen(JSON.stringify(displayConfig, null, 2), {
        padding: 1,
        borderColor: 'blue'
      }));
      
      console.log(chalk.dim(`Config file: ${configPath}`));

    } catch (error) {
      console.error(chalk.red(`Failed to show configuration: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Handle configuration test
   */
  async handleConfigTest() {
    try {
      await this.loadConfig({});
      
      const spinner = ora('Testing configuration and server connection...').start();
      
      const status = await this.client.testConnection();
      
      spinner.succeed('Configuration test passed');
      
      console.log(chalk.green('✅ Server connection successful'));
      console.log(chalk.blue(`Server status: ${status.status}`));
      console.log(chalk.blue(`Server version: ${status.version}`));
      console.log(chalk.blue('Available handlers:'));
      
      for (const [handler, status] of Object.entries(status.handlers)) {
        const icon = status === 'enabled' ? '✅' : '❌';
        console.log(`  ${icon} ${handler}: ${status}`);
      }

    } catch (error) {
      console.error(chalk.red(`Configuration test failed: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Handle server status check
   */
  async handleServerStatus(options) {
    try {
      const client = new NotificationClient({
        serverUrl: options.server,
        token: options.token
      });

      const spinner = ora('Checking server status...').start();
      
      const status = await client.getStatus();
      
      spinner.succeed('Server status retrieved');
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(boxen([
          chalk.bold('Server Status'),
          '',
          `Status: ${chalk.green(status.status)}`,
          `Version: ${chalk.blue(status.version)}`,
          `Timestamp: ${chalk.dim(status.timestamp)}`,
          '',
          chalk.bold('Handlers:'),
          ...Object.entries(status.handlers).map(([name, status]) => {
            const color = status === 'enabled' ? 'green' : 'red';
            return `  ${name}: ${chalk[color](status)}`;
          })
        ].join('\n'), {
          padding: 1,
          borderColor: 'green'
        }));
      }

    } catch (error) {
      console.error(chalk.red(`Failed to get server status: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Handle test mode
   */
  async handleTest() {
    const spinner = ora('Testing server connection...').start();
    
    try {
      const status = await this.client.testConnection();
      spinner.succeed('Connection test passed');
      
      console.log(chalk.green('✅ Server connection successful'));
      console.log(chalk.blue(`Server: ${this.config.serverUrl}`));
      console.log(chalk.blue(`Status: ${status.status}`));
      
    } catch (error) {
      spinner.fail('Connection test failed');
      throw error;
    }
  }

  /**
   * Handle interactive mode
   */
  async handleInteractive() {
    console.log(chalk.bold.blue('📢 Interactive Notification'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Notification title:',
        validate: input => input.trim() ? true : 'Title is required'
      },
      {
        type: 'input',
        name: 'message',
        message: 'Notification message:',
        validate: input => input.trim() ? true : 'Message is required'
      },
      {
        type: 'list',
        name: 'level',
        message: 'Notification level:',
        choices: [
          { name: '💡 Info', value: 'info' },
          { name: '⚠️ Warning', value: 'warning' },
          { name: '🚨 Error', value: 'error' }
        ],
        default: this.config.defaultLevel || 'info'
      },
      {
        type: 'checkbox',
        name: 'channels',
        message: 'Notification channels:',
        choices: [
          { name: 'Desktop', value: 'desktop', checked: true },
          { name: 'Email', value: 'email' },
          { name: 'SMS', value: 'sms' }
        ],
        default: this.config.defaultChannels || ['desktop']
      }
    ]);

    const notification = {
      ...answers,
      metadata: {
        tags: ['cli', 'interactive'],
        priority: this.getLevelPriority(answers.level)
      }
    };

    await this.sendNotification(notification, { json: false });
  }

  /**
   * Send notification to server
   */
  async sendNotification(notification, options) {
    const spinner = ora('Sending notification...').start();
    
    try {
      const result = await this.client.send(notification);
      
      spinner.succeed('Notification sent successfully');
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        this.displaySuccess(result, notification);
      }

    } catch (error) {
      spinner.fail('Failed to send notification');
      throw error;
    }
  }

  /**
   * Display success message
   */
  displaySuccess(result, notification) {
    console.log(chalk.green('✅ Notification sent successfully'));
    console.log('');
    
    // Show notification details
    console.log(chalk.bold('Notification Details:'));
    console.log(`  Title: ${chalk.cyan(notification.title)}`);
    console.log(`  Level: ${this.getLevelIcon(notification.level)} ${notification.level}`);
    console.log(`  Channels: ${notification.channels.join(', ')}`);
    console.log('');

    // Show results per channel
    if (result.data?.results) {
      console.log(chalk.bold('Send Results:'));
      for (const [channel, result] of Object.entries(result.data.results)) {
        const icon = result.success ? '✅' : '❌';
        const status = result.success ? 
          chalk.green('Success') : 
          chalk.red(`Failed: ${result.error}`);
        
        console.log(`  ${icon} ${channel}: ${status}`);
        
        if (result.messageId) {
          console.log(chalk.dim(`    Message ID: ${result.messageId}`));
        }
      }
    }
  }

  /**
   * Load configuration from file or options
   */
  async loadConfig(options) {
    let config = {};
    
    // Load from config file
    const configPath = options.config || this.getConfigPath();
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Override with command line options
    if (options.server) config.serverUrl = options.server;
    if (options.token) config.token = options.token;
    if (options.timeout) config.timeout = parseInt(options.timeout);
    if (options.retries) config.retries = parseInt(options.retries);

    // Check for required configuration
    if (!config.token) {
      console.error(chalk.red('Error: Authentication token is required'));
      console.log('Set token with --token option or run "notify config init"');
      process.exit(1);
    }

    this.config = config;
    this.client = new NotificationClient(config);
  }

  /**
   * Get configuration file path
   */
  getConfigPath() {
    return path.join(os.homedir(), '.notifytool', 'client-config.json');
  }

  /**
   * Parse channels string
   */
  parseChannels(channels) {
    if (typeof channels === 'string') {
      return channels.split(',').map(c => c.trim());
    }
    return channels || ['desktop'];
  }

  /**
   * Get priority number for level
   */
  getLevelPriority(level) {
    const priorities = { info: 1, warning: 2, error: 3 };
    return priorities[level] || 1;
  }

  /**
   * Get icon for notification level
   */
  getLevelIcon(level) {
    const icons = { info: '💡', warning: '⚠️', error: '🚨' };
    return icons[level] || '💡';
  }

  /**
   * Handle errors
   */
  handleError(error, options) {
    if (options.json) {
      console.log(JSON.stringify({ error: error.message }, null, 2));
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
      
      if (error.status === 401) {
        console.log(chalk.yellow('Hint: Check your authentication token'));
      } else if (error.code === 'CONNECTION_ERROR') {
        console.log(chalk.yellow('Hint: Make sure the notification server is running'));
      }
    }
    
    process.exit(1);
  }

  /**
   * Run the CLI application
   */
  async run() {
    try {
      await this.program.parseAsync(process.argv);
    } catch (error) {
      if (error.code !== 'commander.helpDisplayed') {
        console.error(chalk.red(`Unexpected error: ${error.message}`));
        process.exit(1);
      }
    }
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new NotifyCLI();
  cli.run();
}

module.exports = NotifyCLI;