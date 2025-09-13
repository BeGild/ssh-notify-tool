# Integration Examples

This directory contains practical examples for integrating the SSH Notify Tool with various systems and workflows.

## Available Examples

### CI/CD Integration
- [GitHub Actions](./ci-cd/github-actions.yml) - Build and deployment notifications
- [GitLab CI](./ci-cd/gitlab-ci.yml) - Pipeline status notifications
- [Jenkins](./ci-cd/jenkins-pipeline.groovy) - Jenkins pipeline integration

### Monitoring Integration
- [Prometheus AlertManager](./monitoring/prometheus-alertmanager.yml) - Metrics-based alerting
- [Grafana](./monitoring/grafana-webhook.py) - Dashboard alert notifications
- [Nagios](./monitoring/nagios-notify.sh) - System monitoring alerts

### Build Tools
- [Webpack](./build-tools/webpack-notify-plugin.js) - Build completion notifications
- [Rollup](./build-tools/rollup-notify-plugin.js) - Bundle completion notifications
- [Vite](./build-tools/vite-notify-plugin.js) - Development and build notifications

### Testing Frameworks
- [Jest](./testing/jest-notify.js) - Test completion notifications
- [Cypress](./testing/cypress-notify.js) - E2E test results
- [Mocha](./testing/mocha-notify.js) - Test suite notifications

### Deployment Tools
- [Docker](./deployment/docker-hooks.sh) - Container lifecycle notifications
- [Kubernetes](./deployment/k8s-hooks.yaml) - Pod and deployment notifications
- [Terraform](./deployment/terraform-notify.sh) - Infrastructure change notifications

### System Administration
- [Backup Scripts](./system/backup-notify.sh) - Backup completion notifications
- [Log Monitoring](./system/log-monitor.py) - Log pattern alerting
- [System Health](./system/health-check.sh) - System monitoring notifications

### Development Workflows
- [Git Hooks](./development/git-hooks.sh) - Git operation notifications
- [Database Migrations](./development/migration-notify.js) - Schema change notifications
- [Code Quality](./development/quality-gates.js) - Code analysis notifications

## Usage

Each example includes:
- Complete configuration files
- Integration scripts
- Usage instructions
- Troubleshooting tips

Copy the relevant examples to your project and modify the configuration as needed.

## Configuration

Most examples require:
1. **Server Configuration**: Update server URL and authentication token
2. **Channel Configuration**: Enable desired notification channels
3. **Environment Variables**: Set up required credentials and endpoints

## Getting Started

1. Choose an example that matches your use case
2. Copy the files to your project directory
3. Update configuration with your server details
4. Install any required dependencies
5. Test the integration with a sample notification

For detailed setup instructions, see the main [documentation](../docs/README.md).