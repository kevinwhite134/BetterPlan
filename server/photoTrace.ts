import { photoOutlineCoordinates, parseOutlineCoordinates } from '../src/outlineCoordinates.ts'
import { bounds, distance, polygonError } from '../src/planner.ts'
import type { Point } from '../src/planner.ts'
import { MAX_OUTLINE_POINTS, MAX_PROJECT_SIZE } from '../src/projectLimits.ts'

// The model traces positions and reads labels; code performs the unit conversion.
// Positions must share ONE drawing scale for both axes (pixels for aligned plans).
export function traceOutlineCoordinates(value: unknown) {
  const trace = value as { vertices?: Point[]; measurements?: { from: number; to: number; kind: 'distance' | 'horizontal' | 'vertical'; metres: number }[]; estimated_width_metres?: number | null } | null
  const points = trace?.vertices
  if (!Array.isArray(points) || points.length < 3 || points.length > MAX_OUTLINE_POINTS || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7)) throw new Error('The AI could not trace the deck corners. Try a clearer image showing the whole perimeter.')
  const box = bounds(points), extent = Math.max(box.width, box.depth)
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y))
  if (!(box.width > 0 && box.depth > 0)) throw new Error('The AI could not identify a closed deck outline. Try another image.')
  // Check topology at a neutral scale, independently of the model's drawing units.
  const neutral = points.map(p => ({ x: (p.x - minX) / extent * 10, y: (p.y - minY) / extent * 10 }))
  if (polygonError(neutral, .000001, .000001)) throw new Error('The AI could not trace one continuous deck boundary. Try a clearer image showing all corners.')
  if (!Array.isArray(trace?.measurements) || trace.measurements.length > MAX_OUTLINE_POINTS) throw new Error('The AI returned unreadable dimension references. Please try another image.')
  const references = trace.measurements.map(m => {
    if (!m || !Number.isInteger(m.from) || !Number.isInteger(m.to) || m.from < 0 || m.to < 0 || m.from >= points.length || m.to >= points.length || m.from === m.to || !Number.isFinite(m.metres) || m.metres <= 0) throw new Error('The AI returned an invalid dimension reference. Please try another image.')
    const a = points[m.from], b = points[m.to]
    const units = m.kind === 'distance' ? distance(a, b) : m.kind === 'horizontal' ? Math.abs(a.x - b.x) : m.kind === 'vertical' ? Math.abs(a.y - b.y) : NaN
    if (!Number.isFinite(units) || units <= extent * 1e-6) throw new Error('The AI could not match a dimension to the deck outline. Please try another image.')
    return { units, metres: m.metres, scale: m.metres / units }
  })
  let scale: number
  if (references.length) {
    const scales = references.map(r => r.scale).sort((a, b) => a - b), middle = Math.floor(scales.length / 2)
    scale = scales.length % 2 ? scales[middle] : (scales[middle - 1] + scales[middle]) / 2
    // A valid polygon alone cannot catch a lost recess or an edge length used as X.
    // All readable reference dimensions must agree with the traced geometry.
    if (references.some(r => Math.abs(r.units * scale - r.metres) / r.metres > .15)) throw new Error('The traced shape does not match the visible dimensions. Try a clearer plan or photograph.')
  } else {
    const width = trace?.estimated_width_metres
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0 || width > MAX_PROJECT_SIZE) throw new Error('The AI could not estimate the deck size. Try another photograph.')
    scale = width / box.width
  }
  let coordinates: string
  try { coordinates = photoOutlineCoordinates(points.map(p => ({ x: (p.x - minX) * scale, y: (p.y - minY) * scale }))) }
  catch { throw new Error('The AI could not produce a usable deck outline. Try a clearer image showing the whole perimeter.') }
  return { coordinates, accuracy: references.length ? 'Scale-derived' : 'Estimated', ...bounds(parseOutlineCoordinates(coordinates)) }
}
