import { execFile } from 'child_process'
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/** Windows OCR 可用性缓存 */
let availabilityChecked = false
let isAvailable = false

/**
 * 检测 Windows OCR 是否可用（检查中文语言包是否已安装）。
 * 结果会被缓存，仅首次调用时执行检测。
 */
export async function checkWindowsOcrAvailability(): Promise<boolean> {
  if (availabilityChecked) return isAvailable

  try {
    const result = await runPowerShell(
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
      `Add-Type -AssemblyName 'System.Runtime.WindowsRuntime'; ` +
      `$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]; ` +
      `$langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages; ` +
      `$zh = $langs | Where-Object { $_.LanguageTag -like 'zh*' }; ` +
      `if ($zh) { 'AVAILABLE' } else { 'UNAVAILABLE' }`
    )
    isAvailable = result.trim().includes('AVAILABLE')
    console.log(`[OCR] Windows OCR 可用性: ${isAvailable ? '可用' : '不可用'}`)
  } catch (err) {
    console.warn('[OCR] Windows OCR 检测失败:', (err as Error).message)
    isAvailable = false
  }

  availabilityChecked = true
  return isAvailable
}

/**
 * 获取 Windows OCR 可用性状态（同步，使用缓存结果）。
 * 需先调用 checkWindowsOcrAvailability() 进行初始化。
 */
export function isWindowsOcrAvailable(): boolean {
  return isAvailable
}

/**
 * 使用 Windows OCR 识别图片中的文字。
 * @param imageBuffer 预处理后的 PNG 图片 Buffer
 * @returns 识别出的文本
 */
export async function recognizeWithWindowsOcr(imageBuffer: Buffer): Promise<string> {
  // 将图片保存为临时文件
  const tempDir = join(tmpdir(), 'flowpilot-ocr')
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }
  const tempFile = join(tempDir, `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)

  try {
    writeFileSync(tempFile, imageBuffer)

    // PowerShell 脚本：调用 Windows.Media.Ocr 识别图片
    const psScript = buildPowerShellScript(tempFile)
    const result = await runPowerShell(psScript)

    // 解析 JSON 输出
    const parsed = JSON.parse(result.trim())
    if (parsed.error) {
      throw new Error(parsed.error)
    }
    return (parsed.text || '').trim()
  } finally {
    // 清理临时文件
    try {
      if (existsSync(tempFile)) unlinkSync(tempFile)
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 构建 PowerShell 脚本，调用 Windows.Media.Ocr 识别图片。
 * 优先使用中文引擎，回退到英文引擎。
 */
function buildPowerShellScript(imagePath: string): string {
  // 使用反引号转义路径中的单引号
  const escapedPath = imagePath.replace(/'/g, "''")

  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

try {
  Add-Type -AssemblyName 'System.Runtime.WindowsRuntime'

  # WinRT 互操作辅助函数
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]

  Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }

  # 获取 OCR 引擎（优先中文）
  $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
  $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
  $zhLang = $langs | Where-Object { $_.LanguageTag -like 'zh-Hans*' } | Select-Object -First 1
  if (-not $zhLang) {
    $zhLang = $langs | Where-Object { $_.LanguageTag -like 'zh*' } | Select-Object -First 1
  }

  if ($zhLang) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($zhLang)
  } else {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  }

  if (-not $engine) {
    Write-Output '{"error":"无法创建 OCR 引擎"}'
    exit 0
  }

  # 加载图片
  $storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync('${escapedPath}')) ([Windows.Storage.StorageFile])
  $bitmap = Await ([Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromSurfaceAsync(
    (Await ($storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read))) ([Windows.Storage.Streams.IRandomAccessStream])
  )) ([Windows.Graphics.Imaging.SoftwareBitmap])

  # 识别
  $ocrResult = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  # 输出 JSON 结果
  $text = $ocrResult.Text
  $json = @{ text = $text } | ConvertTo-Json -Compress
  Write-Output $json
} catch {
  $errMsg = $_.Exception.Message -replace '"','\\"'
  Write-Output "{\`"error\`":\`"$errMsg\`"}"
}
`.trim()
}

/**
 * 执行 PowerShell 脚本，返回 stdout。
 */
function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr ? '\n' + stderr : ''
          reject(new Error('PowerShell 执行失败: ' + error.message + detail))
          return
        }
        resolve(stdout)
      }
    )
  })
}
