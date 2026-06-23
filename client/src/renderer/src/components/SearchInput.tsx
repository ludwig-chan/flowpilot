import React, { useState, useEffect } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export default function SearchInput({
  value,
  onChange,
  placeholder = '搜索...',
  debounceMs = 300,
}: SearchInputProps): React.JSX.Element {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [localValue, debounceMs, value, onChange])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setLocalValue(e.target.value)
  }

  const handleClear = (): void => {
    setLocalValue('')
    onChange('')
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
      <input
        className="form-input"
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        style={{ paddingLeft: 32, paddingRight: localValue ? 28 : 12 }}
      />
      <span
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 14,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      >
        🔍
      </span>
      {localValue && (
        <span
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </span>
      )}
    </div>
  )
}
