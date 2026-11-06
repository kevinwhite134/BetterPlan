import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MAX_PHOTO_BYTES, MAX_SOURCE_PHOTO_BYTES, PHOTO_ACCEPT, PHOTO_ENDPOINT, PHOTO_TYPES, photoUploadError } from './photoUpload'
import { parseOutlineCoordinates } from './outlineCoordinates'
import { polygonError } from './planner'

export default function PhotoCoordinates({ onApply }: { onApply: (coordinates: string) => string }) {
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false), [pasting, setPasting] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const upload = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null), id = useId()
  const applyCoordinates = useRef(onApply)
  useLayoutEffect(() => { applyCoordinates.current = onApply }, [onApply])
  useEffect(() => () => { controller.current?.abort(); controller.current = null }, [])

  function choose(next?: File) {
    if (!next) return
    setNotice('')
    const issue = photoUploadError(next.type, next.size, MAX_SOURCE_PHOTO_BYTES)
    setError(issue); setFile(issue ? null : next)
  }
  async function paste() {
    if (busy || pasting) return
    setError(''); setNotice('')
    if (!navigator.clipboard?.read) {
      setError('Use Ctrl+V (or your device’s Paste command) in this panel, or upload an image.')
      return
    }
    setPasting(true)
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find(type => PHOTO_TYPES.includes(type))
        if (!type) continue
        const blob = await item.getType(type)
        choose(new File([blob], `pasted-image.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}`, { type }))
        return
      }
      setError('No supported image found on the clipboard. Copy a JPEG, PNG or WebP image first.')
    } catch {
      setError('Could not access the clipboard. Allow clipboard access, use Ctrl+V in this panel, or upload an image.')
    } finally { setPasting(false) }
  }
  async function analyse() {
    if (!file || busy || pasting) return
    const current = new AbortController()
    controller.current = current
    setBusy(true); setError(''); setNotice('')
    const timer = window.setTimeout(() => current.abort(), 75_000)
    try {
      // Decode locally before sending so corrupt images do not consume an AI request.
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be opened. Choose another photograph or export it as JPEG.') })
      let image: Blob = file
      try {
        // Larger phone photos are reduced locally to fit the hosted API's payload cap.
        if (file.size > MAX_PHOTO_BYTES) {
          const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
          const context = canvas.getContext('2d')
          if (!context) throw new Error('This browser could not prepare the photo. Choose a smaller image.')
          context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The photo could not be prepared. Choose a smaller image.')), 'image/jpeg', .85))
        }
      } finally { bitmap.close() }
      if (image.size > MAX_PHOTO_BYTES) throw new Error('The photo is still too large. Choose a smaller image.')
      if (current.signal.aborted) return
      const response = await fetch(PHOTO_ENDPOINT, { method: 'POST', headers: { 'Content-Type': image.type }, body: image, signal: current.signal })
      const result = await response.json().catch(() => { throw new Error('Photo analysis is unavailable. Please try again later.') })
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Photo analysis failed. Please try again.')
      if (typeof result?.coordinates !== 'string' || polygonError(parseOutlineCoordinates(result.coordinates))) throw new Error('The AI returned invalid coordinates. Try another photograph.')
      if (!current.signal.aborted) {
        const issue = applyCoordinates.current(result.coordinates)
        if (issue) { setError(issue); return }
        const dimensions = (result.accuracy === 'Scale-derived' || result.accuracy === 'Estimated') && Number.isFinite(result.width) && Number.isFinite(result.depth) ? ` ${result.accuracy} · ${result.width.toFixed(2)} × ${result.depth.toFixed(2)} m.` : ''
        setNotice(`Coordinates inserted and corners applied.${dimensions} Check the outline and dimensions against your image.`)
      }
    } catch (reason) {
      if (controller.current === current) setError(current.signal.aborted ? 'Photo analysis was cancelled or timed out. Please try again.' : reason instanceof Error ? reason.message : 'Photo analysis failed. Please try again.')
    } finally {
      window.clearTimeout(timer)
      if (controller.current === current) { controller.current = null; setBusy(false) }
    }
  }
  return <div className="photo-coordinates">
    <button className="button secondary full" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>AI Photo to Coordinates</button>
    {open ? <section id={id} aria-label="AI Photo to Coordinates" aria-busy={busy || pasting} tabIndex={0} onPaste={event => {
      if (busy || pasting) return
      const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
      if (image) { event.preventDefault(); choose(image) }
    }}>
      <p>Take, upload or paste a deck photo for a rough outline in metres. Analysis automatically fills the coordinates and applies the corners.</p>
      <p className="field-note">JPEG, PNG or WebP · up to 10 MB. The photo is sent to OpenAI for analysis.</p>
      <input hidden ref={camera} type="file" accept={PHOTO_ACCEPT} capture="environment" onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }}/>
      <input hidden ref={upload} type="file" accept={PHOTO_ACCEPT} onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }}/>
      <div className="photo-actions"><button className="button secondary" disabled={busy || pasting} onClick={() => camera.current?.click()}>Take photo</button><button className="button secondary" disabled={busy || pasting} onClick={() => upload.current?.click()}>Upload image</button><button className="button secondary" disabled={busy || pasting} onClick={paste}>{pasting ? 'Pasting image…' : 'Paste image'}</button></div>
      <p className="field-note">You can also paste an image here with Ctrl+V or your device’s Paste command.</p>
      {file ? <p className="photo-filename">{file.name}</p> : null}
      <button className="button primary full" disabled={!file || busy || pasting} onClick={analyse}>{busy ? <><span className="photo-spinner" aria-hidden="true"/>Analysing image…</> : 'Analyse image'}</button>
      {busy ? <p role="status">Analysing the deck perimeter…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section> : null}
  </div>
}
