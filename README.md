# Luau Guard

一个面向 Roblox/Luau 开发者的在线代码混淆工作台。前端部署在 GitHub Pages，Node.js API 单独部署；GitHub Pages 本身不运行后端。

## API 文档

- [HTTP API 使用说明](docs/API.md)：基址、请求/响应、等级、错误码、限流和隐私边界。
- [OpenAPI 3.1 规范](docs/openapi.yaml)：供客户端、API 工具和文档生成器使用。
- 部署后网页也提供 `/api-docs.html` 与 `/openapi.yaml`。

## 本地运行

```sh
pnpm install --frozen-lockfile
pnpm start
```

默认访问 `http://localhost:3000`。页面与 API 同源运行，无需配置跨域。

## 测试

```sh
pnpm test
```

## 部署

- 前端：`.github/workflows/pages.yml`。在仓库 Settings → Pages 选择 GitHub Actions 后，推送到 `main` 会发布 `frontend/` 和 OpenAPI 文件。
- 后端：根目录 `Dockerfile` 可部署到 Manus WebDev 容器；容器暴露 3000，健康检查 `GET /api/health`。
- 后端发布成功后，将发布结果中的后端 HTTPS 基址配置为仓库 Actions variable `LUAUGUARD_API_URL`，重新运行 Pages workflow。

混淆器只扫描和变换源代码，不会执行或保存用户提交的脚本。局部变量重命名采用保守词法分析，并不替代完整 Luau 编译器/静态分析器，也不承诺抗反编译。
