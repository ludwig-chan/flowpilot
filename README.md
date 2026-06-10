# FlowPilot

FlowPilot 是一个面向网页重复操作的自动化工具。它通过浏览器扩展记录、编辑和运行自动化流程，并通过桌面客户端提供本地能力支持。

## 项目组成

- `extension/`：浏览器扩展，负责流程编辑、页面元素选择和流程执行。
- `client/`：桌面客户端，负责本地截图、托盘和辅助自动化能力。
- `web/`：静态发布页和更新信息。
- `server/`：服务端 API 骨架，后续用于团队协作、流程共享等能力。

## 当前能力

- 在网页中创建和运行自动化流程。
- 支持点击、输入、等待、滚动、条件判断、循环等流程步骤。
- 支持桌面客户端配合扩展完成本地辅助能力。
- 服务端当前只提供基础健康检查和状态接口，不保存用户凭证。

## 安全说明

FlowPilot 的账号、密码等网站凭证应只保存在用户本地设备中。服务端骨架不会接收或保存任何网站登录凭证。

## 安装与运行

请先分别安装需要运行模块的依赖。

```bash
npm install
cd extension && npm install
cd ../client && npm install
cd ../server && npm install
```

启动服务端：

```bash
npm run dev:server
```

服务端默认监听：

```text
http://127.0.0.1:8787
```

健康检查：

```text
GET /health
```

服务状态：

```text
GET /api/status
```

## 构建

构建浏览器扩展：

```bash
npm run build:ext
```

构建桌面客户端：

```bash
npm run build:client
```

构建服务端：

```bash
npm run build:server
```

## 后续方向

服务端会优先围绕团队内部流程共享、流程版本管理和协作安装能力扩展。凭证、密码和私密登录信息仍应保持本地存储，不上传到服务端。
