#!/usr/bin/env node

const NotificationServer = require('./app');

/**
 * Main entry point for the notification server
 */
async function main() {
  const server = new NotificationServer();

  try {
    // Setup graceful shutdown
    server.setupGracefulShutdown();

    // Start server
    await server.start();

    console.log(`✅ Notification server is running on ${server.config.server.host}:${server.config.server.port}`);
    console.log(`📊 Health check: http://${server.config.server.host}:${server.config.server.port}/health`);
    console.log(`📝 Log level: ${server.config.logging.level}`);
    console.log(`🔐 Authentication: ${server.config.auth.token ? 'Enabled' : 'Disabled'}`);

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main();
}

module.exports = main;