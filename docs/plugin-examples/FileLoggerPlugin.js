/**
 * @fileoverview File Logger Plugin Example  
 * Demonstrates a simple file-based logging plugin for notifications
 */

const fs = require('fs').promises;
const path = require('path');
const BasePlugin = require('../../src/plugins/BasePlugin');

class FileLoggerPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'file-logger',
      displayName: 'File Notification Logger',
      version: '1.0.0',
      author: 'SSH Notify Tool Team', 
      description: 'Log notifications to files with rotation and formatting options',
      capabilities: ['logging', 'rotation', 'formatting'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'logPath'],
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable or disable file logging'
          },
          logPath: {
            type: 'string',
            description: 'Base path for log files'
          },
          format: {
            type: 'string',
            enum: ['json', 'text', 'csv'],
            default: 'json',
            description: 'Log format'
          },
          dateFormat: {
            type: 'string',
            default: 'YYYY-MM-DD HH:mm:ss',
            description: 'Date format for timestamps'
          },
          rotation: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                default: true,
                description: 'Enable log rotation'
              },
              maxSize: {
                type: 'string',
                default: '100MB',
                description: 'Maximum file size before rotation'
              },
              maxFiles: {
                type: 'integer',
                default: 10,
                minimum: 1,
                description: 'Maximum number of rotated files to keep'
              },
              frequency: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly'],
                default: 'daily',
                description: 'Rotation frequency'
              }
            }
          },
          buffer: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                default: true,
                description: 'Enable buffered writing'
              },
              size: {
                type: 'integer',
                default: 1000,
                minimum: 1,
                description: 'Buffer size (number of entries)'
              },
              flushInterval: {
                type: 'integer',
                default: 5000,
                minimum: 1000,
                description: 'Buffer flush interval in milliseconds'
              }
            }
          }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    this.logBuffer = [];
    this.flushTimer = null;
    this.currentLogFile = null;
    this.lastRotation = new Date();
    
    // Initialize log file path
    this._initLogFile();
    
    // Start buffer flush timer
    if (this.config.buffer?.enabled !== false) {
      this._startFlushTimer();
    }
  }

  _initLogFile() {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `notifications-${timestamp}.log`;
    this.currentLogFile = path.join(this.config.logPath, filename);
  }

  async send(notification) {
    try {
      if (!this.config.enabled) {
        return this._createResponse(true, 'File logging is disabled');
      }

      // Check if rotation is needed
      await this._checkRotation();

      // Format log entry
      const logEntry = this._formatLogEntry(notification);

      // Add to buffer or write immediately
      if (this.config.buffer?.enabled !== false) {
        this.logBuffer.push(logEntry);
        
        // Flush if buffer is full
        if (this.logBuffer.length >= (this.config.buffer?.size || 1000)) {
          await this._flushBuffer();
        }
      } else {
        await this._writeToFile([logEntry]);
      }

      return this._createResponse(true, 'Notification logged to file', {
        logFile: this.currentLogFile,
        format: this.config.format || 'json',
        buffered: this.config.buffer?.enabled !== false,
        bufferSize: this.logBuffer.length
      });

    } catch (error) {
      return this._handleError(error, 'log notification to file');
    }
  }

  _formatLogEntry(notification) {
    const timestamp = this._formatTimestamp(new Date());
    const format = this.config.format || 'json';

    const baseEntry = {
      timestamp,
      title: notification.title,
      message: notification.message,
      level: notification.level || 'info',
      metadata: notification.metadata || {},
      source: notification.metadata?.source || 'unknown',
      channels: notification.channels || []
    };

    switch (format) {
      case 'json':
        return JSON.stringify(baseEntry);
      
      case 'csv':
        const csvValues = [
          timestamp,
          this._escapeCsv(notification.title),
          this._escapeCsv(notification.message),
          notification.level || 'info',
          this._escapeCsv(JSON.stringify(notification.metadata || {})),
          notification.metadata?.source || 'unknown',
          (notification.channels || []).join(';')
        ];
        return csvValues.join(',');
      
      case 'text':
      default:
        const metadataStr = Object.keys(baseEntry.metadata).length > 0 
          ? ` [${Object.entries(baseEntry.metadata).map(([k,v]) => `${k}=${v}`).join(', ')}]`
          : '';
        
        return `${timestamp} [${baseEntry.level.toUpperCase()}] ${baseEntry.title}: ${baseEntry.message}${metadataStr}`;
    }
  }

  _formatTimestamp(date) {
    const format = this.config.dateFormat || 'YYYY-MM-DD HH:mm:ss';
    
    // Simple date formatting (in production, consider using a library like moment.js)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  _escapeCsv(str) {
    if (str === null || str === undefined) return '';
    const stringified = String(str);
    if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
      return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
  }

  async _checkRotation() {
    const rotation = this.config.rotation;
    if (!rotation?.enabled) return;

    const now = new Date();
    let needsRotation = false;

    // Check size-based rotation
    if (rotation.maxSize) {
      try {
        const stats = await fs.stat(this.currentLogFile);
        const maxSizeBytes = this._parseSize(rotation.maxSize);
        
        if (stats.size >= maxSizeBytes) {
          needsRotation = true;
        }
      } catch (error) {
        // File doesn't exist yet, no need to rotate
      }
    }

    // Check time-based rotation
    if (rotation.frequency) {
      const shouldRotate = this._shouldRotateByTime(now, rotation.frequency);
      if (shouldRotate) {
        needsRotation = true;
      }
    }

    if (needsRotation) {
      await this._rotateLogFile();
    }
  }

  _parseSize(sizeStr) {
    const units = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+)(\w+)$/);
    if (!match) return 100 * 1024 * 1024; // Default 100MB

    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
  }

  _shouldRotateByTime(now, frequency) {
    switch (frequency) {
      case 'daily':
        return now.getDate() !== this.lastRotation.getDate();
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const lastWeekStart = new Date(this.lastRotation);
        lastWeekStart.setDate(this.lastRotation.getDate() - this.lastRotation.getDay());
        return weekStart.getTime() !== lastWeekStart.getTime();
      case 'monthly':
        return now.getMonth() !== this.lastRotation.getMonth() || 
               now.getFullYear() !== this.lastRotation.getFullYear();
      default:
        return false;
    }
  }

  async _rotateLogFile() {
    try {
      // Flush current buffer
      await this._flushBuffer();

      // Create rotated filename
      const timestamp = this.lastRotation.toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(this.currentLogFile);
      const basename = path.basename(this.currentLogFile, ext);
      const dirname = path.dirname(this.currentLogFile);
      
      const rotatedFile = path.join(dirname, `${basename}-${timestamp}${ext}`);

      // Move current log file
      try {
        await fs.rename(this.currentLogFile, rotatedFile);
      } catch (error) {
        // File might not exist, that's okay
      }

      // Clean up old rotated files
      await this._cleanupRotatedFiles();

      // Update current log file and rotation time
      this._initLogFile();
      this.lastRotation = new Date();

    } catch (error) {
      console.warn(`Log rotation failed: ${error.message}`);
    }
  }

  async _cleanupRotatedFiles() {
    const maxFiles = this.config.rotation?.maxFiles || 10;
    const dirname = path.dirname(this.currentLogFile);
    const basename = path.basename(this.currentLogFile, path.extname(this.currentLogFile));

    try {
      const files = await fs.readdir(dirname);
      const rotatedFiles = files
        .filter(file => file.startsWith(basename) && file.includes('-20')) // Contains date
        .map(file => ({
          name: file,
          path: path.join(dirname, file),
          stat: null
        }));

      // Get file stats
      for (const file of rotatedFiles) {
        try {
          file.stat = await fs.stat(file.path);
        } catch (error) {
          // Ignore files that can't be accessed
        }
      }

      // Sort by modification time (newest first)
      rotatedFiles
        .filter(file => file.stat)
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // Delete old files
      if (rotatedFiles.length > maxFiles) {
        const filesToDelete = rotatedFiles.slice(maxFiles);
        
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file.path);
          } catch (error) {
            console.warn(`Failed to delete old log file ${file.name}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.warn(`Log cleanup failed: ${error.message}`);
    }
  }

  async _flushBuffer() {
    if (this.logBuffer.length === 0) return;

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      await this._writeToFile(entries);
    } catch (error) {
      // Re-add entries to buffer on failure (with limit)
      if (this.logBuffer.length < 10000) {
        this.logBuffer.unshift(...entries);
      }
      throw error;
    }
  }

  async _writeToFile(entries) {
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.currentLogFile), { recursive: true });

    // Prepare content
    let content = entries.join('\n') + '\n';

    // Add CSV header if needed
    if (this.config.format === 'csv') {
      try {
        await fs.access(this.currentLogFile);
      } catch (error) {
        // File doesn't exist, add CSV header
        const header = 'timestamp,title,message,level,metadata,source,channels\n';
        content = header + content;
      }
    }

    // Write to file
    await fs.appendFile(this.currentLogFile, content, 'utf8');
  }

  _startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    const interval = this.config.buffer?.flushInterval || 5000;
    this.flushTimer = setInterval(async () => {
      try {
        await this._flushBuffer();
      } catch (error) {
        console.error(`Buffer flush failed: ${error.message}`);
      }
    }, interval);
  }

  async validate(config) {
    try {
      if (typeof config.enabled !== 'boolean') {
        return false;
      }

      if (config.enabled) {
        if (!config.logPath) {
          return false;
        }

        // Check if log directory is writable
        try {
          await fs.mkdir(config.logPath, { recursive: true });
          await fs.access(config.logPath, fs.constants.W_OK);
        } catch (error) {
          console.warn(`Log directory not writable: ${error.message}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn(`File logger validation failed: ${error.message}`);
      return false;
    }
  }

  async isAvailable() {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // Check if log directory is writable
      await fs.access(path.dirname(this.currentLogFile), fs.constants.W_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  async setup(config) {
    await super.setup(config);
    this._initLogFile();
    
    if (this.config.buffer?.enabled !== false) {
      this._startFlushTimer();
    }
  }

  async cleanup() {
    // Flush remaining entries
    await this._flushBuffer();

    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async healthCheck() {
    if (!this.config.enabled) {
      return {
        healthy: false,
        message: 'File logging is disabled'
      };
    }

    try {
      // Check directory access
      await fs.access(path.dirname(this.currentLogFile), fs.constants.W_OK);
      
      // Get current log file stats
      let fileSize = 0;
      try {
        const stats = await fs.stat(this.currentLogFile);
        fileSize = stats.size;
      } catch (error) {
        // File doesn't exist yet
      }

      return {
        healthy: true,
        message: 'File logger is healthy',
        metadata: {
          currentLogFile: this.currentLogFile,
          fileSize,
          bufferSize: this.logBuffer.length,
          format: this.config.format || 'json',
          rotationEnabled: this.config.rotation?.enabled || false,
          bufferingEnabled: this.config.buffer?.enabled !== false
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `File logger error: ${error.message}`
      };
    }
  }

  // Utility methods
  async getLogFiles() {
    const dirname = path.dirname(this.currentLogFile);
    const basename = path.basename(this.currentLogFile, path.extname(this.currentLogFile));

    try {
      const files = await fs.readdir(dirname);
      return files
        .filter(file => file.startsWith(basename))
        .map(file => path.join(dirname, file));
    } catch (error) {
      return [];
    }
  }

  async tailLog(lines = 100) {
    try {
      const content = await fs.readFile(this.currentLogFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      return [];
    }
  }
}

module.exports = FileLoggerPlugin;

/*
Example configuration:

{
  "plugins": {
    "file-logger": {
      "enabled": true,
      "logPath": "/var/log/ssh-notify-tool",
      "format": "json",
      "dateFormat": "YYYY-MM-DD HH:mm:ss",
      "rotation": {
        "enabled": true,
        "maxSize": "50MB",
        "maxFiles": 5,
        "frequency": "daily"
      },
      "buffer": {
        "enabled": true,
        "size": 500,
        "flushInterval": 3000
      }
    }
  }
}

CSV format configuration:
{
  "format": "csv",
  "rotation": {
    "enabled": true,
    "maxSize": "10MB",
    "maxFiles": 20
  }
}

Text format with custom date:
{
  "format": "text", 
  "dateFormat": "DD/MM/YYYY HH:mm:ss",
  "buffer": {
    "enabled": false
  }
}

Usage examples:

// All notifications are automatically logged
await notificationClient.notify({
  title: "System Maintenance",
  message: "Scheduled maintenance window starting",
  level: "warning",
  metadata: {
    source: "maintenance-scheduler",
    environment: "production",
    maintainer: "ops-team"
  }
});

// Get recent log entries
const recentLogs = await plugin.tailLog(50);
console.log('Recent notifications:', recentLogs);

// List all log files
const logFiles = await plugin.getLogFiles();
console.log('Available log files:', logFiles);
*/