# API Documentation

Complete REST API reference for the SSH Notify Tool server.

## Table of Contents

- [Authentication](#authentication)
- [Base URL](#base-url)
- [Common Request/Response Formats](#common-requestresponse-formats)
- [Endpoints](#endpoints)
  - [Send Notification](#send-notification)
  - [Health Check](#health-check)
  - [Plugin Management](#plugin-management)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Authentication

The API uses Bearer token authentication. Include the token in the Authorization header:

```http
Authorization: Bearer your-auth-token
```

### Token Configuration

Configure authentication in your `config.json`:

```json
{
  "server": {
    "auth": {
      "enabled": true,
      "token": "your-secure-token-here"
    }
  }
}
```

### Generating Secure Tokens

```bash
# Generate a random token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Base URL

Default server base URL: `http://localhost:3000`

All API endpoints are prefixed with `/api`:

```
http://localhost:3000/api/notify
http://localhost:3000/api/health
```

## Common Request/Response Formats

### Request Headers

```http
Content-Type: application/json
Authorization: Bearer your-auth-token
User-Agent: YourApp/1.0.0
```

### Success Response Format

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data specific to the endpoint
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Error type or code",
  "message": "Human-readable error message",
  "details": {
    // Additional error details
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Endpoints

### Send Notification

Send a notification through configured channels.

**Endpoint**: `POST /api/notify`

**Headers**:
```http
Content-Type: application/json
Authorization: Bearer your-auth-token
```

**Request Body**:

```json
{
  "title": "string (required)",
  "message": "string (required)", 
  "level": "string (optional)",
  "channels": ["string"] | "string (optional)",
  "metadata": "object (optional)",
  "priority": "number (optional)",
  "tags": ["string"] | "string (optional)"
}
```

**Parameters**:

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `title` | string | Yes | Notification title | - |
| `message` | string | Yes | Notification message body | - |
| `level` | string | No | Notification level: `info`, `success`, `warning`, `error`, `debug` | `info` |
| `channels` | array/string | No | Target channels. If not specified, uses default channels from config | All enabled |
| `metadata` | object | No | Additional data attached to notification | `{}` |
| `priority` | number | No | Priority level (1-5, where 5 is highest) | `3` |
| `tags` | array/string | No | Tags for categorization and filtering | `[]` |

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Notification sent successfully",
  "data": {
    "notificationId": "uuid",
    "channels": {
      "desktop": {
        "success": true,
        "messageId": "desktop-123",
        "timestamp": "2024-01-15T10:30:00.000Z"
      },
      "email": {
        "success": true, 
        "messageId": "email-456",
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    },
    "totalChannels": 2,
    "successCount": 2,
    "failureCount": 0
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Example Request**:

```bash
curl -X POST http://localhost:3000/api/notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "title": "Deployment Complete",
    "message": "Application v1.2.3 deployed successfully to production",
    "level": "success",
    "channels": ["desktop", "slack"],
    "metadata": {
      "version": "1.2.3",
      "environment": "production",
      "deployTime": "2m 15s"
    },
    "priority": 4,
    "tags": ["deployment", "production"]
  }'
```

### Health Check

Check server and plugin health status.

**Endpoint**: `GET /api/health`

**Headers**: None required (public endpoint)

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Server is healthy",
  "data": {
    "server": {
      "status": "healthy",
      "uptime": 86400,
      "version": "1.0.0",
      "nodeVersion": "18.15.0"
    },
    "plugins": {
      "desktop": {
        "enabled": true,
        "healthy": true,
        "lastCheck": "2024-01-15T10:29:00.000Z"
      },
      "email": {
        "enabled": true,
        "healthy": true,
        "lastCheck": "2024-01-15T10:29:00.000Z"
      },
      "slack": {
        "enabled": true,
        "healthy": false,
        "lastCheck": "2024-01-15T10:29:00.000Z",
        "error": "Invalid webhook URL"
      }
    },
    "overallHealth": "degraded"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Health Status Values**:
- `healthy`: All systems operational
- `degraded`: Some plugins have issues but core functionality works
- `unhealthy`: Critical issues affecting core functionality

### Plugin Management

#### List All Plugins

Get information about all available plugins.

**Endpoint**: `GET /api/plugins`

**Headers**:
```http
Authorization: Bearer your-auth-token
```

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Plugins retrieved successfully",
  "data": {
    "plugins": [
      {
        "name": "desktop",
        "displayName": "Desktop Notifications",
        "version": "1.0.0",
        "author": "SSH Notify Tool Team",
        "description": "Cross-platform desktop notifications",
        "enabled": true,
        "healthy": true,
        "capabilities": ["text", "actions", "sound"],
        "type": "builtin"
      },
      {
        "name": "email",
        "displayName": "Email Notifications", 
        "version": "1.0.0",
        "author": "SSH Notify Tool Team",
        "description": "SMTP email notifications with HTML/text support",
        "enabled": true,
        "healthy": true,
        "capabilities": ["text", "html", "attachments"],
        "type": "builtin"
      }
    ],
    "total": 2,
    "enabled": 2,
    "healthy": 2
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Get Plugin Details

Get detailed information about a specific plugin.

**Endpoint**: `GET /api/plugins/:name`

**Headers**:
```http
Authorization: Bearer your-auth-token
```

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Plugin details retrieved successfully",
  "data": {
    "plugin": {
      "name": "slack",
      "displayName": "Slack Notifications",
      "version": "1.0.0",
      "author": "SSH Notify Tool Team", 
      "description": "Send notifications to Slack channels via webhooks",
      "enabled": true,
      "healthy": true,
      "capabilities": ["text", "markdown", "blocks", "attachments"],
      "type": "official",
      "configuration": {
        "webhookUrl": "configured",
        "channel": "#notifications",
        "username": "NotifyBot",
        "enableRichFormatting": true
      },
      "statistics": {
        "totalSent": 1542,
        "successRate": 98.7,
        "lastSent": "2024-01-15T10:25:00.000Z",
        "averageResponseTime": 245
      }
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Plugin Health Check

Check health status of a specific plugin.

**Endpoint**: `GET /api/plugins/:name/health`

**Headers**:
```http
Authorization: Bearer your-auth-token
```

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Plugin health check completed",
  "data": {
    "plugin": "slack",
    "healthy": true,
    "status": "operational",
    "lastCheck": "2024-01-15T10:30:00.000Z",
    "responseTime": 234,
    "details": {
      "webhookUrl": "reachable",
      "authentication": "valid",
      "rateLimit": "within_limits"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Error Handling

### HTTP Status Codes

| Status | Meaning | Description |
|--------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request format or missing required fields |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Requested resource not found |
| 422 | Unprocessable Entity | Valid request format but invalid data |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Server temporarily unavailable |

### Error Response Examples

**400 Bad Request**:
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Missing required field: title",
  "details": {
    "field": "title",
    "type": "required"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**401 Unauthorized**:
```json
{
  "success": false,
  "error": "UNAUTHORIZED", 
  "message": "Authentication token is required",
  "details": {
    "authRequired": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**500 Internal Server Error**:
```json
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "Plugin 'email' failed to send notification",
  "details": {
    "plugin": "email",
    "originalError": "SMTP connection timeout"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Plugin-Specific Errors

When plugin operations fail, the response includes detailed information:

```json
{
  "success": false,
  "error": "PLUGIN_ERROR",
  "message": "Notification partially failed",
  "data": {
    "notificationId": "uuid",
    "channels": {
      "desktop": {
        "success": true,
        "messageId": "desktop-123"
      },
      "email": {
        "success": false,
        "error": "SMTP authentication failed",
        "details": {
          "code": "EAUTH",
          "response": "535 Authentication failed"
        }
      }
    },
    "totalChannels": 2,
    "successCount": 1,
    "failureCount": 1
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Rate Limiting

### Default Limits

- **Per IP**: 100 requests per minute
- **Per Token**: 500 requests per minute
- **Global**: 1000 requests per minute

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248600
```

### Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1642248660

{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Try again later.",
  "details": {
    "limit": 100,
    "remaining": 0,
    "resetTime": "2024-01-15T10:31:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

class NotifyClient {
  constructor(baseUrl = 'http://localhost:3000', token = null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async notify(notification) {
    const response = await axios.post(`${this.baseUrl}/api/notify`, notification, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async health() {
    const response = await axios.get(`${this.baseUrl}/api/health`);
    return response.data;
  }

  async plugins() {
    const response = await axios.get(`${this.baseUrl}/api/plugins`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    return response.data;
  }
}

// Usage
const client = new NotifyClient('http://localhost:3000', 'your-token');

await client.notify({
  title: 'Build Complete',
  message: 'Application built successfully',
  level: 'success',
  channels: ['desktop', 'slack']
});
```

### Python

```python
import requests
import json

class NotifyClient:
    def __init__(self, base_url='http://localhost:3000', token=None):
        self.base_url = base_url
        self.token = token
        self.headers = {
            'Content-Type': 'application/json'
        }
        if token:
            self.headers['Authorization'] = f'Bearer {token}'

    def notify(self, notification):
        response = requests.post(
            f'{self.base_url}/api/notify',
            json=notification,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def health(self):
        response = requests.get(f'{self.base_url}/api/health')
        response.raise_for_status()
        return response.json()

    def plugins(self):
        response = requests.get(
            f'{self.base_url}/api/plugins',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage
client = NotifyClient('http://localhost:3000', 'your-token')

client.notify({
    'title': 'Backup Complete',
    'message': 'Database backup completed successfully',
    'level': 'success',
    'channels': ['email'],
    'metadata': {
        'size': '2.5GB',
        'duration': '5m 23s'
    }
})
```

### Bash/curl

```bash
#!/bin/bash

SERVER_URL="http://localhost:3000"
AUTH_TOKEN="your-auth-token"

# Function to send notification
send_notification() {
  local title="$1"
  local message="$2"
  local level="${3:-info}"
  
  curl -X POST "$SERVER_URL/api/notify" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{
      \"title\": \"$title\",
      \"message\": \"$message\",
      \"level\": \"$level\",
      \"channels\": [\"desktop\", \"email\"]
    }"
}

# Function to check health
check_health() {
  curl -s "$SERVER_URL/api/health" | jq .
}

# Usage examples
send_notification "Script Started" "Backup script has started" "info"
send_notification "Script Complete" "Backup completed successfully" "success"
check_health
```

### Integration with CI/CD

#### GitHub Actions

```yaml
name: Build and Notify
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Build application
        run: npm run build
      - name: Notify on success
        if: success()
        run: |
          curl -X POST ${{ secrets.NOTIFY_SERVER }}/api/notify \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.NOTIFY_TOKEN }}" \
            -d '{
              "title": "Build Successful",
              "message": "GitHub Actions build completed successfully",
              "level": "success",
              "metadata": {
                "repository": "${{ github.repository }}",
                "commit": "${{ github.sha }}",
                "branch": "${{ github.ref_name }}"
              }
            }'
      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.NOTIFY_SERVER }}/api/notify \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.NOTIFY_TOKEN }}" \
            -d '{
              "title": "Build Failed",
              "message": "GitHub Actions build failed",
              "level": "error",
              "channels": ["desktop", "slack"]
            }'
```

This API documentation provides comprehensive information for integrating with the SSH Notify Tool server programmatically.