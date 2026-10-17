import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageUp, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/api/media'
import { cn } from '@/lib/utils'

// Square crop for avatars and workspace logos (Ф3 3.F1, 3.F2). The picked image
// is panned and zoomed inside a square frame and re-encoded on a canvas to a
// 512×512 WebP (PNG where the browser cannot encode WebP), so the upload is
// always a small square picture, well under the backend's 2 MB limit.

const VIEW = 256 // frame size, CSS px
const OUTPUT = 512 // saved image size, px
const MAX_ZOOM = 4
// The source photo may be larger than the upload limit — it is re-encoded anyway.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

interface Crop {
  zoom: number
  x: number // image top-left relative to the frame, CSS px
  y: number
}

interface ImageCropDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** `circle` previews an avatar; `square` a logo (which may also keep margins). */
  shape: 'circle' | 'square'
  /** Upload the cropped image; the dialog closes when it resolves. */
  onSave: (file: File) => Promise<void>
}

export function ImageCropDialog({
  open,
  onOpenChange,
  title,
  shape,
  onSave,
}: ImageCropDialogProps) {
  const { t } = useTranslation()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(
    null,
  )

  // A logo may be zoomed out until the whole picture fits (transparent margins);
  // an avatar always fills the circle.
  const fit = shape === 'square' ? 'contain' : 'cover'

  // Release the object URL of the previous image.
  useEffect(
    () => () => {
      if (img) URL.revokeObjectURL(img.src)
    },
    [img],
  )

  function baseScale(image: HTMLImageElement) {
    const sx = VIEW / image.naturalWidth
    const sy = VIEW / image.naturalHeight
    return fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
  }

  function clamp(image: HTMLImageElement, c: Crop): Crop {
    const s = baseScale(image) * c.zoom
    const w = image.naturalWidth * s
    const h = image.naturalHeight * s
    const cx = Math.min(
      Math.max(c.x, Math.min(0, VIEW - w)),
      Math.max(0, VIEW - w),
    )
    const cy = Math.min(
      Math.max(c.y, Math.min(0, VIEW - h)),
      Math.max(0, VIEW - h),
    )
    return { zoom: c.zoom, x: cx, y: cy }
  }

  function centered(image: HTMLImageElement, zoom: number): Crop {
    const s = baseScale(image) * zoom
    return {
      zoom,
      x: (VIEW - image.naturalWidth * s) / 2,
      y: (VIEW - image.naturalHeight * s) / 2,
    }
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error(t('Подходят изображения PNG, JPEG или WebP'))
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(t('Файл слишком большой — до 20 МБ'))
      return
    }
    const image = new Image()
    image.onload = () => {
      setImg(image)
      setCrop(centered(image, 1))
    }
    image.onerror = () => {
      URL.revokeObjectURL(image.src)
      toast.error(t('Не удалось открыть изображение'))
    }
    image.src = URL.createObjectURL(file)
  }

  // Zoom around the frame centre so the visible middle stays put.
  function zoomTo(next: number) {
    if (!img) return
    const zoom = Math.min(Math.max(next, 1), MAX_ZOOM)
    const s0 = baseScale(img) * crop.zoom
    const s1 = baseScale(img) * zoom
    const cx = (VIEW / 2 - crop.x) / s0
    const cy = (VIEW / 2 - crop.y) / s0
    setCrop(clamp(img, { zoom, x: VIEW / 2 - cx * s1, y: VIEW / 2 - cy * s1 }))
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!img || !d) return
    setCrop(
      clamp(img, {
        zoom: crop.zoom,
        x: d.x + e.clientX - d.px,
        y: d.y + e.clientY - d.py,
      }),
    )
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!img) return
    const step = e.shiftKey ? 20 : 5
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      setCrop(
        clamp(img, { zoom: crop.zoom, x: crop.x + m[0], y: crop.y + m[1] }),
      )
    } else if (e.key === '+' || e.key === '=') zoomTo(crop.zoom + 0.1)
    else if (e.key === '-') zoomTo(crop.zoom - 0.1)
  }

  async function render(): Promise<File> {
    if (!img) throw new Error('no image')
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')!
    const k = OUTPUT / VIEW
    const s = baseScale(img) * crop.zoom
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      img,
      crop.x * k,
      crop.y * k,
      img.naturalWidth * s * k,
      img.naturalHeight * s * k,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    )
    if (!blob) throw new Error('encode failed')
    // Browsers without a WebP encoder fall back to PNG.
    const type = IMAGE_TYPES.includes(blob.type) ? blob.type : 'image/png'
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('too large')
    return new File(
      [blob],
      type === 'image/webp' ? 'image.webp' : 'image.png',
      { type },
    )
  }

  async function save() {
    let file: File
    try {
      file = await render()
    } catch {
      toast.error(t('Не удалось обработать изображение'))
      return
    }
    setBusy(true)
    try {
      await onSave(file)
      close()
    } catch {
      // onSave reports its own API error; keep the dialog open for a retry.
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setImg(null)
    setCrop({ zoom: 1, x: 0, y: 0 })
    onOpenChange(false)
  }

  const s = img ? baseScale(img) * crop.zoom : 1

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {img
              ? t('Перетащите изображение и настройте масштаб.')
              : t(
                  'PNG, JPEG или WebP. Изображение будет обрезано до квадрата.',
                )}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {img ? (
          <div className="flex flex-col items-center gap-4">
            <div
              role="img"
              aria-label={t(
                'Область обрезки: стрелки — сдвиг, плюс и минус — масштаб',
              )}
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onWheel={(e) => zoomTo(crop.zoom - e.deltaY * 0.002)}
              onKeyDown={onKeyDown}
              style={{ width: VIEW, height: VIEW }}
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-md bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: crop.x,
                  top: crop.y,
                  width: img.naturalWidth * s,
                  height: img.naturalHeight * s,
                  maxWidth: 'none',
                }}
              />
              {/* Dim everything outside the saved shape. */}
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/60',
                  shape === 'circle' &&
                    'rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]',
                )}
              />
            </div>

            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                aria-label={t('Уменьшить')}
                onClick={() => zoomTo(crop.zoom - 0.25)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={crop.zoom}
                aria-label={t('Масштаб')}
                onChange={(e) => zoomTo(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <button
                type="button"
                aria-label={t('Увеличить')}
                onClick={() => zoomTo(crop.zoom + 0.25)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pickFile(e.dataTransfer.files[0])
            }}
            className="mx-auto flex aspect-square w-64 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <ImageUp size={28} />
            {t('Выберите файл или перетащите его сюда')}
          </button>
        )}

        <DialogFooter className="sm:justify-between">
          {img ? (
            <Button
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {t('Другой файл')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              {t('Отмена')}
            </Button>
            <Button onClick={save} disabled={!img || busy}>
              {busy ? t('Сохраняем…') : t('Сохранить')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
