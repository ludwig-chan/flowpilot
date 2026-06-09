const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 返回本地时间的 `yyyy-MM-dd HH:mm:ss` 格式字符串。
 * 替代 `new Date().toISOString()`，避免 UTC 时间造成混淆。
 */
export function toLocalTimeString(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
