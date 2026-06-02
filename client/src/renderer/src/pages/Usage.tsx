import React from 'react'

export default function Usage(): React.JSX.Element {
  return (
    <div>
      <h1 className="page-title">使用教程</h1>

      {/* 1. 概览 */}
      <div className="card">
        <div className="card-title">📌 概览</div>
        <p className="card-desc">
          在此填写 FlowPilot 的功能简介，帮助用户快速了解本工具能做什么。
        </p>
      </div>

      {/* 2. 创建流程 */}
      <div className="card">
        <div className="card-title">🛠️ 创建流程</div>
        <div className="step-list">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">步骤标题</div>
              <p>在此填写步骤说明。</p>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">步骤标题</div>
              <p>在此填写步骤说明。</p>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <div className="step-title">步骤标题</div>
              <p>在此填写步骤说明。</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 运行流程 */}
      <div className="card">
        <div className="card-title">▶️ 运行流程</div>
        <div className="step-list">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">步骤标题</div>
              <p>在此填写步骤说明。</p>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">步骤标题</div>
              <p>在此填写步骤说明。</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. 技巧与注意事项 */}
      <div className="card">
        <div className="card-title">💡 技巧与注意事项</div>
        <div className="step-list">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">注意事项标题</div>
              <p>在此填写说明。</p>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">注意事项标题</div>
              <p>在此填写说明。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
