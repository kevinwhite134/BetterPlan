export const PHOTO_ENDPOINT = '/api/photo-to-coordinates'
// Leave room below Vercel's 4.5 MB request-body cap; send binary, not base64 JSON.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
export const MAX_SOURCE_PHOTO_BYTES = 10 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',')

export function photoUploadError(type: string, size: number, maxBytes = MAX_PHOTO_BYTES): string {
  if (!PHOTO_TYPES.includes(type)) return 'Choose a JPEG, PNG or WebP image. For HEIC photos, export as JPEG first.'
  if (size <= 0) return 'The image is empty. Choose another photograph.'
  if (size > maxBytes) return `Choose an image no larger than ${maxBytes / 1024 / 1024} MB.`
  return ''
}
