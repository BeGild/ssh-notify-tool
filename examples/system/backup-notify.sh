#!/bin/bash
# Backup Script with SSH Notify Tool Integration
# Usage: ./backup-notify.sh [backup-type] [destination]

set -euo pipefail

# Configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/backup.log"
NOTIFY_SERVER="${NOTIFY_SERVER:-http://localhost:3000}"
NOTIFY_TOKEN="${NOTIFY_TOKEN:-}"
NOTIFY_REMOTE="${NOTIFY_REMOTE:-}"  # SSH host for remote notifications

# Default backup settings
BACKUP_TYPE="${1:-full}"
DESTINATION="${2:-/backup}"
SOURCE_DIRS=("/home" "/etc" "/var/www")
RETENTION_DAYS=30
COMPRESSION_LEVEL=6

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${2:-$NC}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

# Notification function
send_notification() {
    local title="$1"
    local message="$2"
    local level="${3:-info}"
    local channels="${4:-desktop,email}"
    
    local metadata="{
        \"server\": \"$(hostname)\",
        \"script\": \"$SCRIPT_NAME\",
        \"backupType\": \"$BACKUP_TYPE\",
        \"destination\": \"$DESTINATION\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }"
    
    local notification_data="{
        \"title\": \"$title\",
        \"message\": \"$message\",
        \"level\": \"$level\",
        \"channels\": [$(echo "$channels" | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')]",
        \"metadata\": $metadata,
        \"tags\": [\"backup\", \"$(hostname)\", \"$BACKUP_TYPE\"]
    }"
    
    if [[ -n "$NOTIFY_REMOTE" ]]; then
        # Send via SSH tunnel
        notify-cli "$title" \
            --message "$message" \
            --level "$level" \
            --remote "$NOTIFY_REMOTE" \
            --token "$NOTIFY_TOKEN" \
            --channels "$channels" \
            --metadata "$metadata" \
            --tags "backup,$(hostname),$BACKUP_TYPE" \
            --quiet
    else
        # Send directly to local server
        curl -s -X POST "$NOTIFY_SERVER/api/notify" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $NOTIFY_TOKEN" \
            -d "$notification_data" > /dev/null || {
            log "Failed to send notification" "$RED"
        }
    fi
}

# Cleanup function
cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        log "Backup script interrupted with exit code $exit_code" "$RED"
        send_notification "🚨 Backup Interrupted" \
            "Backup script on $(hostname) was interrupted unexpectedly" \
            "error" \
            "desktop,email,sms"
    fi
    
    # Clean up temporary files
    [[ -n "${temp_dir:-}" && -d "$temp_dir" ]] && rm -rf "$temp_dir"
}

# Set up trap for cleanup
trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..." "$BLUE"
    
    # Check if destination exists
    if [[ ! -d "$DESTINATION" ]]; then
        log "Creating backup destination: $DESTINATION" "$YELLOW"
        mkdir -p "$DESTINATION"
    fi
    
    # Check available disk space
    local available_space=$(df "$DESTINATION" | awk 'NR==2 {print $4}')
    local required_space=1048576  # 1GB in KB
    
    if [[ $available_space -lt $required_space ]]; then
        log "Insufficient disk space. Available: ${available_space}KB, Required: ${required_space}KB" "$RED"
        send_notification "❌ Backup Failed - Insufficient Space" \
            "Not enough disk space available for backup on $(hostname)" \
            "error" \
            "desktop,email"
        exit 1
    fi
    
    # Check if rsync is available
    if ! command -v rsync >/dev/null 2>&1; then
        log "rsync is required but not installed" "$RED"
        exit 1
    fi
}

# Perform backup
perform_backup() {
    log "Starting $BACKUP_TYPE backup to $DESTINATION..." "$BLUE"
    
    local backup_start=$(date +%s)
    local backup_dir="$DESTINATION/backup-$(date +%Y%m%d_%H%M%S)"
    local temp_dir=$(mktemp -d)
    local total_size=0
    local files_count=0
    
    # Create backup directory
    mkdir -p "$backup_dir"
    
    # Send start notification
    send_notification "🔄 Backup Started" \
        "$BACKUP_TYPE backup started on $(hostname)" \
        "info" \
        "desktop"
    
    # Backup each source directory
    for source in "${SOURCE_DIRS[@]}"; do
        if [[ -d "$source" ]]; then
            log "Backing up $source..." "$BLUE"
            
            local dest_name=$(basename "$source")
            local dest_path="$backup_dir/$dest_name"
            
            # Perform rsync backup
            rsync -avH --progress \
                --exclude='*.tmp' \
                --exclude='*.log' \
                --exclude='.cache' \
                --stats \
                "$source/" "$dest_path/" > "$temp_dir/rsync_$dest_name.log" 2>&1
            
            # Parse rsync stats
            local dir_files=$(grep "Number of files:" "$temp_dir/rsync_$dest_name.log" | awk '{print $4}' | sed 's/,//g')
            local dir_size=$(grep "Total file size:" "$temp_dir/rsync_$dest_name.log" | awk '{print $4}' | sed 's/,//g')
            
            files_count=$((files_count + dir_files))
            total_size=$((total_size + dir_size))
            
            log "Completed backup of $source ($dir_files files, $(numfmt --to=iec $dir_size))" "$GREEN"
        else
            log "Warning: Source directory $source does not exist" "$YELLOW"
        fi
    done
    
    # Create backup manifest
    cat > "$backup_dir/MANIFEST" << EOF
Backup Type: $BACKUP_TYPE
Start Time: $(date -d "@$backup_start")
End Time: $(date)
Duration: $(($(date +%s) - backup_start)) seconds
Total Files: $files_count
Total Size: $(numfmt --to=iec $total_size)
Server: $(hostname)
Script: $SCRIPT_NAME
Source Directories: $(printf '%s ' "${SOURCE_DIRS[@]}")
EOF
    
    # Compress backup if requested
    if [[ "$BACKUP_TYPE" == "full" ]]; then
        log "Compressing backup..." "$BLUE"
        tar -czf "$backup_dir.tar.gz" -C "$DESTINATION" "$(basename "$backup_dir")"
        rm -rf "$backup_dir"
        backup_dir="$backup_dir.tar.gz"
    fi
    
    local backup_duration=$(($(date +%s) - backup_start))
    local backup_size=$(stat -c%s "$backup_dir" 2>/dev/null || echo "0")
    
    log "Backup completed successfully in ${backup_duration}s" "$GREEN"
    log "Backup size: $(numfmt --to=iec $backup_size)" "$GREEN"
    log "Files backed up: $files_count" "$GREEN"
    
    # Send success notification
    send_notification "✅ Backup Complete" \
        "Backup completed successfully on $(hostname) in ${backup_duration}s ($(numfmt --to=iec $backup_size))" \
        "success" \
        "desktop,email"
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..." "$BLUE"
    
    local deleted_count=0
    local freed_space=0
    
    while IFS= read -r -d '' backup_file; do
        local file_size=$(stat -c%s "$backup_file" 2>/dev/null || echo "0")
        rm -f "$backup_file"
        deleted_count=$((deleted_count + 1))
        freed_space=$((freed_space + file_size))
        log "Deleted old backup: $(basename "$backup_file")" "$YELLOW"
    done < <(find "$DESTINATION" -name "backup-*" -type f -mtime +$RETENTION_DAYS -print0)
    
    if [[ $deleted_count -gt 0 ]]; then
        log "Cleanup complete: deleted $deleted_count files, freed $(numfmt --to=iec $freed_space)" "$GREEN"
        send_notification "🗑️ Backup Cleanup" \
            "Cleaned up $deleted_count old backups on $(hostname), freed $(numfmt --to=iec $freed_space)" \
            "info" \
            "desktop"
    else
        log "No old backups to clean up" "$GREEN"
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..." "$BLUE"
    
    # Find the most recent backup
    local recent_backup=$(find "$DESTINATION" -name "backup-*" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [[ -z "$recent_backup" ]]; then
        log "No backup found for verification" "$YELLOW"
        return 1
    fi
    
    # Basic integrity check
    if [[ "$recent_backup" == *.tar.gz ]]; then
        if tar -tzf "$recent_backup" >/dev/null 2>&1; then
            log "Backup archive integrity verified" "$GREEN"
            return 0
        else
            log "Backup archive is corrupted!" "$RED"
            send_notification "❌ Backup Corrupted" \
                "Backup verification failed on $(hostname) - archive is corrupted" \
                "error" \
                "desktop,email,sms"
            return 1
        fi
    else
        # Check directory structure
        if [[ -f "$recent_backup/MANIFEST" ]]; then
            log "Backup directory structure verified" "$GREEN"
            return 0
        else
            log "Backup directory structure is incomplete" "$RED"
            return 1
        fi
    fi
}

# Main function
main() {
    log "=== Starting Backup Process ===" "$BLUE"
    log "Backup type: $BACKUP_TYPE" "$BLUE"
    log "Destination: $DESTINATION" "$BLUE"
    log "Server: $(hostname)" "$BLUE"
    
    # Check prerequisites
    check_prerequisites
    
    # Perform backup
    if perform_backup; then
        # Clean up old backups
        cleanup_old_backups
        
        # Verify backup
        if verify_backup; then
            log "=== Backup Process Completed Successfully ===" "$GREEN"
            exit 0
        else
            log "=== Backup Process Completed with Verification Issues ===" "$YELLOW"
            exit 2
        fi
    else
        log "=== Backup Process Failed ===" "$RED"
        send_notification "❌ Backup Failed" \
            "Backup process failed on $(hostname)" \
            "error" \
            "desktop,email,sms"
        exit 1
    fi
}

# Show usage information
show_usage() {
    echo "Usage: $0 [backup-type] [destination]"
    echo ""
    echo "Arguments:"
    echo "  backup-type    Type of backup: full, incremental (default: full)"
    echo "  destination    Backup destination directory (default: /backup)"
    echo ""
    echo "Environment Variables:"
    echo "  NOTIFY_SERVER  Notification server URL (default: http://localhost:3000)"
    echo "  NOTIFY_TOKEN   Authentication token for notifications"
    echo "  NOTIFY_REMOTE  SSH remote host for notifications (optional)"
    echo ""
    echo "Examples:"
    echo "  $0                              # Full backup to /backup"
    echo "  $0 incremental /mnt/backup     # Incremental backup to /mnt/backup"
    echo "  NOTIFY_REMOTE=user@server $0   # Send notifications via SSH tunnel"
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        show_usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac