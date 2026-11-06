import { normalize, polygonError } from './planner.ts'
import type { Point } from './planner.ts'
import { MAX_OUTLINE_POINTS } from './projectLimits.ts'

// Keep manual entry and photo output on the same BEV text format and validator.
export function parseOutlineCoordinates(text: string): Point[] {
  return text.trim().split(/\n/).map(line => {
    const pair = line.trim().split(/[,\s]+/)
    return { x: pair.length === 2 ? Number(pair[0]) : NaN, y: pair.length === 2 ? Number(pair[1]) : NaN }
  })
}

export function photoOutlineCoordinates(value: unknown): string {
  if (!Array.isArray(value) || value.length > MAX_OUTLINE_POINTS + 1 || value.some(p => !p || typeof p.x !== 'number' || typeof p.y !== 'number')) {
    throw new Error('The AI returned invalid corners. Try a clearer photograph.')
  }
  let points: Point[] = value.map(p => ({ x: p.x, y: p.y }))
  const first = points[0], last = points.at(-1)
  if (points.length > 3 && first.x === last?.x && first.y === last.y) points = points.slice(0, -1)
  const issue = polygonError(points)
  if (issue) throw new Error(`The AI outline is invalid: ${issue}`)
  // Translate only: never rotate, reflect or reorder the model's perimeter.
  const text = normalize(points).map(p => `${Number(p.x.toFixed(3))}, ${Number(p.y.toFixed(3))}`).join('\n')
  const roundedIssue = polygonError(parseOutlineCoordinates(text))
  if (roundedIssue) throw new Error(`The AI outline is invalid: ${roundedIssue}`)
  return text
}
