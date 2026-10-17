import axios from 'axios'
import client from './client'

// Avatars and workspace logos (Ф3): ask the backend for a presigned upload slot,
// PUT the bytes there, then save the returned stable `url` on the profile or
// workspace (PATCH /auth/me { avatar_url } / PATCH /workspaces/:slug { logo_url }).

interface UploadSlot {
  url: string
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expires_in: number }
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

async function uploadTo(slot: UploadSlot, file: File): Promise<string> {
  await axios.put(slot.upload.url, file, { headers: slot.upload.headers })
  return slot.url
}

/** Upload an avatar image; resolves to the stable URL to save on the profile. */
export async function uploadAvatar(file: File): Promise<string> {
  const slot = await client.post<unknown, UploadSlot>('/auth/me/avatar', {
    mime_type: file.type,
    size: file.size,
  })
  return uploadTo(slot, file)
}

/** Upload a workspace logo (admin); resolves to the stable URL to save. */
export async function uploadLogo(slug: string, file: File): Promise<string> {
  const slot = await client.post<unknown, UploadSlot>(`/workspaces/${slug}/logo`, {
    mime_type: file.type,
    size: file.size,
  })
  return uploadTo(slot, file)
}
