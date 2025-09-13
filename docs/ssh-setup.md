# SSH Remote Setup Guide

Complete guide for setting up SSH tunnels to send notifications from remote servers.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Server Setup](#server-setup)
- [Client Setup](#client-setup)
- [SSH Configuration](#ssh-configuration)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Advanced Scenarios](#advanced-scenarios)

## Overview

The SSH Notify Tool supports remote notifications through SSH tunnels, allowing you to:

- Send notifications from remote servers to your local desktop
- Centralize notifications from multiple servers
- Maintain security through encrypted SSH connections
- Work behind firewalls and NAT networks

## Architecture

```
[Remote Server] --SSH Tunnel--> [Local Machine] ---> [Desktop Notification]
     │                              │                       │
  ┌──▼──┐                      ┌───▼───┐               ┌────▼────┐
  │ CLI │                      │Server │               │Desktop  │
  │Tool │                      │:3000  │               │Slack    │
  └─────┘                      └───────┘               │Email...│
                                                       └─────────┘
```

**Flow**:
1. CLI tool on remote server establishes SSH tunnel to local machine
2. Notification sent through tunnel to local notification server
3. Local server processes notification and sends to configured channels

## Prerequisites

### Local Machine Requirements

- **Node.js 16+**: For running the notification server
- **SSH Server**: OpenSSH server or similar (for receiving connections)
- **SSH Notify Tool**: Installed globally via npm

### Remote Server Requirements

- **Node.js 16+**: For running the CLI client
- **SSH Client**: OpenSSH client or similar
- **Network Access**: Ability to connect to local machine via SSH

### Network Requirements

- **SSH Port**: Port 22 (or custom) accessible on local machine
- **Notification Port**: Internal port for tunnel (e.g., 3000)

## Server Setup

### 1. Local Machine (Notification Server)

#### Install SSH Notify Tool

```bash
npm install -g ssh-notify-tool
```

#### Create Configuration File

```bash
mkdir -p ~/.notifytool
cat > ~/.notifytool/config.json << 'EOF'
{
  "server": {
    "port": 3000,
    "host": "127.0.0.1",
    "auth": {
      "enabled": true,
      "token": "your-secure-token-replace-this"
    }
  },
  "plugins": {
    "desktop": {
      "enabled": true,
      "sound": true,
      "timeout": 5000
    },
    "email": {
      "enabled": true,
      "provider": "gmail",
      "auth": {
        "user": "your-email@gmail.com", 
        "pass": "your-app-password"
      },
      "from": "your-email@gmail.com",
      "to": ["your-email@gmail.com"]
    },
    "slack": {
      "enabled": false,
      "webhookUrl": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
    }
  },
  "channels": ["desktop", "email"]
}
EOF
```

#### Generate Secure Token

```bash
# Generate a secure random token
node -e "console.log('Token:', require('crypto').randomBytes(32).toString('hex'))"

# Update config with generated token
sed -i 's/your-secure-token-replace-this/YOUR_GENERATED_TOKEN/' ~/.notifytool/config.json
```

#### Start Notification Server

```bash
# Start server with config
notify-server --config ~/.notifytool/config.json

# Or as a service (see Advanced Scenarios)
npm install -g pm2
pm2 start notify-server --name notifications -- --config ~/.notifytool/config.json
pm2 save
pm2 startup
```

#### Enable SSH Server

**Linux (Ubuntu/Debian)**:
```bash
sudo apt update
sudo apt install openssh-server
sudo systemctl start ssh
sudo systemctl enable ssh
```

**Linux (CentOS/RHEL)**:
```bash
sudo yum install openssh-server
sudo systemctl start sshd
sudo systemctl enable sshd
```

**macOS**:
```bash
# Enable Remote Login in System Preferences > Sharing
# Or via command line:
sudo systemsetup -setremotelogin on
```

### 2. Remote Server Setup

#### Install SSH Notify Tool

```bash
npm install -g ssh-notify-tool
```

#### Test SSH Connection

```bash
# Test basic SSH connection to your local machine
ssh username@your-local-machine-ip

# Test with specific port
ssh -p 2222 username@your-local-machine-ip

# Exit after successful connection test
exit
```

## Client Setup

### 1. SSH Key Authentication (Recommended)

#### Generate SSH Key on Remote Server

```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -f ~/.ssh/notify_key
# Enter passphrase or leave empty for automated scripts

# Display public key (copy this)
cat ~/.ssh/notify_key.pub
```

#### Add Public Key to Local Machine

```bash
# On your local machine, add the public key
mkdir -p ~/.ssh
echo "ssh-rsa AAAAB3... remote-user@remote-server" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

#### Test Key-based Authentication

```bash
# From remote server, test key authentication
ssh -i ~/.ssh/notify_key username@your-local-machine-ip
```

### 2. Basic Notification Test

#### Simple Test from Remote Server

```bash
# Test notification with SSH tunnel
notify-cli "Test from Remote" \
  --message "Testing SSH tunnel notification" \
  --remote username@your-local-machine-ip \
  --ssh-key ~/.ssh/notify_key \
  --token YOUR_GENERATED_TOKEN
```

#### Verify on Local Machine

You should see:
- Desktop notification (if enabled)
- Email notification (if configured)
- Server logs showing received notification

## SSH Configuration

### 1. SSH Config File (Recommended)

Create SSH config for easier management:

```bash
# On remote server: ~/.ssh/config
cat > ~/.ssh/config << 'EOF'
Host notify-local
    HostName your-local-machine-ip
    User your-username
    Port 22
    IdentityFile ~/.ssh/notify_key
    ServerAliveInterval 30
    ServerAliveCountMax 3
    LocalForward 13000 127.0.0.1:3000
    ExitOnForwardFailure yes

Host notify-local-alt
    HostName your-local-machine-domain.com
    User your-username
    Port 2222
    IdentityFile ~/.ssh/notify_key
EOF

# Set correct permissions
chmod 600 ~/.ssh/config
```

#### Using SSH Config

```bash
# Test connection using config
ssh notify-local

# Send notification using config
notify-cli "Config Test" --remote notify-local --ssh-config --token YOUR_TOKEN
```

### 2. Advanced SSH Options

#### Custom Port Forwarding

```bash
# Forward remote port 13000 to local port 3000
notify-cli "Test" \
  --remote user@server.com \
  --ssh-port 2222 \
  --local-port 13000 \
  --remote-port 3000 \
  --token YOUR_TOKEN
```

#### Multiple Tunnel Support

```bash
# ~/.ssh/config for multiple servers
Host notify-prod
    HostName prod-server.com
    User deploy
    IdentityFile ~/.ssh/prod_key
    LocalForward 13001 127.0.0.1:3000

Host notify-staging  
    HostName staging-server.com
    User deploy
    IdentityFile ~/.ssh/staging_key
    LocalForward 13002 127.0.0.1:3000
```

### 3. Automation Scripts

#### Notification Wrapper Script

```bash
#!/bin/bash
# notify-remote.sh - Wrapper script for remote notifications

REMOTE_HOST="notify-local"
AUTH_TOKEN="YOUR_TOKEN_HERE"

send_notification() {
    local title="$1"
    local message="$2"
    local level="${3:-info}"
    
    notify-cli "$title" \
        --message "$message" \
        --level "$level" \
        --remote "$REMOTE_HOST" \
        --ssh-config \
        --token "$AUTH_TOKEN" \
        --quiet
}

# Usage examples
send_notification "Script Started" "Backup script initiated" "info"
send_notification "Script Complete" "Backup completed successfully" "success"
send_notification "Script Failed" "Backup failed with errors" "error"
```

#### Integration with Cron Jobs

```bash
# Add to crontab: crontab -e
0 2 * * * /home/user/backup.sh && /home/user/notify-remote.sh "Backup Complete" "Daily backup finished successfully" "success" || /home/user/notify-remote.sh "Backup Failed" "Daily backup encountered errors" "error"
```

## Security Considerations

### 1. Authentication Security

#### Strong Token Generation

```bash
# Generate cryptographically secure token
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Token Storage

```bash
# Store token securely in environment
export NOTIFY_TOKEN="your-secure-token"

# Add to shell profile
echo 'export NOTIFY_TOKEN="your-secure-token"' >> ~/.bashrc

# Use in notifications
notify-cli "Test" --remote host --token "$NOTIFY_TOKEN"
```

### 2. SSH Security

#### SSH Key Security

```bash
# Secure key file permissions
chmod 600 ~/.ssh/notify_key
chmod 600 ~/.ssh/config

# Use SSH agent for automated scripts
ssh-agent bash
ssh-add ~/.ssh/notify_key
```

#### SSH Server Configuration

```bash
# /etc/ssh/sshd_config (on local machine)
Port 22
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
AllowUsers your-username
ClientAliveInterval 300
ClientAliveCountMax 2

# Restart SSH service
sudo systemctl restart ssh
```

#### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow from REMOTE_SERVER_IP to any port 22

# iptables
sudo iptables -A INPUT -p tcp -s REMOTE_SERVER_IP --dport 22 -j ACCEPT
```

### 3. Network Security

#### Port Forwarding Best Practices

```bash
# Bind tunnel to localhost only (secure)
ssh -L 127.0.0.1:13000:127.0.0.1:3000 user@local-machine

# Avoid binding to all interfaces (insecure)
# ssh -L 0.0.0.0:13000:127.0.0.1:3000 user@local-machine
```

#### Connection Monitoring

```bash
# Monitor SSH connections
sudo tail -f /var/log/auth.log | grep ssh

# Monitor notification server
notify-server --config ~/.notifytool/config.json --verbose
```

## Troubleshooting

### Common Issues

#### 1. SSH Connection Refused

**Error**: `Connection refused` or `No route to host`

**Solutions**:
```bash
# Test basic connectivity
ping your-local-machine-ip
telnet your-local-machine-ip 22

# Check SSH service
sudo systemctl status ssh

# Check firewall
sudo ufw status
sudo iptables -L

# Test with verbose SSH
ssh -v user@your-local-machine-ip
```

#### 2. Authentication Failures

**Error**: `Permission denied (publickey)`

**Solutions**:
```bash
# Verify key permissions
ls -la ~/.ssh/notify_key*
chmod 600 ~/.ssh/notify_key

# Test key
ssh -i ~/.ssh/notify_key -v user@local-machine

# Check authorized_keys on local machine
ls -la ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

#### 3. Tunnel Connection Issues

**Error**: `channel 2: open failed: connect failed: Connection refused`

**Solutions**:
```bash
# Verify server is running
ssh user@local-machine "ps aux | grep notify-server"

# Check port binding
ssh user@local-machine "netstat -tlnp | grep 3000"

# Test local connection
ssh user@local-machine "curl -s http://localhost:3000/api/health"
```

#### 4. Notification Server Not Accessible

**Error**: `ECONNREFUSED` or timeout errors

**Solutions**:
```bash
# Check server status
notify-server --config ~/.notifytool/config.json --dry-run

# Verify configuration
cat ~/.notifytool/config.json | jq .server

# Check logs
tail -f ~/.notifytool/logs/server.log

# Test direct connection
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/health
```

### Debug Mode

#### Enable Verbose Logging

```bash
# Debug SSH connection
ssh -vvv user@local-machine

# Debug notification client
DEBUG=notify:* notify-cli "Test" --remote user@local-machine

# Debug server
DEBUG=notify:* notify-server --config ~/.notifytool/config.json
```

#### Network Diagnostics

```bash
# Check tunnel status
ss -tlnp | grep 3000

# Monitor network traffic
sudo tcpdump -i lo port 3000

# Check process connections
lsof -i :3000
```

### Log Analysis

#### SSH Logs

```bash
# View SSH authentication logs
sudo tail -f /var/log/auth.log

# Filter for specific user
sudo grep "your-username" /var/log/auth.log | tail -20
```

#### Application Logs

```bash
# Server logs
tail -f ~/.notifytool/logs/server.log

# Client logs (if configured)
tail -f ~/.notifytool/logs/client.log

# System logs
journalctl -u ssh --no-pager -l
```

## Advanced Scenarios

### 1. Multiple Remote Servers

#### Hub Configuration

```bash
# Local machine config for multiple servers
cat > ~/.notifytool/config.json << 'EOF'
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "plugins": {
    "desktop": {"enabled": true},
    "slack": {
      "enabled": true,
      "webhookUrl": "YOUR_SLACK_WEBHOOK",
      "channel": "#alerts"
    }
  }
}
EOF
```

#### Remote Server Scripts

```bash
# Production server notification script
#!/bin/bash
# /usr/local/bin/notify-prod

notify-cli "$1" \
    --message "$2" \
    --level "${3:-info}" \
    --remote notify-local \
    --ssh-config \
    --token "$NOTIFY_TOKEN" \
    --tags "production,$(hostname)" \
    --metadata '{"server":"production","environment":"prod"}'
```

### 2. Load Balancer Setup

#### Multiple Notification Servers

```bash
# ~/.ssh/config for failover
Host notify-primary
    HostName primary.local
    User notify
    IdentityFile ~/.ssh/notify_key
    ConnectTimeout 5

Host notify-backup
    HostName backup.local  
    User notify
    IdentityFile ~/.ssh/notify_key
    ConnectTimeout 5
```

#### Failover Script

```bash
#!/bin/bash
# notify-failover.sh

send_with_failover() {
    local title="$1"
    local message="$2"
    
    # Try primary server
    if notify-cli "$title" --message "$message" --remote notify-primary --ssh-config; then
        echo "Notification sent via primary server"
    # Fallback to backup
    elif notify-cli "$title" --message "$message" --remote notify-backup --ssh-config; then
        echo "Notification sent via backup server"  
    else
        echo "All notification servers failed" >&2
        return 1
    fi
}
```

### 3. Service Management

#### Systemd Service (Local Machine)

```bash
# /etc/systemd/system/notify-server.service
cat > /etc/systemd/system/notify-server.service << 'EOF'
[Unit]
Description=SSH Notify Server
After=network.target

[Service]
Type=simple
User=notify
Group=notify
WorkingDirectory=/home/notify
ExecStart=/usr/local/bin/notify-server --config /home/notify/.notifytool/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable notify-server
sudo systemctl start notify-server
```

#### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

RUN npm install -g ssh-notify-tool

COPY config.json /app/config.json

WORKDIR /app
EXPOSE 3000

CMD ["notify-server", "--config", "/app/config.json"]
```

```bash
# Build and run
docker build -t notify-server .
docker run -d -p 3000:3000 -v ~/.notifytool/config.json:/app/config.json notify-server
```

This comprehensive SSH setup guide should help users configure secure, reliable remote notifications through SSH tunnels.