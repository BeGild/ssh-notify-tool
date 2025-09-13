# SSH Notify Tool

A universal notification tool for CLI applications that supports both local and remote execution via SSH tunnels. Built with a plugin architecture to support multiple notification channels including desktop notifications, email, SMS, and popular messaging platforms.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [SSH Remote Setup](#ssh-remote-setup)
- [Plugin System](#plugin-system)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Features

- **Multi-Channel Notifications**: Desktop, email, SMS, DingTalk, WeChat Work, Slack
- **Plugin Architecture**: Easily extend with custom notification channels
- **SSH Tunnel Support**: Send notifications from remote servers via SSH port forwarding
- **Secure Authentication**: Token-based authentication with encryption support
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **REST API**: HTTP API for integration with any application
- **CLI Interface**: Simple command-line tool for immediate use
- **Retry Logic**: Automatic retry with exponential backoff for reliability

## Quick Start

### 1. Installation

```bash
npm install -g ssh-notify-tool
```

### 2. Start the Server

```bash
# Start with default configuration
notify-server

# Or with custom config
notify-server --config /path/to/config.json --port 3000
```

### 3. Send a Notification

```bash
# Local notification
notify-cli "Hello World" --message "This is a test notification"

# Remote notification via SSH tunnel
notify-cli "Remote Alert" --message "From remote server" --remote user@server.com
```

## Installation

### From NPM (Recommended)

```bash
npm install -g ssh-notify-tool
```

### From Source

```bash
git clone https://github.com/your-username/ssh-notify-tool.git
cd ssh-notify-tool
npm install
npm link
```

### Dependencies

- Node.js 16+ (for ES modules support)
- NPM or Yarn package manager
- Platform-specific dependencies:
  - **Linux**: `libnotify-bin` for desktop notifications
  - **macOS**: No additional dependencies
  - **Windows**: No additional dependencies

## Configuration

The tool uses a JSON configuration file to define notification channels and their settings. By default, it looks for `config.json` in the current directory.

### Basic Configuration

```json
{
  "server": {
    "port": 3000,
    "host": "localhost",
    "auth": {
      "enabled": true,
      "token": "your-secure-token-here"
    }
  },
  "plugins": {
    "desktop": {
      "enabled": true,
      "sound": true,
      "timeout": 5000
    },
    "email": {
      "enabled": false,
      "provider": "gmail",
      "auth": {
        "user": "your-email@gmail.com",
        "pass": "your-app-password"
      },
      "from": "your-email@gmail.com",
      "to": ["recipient@example.com"]
    }
  },
  "channels": ["desktop"]
}
```

### Available Plugins

#### Built-in Plugins

- **desktop**: Cross-platform desktop notifications
- **email**: SMTP email notifications  
- **sms**: SMS notifications via Twilio or Aliyun

#### Official Plugins

- **dingtalk**: DingTalk webhook notifications
- **wechatwork**: WeChat Work webhook notifications
- **slack**: Slack webhook notifications

### Plugin Configuration Examples

#### Desktop Notifications

```json
{
  "plugins": {
    "desktop": {
      "enabled": true,
      "sound": true,
      "timeout": 5000,
      "actions": ["Dismiss", "View Details"]
    }
  }
}
```

#### Email Notifications

```json
{
  "plugins": {
    "email": {
      "enabled": true,
      "provider": "gmail",
      "auth": {
        "user": "notifications@company.com",
        "pass": "app-specific-password"
      },
      "from": "notifications@company.com",
      "to": ["admin@company.com", "devops@company.com"],
      "subject": "System Notification: {{title}}",
      "template": "html"
    }
  }
}
```

#### SMS Notifications

```json
{
  "plugins": {
    "sms": {
      "enabled": true,
      "provider": "twilio",
      "auth": {
        "accountSid": "your-twilio-sid",
        "authToken": "your-twilio-token"
      },
      "from": "+1234567890",
      "to": ["+1234567891", "+1234567892"],
      "rateLimitPerMinute": 10
    }
  }
}
```

#### DingTalk Webhook

```json
{
  "plugins": {
    "dingtalk": {
      "enabled": true,
      "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=your-token",
      "secret": "your-webhook-secret",
      "atAll": false,
      "atMobiles": ["13812345678"],
      "messageType": "markdown"
    }
  }
}
```

#### Slack Webhook

```json
{
  "plugins": {
    "slack": {
      "enabled": true,
      "webhookUrl": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      "channel": "#notifications",
      "username": "NotifyBot",
      "emoji": ":bell:",
      "enableRichFormatting": true
    }
  }
}
```

## Usage

### Command Line Interface

The CLI tool provides several ways to send notifications:

#### Basic Usage

```bash
# Simple notification
notify-cli "Title" --message "Message body"

# With specific channels
notify-cli "Alert" --message "Important message" --channels desktop,email

# With metadata
notify-cli "Deploy Complete" --message "Version 1.2.3 deployed" --level success --metadata '{"version":"1.2.3","environment":"production"}'
```

#### Remote Usage via SSH

```bash
# Setup SSH tunnel and send notification
notify-cli "Remote Alert" --message "From remote server" --remote user@server.com

# With custom SSH options
notify-cli "Alert" --message "Message" --remote user@server.com --ssh-port 2222 --ssh-key ~/.ssh/custom_key
```

#### Configuration Options

```bash
# Use custom server endpoint
notify-cli "Test" --server http://localhost:8000

# Use custom auth token
notify-cli "Test" --token "custom-auth-token"

# Quiet mode (no output)
notify-cli "Test" --quiet

# Dry run (validate without sending)
notify-cli "Test" --dry-run
```

### REST API

The notification server exposes a REST API for integration with applications:

#### Send Notification

```http
POST /api/notify
Content-Type: application/json
Authorization: Bearer your-auth-token

{
  "title": "System Alert",
  "message": "High CPU usage detected",
  "level": "warning",
  "channels": ["desktop", "email"],
  "metadata": {
    "source": "monitoring",
    "server": "web-01"
  }
}
```

#### Health Check

```http
GET /api/health
```

#### Plugin Status

```http
GET /api/plugins
Authorization: Bearer your-auth-token
```

### Programmatic Usage

You can also use the notification client directly in your Node.js applications:

```javascript
import { NotificationClient } from 'ssh-notify-tool';

const client = new NotificationClient({
  baseUrl: 'http://localhost:3000',
  token: 'your-auth-token'
});

// Send notification
await client.notify({
  title: 'Process Complete',
  message: 'Data processing finished successfully',
  level: 'success',
  channels: ['desktop', 'slack'],
  metadata: {
    duration: '2m 30s',
    records: 1500
  }
});

// Check server health
const health = await client.health();
console.log(health);
```

## SSH Remote Setup

For remote notifications via SSH tunnels, follow these steps:

### 1. Server Setup (Remote Machine)

Install and configure the notification server on your remote machine:

```bash
# Install on remote server
npm install -g ssh-notify-tool

# Create configuration file
cat > ~/notify-config.json << 'EOF'
{
  "server": {
    "port": 3000,
    "host": "127.0.0.1",
    "auth": {
      "enabled": true,
      "token": "secure-random-token-here"
    }
  },
  "plugins": {
    "desktop": {"enabled": true},
    "email": {"enabled": true, "...": "your-config"}
  }
}
EOF

# Start server
notify-server --config ~/notify-config.json
```

### 2. Client Setup (Local Machine)

Configure your local environment to use SSH tunnels:

```bash
# Test SSH connection
ssh user@remote-server.com "echo 'SSH connection successful'"

# Test notification with SSH tunnel
notify-cli "Test Remote" --message "Testing SSH tunnel" --remote user@remote-server.com
```

### 3. SSH Key Authentication (Recommended)

For passwordless authentication, set up SSH keys:

```bash
# Generate SSH key if you don't have one
ssh-keygen -t rsa -b 4096 -f ~/.ssh/notify_key

# Copy key to remote server
ssh-copy-id -i ~/.ssh/notify_key.pub user@remote-server.com

# Use specific key for notifications
notify-cli "Test" --remote user@remote-server.com --ssh-key ~/.ssh/notify_key
```

### 4. Advanced SSH Configuration

Create SSH config for easier management:

```bash
# ~/.ssh/config
Host notify-server
    HostName remote-server.com
    User your-username
    Port 22
    IdentityFile ~/.ssh/notify_key
    LocalForward 13000 127.0.0.1:3000
```

Then use:

```bash
notify-cli "Test" --remote notify-server --ssh-config
```

## Plugin System

The notification tool uses a plugin architecture that allows you to:

1. **Use built-in plugins**: Desktop, email, SMS
2. **Enable official plugins**: DingTalk, WeChat Work, Slack
3. **Create custom plugins**: Extend functionality for your needs

### Creating Custom Plugins

See the [Plugin Development Guide](./plugin-development.md) for detailed instructions on creating custom plugins.

### Plugin Directory Structure

```
~/.notifytool/plugins/
├── my-custom-plugin/
│   ├── package.json
│   └── MyPlugin.js
└── another-plugin/
    ├── package.json
    └── AnotherPlugin.js
```

### Plugin Installation

```bash
# Install from NPM
npm install -g ssh-notify-plugin-teams

# Or install locally
mkdir -p ~/.notifytool/plugins/teams
cd ~/.notifytool/plugins/teams
npm install ssh-notify-plugin-teams
```

## API Reference

For detailed API documentation, see [API Documentation](./api.md).

### Key Endpoints

- `POST /api/notify` - Send notification
- `GET /api/health` - Health check
- `GET /api/plugins` - List available plugins
- `GET /api/plugins/:name/health` - Check specific plugin health

### Authentication

All API requests require authentication via Bearer token:

```http
Authorization: Bearer your-auth-token
```

## Examples

### Integration Examples

See the [`examples/`](../examples/) directory for integration examples with popular tools:

- **CI/CD Integration**: GitHub Actions, GitLab CI, Jenkins
- **Monitoring Tools**: Prometheus, Grafana, Nagios
- **Build Tools**: Webpack, Rollup, Vite
- **Testing Frameworks**: Jest, Mocha, Cypress
- **Deployment Tools**: Docker, Kubernetes, Terraform

### Example CLI Tool Integration

```javascript
#!/usr/bin/env node
import { exec } from 'child_process';
import { NotificationClient } from 'ssh-notify-tool';

const client = new NotificationClient();

// Run your process
exec('npm run build', async (error, stdout, stderr) => {
  if (error) {
    await client.notify({
      title: 'Build Failed',
      message: `Build failed with error: ${error.message}`,
      level: 'error',
      channels: ['desktop', 'slack']
    });
  } else {
    await client.notify({
      title: 'Build Complete',
      message: 'Build completed successfully',
      level: 'success',
      channels: ['desktop']
    });
  }
});
```

## Troubleshooting

### Common Issues

#### 1. Server Won't Start

**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**: Change the port in configuration or kill the existing process:

```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill $(lsof -ti:3000)

# Or use a different port
notify-server --port 3001
```

#### 2. SSH Connection Fails

**Error**: `Connection refused` or `Permission denied`

**Solutions**:
- Verify SSH connection: `ssh user@server.com`
- Check SSH key permissions: `chmod 600 ~/.ssh/your_key`
- Verify remote server is running: `ssh user@server.com "ps aux | grep notify-server"`

#### 3. Plugin Not Loading

**Error**: `Plugin 'custom-plugin' not found`

**Solutions**:
- Check plugin directory: `ls ~/.notifytool/plugins/`
- Verify plugin structure and exports
- Check plugin configuration in `config.json`
- Review server logs for detailed error messages

#### 4. Desktop Notifications Not Working

**Platform-specific solutions**:

**Linux**: Install notification daemon:
```bash
sudo apt-get install libnotify-bin  # Ubuntu/Debian
sudo yum install libnotify           # CentOS/RHEL
```

**macOS**: Grant notification permissions:
- System Preferences → Security & Privacy → Privacy → Notifications

**Windows**: No additional setup required

#### 5. Email Notifications Fail

**Common issues**:
- **Gmail**: Use app-specific passwords, not account password
- **Corporate SMTP**: Check firewall and proxy settings
- **2FA**: Ensure proper authentication method configured

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Debug server
DEBUG=notify:* notify-server

# Debug client
DEBUG=notify:* notify-cli "Test"
```

### Log Files

Server logs are written to:
- Linux/macOS: `~/.notifytool/logs/server.log`
- Windows: `%APPDATA%\notifytool\logs\server.log`

## Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/your-username/ssh-notify-tool/issues)
- **Documentation**: [Full documentation](https://github.com/your-username/ssh-notify-tool/wiki)
- **Examples**: [Example integrations](../examples/)

## License

MIT License. See [LICENSE](../LICENSE) file for details.