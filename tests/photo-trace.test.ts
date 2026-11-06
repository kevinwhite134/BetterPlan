import test from 'node:test'
import assert from 'node:assert/strict'
import { traceOutlineCoordinates } from '../server/photoTrace.ts'
import { createPhotoFetchHandler } from '../server/photoCoordinates.ts'
import { parseOutlineCoordinates } from '../src/outlineCoordinates.ts'
import { distance, polygonError } from '../src/planner.ts'

// Manually read positions and labels from the user's six-corner drawing.
// This tests conversion/consistency, not a live model's ability to find these pixels.
const pixels = [{ x: 285, y: 181 }, { x: 743, y: 88 }, { x: 743, y: 268 }, { x: 535, y: 268 }, { x: 535, y: 424 }, { x: 119, y: 424 }]
const lengths = [4.49, 1.74, 2, 1.5, 4, 2.83]
const measurements = lengths.map((metres, from) => ({ from, to: (from + 1) % 6, kind: 'distance', metres }))
const goodTrace = { vertices: pixels, measurements, estimated_width_metres: null }

test('user drawing preserves both diagonals and the orthogonal recess after pixel-to-metre conversion', () => {
  const result = traceOutlineCoordinates(goodTrace)
  const points = parseOutlineCoordinates(result.coordinates)
  assert.equal(polygonError(points), '')
  assert.equal(result.accuracy, 'Scale-derived')
  assert.ok(Math.abs(result.width - 6) < .02)
  assert.ok(Math.abs(result.depth - 3.24) < .02)
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(distance(points[i], points[(i + 1) % 6]) - lengths[i]) < .02)
  assert.ok(points[0].x < points[1].x && points[0].y > points[1].y, 'top edge retains its slope')
  assert.equal(points[2].y, points[3].y, 'recess starts with a horizontal edge')
  assert.equal(points[3].x, points[4].x, 'recess continues vertically')
  assert.equal(points[4].y, points[5].y, 'bottom stays horizontal')
})

test('the actual wrong-but-simple polygon supplied by the user is rejected against the visible dimensions', () => {
  const wrong = parseOutlineCoordinates('0, 0\n4.49, 0\n4.49, 1.74\n2.49, 3.24\n0.49, 3.24\n0, 2.83')
  assert.equal(polygonError(wrong), '', 'ordinary topology validation alone misses this failure')
  assert.throws(() => traceOutlineCoordinates({ ...goodTrace, vertices: wrong }), /does not match the visible dimensions/)
})

test('uniform pixel rescaling and translation do not alter the metre coordinates', () => {
  const result = traceOutlineCoordinates(goodTrace)
  assert.deepEqual(traceOutlineCoordinates({ ...goodTrace, vertices: pixels.map(p => ({ x: p.x * .5 + 21, y: p.y * .5 - 16 })) }), result)
})

test('dimension references distinguish X/Y spans from diagonal distances', () => {
  const result = traceOutlineCoordinates({ vertices: pixels, measurements: [{ from: 5, to: 1, kind: 'horizontal', metres: 6 }], estimated_width_metres: null })
  assert.ok(Math.abs(result.width - 6) < .001)
  assert.ok(Math.abs(result.depth - 3.24) < .02)
  assert.ok(parseOutlineCoordinates(result.coordinates)[0].y > 0)
  const vertical = traceOutlineCoordinates({ vertices: pixels, measurements: [{ from: 1, to: 4, kind: 'vertical', metres: 3.24 }], estimated_width_metres: null })
  assert.equal(vertical.depth, 3.24)
})

test('unmeasured photos keep one scale for both axes and are labelled estimated', () => {
  const result = traceOutlineCoordinates({ vertices: pixels, measurements: [], estimated_width_metres: 6 })
  assert.equal(result.accuracy, 'Estimated')
  assert.equal(result.width, 6)
  assert.ok(Math.abs(result.depth - 3.24) < .02)
  assert.throws(() => traceOutlineCoordinates({ vertices: pixels, measurements: [], estimated_width_metres: null }), /estimate the deck size/)
})

test('invalid references, missing data and crossed traces are rejected safely', () => {
  for (const reference of [{ from: -1, to: 1, kind: 'distance', metres: 4 }, { from: 0, to: 8, kind: 'distance', metres: 4 }, { from: 0, to: 0, kind: 'distance', metres: 4 }, { from: 0, to: 1, kind: 'distance', metres: NaN }, { from: 0, to: 1, kind: 'bogus', metres: 4 }, { from: 1, to: 2, kind: 'horizontal', metres: 4 }]) assert.throws(() => traceOutlineCoordinates({ ...goodTrace, measurements: [reference] }))
  assert.throws(() => traceOutlineCoordinates({ vertices: pixels }))
  assert.throws(() => traceOutlineCoordinates({ ...goodTrace, vertices: [pixels[0], pixels[4], pixels[1], pixels[5]] }), /continuous deck boundary/)
})

test('API converts the traced drawing and refuses dimension-inconsistent output without another paid call', async () => {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64')
  let calls = 0, trace = goodTrace
  const handler = createPhotoFetchHandler({ apiKey: 'test', fetch: async (_url, options) => {
    calls++
    const body = JSON.parse(options!.body as string)
    assert.ok(body.text.format.schema.required.includes('measurements'))
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(trace) }] }] })
  } })
  const request = () => new Request('https://example.test/api/photo-to-coordinates', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image })
  const response = await handler(request())
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.accuracy, 'Scale-derived'); assert.equal(result.width, 6)
  trace = { ...goodTrace, vertices: parseOutlineCoordinates('0, 0\n4.49, 0\n4.49, 1.74\n2.49, 3.24\n0.49, 3.24\n0, 2.83') }
  const rejected = await handler(request())
  assert.equal(rejected.status, 422)
  const failure = await rejected.json()
  assert.match(failure.error, /does not match the visible dimensions/)
  assert.equal(failure.coordinates, undefined)
  assert.equal(calls, 2)
})
