# Luau Guard HTTP API（v1）

Luau Guard 提供无认证的 JSON API。GitHub Pages 只托管静态前端；API 运行在独立 Node.js 服务上。

## 基址与认证

- 将后端部署成功后，使用发布结果提供的 API 主机名作为 `API_BASE_URL`，不要使用本地 Preview 地址。
- 浏览器站点通过 GitHub Actions 变量 `LUAUGUARD_API_URL` 配置线上 API 基址；变量值是 `https://...`，不要附加 `/api`。
- 本地一体运行时默认基址为 `http://localhost:3000`。
- 目前 API 不需要 API key、Cookie 或 Authorization；不应在请求中发送凭据。
- 请求和响应使用 UTF-8 JSON。浏览器跨域只允许配置的站点来源；默认包含 `https://jidanfan9-pixel.github.io` 与本地开发来源。

## 健康检查

`GET /api/health`（也支持 `HEAD`）无需认证，供发布平台探活。

```sh
curl -i "$API_BASE_URL/api/health"
```

成功返回 `200 OK`：

```json
{"ok":true,"service":"luau-guard-api","version":"1.0.0"}
```

## 混淆源码

`POST /api/obfuscate`

请求头：`Content-Type: application/json`

请求体：

```json
{
  "source": "local count = 3\nprint(count)",
  "level": "standard"
}
```

| 字段 | 必需 | 类型 | 说明 |
| --- | --- | --- | --- |
| `source` | 是 | string | Luau 源码，UTF-8 编码后最多 256 KiB；不能为空。 |
| `level` | 否 | string | `compact`、`standard` 或 `strong`；默认 `standard`。 |

级别行为：

| 级别 | 行为 |
| --- | --- |
| `compact` | 移除注释并压缩空白；保留字符串字面值及必要的换行。 |
| `standard` | 在压缩基础上尝试重命名可识别的局部变量。 |
| `strong` | 进一步尝试重命名函数参数和 `for` 循环变量；会保留被 Luau 反引号插值引用的名字。 |

调用示例：

```sh
export API_BASE_URL="https://<后端域名>"
curl -sS "$API_BASE_URL/api/obfuscate" \
  -H 'Content-Type: application/json' \
  -d '{"source":"local count = 3\nprint(count)","level":"strong"}'
```

成功返回 `200 OK`：

```json
{
  "code": "local __l0=3\nprint(__l0)",
  "stats": {
    "inputBytes": 28,
    "outputBytes": 24,
    "savedPercent": 14,
    "identifiersRenamed": 1,
    "tokens": 8
  }
}
```

`stats.savedPercent` 为输入/输出字节数的四舍五入变化百分比；重命名可能使源码变长，因此该值可以为负数。`tokens` 是本次扫描到的词元数量。

## 错误响应

错误均为 JSON，格式为 `{"error":"可读的错误说明"}`。

| HTTP 状态 | 含义 |
| --- | --- |
| `400 Bad Request` | JSON 无效、缺少字符串字段 `source`，或源码为空。 |
| `403 Forbidden` | 浏览器来源不在服务端允许的 CORS 来源列表中。 |
| `404 Not Found` | API 路由不存在。 |
| `405 Method Not Allowed` | 对混淆接口使用了非 `POST` 方法。响应包含 `Allow: POST, OPTIONS`。 |
| `413 Payload Too Large` | 请求体超过上限，或源码超过 256 KiB。 |
| `422 Unprocessable Content` | 混淆等级不受支持，或遇到未闭合的普通/长字符串等词法错误。 |
| `429 Too Many Requests` | 单个来源 IP 每个服务进程每分钟超过 30 次混淆请求；响应含 `Retry-After: 60`。 |

浏览器跨域预检 `OPTIONS` 成功时返回 `204 No Content`。服务不启用凭据式 CORS；`Access-Control-Allow-Origin` 只回显获准来源。可用 `ALLOWED_ORIGINS`（逗号分隔）配置正式前端来源。

## 数据处理与能力边界

源码只在单次 HTTP 请求的内存处理中使用；应用不会把请求源码写入文件、数据库或应用日志。该工具不会执行 Luau，也不是完整 Luau 解析器、编译器或加密器。局部变量重命名基于保守的词法和作用域识别，不能保证覆盖每种 Luau 语法组合；发布前应在目标 Roblox/Luau 环境检查并运行结果。该工具不作代码保密或反逆向保证。

## 机器可读规范

- 网站文档页：`/api-docs.html`
- OpenAPI 3.1 YAML：`/openapi.yaml`，源文件为 [`openapi.yaml`](openapi.yaml)
