/**
 * @fileoverview Channel router for coordinating notification delivery across multiple plugin-based channels
 * Provides parallel processing, error handling, and delivery status tracking
 */

const EventEmitter = require('events');

/**
 * Channel router for dispatching notifications to multiple channels
 * Handles plugin discovery, parallel processing, and delivery tracking
 */
class ChannelRouter extends EventEmitter {
  constructor(pluginManager, options = {}) {
    super();
    
    this.pluginManager = pluginManager;
    this.options = {
      maxConcurrency: 5,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 2000,
      ...options
    };
    
    // Delivery tracking
    this.activeDeliveries = new Map();
    this.deliveryHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;
  }

  /**
   * Route notification to specified channels
   * @param {NotificationRequest} notification - Notification to send
   * @param {string[]} channels - Channel names to route to
   * @returns {Promise<RoutingResult>} Routing results with per-channel status
   */
  async route(notification, channels = []) {
    if (!notification) {
      throw new Error('Notification is required');
    }

    if (!Array.isArray(channels) || channels.length === 0) {
      throw new Error('At least one channel must be specified');
    }

    const deliveryId = this._generateDeliveryId();
    const startTime = Date.now();
    
    this.emit('routingStarted', { deliveryId, notification, channels });

    try {
      // Validate channels and get available plugins
      const availablePlugins = await this._getAvailablePlugins(channels);
      
      if (availablePlugins.length === 0) {
        throw new Error('No available plugins for specified channels');
      }

      // Track delivery
      this._trackDelivery(deliveryId, {
        notification,
        channels,
        availablePlugins: availablePlugins.map(p => p.name),
        startTime,
        status: 'in_progress'
      });

      // Route to available plugins in parallel
      const results = await this._routeToPlugins(notification, availablePlugins, deliveryId);
      
      // Calculate overall results
      const routingResult = this._calculateRoutingResult(deliveryId, results, startTime);
      
      // Update tracking
      this._updateDeliveryTracking(deliveryId, routingResult);
      
      this.emit('routingCompleted', routingResult);
      
      return routingResult;
      
    } catch (error) {
      const errorResult = this._createErrorResult(deliveryId, error, startTime);
      this._updateDeliveryTracking(deliveryId, errorResult);
      this.emit('routingFailed', errorResult);
      throw error;
    }
  }

  /**
   * Route to all available channels
   * @param {NotificationRequest} notification - Notification to send
   * @returns {Promise<RoutingResult>} Routing results
   */
  async routeToAll(notification) {
    const availableChannels = await this.getAvailableChannels();
    return await this.route(notification, availableChannels);
  }

  /**
   * Get list of available channels
   * @returns {Promise<string[]>} Available channel names
   */
  async getAvailableChannels() {
    const plugins = await this.pluginManager.getAllPlugins();
    const availableChannels = [];
    
    for (const [name, plugin] of plugins) {
      try {
        if (await plugin.isAvailable()) {
          availableChannels.push(name);
        }
      } catch (error) {
        console.warn(`Error checking availability for plugin ${name}: ${error.message}`);
      }
    }
    
    return availableChannels;
  }

  /**
   * Get channel health status
   * @returns {Promise<Object>} Health status for all channels
   */
  async getChannelHealthStatus() {
    const plugins = await this.pluginManager.getAllPlugins();
    const healthStatus = {};
    
    const healthChecks = Array.from(plugins.entries()).map(async ([name, plugin]) => {
      try {
        const health = await plugin.healthCheck();
        healthStatus[name] = health;
      } catch (error) {
        healthStatus[name] = {
          healthy: false,
          message: `Health check failed: ${error.message}`,
          error: error.message
        };
      }
    });
    
    await Promise.allSettled(healthChecks);
    return healthStatus;
  }

  /**
   * Get delivery statistics
   * @returns {Object} Delivery statistics
   */
  getDeliveryStats() {
    const history = this.deliveryHistory;
    const totalDeliveries = history.length;
    
    if (totalDeliveries === 0) {
      return {
        totalDeliveries: 0,
        successRate: 0,
        averageDeliveryTime: 0,
        channelStats: {}
      };
    }

    const successfulDeliveries = history.filter(d => d.success).length;
    const successRate = (successfulDeliveries / totalDeliveries) * 100;
    
    const totalDeliveryTime = history.reduce((sum, d) => sum + d.deliveryTime, 0);
    const averageDeliveryTime = totalDeliveryTime / totalDeliveries;
    
    // Calculate per-channel statistics
    const channelStats = {};
    history.forEach(delivery => {
      delivery.channelResults.forEach(result => {
        if (!channelStats[result.channel]) {
          channelStats[result.channel] = {
            attempts: 0,
            successes: 0,
            failures: 0,
            totalTime: 0
          };
        }
        
        const stats = channelStats[result.channel];
        stats.attempts++;
        stats.totalTime += result.deliveryTime || 0;
        
        if (result.success) {
          stats.successes++;
        } else {
          stats.failures++;
        }
      });
    });
    
    // Calculate success rates and average times for each channel
    Object.values(channelStats).forEach(stats => {
      stats.successRate = (stats.successes / stats.attempts) * 100;
      stats.averageTime = stats.totalTime / stats.attempts;
    });

    return {
      totalDeliveries,
      successRate,
      averageDeliveryTime,
      channelStats
    };
  }

  /**
   * Get available plugins for specified channels
   * @private
   * @param {string[]} channels - Channel names
   * @returns {Promise<Array>} Available plugins
   */
  async _getAvailablePlugins(channels) {
    const availablePlugins = [];
    
    for (const channelName of channels) {
      try {
        const plugin = await this.pluginManager.getPlugin(channelName);
        
        if (plugin && await plugin.isAvailable()) {
          availablePlugins.push({
            name: channelName,
            plugin: plugin
          });
        } else {
          console.warn(`Plugin ${channelName} is not available`);
        }
      } catch (error) {
        console.warn(`Error getting plugin ${channelName}: ${error.message}`);
      }
    }
    
    return availablePlugins;
  }

  /**
   * Route notification to plugins in parallel
   * @private
   * @param {NotificationRequest} notification - Notification to send
   * @param {Array} plugins - Available plugins
   * @param {string} deliveryId - Delivery tracking ID
   * @returns {Promise<Array>} Delivery results
   */
  async _routeToPlugins(notification, plugins, deliveryId) {
    const concurrencyLimit = Math.min(this.options.maxConcurrency, plugins.length);
    const results = [];
    
    // Process plugins in batches to respect concurrency limit
    for (let i = 0; i < plugins.length; i += concurrencyLimit) {
      const batch = plugins.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(({ name, plugin }) => 
        this._sendToPlugin(notification, name, plugin, deliveryId)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result => result.value || result.reason));
    }
    
    return results;
  }

  /**
   * Send notification to a single plugin
   * @private
   * @param {NotificationRequest} notification - Notification to send
   * @param {string} channelName - Channel name
   * @param {BasePlugin} plugin - Plugin instance
   * @param {string} deliveryId - Delivery tracking ID
   * @returns {Promise<Object>} Channel delivery result
   */
  async _sendToPlugin(notification, channelName, plugin, deliveryId) {
    const startTime = Date.now();
    let attempt = 0;
    
    while (attempt < this.options.retryAttempts) {
      try {
        this.emit('channelDeliveryStarted', { 
          deliveryId, 
          channel: channelName, 
          attempt: attempt + 1 
        });
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Delivery timeout')), this.options.timeout);
        });
        
        // Race between plugin send and timeout
        const response = await Promise.race([
          plugin.send(notification),
          timeoutPromise
        ]);
        
        const deliveryTime = Date.now() - startTime;
        
        const result = {
          channel: channelName,
          success: response.success,
          message: response.message,
          metadata: response.metadata,
          deliveryTime,
          attempts: attempt + 1
        };
        
        this.emit('channelDeliveryCompleted', { deliveryId, result });
        return result;
        
      } catch (error) {
        attempt++;
        
        const isLastAttempt = attempt >= this.options.retryAttempts;
        const deliveryTime = Date.now() - startTime;
        
        if (isLastAttempt) {
          const result = {
            channel: channelName,
            success: false,
            message: `Failed after ${attempt} attempts: ${error.message}`,
            error: error.message,
            deliveryTime,
            attempts: attempt
          };
          
          this.emit('channelDeliveryFailed', { deliveryId, result });
          return result;
        }
        
        // Wait before retry
        if (this.options.retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
        }
        
        this.emit('channelDeliveryRetry', { 
          deliveryId, 
          channel: channelName, 
          attempt: attempt + 1,
          error: error.message 
        });
      }
    }
  }

  /**
   * Calculate overall routing result
   * @private
   * @param {string} deliveryId - Delivery tracking ID
   * @param {Array} channelResults - Individual channel results
   * @param {number} startTime - Start timestamp
   * @returns {RoutingResult} Routing result
   */
  _calculateRoutingResult(deliveryId, channelResults, startTime) {
    const deliveryTime = Date.now() - startTime;
    const successfulChannels = channelResults.filter(r => r.success);
    const failedChannels = channelResults.filter(r => !r.success);
    
    return {
      deliveryId,
      success: successfulChannels.length > 0,
      deliveryTime,
      totalChannels: channelResults.length,
      successfulChannels: successfulChannels.length,
      failedChannels: failedChannels.length,
      successRate: (successfulChannels.length / channelResults.length) * 100,
      channelResults,
      message: `Delivered to ${successfulChannels.length}/${channelResults.length} channels`
    };
  }

  /**
   * Create error result for failed routing
   * @private
   * @param {string} deliveryId - Delivery tracking ID
   * @param {Error} error - Error that occurred
   * @param {number} startTime - Start timestamp
   * @returns {RoutingResult} Error result
   */
  _createErrorResult(deliveryId, error, startTime) {
    return {
      deliveryId,
      success: false,
      deliveryTime: Date.now() - startTime,
      totalChannels: 0,
      successfulChannels: 0,
      failedChannels: 0,
      successRate: 0,
      channelResults: [],
      message: `Routing failed: ${error.message}`,
      error: error.message
    };
  }

  /**
   * Generate unique delivery ID
   * @private
   * @returns {string} Unique delivery ID
   */
  _generateDeliveryId() {
    return `delivery_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Track active delivery
   * @private
   * @param {string} deliveryId - Delivery ID
   * @param {Object} deliveryInfo - Delivery information
   */
  _trackDelivery(deliveryId, deliveryInfo) {
    this.activeDeliveries.set(deliveryId, deliveryInfo);
  }

  /**
   * Update delivery tracking
   * @private
   * @param {string} deliveryId - Delivery ID
   * @param {RoutingResult} result - Routing result
   */
  _updateDeliveryTracking(deliveryId, result) {
    // Remove from active deliveries
    this.activeDeliveries.delete(deliveryId);
    
    // Add to history
    this.deliveryHistory.push(result);
    
    // Maintain history size limit
    if (this.deliveryHistory.length > this.maxHistorySize) {
      this.deliveryHistory.shift();
    }
  }
}

module.exports = ChannelRouter;