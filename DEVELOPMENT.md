# 开发指南

本文档为 SSH 通知工具项目的开发人员提供详细的开发指南。

## 环境设置

### 系统要求

- Node.js >= 18.0.0 (推荐使用 LTS 版本)
- npm >= 8.0.0 或 yarn >= 1.22.0
- Git >= 2.20.0

### 开发工具推荐

- **编辑器**: VSCode / WebStorm / Vim
- **调试**: Node.js Inspector / VSCode Debugger
- **API 测试**: Postman / Insomnia / curl
- **版本控制**: Git with conventional commits

## 项目设置

### 1. 克隆和初始化

```bash
git clone <repo-url>
cd ssh-notify-tool
npm install
```

### 2. 环境配置

创建本地配置文件：

```bash
# 创建配置目录
mkdir -p ~/.notifytool

# 复制示例配置
cp config/default.json ~/.notifytool/config.json
```

编辑 `~/.notifytool/config.json`：

```json
{
  "server": {
    "port": 5000,
    "host": "127.0.0.1"
  },
  "auth": {
    "token": "dev-token-123"
  },
  "handlers": {
    "desktop": {
      "enabled": true
    },
    "email": {
      "enabled": false
    },
    "sms": {
      "enabled": false
    }
  },
  "logging": {
    "level": "debug"
  }
}
```

## 开发流程

### 1. 分支策略

- `main`: 主分支，稳定版本
- `develop`: 开发分支，集成最新功能
- `feature/*`: 功能分支
- `bugfix/*`: 修复分支
- `hotfix/*`: 紧急修复分支

### 2. 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
feat: 添加桌面通知处理器
fix: 修复 SSH 隧道连接问题
docs: 更新 API 文档
style: 格式化代码
refactor: 重构配置管理模块
test: 添加邮件处理器测试
chore: 更新依赖包
```

### 3. 开发环境启动

```bash
# 启动服务器（开发模式，支持热重载）
npm run dev:server

# 启动客户端（开发模式）
npm run dev:client

# 运行测试（监视模式）
npm run test:watch
```

## 代码组织

### 目录结构说明

```
server/src/
├── app.js              # 应用主入口
├── config/
│   ├── index.js        # 配置加载和验证
│   └── default.json    # 默认配置
├── routes/
│   ├── index.js        # 路由汇总
│   ├── notify.js       # 通知 API
│   └── health.js       # 健康检查
├── handlers/
│   ├── base.js         # 处理器基类
│   ├── desktop.js      # 桌面通知
│   ├── email.js        # 邮件通知
│   └── sms.js          # 短信通知
├── middleware/
│   ├── auth.js         # 认证中间件
│   ├── logger.js       # 日志中间件
│   ├── validator.js    # 参数验证
│   └── errorHandler.js # 错误处理
├── utils/
│   ├── logger.js       # 日志工具
│   ├── queue.js        # 队列管理
│   └── validator.js    # 数据验证
└── services/
    ├── notifier.js     # 通知服务
    └── sshTunnel.js    # SSH 隧道
```

### 编码规范

1. **命名约定**
   - 文件名：kebab-case (`notification-handler.js`)
   - 变量名：camelCase (`notificationQueue`)
   - 类名：PascalCase (`NotificationHandler`)
   - 常量：SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)

2. **函数设计**
   - 保持函数小而专一
   - 使用描述性的函数名
   - 优先使用 async/await 而非 Promise.then()

3. **错误处理**
   - 使用自定义错误类
   - 记录详细的错误信息
   - 实现优雅降级

4. **注释规范**
   - 使用 JSDoc 注释公共 API
   - 解释复杂的业务逻辑
   - 避免显而易见的注释

## 测试策略

### 测试层次

1. **单元测试**
   - 测试独立的函数和类
   - 使用 Jest 和模拟对象
   - 目标覆盖率 > 90%

2. **集成测试**
   - 测试组件间的交互
   - 测试 API 端点
   - 测试数据库操作

3. **端到端测试**
   - 测试完整的用户流程
   - 测试 CLI 命令
   - 测试通知发送

### 测试文件组织

```
test/
├── unit/
│   ├── handlers/
│   ├── utils/
│   └── services/
├── integration/
│   ├── api/
│   └── handlers/
└── e2e/
    ├── cli/
    └── notification/
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- handlers/desktop.test.js

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监视模式
npm run test:watch
```

## 调试指南

### 服务器调试

1. **使用 Node.js Inspector**
```bash
node --inspect server/src/app.js
```

2. **VSCode 调试配置**
```json
{
  "name": "Debug Server",
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/server/src/app.js",
  "env": {
    "NODE_ENV": "development"
  },
  "console": "integratedTerminal"
}
```

### 客户端调试

```bash
# 调试 CLI 命令
node --inspect client/src/cli.js --help

# 启用详细日志
DEBUG=notify:* node client/src/cli.js "test" "message"
```

### 常见问题排查

1. **连接问题**
   - 检查防火墙设置
   - 验证端口是否被占用
   - 确认 SSH 隧道状态

2. **认证问题**
   - 验证 Token 配置
   - 检查权限设置
   - 查看认证日志

3. **通知问题**
   - 检查处理器配置
   - 验证第三方服务配置
   - 查看错误日志

## 性能优化

### 1. 服务器优化

- 使用连接池
- 实现请求缓存
- 优化数据库查询
- 使用集群模式

### 2. 客户端优化

- 实现请求重试
- 使用连接复用
- 压缩请求数据
- 异步处理响应

### 3. 监控指标

- 响应时间
- 错误率
- 内存使用
- CPU 使用率
- 通知成功率

## 部署准备

### 构建

```bash
# 安装生产依赖
npm ci --production

# 运行代码检查
npm run lint

# 运行测试
npm test

# 生成文档
npm run docs
```

### 环境配置

生产环境配置示例：

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0"
  },
  "logging": {
    "level": "info",
    "file": "/var/log/notify-tool/app.log"
  },
  "handlers": {
    "desktop": {
      "enabled": false
    },
    "email": {
      "enabled": true
    }
  }
}
```

## 贡献流程

### 1. 开发新功能

```bash
# 创建功能分支
git checkout -b feature/new-handler

# 开发和测试
# ... 编写代码 ...

# 运行测试和代码检查
npm run lint
npm test

# 提交更改
git add .
git commit -m "feat: add new notification handler"

# 推送分支
git push origin feature/new-handler
```

### 2. 代码审查

- 创建 Pull Request
- 等待代码审查
- 根据反馈修改代码
- 合并到开发分支

### 3. 发布流程

```bash
# 更新版本号
npm version patch  # 或 minor, major

# 生成变更日志
npm run changelog

# 创建发布标签
git tag -a v1.0.1 -m "Release v1.0.1"

# 推送标签
git push origin v1.0.1
```

## 扩展开发

### 添加新的通知处理器

1. 创建处理器类：

```javascript
// handlers/webhook.js
const BaseHandler = require('./base');

class WebhookHandler extends BaseHandler {
  async send(notification) {
    // 实现 Webhook 发送逻辑
  }
}

module.exports = WebhookHandler;
```

2. 注册处理器：

```javascript
// app.js
const WebhookHandler = require('./handlers/webhook');
server.registerHandler('webhook', new WebhookHandler(config.handlers.webhook));
```

3. 添加配置：

```json
{
  "handlers": {
    "webhook": {
      "enabled": true,
      "url": "https://hooks.slack.com/...",
      "method": "POST"
    }
  }
}
```

4. 编写测试：

```javascript
// test/handlers/webhook.test.js
describe('WebhookHandler', () => {
  it('should send webhook notification', async () => {
    // 测试逻辑
  });
});
```

## 资源链接

- [Node.js 官方文档](https://nodejs.org/docs/)
- [Express.js 指南](https://expressjs.com/guide/)
- [Jest 测试框架](https://jestjs.io/docs/)
- [SSH2 库文档](https://github.com/mscdex/ssh2)
- [Winston 日志库](https://github.com/winstonjs/winston)