import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  Eye,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  deleteAttachment,
  formatBytes,
  isImage,
  isPdf,
  type Attachment,
} from '@/api/attachment'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { shortDate } from '@/lib/dates'
import { FileDropzone } from './FileDropzone'
import { useUploads } from './useUploads'

// «Вложения» in the issue panel (Ф4 4.F5): drag-and-drop upload with progress,
// list with download / preview (images, PDF) / delete. Files handed in with a
// report are marked «Отчёт».

export function AttachmentsSection({
  slug,
  projectId,
  issueId,
  attachments,
  loading,
  currentUserId,
  isAdmin,
  onChanged,
}: {
  slug: string
  projectId: string
  issueId: string
  attachments: Attachment[]
  loading: boolean
  currentUserId?: string
  isAdmin: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { items, upload } = useUploads(slug, projectId, issueId)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [toDelete, setToDelete] = useState<Attachment | null>(null)

  async function addFiles(files: File[]) {
    const done = await upload(files)
    if (done.length) {
      toast.success(
        done.length === 1
          ? t('Файл «{{name}}» прикреплён', { name: done[0]!.file_name })
          : t('Прикреплено файлов: {{n}}', { n: done.length }),
      )
      onChanged()
    }
  }

  async function remove(a: Attachment) {
    try {
      await deleteAttachment(slug, projectId, a.id)
      toast.success(t('Файл удалён'))
      onChanged()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить файл')))
    }
  }

  return (
    <div className="border-b border-border p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('Вложения')}
        {attachments.length > 0 && ` · ${attachments.length}`}
      </p>

      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        attachments.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {attachments.map((a) => {
              const canPreview = !!a.download_url && (isImage(a) || isPdf(a))
              const canDelete = isAdmin || a.uploaded_by_id === currentUserId
              const Icon = isImage(a)
                ? ImageIcon
                : isPdf(a)
                  ? FileText
                  : FileIcon
              return (
                <li
                  key={a.id}
                  className="group flex items-center gap-3 rounded-md border border-border px-2.5 py-2"
                >
                  {isImage(a) && a.download_url ? (
                    <img
                      src={a.download_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Icon size={15} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm">
                      <span className="truncate">{a.file_name}</span>
                      {a.review_id && (
                        <span className="shrink-0 rounded bg-violet-100 px-1.5 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                          {t('Отчёт')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBytes(a.file_size)} · {shortName(a.uploaded_by)} ·{' '}
                      {shortDate(a.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    {canPreview && (
                      <IconButton
                        label={t('Просмотр')}
                        onClick={() => setPreview(a)}
                      >
                        <Eye size={14} />
                      </IconButton>
                    )}
                    {a.download_url && (
                      <a
                        href={a.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('Скачать')}
                        title={t('Скачать')}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Download size={14} />
                      </a>
                    )}
                    {canDelete && (
                      <IconButton
                        label={t('Удалить')}
                        danger
                        onClick={() => setToDelete(a)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )
      )}

      <FileDropzone
        onFiles={addFiles}
        uploads={items}
        compact={attachments.length > 0}
      />

      <PreviewDialog attachment={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={t('Удалить файл?')}
        description={
          toDelete
            ? toDelete.review_id
              ? t(
                  '«{{name}}» приложен к отчёту. Он исчезнет и из истории проверок.',
                  {
                    name: toDelete.file_name,
                  },
                )
              : t('«{{name}}» будет удалён без возможности восстановления.', {
                  name: toDelete.file_name,
                })
            : ''
        }
        confirmLabel={t('Удалить')}
        onConfirm={() => toDelete && remove(toDelete)}
      />
    </div>
  )
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        danger
          ? 'rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'
      }
    >
      {children}
    </button>
  )
}

/**
 * Images show directly. A PDF is fetched as a blob and shown from an object URL
 * with the right type — the storage link itself is served as a download.
 */
function PreviewDialog({
  attachment,
  onClose,
}: {
  attachment: Attachment | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!attachment?.download_url || !isPdf(attachment)) return
    let url: string | null = null
    let cancelled = false
    fetch(attachment.download_url)
      .then((r) =>
        r.ok ? r.blob() : Promise.reject(new Error(String(r.status))),
      )
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
        setPdfUrl(url)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setPdfUrl(null)
      setFailed(false)
    }
  }, [attachment])

  return (
    <Dialog open={attachment !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogTitle className="truncate pr-8">
          {attachment?.file_name}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('Просмотр файла')}
        </DialogDescription>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-muted/40">
          {attachment && isImage(attachment) && attachment.download_url ? (
            <img
              src={attachment.download_url}
              alt={attachment.file_name}
              className="max-h-[75vh] max-w-full object-contain"
            />
          ) : failed ? (
            <p className="p-8 text-sm text-muted-foreground">
              {t('Не удалось открыть файл для просмотра — скачайте его.')}
            </p>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={attachment?.file_name}
              className="h-[75vh] w-full rounded-md"
            />
          ) : (
            <Skeleton className="h-[60vh] w-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
