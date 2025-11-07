# OV Checkin Worker

一个基于 Cloudflare Workers 的自动签到系统，支持微信扫码登录、定时签到和邮件通知功能。

## 🎯 一句话说明
**这是一个自动签到工具，设置好后每天晚上7:05自动签到，并给你发邮件通知结果。**

## 📋 用户必读（不懂代码也能用）

### ✨ 你需要做什么？
- **首次使用**：收邮件 → 点链接 → 扫码登录 → 完成！
- **日常使用**：完全不用管，自动签到 + 邮件通知

### 📧 会收到哪些邮件？
1. **🔐 登录邮件**：首次或过期时收到，需要点击链接扫码登录
2. **✅ 签到成功**：每天签到成功后的通知
3. **⚠️ 签到提醒**：签到失败时提醒（需要查看失败原因并自行处理）

### ⏰ 什么时候签到？
- **每天晚上7:05（北京时间）自动执行**
- **无需任何操作**，完全自动化

### 🚨 遇到问题？
- 查看 **[故障排除](#-常见问题解答不懂代码版）** 部分
- 大部分问题无需技术人员介入即可解决

---

## 📱 使用流程

### 🎯 简单三步搞定

#### **第1步：等待登录邮件**
- 系统部署后，你会收到一封标题为"🔐 需要重新登录微信"的邮件
- 邮件中包含一个特殊的登录链接，有效期24小时

#### **第2步：微信扫码登录**
1. **点击邮件中的登录链接**（类似：`https://xxx.workers.dev/auth/xxxxxx`）
2. 页面会显示一个**微信二维码**
3. **用微信扫描二维码**
4. 手机上会弹出确认页面，点击**"确认登录"**
5. 看到"✅ 登录成功！正在跳转..."页面就完成了

#### **第3步：坐等自动签到**
- 每天**晚上7:05**会自动签到
- 签到成功或失败都会收到邮件通知
- **无需任何操作**，完全自动化！

### 📧 邮件类型说明

| 邮件类型 | 何时收到 | 需要操作吗 |
|---------|---------|-----------|
| 🔐 **登录邮件** | 首次使用或Token过期时 | ✅ **需要点击链接登录** |
| ✅ **签到成功** | 每天19:05签到成功后 | ❌ 无需操作 |
| ⚠️ **签到提醒** | 签到失败时 | ✅ **需要查看失败原因并处理** |

---

## 🚨 故障排除

### 🆘 常见问题解答（不懂代码版）

#### **❓ 收不到登录邮件怎么办？**
**解决方法：**
1. 先检查**垃圾邮件文件夹**
2. 如果还是没有，联系技术人员检查邮箱配置

#### **❓ 点击登录链接后页面显示错误？**
**解决方法：**
1. 刷新页面重试
2. 换个浏览器试试
3. 如果还不行，等技术人员重新发送登录邮件

#### **❓ 微信扫码后没有反应？**
**解决方法：**
1. 确保二维码完整显示在屏幕上
2. 微信扫描后，手机上要点**"确认登录"**
3. 等待几秒钟，不要立即关闭页面
4. 如果还是不行，重新扫码一次

#### **❓ 签到失败需要我做什么？**
**查看邮件中的失败原因：**
- **"不在打卡时间范围"**：时间不对，明天系统会自动重试
- **"今日已签到"**：已经签过了，无需操作
- **"网络错误"**：网络问题，明天系统会自动重试
- **Token过期**：需要重新扫码登录（会收到登录邮件）

---

## 🔧 技术部署指南

### 📦 部署前准备

#### 1. 环境要求
- Bun 1.0+ (`bun install -g bun`)
- Cloudflare 账号
- Wrangler CLI (`bun install -g wrangler`)

#### 2. 注册 Resend（邮件服务）
1. 访问 [https://resend.com](https://resend.com) 注册账户
2. 验证发送域名或使用测试域名，获取 API 密钥
3. 记录下：`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`TO_EMAIL`

**关于重要配置项：**
- **RESEND_FROM_EMAIL**：发送邮件的邮箱地址（系统用这个邮箱给你发通知）
  - **推荐**：使用自己的域名邮箱（如 `noreply@yourdomain.com`）
  - **临时选择**：如果没有域名，可以使用 Resend 提供的 `@resend.dev` 邮箱（不推荐长期使用）
- **AUTH_WORKER_URL**：部署后你的 Worker 完整 URL（用于生成登录链接）
  - 部署完成后获取，格式如：`https://school-checkin.your-subdomain.workers.dev`

### 🚀 快速部署步骤

### ⚡ 快速开始（推荐）

#### 第1步：配置 wrangler.toml

```bash
# 创建 KV Namespace（新语法）
bunx wrangler kv namespace create "TOKEN_KV"
bunx wrangler kv namespace create "TOKEN_KV" --preview # （可选，用于预览环境）

# 复制返回的 ID，更新 wrangler.toml
```

**复制模板文件：**
```bash
cp wrangler.toml.template wrangler.toml
```

编辑 `wrangler.toml`，更新 KV ID：
```toml
[[kv_namespaces]]
binding = "TOKEN_KV"
id = "你的生产环境KV_ID"          # 替换为上面获取的ID
preview_id = "你的预览环境KV_ID"   # 替换为上面获取的ID （可选）
```

#### 第2步：设置环境变量

**方式1：在 wrangler.toml 中设置所有变量（适合本地开发）**

```toml
[vars]
# 非敏感变量
USER_NAME = "你的名字"
THREAD_ID = "123456"
AUTH_WORKER_URL = "https://your-worker.your-subdomain.workers.dev"

# 敏感变量（生产环境建议使用 secrets）
RESEND_FROM_EMAIL = "noreply@yourdomain.com"
RESEND_API_KEY = "re_xxxxxxxxxxxx"
TO_EMAIL = "接收通知的邮箱@example.com"
JWT_SECRET = "一个很长的随机字符串"
```

**方式2：混合方式（推荐生产环境）**

- 非敏感变量在 `wrangler.toml` 中设置：
```toml
[vars]
USER_NAME = "你的名字"
THREAD_ID = "123456"
```

- 敏感变量使用 Wrangler CLI 设置：
```bash
wrangler secret put RESEND_FROM_EMAIL
wrangler secret put RESEND_API_KEY
wrangler secret put TO_EMAIL
wrangler secret put JWT_SECRET
```

#### 第3步：部署

```bash
# 构建并部署（推荐）
bun run deploy

# 或者分步执行
bun run build        # 构建模板
bun run build-templates  # 仅构建模板
bunx wrangler deploy      # 部署到生产环境

# 本地开发测试
bun run dev         # 自动构建模板并启动开发服务器
```

### 🔧 开发环境搭建

#### 1. 模板系统
项目使用模板系统，HTML 模板与 TypeScript 代码分离：

```bash
# 开发时工作流
1. 编辑 templates/ 目录下的 HTML 文件
2. 运行 bun run build-templates 自动同步
3. 或使用 bun run dev 自动构建并启动开发服务器
```

#### 2. 项目结构说明

```
templates/               # 🎨 HTML 模板目录（开发时编辑）
├── qr-login.html      # 微信扫码登录页面
├── error.html         # 错误页面
├── success.html       # 登录成功页面
└── index.html         # 系统主页

lib/                    # 🔧 核心库目录
├── template-handler.ts # ⚡ 模板处理器（自动生成）
├── auth-utils.ts      # 认证工具
├── checkin-utils.ts   # 签到核心逻辑
├── wechat-utils.ts    # 微信API工具
├── email-utils.ts     # 邮件发送工具
└── storage.ts         # KV存储封装

scripts/                # 🛠️ 构建脚本
└── build-templates.js # 模板构建脚本
```

#### 第4步：验证部署并完善配置

1. 访问 `https://school-checkin.your-subdomain.workers.dev/` 查看系统状态
2. **重要**：将实际的 Worker URL 添加到环境变量中：
   - 在 Cloudflare Dashboard 中添加 `AUTH_WORKER_URL`
   - 值为你的完整 Worker 地址（如：`https://school-checkin.your-subdomain.workers.dev`）
3. 重新部署以确保配置生效：`bunx wrangler deploy`

### 🔧 调试命令

```bash
# 查看实时日志
bunx wrangler tail

# 手动触发签到测试
curl -X POST https://your-worker.workers.dev/trigger-checkin

# 检查 KV 数据（新语法）
bunx wrangler kv key list --namespace-id="TOKEN_KV"
bunx wrangler kv key get "wechat_token" --namespace-id="TOKEN_KV"

# 或者使用绑定名称（如果已配置）
bunx wrangler kv key list --binding="TOKEN_KV"
bunx wrangler kv key get "wechat_token" --binding="TOKEN_KV"
```

---

## 📁 项目结构

```
workers/
├── checkin-scheduler.ts      # 主调度器 - 统一 Worker 入口
├── polling-service.ts        # 轮询服务 - 处理登录轮询
├── auth-service.ts           # 认证服务 - 处理一次性链接和二维码
├── types.ts                  # 类型定义
├── wrangler.toml            # Cloudflare 配置
├── lib/                     # 工具库
│   ├── checkin-utils.ts     # 签到核心逻辑
│   ├── wechat-utils.ts      # 微信API工具
│   ├── email-utils.ts       # 邮件发送工具
│   ├── auth-utils.ts        # 认证工具
│   └── storage.ts           # KV存储封装
└── README.md               # 项目文档
```

## 🛠️ API 接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/` | 系统状态页面 |
| GET | `/auth/{token}` | 处理一次性认证链接，显示微信二维码 |
| GET | `/login-status?pollingId={id}` | 查询登录状态 (AJAX 轮询) |
| GET | `/login-success` | 登录成功页面 |
| POST | `/trigger-checkin` | 手动触发签到 |

## 📄 许可证

MIT License

---

**注意**: 这是一个自动化签到工具，请确保使用符合目标系统的使用条款和相关法律法规。