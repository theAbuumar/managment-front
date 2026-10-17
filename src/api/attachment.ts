import axios from 'axios'
import client from './client'
import { t } from '@/i18n'

// Issue attachments (Ф4 4.F5). Bytes never pass through the API: registering a
// file returns a presigned upload slot, the browser PUTs the bytes there, and the
// list hands out presigned download links.

export interface Attachment {
  id: string
  issue_id: string
  uploaded_by_id: string
  file_name: string
  file_size: number
  mime_type: string
  /** Set when the file was handed in with a report for review (Ф5). */
  review_id?: string | null
  created_at: string
  uploaded_by: {
    id: string
    display_name: string
    last_name?: string | null
    first_name?: string | null
    middle_name?: string | null
    avatar_url: string | null
  }
  /** Short-lived link; present in the list response. */
  download_url?: string
}

interface UploadSlot {
  attachment: Attachment
  upload: {
    url: string
    method: 'PUT'
    headers: Record<string, string>
    expires_in: number
  }
}

/** Default backend limit (ATTACHMENT_MAX_BYTES); the server re-checks it. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const issueBase = (slug: string, projectId: string, issueId: string) =>
  `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments`

export const getAttachments = (
  slug: string,
  projectId: string,
  issueId: string,
) =>
  client.get<unknown, Attachment[]>(`${issueBase(slug, projectId, issueId)}/`)

// Uploader or workspace admin; 204.
export const deleteAttachment = (
  slug: string,
  projectId: string,
  attachmentId: string,
) =>
  client.delete<unknown, void>(
    `/workspaces/${slug}/projects/${projectId}/attachments/${attachmentId}`,
  )

/**
 * Register the file, upload the bytes (reporting progress 0…1) and resolve to the
 * attachment. A failed upload removes the half-created record.
 */
export async function uploadAttachment(
  slug: string,
  projectId: string,
  issueId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<Attachment> {
  const slot = await client.post<unknown, UploadSlot>(
    `${issueBase(slug, projectId, issueId)}/`,
    {
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    },
  )
  try {
    await axios.put(slot.upload.url, file, {
      headers: slot.upload.headers,
      onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
    })
  } catch {
    await deleteAttachment(slug, projectId, slot.attachment.id).catch(
      () => undefined,
    )
    throw new Error(t('Не удалось загрузить «{{name}}»', { name: file.name }))
  }
  onProgress?.(1)
  return slot.attachment
}

/** "1,2 МБ" */
export function formatBytes(n: number): string {
  if (n < 1024) return t('{{n}} Б', { n })
  if (n < 1024 * 1024) return t('{{n}} КБ', { n: Math.round(n / 1024) })
  return t('{{n}} МБ', {
    n: (n / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
  })
}

export const isImage = (a: { mime_type: string }) =>
  a.mime_type.startsWith('image/')
export const isPdf = (a: { mime_type: string; file_name: string }) =>
  a.mime_type === 'application/pdf' ||
  a.file_name.toLowerCase().endsWith('.pdf')
