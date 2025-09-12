# SSH 通知工具

一个通用的跨平台通知工具，支持本地和远程 SSH 环境，为 CLI 应用程序提供多种通知方式。

## 特性

- 🔔 **多通知渠道**: 桌面弹窗、邮件、短信
- 🌍 **跨平台支持**: Windows、macOS、Linux
- 🔐 **安全可靠**: Token 认证、SSH 隧道、速率限制
- 🚀 **高性能**: 异步队列、并发处理、重试机制
- 🔌 **易扩展**: 插件式架构，支持自定义通知处理器
- 📡 **远程支持**: 通过 SSH 隧道实现远程通知

## 架构

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

## 快速开始

### 1. 安装依赖

```bash
# 安装服务端依赖
cd server && npm install

# 安装客户端依赖
cd client && npm install
```

### 2. 启动服务器

```bash
cd server
npm start
```

服务器将在 `http://127.0.0.1:5000` 启动。

### 3. 发送通知

```bash
cd client
# 使用默认开发token
node bin/notify --token "default-dev-token-change-in-production" "测试通知" "Hello World!"
```

### 4. 远程使用 (SSH隧道)

```bash
# 在本地机器启动服务器
cd server && npm start

# 建立 SSH 隧道 (将远程5000端口映射到本地5001)
ssh -L 5001:localhost:5000 user@remote-server

# 在客户端连接到本地5001端口发送通知
node bin/notify --server http://localhost:5001 --token "default-dev-token-change-in-production" "远程通知" "来自远程服务器"
```

## CLI使用指南

### 基本语法

```bash
node bin/notify [选项] [标题] [消息内容]
```

### 常用命令

#### 发送通知

```bash
# 发送基本通知
node bin/notify --token YOUR_TOKEN "标题" "消息内容"

# 发送不同级别的通知
node bin/notify --token YOUR_TOKEN --level info "信息" "这是信息通知"
node bin/notify --token YOUR_TOKEN --level warning "警告" "这是警告通知"  
node bin/notify --token YOUR_TOKEN --level error "错误" "这是错误通知"

# 多通道通知 (桌面+邮件)
node bin/notify --token YOUR_TOKEN --channels desktop,email "通知标题" "消息内容"
```

#### 服务器管理

```bash
# 检查服务器状态
node bin/notify server status

# 测试服务器连接
node bin/notify --token YOUR_TOKEN --test

# JSON格式输出
node bin/notify --token YOUR_TOKEN --test --json
```

#### 配置管理

```bash
# 初始化配置文件 (交互模式)
node bin/notify config init

# 设置配置
node bin/notify config set server.url http://your-server:5000
node bin/notify config set auth.token your-token

# 查看配置
node bin/notify config get server.url
node bin/notify config list
```

### 命令行选项

| 选项 | 描述 | 默认值 |
|------|------|---------|
| `-V, --version` | 显示版本号 | - |
| `-l, --level <level>` | 通知级别 (info, warning, error) | info |
| `-c, --channels <channels>` | 通知通道 (desktop,email,sms) | desktop |
| `-s, --server <url>` | 服务器地址 | http://localhost:5000 |
| `-t, --token <token>` | 认证token | - |
| `--config <path>` | 配置文件路径 | - |
| `--timeout <ms>` | 请求超时时间 | 10000 |
| `--retries <count>` | 重试次数 | 3 |
| `--json` | JSON格式输出 | - |
| `--test` | 测试服务器连接 | - |
| `--interactive` | 交互模式 | - |
| `-h, --help` | 显示帮助 | - |

## 项目结构

```
ssh-notify-tool/
├── server/              # 通知服务器
│   ├── src/
│   │   ├── app.js      # 应用入口
│   │   ├── config/     # 配置管理
│   │   ├── routes/     # API 路由
│   │   ├── handlers/   # 通知处理器
│   │   ├── middleware/ # 中间件
│   │   ├── utils/      # 工具函数
│   │   └── services/   # 服务层
│   └── test/           # 测试文件
├── client/             # 客户端 CLI
│   ├── src/
│   │   ├── cli.js      # CLI 入口
│   │   ├── client.js   # HTTP 客户端
│   │   └── utils/      # 工具函数
│   ├── bin/            # 可执行文件
│   └── test/           # 测试文件
├── shared/             # 共享模块
│   ├── src/
│   └── test/
└── docs/               # 文档
```

## 开发

### 前置要求

- Node.js >= 18.0.0
- npm >= 8.0.0

### 开发模式

```bash
# 开发模式启动服务器
npm run dev:server

# 开发模式启动客户端
npm run dev:client

# 运行测试
npm test

# 监视模式运行测试
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage
```

### 代码规范

```bash
# 代码检查
npm run lint

# 自动修复代码问题
npm run lint:fix

# 格式化代码
npm run format

# 检查代码格式
npm run format:check
```

## 配置详情

### 服务器配置

服务器配置文件位于 `server/src/config/default.json`：

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
    "token": "default-dev-token-change-in-production",
    "tokenExpiry": 3600
  },
  "handlers": {
    "desktop": {
      "enabled": true,
      "defaultTimeout": 5000,
      "sound": true
    },
    "email": {
      "enabled": false,
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "your-email@gmail.com",
          "pass": "your-app-password"
        }
      },
      "defaults": {
        "from": "notifications@yourapp.com",
        "to": []
      }
    },
    "sms": {
      "enabled": false,
      "provider": "twilio",
      "config": {
        "accountSid": "your-twilio-sid",
        "authToken": "your-twilio-token",
        "fromNumber": "+1234567890"
      }
    }
  },
  "logging": {
    "level": "info",
    "file": "logs/app.log",
    "maxSize": "10m",
    "maxFiles": 5,
    "format": "json"
  },
  "security": {
    "rateLimitEnabled": true,
    "corsEnabled": true,
    "helmetEnabled": true
  }
}
```

### 环境变量配置

你也可以通过环境变量进行配置：

```bash
export NOTIFY_SERVER_PORT=5000
export NOTIFY_SERVER_HOST=127.0.0.1
export NOTIFY_AUTH_TOKEN=your-secure-token
export NOTIFY_EMAIL_HOST=smtp.gmail.com
export NOTIFY_EMAIL_USER=your-email@gmail.com
export NOTIFY_EMAIL_PASS=your-password
export NOTIFY_SMS_ACCOUNT_SID=your-twilio-sid
export NOTIFY_SMS_AUTH_TOKEN=your-twilio-token
export NOTIFY_SMS_FROM_NUMBER=+1234567890
export NOTIFY_LOG_LEVEL=debug
```

### 通知通道配置

#### 1. 桌面通知
桌面通知默认启用，支持Windows、macOS、Linux系统。

#### 2. 邮件通知
启用邮件通知需要配置SMTP信息：

```json
{
  "handlers": {
    "email": {
      "enabled": true,
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "your-email@gmail.com",
          "pass": "your-app-password"
        }
      },
      "defaults": {
        "from": "notifications@yourapp.com", 
        "to": ["recipient@example.com"]
      }
    }
  }
}
```

#### 3. 短信通知
启用短信通知需要配置Twilio信息：

```json
{
  "handlers": {
    "sms": {
      "enabled": true,
      "provider": "twilio",
      "config": {
        "accountSid": "your-twilio-sid",
        "authToken": "your-twilio-token", 
        "fromNumber": "+1234567890"
      }
    }
  }
}
```

## API 文档

### 发送通知

**接口:** `POST /api/v1/notify`  
**认证:** Bearer Token

**请求体:**
```json
{
  "title": "任务完成",
  "message": "数据处理任务已成功完成",
  "level": "info",
  "channels": ["desktop"],
  "metadata": {
    "category": "system",
    "priority": "normal"
  }
}
```

**响应:**
```json
{
  "success": true,
  "message": "Notification sent successfully",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "results": {
    "desktop": {
      "success": true,
      "messageId": "desktop_1701423600000",
      "timestamp": "2023-12-01T10:00:00.000Z"
    }
  }
}
```

### 健康检查

**接口:** `GET /health`  

**响应:**
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": {
    "rss": 45678976,
    "heapTotal": 28508160,
    "heapUsed": 19345408,
    "external": 1089536,
    "arrayBuffers": 123456
  },
  "handlers": {
    "desktop": "enabled",
    "email": "disabled",
    "sms": "disabled"
  }
}
```

## 故障排除

### 常见问题

#### 1. 认证错误
```
Error: Authentication token is required
```
**解决方案:**
- 使用 `--token` 选项提供认证token
- 运行 `node bin/notify config init` 设置配置文件
- 检查默认token: `default-dev-token-change-in-production`

#### 2. 连接失败
```
Error: Connection failed
```
**解决方案:**
- 检查服务器是否在运行: `cd server && npm start`
- 确认服务器地址正确: 默认 `http://localhost:5000`
- 检查防火墙设置

#### 3. 桌面通知不显示

**Linux系统:**
```bash
# 安装通知依赖
sudo apt-get install libnotify-bin
```

**macOS系统:**
- 在系统偏好设置中允许通知权限

**Windows系统:**
- 在Windows设置中启用应用通知

#### 4. 端口占用
```
Error: listen EADDRINUSE :::5000
```
**解决方案:**
```bash
# 查找占用端口的进程
lsof -ti:5000 | xargs kill -9
# 或者修改配置文件中的端口号
```

### 调试模式

启用详细日志：

```bash
# 设置环境变量
export NOTIFY_LOG_LEVEL=debug

# 启动服务器
cd server && npm start

# 查看日志
tail -f server/logs/app.log
```

## 实际使用示例

### 基础使用

```bash
# 进入客户端目录
cd client

# 发送简单通知
node bin/notify --token "default-dev-token-change-in-production" "任务完成" "数据备份已完成"

# 发送不同级别通知
node bin/notify --token "default-dev-token-change-in-production" --level warning "磁盘空间" "磁盘空间不足80%"
node bin/notify --token "default-dev-token-change-in-production" --level error "系统错误" "数据库连接失败"

# 检查服务器状态
node bin/notify server status

# 测试连接
node bin/notify --token "default-dev-token-change-in-production" --test
```

### SSH隧道示例

```bash
# 场景：从远程服务器发送通知到本地桌面

# 1. 在本地启动服务器
cd server && npm start

# 2. 建立SSH隧道 (在远程服务器执行)
ssh -L 5001:localhost:5000 user@local-machine

# 3. 在远程服务器发送通知
node bin/notify --server http://localhost:5001 --token "default-dev-token-change-in-production" "部署完成" "生产环境部署成功"
```

### 脚本集成

```bash
#!/bin/bash
# 部署脚本示例

# 执行部署
echo "开始部署..."
if deploy_application; then
    # 部署成功通知
    node bin/notify --token "default-dev-token-change-in-production" \
        --level info "部署成功" "应用已成功部署到生产环境"
else
    # 部署失败通知
    node bin/notify --token "default-dev-token-change-in-production" \
        --level error "部署失败" "应用部署过程中发生错误"
fi
```

## 贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详情请见 [LICENSE](LICENSE) 文件。

## 支持

如有问题或建议，请创建 [Issue](issues) 或联系维护者。