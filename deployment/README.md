# SSH Notify Tool Deployment Guide

Complete deployment and distribution guide for the SSH Notify Tool.

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [System Installation](#system-installation)
- [Plugin Development](#plugin-development)
- [Distribution](#distribution)
- [Maintenance](#maintenance)

## Docker Deployment

### Quick Start with Docker

```bash
# Build the image
docker build -t ssh-notify-tool -f deployment/docker/Dockerfile .

# Run with default configuration
docker run -d \
  --name notify-server \
  -p 3000:3000 \
  -e NOTIFY_AUTH_TOKEN="your-secure-token" \
  -e SMTP_USER="your-email@gmail.com" \
  -e SMTP_PASS="your-app-password" \
  -e EMAIL_TO="recipient@example.com" \
  ssh-notify-tool
```

### Docker Compose Deployment

```bash
# Copy environment template
cp deployment/docker/.env.example .env

# Edit configuration
nano .env

# Start services
cd deployment/docker
docker-compose up -d

# View logs
docker-compose logs -f notify-server

# Stop services
docker-compose down
```

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Authentication
NOTIFY_AUTH_TOKEN=your-secure-token-here

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=notifications@company.com
EMAIL_TO=admin@company.com

# Slack Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# DingTalk Configuration
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=...
DINGTALK_SECRET=your-webhook-secret

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM=+1234567890
SMS_TO=+1987654321
```

### Docker Development

```bash
# Development with hot reload
docker-compose --profile dev up notify-dev

# Run tests
docker-compose --profile test run notify-test

# Build specific target
docker build --target development -t ssh-notify-tool:dev .
```

### Docker Volumes and Persistence

```bash
# Custom configuration
mkdir -p ./config ./plugins
# Edit ./config/config.json
docker run -d \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/plugins:/app/plugins:ro \
  -v notify-logs:/app/logs \
  ssh-notify-tool

# Plugin development
docker run -d \
  -v $(pwd)/my-plugin:/app/plugins/my-plugin:ro \
  ssh-notify-tool
```

## System Installation

### Automated Installation

```bash
# Download and run installer
curl -sSL https://raw.githubusercontent.com/your-username/ssh-notify-tool/main/deployment/scripts/install.sh | bash

# Or with options
curl -sSL https://raw.githubusercontent.com/your-username/ssh-notify-tool/main/deployment/scripts/install.sh | bash -s -- --system --service
```

### Manual Installation Options

#### Option 1: NPM Global Install
```bash
npm install -g ssh-notify-tool
```

#### Option 2: Local Development Install
```bash
git clone https://github.com/your-username/ssh-notify-tool.git
cd ssh-notify-tool
npm install
npm link
```

#### Option 3: System Service Install
```bash
# Download installer
wget https://raw.githubusercontent.com/your-username/ssh-notify-tool/main/deployment/scripts/install.sh

# Make executable and run
chmod +x install.sh
sudo ./install.sh --system --service

# Start service
sudo systemctl start notify-server
sudo systemctl enable notify-server
```

### Platform-Specific Instructions

#### Ubuntu/Debian
```bash
# Install dependencies
sudo apt update
sudo apt install -y curl nodejs npm libnotify-bin

# Install SSH Notify Tool
./deployment/scripts/install.sh
```

#### CentOS/RHEL
```bash
# Install dependencies
sudo yum install -y curl nodejs npm libnotify

# Install SSH Notify Tool
./deployment/scripts/install.sh
```

#### macOS
```bash
# Install dependencies
brew install node

# Install SSH Notify Tool
./deployment/scripts/install.sh
```

#### Alpine Linux
```bash
# Install dependencies
apk add --no-cache nodejs npm curl libnotify

# Install SSH Notify Tool
./deployment/scripts/install.sh
```

## Plugin Development

### Creating a New Plugin

```bash
# Create plugin from template
node deployment/scripts/package-plugin.js create basic my-awesome-plugin \
  --author "Your Name" \
  --description "My awesome notification plugin"

# Development
cd my-awesome-plugin
npm install
npm test

# Package for distribution
npm run package
```

### Available Templates

- **basic**: Basic notification plugin with API integration
- **webhook**: Generic webhook-based plugin
- **database**: Database logging plugin

### Plugin Packaging

```bash
# Package existing plugin
node deployment/scripts/package-plugin.js package ./my-plugin

# Output: ./dist/my-plugin-1.0.0.tgz
# Output: ./dist/my-plugin-1.0.0.tgz.checksums
```

### Plugin Installation

```bash
# Install from package file
npm install ./dist/my-plugin-1.0.0.tgz

# Install to plugin directory
mkdir -p ~/.notifytool/plugins/my-plugin
cd ~/.notifytool/plugins/my-plugin
npm install ../../dist/my-plugin-1.0.0.tgz

# Or extract manually
tar -xzf ./dist/my-plugin-1.0.0.tgz -C ~/.notifytool/plugins/
```

## Distribution

### NPM Publishing

```bash
# Login to NPM
npm login

# Publish package
npm publish ./dist/my-plugin-1.0.0.tgz

# Install from NPM
npm install -g ssh-notify-plugin-my-awesome-plugin
```

### GitHub Releases

```bash
# Create release with assets
gh release create v1.0.0 \
  ./dist/ssh-notify-tool-1.0.0.tgz \
  ./dist/ssh-notify-tool-1.0.0.tgz.checksums \
  --title "SSH Notify Tool v1.0.0" \
  --notes-file CHANGELOG.md
```

### Docker Hub

```bash
# Build and tag
docker build -t your-username/ssh-notify-tool:1.0.0 .
docker tag your-username/ssh-notify-tool:1.0.0 your-username/ssh-notify-tool:latest

# Push to Docker Hub
docker push your-username/ssh-notify-tool:1.0.0
docker push your-username/ssh-notify-tool:latest
```

### Binary Distribution

```bash
# Package with pkg (optional)
npm install -g pkg
pkg package.json --out-path dist/binaries

# Create distribution archive
tar -czf dist/ssh-notify-tool-linux-x64.tar.gz -C dist/binaries ssh-notify-tool-linux
tar -czf dist/ssh-notify-tool-macos-x64.tar.gz -C dist/binaries ssh-notify-tool-macos
zip -j dist/ssh-notify-tool-win-x64.zip dist/binaries/ssh-notify-tool-win.exe
```

## Maintenance

### Health Monitoring

```bash
# Check server health
curl http://localhost:3000/api/health

# Check plugin status
curl -H "Authorization: Bearer your-token" http://localhost:3000/api/plugins

# View logs
tail -f ~/.notifytool/logs/server.log

# Docker logs
docker logs ssh-notify-tool -f
```

### Updates and Migrations

```bash
# Update via NPM
npm update -g ssh-notify-tool

# Update Docker image
docker pull your-username/ssh-notify-tool:latest
docker-compose pull
docker-compose up -d

# Backup configuration
cp ~/.notifytool/config.json ~/.notifytool/config.json.backup

# Restore configuration
cp ~/.notifytool/config.json.backup ~/.notifytool/config.json
```

### Security Updates

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update Docker base image
docker build --no-cache -t ssh-notify-tool .
```

### Performance Tuning

```bash
# Monitor resource usage
docker stats ssh-notify-tool

# Adjust memory limits
docker run --memory=512m ssh-notify-tool

# Configure log rotation
# Edit ~/.notifytool/config.json:
{
  "logging": {
    "maxSize": "10MB",
    "maxFiles": 5
  }
}
```

### Troubleshooting

#### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   lsof -ti:3000
   kill $(lsof -ti:3000)
   
   # Or use different port
   docker run -p 3001:3000 ssh-notify-tool
   ```

2. **Permission Denied**
   ```bash
   # Fix file permissions
   chmod 600 ~/.notifytool/config.json
   chown -R $USER ~/.notifytool
   ```

3. **Plugin Not Loading**
   ```bash
   # Check plugin directory
   ls -la ~/.notifytool/plugins/
   
   # Validate plugin
   node -e "console.log(require('./path/to/plugin'))"
   ```

4. **Email Not Working**
   ```bash
   # Test SMTP connection
   telnet smtp.gmail.com 587
   
   # Check app-specific passwords
   # Enable 2FA and generate app password for Gmail
   ```

#### Debug Mode

```bash
# Enable debug logging
DEBUG=notify:* notify-server --config ~/.notifytool/config.json

# Docker debug mode
docker run -e DEBUG=notify:* ssh-notify-tool

# Verbose logging
docker run -e NODE_ENV=development ssh-notify-tool
```

#### Log Analysis

```bash
# Real-time log monitoring
tail -f ~/.notifytool/logs/server.log | grep ERROR

# Docker log analysis
docker logs ssh-notify-tool 2>&1 | grep -i error

# System service logs
journalctl -u notify-server -f
```

## Production Deployment

### Production Checklist

- [ ] Secure authentication token configured
- [ ] HTTPS enabled (use reverse proxy)
- [ ] Log rotation configured
- [ ] Health monitoring set up
- [ ] Backup strategy in place
- [ ] Security updates automated
- [ ] Rate limiting configured
- [ ] Error alerting configured

### Reverse Proxy Configuration

#### Nginx
```nginx
server {
    listen 443 ssl;
    server_name notify.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Apache
```apache
<VirtualHost *:443>
    ServerName notify.yourdomain.com
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    ProxyPreserveHost On
</VirtualHost>
```

### Monitoring and Alerting

```bash
# Set up monitoring with curl
*/5 * * * * curl -f http://localhost:3000/api/health || echo "SSH Notify Tool is down" | mail -s "Alert" admin@company.com

# Docker health checks
docker run --health-cmd="curl -f http://localhost:3000/api/health || exit 1" ssh-notify-tool

# Prometheus monitoring (optional)
# Configure metrics endpoint if implemented
```

This deployment guide provides comprehensive instructions for deploying, maintaining, and distributing the SSH Notify Tool in various environments.