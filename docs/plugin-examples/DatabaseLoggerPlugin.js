/**
 * @fileoverview Database Logger Plugin Example
 * Demonstrates how to log notifications to a database for audit trails and analytics
 */

const BasePlugin = require('../../src/plugins/BasePlugin');

class DatabaseLoggerPlugin extends BasePlugin {
  static get metadata() {
    return {
      name: 'database-logger',
      displayName: 'Database Notification Logger',
      version: '1.0.0',
      author: 'SSH Notify Tool Team',
      description: 'Log all notifications to a database for audit trails and analytics',
      capabilities: ['logging', 'audit', 'analytics'],
      configSchema: {
        type: 'object',
        required: ['enabled', 'database'],
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable or disable database logging'
          },
          database: {
            type: 'object',
            required: ['type'],
            properties: {
              type: {
                type: 'string',
                enum: ['sqlite', 'mysql', 'postgresql', 'mongodb'],
                description: 'Database type'
              },
              connectionString: {
                type: 'string',
                description: 'Database connection string'
              },
              host: { type: 'string' },
              port: { type: 'integer' },
              database: { type: 'string' },
              username: { type: 'string' },
              password: { type: 'string' },
              ssl: { type: 'boolean', default: false }
            }
          },
          table: {
            type: 'string',
            default: 'notifications',
            description: 'Table name for storing notifications'
          },
          retentionDays: {
            type: 'integer',
            minimum: 1,
            default: 365,
            description: 'Number of days to retain notifications'
          },
          batchSize: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: 'Number of notifications to batch before writing'
          },
          flushInterval: {
            type: 'integer',
            minimum: 1000,
            default: 30000,
            description: 'Interval in milliseconds to flush batched notifications'
          }
        }
      }
    };
  }

  constructor(config = {}) {
    super(config);
    
    this.db = null;
    this.batchQueue = [];
    this.flushTimer = null;
    
    // Initialize database connection
    this._initDatabase();
    
    // Start batch flush timer
    this._startFlushTimer();
  }

  async _initDatabase() {
    const { type } = this.config.database;
    
    try {
      switch (type) {
        case 'sqlite':
          await this._initSQLite();
          break;
        case 'mysql':
          await this._initMySQL();
          break;
        case 'postgresql':
          await this._initPostgreSQL();
          break;
        case 'mongodb':
          await this._initMongoDB();
          break;
        default:
          throw new Error(`Unsupported database type: ${type}`);
      }
      
      await this._createSchema();
    } catch (error) {
      console.error(`Failed to initialize database: ${error.message}`);
      this.db = null;
    }
  }

  async _initSQLite() {
    const sqlite3 = require('sqlite3').verbose();
    const { database } = this.config.database;
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(database || ':memory:', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async _initMySQL() {
    const mysql = require('mysql2/promise');
    
    this.db = await mysql.createConnection({
      host: this.config.database.host,
      port: this.config.database.port || 3306,
      user: this.config.database.username,
      password: this.config.database.password,
      database: this.config.database.database,
      ssl: this.config.database.ssl
    });
  }

  async _initPostgreSQL() {
    const { Pool } = require('pg');
    
    this.db = new Pool({
      host: this.config.database.host,
      port: this.config.database.port || 5432,
      user: this.config.database.username,
      password: this.config.database.password,
      database: this.config.database.database,
      ssl: this.config.database.ssl
    });
  }

  async _initMongoDB() {
    const { MongoClient } = require('mongodb');
    
    const client = new MongoClient(this.config.database.connectionString);
    await client.connect();
    
    this.db = client.db(this.config.database.database);
  }

  async _createSchema() {
    const tableName = this.config.table || 'notifications';
    const { type } = this.config.database;
    
    try {
      switch (type) {
        case 'sqlite':
          await this._createSQLiteSchema(tableName);
          break;
        case 'mysql':
          await this._createMySQLSchema(tableName);
          break;
        case 'postgresql':
          await this._createPostgreSQLSchema(tableName);
          break;
        case 'mongodb':
          await this._createMongoDBSchema(tableName);
          break;
      }
    } catch (error) {
      console.warn(`Schema creation warning: ${error.message}`);
    }
  }

  async _createSQLiteSchema(tableName) {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        level VARCHAR(20) DEFAULT 'info',
        metadata JSON,
        source VARCHAR(100),
        channels TEXT,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        ip_address VARCHAR(45),
        user_agent TEXT
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async _createMySQLSchema(tableName) {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        level VARCHAR(20) DEFAULT 'info',
        metadata JSON,
        source VARCHAR(100),
        channels TEXT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        INDEX idx_created_at (created_at),
        INDEX idx_level (level),
        INDEX idx_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;
    
    await this.db.execute(sql);
  }

  async _createPostgreSQLSchema(tableName) {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        level VARCHAR(20) DEFAULT 'info',
        metadata JSONB,
        source VARCHAR(100),
        channels TEXT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        ip_address INET,
        user_agent TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_${tableName}_created_at ON ${tableName} (created_at);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_level ON ${tableName} (level);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_source ON ${tableName} (source);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_metadata ON ${tableName} USING GIN (metadata);
    `;
    
    await this.db.query(sql);
  }

  async _createMongoDBSchema(collectionName) {
    const collection = this.db.collection(collectionName);
    
    // Create indexes
    await collection.createIndexes([
      { key: { created_at: 1 } },
      { key: { level: 1 } },
      { key: { source: 1 } },
      { key: { 'metadata.environment': 1 } }
    ]);
  }

  async send(notification) {
    try {
      if (!this.config.enabled) {
        return this._createResponse(true, 'Database logging is disabled');
      }

      if (!this.db) {
        return this._createResponse(false, 'Database connection not available');
      }

      // Prepare log entry
      const logEntry = {
        title: notification.title,
        message: notification.message,
        level: notification.level || 'info',
        metadata: notification.metadata || {},
        source: notification.metadata?.source || 'unknown',
        channels: notification.channels ? notification.channels.join(',') : '',
        success: true,
        error_message: null,
        created_at: new Date(),
        processed_at: new Date(),
        ip_address: notification.metadata?.ip || null,
        user_agent: notification.metadata?.userAgent || null
      };

      // Add to batch queue
      this.batchQueue.push(logEntry);

      // Flush if batch is full
      if (this.batchQueue.length >= (this.config.batchSize || 100)) {
        await this._flushBatch();
      }

      return this._createResponse(true, 'Notification queued for database logging', {
        queueSize: this.batchQueue.length,
        batchSize: this.config.batchSize || 100
      });

    } catch (error) {
      return this._handleError(error, 'log notification to database');
    }
  }

  async _flushBatch() {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    try {
      await this._insertBatch(batch);
    } catch (error) {
      console.error(`Failed to flush notification batch: ${error.message}`);
      // Re-queue failed batch (with limit to prevent infinite growth)
      if (this.batchQueue.length < 1000) {
        this.batchQueue.unshift(...batch);
      }
    }
  }

  async _insertBatch(batch) {
    const tableName = this.config.table || 'notifications';
    const { type } = this.config.database;

    switch (type) {
      case 'sqlite':
        await this._insertSQLiteBatch(tableName, batch);
        break;
      case 'mysql':
        await this._insertMySQLBatch(tableName, batch);
        break;
      case 'postgresql':
        await this._insertPostgreSQLBatch(tableName, batch);
        break;
      case 'mongodb':
        await this._insertMongoBatch(tableName, batch);
        break;
    }
  }

  async _insertSQLiteBatch(tableName, batch) {
    const sql = `
      INSERT INTO ${tableName} 
      (title, message, level, metadata, source, channels, success, error_message, created_at, processed_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        const stmt = this.db.prepare(sql);
        
        batch.forEach(entry => {
          stmt.run([
            entry.title,
            entry.message,
            entry.level,
            JSON.stringify(entry.metadata),
            entry.source,
            entry.channels,
            entry.success,
            entry.error_message,
            entry.created_at.toISOString(),
            entry.processed_at.toISOString(),
            entry.ip_address,
            entry.user_agent
          ]);
        });
        
        stmt.finalize();
        
        this.db.run('COMMIT', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    });
  }

  async _insertMySQLBatch(tableName, batch) {
    const values = batch.map(entry => [
      entry.title,
      entry.message,
      entry.level,
      JSON.stringify(entry.metadata),
      entry.source,
      entry.channels,
      entry.success,
      entry.error_message,
      entry.created_at,
      entry.processed_at,
      entry.ip_address,
      entry.user_agent
    ]);

    const sql = `
      INSERT INTO ${tableName} 
      (title, message, level, metadata, source, channels, success, error_message, created_at, processed_at, ip_address, user_agent)
      VALUES ?
    `;

    await this.db.execute(sql, [values]);
  }

  async _insertPostgreSQLBatch(tableName, batch) {
    const values = batch.map((entry, index) => 
      `($${index * 12 + 1}, $${index * 12 + 2}, $${index * 12 + 3}, $${index * 12 + 4}, $${index * 12 + 5}, $${index * 12 + 6}, $${index * 12 + 7}, $${index * 12 + 8}, $${index * 12 + 9}, $${index * 12 + 10}, $${index * 12 + 11}, $${index * 12 + 12})`
    ).join(', ');

    const sql = `
      INSERT INTO ${tableName} 
      (title, message, level, metadata, source, channels, success, error_message, created_at, processed_at, ip_address, user_agent)
      VALUES ${values}
    `;

    const flatValues = batch.flatMap(entry => [
      entry.title,
      entry.message,
      entry.level,
      JSON.stringify(entry.metadata),
      entry.source,
      entry.channels,
      entry.success,
      entry.error_message,
      entry.created_at,
      entry.processed_at,
      entry.ip_address,
      entry.user_agent
    ]);

    await this.db.query(sql, flatValues);
  }

  async _insertMongoBatch(collectionName, batch) {
    const collection = this.db.collection(collectionName);
    await collection.insertMany(batch);
  }

  _startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    const interval = this.config.flushInterval || 30000;
    this.flushTimer = setInterval(() => {
      this._flushBatch().catch(error => {
        console.error(`Scheduled flush failed: ${error.message}`);
      });
    }, interval);
  }

  async validate(config) {
    try {
      if (typeof config.enabled !== 'boolean') {
        return false;
      }

      if (config.enabled) {
        if (!config.database || !config.database.type) {
          return false;
        }

        // Validate database-specific configuration
        const { type } = config.database;
        switch (type) {
          case 'sqlite':
            // SQLite just needs a database path
            break;
          case 'mysql':
          case 'postgresql':
            if (!config.database.host || !config.database.username || !config.database.database) {
              return false;
            }
            break;
          case 'mongodb':
            if (!config.database.connectionString && !config.database.host) {
              return false;
            }
            break;
        }
      }

      return true;
    } catch (error) {
      console.warn(`Database logger validation failed: ${error.message}`);
      return false;
    }
  }

  async isAvailable() {
    return this.config.enabled && this.db !== null;
  }

  async setup(config) {
    await super.setup(config);
    await this._initDatabase();
    this._startFlushTimer();
  }

  async cleanup() {
    // Flush remaining notifications
    await this._flushBatch();

    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Close database connection
    if (this.db) {
      const { type } = this.config.database;
      
      try {
        switch (type) {
          case 'sqlite':
            this.db.close();
            break;
          case 'mysql':
            await this.db.end();
            break;
          case 'postgresql':
            await this.db.end();
            break;
          case 'mongodb':
            await this.db.client.close();
            break;
        }
      } catch (error) {
        console.warn(`Database cleanup warning: ${error.message}`);
      }
      
      this.db = null;
    }
  }

  async healthCheck() {
    if (!this.config.enabled) {
      return {
        healthy: false,
        message: 'Database logging is disabled'
      };
    }

    if (!this.db) {
      return {
        healthy: false,
        message: 'Database connection not available'
      };
    }

    try {
      // Test database connectivity
      await this._testConnection();
      
      return {
        healthy: true,
        message: 'Database logger is healthy',
        metadata: {
          databaseType: this.config.database.type,
          tableName: this.config.table || 'notifications',
          queueSize: this.batchQueue.length,
          batchSize: this.config.batchSize || 100,
          retentionDays: this.config.retentionDays || 365
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Database connection error: ${error.message}`
      };
    }
  }

  async _testConnection() {
    const { type } = this.config.database;
    
    switch (type) {
      case 'sqlite':
        return new Promise((resolve, reject) => {
          this.db.get('SELECT 1', (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      
      case 'mysql':
        await this.db.execute('SELECT 1');
        break;
      
      case 'postgresql':
        await this.db.query('SELECT 1');
        break;
      
      case 'mongodb':
        await this.db.admin().ping();
        break;
    }
  }

  // Utility methods for analytics
  async getNotificationStats(days = 30) {
    const tableName = this.config.table || 'notifications';
    const { type } = this.config.database;

    try {
      switch (type) {
        case 'sqlite':
        case 'mysql':
        case 'postgresql':
          return await this._getSQLStats(tableName, days);
        case 'mongodb':
          return await this._getMongoStats(tableName, days);
      }
    } catch (error) {
      throw new Error(`Failed to get notification stats: ${error.message}`);
    }
  }

  async _getSQLStats(tableName, days) {
    const sql = `
      SELECT 
        level,
        source,
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count
      FROM ${tableName}
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY level, source, DATE(created_at)
      ORDER BY date DESC, count DESC
    `;

    const [rows] = await this.db.execute(sql, [days]);
    return rows;
  }

  async _getMongoStats(collectionName, days) {
    const collection = this.db.collection(collectionName);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await collection.aggregate([
      { $match: { created_at: { $gte: cutoffDate } } },
      {
        $group: {
          _id: {
            level: '$level',
            source: '$source',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }
          },
          count: { $sum: 1 },
          success_count: { $sum: { $cond: ['$success', 1, 0] } }
        }
      },
      { $sort: { '_id.date': -1, count: -1 } }
    ]).toArray();
  }
}

module.exports = DatabaseLoggerPlugin;

/*
Example configuration:

// SQLite
{
  "plugins": {
    "database-logger": {
      "enabled": true,
      "database": {
        "type": "sqlite",
        "database": "/path/to/notifications.db"
      },
      "table": "notifications",
      "retentionDays": 365,
      "batchSize": 50,
      "flushInterval": 15000
    }
  }
}

// PostgreSQL
{
  "plugins": {
    "database-logger": {
      "enabled": true,
      "database": {
        "type": "postgresql",
        "host": "localhost",
        "port": 5432,
        "database": "notifydb",
        "username": "notify_user",
        "password": "notify_pass",
        "ssl": true
      },
      "table": "system_notifications",
      "retentionDays": 90,
      "batchSize": 100
    }
  }
}

Usage examples:

// All notifications are automatically logged
await notificationClient.notify({
  title: "System Backup Complete",
  message: "Daily backup completed successfully",
  level: "success",
  metadata: {
    source: "backup-service",
    environment: "production",
    duration: "45m",
    size: "2.3GB"
  }
});

// Get analytics
const stats = await plugin.getNotificationStats(30);
console.log('Notification statistics for last 30 days:', stats);
*/