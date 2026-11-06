import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { once } from 'node:events'
import { createPhotoFetchHandler, createPhotoHandler } from '../server/photoCoordinates.ts'
import vercelPhoto from '../api/photo-to-coordinates.ts'
import { parseOutlineCoordinates, photoOutlineCoordinates } from '../src/outlineCoordinates.ts'
import { MAX_PHOTO_BYTES, MAX_SOURCE_PHOTO_BYTES, PHOTO_ENDPOINT, photoUploadError } from '../src/photoUpload.ts'
import { bounds, polygonArea, polygonError } from '../src/planner.ts'
import type { Point } from '../src/planner.ts'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64')
const shapes: Record<string, Point[]> = {
  rectangle: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 }, { x: 0, y: 3 }],
  'L-shaped': [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 5 }, { x: 0, y: 5 }],
  recess: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 5 }, { x: 0, y: 5 }],
  diagonal: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }],
  irregular: [{ x: 0, y: 1 }, { x: 3, y: 0 }, { x: 6, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 5 }, { x: 1, y: 4 }],
}
function modelResponse(vertices: unknown) {
  return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ vertices, measurements: [], estimated_width_metres: Array.isArray(vertices) && vertices.length ? bounds(vertices).width : null }) }] }] }
}
async function withServer(handler: ReturnType<typeof createPhotoHandler>, run: (url: string, server: Server) => Promise<void>) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}${PHOTO_ENDPOINT}`
  try { await run(url, server) } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
function upload(url: string, body: BodyInit = png, headers: Record<string, string> = {}) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/png', ...headers }, body })
}

for (const [name, vertices] of Object.entries(shapes)) test(`${name} model output passes through the API and BEV parser without shape changes`, async () => {
  let calls = 0
  const mock: typeof fetch = async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.ok(init)
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-secret')
    const body = JSON.parse(init.body as string)
    assert.equal(body.model, 'gpt-4.1-mini'); assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    assert.match(body.instructions, /X increasing right and Y increasing down/)
    assert.equal(body.input[0].content[1].image_url, `data:image/png;base64,${png.toString('base64')}`)
    return Response.json(modelResponse(vertices))
  }
  await withServer(createPhotoHandler({ apiKey: 'test-secret', fetch: mock }), async url => {
    const response = await upload(url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const { coordinates } = await response.json()
    assert.match(coordinates, /^\d+(?:\.\d+)?, \d+(?:\.\d+)?(?:\n\d+(?:\.\d+)?, \d+(?:\.\d+)?)+$/)
    const parsed = parseOutlineCoordinates(coordinates)
    assert.equal(polygonError(parsed), '')
    assert.deepEqual(parsed, vertices)
    assert.equal(polygonArea(parsed), polygonArea(vertices))
    assert.deepEqual(bounds(parsed), bounds(vertices))
    assert.equal(calls, 1)
  })
})

test('normalization only translates, removes an optional closing corner and rounds to millimetres', () => {
  const translated = shapes.irregular.map(p => ({ x: p.x - 2.12345, y: p.y + 4.67891 }))
  assert.equal(photoOutlineCoordinates([...translated, translated[0]]), photoOutlineCoordinates(shapes.irregular))
  assert.equal(photoOutlineCoordinates([...translated].reverse()), photoOutlineCoordinates([...shapes.irregular].reverse()))
  assert.equal(photoOutlineCoordinates([{ x: 0, y: 0 }, { x: 3.12345, y: 0 }, { x: 3.12345, y: 2 }]), '0, 0\n3.123, 0\n3.123, 2')
  assert.deepEqual(parseOutlineCoordinates(' 0, 0\r\n6 0\r\n 6, 3 '), shapes.rectangle.slice(0, 3))
})

test('malformed, degenerate, intersecting and oversized outlines are rejected', () => {
  for (const value of [null, '0,0', [], [{ x: '1', y: 2 }], [{ x: NaN, y: 0 }, ...shapes.rectangle], [{ x: Infinity, y: 0 }, ...shapes.rectangle],
    [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 3 }, { x: 3, y: 0 }],
    [...shapes.rectangle, shapes.rectangle[1]],
    shapes.rectangle.map(p => ({ x: p.x * 100, y: p.y })),
    Array.from({ length: 129 }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i) })),
  ]) assert.throws(() => photoOutlineCoordinates(value))
  assert.ok(polygonError(parseOutlineCoordinates('explanation\n```\n0, 0')))
})

test('file validation rejects unsupported, empty, oversized and disguised uploads before calling AI', async () => {
  assert.ok(photoUploadError('image/heic', 20)); assert.ok(photoUploadError('image/svg+xml', 20))
  assert.ok(photoUploadError('image/png', 0)); assert.ok(photoUploadError('image/png', MAX_PHOTO_BYTES + 1))
  assert.equal(photoUploadError('image/jpeg', MAX_PHOTO_BYTES), '')
  assert.equal(photoUploadError('image/jpeg', MAX_SOURCE_PHOTO_BYTES, MAX_SOURCE_PHOTO_BYTES), '')
  assert.ok(photoUploadError('image/jpeg', MAX_SOURCE_PHOTO_BYTES + 1, MAX_SOURCE_PHOTO_BYTES))
  await withServer(createPhotoHandler({ apiKey: 'test', fetch: async () => { assert.fail('Invalid files must not reach OpenAI') } }), async url => {
    assert.equal((await upload(url, png, { 'Content-Type': 'image/svg+xml' })).status, 415)
    assert.equal((await upload(url, Buffer.alloc(0))).status, 415)
    assert.equal((await upload(url, Buffer.from('not an image'))).status, 415)
    assert.equal((await upload(url, png, { 'Content-Type': 'image/jpeg' })).status, 415)
    assert.equal((await upload(url, Buffer.alloc(MAX_PHOTO_BYTES + 1))).status, 413)
    // Force chunked transfer: the streaming cap must work without Content-Length.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { 'Content-Type': 'image/png' } }, res => { res.resume(); resolve(res.statusCode!) })
      req.on('error', reject); req.write(Buffer.alloc(MAX_PHOTO_BYTES)); req.end(Buffer.alloc(1))
    })
    assert.equal(status, 413)
  })
})

test('the actual Vercel entry point reads the runtime environment and processes all five outlines', async t => {
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.OPENAI_VISION_MODEL
  // This key is test data. The real deployment secret is never required or fetched.
  process.env.OPENAI_API_KEY = 'test-vercel-runtime-key'
  process.env.OPENAI_VISION_MODEL = 'gpt-4.1-mini'
  let vertices = shapes.rectangle, calls = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-vercel-runtime-key')
    assert.equal(JSON.parse(init.body as string).store, false)
    return Response.json(modelResponse(vertices))
  })
  try {
    const url = `https://betterplan.example${PHOTO_ENDPOINT}`
    const method = await vercelPhoto.fetch(new Request(url))
    assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST')
    for (vertices of Object.values(shapes)) {
      const response = await vercelPhoto.fetch(new Request(url, { method: 'POST', headers: { 'Content-Type': 'image/png', Origin: 'https://betterplan.example', 'x-real-ip': '192.0.2.1' }, body: png }))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const { coordinates } = await response.json()
      assert.deepEqual(parseOutlineCoordinates(coordinates), vertices)
      assert.equal(polygonError(parseOutlineCoordinates(coordinates)), '')
      assert.doesNotMatch(JSON.stringify({ coordinates }), /test-vercel-runtime-key/)
    }
    assert.equal(calls, 5)
    const denied = await vercelPhoto.fetch(new Request(url, { method: 'POST', headers: { 'Content-Type': 'image/png', Origin: 'https://another.example' }, body: png }))
    assert.equal(denied.status, 403); assert.equal(calls, 5)
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey
    if (oldModel === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = oldModel
  }
})

test('the Web adapter enforces the binary upload cap on streamed requests and cancels oversized bodies', async () => {
  assert.ok(MAX_PHOTO_BYTES < 4_500_000, 'Binary uploads must fit Vercel’s 4.5 MB platform limit')
  const analyse = createPhotoFetchHandler({ apiKey: 'test', fetch: async () => { assert.fail('Oversized Web uploads must not reach OpenAI') } })
  let cancelled = false, chunks = 0
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(++chunks === 1 ? MAX_PHOTO_BYTES : 1)) },
    cancel() { cancelled = true },
  })
  const request = new Request('https://betterplan.example/api/photo-to-coordinates', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: stream, duplex: 'half' } as RequestInit)
  const response = await analyse(request)
  assert.equal(response.status, 413)
  assert.equal(cancelled, true)
  assert.match((await response.json()).error, /4 MB/)
  assert.equal((await createPhotoFetchHandler({ apiKey: '' })(new Request('https://betterplan.example/api/photo-to-coordinates', { method: 'POST' }))).status, 503)
})

test('methods, cross-site requests and missing configuration fail without upstream calls', async () => {
  await withServer(createPhotoHandler({ apiKey: '' }), async url => {
    const get = await fetch(url)
    assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST')
    assert.equal((await upload(url)).status, 503)
    assert.equal((await upload(url, png, { Origin: 'https://other.example' })).status, 403)
    assert.equal((await upload(url, png, { Origin: 'null' })).status, 403)
    assert.equal((await upload(url, png, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  })
})

test('upstream errors are safe, and malformed/refused/incomplete outputs cannot become coordinates', async () => {
  const cases: [unknown, number][] = [
    [new Response('secret upstream error', { status: 401 }), 502],
    [new Response('bad image', { status: 400 }), 422],
    [new Response('quota', { status: 429 }), 429],
    [new Response('failure', { status: 500 }), 502],
    [new Response('invalid JSON'), 502],
    [new Error('secret network details'), 502],
    [{ status: 'incomplete', output: modelResponse(shapes.rectangle).output }, 502],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, 422],
    [modelResponse([]), 422], [modelResponse([{ x: '0', y: 0 }]), 422],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '```not JSON```' }] }] }, 422],
  ]
  for (const [value, status] of cases) await withServer(createPhotoHandler({ apiKey: 'test-secret', fetch: async () => {
    if (value instanceof Error) throw value
    return value instanceof Response ? value : Response.json(value)
  } }), async url => {
    const response = await upload(url)
    assert.equal(response.status, status)
    const body = await response.json()
    assert.equal(typeof body.error, 'string'); assert.equal(body.coordinates, undefined)
    assert.doesNotMatch(JSON.stringify(body), /secret/)
  })
})

test('upstream timeout is reported, limits are enforced, and a failed analysis releases its slot', async () => {
  await withServer(createPhotoHandler({ apiKey: 'test', timeoutMs: 5, fetch: async (_url, init) => {
    await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
    throw new Error('unreachable')
  } }), async url => {
    for (let i = 0; i < 10; i++) assert.equal((await upload(url)).status, 504)
    assert.equal((await upload(url)).status, 429)
  })
  let finish: () => void = () => {}, started: () => void = () => {}
  const waiting = new Promise<void>(resolve => { finish = resolve })
  const ready = new Promise<void>(resolve => { started = resolve })
  let calls = 0
  await withServer(createPhotoHandler({ apiKey: 'test', fetch: async () => {
    if (++calls === 2) started()
    await waiting
    return Response.json(modelResponse(shapes.rectangle))
  } }), async url => {
    const first = upload(url), second = upload(url)
    await ready
    try { assert.equal((await upload(url)).status, 429) } finally { finish() }
    assert.equal((await first).status, 200); assert.equal((await second).status, 200)
    assert.equal((await upload(url)).status, 200)
  })
})
