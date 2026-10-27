import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Frame, Member, Point, Settings } from '../src/planner.ts'

// These checks deliberately do not use the planner's scan, inside, distance or
// bearing helpers: a mistake in those helpers must not bless the resulting grid.
const TOL = 2e-5
const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const minus = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y })
const at = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
function edgeDistance(q: Point, a: Point, b: Point) {
  const d = minus(b, a), denominator = d.x * d.x + d.y * d.y
  const t = denominator ? Math.max(0, Math.min(1, ((q.x - a.x) * d.x + (q.y - a.y) * d.y) / denominator)) : 0
  return length(q, at(a, b, t))
}
function inPolygon(polygon: Point[], q: Point) {
  let winding = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    if (edgeDistance(q, a, b) <= TOL) return true
    const side = cross(minus(b, a), minus(q, a))
    if (a.y <= q.y && b.y > q.y && side > 0) winding++
    if (a.y > q.y && b.y <= q.y && side < 0) winding--
  }
  return winding !== 0
}
// Return all intersections as distances along the first segment, including
// collinear end points. Sampling each resulting interval catches even a narrow
// re-entrant void which a fixed number of samples could miss.
function intersections(a: Point, b: Point, c: Point, d: Point) {
  const u = minus(b, a), v = minus(d, c), delta = minus(c, a), den = cross(u, v), run = length(a, b)
  if (Math.abs(den) < 1e-10) {
    if (edgeDistance(c, a, b) > TOL && edgeDistance(d, a, b) > TOL && edgeDistance(a, c, d) > TOL) return []
    return [
      ...[c, d].filter(q => edgeDistance(q, a, b) <= TOL).map(q => Math.max(0, Math.min(run, ((q.x - a.x) * u.x + (q.y - a.y) * u.y) / run))),
      ...(edgeDistance(a, c, d) <= TOL ? [0] : []),
      ...(edgeDistance(b, c, d) <= TOL ? [run] : []),
    ]
  }
  const t = cross(delta, v) / den, s = cross(delta, u) / den
  return t >= -TOL && t <= 1 + TOL && s >= -TOL && s <= 1 + TOL ? [Math.max(0, Math.min(run, t * run))] : []
}
function memberInside(polygon: Point[], m: Member) {
  const run = length(m.a, m.b)
  if (!inPolygon(polygon, m.a) || !inPolygon(polygon, m.b)) return false
  const cuts = [0, run, ...polygon.flatMap((a, i) => intersections(m.a, m.b, a, polygon[(i + 1) % polygon.length]))].sort((a, b) => a - b)
  return cuts.slice(1).every((end, i) => inPolygon(polygon, at(m.a, m.b, (cuts[i] + end) / 2 / run)))
}
function settings(polygon: Point[], patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, polygon, board: { ...DEFAULT_SETTINGS.board }, joints: 'butt', ...patch }
}
const polygon = (coords: number[][]): Point[] => coords.map(([x, y]) => ({ x, y }))
const rectangle = polygon([[0, 0], [6, 0], [6, 3.2], [0, 3.2]])
const shapes = {
  rectangle,
  L: polygon([[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [0, 4]]),
  U: polygon([[0, 0], [6, 0], [6, 4], [4, 4], [4, 2], [2, 2], [2, 4], [0, 4]]),
  triangle: polygon([[0, 0], [5.2, 0], [2.6, 3]]),
  trapezoid: polygon([[0, 0], [5.2, 0], [4, 3], [1, 3]]),
  diamond: polygon([[0, 2], [3, 0], [6, 2], [3, 4]]),
  // Reproduces the user's two concave sides and narrow middle, rather than
  // reducing the screenshot to a convex trapezoid.
  hourglass: polygon([[0, 0], [2.6, 1.2], [5.2, 0], [5.2, 2.478], [2.6, 1.85], [0, 2.478]]),
}
const frames: Frame[] = ['small', 'big', 'small-small', 'big-small']

function assertSupportLayout(s: Settings, context: string, mustFit = false) {
  const p = planDeck(s), f = p.frame
  const status = (f as typeof f & { layoutStatus?: 'ready' | 'unbuildable' }).layoutStatus
  if (status === 'unbuildable') {
    assert.equal(mustFit, false, `${context}: a normal buildable shape must produce a support layout: ${f.issues.join('; ')}`)
    assert.equal(f.pedestals.length, 0, `${context}: an infeasible plan must not display a partial/overlapping pedestal arrangement`)
    assert.equal(f.members.length, 0, `${context}: an infeasible plan must not display an unsupported frame`)
    assert.ok(f.issues.some(issue => /change|different|larger|smaller|frame|split|narrow|fit|support/i.test(issue)), `${context}: explain how to resolve infeasibility`)
    return p
  }
  assert.ok(f.pedestals.length > 0 && f.members.length > 0, `${context}: a ready arrangement has supports and members`)
  const diameter = (s.pedestalDiameter ?? 150) / 1000, setback = diameter / 2 + (s.pedestalClearance ?? 0) / 1000
  const primary = f.members.filter(m => m.kind === (f.rule.bearer ? 'bearer' : 'joist')&&m.role!=='bearer-link'&&m.support!=='transfer'),lower=f.members.filter(m=>m.kind==='bearer')
  for (let i = 0; i < f.pedestals.length; i++) {
    const q = f.pedestals[i]
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), `${context}: finite pedestal coordinates`)
    assert.ok(inPolygon(p.p, q), `${context}: base centre lies inside the deck`)
    const clearance = Math.min(...p.p.map((a, j) => edgeDistance(q, a, p.p[(j + 1) % p.p.length])))
    assert.ok(clearance >= setback - TOL, `${context}: base ${i} has ${clearance} m edge clearance, needs ${setback}`)
    assert.ok(primary.some(m => edgeDistance(q, m.a, m.b) <= TOL), `${context}: pedestal ${i} bears on a primary member`)
    for (let j = 0; j < i; j++) assert.ok(length(q, f.pedestals[j]) >= diameter - TOL, `${context}: bases ${i}/${j} overlap by ${diameter - length(q, f.pedestals[j])} m`)
  }
  for (const m of f.members) {
    const run = length(m.a, m.b)
    assert.ok([m.a.x, m.a.y, m.b.x, m.b.y, run].every(Number.isFinite), `${context}: finite frame coordinates`)
    assert.ok(run > 1e-7 && run <= s.frameStock + TOL, `${context}: nonzero frame member fits available stock`)
    assert.ok(memberInside(p.p, m), `${context}: ${m.kind} must not bridge a concave void`)
  }
  let actualPrimary = 0, actualSecondary = 0
  for (const m of primary) {
    const run = length(m.a, m.b), bearings = f.pedestals.filter(q => edgeDistance(q, m.a, m.b) <= TOL).map(q => length(m.a, q)).sort((a, b) => a - b)
    assert.ok(bearings.length >= 1, `${context}: every primary stock segment has a real pedestal`)
    for(const [end,projection] of [['start',bearings[0]],['end',run-bearings.at(-1)!]] as const)if(projection>TOL){
      const measured=f.projections.find(q=>q.member===f.members.indexOf(m)&&q.end===end)
      assert.ok(measured&&Math.abs(measured.distance-projection)<=TOL, `${context}: terminal projection is measured from the actual pedestal`)
      assert.ok(measured.limit===null||projection<=measured.limit+TOL)
    }
    for (let i = 1; i < bearings.length; i++) {
      const span = bearings[i] - bearings[i - 1]
      actualPrimary = Math.max(actualPrimary, span)
      assert.ok(span <= f.rule.support + TOL, `${context}: ${span} m primary span exceeds ${f.rule.support}`)
    }
  }
  for(const m of f.members.filter(m=>m.role==='bearer-link')){
    const contacts=primary.flatMap(n=>intersections(m.a,m.b,n.a,n.b)).sort((a,b)=>a-b)
    assert.ok(contacts.length>0,`${context}: every lower link meets a bearer that has actual pedestal support`)
    for(let i=1;i<contacts.length;i++){actualPrimary=Math.max(actualPrimary,contacts[i]-contacts[i-1]);assert.ok(contacts[i]-contacts[i-1]<=f.rule.support+TOL)}
    assert.ok(f.connections.some(c=>c.members.includes(f.members.indexOf(m))),`${context}: transfer connection remains explicitly scheduled`)
  }
  for(const m of f.members.filter(m=>m.support==='transfer')){
    const seen=new Set([f.members.indexOf(m)]),queue=[...seen];let anchored=false
    for(let i=0;i<queue.length;i++){
      const current=queue[i],member=f.members[current]
      if(primary.includes(member)||f.rule.bearer&&lower.some(n=>intersections(member.a,member.b,n.a,n.b).length)){anchored=true;break}
      for(const c of f.connections.filter(c=>c.members.includes(current)))for(const n of c.members)if(!seen.has(n)&&f.members[n].kind!=='bearer'){seen.add(n);queue.push(n)}
    }
    assert.ok(anchored,`${context}: each transfer section reaches a real pedestal through explicitly scheduled connections`)
    const contacts=f.members.filter(n=>n!==m&&n.kind!=='bearer').flatMap(n=>intersections(m.a,m.b,n.a,n.b)).sort((a,b)=>a-b)
    assert.ok(contacts.length,`${context}: transfer section has a physical contact`)
    for(let i=1;i<contacts.length;i++){actualPrimary=Math.max(actualPrimary,contacts[i]-contacts[i-1]);assert.ok(contacts[i]-contacts[i-1]<=f.rule.support+TOL)}
  }
  if (f.rule.bearer) for (const m of f.members.filter(m => m.kind === 'joist'&&m.support!=='transfer')) {
    const bearings = lower.flatMap(b => intersections(m.a, m.b, b.a, b.b)).sort((a, b) => a - b)
    assert.ok(bearings.length >= 1, `${context}: every secondary stock segment has a real bearer`)
    for (let i = 1; i < bearings.length; i++) {
      const span = bearings[i] - bearings[i - 1]
      const midpoint=at(m.a,m.b,(bearings[i]+bearings[i-1])/2/length(m.a,m.b))
      const continuous=lower.some(b=>edgeDistance(midpoint,b.a,b.b)<=TOL&&Math.abs(cross(minus(m.b,m.a),minus(b.b,b.a)))<1e-6*length(m.a,m.b)*length(b.a,b.b))
      if(!continuous)actualSecondary = Math.max(actualSecondary, span)
      assert.ok(continuous||span <= f.rule.bearerSpacing + TOL, `${context}: ${span} m secondary span exceeds ${f.rule.bearerSpacing}`)
    }
  }
  for (const m of f.members.filter(m => m.kind === 'noggin')) {
    assert.ok([m.a,m.b].some(q=>f.members.some(j=>j!==m&&j.kind!=='bearer'&&edgeDistance(q,j.a,j.b)<=TOL)), `${context}: blocking has an actual connected end; connection capacity remains provisional`)
  }
  if (f.rule.bearer) for (const m of f.members.filter(m => m.kind === 'rim'&&m.role!=='edge-rail')) {
    const run = length(m.a, m.b)
    const cuts = [0, run, ...primary.flatMap(b => intersections(m.a, m.b, b.a, b.b))].sort((a, b) => a - b)
    assert.ok(cuts.slice(1).every((end, i) => primary.some(b => edgeDistance(at(m.a, m.b, (cuts[i] + end) / 2 / run), b.a, b.b) <= TOL)), `${context}: upper perimeter rim has continuous lower-ring bearing`)
  }
  // Treat each axis-aligned upper member as its actual rectangular bearing
  // face. Stock segments may abut, and different directions may meet at a
  // connected/mitered junction; parallel faces may not occupy the same area.
  // This is intentionally a plain pairwise rectangle intersection, separate
  // from the solver's sorted-line clearance implementation.
  const face = (s.frameFaceWidth ?? 35) / 1000
  const upperMembers = f.members.filter(m => m.kind !== 'bearer')
  const faces = upperMembers.flatMap(m => {
    if (Math.abs(m.a.y - m.b.y) < 1e-8) return [{ direction: 'horizontal', x0: Math.min(m.a.x, m.b.x), x1: Math.max(m.a.x, m.b.x), y0: m.a.y - face / 2, y1: m.a.y + face / 2 }]
    if (Math.abs(m.a.x - m.b.x) < 1e-8) return [{ direction: 'vertical', x0: m.a.x - face / 2, x1: m.a.x + face / 2, y0: Math.min(m.a.y, m.b.y), y1: Math.max(m.a.y, m.b.y) }]
    return []
  })
  for (let i = 0; i < faces.length; i++) for (let j = 0; j < i; j++) if (faces[i].direction === faces[j].direction) {
    const xOverlap = Math.min(faces[i].x1, faces[j].x1) - Math.max(faces[i].x0, faces[j].x0)
    const yOverlap = Math.min(faces[i].y1, faces[j].y1) - Math.max(faces[i].y0, faces[j].y0)
    assert.ok(xOverlap <= TOL || yOverlap <= TOL, `${context}: upper parallel support faces ${i}/${j} overlap by ${xOverlap} × ${yOverlap} m`)
  }
  for (let i = 0; i < upperMembers.length; i++) for (let j = 0; j < i; j++) {
    const a = upperMembers[i], b = upperMembers[j], run = length(a.a, a.b)
    if (Math.abs(cross(minus(a.b, a.a), minus(b.b, b.a))) < 1e-10) continue
    for (const t of intersections(a.a, a.b, b.a, b.b)) {
      const q = at(a.a, a.b, t / run)
      assert.ok(t <= TOL || run - t <= TOL || length(q, b.a) <= TOL || length(q, b.b) <= TOL, `${context}: ${a.kind}/${b.kind} cross through both interiors at the same upper elevation`)
    }
  }
  assert.ok(Math.abs(actualPrimary - f.maxPrimarySpan) <= TOL, `${context}: displayed primary span matches independently measured span`)
  assert.ok(Math.abs(actualSecondary - f.maxSecondarySpan) <= TOL, `${context}: displayed secondary span ${f.maxSecondarySpan} matches independently measured ${actualSecondary}`)
  if (mustFit) assert.equal(f.geometryPass, true, `${context}: a complete supported arrangement should pass the audit: ${f.issues.join('; ')}`)
  return p
}

for (const [name, shape] of Object.entries(shapes)) test(`support geometry invariants: ${name}, all frame/load/run combinations`, () => {
  for (const frame of frames) for (const load of [3, 5] as const) for (const direction of ['horizontal', 'vertical'] as const) {
    assertSupportLayout(settings(shape, { frame, load, direction }), `${name}/${frame}/${load}/${direction}`, frame === 'big-small')
  }
})

test('reversed winding, extra near-collinear corners, negative translation and 31° rotation preserve physical support invariants', () => {
  const nearCollinear = polygon([[0, 0], [2.8, 0], [3.2, .000001], [6, 0], [6, 3.2], [0, 3.2]])
  const angle = 31 * Math.PI / 180
  const rotated = rectangle.map(q => ({ x: q.x * Math.cos(angle) - q.y * Math.sin(angle) - 5, y: q.x * Math.sin(angle) + q.y * Math.cos(angle) - 7 }))
  for (const [name, shape] of [['clockwise', [...shapes.hourglass].reverse()], ['near-collinear', nearCollinear], ['rotated', rotated]] as const) {
    for (const direction of ['horizontal', 'vertical'] as const) assertSupportLayout(settings([...shape], { frame: 'big-small', direction }), `${name}/${direction}`, true)
  }
})

test('stock lengths, base diameters and clearance permutations either fit without clashes or explicitly suppress infeasible layouts', () => {
  for (const frameStock of [.5, 1.2, 3.66, 4.88]) for (const pedestalDiameter of [50, 150, 250, 400, 600]) for (const pedestalClearance of [0, 25]) {
    assertSupportLayout(settings(shapes.trapezoid, { frame: 'big-small', frameStock, pedestalDiameter, pedestalClearance }), `stock${frameStock}/base${pedestalDiameter}/clearance${pedestalClearance}`)
  }
})

test('balanced breakers, staggered butt ends and frame-stock splices do not generate dense pedestal rows', () => {
  for (const frame of frames) for (const joints of ['breaker', 'butt'] as const) for (const frameStock of [1.2, 3.66]) {
    assertSupportLayout(settings(rectangle, { frame, joints, frameStock }), `${frame}/${joints}/stock${frameStock}`, frame === 'big-small')
  }
})

test('support generation is deterministic after direction, product and load changes', () => {
  const s = settings(shapes.hourglass, { frame: 'big-small' }), original = assertSupportLayout(s, 'deterministic original', true)
  planDeck({ ...s, direction: 'vertical', load: 5, pedestalDiameter: 200 })
  const restored = assertSupportLayout(s, 'deterministic restored', true)
  assert.deepEqual(restored.frame.members, original.frame.members)
  assert.deepEqual(restored.frame.pedestals, original.frame.pedestals)
})

test('physically impossible clearance never leaks an overlapping partial support layout', () => {
  // The board perimeter still fits, but a 600 mm base plus 300 mm edge
  // clearance cannot fit across the 0.8 m deck.
  const s = settings(polygon([[0, 0], [4, 0], [4, .8], [0, .8]]), { pedestalDiameter: 600, pedestalClearance: 300 })
  const p = assertSupportLayout(s, 'impossible base clearance')
  assert.equal((p.frame as typeof p.frame & { layoutStatus?: string }).layoutStatus, 'unbuildable')
  assert.equal(p.frame.pedestals.length, 0)
})

const comb = polygon([[0, 0], [8, 0], [8, 4], [7, 4], [7, 2], [6, 2], [6, 4], [5, 4], [5, 2], [4, 2], [4, 4], [3, 4], [3, 2], [2, 2], [2, 4], [1, 4], [1, 2], [0, 2]])
test('wide comb and C-shaped decks do not become infeasible when bearer phases approach repeated corners', () => {
  const cShape = polygon([[0, 0], [6, 0], [6, 1], [2, 1], [2, 3], [6, 3], [6, 4], [0, 4]])
  for (const [name, shape] of [['comb', comb], ['C', cShape]] as const) for (const load of [3, 5] as const) for (const direction of ['horizontal', 'vertical'] as const) {
    assertSupportLayout(settings([...shape], { frame: 'big-small', load, direction }), `${name}/${load}/${direction}`, true)
  }
})

for (const n of [3, 4, 5, 6, 8, 12, 16, 24, 32]) test(`wide convex ${n}-corner decks find collision-free rows across rotations`, () => {
  for (const degrees of [0, 7, 17, 31]) for (const load of [3, 5] as const) for (const direction of ['horizontal', 'vertical'] as const) {
    const phase = degrees * Math.PI / 180
    const shape = Array.from({ length: n }, (_, i) => ({ x: 3 + 3 * Math.cos(phase + i * 2 * Math.PI / n), y: 3 + 2.5 * Math.sin(phase + i * 2 * Math.PI / n) }))
    // A shallow triangular end can itself require a longer unbroken blank;
    // keep this matrix focused on supports while other polygons stress joints.
    const board = { ...DEFAULT_SETTINGS.board, stock: DEFAULT_SETTINGS.board.stock }
    assertSupportLayout(settings(shape, { frame: 'big-small', load, direction, board }), `convex${n}/phase${degrees}/${load}/${direction}`, true)
  }
})

test('narrow but buildable necks and short chamfers keep distinct real bearing nodes', () => {
  for (const neck of [.45, .5, .65]) for (const direction of ['horizontal', 'vertical'] as const) for (const load of [3, 5] as const) {
    const shape = polygon([[0, 0], [2.6, 1.2], [5.2, 0], [5.2, 2.478], [2.6, 1.2 + neck], [0, 2.478]])
    assertSupportLayout(settings(shape, { frame: 'big-small', load, direction }), `neck${neck}/${load}/${direction}`, true)
  }
  for (const corner of [.2, .3, .43, .75]) for (const direction of ['horizontal', 'vertical'] as const) for (const load of [3, 5] as const) {
    const shape = polygon([[0, corner], [corner, 0], [6 - corner, 0], [6, corner], [6, 4 - corner], [6 - corner, 4], [corner, 4], [0, 4 - corner]])
    assertSupportLayout(settings(shape, { frame: 'big-small', load, direction }), `chamfer${corner}/${load}/${direction}`, true)
  }
})

test('close manual breakers and dense staggered board joints do not add pedestal rows', () => {
  for (const frameStock of [.5, 1.2, 3.66]) for (const load of [3, 5] as const) {
    assertSupportLayout(settings(rectangle, { frame: 'big-small', load, frameStock, joints: 'breaker', breakerMode: 'manual', breakerPositions: [2.5, 2.696] }), `close breakers/${load}/stock${frameStock}`, true)
    for (const boardStock of [.3, .8, 1.83]) {
      assertSupportLayout(settings(rectangle, { frame: 'big-small', load, frameStock, board: { ...DEFAULT_SETTINGS.board, stock: boardStock } }), `dense butt joints/${load}/frame${frameStock}/board${boardStock}`, boardStock>1)
    }
  }
})

test('seeded irregular outlines preserve geometric invariants through product and stock permutations', () => {
  let state = 0x19d4c812
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000 }
  for (let seed = 0; seed < 48; seed++) {
    const count = 6 + seed % 7, phase = random() * Math.PI * 2
    const shape = Array.from({ length: count }, (_, i) => {
      const angle = phase + i * 2 * Math.PI / count, radius = 2.7 + random() * .6
      return { x: 4 + radius * Math.cos(angle), y: 4 + radius * Math.sin(angle) }
    })
    for (const frame of ['big', 'big-small'] as const) {
      const s = settings(shape, { frame, load: seed % 2 ? 3 : 5, direction: seed % 3 ? 'horizontal' : 'vertical', pedestalDiameter: [50, 100, 150][seed % 3], frameStock: [.5, 1.2, 4.88][seed % 3] })
      assertSupportLayout(s, `irregular seed${seed}/${frame}`)
    }
  }
})

test('150 mm bearing faces cannot be shown overlapping on 100 mm joist centres', () => {
  const s = settings(rectangle, { frame: 'big-small', joistSpacing: 100, frameFaceWidth: 150, board: { ...DEFAULT_SETTINGS.board, stock: 15 } })
  const p = assertSupportLayout(s, '150 mm faces / 100 mm centres')
  assert.equal(p.frame.layoutStatus, 'unbuildable')
  assert.equal(p.frame.members.length, 0)
  assert.equal(p.frame.pedestals.length, 0)
  assert.ok(p.frame.issues.some(issue => /upper support faces overlap/i.test(issue)))
})

test('breaker ladders split at intermediate joists when selected centres are narrower than the breaker bay', () => {
  const p = assertSupportLayout(settings(rectangle, { frame: 'big-small', joistSpacing: 100, joints: 'breaker' }), '100 mm centres / breaker ladders', true)
  assert.ok(p.frame.members.some(m => m.kind === 'noggin'))
})

test('shallow triangular edges allow angled tapered cuts in the selected stock', () => {
  const phase = 31 * Math.PI / 180
  const shape = Array.from({ length: 3 }, (_, i) => ({ x: 3 + 3 * Math.cos(phase + i * 2 * Math.PI / 3), y: 3 + 2.5 * Math.sin(phase + i * 2 * Math.PI / 3) }))
  const s = settings(shape, { frame: 'big-small', direction: 'horizontal', allowRipping: false })
  const tapered = assertSupportLayout(s, '31 degree triangle / tapered 3.66 m cuts', true)
  assert.ok(tapered.boards.fit.taperedPieces > 0)
  assertSupportLayout({ ...s, board: { ...s.board, stock: 4.88 } }, '31 degree triangle / 4.88 m stock', true)
})
