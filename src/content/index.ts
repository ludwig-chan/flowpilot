import { initFloatingWidget } from './widget/FloatingWidget'
import { initOptionsBridge } from './OptionsBridge'

console.log('[FlowPilot] content script 已加载，当前域名：', location.hostname)

initFloatingWidget()
initOptionsBridge()
