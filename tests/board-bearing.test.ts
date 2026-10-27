import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Member, Point, Settings } from '../src/planner.ts'

// These examples check physical contact in the drawn plan. They do not certify
// that an example face width, edge bearing or connection is product-approved.
const TOL = 2e-5
const polygon = (pairs: number[][]): Point[] => pairs.map(([x, y]) => ({ x, y }))
const shapes = {
  rectangle: polygon([[0, 0], [6, 0], [6, 3.238], [0, 3.238]]),
  trapezoid: polygon([[0, 0], [5.2, 0], [4, 3], [1, 3]]),
  triangle: polygon([[0, 0], [5.2, 0], [2.6, 3]]),
  L: polygon([[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [0, 4]]),
  hourglass: polygon([[0, 0], [2.6, 1.2], [5.2, 0], [5.2, 2.478], [2.6, 1.85], [0, 2.478]]),
}

function distanceToMember(q: Point, m: Member): number {
  const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y, denominator = dx * dx + dy * dy
  const t = denominator ? Math.max(0, Math.min(1, ((q.x - m.a.x) * dx + (q.y - m.a.y) * dy) / denominator)) : 0
  return Math.hypot(q.x - m.a.x - t * dx, q.y - m.a.y - t * dy)
}

function settings(shape: Point[], patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, polygon: shape, board: { ...DEFAULT_SETTINGS.board, stock: 4.88 }, frame: 'big-small', frameFaceWidth: 35, boardEndBearing: 10, ...patch }
}

function assertInfillEndsBorne(s: Settings, context: string) {
  const p = planDeck(s), f = p.frame
  assert.equal(f.layoutStatus, 'ready', `${context}: a normal shape produces an actual arrangement: ${f.issues.join('; ')}`)
  assert.equal(f.geometryPass, true, `${context}: frame geometric checks pass: ${f.issues.join('; ')}`)
  const upper = f.members.filter(m => m.kind === 'joist' || m.kind === 'rim')
  const face = (s.frameFaceWidth ?? 35) / 1000, required = (s.boardEndBearing ?? 10) / 1000
  let endEdges = 0
  for (const [index, piece] of p.boards.pieces.entries()) {
    if (piece.kind !== 'infill') continue
    const outline = piece.outline!
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length]
      // The long sides of a horizontal infill board are horizontal. Every
      // nonhorizontal outline edge is an actual square or angled end cut.
      if (Math.abs(a.y - b.y) <= TOL) continue
      endEdges++
      for (const t of [.1, .3, .5, .7, .9]) {
        const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
        const clearance = Math.min(...upper.map(m => distanceToMember(q, m)))
        assert.ok(clearance <= face / 2 - required + TOL,
          `${context}: board${index} end${i} at(${q.x.toFixed(4)},${q.y.toFixed(4)}) needs ${required * 1000}mm bearing; closest centre is ${(clearance * 1000).toFixed(2)}mm away on a ${face * 1000}mm face`)
      }
    }
  }
  assert.ok(endEdges > 0, `${context}: checks actual board-end edges`)
  return p
}

for (const [name, shape] of Object.entries(shapes)) test(`actual infill end bearing: ${name}, both run directions and joint strategies`, () => {
  for (const direction of ['horizontal', 'vertical'] as const) for (const joints of ['breaker', 'butt'] as const) {
    assertInfillEndsBorne(settings(shape, { direction, joints }), `${name}/${direction}/${joints}`)
  }
})

test('staggered stock butt ends bear on actual upper rails, including both opposing faces across each gap', () => {
  const s = settings(polygon([[0, 0], [10, 0], [10, 3.238], [0, 3.238]]), { joints: 'butt', board: { ...DEFAULT_SETTINGS.board, stock: 3.66 } })
  const p = assertInfillEndsBorne(s, 'stock butt ends')
  const firstRow = p.boards.pieces.filter(q => q.kind === 'infill' && q.row === 0).sort((a, b) => a.x - b.x)
  assert.ok(firstRow.length >= 3, 'fixture exercises multiple actual stock butt joints')
  for (let i = 1; i < firstRow.length; i++) assert.ok(Math.abs(firstRow[i].x - (firstRow[i - 1].x + firstRow[i - 1].length) - s.board.endGap / 1000) < TOL, 'opposing board ends retain the configured end gap')
})

test('face width too narrow for both products suppresses an unsupported support arrangement', () => {
  const p = planDeck(settings(shapes.rectangle, { frameFaceWidth: 14, boardEndBearing: 10 }))
  assert.equal(p.frame.layoutStatus, 'unbuildable')
  assert.equal(p.frame.members.length, 0)
  assert.equal(p.frame.pedestals.length, 0)
  assert.ok(p.frame.issues.some(q => /face|bearing|width/i.test(q)), 'explains the face/bearing conflict')
})

test('an actual butt joint with a wider end gap also needs enough face for both board ends', () => {
  const p = planDeck(settings(shapes.rectangle, { joints: 'butt', board: { ...DEFAULT_SETTINGS.board, stock: 3.66, endGap: 20 }, frameFaceWidth: 35, boardEndBearing: 10 }))
  assert.equal(p.frame.layoutStatus, 'unbuildable')
  assert.equal(p.frame.members.length, 0)
  assert.equal(p.frame.pedestals.length, 0)
  assert.ok(p.frame.issues.some(q => /face|bearing|gap/i.test(q)), 'explains why the paired butt ends exceed the available face')
  assertInfillEndsBorne(settings(shapes.rectangle, { joints: 'butt', board: { ...DEFAULT_SETTINGS.board, stock: 3.66, endGap: 20 }, frameFaceWidth: 45, boardEndBearing: 10 }), 'wider face for wide end gap')
})

test('larger bases can sit back from the board-bearing rail with measured provisional projections',()=>{
  const p=planDeck(settings(shapes.rectangle,{pedestalDiameter:400}))
  assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
  assert.ok(p.frame.projections.some(q=>q.distance>0))
  assert.equal(p.frame.verification.status,'provisional')
})

test('a product with more face width can supply the same minimum end bearing', () => {
  assertInfillEndsBorne(settings(shapes.trapezoid, { frameFaceWidth: 60, boardEndBearing: 15 }), 'wider actual product face')
})

test('angled stock butt joints use real separated joists instead of overlapping parallel faces', () => {
  const shape = polygon([[0, 0], [8, 0], [5, 4], [1, 4]])
  for (const direction of ['horizontal', 'vertical'] as const) for (const reversed of [false, true]) {
    const s = settings(reversed ? [...shape].reverse() : shape, { direction, joints: 'butt', board: { ...DEFAULT_SETTINGS.board, stock: 3.66 } })
    const context = `8m trapezoid/${direction}/${reversed ? 'clockwise' : 'anticlockwise'}`
    const p = assertInfillEndsBorne(s, context)
    const joists = p.frame.members.filter(m => m.kind === 'joist'&&Math.abs(m.a.x-m.b.x)<TOL)
    for (let i = 0; i < joists.length; i++) for (let j = 0; j < i; j++) {
      const a = joists[i], b = joists[j], separation = Math.abs(a.a.x - b.a.x)
      const overlap = Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y))
      if (overlap <= TOL) continue
      // Collinear stock segments may share an end, but may not occupy the same
      // run. Distinct parallel joists need room for their entered face width.
      assert.ok(separation >= (s.frameFaceWidth ?? 35) / 1000 - TOL,
        `${context}: overlapping y runs at x${a.a.x.toFixed(7)} and x${b.a.x.toFixed(7)} put ${s.frameFaceWidth}mm faces only ${(separation * 1000).toFixed(2)}mm apart`)
    }
  }
})
