# FlowPilot — 开发路线图

---

## v0.1 — MVP（当前）

**目标：验证核心技术链路，让插件在浏览器中实际运行一个完整流程。**

- [ ] 项目初始化，开发环境搭建（Vite + Vue 3 + TypeScript + SCSS）
- [ ] 多入口构建配置（popup / options / background / content）
- [ ] 共享类型定义（FlowStep、Flow、MessageType 等）
- [ ] Popup ↔ Content Script 消息通信链路验证
- [ ] SemanticRunner 核心实现
  - `waitForElement`：等待异步 DOM 元素出现
  - `humanDelay`：随机延迟，模拟人工操作节奏
  - `executeStep`：执行单个 FlowStep
  - `runFlow`：顺序执行 FlowStep 列表
- [ ] 第一个内置 Adapter：BOSS直聘
  - 扫描候选人列表
  - 逐条点击查看简历
  - 发送沟通邀请
- [ ] Popup 基础 UI：选择流程、运行/停止、实时日志

**交付标准：** 能在 BOSS直聘网页上自动运行一遍完整的邀请流程。

---

## v0.2 — 本地凭证库

- [ ] WebCrypto 工具封装（PBKDF2 派生密钥 + AES-GCM 加密/解密）
- [ ] 主密码设置与解锁流程（内存存储，不落盘）
- [ ] Options 页：凭证管理 UI（按网站增删查）
- [ ] 多账号支持（同一网站保存多组）
- [ ] 导出为加密 `.vault` 文件
- [ ] 从 `.vault` 文件导入，合并到本地库
- [ ] 流程运行时自动读取凭证，填入登录表单

---

## v0.3 — 可视化流程构建器

- [ ] ElementPicker：鼠标悬停高亮 + 点击捕获元素（Shadow DOM 注入，样式隔离）
- [ ] 多策略选择器生成（aria-label / 文字 / role / CSS 选择器，按稳定性排序）
- [ ] 动作配置面板：选择动作类型，配置 value / delay 参数
- [ ] 悬浮侧边栏：步骤列表，支持增删改、拖拽排序
- [ ] 变量系统：`{{varName}}` 插值，运行前弹窗填入
- [ ] `loop_items` 支持：对列表子元素循环执行子流程
- [ ] `condition` 支持：条件分支
- [ ] 流程保存与加载（chrome.storage.local）

---

## v0.4 — 操作录制

- [ ] **语义录制**：监听 click / input 事件，自动生成 FlowStep[]
- [ ] **像素级录制**：记录鼠标轨迹 + 键盘事件（PixelEvent[]）
- [ ] **PixelRunner**：通过 `chrome.debugger` Input 域回放像素事件
- [ ] 录制工具栏：开始/暂停/停止/预览
- [ ] 录制结果编辑（语义录制生成的步骤可在构建器中二次编辑）
- [ ] 回放调试模式：单步执行、速度调节

---

## v0.5 — 流程导入导出（私有分享）

- [ ] 流程导出为 `.flowpilot` 文件（FlowStep[] JSON，含版本号和元数据）
- [ ] 流程从 `.flowpilot` 文件导入，合并到本地库
- [ ] Options 页：流程管理 UI（列表、删除、导入导出入口）
- [ ] 支持批量导出（将多个流程打包为一个文件）

**说明：** 无需后端，零服务器成本。用户通过发送文件的方式在团队内共享流程，覆盖 80% 的私有分享场景。

---

## v1.0 — 私有团队工作区（依赖独立后端）

- [ ] 邀请制私有团队（邀请码 + token，无需完整账号体系）
- [ ] 团队共享流程库：上传、浏览、一键安装
- [ ] 流程版本管理（更新、回滚）
- [ ] 后端选型：Supabase 或 Cloudflare Workers（国内访问友好）
- [ ] 仅存储 FlowStep[] JSON，严禁存储任何凭证数据

**说明：** 定位为私有团队内部工具，不做公开市场，规避内容审核责任。
