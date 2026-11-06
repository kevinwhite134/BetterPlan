import { createPhotoFetchHandler } from '../server/photoCoordinates.ts'

const analyse = createPhotoFetchHandler()

// Vercel supplies x-real-ip at its proxy boundary. Secrets are read only at runtime.
export default {
  fetch(request: Request) {
    return analyse(request, request.headers.get('x-real-ip') ?? 'unknown')
  },
}
