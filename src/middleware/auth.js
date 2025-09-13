/**
 * @fileoverview Authentication middleware for Express.js with token-based authentication
 * Provides secure token generation, validation, and timing-safe comparison
 */

const crypto = require('crypto');

/**
 * Authentication middleware for Express applications
 */
class AuthMiddleware {
  constructor(options = {}) {
    this.secretKey = options.secretKey || process.env.AUTH_SECRET || 'default-secret-key';
    this.tokenExpiry = options.tokenExpiry || 24 * 60 * 60 * 1000; // 24 hours
    this.algorithm = 'aes-256-gcm';
    this.headerName = options.headerName || 'authorization';
    this.tokenPrefix = options.tokenPrefix || 'Bearer ';
  }

  /**
   * Express middleware function for token authentication
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  authenticate = (req, res, next) => {
    try {
      // Extract token from header
      const token = this._extractToken(req);
      
      if (!token) {
        return this._sendUnauthorized(res, 'No authentication token provided');
      }

      // Validate token
      const isValid = this._validateToken(token);
      
      if (!isValid) {
        return this._sendUnauthorized(res, 'Invalid or expired token');
      }

      // Token is valid, proceed
      req.authenticated = true;
      req.authToken = token;
      next();
    } catch (error) {
      console.error('Authentication error:', error.message);
      return this._sendUnauthorized(res, 'Authentication failed');
    }
  };

  /**
   * Optional middleware for specific routes
   * @param {string} requiredToken - Specific token required for this route
   */
  requireToken = (requiredToken) => {
    return (req, res, next) => {
      try {
        const token = this._extractToken(req);
        
        if (!token) {
          return this._sendUnauthorized(res, 'No authentication token provided');
        }

        // Use timing-safe comparison
        if (!this._timingSafeEqual(token, requiredToken)) {
          return this._sendUnauthorized(res, 'Invalid token');
        }

        req.authenticated = true;
        req.authToken = token;
        next();
      } catch (error) {
        console.error('Token validation error:', error.message);
        return this._sendUnauthorized(res, 'Authentication failed');
      }
    };
  };

  /**
   * Generate a secure random token
   * @param {number} [length=32] - Token length in bytes
   * @returns {string} Generated token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a JWT-like token with expiration
   * @param {Object} payload - Token payload
   * @param {number} [expiresIn] - Expiration time in milliseconds
   * @returns {string} Generated JWT-like token
   */
  generateJWTLikeToken(payload = {}, expiresIn) {
    const expiry = expiresIn || this.tokenExpiry;
    const tokenData = {
      payload,
      iat: Date.now(),
      exp: Date.now() + expiry
    };

    const tokenString = JSON.stringify(tokenData);
    const encrypted = this._encrypt(tokenString);
    
    return Buffer.from(encrypted).toString('base64url');
  }

  /**
   * Validate a JWT-like token
   * @param {string} token - Token to validate
   * @returns {Object|null} Decoded payload or null if invalid
   */
  validateJWTLikeToken(token) {
    try {
      const encrypted = Buffer.from(token, 'base64url').toString();
      const decrypted = this._decrypt(encrypted);
      const tokenData = JSON.parse(decrypted);

      // Check expiration
      if (Date.now() > tokenData.exp) {
        return null;
      }

      return tokenData.payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create API key with metadata
   * @param {Object} metadata - API key metadata
   * @returns {string} API key
   */
  createApiKey(metadata = {}) {
    const keyData = {
      id: crypto.randomBytes(8).toString('hex'),
      created: Date.now(),
      metadata
    };

    const keyString = JSON.stringify(keyData);
    const encrypted = this._encrypt(keyString);
    
    return 'ak_' + Buffer.from(encrypted).toString('base64url');
  }

  /**
   * Validate API key
   * @param {string} apiKey - API key to validate
   * @returns {Object|null} Key metadata or null if invalid
   */
  validateApiKey(apiKey) {
    try {
      if (!apiKey.startsWith('ak_')) {
        return null;
      }

      const encrypted = Buffer.from(apiKey.substring(3), 'base64url').toString();
      const decrypted = this._decrypt(encrypted);
      const keyData = JSON.parse(decrypted);

      return keyData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract token from request
   * @private
   * @param {Object} req - Express request object
   * @returns {string|null} Extracted token
   */
  _extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers[this.headerName.toLowerCase()];
    if (authHeader && authHeader.startsWith(this.tokenPrefix)) {
      return authHeader.substring(this.tokenPrefix.length);
    }

    // Check query parameter
    if (req.query.token) {
      return req.query.token;
    }

    // Check request body
    if (req.body && req.body.token) {
      return req.body.token;
    }

    return null;
  }

  /**
   * Validate token (basic validation)
   * @private
   * @param {string} token - Token to validate
   * @returns {boolean} True if valid
   */
  _validateToken(token) {
    // Basic validation - check if token is not empty and has minimum length
    if (!token || typeof token !== 'string' || token.length < 16) {
      return false;
    }

    // Additional validation can be added here
    // For example, check against a database, validate format, etc.
    
    return true;
  }

  /**
   * Timing-safe string comparison
   * @private
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} True if strings are equal
   */
  _timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    // Use Node.js built-in timing-safe comparison
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    
    return crypto.timingSafeEqual(bufferA, bufferB);
  }

  /**
   * Send unauthorized response
   * @private
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  _sendUnauthorized(res, message) {
    res.status(401).json({
      error: 'Unauthorized',
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Encrypt data
   * @private
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text
   */
  _encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.secretKey, 'salt', 32);
    
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from('ssh-notify-tool', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt data
   * @private
   * @param {string} encryptedData - Encrypted data to decrypt
   * @returns {string} Decrypted text
   */
  _decrypt(encryptedData) {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = crypto.scryptSync(this.secretKey, 'salt', 32);
    const decipher = crypto.createDecipher(this.algorithm, key);
    
    decipher.setAAD(Buffer.from('ssh-notify-tool', 'utf8'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Rate limiting functionality
   * @param {Object} options - Rate limiting options
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {number} options.max - Maximum requests per window
   * @returns {Function} Express middleware
   */
  rateLimit(options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    const max = options.max || 100;
    const requests = new Map();

    return (req, res, next) => {
      const clientId = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean old entries
      for (const [key, value] of requests.entries()) {
        if (value.timestamp < windowStart) {
          requests.delete(key);
        }
      }

      // Check current requests
      const clientRequests = requests.get(clientId);
      if (!clientRequests) {
        requests.set(clientId, { count: 1, timestamp: now });
        return next();
      }

      if (clientRequests.count >= max) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${max} requests per ${windowMs/1000} seconds`,
          retryAfter: Math.ceil((clientRequests.timestamp + windowMs - now) / 1000)
        });
      }

      clientRequests.count++;
      clientRequests.timestamp = now;
      next();
    };
  }
}

// Export both the class and a default instance
const authMiddleware = new AuthMiddleware();

module.exports = {
  AuthMiddleware,
  authMiddleware,
  
  // Convenience functions
  authenticate: authMiddleware.authenticate,
  requireToken: authMiddleware.requireToken.bind(authMiddleware),
  generateToken: authMiddleware.generateToken.bind(authMiddleware),
  generateJWTLikeToken: authMiddleware.generateJWTLikeToken.bind(authMiddleware),
  validateJWTLikeToken: authMiddleware.validateJWTLikeToken.bind(authMiddleware),
  createApiKey: authMiddleware.createApiKey.bind(authMiddleware),
  validateApiKey: authMiddleware.validateApiKey.bind(authMiddleware),
  rateLimit: authMiddleware.rateLimit.bind(authMiddleware)
};
