#!/bin/bash
# SSH Notify Tool Installation Script
# Supports: Ubuntu, CentOS, macOS, and Alpine Linux

set -euo pipefail

# Configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_VERSION="1.0.0"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="$HOME/.notifytool"
SERVICE_DIR="/etc/systemd/system"
LOG_FILE="/tmp/notify-install.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${2:-$NC}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
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

# Platform detection
detect_platform() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get >/dev/null 2>&1; then
            PLATFORM="ubuntu"
            PACKAGE_MANAGER="apt-get"
        elif command -v yum >/dev/null 2>&1; then
            PLATFORM="centos"
            PACKAGE_MANAGER="yum"
        elif command -v apk >/dev/null 2>&1; then
            PLATFORM="alpine"
            PACKAGE_MANAGER="apk"
        else
            PLATFORM="linux"
            PACKAGE_MANAGER="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="macos"
        PACKAGE_MANAGER="brew"
    else
        PLATFORM="unknown"
        PACKAGE_MANAGER="unknown"
    fi
    
    log_info "Detected platform: $PLATFORM"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if running as root for system installation
    if [[ "${INSTALL_SYSTEM:-false}" == "true" ]] && [[ $EUID -ne 0 ]]; then
        log_error "System installation requires root privileges"
        echo "Run with sudo: sudo $0 --system"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        log_warning "Node.js not found, will attempt to install"
        NEED_NODE=true
    else
        local node_version=$(node --version | sed 's/v//')
        local major_version=$(echo "$node_version" | cut -d. -f1)
        
        if [[ $major_version -lt 16 ]]; then
            log_warning "Node.js version $node_version is too old (minimum: 16.x)"
            NEED_NODE=true
        else
            log_success "Node.js version $node_version is compatible"
            NEED_NODE=false
        fi
    fi
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        log_warning "npm not found, will install with Node.js"
    fi
    
    # Check curl
    if ! command -v curl >/dev/null 2>&1; then
        log_warning "curl not found, will attempt to install"
        NEED_CURL=true
    else
        NEED_CURL=false
    fi
}

# Install system dependencies
install_dependencies() {
    log_info "Installing system dependencies..."
    
    case "$PLATFORM" in
        ubuntu)
            if [[ "${NEED_NODE:-false}" == "true" ]]; then
                log_info "Installing Node.js via NodeSource repository..."
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
                sudo apt-get install -y nodejs
            fi
            
            if [[ "${NEED_CURL:-false}" == "true" ]]; then
                sudo apt-get update
                sudo apt-get install -y curl
            fi
            
            # Install desktop notification dependencies
            sudo apt-get install -y libnotify-bin
            ;;
            
        centos)
            if [[ "${NEED_NODE:-false}" == "true" ]]; then
                log_info "Installing Node.js via NodeSource repository..."
                curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
                sudo yum install -y nodejs
            fi
            
            if [[ "${NEED_CURL:-false}" == "true" ]]; then
                sudo yum install -y curl
            fi
            
            # Install desktop notification dependencies
            sudo yum install -y libnotify
            ;;
            
        alpine)
            if [[ "${NEED_NODE:-false}" == "true" ]]; then
                sudo apk add --no-cache nodejs npm
            fi
            
            if [[ "${NEED_CURL:-false}" == "true" ]]; then
                sudo apk add --no-cache curl
            fi
            
            # Install desktop notification dependencies
            sudo apk add --no-cache libnotify
            ;;
            
        macos)
            if [[ "${NEED_NODE:-false}" == "true" ]]; then
                if command -v brew >/dev/null 2>&1; then
                    brew install node
                else
                    log_error "Homebrew not found. Please install Node.js manually from https://nodejs.org"
                    exit 1
                fi
            fi
            
            # macOS has curl by default
            ;;
            
        *)
            log_error "Unsupported platform: $PLATFORM"
            echo "Please install Node.js 16+ and npm manually, then run:"
            echo "npm install -g ssh-notify-tool"
            exit 1
            ;;
    esac
    
    log_success "System dependencies installed"
}

# Install SSH Notify Tool
install_notify_tool() {
    log_info "Installing SSH Notify Tool..."
    
    # Install method selection
    if [[ "${INSTALL_METHOD:-npm}" == "npm" ]]; then
        # Install from npm
        if [[ "${INSTALL_SYSTEM:-false}" == "true" ]]; then
            sudo npm install -g ssh-notify-tool
        else
            npm install -g ssh-notify-tool
        fi
        log_success "SSH Notify Tool installed from npm"
        
    elif [[ "${INSTALL_METHOD:-npm}" == "local" ]]; then
        # Install from local source
        if [[ ! -f "package.json" ]]; then
            log_error "package.json not found. Run this script from the project root."
            exit 1
        fi
        
        log_info "Installing from local source..."
        npm install
        
        if [[ "${INSTALL_SYSTEM:-false}" == "true" ]]; then
            sudo npm link
        else
            npm link
        fi
        
        log_success "SSH Notify Tool installed from local source"
        
    else
        log_error "Unknown installation method: $INSTALL_METHOD"
        exit 1
    fi
}

# Create configuration directory and files
create_configuration() {
    log_info "Creating configuration..."
    
    # Create config directory
    mkdir -p "$CONFIG_DIR/plugins" "$CONFIG_DIR/logs"
    
    # Create default configuration if it doesn't exist
    if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
        cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "server": {
    "port": 3000,
    "host": "127.0.0.1",
    "auth": {
      "enabled": true,
      "token": "CHANGE_ME_PLEASE"
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
  "channels": ["desktop"],
  "logging": {
    "level": "info",
    "file": "~/.notifytool/logs/server.log"
  }
}
EOF
        
        log_success "Default configuration created at $CONFIG_DIR/config.json"
        log_warning "Please edit the configuration file to set your authentication token"
    else
        log_info "Configuration file already exists at $CONFIG_DIR/config.json"
    fi
    
    # Generate secure token
    log_info "Generating secure authentication token..."
    local secure_token
    if command -v openssl >/dev/null 2>&1; then
        secure_token=$(openssl rand -hex 32)
    else
        secure_token=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    fi
    
    # Replace token in config
    if [[ "$PLATFORM" == "macos" ]]; then
        sed -i '' "s/CHANGE_ME_PLEASE/$secure_token/" "$CONFIG_DIR/config.json"
    else
        sed -i "s/CHANGE_ME_PLEASE/$secure_token/" "$CONFIG_DIR/config.json"
    fi
    
    log_success "Secure authentication token generated and configured"
    echo "Your authentication token: $secure_token" | tee -a "$LOG_FILE"
}

# Create systemd service (Linux only)
create_service() {
    if [[ "$PLATFORM" != "ubuntu" ]] && [[ "$PLATFORM" != "centos" ]]; then
        log_info "Skipping service creation (not supported on $PLATFORM)"
        return 0
    fi
    
    if [[ "${INSTALL_SERVICE:-false}" != "true" ]]; then
        log_info "Skipping service creation (not requested)"
        return 0
    fi
    
    if [[ $EUID -ne 0 ]]; then
        log_warning "Service creation requires root privileges"
        return 0
    fi
    
    log_info "Creating systemd service..."
    
    cat > "$SERVICE_DIR/notify-server.service" << EOF
[Unit]
Description=SSH Notify Tool Server
After=network.target
StartLimitBurst=5
StartLimitIntervalSec=10

[Service]
Type=simple
User=$(logname 2>/dev/null || echo $SUDO_USER)
Group=$(id -gn $(logname 2>/dev/null || echo $SUDO_USER))
WorkingDirectory=$CONFIG_DIR
ExecStart=$(which notify-server) --config $CONFIG_DIR/config.json
Restart=always
RestartSec=1
Environment=NODE_ENV=production

# Security settings
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$CONFIG_DIR

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=notify-server

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable notify-server
    
    log_success "Systemd service created and enabled"
    log_info "Start the service with: sudo systemctl start notify-server"
    log_info "View logs with: journalctl -u notify-server -f"
}

# Test installation
test_installation() {
    log_info "Testing installation..."
    
    # Check if commands are available
    if ! command -v notify-server >/dev/null 2>&1; then
        log_error "notify-server command not found in PATH"
        return 1
    fi
    
    if ! command -v notify-cli >/dev/null 2>&1; then
        log_error "notify-cli command not found in PATH"
        return 1
    fi
    
    # Test server start (dry run)
    if notify-server --config "$CONFIG_DIR/config.json" --dry-run; then
        log_success "Server configuration test passed"
    else
        log_error "Server configuration test failed"
        return 1
    fi
    
    # Test CLI help
    if notify-cli --help >/dev/null 2>&1; then
        log_success "CLI tool test passed"
    else
        log_error "CLI tool test failed"
        return 1
    fi
    
    log_success "Installation test completed successfully"
}

# Show usage information
show_usage() {
    cat << EOF
SSH Notify Tool Installation Script v$SCRIPT_VERSION

Usage: $0 [OPTIONS]

Options:
  --system          Install system-wide (requires sudo)
  --local           Install for current user only (default)
  --service         Create systemd service (Linux only, requires sudo)
  --method METHOD   Installation method: npm (default) or local
  --config-dir DIR  Configuration directory (default: ~/.notifytool)
  --help            Show this help message

Examples:
  $0                          # Install for current user from npm
  sudo $0 --system --service  # System-wide install with service
  $0 --method local           # Install from local source
  $0 --config-dir /etc/notify # Custom config directory

Environment Variables:
  INSTALL_SYSTEM=true         Same as --system
  INSTALL_SERVICE=true        Same as --service
  INSTALL_METHOD=local        Same as --method local

EOF
}

# Main installation function
main() {
    log_info "=== SSH Notify Tool Installation Started ==="
    log_info "Script version: $SCRIPT_VERSION"
    log_info "Log file: $LOG_FILE"
    
    # Detect platform
    detect_platform
    
    # Check prerequisites
    check_prerequisites
    
    # Install dependencies
    install_dependencies
    
    # Install SSH Notify Tool
    install_notify_tool
    
    # Create configuration
    create_configuration
    
    # Create service if requested
    create_service
    
    # Test installation
    if test_installation; then
        log_success "=== Installation completed successfully ==="
        echo ""
        echo "Next steps:"
        echo "1. Edit configuration: $CONFIG_DIR/config.json"
        echo "2. Start server: notify-server --config $CONFIG_DIR/config.json"
        echo "3. Test notification: notify-cli 'Test' --message 'Installation successful'"
        
        if [[ "${INSTALL_SERVICE:-false}" == "true" ]]; then
            echo "4. Start service: sudo systemctl start notify-server"
        fi
        
        echo ""
        echo "Documentation: https://github.com/your-username/ssh-notify-tool"
    else
        log_error "=== Installation failed ==="
        echo "Check the log file for details: $LOG_FILE"
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --system)
            INSTALL_SYSTEM=true
            shift
            ;;
        --local)
            INSTALL_SYSTEM=false
            shift
            ;;
        --service)
            INSTALL_SERVICE=true
            shift
            ;;
        --method)
            INSTALL_METHOD="$2"
            shift 2
            ;;
        --config-dir)
            CONFIG_DIR="$2"
            shift 2
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Run main function
main "$@"