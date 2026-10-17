import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/api/attachment'
import type { UploadItem } from './useUploads'

/** Drop files here or click to pick; shows the upload queue with progress. */
export function FileDropzone({
  onFiles,
  uploads,
  compact,
  hint,
}: {
  onFiles: (files: File[]) => void
  uploads: UploadItem[]
  compact?: boolean
  hint?: string
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files])
        }}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground',
          compact ? 'px-3 py-2' : 'px-3 py-4',
          over && 'border-primary bg-primary/5 text-foreground',
        )}
      >
        <Paperclip size={14} className="shrink-0" />
        <span>
          {hint ?? t('Перетащите файлы сюда или нажмите, чтобы выбрать')}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files])
          e.target.value = ''
        }}
      />
      {uploads.map((u) => (
        <div
          key={u.key}
          className="rounded-md border border-border px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{u.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {Math.round(u.progress * 100)}% · {formatBytes(u.size)}
            </span>
          </div>
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(u.progress * 100)}
            aria-label={t('Загрузка «{{name}}»', { name: u.name })}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${u.progress * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
