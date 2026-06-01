/** 计算 pickedCss 相对于 itemSel（列表项选择器）的相对路径 */
export function computeRelativeSelector(pickedCss: string, itemSel: string): string {
  const strip = (s: string) => s.replace(/:nth-child\(\d+\)/g, '').replace(/:nth-of-type\(\d+\)/g, '')
  const pickedSegs = pickedCss.split(/\s*>\s*/)
  const itemSegs   = itemSel.split(/\s*>\s*/)
  let i = 0
  while (i < itemSegs.length && i < pickedSegs.length) {
    if (strip(pickedSegs[i]) !== strip(itemSegs[i])) break
    i++
  }
  return pickedSegs.slice(i).join(' > ')
}
