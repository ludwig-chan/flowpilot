import React, { useCallback, useEffect, useRef, useState } from 'react'

interface LightboxImage {
  src: string
  alt: string
}

interface ImageLightboxProps {
  image: LightboxImage | null
  loading?: boolean
  index?: number
  total?: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}

interface Point {
  x: number
  y: number
}

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_STEP = 1.12

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export default function ImageLightbox({
  image,
  loading = false,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: ImageLightboxProps): React.JSX.Element | null {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<Point>({ x: 0, y: 0 })
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 })

  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setDragging(false)
  }, [])

  useEffect(() => {
    resetView()
  }, [image?.src, resetView])

  useEffect(() => {
    if (!image) return

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        resetView()
        return
      }
      if (event.key === 'ArrowLeft' && onPrev && !loading) {
        event.preventDefault()
        onPrev()
        return
      }
      if (event.key === 'ArrowRight' && onNext && !loading) {
        event.preventDefault()
        onNext()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [image, loading, onClose, onNext, onPrev, resetView])

  useEffect(() => {
    if (!dragging) return

    const onMouseMove = (event: MouseEvent): void => {
      setOffset({
        x: dragOffsetRef.current.x + event.clientX - dragStartRef.current.x,
        y: dragOffsetRef.current.y + event.clientY - dragStartRef.current.y,
      })
    }

    const onMouseUp = (): void => {
      setDragging(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging])

  if (!image) return null

  const handleWheel = (event: React.WheelEvent): void => {
    event.preventDefault()
    event.stopPropagation()

    setScale((current) => {
      const next = clampScale(current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
      if (next <= 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLImageElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    if (scale <= 1 || loading) return

    dragStartRef.current = { x: event.clientX, y: event.clientY }
    dragOffsetRef.current = offset
    setDragging(true)
  }

  const handleDoubleClick = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()

    if (scale === 1) {
      setScale(2)
    } else {
      resetView()
    }
  }

  const handlePrev = (event: React.MouseEvent): void => {
    event.stopPropagation()
    onPrev?.()
  }

  const handleNext = (event: React.MouseEvent): void => {
    event.stopPropagation()
    onNext?.()
  }

  const showCounter = typeof index === 'number' && typeof total === 'number'

  return (
    <div className="image-lightbox" onClick={onClose} onWheel={handleWheel}>
      <button className="image-lightbox-close" onClick={onClose} title="关闭">
        ×
      </button>

      {showCounter && (
        <span className="image-lightbox-counter">
          {index + 1} / {total}
        </span>
      )}

      <span className="image-lightbox-zoom">{Math.round(scale * 100)}%</span>

      {onPrev && (
        <button
          className="image-lightbox-arrow image-lightbox-arrow-left"
          onClick={handlePrev}
          disabled={loading}
          title="上一张 (←)"
        >
          ◀
        </button>
      )}

      {loading ? (
        <div className="image-lightbox-loading">加载中...</div>
      ) : (
        <img
          className="image-lightbox-image"
          src={image.src}
          alt={image.alt}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          }}
        />
      )}

      {onNext && (
        <button
          className="image-lightbox-arrow image-lightbox-arrow-right"
          onClick={handleNext}
          disabled={loading}
          title="下一张 (→)"
        >
          ▶
        </button>
      )}
    </div>
  )
}
