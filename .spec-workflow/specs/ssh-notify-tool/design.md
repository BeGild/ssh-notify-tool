# SSH 通知工具设计文档

## 系统架构

### 整体架构图
```
┌─────────────────┐    SSH Tunnel    ┌─────────────────┐
│   Remote CLI    │ ◄──────────────► │   Local Server  │
│    (Client)     │                  │   (Receiver)    │
├─────────────────┤                  ├─────────────────┤
│ • 发送通知请求   │                  │ • 接收通知请求   │
│ • HTTP Client   │                  │ • 路由分发      │
│ • CLI 接口      │                  │ • 通知处理      │
└─────────────────┘                  └─────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ Notification    │
                                    │   Handlers      │
                                    ├─────────────────┤
                                    │ • Desktop       │
                                    │ • Email         │
                                    │ • SMS           │
                                    │ • Custom        │
                                    └─────────────────┘
```

## 核心组件设计

### 1. 服务端 (Server)

#### 1.1 目录结构
```
server/
├── src/
│   ├── app.js              # 应用入口
│   ├── config/
│   │   ├── index.js        # 配置管理
│   │   └── default.json    # 默认配置
│   ├── routes/
│   │   ├── notify.js       # 通知 API 路由
│   │   └── health.js       # 健康检查
│   ├── handlers/
│   │   ├── base.js         # 通知处理器基类
│   │   ├── desktop.js      # 桌面通知处理器
│   │   ├── email.js        # 邮件通知处理器
│   │   └── sms.js          # 短信通知处理器
│   ├── middleware/
│   │   ├── auth.js         # 认证中间件
│   │   ├── rate-limit.js   # 限流中间件
│   │   └── logger.js       # 日志中间件
│   ├── utils/
│   │   ├── logger.js       # 日志工具
│   │   ├── queue.js        # 队列管理
│   │   └── validator.js    # 数据验证
│   └── services/
│       ├── notifier.js     # 通知服务
│       └── ssh-tunnel.js   # SSH 隧道管理
├── test/                   # 测试文件
├── package.json
└── README.md
```

#### 1.2 核心类设计

##### 1.2.1 NotificationServer
```javascript
class NotificationServer {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.handlers = new Map();
    this.queue = new NotificationQueue();
  }
  
  async start() {
    this.setupMiddleware();
    this.setupRoutes();
    this.registerHandlers();
    await this.listen();
  }
  
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }
  
  async processNotification(notification) {
    return this.queue.add(() => this._process(notification));
  }
}
```

##### 1.2.2 NotificationHandler (基类)
```javascript
class NotificationHandler {
  constructor(config) {
    this.config = config;
  }
  
  async send(notification) {
    throw new Error('Must implement send method');
  }
  
  validate(notification) {
    // 基础验证逻辑
  }
  
  async beforeSend(notification) {
    // 发送前处理
  }
  
  async afterSend(result) {
    // 发送后处理
  }
}
```

### 2. 客户端 (Client)

#### 2.1 目录结构
```
client/
├── src/
│   ├── cli.js              # CLI 入口
│   ├── client.js           # HTTP 客户端
│   ├── config.js           # 配置管理
│   └── utils/
│       ├── ssh.js          # SSH 隧道工具
│       └── validator.js    # 输入验证
├── bin/
│   └── notify              # 可执行文件
├── test/
├── package.json
└── README.md
```

#### 2.2 核心类设计

##### 2.2.1 NotificationClient
```javascript
class NotificationClient {
  constructor(config) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.serverUrl,
      timeout: config.timeout,
      headers: {
        'Authorization': `Bearer ${config.token}`
      }
    });
  }
  
  async send(notification) {
    try {
      const response = await this.httpClient.post('/notify', notification);
      return response.data;
    } catch (error) {
      throw new NotificationError(`Failed to send: ${error.message}`);
    }
  }
  
  async testConnection() {
    return this.httpClient.get('/health');
  }
}
```

## API 设计

### 1. REST API 端点

#### 1.1 发送通知
```
POST /api/v1/notify
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "任务完成",
  "message": "数据处理任务已成功完成",
  "level": "info|warning|error",
  "channels": ["desktop", "email", "sms"],
  "metadata": {
    "priority": 1,
    "tags": ["automation", "data-processing"],
    "attachments": [
      {
        "type": "image",
        "url": "file:///path/to/screenshot.png"
      }
    ]
  },
  "options": {
    "desktop": {
      "timeout": 5000,
      "actions": [
        {"label": "查看详情", "action": "open_url", "url": "http://..."}
      ]
    },
    "email": {
      "to": ["user@example.com"],
      "subject": "Custom Subject",
      "html": true
    },
    "sms": {
      "to": ["+1234567890"]
    }
  }
}
```

#### 1.2 响应格式
```json
{
  "success": true,
  "data": {
    "id": "notification_123",
    "timestamp": "2024-01-01T00:00:00Z",
    "results": {
      "desktop": {"success": true, "messageId": "desk_123"},
      "email": {"success": true, "messageId": "email_456"},
      "sms": {"success": false, "error": "Invalid phone number"}
    }
  }
}
```

#### 1.3 健康检查
```
GET /api/v1/health

{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "version": "1.0.0",
  "handlers": {
    "desktop": "available",
    "email": "configured",
    "sms": "not_configured"
  }
}
```

### 2. CLI 接口设计

```bash
# 基础用法
notify "Task completed" "The data processing task has finished successfully"

# 指定级别和渠道
notify --level warning --channels desktop,email "Warning" "Disk space low"

# 使用配置文件
notify --config ./custom-config.json --title "Deploy" --message "Deployment failed"

# 测试连接
notify --test

# 服务管理
notify-server start --port 5000 --config ~/.notifytool/config.json
notify-server stop
notify-server status
```

## 配置系统设计

### 1. 配置文件结构
```json
{
  "server": {
    "port": 5000,
    "host": "127.0.0.1",
    "cors": {
      "origin": ["http://localhost:3000"],
      "credentials": true
    },
    "rateLimit": {
      "windowMs": 60000,
      "max": 100
    }
  },
  "auth": {
    "token": "your-secret-token",
    "tokenExpiry": 3600
  },
  "handlers": {
    "desktop": {
      "enabled": true,
      "defaultTimeout": 5000,
      "sound": true
    },
    "email": {
      "enabled": true,
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "your-email@gmail.com",
          "pass": "your-password"
        }
      },
      "defaults": {
        "from": "notifications@yourapp.com",
        "to": ["user@example.com"]
      }
    },
    "sms": {
      "enabled": false,
      "provider": "twilio",
      "config": {
        "accountSid": "your-account-sid",
        "authToken": "your-auth-token",
        "fromNumber": "+1234567890"
      }
    }
  },
  "logging": {
    "level": "info",
    "file": "~/.notifytool/logs/app.log",
    "maxSize": "10m",
    "maxFiles": 5
  },
  "queue": {
    "concurrency": 5,
    "retries": 3,
    "retryDelay": 1000
  }
}
```

### 2. 环境变量支持
```bash
NOTIFY_SERVER_PORT=5000
NOTIFY_AUTH_TOKEN=secret
NOTIFY_EMAIL_USER=user@gmail.com
NOTIFY_EMAIL_PASS=password
NOTIFY_SMS_ACCOUNT_SID=sid
NOTIFY_SMS_AUTH_TOKEN=token
```

## SSH 隧道设计

### 1. 反向端口转发
```bash
# 建立隧道
ssh -R 5001:localhost:5000 -N user@remote-server

# 客户端使用
notify --server http://localhost:5001 "message"
```

### 2. 自动隧道管理
```javascript
class SSHTunnelManager {
  constructor(config) {
    this.config = config;
    this.tunnels = new Map();
  }
  
  async createTunnel(remoteHost, localPort, remotePort) {
    const tunnel = new SSHTunnel({
      host: remoteHost,
      localPort,
      remotePort,
      privateKey: this.config.sshPrivateKey
    });
    
    await tunnel.connect();
    this.tunnels.set(`${remoteHost}:${remotePort}`, tunnel);
    return tunnel;
  }
  
  async closeTunnel(key) {
    const tunnel = this.tunnels.get(key);
    if (tunnel) {
      await tunnel.close();
      this.tunnels.delete(key);
    }
  }
}
```

## 错误处理设计

### 1. 错误分类
```javascript
class NotificationError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// 错误类型
const ErrorCodes = {
  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  
  // 认证错误
  AUTH_FAILED: 'AUTH_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // 配置错误
  CONFIG_INVALID: 'CONFIG_INVALID',
  HANDLER_NOT_FOUND: 'HANDLER_NOT_FOUND',
  
  // 处理错误
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SEND_FAILED: 'SEND_FAILED'
};
```

### 2. 重试策略
```javascript
class RetryStrategy {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }
  
  async execute(fn, context) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries && this.shouldRetry(error)) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
  }
  
  shouldRetry(error) {
    return [
      'NETWORK_ERROR',
      'CONNECTION_TIMEOUT',
      'SEND_FAILED'
    ].includes(error.code);
  }
}
```

## 安全设计

### 1. 认证机制
- API Token 认证（JWT 可选）
- 请求签名验证
- 时间戳防重放

### 2. 网络安全
- 默认绑定 localhost
- HTTPS 支持（自签名证书）
- CORS 配置
- 速率限制

### 3. 数据安全
- 敏感信息加密存储
- 内存中密钥管理
- 安全的配置文件权限

## 监控和日志

### 1. 结构化日志
```javascript
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: {service: 'notify-tool'},
  transports: [
    new winston.transports.File({filename: 'error.log', level: 'error'}),
    new winston.transports.File({filename: 'combined.log'}),
    new winston.transports.Console()
  ]
});
```

### 2. 指标收集
- 通知发送成功率
- 响应时间分布
- 错误类型统计
- 队列长度监控