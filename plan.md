# Luau Guard 项目计划

## 目标与架构
基于 `jidanfan9-pixel/obfuscate-beta` 建设可实际调用的 Luau 混淆器。静态前端由 GitHub Pages 托管；不把 GitHub Pages 描述成后端。无依赖 Node.js API 单独部署在 Manus WebDev 容器中；API 源码也保存在本仓库，前端通过 GitHub Actions 仓库变量 `LUAUGUARD_API_URL` 连接发布 API。后端只处理请求内代码，不执行、保存或记录用户代码。

## 功能范围
- 中文响应式页面：代码输入、混淆等级选择、调用 API、输出预览、复制和下载 `.luau`。
- 后端提供健康检查和 `POST /api/obfuscate`，限制输入大小、做 CORS 校验与轻量速率限制。
- Luau 词法扫描支持注释、长字符串、转义字符串、反引号字符串、数字和多字符运算符；输出做安全空白压缩。较强级别对可识别的局部变量、函数参数和循环变量执行保守重命名，不运行脚本、不声称等同于 Luau 编译器。
- GitHub Actions 把前端文件发布到 Pages，并将仓库变量注入 API 基址。后端容器独立发布，健康路由为 `/api/health`。

## 技术与结构
- `frontend/`：纯 HTML/CSS/JavaScript 静态应用，GitHub Pages artifact。
- `backend/server.mjs`：Node 原生 HTTP、CORS、限流、输入校验、静态预览与 API。
- `backend/obfuscator.mjs`：Luau tokenizer、紧凑输出和局部符号混淆。
- `backend/test/`：Node 内置测试。
- `Dockerfile`、`package.json`、`pnpm-lock.yaml`：容器入口与可复现的依赖声明（不引入运行时第三方依赖）。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署。
- `public/manus-routes.json`：WebDev Preview 的页面路由清单。

## 设计
- **Design Movement**：开发者工具的终端工作台，结合精密仪表面板与克制的赛博工业风。
- **Core Principles**：代码优先；处理状态可见；高对比但长时间阅读不刺眼；结果与源代码并列。
- **Color Philosophy**：深石墨底色承载代码，青柠色代表已完成的变换，暖琥珀提示状态与限制。
- **Layout Paradigm**：顶部轻量品牌栏，下方左右并排的输入/输出工作区，操作栏跨栏连接两侧；窄屏纵向堆叠。
- **Signature Elements**：带行号感的编辑区边框、青柠色运行指示、明确的字节数与压缩比例。
- **Interaction Philosophy**：一键处理，处理中禁用重复提交；失败保留输入；成功后提供可见复制/下载操作。
- **Animation**：微弱的状态点呼吸、按钮颜色过渡和 150ms 面板淡入；避免影响阅读的持续大幅动画，并尊重减少动态效果设置。
- **Typography System**：界面使用系统无衬线字体，代码区用系统等宽字体；标题紧凑、状态与字节统计采用等宽数字。
- **Brand Essence**：为 Roblox/Luau 开发者提供直接、透明、无需上传留存代码的混淆工作台；**精准、克制、可靠**。
- **Brand Voice**：短句、工程化、坦诚描述能力边界。示例：“把实现收起来，逻辑留在原位。”、“代码仅在本次请求中处理，不会保存。”
- **Wordmark & Logo**：`L>` 字符组合成折叠代码括号标记，旁置 `LUAU / GUARD` 双行字标。
- **Signature Brand Color**：荧光青柠 `#B6F36B`。

## 交付假设
Pages 站点使用 GitHub 仓库名路径。WebDev 发布提供独立后端；部署成功后将其正式 API URL 写入 GitHub Actions 仓库变量并重新运行 Pages 工作流。若 GitHub Pages 启用受仓库/账号设置限制，保留完整 workflow 并报告确切限制。
