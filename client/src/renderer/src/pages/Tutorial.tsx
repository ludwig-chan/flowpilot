import React, { useState, useEffect } from 'react'
import step1Img from '../assets/tutorial/step1.png'
import step2Img from '../assets/tutorial/step2.png'
import step3_1Img from '../assets/tutorial/step3-1.png'
import step4Img from '../assets/tutorial/step4.png'

interface TutorialProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

interface BrowserOption {
  name: string
  url: string
}

const BROWSER_OPTIONS: BrowserOption[] = [
  { name: 'Google Chrome', url: 'chrome://extensions' },
  { name: 'Microsoft Edge', url: 'edge://extensions' },
  { name: 'Firefox', url: 'about:addons' },
  { name: '360 安全浏览器', url: 'se://extensions' },
  { name: '360 极速浏览器', url: 'chrome://extensions' },
  { name: 'QQ 浏览器', url: 'qqbrowser://extensions/manage' },
  { name: '搜狗浏览器', url: 'chrome://extensions' },
  { name: '2345 加速浏览器', url: 'chrome://extensions' },
  { name: '猎豹浏览器', url: 'chrome://extensions' },
  { name: '其他 Chromium 内核浏览器', url: 'chrome://extensions' }
]

const STEP_LABELS = ['第一步', '第二步', '第三步', '第四步']

export default function Tutorial({ showToast }: TutorialProps): React.JSX.Element {
  const [extensionDir, setExtensionDir] = useState('')
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserOption>(BROWSER_OPTIONS[0])
  const [currentStep, setCurrentStep] = useState(0)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)

  useEffect(() => {
    window.api.getConfig().then((cfg) => setExtensionDir(cfg.extensionDir))
  }, [])

  const copyPath = async (): Promise<void> => {
    if (!extensionDir) return
    await navigator.clipboard.writeText(extensionDir)
    showToast('路径已复制到剪贴板', 'success')
  }

  const copyExtUrl = async (): Promise<void> => {
    await navigator.clipboard.writeText(selectedBrowser.url)
    showToast('地址已复制到剪贴板', 'success')
  }

  const steps = [
    {
      title: '打开浏览器扩展管理页',
      image: step1Img,
      imageAlt: '打开浏览器扩展管理页',
      content: (
        <>
          <p>选择您使用的浏览器，将地址复制后粘贴到浏览器地址栏并回车：</p>
          <div className="tut-browser-row">
            <select
              value={selectedBrowser.name}
              onChange={(e) => {
                const found = BROWSER_OPTIONS.find((b) => b.name === e.target.value)
                if (found) setSelectedBrowser(found)
              }}
              className="form-input"
            >
              {BROWSER_OPTIONS.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            <span className="path-text">{selectedBrowser.url}</span>
            <button onClick={copyExtUrl} className="btn btn-sm btn-secondary">复制地址</button>
          </div>
        </>
      )
    },
    {
      title: '开启开发者模式',
      image: step2Img,
      imageAlt: '开启开发者模式',
      content: (
        <p>
          在扩展管理页面<strong>右上角</strong>找到"开发者模式"开关，将其打开（蓝色代表已开启）。
        </p>
      )
    },
    {
      title: '加载已解压的扩展程序',
      image: step3_1Img,
      imageAlt: '加载已解压的扩展程序',
      content: (
        <>
          <p>开发者模式开启后，左上角会出现"<strong>加载已解压的扩展程序</strong>"按钮，点击它。</p>
          <p>在弹出的文件夹选择框中，选择以下路径：</p>
          <div className="path-row tut-path-row">
            <span className="path-hint">
              {extensionDir || '（插件路径未配置）'}
            </span>
            {extensionDir && (
              <button onClick={copyPath} className="btn btn-sm btn-secondary">复制路径</button>
            )}
          </div>
        </>
      )
    },
    {
      title: '确认安装成功',
      image: step4Img,
      imageAlt: '确认安装成功',
      content: (
        <p>插件卡片出现在扩展列表中，浏览器右上角出现 FlowPilot 图标，即表示安装成功。</p>
      )
    }
  ]

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  return (
    <div>
      <h1 className="page-title">安装教程</h1>

      <div className="card tut-wizard">
        {/* 步骤指示器 */}
        <div className="tut-tabs">
          {STEP_LABELS.map((label, i) => (
            <button
              key={i}
              className={`tut-tab${i === currentStep ? ' active' : ''}`}
              onClick={() => setCurrentStep(i)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 步骤标题 */}
        <div className="tut-step-title">{step.title}</div>

        {/* 步骤说明 */}
        <div className="tut-step-desc">{step.content}</div>

        {/* 图片区：点击可放大 */}
        <div className="tut-img-wrap" onClick={() => setLightboxImg(step.image)}>
          <img src={step.image} alt={step.imageAlt} />
        </div>

        {/* 下一步 / 重新查看 */}
        {isLast ? (
          <button className="tut-next-btn" onClick={() => setCurrentStep(0)}>
            重新查看
          </button>
        ) : (
          <button className="tut-next-btn" onClick={() => setCurrentStep((s) => s + 1)}>
            下一步
          </button>
        )}
      </div>
      {lightboxImg && (
        <div className="tut-lightbox" onClick={() => setLightboxImg(null)}>
          <button
            className="tut-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxImg(null) }}
          >✕</button>
          <img
            src={lightboxImg}
            alt="放大预览"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
