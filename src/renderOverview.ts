import type { Plan } from './planner.ts'

export const isLargePreview=(plan:Plan)=>plan.boards.pieces.length+plan.frame.members.length+plan.frame.pedestals.length>2000
const sample=<T>(items:T[],limit:number):T[]=>items.length<=limit?items:Array.from({length:limit},(_,i)=>items[Math.round(i*(items.length-1)/(limit-1))])

// Thumbnails are navigation aids. Main drawings and exports always use the
// complete model; bounded samples avoid rebuilding it five times per update.
export function thumbnailPlan(plan:Plan):Plan{
  if(!isLargePreview(plan))return plan
  return {...plan,boards:{...plan.boards,pieces:sample(plan.boards.pieces,100)},frame:{...plan.frame,members:sample(plan.frame.members,72),pedestals:sample(plan.frame.pedestals,20)}}
}
