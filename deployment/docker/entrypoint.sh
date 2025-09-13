#!/bin/bash
# Docker entrypoint script for SSH Notify Tool
set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${2:-$NC}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

log_info() {
    log "$1" "$BLUE"
}

log_success() {
    log "$1" "$GREEN"
}

log_warning() {
    log "$1" "$YELLOW"
}

log_error() {
    log "$1" "$RED"
}

# Configuration paths
CONFIG_PATH="${NOTIFY_CONFIG_PATH:-/app/config/config.json}"
PLUGINS_PATH="${NOTIFY_PLUGINS_PATH:-/app/plugins}"
LOGS_PATH="${NOTIFY_LOGS_PATH:-/app/logs}"

# Ensure directories exist
mkdir -p "$(dirname "$CONFIG_PATH")" "$PLUGINS_PATH" "$LOGS_PATH"

# Function to create default configuration
create_default_config() {
    log_info "Creating default configuration..."
    
    cat > "$CONFIG_PATH" << 'EOF'
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "enabled": true,
      "token": "CHANGE_ME_IN_PRODUCTION"
    },
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:3000"]
    },
    "rateLimit": {
      "enabled": true,
      "windowMs": 60000,
      "max": 100
    }
  },
  "plugins": {
    "desktop": {
      "enabled": false,
      "comment": "Desktop notifications disabled in container"
    },
    "email": {
      "enabled": false,
      "provider": "gmail",
      "auth": {
        "user": "${SMTP_USER}",
        "pass": "${SMTP_PASS}"
      },
      "from": "${SMTP_FROM}",
      "to": ["${EMAIL_TO}"]
    },
    "slack": {
      "enabled": false,
      "webhookUrl": "${SLACK_WEBHOOK_URL}",
      "channel": "#notifications",
      "username": "NotifyBot"
    },
    "dingtalk": {
      "enabled": false,
      "webhookUrl": "${DINGTALK_WEBHOOK_URL}",
      "secret": "${DINGTALK_SECRET}"
    }
  },
  "channels": ["email"],
  "logging": {
    "level": "info",
    "file": "/app/logs/server.log",
    "maxSize": "10MB",
    "maxFiles": 5
  }
}
EOF

    log_success "Default configuration created at $CONFIG_PATH"
}

# Function to validate configuration
validate_config() {
    log_info "Validating configuration..."
    
    if [[ ! -f "$CONFIG_PATH" ]]; then
        log_warning "Configuration file not found, creating default"
        create_default_config
    fi
    
    # Check if configuration is valid JSON
    if ! node -e "JSON.parse(require('fs').readFileSync('$CONFIG_PATH', 'utf8'))" 2>/dev/null; then
        log_error "Invalid JSON configuration file"
        return 1
    fi
    
    # Validate required fields
    local required_fields=(
        ".server.port"
        ".server.host" 
        ".plugins"
    )
    
    for field in "${required_fields[@]}"; do
        if ! node -e "
            const config = JSON.parse(require('fs').readFileSync('$CONFIG_PATH', 'utf8'));
            const value = config$(echo $field | sed 's/\.//');
            if (value === undefined) process.exit(1);
        " 2>/dev/null; then
            log_error "Missing required configuration field: $field"
            return 1
        fi
    done
    
    log_success "Configuration validation passed"
}

# Function to substitute environment variables in config
substitute_env_vars() {
    log_info "Substituting environment variables in configuration..."
    
    # List of environment variables to substitute
    local env_vars=(
        "NOTIFY_AUTH_TOKEN"
        "SMTP_USER"
        "SMTP_PASS" 
        "SMTP_FROM"
        "EMAIL_TO"
        "SLACK_WEBHOOK_URL"
        "DINGTALK_WEBHOOK_URL"
        "DINGTALK_SECRET"
    )
    
    for var in "${env_vars[@]}"; do
        if [[ -n "${!var:-}" ]]; then
            log_info "Substituting $var"
            # Use sed to replace placeholder with actual value
            sed -i "s/\${$var}/${!var//\//\\/}/g" "$CONFIG_PATH"
        fi
    done
    
    # Special handling for auth token
    if [[ -n "${NOTIFY_AUTH_TOKEN:-}" ]]; then
        log_info "Setting authentication token"
        node -e "
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('$CONFIG_PATH', 'utf8'));
            config.server.auth.token = process.env.NOTIFY_AUTH_TOKEN;
            fs.writeFileSync('$CONFIG_PATH', JSON.stringify(config, null, 2));
        "
    fi
}

# Function to load plugins
load_plugins() {
    log_info "Loading plugins from $PLUGINS_PATH..."
    
    if [[ -d "$PLUGINS_PATH" ]] && [[ "$(ls -A "$PLUGINS_PATH" 2>/dev/null)" ]]; then
        local plugin_count=0
        
        for plugin_dir in "$PLUGINS_PATH"/*; do
            if [[ -d "$plugin_dir" ]] && [[ -f "$plugin_dir/package.json" ]]; then
                plugin_name=$(basename "$plugin_dir")
                log_info "Found plugin: $plugin_name"
                plugin_count=$((plugin_count + 1))
            fi
        done
        
        log_success "Loaded $plugin_count plugins"
    else
        log_info "No plugins found in $PLUGINS_PATH"
    fi
}

# Function to perform system checks
perform_system_checks() {
    log_info "Performing system checks..."
    
    # Check Node.js version
    local node_version=$(node --version)
    log_info "Node.js version: $node_version"
    
    # Check available memory
    local memory_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo "unknown")
    if [[ "$memory_kb" != "unknown" ]]; then
        local memory_mb=$((memory_kb / 1024))
        log_info "Available memory: ${memory_mb}MB"
        
        if [[ $memory_mb -lt 512 ]]; then
            log_warning "Low memory detected ($memory_mb MB). Consider increasing container memory."
        fi
    fi
    
    # Check disk space
    local disk_usage=$(df /app 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//' || echo "unknown")
    if [[ "$disk_usage" != "unknown" ]] && [[ $disk_usage -gt 80 ]]; then
        log_warning "High disk usage: ${disk_usage}%"
    fi
    
    # Check port availability
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":3000 "; then
            log_warning "Port 3000 is already in use"
        fi
    fi
    
    log_success "System checks completed"
}

# Function to wait for dependencies
wait_for_dependencies() {
    log_info "Checking for external dependencies..."
    
    # If SMTP is configured, test connectivity
    if [[ -n "${SMTP_HOST:-}" ]] && [[ -n "${SMTP_PORT:-}" ]]; then
        log_info "Testing SMTP connectivity to ${SMTP_HOST}:${SMTP_PORT}..."
        if timeout 10 bash -c "</dev/tcp/${SMTP_HOST}/${SMTP_PORT}" 2>/dev/null; then
            log_success "SMTP server is reachable"
        else
            log_warning "Cannot connect to SMTP server (${SMTP_HOST}:${SMTP_PORT})"
        fi
    fi
    
    # Test webhook URLs if configured
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        log_info "Testing Slack webhook connectivity..."
        if curl -s -f -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d '{"text":"SSH Notify Tool container starting"}' >/dev/null 2>&1; then
            log_success "Slack webhook is accessible"
        else
            log_warning "Cannot access Slack webhook"
        fi
    fi
}

# Function to start the application
start_application() {
    log_info "Starting SSH Notify Tool server..."
    log_info "Configuration: $CONFIG_PATH"
    log_info "Plugins path: $PLUGINS_PATH"
    log_info "Logs path: $LOGS_PATH"
    
    # Validate final configuration
    validate_config || {
        log_error "Configuration validation failed"
        exit 1
    }
    
    log_success "SSH Notify Tool starting with PID $$"
    log_info "Command: $*"
    
    # Execute the provided command
    exec "$@"
}

# Main execution
main() {
    log_info "=== SSH Notify Tool Container Starting ==="
    log_info "Environment: ${NODE_ENV:-production}"
    log_info "User: $(whoami)"
    log_info "Working directory: $(pwd)"
    
    # Handle special commands
    case "${1:-}" in
        "config")
            create_default_config
            exit 0
            ;;
        "validate")
            validate_config
            exit $?
            ;;
        "check")
            perform_system_checks
            exit 0
            ;;
        "bash"|"sh")
            exec "$@"
            ;;
    esac
    
    # Perform startup sequence
    validate_config
    substitute_env_vars
    load_plugins
    perform_system_checks
    
    # Wait for dependencies if in production
    if [[ "${NODE_ENV:-production}" == "production" ]]; then
        wait_for_dependencies
    fi
    
    # Start the application
    start_application "$@"
}

# Handle signals for graceful shutdown
trap 'log_info "Received SIGTERM, shutting down gracefully..."; kill -TERM $PID; wait $PID' TERM
trap 'log_info "Received SIGINT, shutting down..."; kill -INT $PID; wait $PID' INT

# Run main function
main "$@" &
PID=$!
wait $PID