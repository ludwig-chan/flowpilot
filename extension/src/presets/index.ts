/**
 * src/presets/index.ts
 *
 * 内置预设流程库 —— 自动扫描目录版。
 *
 * 使用方式：
 *  1. 在 Options 页面制作好流程
 *  2. 点击流程旁的"导出"按钮，下载 .flowpilot 文件
 *  3. 将文件重命名为 .json，放入 src/presets/flows/ 目录
 *  4. 重新打包，预设自动打进扩展 —— 无需改任何代码
 *
 * 文件命名约定：
 *  - 文件名（不含 .json）会作为预设 id
 *  - 直接放原始导出内容即可（{ "version": 1, "exportedAt": "...", "nodes": [...] }）
 *  - 也可以在文件里加 name / description / tags 字段进行自定义：
 *      {
 *        "name": "我的预设",
 *        "description": "用途说明",
 *        "tags": ["登录", "自动化"],
 *        "version": 1,
 *        "exportedAt": "...",
 *        "nodes": [...]
 *      }
 */

import type { FlowNode } from '@/options/stores/useFlowStore'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface PresetPayload {
  version:    1
  exportedAt: string
  nodes:      FlowNode[]
}

export interface BuiltinPreset {
  id:          string
  name:        string
  description: string
  tags?:       string[]
  payload:     PresetPayload
}

/** 文件里可以混入这些可选元字段 */
interface FileMeta {
  name?:        string
  description?: string
  tags?:        string[]
}

// ── 自动扫描 src/presets/flows/*.json ─────────────────────────────────────────
// Vite 在打包时会把目录下所有 .json 文件一起打进去，无需手动注册。

const modules = import.meta.glob<Record<string, unknown>>(
  './flows/*.json',
  { eager: true, import: 'default' },
)

function normalize(path: string, data: Record<string, unknown>): BuiltinPreset {
  const id = path.replace(/^\.\/flows\//, '').replace(/\.json$/, '')

  // 判断 payload：兼容"直接导出格式"和"加了 meta 字段的格式"
  const payload: PresetPayload = {
    version:    1,
    exportedAt: (data.exportedAt as string) ?? '',
    nodes:      (data.nodes as FlowNode[]) ?? [],
  }

  const meta = data as FileMeta

  // 如果文件有 nodes，取第一个节点名作为 fallback 显示名
  const firstNodeName = (payload.nodes?.[0] as { name?: string } | undefined)?.name ?? ''

  return {
    id,
    name:        meta.name        ?? (firstNodeName || id),
    description: meta.description ?? '',
    tags:        meta.tags,
    payload,
  }
}

export const BUILTIN_PRESETS: BuiltinPreset[] = Object.entries(modules).map(
  ([path, data]) => normalize(path, data as Record<string, unknown>),
)
