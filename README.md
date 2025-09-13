# SSH Notify Tool

A universal notification system for CLI tools that supports both local and remote execution environments via SSH port forwarding.

## Features

- **Multi-Channel Notifications**: Desktop, Email, SMS, DingTalk, WeChat Work, Slack
- **Plugin Architecture**: Extensible notification system with built-in and third-party plugins
- **SSH Remote Support**: Seamless notifications from remote servers via SSH tunnels
- **Cross-Platform**: Windows, macOS, and Linux support
- **Secure Authentication**: Token-based authentication with SSH integration
- **Easy Integration**: Simple client library for CLI tool integration

## Quick Start

### Installation

```bash
npm install -g ssh-notify-tool
```

### Start Server

```bash
notify-server
```

### Send Notification

```bash
notify-cli --title "Task Complete" --message "Your process has finished" --channels desktop,email
```

## Architecture

The system consists of:

- **Notification Server**: Central service that receives and routes notifications
- **Plugin Manager**: Dynamic loading and management of notification channels
- **Notification Client**: HTTP client for sending notifications
- **CLI Interface**: Command-line tool for direct usage

## Plugin System

Built-in plugins:
- Desktop notifications (cross-platform)
- Email (SMTP)
- SMS (Twilio, Aliyun)

Official plugins:
- DingTalk (钉钉)
- WeChat Work (企业微信)
- Slack

## Configuration

Configuration is stored in `~/.notifytool/config.json`:

```json
{
  "server": {
    "port": 5000,
    "authToken": "your-secret-token"
  },
  "plugins": {
    "enabled": ["desktop", "email", "dingtalk"],
    "config": {
      "desktop": { "enabled": true },
      "email": {
        "enabled": true,
        "smtpHost": "smtp.gmail.com",
        "user": "your-email@gmail.com"
      }
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev

# Lint code
npm run lint
```

## License

MIT
