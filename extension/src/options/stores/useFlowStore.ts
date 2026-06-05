/**
 * useFlowStore.ts
 * 流程列表的 Pinia store，直接与 chrome.storage.local 同步
 * 支持嵌套分组（文件夹）结构
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FlowStep, StepDelayLevel, FlowTrigger } from '@shared/types/flow'
import { genId } from '@shared/utils/genId'
import { BUILTIN_PRESETS } from '@/presets/index'

export interface LocalFlow {
  id:               string
  kind:             'flow'
  name:             string
  steps:            FlowStep[]
  stepDelayLevel?:  StepDelayLevel        // 步骤间隔档位
  stepDelayRange?:  [number, number]      // 自定义范围（仅 custom 时有效）
  waitTimeout?:     number                // 等待元素出现的默认超时 ms（默认 10000）
  pinnedInMenu?:    boolean               // 是否钉选到悬浮按钮菜单
  trigger?:         FlowTrigger           // 自动触发配置
  targetTabId?:     number                // 上次运行绑定的目标 Tab ID
  builtin?:         boolean               // 内置预设标记（只读）
}

export interface FlowFolder {
  id:       string
  kind:     'folder'
  name:     string
  children: FlowNode[]
  builtin?: boolean                       // 内置预设标记（只读）
}

export type FlowNode = LocalFlow | FlowFolder

// ── 递归工具函数 ──────────────────────────────────────────────────
export function findNode(nodes: FlowNode[], id: string): FlowNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.kind === 'folder') {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

export function findParentList(nodes: FlowNode[], id: string): FlowNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return nodes
    if (n.kind === 'folder') {
      const found = findParentList(n.children, id)
      if (found) return found
    }
  }
  return null
}

export interface ExportPayload {
  version:    1
  exportedAt: string
  nodes:      FlowNode[]
}

/** 按 ID 集合递归过滤树，保留选中节点及其子节点结构 */
export function filterNodesByIds(nodes: FlowNode[], ids: Set<string>): FlowNode[] {
  const result: FlowNode[] = []
  for (const n of nodes) {
    if (!ids.has(n.id)) continue
    if (n.kind === 'folder') {
      result.push({
        ...n,
        children: filterNodesByIds((n as FlowFolder).children, ids),
      } as FlowFolder)
    } else {
      result.push(JSON.parse(JSON.stringify(n)) as LocalFlow)
    }
  }
  return result
}

function cloneWithNewIds(nodes: FlowNode[]): FlowNode[] {
  return nodes.map(n => {
    if (n.kind === 'folder') {
      return {
        id: genId('fd'), kind: 'folder', name: n.name,
        children: cloneWithNewIds((n as FlowFolder).children),
      } as FlowFolder
    }
    return {
      id: genId('bf'), kind: 'flow', name: (n as LocalFlow).name,
      steps: JSON.parse(JSON.stringify((n as LocalFlow).steps)),
    } as LocalFlow
  })
}

// 迁移旧格式：{ id, name, steps } → { id, kind:'flow', name, steps }
function migrate(raw: unknown[]): FlowNode[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>).map(item => {
    if (item.kind === 'folder') {
      return {
        id: item.id, kind: 'folder', name: item.name,
        children: migrate((item.children as unknown[]) ?? []),
      } as FlowFolder
    }
    return { kind: 'flow', id: item.id, name: item.name, steps: item.steps ?? [], pinnedInMenu: (item.pinnedInMenu as boolean | undefined) } as LocalFlow
  })
}

export const useFlowStore = defineStore('flows', () => {
  const tree    = ref<FlowNode[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    const data = await chrome.storage.local.get({ builtFlows: [] })
    const raw = data.builtFlows
    tree.value = migrate(Array.isArray(raw) ? raw : [])
    loading.value = false
  }

  async function persist() {
    await chrome.storage.local.set({ builtFlows: JSON.parse(JSON.stringify(tree.value)) })
  }

  function getContainer(parentId?: string): FlowNode[] {
    if (!parentId) return tree.value
    const parent = findNode(tree.value, parentId)
    if (parent?.kind === 'folder') return parent.children
    return tree.value
  }

  async function saveFlow(name: string, steps: FlowStep[], parentId?: string): Promise<string> {
    const id = genId('bf')
    getContainer(parentId).push({ id, kind: 'flow', name, steps })
    await persist()
    return id
  }

  async function saveFolder(name: string, parentId?: string): Promise<string> {
    const id = genId('fd')
    getContainer(parentId).push({ id, kind: 'folder', name, children: [] })
    await persist()
    return id
  }

  async function update(id: string, patch: Partial<Omit<LocalFlow, 'id' | 'kind'>>) {
    const node = findNode(tree.value, id)
    if (!node) return
    Object.assign(node, patch)
    await persist()
  }

  async function togglePin(id: string) {
    const node = findNode(tree.value, id)
    if (!node || node.kind !== 'flow') return
    ;(node as LocalFlow).pinnedInMenu = !(node as LocalFlow).pinnedInMenu
    await persist()
  }

  async function remove(id: string) {
    const parent = findParentList(tree.value, id)
    if (!parent) return
    const idx = parent.findIndex(n => n.id === id)
    if (idx >= 0) parent.splice(idx, 1)
    await persist()
  }

  /** 将节点移动到新的父级（newParentId 为 undefined 表示移至根目录） */
  async function moveNode(nodeId: string, newParentId?: string) {
    if (nodeId === newParentId) return
    const node = findNode(tree.value, nodeId)
    if (!node) return
    // 防止将分组移入自身的子孙
    if (node.kind === 'folder' && newParentId && findNode(node.children, newParentId)) return
    const parent = findParentList(tree.value, nodeId)
    if (!parent) return
    const idx = parent.findIndex(n => n.id === nodeId)
    if (idx < 0) return
    parent.splice(idx, 1)
    getContainer(newParentId).push(node)
    await persist()
  }

  /** 返回给定节点所在的父分组 id（根目录返回 undefined） */
  function getParentFolderId(nodeId: string): string | undefined {
    if (tree.value.some(n => n.id === nodeId)) return undefined
    function walk(nodes: FlowNode[]): string | undefined {
      for (const n of nodes) {
        if (n.kind !== 'folder') continue
        if (n.children.some(c => c.id === nodeId)) return n.id
        const r = walk(n.children)
        if (r !== undefined) return r
      }
    }
    return walk(tree.value)
  }

  function allFlows(): LocalFlow[] {
    const result: LocalFlow[] = []
    function walk(nodes: FlowNode[]) {
      for (const n of nodes) {
        if (n.kind === 'flow') result.push(n)
        else walk(n.children)
      }
    }
    walk(tree.value)
    return result
  }

  /** 返回所有分组（带层级路径标签，用于下拉选择） */
  function allFolders(): Array<{ id: string; label: string }> {
    const result: Array<{ id: string; label: string }> = []
    function walk(nodes: FlowNode[], prefix: string) {
      for (const n of nodes) {
        if (n.kind === 'folder') {
          const label = prefix ? `${prefix} / ${n.name}` : n.name
          result.push({ id: n.id, label })
          walk(n.children, label)
        }
      }
    }
    walk(tree.value, '')
    return result
  }

  function exportNode(id: string): ExportPayload | null {
    const node = findNode(tree.value, id)
    if (!node) return null
    return { version: 1, exportedAt: new Date().toISOString(), nodes: [JSON.parse(JSON.stringify(node))] }
  }

  async function importInto(payload: ExportPayload, parentId?: string): Promise<number> {
    const cloned = cloneWithNewIds(payload.nodes)
    getContainer(parentId).push(...cloned)
    await persist()
    return cloned.length
  }

  function exportSelected(ids: Set<string>): ExportPayload {
    return {
      version:    1,
      exportedAt: new Date().toISOString(),
      nodes:      filterNodesByIds(tree.value, ids),
    }
  }

  async function renameNode(id: string, newName: string): Promise<void> {
    const node = findNode(tree.value, id)
    if (!node || !newName.trim()) return
    node.name = newName.trim()
    await persist()
  }

  /** 含有失效 call_flow 引用的流程 ID 集合（响应式） */
  const brokenFlowIds = computed<Set<string>>(() => {
    const validIds = new Set(allFlows().map(f => f.id))
    function hasAnyBrokenRef(steps: FlowStep[]): boolean {
      return steps.some(s =>
        (s.type === 'call_flow' && !!s.flowRef && !validIds.has(s.flowRef)) ||
        hasAnyBrokenRef(s.children ?? []) ||
        hasAnyBrokenRef(s.elseChildren ?? [])
      )
    }
    const broken = new Set<string>()
    for (const f of allFlows()) {
      if (hasAnyBrokenRef(f.steps)) broken.add(f.id)
    }
    return broken
  })

  // ── 内置预设合并显示 ──────────────────────────────────────────────
  /** 递归标记节点树为 builtin */
  function markBuiltin(nodes: FlowNode[]): FlowNode[] {
    return nodes.map(n => {
      if (n.kind === 'folder') {
        return { ...n, builtin: true, children: markBuiltin(n.children) } as FlowFolder
      }
      return { ...n, builtin: true } as LocalFlow
    })
  }

  /** 合并用户流程 + 内置预设的展示树 */
  const displayTree = computed<FlowNode[]>(() => {
    const presetNodes: FlowNode[] = BUILTIN_PRESETS.flatMap(p =>
      markBuiltin(JSON.parse(JSON.stringify(p.payload.nodes)) as FlowNode[])
    )
    return [...tree.value, ...presetNodes]
  })

  /** 将内置预设节点 fork 到用户区（深拷贝 + 新 ID），返回新节点 */
  async function forkPresetNode(presetId: string): Promise<FlowNode | null> {
    const presetNode = findNode(displayTree.value, presetId)
    if (!presetNode || !presetNode.builtin) return null

    const cloned = cloneWithNewIds([presetNode])[0]
    tree.value.push(cloned)
    await persist()
    return cloned
  }

  return { tree, loading, load, saveFlow, saveFolder, update, remove, togglePin, moveNode, getParentFolderId, allFlows, allFolders, exportNode, exportSelected, importInto, renameNode, brokenFlowIds, displayTree, forkPresetNode }
})

