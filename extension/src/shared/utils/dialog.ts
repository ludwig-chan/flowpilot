import { reactive } from 'vue'

interface DialogOptions {
  type:    'alert' | 'confirm'
  title:   string
  message: string
  resolve: (val: boolean) => void
}

export const _dialogState = reactive<{
  visible: boolean
  options: DialogOptions | null
}>({
  visible: false,
  options: null,
})

function _open(options: Omit<DialogOptions, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => {
    _dialogState.options = { ...options, resolve }
    _dialogState.visible = true
  })
}

/** 信息提示，只有"确定"按钮 */
export function showAlert(message: string, title = '提示'): Promise<void> {
  return _open({ type: 'alert', title, message }).then(() => undefined)
}

/** 确认对话框，返回用户选择：true=确定，false=取消 */
export function showConfirm(message: string, title = '提示'): Promise<boolean> {
  return _open({ type: 'confirm', title, message })
}
