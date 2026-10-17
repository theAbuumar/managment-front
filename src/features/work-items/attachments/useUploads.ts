import { useState } from 'react'
import { toast } from 'sonner'
import {
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  uploadAttachment,
  type Attachment,
} from '@/api/attachment'
import { errorText } from '@/lib/errorMessages'
import { t } from '@/i18n'

export interface UploadItem {
  key: string
  name: string
  size: number
  progress: number // 0…1
}

/**
 * Upload queue for one issue: files go up in parallel with per-file progress;
 * resolves to the attachments that made it (failures are toasted).
 */
export function useUploads(slug: string, projectId: string, issueId: string) {
  const [items, setItems] = useState<UploadItem[]>([])

  async function upload(files: File[]): Promise<Attachment[]> {
    const accepted = files.filter((f) => {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          t('«{{name}}» больше {{max}}', {
            name: f.name,
            max: formatBytes(MAX_ATTACHMENT_BYTES),
          }),
        )
        return false
      }
      return true
    })
    const queued = accepted.map((f) => ({
      file: f,
      item: {
        key: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        progress: 0,
      },
    }))
    setItems((prev) => [...prev, ...queued.map((q) => q.item)])

    const results = await Promise.all(
      queued.map(async ({ file, item }) => {
        try {
          return await uploadAttachment(
            slug,
            projectId,
            issueId,
            file,
            (progress) =>
              setItems((prev) =>
                prev.map((x) => (x.key === item.key ? { ...x, progress } : x)),
              ),
          )
        } catch (err) {
          toast.error(
            errorText(
              err,
              t('Не удалось загрузить «{{name}}»', { name: file.name }),
            ),
          )
          return null
        } finally {
          setItems((prev) => prev.filter((x) => x.key !== item.key))
        }
      }),
    )
    return results.filter((a): a is Attachment => a !== null)
  }

  return { items, upload, busy: items.length > 0 }
}
