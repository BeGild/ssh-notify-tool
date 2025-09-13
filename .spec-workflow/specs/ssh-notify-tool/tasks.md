# Tasks Document

<!-- AI Instructions: For each task, generate a _Prompt field with structured AI guidance following this format:
_Prompt: Role: [specialized developer role] | Task: [clear task description with context references] | Restrictions: [what not to do, constraints] | Success: [specific completion criteria]_
This helps provide better AI agent guidance beyond simple "work on this task" prompts. -->

- [x] 1. Create project structure and package.json
  - File: package.json, .gitignore, README.md
  - Initialize Node.js project with npm init
  - Add core dependencies (express, axios, node-notifier, nodemailer)
  - Purpose: Establish project foundation and dependency management
  - _Leverage: Node.js project conventions_
  - _Requirements: 1.1, 1.2_
  - _Prompt: Role: DevOps Engineer specializing in Node.js project setup and package management | Task: Initialize project structure with package.json, dependencies, and configuration files following requirements 1.1 and 1.2 | Restrictions: Use specific versions for dependencies, follow semantic versioning, do not include unnecessary dependencies | Success: Project initializes without errors, all required dependencies are properly specified, package.json follows Node.js conventions_

- [x] 2. Create core type definitions in src/types/index.js
  - File: src/types/index.js
  - Define NotificationRequest, Configuration, ChannelResponse, and Plugin interfaces
  - Add JSDoc comments for type documentation
  - Purpose: Establish data structure contracts for the application and plugin system
  - _Leverage: JSDoc for type documentation_
  - _Requirements: 1.3, 1.4_
  - _Prompt: Role: JavaScript Developer with expertise in JSDoc and type definitions | Task: Create comprehensive type definitions for NotificationRequest, Configuration, ChannelResponse, and Plugin interfaces following requirements 1.3 and 1.4 using JSDoc comments | Restrictions: Must use JSDoc syntax correctly, ensure all properties are documented, maintain backward compatibility | Success: All data structures are well-defined with JSDoc, type contracts are clear and comprehensive, plugin interface is properly specified_

- [x] 3. Create base plugin interface in src/plugins/BasePlugin.js
  - File: src/plugins/BasePlugin.js
  - Implement abstract base class for all notification channel plugins
  - Define standard interface with required and optional methods
  - Purpose: Establish plugin development foundation and interface contracts
  - _Leverage: JavaScript class inheritance patterns_
  - _Requirements: 4.1_
  - _Prompt: Role: Software Architect specializing in plugin architecture and JavaScript inheritance | Task: Create base plugin class defining standard interface for all notification channels following requirement 4.1 | Restrictions: Must use JavaScript class syntax, ensure extensibility, provide clear error messages for unimplemented methods | Success: Base plugin provides standard interface, clear inheritance patterns, proper error handling for abstract methods_

- [x] 4. Create plugin manager in src/plugins/PluginManager.js
  - File: src/plugins/PluginManager.js
  - Implement plugin discovery, loading, registration, and validation
  - Add plugin lifecycle management (setup, cleanup)
  - Purpose: Central management system for all notification channel plugins
  - _Leverage: Node.js require system, BasePlugin interface_
  - _Requirements: 4.2, 4.3_
  - _Prompt: Role: Backend Developer with expertise in plugin systems and dynamic loading | Task: Create plugin manager for discovering, loading, and managing notification channel plugins following requirements 4.2 and 4.3 | Restrictions: Must validate plugin interface compliance, handle loading errors gracefully, ensure plugin isolation | Success: Plugin manager correctly loads and validates plugins, handles errors gracefully, provides plugin registry functionality_

- [x] 5. Create configuration manager in src/config/ConfigManager.js
  - File: src/config/ConfigManager.js
  - Implement configuration loading from ~/.notifytool/config.json with plugin support
  - Add configuration validation and default value handling
  - Purpose: Centralized configuration management with plugin configuration support
  - _Leverage: Node.js fs module, JSON schema validation_
  - _Requirements: 2.1, 2.2_
  - _Prompt: Role: Backend Developer with expertise in configuration management and file system operations | Task: Implement ConfigManager for loading and validating configuration including plugin configurations from ~/.notifytool/config.json following requirements 2.1 and 2.2 | Restrictions: Must handle missing files gracefully, validate plugin configurations, use secure defaults | Success: Configuration loads correctly with plugin support, validation prevents invalid configs, secure defaults are applied_

- [x] 6. Create authentication middleware in src/middleware/auth.js
  - File: src/middleware/auth.js
  - Implement token-based authentication for Express middleware
  - Add token generation and validation utilities
  - Purpose: Secure API endpoints with authentication
  - _Leverage: Node.js crypto module for token generation_
  - _Requirements: 3.1_
  - _Prompt: Role: Security Engineer with expertise in authentication and Express.js middleware | Task: Create robust authentication middleware with token generation and validation following requirement 3.1 | Restrictions: Must use secure token generation, implement proper validation, prevent timing attacks | Success: Authentication middleware correctly validates tokens, secure token generation implemented, timing-safe comparison used_

- [x] 7. Implement desktop notification plugin in src/plugins/builtin/DesktopPlugin.js
  - File: src/plugins/builtin/DesktopPlugin.js
  - Extend BasePlugin to implement desktop notifications
  - Integrate with node-notifier for cross-platform support
  - Purpose: Built-in desktop notification delivery capability
  - _Leverage: BasePlugin.js, node-notifier package_
  - _Requirements: 4.4_
  - _Prompt: Role: Frontend Developer with expertise in desktop notifications and cross-platform development | Task: Implement DesktopPlugin extending BasePlugin for cross-platform desktop notifications following requirement 4.4 | Restrictions: Must handle platform differences gracefully, follow plugin interface exactly, maintain consistent behavior | Success: Desktop notifications work on Windows, macOS, and Linux, proper plugin metadata, follows base plugin interface_

- [x] 8. Implement email notification plugin in src/plugins/builtin/EmailPlugin.js
  - File: src/plugins/builtin/EmailPlugin.js
  - Extend BasePlugin to implement email notifications
  - Integrate with nodemailer for SMTP email delivery
  - Purpose: Built-in email notification delivery capability
  - _Leverage: BasePlugin.js, nodemailer package_
  - _Requirements: 4.5_
  - _Prompt: Role: Backend Developer with expertise in email delivery and SMTP integration | Task: Implement EmailPlugin extending BasePlugin for email notifications using nodemailer following requirement 4.5 | Restrictions: Must handle SMTP errors gracefully, support common email providers, validate email addresses, follow plugin interface | Success: Email notifications send successfully through SMTP, proper error handling, supports HTML and plain text formats_

- [x] 9. Implement SMS notification plugin in src/plugins/builtin/SmsPlugin.js
  - File: src/plugins/builtin/SmsPlugin.js
  - Extend BasePlugin to implement SMS notifications
  - Add support for Twilio and Aliyun SMS providers
  - Purpose: Built-in SMS notification delivery capability
  - _Leverage: BasePlugin.js, provider-specific SDKs_
  - _Requirements: 4.6_
  - _Prompt: Role: Integration Developer with expertise in SMS APIs and third-party integrations | Task: Implement SmsPlugin extending BasePlugin for SMS notifications supporting Twilio and Aliyun providers following requirement 4.6 | Restrictions: Must abstract provider differences, handle rate limits, validate phone numbers, follow plugin interface | Success: SMS notifications work with both providers, proper error handling for API failures, rate limiting respected_

- [x] 10. Implement DingTalk notification plugin in src/plugins/official/DingTalkPlugin.js
  - File: src/plugins/official/DingTalkPlugin.js
  - Extend BasePlugin to implement 钉钉 webhook notifications
  - Add support for @mentions, signing, and message formatting
  - Purpose: Official DingTalk notification channel support
  - _Leverage: BasePlugin.js, HTTP client for webhook calls_
  - _Requirements: Plugin extensibility_
  - _Prompt: Role: Integration Developer with expertise in DingTalk API and webhook integrations | Task: Implement DingTalkPlugin extending BasePlugin for 钉钉 notifications via webhook API | Restrictions: Must follow DingTalk webhook API specification, handle signing correctly, support @mentions, follow plugin interface | Success: DingTalk notifications send successfully, proper message formatting, @mentions work correctly, webhook signing implemented_

- [x] 11. Implement WeChat Work notification plugin in src/plugins/official/WeChatWorkPlugin.js
  - File: src/plugins/official/WeChatWorkPlugin.js
  - Extend BasePlugin to implement 企业微信 webhook notifications
  - Add support for @mentions and message formatting
  - Purpose: Official WeChat Work notification channel support
  - _Leverage: BasePlugin.js, HTTP client for webhook calls_
  - _Requirements: Plugin extensibility_
  - _Prompt: Role: Integration Developer with expertise in WeChat Work API and webhook integrations | Task: Implement WeChatWorkPlugin extending BasePlugin for 企业微信 notifications via webhook API | Restrictions: Must follow WeChat Work webhook API specification, support @mentions, follow plugin interface | Success: WeChat Work notifications send successfully, proper message formatting, @mentions work correctly_

- [x] 12. Implement Slack notification plugin in src/plugins/official/SlackPlugin.js
  - File: src/plugins/official/SlackPlugin.js
  - Extend BasePlugin to implement Slack webhook notifications
  - Add support for channels, usernames, and rich formatting
  - Purpose: Official Slack notification channel support
  - _Leverage: BasePlugin.js, HTTP client for webhook calls_
  - _Requirements: Plugin extensibility_
  - _Prompt: Role: Integration Developer with expertise in Slack API and webhook integrations | Task: Implement SlackPlugin extending BasePlugin for Slack notifications via webhook API | Restrictions: Must follow Slack webhook API specification, support rich formatting, handle channel routing, follow plugin interface | Success: Slack notifications send successfully, rich formatting works, channel routing implemented correctly_

- [x] 13. Create channel router in src/services/ChannelRouter.js
  - File: src/services/ChannelRouter.js
  - Implement routing logic to dispatch notifications to appropriate plugins
  - Add parallel processing for multiple channels with plugin manager integration
  - Purpose: Coordinate notification delivery across multiple plugin-based channels
  - _Leverage: PluginManager, async/await patterns_
  - _Requirements: 5.1_
  - _Prompt: Role: Backend Developer with expertise in service orchestration and async programming | Task: Create ChannelRouter for dispatching notifications to multiple plugin channels in parallel following requirement 5.1 | Restrictions: Must handle plugin failures gracefully, ensure non-blocking operation, maintain delivery status tracking, use plugin manager for channel discovery | Success: Router dispatches to all specified channels via plugins, individual channel failures don't affect others, delivery status tracked correctly_

- [x] 14. Create notification server in src/server/NotificationServer.js
  - File: src/server/NotificationServer.js
  - Implement Express.js server with REST API endpoints and plugin system integration
  - Add middleware integration (auth, CORS, body parsing) and plugin management
  - Purpose: Main server component that receives and processes notification requests with plugin support
  - _Leverage: Express framework, middleware modules, ChannelRouter, PluginManager_
  - _Requirements: 5.2, 5.3_
  - _Prompt: Role: Backend Developer with expertise in Express.js and REST API design | Task: Create NotificationServer with REST endpoints, middleware integration, and plugin system following requirements 5.2 and 5.3 | Restrictions: Must follow REST conventions, implement proper error handling, ensure server security, integrate plugin manager correctly | Success: Server starts successfully, REST endpoints work correctly, plugin system integrated, middleware chain configured properly_

- [x] 15. Create notification client in src/client/NotificationClient.js
  - File: src/client/NotificationClient.js
  - Implement HTTP client for sending notifications to server
  - Add retry logic and error handling for network failures
  - Purpose: Client library for CLI tools to send notifications
  - _Leverage: axios for HTTP requests, retry patterns_
  - _Requirements: 6.1_
  - _Prompt: Role: Frontend Developer with expertise in HTTP clients and error handling | Task: Create NotificationClient with HTTP communication and retry logic following requirement 6.1 | Restrictions: Must handle network failures gracefully, implement exponential backoff, maintain timeout handling | Success: Client successfully sends notifications to server, retry logic works for transient failures, proper error messages for permanent failures_

- [x] 16. Create CLI interface in src/cli/notify-cli.js
  - File: src/cli/notify-cli.js
  - Implement command-line interface for direct notification sending
  - Add argument parsing, help documentation, and channel listing
  - Purpose: Command-line tool for manual notification testing and plugin discovery
  - _Leverage: Node.js process.argv, NotificationClient_
  - _Requirements: 6.2_
  - _Prompt: Role: DevOps Engineer with expertise in CLI tool development and argument parsing | Task: Create command-line interface for notifications with argument parsing and plugin support following requirement 6.2 | Restrictions: Must follow CLI conventions, provide helpful error messages, include usage documentation, support channel listing | Success: CLI tool works correctly with various arguments, help text is comprehensive, channel discovery works_

- [x] 17. Add SSH tunnel helper utilities in src/utils/ssh-helper.js
  - File: src/utils/ssh-helper.js
  - Create utilities for SSH port forwarding guidance
  - Add connection testing and validation functions
  - Purpose: Helper functions for SSH tunnel setup and validation
  - _Leverage: Node.js child_process for SSH commands_
  - _Requirements: 7.1_
  - _Prompt: Role: DevOps Engineer with expertise in SSH and network tunneling | Task: Create SSH helper utilities for port forwarding setup and validation following requirement 7.1 | Restrictions: Must not store SSH credentials, provide clear setup instructions, handle SSH errors gracefully | Success: SSH utilities provide clear guidance for tunnel setup, connection validation works correctly, error messages help troubleshoot SSH issues_

- [x] 18. Create server startup script in src/bin/notify-server.js
  - File: src/bin/notify-server.js
  - Implement server startup with configuration loading and plugin initialization
  - Add process management and graceful shutdown handling
  - Purpose: Main entry point for running the notification server with plugin system
  - _Leverage: NotificationServer, ConfigManager, PluginManager, process signals_
  - _Requirements: 8.1_
  - _Prompt: Role: DevOps Engineer with expertise in Node.js process management and server deployment | Task: Create server startup script with configuration loading, plugin initialization, and graceful shutdown following requirement 8.1 | Restrictions: Must handle process signals properly, ensure clean shutdown, provide startup status feedback, initialize plugins correctly | Success: Server starts and stops cleanly, configuration and plugins loaded correctly, process signals handled appropriately_

- [x] 19. Write unit tests for plugin system in tests/plugins/
  - File: tests/plugins/PluginManager.test.js, tests/plugins/BasePlugin.test.js
  - Create comprehensive unit tests for plugin system components
  - Add test fixtures and mock plugins for testing
  - Purpose: Ensure plugin system reliability and interface compliance
  - _Leverage: Jest testing framework, mock plugins_
  - _Requirements: Plugin architecture requirements_
  - _Prompt: Role: QA Engineer with expertise in unit testing and plugin system validation | Task: Create comprehensive unit tests for plugin system components including PluginManager and BasePlugin | Restrictions: Must test plugin loading, validation, and lifecycle, maintain test isolation, use proper mocking | Success: Plugin system has good test coverage, plugin interface compliance is tested, mock plugins work correctly_

- [x] 20. Write unit tests for notification channels in tests/plugins/builtin/
  - File: tests/plugins/builtin/*.test.js, tests/plugins/official/*.test.js
  - Create comprehensive unit tests for all built-in and official plugins
  - Add test fixtures and mock external services
  - Purpose: Ensure plugin reliability and delivery functionality
  - _Leverage: Jest testing framework, mock external APIs_
  - _Requirements: All plugin requirements_
  - _Prompt: Role: QA Engineer with expertise in unit testing and external API mocking | Task: Create comprehensive unit tests for all notification channel plugins covering built-in and official plugins | Restrictions: Must test both success and failure scenarios, mock all external services, maintain test isolation | Success: All plugins have good test coverage, external services properly mocked, edge cases tested_

- [x] 21. Create integration tests in tests/integration/
  - File: tests/integration/notification-flow.test.js, tests/integration/plugin-system.test.js
  - Write end-to-end tests for complete notification workflows with plugin system
  - Test local and remote scenarios with mocked SSH tunnels
  - Purpose: Validate complete system functionality including plugin integration
  - _Leverage: Test server instances, mock notification channels_
  - _Requirements: All requirements_
  - _Prompt: Role: QA Engineer with expertise in integration testing and system validation | Task: Create integration tests for complete notification workflows including plugin system covering all requirements | Restrictions: Must use test instances, mock external services appropriately, ensure tests are repeatable, test plugin discovery and loading | Success: Integration tests validate complete workflows, plugin system integration works correctly, both local and remote scenarios tested_

- [x] 22. Create plugin development documentation in docs/
  - File: docs/plugin-development.md, docs/plugin-examples/
  - Write comprehensive plugin development guide and examples
  - Add example custom plugin implementations
  - Purpose: Enable third-party plugin development
  - _Leverage: Plugin interface specifications, example implementations_
  - _Requirements: Plugin extensibility requirements_
  - _Prompt: Role: Technical Writer with expertise in developer documentation and plugin systems | Task: Create comprehensive plugin development documentation with examples and tutorials | Restrictions: Must be clear and actionable, include working examples, maintain consistency with plugin interface | Success: Documentation enables third-party plugin development, examples work correctly, setup instructions are clear_

- [x] 23. Create user documentation and examples in docs/
  - File: docs/README.md, docs/api.md, docs/ssh-setup.md, examples/
  - Write comprehensive user documentation and setup guides
  - Add example CLI tool integrations and configuration examples with plugin configurations
  - Purpose: Provide clear guidance for users and developers
  - _Leverage: Markdown documentation, code examples_
  - _Requirements: Usability requirements_
  - _Prompt: Role: Technical Writer with expertise in developer documentation and user guides | Task: Create comprehensive documentation including setup guides, API documentation, plugin configuration, and examples following usability requirements | Restrictions: Must be clear and actionable, include real examples, maintain consistency with implementation, cover plugin configuration | Success: Documentation is comprehensive and easy to follow, plugin configuration examples work correctly, users can successfully set up and use the system_

- [x] 24. Final integration and deployment preparation in deployment/
  - File: deployment/docker/Dockerfile, deployment/scripts/install.sh, deployment/plugin-examples/
  - Create Docker containers for easy deployment with plugin support
  - Add installation scripts, plugin packaging tools, and deployment documentation
  - Purpose: Enable easy deployment, distribution, and plugin management
  - _Leverage: Docker best practices, shell scripting, plugin system_
  - _Requirements: All requirements_
  - _Prompt: Role: DevOps Engineer with expertise in containerization and deployment automation | Task: Create deployment artifacts including Docker containers, installation scripts, and plugin packaging tools covering all requirements | Restrictions: Must follow Docker best practices, ensure security in deployment, provide clear deployment instructions, support plugin installation | Success: Docker containers build and run correctly with plugin support, installation scripts work on target platforms, plugin packaging tools function properly, deployment documentation is complete_