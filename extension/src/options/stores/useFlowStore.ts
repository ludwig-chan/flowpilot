/**
 * useFlowStore.ts
 * 流程列表的 Pinia store，直接与 chrome.storage.local 同步
 * 支持嵌套分组（文件夹）结构
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FlowStep, StepDelayLevel, FlowTrigger } from '@shared/types/flow'
import { genId } from '@shared/utils/genId'
import { toLocalTimeString } from '@shared/utils/time'
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
  customized?:      boolean               // 内置预设已保存本地覆盖
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

/** 按 ID 集合递归过滤树，保留选中节点及命中子节点的父级路径 */
export function filterNodesByIds(nodes: FlowNode[], ids: Set<string>): FlowNode[] {
  const result: FlowNode[] = []
  for (const n of nodes) {
    if (n.kind === 'folder') {
      const children = filterNodesByIds((n as FlowFolder).children, ids)
      if (!ids.has(n.id) && children.length === 0) continue
      result.push({
        ...n,
        children,
      } as FlowFolder)
    } else {
      if (!ids.has(n.id)) continue
      result.push(JSON.parse(JSON.stringify(n)) as LocalFlow)
    }
  }
  return result
}

/** 递归剥离 builtin/customized/targetTabId 等内部标记，使导出数据干净可导入 */
function stripBuiltinMarkers(nodes: FlowNode[]): FlowNode[] {
  return nodes.map(n => {
    if (n.kind === 'folder') {
      return {
        id: n.id, kind: 'folder', name: n.name,
        children: stripBuiltinMarkers(n.children),
      } as FlowFolder
    }
    const flow = n as LocalFlow
    return {
      id:             flow.id,
      kind:           'flow',
      name:           flow.name,
      steps:          flow.steps,
      stepDelayLevel: flow.stepDelayLevel,
      stepDelayRange: flow.stepDelayRange,
      waitTimeout:    flow.waitTimeout,
      pinnedInMenu:   flow.pinnedInMenu,
      trigger:        flow.trigger,
    } as LocalFlow
  })
}

function collectFlowRefs(steps: FlowStep[], refs: Set<string>) {
  for (const step of steps) {
    if (step.type === 'call_flow' && step.flowRef) refs.add(step.flowRef)
    collectFlowRefs(step.children ?? [], refs)
    collectFlowRefs(step.elseChildren ?? [], refs)
    if (step.itemAction) collectFlowRefs([step.itemAction], refs)
    collectFlowRefs(step.itemActions ?? [], refs)
  }
}

function rewriteFlowRefs(steps: FlowStep[], idMap: Map<string, string>) {
  for (const step of steps) {
    if (step.flowRef && idMap.has(step.flowRef)) step.flowRef = idMap.get(step.flowRef)
    rewriteFlowRefs(step.children ?? [], idMap)
    rewriteFlowRefs(step.elseChildren ?? [], idMap)
    if (step.itemAction) rewriteFlowRefs([step.itemAction], idMap)
    rewriteFlowRefs(step.itemActions ?? [], idMap)
  }
}

function cloneWithNewIds(nodes: FlowNode[], idMap = new Map<string, string>()): FlowNode[] {
  return nodes.map(n => {
    if (n.kind === 'folder') {
      return {
        id: genId('fd'), kind: 'folder', name: n.name,
        children: cloneWithNewIds((n as FlowFolder).children, idMap),
      } as FlowFolder
    }
    const id = genId('bf')
    idMap.set(n.id, id)
    return {
      id, kind: 'flow', name: (n as LocalFlow).name,
      steps: JSON.parse(JSON.stringify((n as LocalFlow).steps)),
    } as LocalFlow
  })
}

function rewriteFlowRefsInNodes(nodes: FlowNode[], idMap: Map<string, string>) {
  for (const node of nodes) {
    if (node.kind === 'folder') rewriteFlowRefsInNodes(node.children, idMap)
    else rewriteFlowRefs(node.steps, idMap)
  }
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
    return {
      kind: 'flow',
      id: item.id,
      name: item.name,
      steps: item.steps ?? [],
      pinnedInMenu: item.pinnedInMenu as boolean | undefined,
    } as LocalFlow
  })
}

function migrateBuiltinPresetOverrides(raw: unknown): Record<string, LocalFlow> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, LocalFlow> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    result[id] = {
      kind:           'flow',
      id,
      name:           typeof item.name === 'string' ? item.name : '',
      steps:          Array.isArray(item.steps) ? item.steps as FlowStep[] : [],
      stepDelayLevel: item.stepDelayLevel as StepDelayLevel | undefined,
      stepDelayRange: Array.isArray(item.stepDelayRange) ? item.stepDelayRange as [number, number] : undefined,
      waitTimeout:    typeof item.waitTimeout === 'number' ? item.waitTimeout : undefined,
      pinnedInMenu:   item.pinnedInMenu as boolean | undefined,
      trigger:        item.trigger as FlowTrigger | undefined,
    }
  }
  return result
}

function extractLegacyPresetCopies(nodes: FlowNode[], raw: unknown[], overrides: Record<string, LocalFlow>): FlowNode[] {
  return nodes.flatMap((node, index): FlowNode[] => {
    const rawItem = Array.isArray(raw) ? raw[index] as Record<string, unknown> | undefined : undefined
    if (node.kind === 'folder') {
      const rawChildren = Array.isArray(rawItem?.children) ? rawItem.children as unknown[] : []
      return [{ ...node, children: extractLegacyPresetCopies(node.children, rawChildren, overrides) }]
    }

    const sourcePresetId = typeof rawItem?.sourcePresetId === 'string' ? rawItem.sourcePresetId : ''
    if (!sourcePresetId) return [node]
    overrides[sourcePresetId] = {
      ...node,
      id: sourcePresetId,
      kind: 'flow',
    }
    return []
  })
}

export const useFlowStore = defineStore('flows', () => {
  const tree    = ref<FlowNode[]>([])
  const loading = ref(false)
  const builtinPresetPinOverrides = ref<Record<string, boolean>>({})
  const builtinPresetOverrides = ref<Record<string, LocalFlow>>({})

  async function load() {
    loading.value = true
    const data = await chrome.storage.local.get({ builtFlows: [], builtinPresetPinOverrides: {}, builtinPresetOverrides: {} })
    const raw = data.builtFlows
    const rawFlows = Array.isArray(raw) ? raw : []
    const migratedOverrides = migrateBuiltinPresetOverrides(data.builtinPresetOverrides)
    tree.value = extractLegacyPresetCopies(migrate(rawFlows), rawFlows, migratedOverrides)
    builtinPresetPinOverrides.value = typeof data.builtinPresetPinOverrides === 'object' && data.builtinPresetPinOverrides
      ? data.builtinPresetPinOverrides as Record<string, boolean>
      : {}
    builtinPresetOverrides.value = migratedOverrides
    if (JSON.stringify(rawFlows) !== JSON.stringify(tree.value)) {
      await persist()
      await persistBuiltinPresetOverrides()
    }
    loading.value = false
  }

  async function persist() {
    await chrome.storage.local.set({ builtFlows: JSON.parse(JSON.stringify(tree.value)) })
  }

  async function persistBuiltinPresetPinOverrides() {
    await chrome.storage.local.set({
      builtinPresetPinOverrides: JSON.parse(JSON.stringify(builtinPresetPinOverrides.value)),
    })
  }

  async function persistBuiltinPresetOverrides() {
    await chrome.storage.local.set({
      builtinPresetOverrides: JSON.parse(JSON.stringify(builtinPresetOverrides.value)),
    })
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
    if (node?.kind === 'flow') {
      ;(node as LocalFlow).pinnedInMenu = !(node as LocalFlow).pinnedInMenu
      await persist()
      return
    }

    const presetNode = findNode(displayTree.value, id)
    if (!presetNode?.builtin || presetNode.kind !== 'flow') return
    builtinPresetPinOverrides.value[id] = !(presetNode as LocalFlow).pinnedInMenu
    await persistBuiltinPresetPinOverrides()
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
    walk(displayTree.value)
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
    const node = findNode(displayTree.value, id)
    if (!node) return null
    return { version: 1, exportedAt: toLocalTimeString(), nodes: stripBuiltinMarkers([JSON.parse(JSON.stringify(node))]) }
  }

  async function importInto(payload: ExportPayload, parentId?: string): Promise<number> {
    const idMap = new Map<string, string>()
    const cloned = cloneWithNewIds(payload.nodes, idMap)
    rewriteFlowRefsInNodes(cloned, idMap)
    getContainer(parentId).push(...cloned)
    await persist()
    return cloned.length
  }

  function expandIdsWithReferencedFlows(ids: Set<string>): Set<string> {
    const expanded = new Set(ids)
    const queue = [...ids]

    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) continue
      const node = findNode(displayTree.value, id)
      if (!node || node.kind !== 'flow') continue

      const refs = new Set<string>()
      collectFlowRefs(node.steps, refs)
      for (const refId of refs) {
        if (expanded.has(refId) || !findNode(displayTree.value, refId)) continue
        expanded.add(refId)
        queue.push(refId)
      }
    }

    return expanded
  }

  function exportSelected(ids: Set<string>): ExportPayload {
    const expandedIds = expandIdsWithReferencedFlows(ids)
    return {
      version:    1,
      exportedAt: toLocalTimeString(),
      nodes:      stripBuiltinMarkers(filterNodesByIds(displayTree.value, expandedIds)),
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
        hasAnyBrokenRef(s.elseChildren ?? []) ||
        (!!s.itemAction && hasAnyBrokenRef([s.itemAction])) ||
        hasAnyBrokenRef(s.itemActions ?? [])
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
      const override = builtinPresetPinOverrides.value[n.id]
      const presetOverride = builtinPresetOverrides.value[n.id]
      return {
        ...n,
        ...(presetOverride ? JSON.parse(JSON.stringify(presetOverride)) : {}),
        id: n.id,
        kind: 'flow',
        builtin: true,
        customized: !!presetOverride,
        pinnedInMenu: override ?? presetOverride?.pinnedInMenu ?? (n as LocalFlow).pinnedInMenu,
      } as LocalFlow
    })
  }

  /** 合并用户流程 + 内置预设的展示树 */
  const displayTree = computed<FlowNode[]>(() => {
    const presetNodes: FlowNode[] = BUILTIN_PRESETS.flatMap(p =>
      markBuiltin(JSON.parse(JSON.stringify(p.payload.nodes)) as FlowNode[])
    )
    return [...tree.value, ...presetNodes]
  })

  async function saveBuiltinPresetOverride(flow: LocalFlow): Promise<LocalFlow | null> {
    const presetNode = findNode(displayTree.value, flow.id)
    if (!presetNode || presetNode.kind !== 'flow' || !presetNode.builtin) return null

    builtinPresetOverrides.value[flow.id] = {
      id:             flow.id,
      kind:           'flow',
      name:           flow.name,
      steps:          JSON.parse(JSON.stringify(flow.steps)),
      stepDelayLevel: flow.stepDelayLevel,
      stepDelayRange: flow.stepDelayRange,
      waitTimeout:    flow.waitTimeout,
      pinnedInMenu:   flow.pinnedInMenu,
      trigger:        flow.trigger,
    }
    await persistBuiltinPresetOverrides()
    const updated = findNode(displayTree.value, flow.id)
    return updated?.kind === 'flow' ? JSON.parse(JSON.stringify(updated)) as LocalFlow : null
  }

  async function resetBuiltinPresetOverride(id: string): Promise<LocalFlow | null> {
    if (!builtinPresetOverrides.value[id]) return null
    delete builtinPresetOverrides.value[id]
    await persistBuiltinPresetOverrides()
    const resetFlow = findNode(displayTree.value, id)
    return resetFlow?.kind === 'flow' ? JSON.parse(JSON.stringify(resetFlow)) as LocalFlow : null
  }

  return { tree, loading, load, saveFlow, saveFolder, update, remove, togglePin, moveNode, getParentFolderId, allFlows, allFolders, exportNode, exportSelected, importInto, renameNode, brokenFlowIds, displayTree, saveBuiltinPresetOverride, resetBuiltinPresetOverride }
})

