import React, { useState } from 'react'

interface KeywordTagInputProps {
  keywords: string[]
  onChange: (keywords: string[]) => void
  placeholder?: string
  variant?: 'blue' | 'red'
}

export default function KeywordTagInput({
  keywords,
  onChange,
  placeholder = '输入关键字，回车添加',
  variant = 'blue',
}: KeywordTagInputProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const value = inputValue.trim()
      if (value && !keywords.includes(value)) {
        onChange([...keywords, value])
        setInputValue('')
      }
    }
  }

  const handleRemove = (keyword: string): void => {
    onChange(keywords.filter((k) => k !== keyword))
  }

  const tagStyle = variant === 'blue'
    ? { background: '#f0f3ff', color: 'var(--primary)', borderColor: '#c9d3ff' }
    : { background: '#fdecea', color: 'var(--danger)', borderColor: '#f5c6cb' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {keywords.map((keyword) => (
          <span
            key={keyword}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              border: '1px solid',
              ...tagStyle,
            }}
          >
            {keyword}
            <span
              onClick={() => handleRemove(keyword)}
              style={{ cursor: 'pointer', fontSize: 10, opacity: 0.7, marginLeft: 2 }}
            >
              ×
            </span>
          </span>
        ))}
      </div>
      <input
        className="form-input"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ fontSize: 13 }}
      />
    </div>
  )
}
