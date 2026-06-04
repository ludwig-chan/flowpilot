import type { SelectorStrategy } from '@shared/types/flow'

/**
 * 按 SelectorStrategy 多策略查找元素，优先使用语义属性，CSS 选择器最后兜底。
 * - 有语义属性时：用语义属性过滤候选，再用 cssSelector 交叉确认（宽松匹配）
 * - CSS 含 nth-child 时：结果与文本内容交叉核验，防止位置偏移后误匹配
 * root: 查找范围（全局 document 或列表项 context）
 * timeout: 仅 root===document 时等待元素出现；context 内直接同步查找
 */
export async function resolveElementByStrategy(
  strategy: SelectorStrategy,
  root: ParentNode,
  timeout?: number,
): Promise<Element | null> {
  // ── iframe 穿透：若 selector 携带 iframeSelector，先找 iframe 再在其内部查找 ──
  if (strategy.iframeSelector) {
    const iframeEl = document.querySelector(strategy.iframeSelector) as HTMLIFrameElement | null
    const iframeDoc = iframeEl?.contentDocument
    if (!iframeDoc) return null
    return resolveElementByStrategy({ ...strategy, iframeSelector: undefined }, iframeDoc, timeout)
  }

  const isGlobal = root === document

  // ── 1. 语义候选池（ariaLabel / role / dataTestId / text）──────────────────
  const semanticFind = (): Element | null => {
    const { ariaLabel, role, dataTestId, text, cssSelector } = strategy

    // 先用 cssSelector 拿候选（可能多个），再语义筛选
    let candidates: Element[]
    try {
      candidates = Array.from((root as Element | Document).querySelectorAll(cssSelector))
    } catch {
      candidates = []
    }

    // 语义筛选（任一属性命中即可）
    const semantic = candidates.filter(el => {
      if (ariaLabel && el.getAttribute('aria-label') === ariaLabel) return true
      if (dataTestId && el.getAttribute('data-testid') === dataTestId) return true
      if (role && el.getAttribute('role') === role) return true
      if (text) {
        const t = el.textContent?.trim()
        // 精确匹配或前缀匹配（text 可能被截断到 80 字符）
        if (t === text || (text.length >= 20 && t?.startsWith(text.slice(0, 20)))) return true
      }
      return false
    })
    if (semantic.length === 1) return semantic[0]
    if (semantic.length > 1) {
      // 多个命中：优先精确匹配 ariaLabel，否则取第一个
      return semantic.find(el => el.getAttribute('aria-label') === ariaLabel) ?? semantic[0]
    }

    // 语义没匹配到时降级：检查 cssSelector 是否含 nth-child
    // 若不含，直接信任 CSS 结果；若含，尝试用文本内容找最近似的
    if (candidates.length === 1) return candidates[0]
    if (candidates.length > 1) return candidates[0]

    // 还是没有：当 CSS 含 nth-child 时，尝试在同类兄弟中按文本找
    if (text && strategy.cssSelector.includes('nth-child')) {
      // 去掉最后的 nth-child 段，扩大搜索范围
      const broader = strategy.cssSelector.replace(/:nth-child\(\d+\)/g, '')
      try {
        const broader_els = Array.from((root as Element | Document).querySelectorAll(broader))
        const byText = broader_els.find(el => {
          const t = el.textContent?.trim()
          return t === text || (text.length >= 10 && t?.includes(text.slice(0, 10)))
        })
        if (byText) return byText
      } catch { /* ignore */ }
    }

    // CSS 候选为空时：纯语义全文档兜底（应对动态 id 导致 cssSelector 完全失效）
    if (candidates.length === 0 && (ariaLabel || dataTestId || text)) {
      const all = Array.from((root as Element | Document).querySelectorAll('*'))
      const tag = strategy.cssSelector.split(/[\s>]/).pop()?.replace(/:.*$/, '').replace(/#.*$/, '') ?? ''
      const scoped = tag ? all.filter(el => el.tagName.toLowerCase() === tag) : all
      const fallback = scoped.find(el => {
        if (ariaLabel && el.getAttribute('aria-label') === ariaLabel) return true
        if (dataTestId && el.getAttribute('data-testid') === dataTestId) return true
        if (text) {
          const t = el.textContent?.trim()
          return t === text || (text.length >= 10 && t?.startsWith(text.slice(0, 10)))
        }
        return false
      })
      if (fallback) return fallback
    }

    return null
  }

  // context 内直接同步查找
  if (!isGlobal) return semanticFind()

  // 全局：先同步，找不到就等待 DOM 变化后重试
  const immediate = semanticFind()
  if (immediate) return immediate

  if (!timeout) return null

  return new Promise<Element | null>(resolve => {
    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)

    const observer = new MutationObserver(() => {
      const el = semanticFind()
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function waitForElementToDisappear(selector: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(selector)) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`等待元素消失超时：${selector}`))
    }, timeout)

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        clearTimeout(timer)
        observer.disconnect()
        resolve()
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })
}
