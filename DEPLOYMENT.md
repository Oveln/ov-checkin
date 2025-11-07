# 部署指南

本指南将帮助您将签到系统部署到 Cloudflare Workers 生产环境。

## 部署前准备

### 1. Cloudflare 账户准备

1. 注册 Cloudflare 账户（如果还没有）
2. 升级到 Workers Paid Plan（支持 Cron Triggers）
3. 获取 Cloudflare API Token

### 2. 域名准备（可选）

如果您想使用自定义域名：

1. 在 Cloudflare 中添加域名
2. 配置 DNS 记录

## 部署步骤

### 步骤 1: 安装和配置 Wrangler

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler auth login

# 验证登录
wrangler whoami
```

### 步骤 2: 创建 KV Namespaces

```bash
# 创建生产环境 KV
wrangler kv:namespace create "TOKEN_KV"

# 输出示例：
# {
#   "binding": "TOKEN_KV",
#   "id": "your-production-kv-id"
# }

# 创建预览环境 KV
wrangler kv:namespace create "TOKEN_KV" --preview

# 输出示例：
# {
#   "binding": "TOKEN_KV",
#   "preview_id": "your-preview-kv-id"
# }
```

### 步骤 3: 更新配置文件

编辑 `wrangler.toml`，更新以下内容：

```toml
# 替换为你的 KV ID
[[kv_namespaces]]
binding = "TOKEN_KV"
id = "your-production-kv-id"
preview_id = "your-preview-kv-id"

# 更新环境变量
[env.production.vars]
USER_NAME = "你的真实姓名"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = "465"
SMTP_USER = "your-email@gmail.com"
SMTP_PASS = "your-app-password"
TO_EMAIL = "recipient@example.com"

# Worker URLs（部署后需要更新）
AUTH_WORKER_URL = "https://auth-handler.your-subdomain.workers.dev"
POLLING_WORKER_URL = "https://login-polling.your-subdomain.workers.dev"
CHECKIN_WORKER_URL = "https://checkin-scheduler.your-subdomain.workers.dev"

# JWT 密钥（生成一个强密码）
JWT_SECRET = "your-very-secure-jwt-secret-key-here"
```

### 步骤 4: 配置邮件服务

#### 使用 Gmail

1. 启用两步验证
2. 生成应用专用密码：
   - 访问 Google 账户设置
   - 安全性 → 两步验证 → 应用专用密码
   - 选择"邮件"和设备，生成密码
3. 更新配置中的 `SMTP_PASS`

#### 使用 SendGrid（推荐）

1. 注册 SendGrid 账户
2. 生成 API Key
3. 更新环境变量：
   ```bash
   SENDGRID_API_KEY="your-sendgrid-api-key"
   ```

### 步骤 5: 部署 Workers

```bash
# 安装依赖
npm install

# 部署到生产环境
npm run deploy:production

# 或使用 Wrangler 命令
wrangler deploy --env production
```

### 步骤 6: 配置 Worker URL

部署完成后，Cloudflare 会为每个 Worker 生成 URL：

```
https://checkin-scheduler.your-subdomain.workers.dev
https://auth-handler.your-subdomain.workers.dev
https://login-polling.your-subdomain.workers.dev
```

更新 `wrangler.toml` 中的 Worker URL：

```toml
AUTH_WORKER_URL = "https://auth-handler.your-subdomain.workers.dev"
POLLING_WORKER_URL = "https://login-polling.your-subdomain.workers.dev"
CHECKIN_WORKER_URL = "https://checkin-scheduler.your-subdomain.workers.dev"
```

然后重新部署以应用 URL 更新。

### 步骤 7: 测试部署

1. **测试定时触发**：
   ```bash
   curl -X POST https://checkin-scheduler.your-subdomain.workers.dev/trigger-checkin
   ```

2. **测试认证链接**：
   - 访问 `https://auth-handler.your-subdomain.workers.dev/auth/test-token`
   - 应该看到错误页面（因为 test-token 不是有效的）

3. **检查邮件**：
   - 触发测试后检查邮箱是否收到邮件

### 步骤 8: 验证 Cron Trigger

确保定时任务正确配置：

```bash
# 查看 Cron Triggers 状态
wrangler triggers list

# 测试 Cron Trigger（可选）
wrangler triggers test --name "checkin-scheduler"
```

## 环境配置

### 开发环境

创建 `.dev.vars` 文件：

```bash
# 本地开发配置
USER_NAME="测试用户"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="test@gmail.com"
SMTP_PASS="test-password"
TO_EMAIL="test@example.com"
JWT_SECRET="test-jwt-secret"
```

### 生产环境

通过 Cloudflare Dashboard 或 Wrangler 设置：

```bash
# 设置单个环境变量
wrangler secret put SMTP_PASS

# 批量设置
echo "SMTP_HOST=smtp.gmail.com" >> .env.production
echo "SMTP_PORT=465" >> .env.production
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
```

## 监控和维护

### 查看日志

```bash
# 实时日志
wrangler tail

# 特定 Worker 日志
wrangler tail --name auth-handler

# 过滤日志
wrangler tail --format=json | jq '.message | select(contains("ERROR"))'
```

### 性能监控

1. 访问 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 查看分析数据：
   - 请求次数
   - 响应时间
   - 错误率

### 更新部署

```bash
# 更新代码后重新部署
npm run deploy:production

# 滚动更新（如果需要）
wrangler deploy --env production --compatibility-date=2024-01-01
```

## 故障排除

### 常见部署问题

1. **KV Namespace 错误**
   ```bash
   # 检查 KV Namespace
   wrangler kv:namespace list
   ```

2. **环境变量未设置**
   ```bash
   # 检查环境变量
   wrangler secret list
   ```

3. **域名未绑定**
   - 确保 Workers 已正确部署
   - 检查自定义域名配置

4. **Cron Trigger 不工作**
   ```bash
   # 检查 Cron 配置
   wrangler triggers list
   ```

### 回滚部署

如果需要回滚：

```bash
# 查看部署历史
wrangler deployments list

# 回滚到特定版本
wrangler rollback [deployment-id]
```

## 安全最佳实践

1. **使用 Secret 存储敏感信息**：
   ```bash
   wrangler secret put SMTP_PASS
   wrangler secret put JWT_SECRET
   ```

2. **配置 CORS**（如需要）：
   ```javascript
   // 在 Worker 中添加 CORS 头
   response.headers.set('Access-Control-Allow-Origin', 'https://your-domain.com');
   ```

3. **限制请求频率**：
   - 使用 KV 存储实现限流
   - 配置 Cloudflare Rate Limiting

4. **监控异常访问**：
   - 设置告警规则
   - 定期查看访问日志

## 高级配置

### 自定义域名

1. 在 Cloudflare Dashboard 中添加自定义域名
2. 配置 DNS 记录
3. 在 Workers 中绑定域名

### 环境隔离

```bash
# 创建不同环境的配置
wrangler kv:namespace create "TOKEN_KV" --env staging
wrangler deploy --env staging
```

### 多区域部署

```bash
# 配置多区域部署
wrangler deploy --env production --region "us-east1,eu-west1"
```

## 支持和联系

如果遇到部署问题：

1. 查看 [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
2. 检查 [GitHub Issues](https://github.com/your-repo/issues)
3. 联系技术支持

---

## 部署清单

在完成部署前，请确认以下项目：

- [ ] Cloudflare 账户已升级到 Workers Paid Plan
- [ ] KV Namespace 已创建并配置
- [ ] 所有环境变量已设置
- [ ] 邮件服务已配置并测试
- [ ] Worker URL 已更新
- [ ] 定时触发器已验证
- [ ] 完整功能测试已通过
- [ ] 监控和告警已配置
- [ ] 回滚计划已准备

完成以上步骤后，您的签到系统就可以在生产环境运行了！