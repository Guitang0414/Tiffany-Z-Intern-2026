# API 接口规范 (API Specification)

> 本文档为 [HL-Intern-Project.md](../HL-Intern-Project.md) 的配套 API 文档，详细描述每个接口的请求/响应格式。
>
> Base URL: `https://api.example.com/api/v1`

---

## 1. 通用约定

### 1.1 认证方式

| 调用方 | 认证方式 | Header |
| :--- | :--- | :--- |
| OpenClaw Agent | API Key | `X-Agent-Key: <key>` |
| 前端编辑 | JWT Bearer Token | `Authorization: Bearer <token>` |

### 1.2 通用响应格式

**成功响应：**
```json
{
  "code": 200,
  "data": { ... },
  "message": "ok"
}
```

**错误响应：**
```json
{
  "code": 422,
  "detail": [
    {
      "field": "source_url",
      "message": "This field is required"
    }
  ]
}
```

### 1.3 通用错误码

| HTTP Status | 含义 | 常见场景 |
| :--- | :--- | :--- |
| 400 | Bad Request | 请求参数不合法 |
| 401 | Unauthorized | 未认证或 token 过期 |
| 403 | Forbidden | 权限不足（如 editor 调用 admin 接口） |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 重复的 source_url |
| 422 | Unprocessable Entity | 请求体校验失败 |
| 429 | Too Many Requests | 触发速率限制 |
| 500 | Internal Server Error | 服务端异常 |

### 1.4 分页约定

所有列表接口支持分页：

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | int | 1 | 当前页码 |
| `page_size` | int | 20 | 每页数量，最大 100 |

分页响应：
```json
{
  "code": 200,
  "data": {
    "items": [...],
    "total": 156,
    "page": 1,
    "page_size": 20,
    "total_pages": 8
  }
}
```

---

## 2. 认证接口 (Auth)

### 2.1 POST `/auth/login`

编辑登录，获取 JWT token。

**Request Body:**
```json
{
  "username": "editor01",
  "password": "********"
}
```

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "editor01",
      "display_name": "Alice",
      "role": "editor"
    }
  }
}
```

**Response 401:**
```json
{
  "code": 401,
  "detail": "Invalid username or password"
}
```

### 2.2 POST `/auth/refresh`

刷新 access token。

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 1800
  }
}
```

---

## 3. Webhook 接口 (Agent → Backend)

### 3.1 POST `/webhook/incoming-news`

Agent 完成抓取和改写后，推送新闻数据入库。

**Headers:**
```
X-Agent-Key: sk-agent-xxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "source_url": "https://techcrunch.com/2026/02/23/example-article",
  "source_title": "Original Title From Source",
  "source_content": "The original article content extracted by the agent...",
  "source_site": "TechCrunch",
  "ai_title": "AI 改写后的标题：科技巨头发布重磅更新",
  "ai_content": "AI 改写后的正文内容...",
  "ai_summary": "一句话摘要，用于 Twitter 发布（≤280 字符）"
}
```

**字段校验规则：**

| 字段 | 必填 | 校验规则 |
| :--- | :--- | :--- |
| `source_url` | 是 | 合法 URL，≤ 2048 字符 |
| `source_title` | 否 | ≤ 500 字符 |
| `source_content` | 否 | 无长度限制 |
| `source_site` | 否 | ≤ 100 字符 |
| `ai_title` | 是 | ≤ 500 字符 |
| `ai_content` | 是 | 不可为空 |
| `ai_summary` | 否 | ≤ 280 字符 |

**Response 201 Created:**
```json
{
  "code": 201,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "PENDING",
    "created_at": "2026-02-23T10:30:00Z"
  },
  "message": "News article created successfully"
}
```

**Response 409 Conflict（重复 URL）：**
```json
{
  "code": 409,
  "detail": "Article with this source_url already exists",
  "existing_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Response 401 Unauthorized（API Key 无效）：**
```json
{
  "code": 401,
  "detail": "Invalid or missing API key"
}
```

**Response 429 Too Many Requests：**
```json
{
  "code": 429,
  "detail": "Rate limit exceeded. Maximum 10 requests per minute.",
  "retry_after": 45
}
```

---

## 4. 新闻管理接口 (News CRUD)

### 4.1 GET `/news`

获取新闻列表，支持按状态筛选和分页。

**Query Parameters:**

| 参数 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `status` | string | 否 | 按状态筛选：`PENDING`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `REJECTED` |
| `source_site` | string | 否 | 按来源站点筛选 |
| `page` | int | 否 | 页码，默认 1 |
| `page_size` | int | 否 | 每页数量，默认 20 |

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "source_url": "https://techcrunch.com/...",
        "source_site": "TechCrunch",
        "ai_title": "AI 改写后的标题",
        "status": "PENDING",
        "created_at": "2026-02-23T10:30:00Z",
        "updated_at": "2026-02-23T10:30:00Z"
      }
    ],
    "total": 42,
    "page": 1,
    "page_size": 20,
    "total_pages": 3
  }
}
```

> 注：列表接口不返回 `source_content` 和 `ai_content`（正文太长），请通过详情接口获取。

### 4.2 GET `/news/{id}`

获取单条新闻完整详情，包含原文对照。

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "source_url": "https://techcrunch.com/...",
    "source_title": "Original Title",
    "source_content": "Original article content...",
    "source_site": "TechCrunch",
    "ai_title": "AI 改写后的标题",
    "ai_content": "AI 改写后的正文...",
    "ai_summary": "一句话摘要",
    "status": "PENDING",
    "rejection_reason": null,
    "reviewed_by": null,
    "published_at": null,
    "wp_post_id": null,
    "tweet_id": null,
    "created_at": "2026-02-23T10:30:00Z",
    "updated_at": "2026-02-23T10:30:00Z"
  }
}
```

### 4.3 PUT `/news/{id}`

编辑保存修改后的文本。仅在 `status=PENDING` 时允许修改。

**Request Body:**
```json
{
  "ai_title": "编辑修改后的标题",
  "ai_content": "编辑修改后的正文内容...",
  "ai_summary": "编辑修改后的摘要"
}
```

> 所有字段均为可选，只更新传入的字段。

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "ai_title": "编辑修改后的标题",
    "status": "PENDING",
    "updated_at": "2026-02-23T11:00:00Z"
  },
  "message": "Article updated successfully"
}
```

**Response 409（状态不允许修改）：**
```json
{
  "code": 409,
  "detail": "Cannot edit article in PUBLISHED status"
}
```

### 4.4 POST `/news/{id}/publish`

审批通过，触发分发至 WordPress 和 Twitter。

**Request Body:** 无（空 body）

**前置条件：** `status` 必须为 `PENDING`

**处理流程：**
1. 校验文章状态为 PENDING
2. 将状态更新为 `PUBLISHING`，记录 `reviewed_by`
3. 异步触发 WordPress 发布
4. 异步触发 Twitter 发布
5. 全部成功 → `PUBLISHED`；任一失败 → `FAILED`

**Response 202 Accepted:**
```json
{
  "code": 202,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "PUBLISHING"
  },
  "message": "Publishing started"
}
```

### 4.5 POST `/news/{id}/reject`

驳回文章。

**Request Body:**
```json
{
  "reason": "标题不够吸引人，内容偏离原文重点"
}
```

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "REJECTED",
    "rejection_reason": "标题不够吸引人，内容偏离原文重点"
  },
  "message": "Article rejected"
}
```

### 4.6 POST `/news/{id}/retry`

重试失败的分发。**仅 admin 角色可调用。**

**前置条件：** `status` 必须为 `FAILED`

**Response 202 Accepted:**
```json
{
  "code": 202,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "PUBLISHING"
  },
  "message": "Retry started"
}
```

---

## 5. 统计接口 (Stats)

### 5.1 GET `/stats/overview`

获取系统概览统计数据。**仅 admin 角色可调用。**

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "total_articles": 156,
    "by_status": {
      "PENDING": 12,
      "PUBLISHING": 1,
      "PUBLISHED": 130,
      "FAILED": 3,
      "REJECTED": 10
    },
    "today": {
      "incoming": 8,
      "published": 5,
      "rejected": 1
    }
  }
}
```

---

## 6. 健康检查

### 6.1 GET `/health`

系统健康检查，无需认证。

**Response 200:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2026-02-23T10:30:00Z"
}
```

---

## 7. Agent 重试策略

当 Agent 调用 Webhook 接口遇到错误时，应按以下策略重试：

| HTTP Status | 是否重试 | 策略 |
| :--- | :--- | :--- |
| 201 | 否 | 成功 |
| 409 | 否 | 重复数据，跳过 |
| 401 | 否 | API Key 无效，需人工介入 |
| 422 | 否 | 数据格式错误，记录日志 |
| 429 | 是 | 等待 `retry_after` 秒后重试 |
| 500 | 是 | 指数退避：1s → 2s → 4s，最多重试 3 次 |
| 502/503 | 是 | 同 500 |
