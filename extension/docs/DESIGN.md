# FlowPilot — 产品设计文档

## 项目概述

FlowPilot 是一个浏览器自动化插件，让用户能够在任意网页上构建和运行自动化操作流程，解放重复性的手工操作。

---

## 三种自动化模式

### 模式一：内置适配器（Built-in Adapter）

由开发者针对特定网站预先编写的固定流程，稳定可靠，无需用户配置。

- **BOSS直聘**：批量浏览候选人简历、批量发送沟通邀请
- 后续版本按需扩展其他网站

实现方式：开发者直接编写 `FlowStep[]` 数组，交由 SemanticRunner 执行。

---

### 模式二：可视化流程构建器（Visual Flow Builder）

用户无需写代码，通过点选网页元素 + 配置动作来搭建自动化流程。

**交互流程：**
1. 进入「构建模式」，页面注入悬浮侧边栏（挂载在 Shadow DOM，与网页样式隔离）
2. 鼠标悬停时高亮目标元素（ElementPicker）
3. 点击目标元素，弹出动作配置面板
4. 选择动作类型，配置参数
5. 步骤加入流程列表，可拖拽排序、编辑、删除
6. 保存流程，之后一键运行

**支持的原子动作：**

| 动作类型 | 说明 |
|----------|------|
| `click` | 点击元素 |
| `input` | 输入文字，支持变量插值 `{{varName}}` |
| `select` | 下拉框选择 |
| `wait_appear` | 等待元素出现（处理异步加载）|
| `wait_disappear` | 等待元素消失（等待 loading 结束）|
| `scroll_to` | 滚动到元素位置 |
| `navigate` | 跳转到指定 URL |
| `loop_items` | 对列表中每个子元素循环执行子流程 |
| `condition` | 条件判断（元素存在/文字匹配则执行子流程）|
| `delay` | 固定等待时间 |

---

### 模式三：操作录制（Recorder）

录制用户操作，之后回放。提供两种方式，用户根据场景选择：

**语义录制（推荐）**
- 记录「操作了哪个元素」，自动生成 `FlowStep[]`
- 通过多策略选择器匹配元素（aria-label → 文字内容 → role → CSS 选择器）
- 页面小幅改版后通常仍可用

**像素级录制**
- 完全复刻鼠标 x/y 坐标轨迹 + 键盘按键序列，生成 `PixelEvent[]`
- 适用于 Canvas、WebGL 等无法识别 DOM 元素的特殊页面
- 通过 `chrome.debugger` API 注入底层输入事件回放
- 脆弱（依赖屏幕分辨率和页面布局），仅在语义录制无法使用时选择

---

## 本地凭证库（Credential Vault）

**原则：网站账号密码永远只存在用户本地设备，不上传任何服务器。**

- 按网站（域名）管理账号密码，支持同一网站多组账号
- 主密码保护，主密码**仅存内存**（不落盘，浏览器关闭即清空）
- 使用 WebCrypto API 加密：PBKDF2 派生密钥 + AES-GCM 加密
- 数据存储在 `chrome.storage.local`（密文）
- 支持导出为加密的 `.vault` 文件（主密码保护），便于跨设备迁移
- 支持从 `.vault` 文件导入，合并到本地库
- 流程运行时，自动从凭证库取出对应域名的账号密码，填入登录表单

---

## 流程市场（Flow Marketplace）— 后期规划

- 用户发布自建流程（FlowStep[] JSON，不含任何凭证）
- 支持公开发布和团队内私有共享
- 一键安装他人发布的流程
- 评分、搜索、分类浏览
- **需要独立后端服务支撑（不在本插件项目范围内）**

---

## 系统架构

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vite | 5.x | 构建工具 |
| Vue 3 | 3.5.x | UI 框架（Composition API）|
| TypeScript | 5.x | 类型系统 |
| Pinia | 2.x | 状态管理 |
| SCSS | - | 样式方案 |

### 各层职责

| 层 | 目录 | 职责 |
|----|------|------|
| Popup | `src/popup/` | 流程选择、变量填写、启动/暂停/停止、实时日志 |
| Options | `src/options/` | 凭证库管理、流程管理、全局设置 |
| Background | `src/background/` | Service Worker；任务调度、状态持久化 |
| Content Script | `src/content/` | 执行引擎、录制器、ElementPicker，实际操作页面 |
| Shared | `src/shared/` | 类型定义、加密工具、storage 封装 |

### 通信架构

```
Popup / Options
      ↕  chrome.runtime.sendMessage
Background（任务调度）
      ↕  chrome.tabs.sendMessage
Content Script（执行引擎，操作页面 DOM）
```

### 执行引擎

三种模式共用同一调度入口，执行器分开：

- **SemanticRunner**：操作 DOM 元素，内置 Adapter 和 Flow Builder 共用
- **PixelRunner**：通过 `chrome.debugger` API 注入底层鼠标/键盘事件

---

## 安全设计

- 网站凭证本地 AES-GCM 加密，主密码不落盘
- `chrome.debugger` 权限仅在像素录制/回放期间持有，用完立即释放
- 操作间随机延迟（可配置范围），模拟人工节奏，降低风控触发概率
- 导出的 `.vault` 文件使用主密码加密，明文泄露无法读取
