const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

/**
 * POST /api/v1/notify
 * Send notification through configured channels
 */
router.post('/', async (req, res) => {
  const logger = req.app.locals.logger || console;
  const notificationId = uuidv4();
  
  try {
    // Validate request body
    const validation = validateNotificationRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validation.errors,
        requestId: req.id
      });
    }

    const notification = {
      id: notificationId,
      timestamp: new Date().toISOString(),
      ...validation.data
    };

    logger.info('Processing notification', {
      notificationId,
      channels: notification.channels,
      level: notification.level,
      requestId: req.id
    });

    // Get notification service (will be implemented later)
    // const notificationService = req.app.locals.notificationService;
    // const results = await notificationService.send(notification);

    // Temporary mock response
    const results = {};
    const mockResults = ['desktop', 'email', 'sms'];
    
    for (const channel of notification.channels) {
      if (mockResults.includes(channel)) {
        results[channel] = {
          success: true,
          messageId: `${channel}_${Date.now()}`,
          timestamp: new Date().toISOString()
        };
      } else {
        results[channel] = {
          success: false,
          error: `Handler for ${channel} not available`,
          timestamp: new Date().toISOString()
        };
      }
    }

    logger.info('Notification processed', {
      notificationId,
      results,
      requestId: req.id
    });

    res.json({
      success: true,
      data: {
        id: notificationId,
        timestamp: notification.timestamp,
        results
      }
    });

  } catch (error) {
    logger.error('Failed to process notification', {
      error: error.message,
      stack: error.stack,
      notificationId,
      requestId: req.id
    });

    res.status(500).json({
      error: 'Failed to process notification',
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Validate notification request body
 * @param {Object} body - Request body
 * @returns {Object} Validation result
 */
function validateNotificationRequest(body) {
  const errors = [];
  const data = {};

  // Required fields
  if (!body.title || typeof body.title !== 'string') {
    errors.push('title is required and must be a string');
  } else {
    data.title = body.title.trim();
  }

  if (!body.message || typeof body.message !== 'string') {
    errors.push('message is required and must be a string');
  } else {
    data.message = body.message.trim();
  }

  // Optional fields with defaults
  data.level = ['info', 'warning', 'error'].includes(body.level) ? body.level : 'info';
  
  if (Array.isArray(body.channels)) {
    const validChannels = ['desktop', 'email', 'sms'];
    data.channels = body.channels.filter(ch => validChannels.includes(ch));
    
    if (data.channels.length === 0) {
      data.channels = ['desktop']; // Default channel
    }
  } else {
    data.channels = ['desktop'];
  }

  // Optional metadata
  if (body.metadata && typeof body.metadata === 'object') {
    data.metadata = {
      priority: Number(body.metadata.priority) || 1,
      tags: Array.isArray(body.metadata.tags) ? body.metadata.tags : [],
      attachments: Array.isArray(body.metadata.attachments) ? body.metadata.attachments : []
    };
  }

  // Channel-specific options
  if (body.options && typeof body.options === 'object') {
    data.options = {};
    
    // Desktop options
    if (body.options.desktop && typeof body.options.desktop === 'object') {
      data.options.desktop = {
        timeout: Number(body.options.desktop.timeout) || 5000,
        sound: Boolean(body.options.desktop.sound),
        actions: Array.isArray(body.options.desktop.actions) ? body.options.desktop.actions : []
      };
    }

    // Email options
    if (body.options.email && typeof body.options.email === 'object') {
      data.options.email = {
        to: Array.isArray(body.options.email.to) ? body.options.email.to : [],
        subject: body.options.email.subject || data.title,
        html: Boolean(body.options.email.html)
      };
    }

    // SMS options
    if (body.options.sms && typeof body.options.sms === 'object') {
      data.options.sms = {
        to: Array.isArray(body.options.sms.to) ? body.options.sms.to : []
      };
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data
  };
}

module.exports = router;