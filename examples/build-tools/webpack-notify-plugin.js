/**
 * Webpack Plugin for SSH Notify Tool
 * 
 * Usage:
 * const NotifyPlugin = require('./webpack-notify-plugin');
 * 
 * module.exports = {
 *   plugins: [
 *     new NotifyPlugin({
 *       serverUrl: 'http://localhost:3000',
 *       authToken: 'your-auth-token',
 *       channels: ['desktop'],
 *       onlyOnErrors: false
 *     })
 *   ]
 * };
 */

const axios = require('axios');
const path = require('path');
const { performance } = require('perf_hooks');

class WebpackNotifyPlugin {
  constructor(options = {}) {
    this.options = {
      serverUrl: options.serverUrl || 'http://localhost:3000',
      authToken: options.authToken || process.env.NOTIFY_TOKEN,
      channels: options.channels || ['desktop'],
      onlyOnErrors: options.onlyOnErrors || false,
      includeAssets: options.includeAssets || false,
      includeModules: options.includeModules || false,
      ...options
    };
    
    this.startTime = null;
    this.notifyClient = this.createNotifyClient();
  }

  createNotifyClient() {
    const baseURL = this.options.serverUrl;
    const headers = {};
    
    if (this.options.authToken) {
      headers.Authorization = `Bearer ${this.options.authToken}`;
    }

    return axios.create({
      baseURL,
      headers,
      timeout: 5000
    });
  }

  apply(compiler) {
    const pluginName = 'WebpackNotifyPlugin';

    // Track compilation start
    compiler.hooks.compile.tap(pluginName, () => {
      this.startTime = performance.now();
    });

    // Handle compilation completion
    compiler.hooks.done.tapPromise(pluginName, async (stats) => {
      const duration = Math.round(performance.now() - this.startTime);
      
      try {
        if (stats.hasErrors()) {
          await this.notifyError(stats, duration);
        } else if (stats.hasWarnings()) {
          await this.notifyWarning(stats, duration);
        } else if (!this.options.onlyOnErrors) {
          await this.notifySuccess(stats, duration);
        }
      } catch (error) {
        console.warn('Webpack Notify Plugin: Failed to send notification', error.message);
      }
    });

    // Handle compilation failure
    compiler.hooks.failed.tapPromise(pluginName, async (error) => {
      const duration = this.startTime ? Math.round(performance.now() - this.startTime) : 0;
      
      try {
        await this.notifyFailure(error, duration);
      } catch (notifyError) {
        console.warn('Webpack Notify Plugin: Failed to send failure notification', notifyError.message);
      }
    });
  }

  async notifySuccess(stats, duration) {
    const compilation = stats.compilation;
    const outputPath = compilation.outputOptions.path;
    const assets = Object.keys(compilation.assets);
    
    const notification = {
      title: '✅ Webpack Build Complete',
      message: `Build completed successfully in ${duration}ms`,
      level: 'success',
      channels: this.options.channels,
      metadata: {
        buildTime: `${duration}ms`,
        outputPath: outputPath,
        assetsCount: assets.length,
        modulesCount: compilation.modules.size,
        chunksCount: compilation.chunks.size,
        mode: compilation.options.mode || 'development',
        timestamp: new Date().toISOString(),
        ...(this.options.includeAssets && { assets: assets.slice(0, 10) }),
        ...(this.options.includeModules && { 
          modules: Array.from(compilation.modules)
            .slice(0, 5)
            .map(module => module.resource)
            .filter(Boolean)
        })
      },
      tags: ['webpack', 'build', 'success']
    };

    await this.sendNotification(notification);
  }

  async notifyWarning(stats, duration) {
    const warnings = stats.compilation.warnings;
    
    const notification = {
      title: '⚠️ Webpack Build Warning',
      message: `Build completed with ${warnings.length} warning(s) in ${duration}ms`,
      level: 'warning',
      channels: this.options.channels,
      metadata: {
        buildTime: `${duration}ms`,
        warningsCount: warnings.length,
        warnings: warnings.slice(0, 3).map(warning => ({
          message: warning.message,
          module: warning.module?.resource || 'unknown'
        })),
        mode: stats.compilation.options.mode || 'development',
        timestamp: new Date().toISOString()
      },
      tags: ['webpack', 'build', 'warning']
    };

    await this.sendNotification(notification);
  }

  async notifyError(stats, duration) {
    const errors = stats.compilation.errors;
    
    const notification = {
      title: '❌ Webpack Build Failed',
      message: `Build failed with ${errors.length} error(s) after ${duration}ms`,
      level: 'error',
      channels: this.options.channels,
      metadata: {
        buildTime: `${duration}ms`,
        errorsCount: errors.length,
        errors: errors.slice(0, 3).map(error => ({
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n'),
          module: error.module?.resource || 'unknown'
        })),
        mode: stats.compilation.options.mode || 'development',
        timestamp: new Date().toISOString()
      },
      tags: ['webpack', 'build', 'error'],
      priority: 4
    };

    await this.sendNotification(notification);
  }

  async notifyFailure(error, duration) {
    const notification = {
      title: '🚨 Webpack Build Crashed',
      message: `Build process crashed: ${error.message}`,
      level: 'error',
      channels: [...this.options.channels, 'email'], // Escalate to email
      metadata: {
        buildTime: `${duration}ms`,
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 10).join('\n'),
        timestamp: new Date().toISOString()
      },
      tags: ['webpack', 'build', 'crash', 'critical'],
      priority: 5
    };

    await this.sendNotification(notification);
  }

  async sendNotification(notification) {
    try {
      await this.notifyClient.post('/api/notify', notification);
    } catch (error) {
      // Silently fail to avoid disrupting the build process
      console.warn(`Webpack Notify Plugin: ${error.message}`);
    }
  }
}

module.exports = WebpackNotifyPlugin;

/**
 * Example webpack.config.js usage:
 * 
 * const NotifyPlugin = require('./webpack-notify-plugin');
 * 
 * module.exports = {
 *   // ... other webpack config
 *   plugins: [
 *     // Basic usage
 *     new NotifyPlugin(),
 * 
 *     // Advanced usage
 *     new NotifyPlugin({
 *       serverUrl: 'http://localhost:3000',
 *       authToken: process.env.NOTIFY_TOKEN,
 *       channels: ['desktop', 'slack'],
 *       onlyOnErrors: false,
 *       includeAssets: true,
 *       includeModules: false
 *     })
 *   ]
 * };
 * 
 * Environment variables:
 * NOTIFY_TOKEN=your-auth-token
 */