import type { Member, Plan, Point, Settings } from './planner.ts'
import { boardLayoutKey } from './boardLayoutState.ts'
import { supportLayoutIsCurrent, supportOutlineKey } from './supportLayoutState.ts'
import { pointSegmentDistance } from './deckGeometry.ts'
import { pedestalBaseIntervals } from './pedestalPlacement.ts'
import type { PlacementDiagnostic } from './pedestalPlacement.ts'
import { subtractIntervals } from './shapeGeometry.ts'

export type EditedSupports=NonNullable<Settings['supportLayout']>
export const physicalSupportPoint=(q:Point,s:Settings)=>s.direction==='vertical'?{x:q.y,y:q.x}:{...q}
export function editableSupports(plan:Plan,s:Settings):EditedSupports{
  if(s.supportLayout&&supportLayoutIsCurrent(s))return {...structuredClone(s.supportLayout),outlineKey:supportOutlineKey(s)}
  const frame=plan.frame,source=frame.geometryPass?frame:frame.diagnostic
  return {version:1,outlineKey:supportOutlineKey(s),boardLayout:{key:boardLayoutKey(s),...plan.boards.resolvedLayout},members:source.members.map(m=>({...m,a:physicalSupportPoint(m.a,s),b:physicalSupportPoint(m.b,s)})),pedestals:source.pedestals.map(q=>physicalSupportPoint(q,s))}
}
export function nearestSupport(q:Point,members:Member[]):{point:Point;index:number;distance:number}|null{
  let best:{point:Point;index:number;distance:number}|null=null
  members.forEach((m,index)=>{const dx=m.b.x-m.a.x,dy=m.b.y-m.a.y,l=dx*dx+dy*dy;if(l<1e-12)return;const t=Math.max(0,Math.min(1,((q.x-m.a.x)*dx+(q.y-m.a.y)*dy)/l)),point={x:m.a.x+dx*t,y:m.a.y+dy*t},distance=Math.hypot(point.x-q.x,point.y-q.y);if(!best||distance<best.distance)best={point,index,distance}})
  return best
}
export function memberPlacementDiagnostic(m:Member,index:number,p:Point[],holes:Point[][],s:Settings,bases:Point[]):PlacementDiagnostic{
  const l=Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y),edgeClear=pedestalBaseIntervals([m],p,holes,s)[0],diameter=(s.pedestalDiameter??150)/1000,forbidden:[number,number][]=[]
  if(l>1e-8)for(const q of bases){const dx=q.x-m.a.x,dy=q.y-m.a.y,t=(dx*(m.b.x-m.a.x)+dy*(m.b.y-m.a.y))/l,d2=dx*dx+dy*dy-t*t;if(d2<diameter*diameter){const half=Math.sqrt(Math.max(0,diameter*diameter-d2));forbidden.push([t-half,t+half])}}
  const available=subtractIntervals(edgeClear,forbidden),reason=edgeClear.length?'collision':'boundary'
  return {member:m,memberIndex:index,reason,edgeClear,available,trialBases:bases.filter(q=>pointSegmentDistance(q,m.a,m.b)<diameter),detail:edgeClear.length?'Green ranges fit the boundary; amber ranges are occupied by other full bases. Span, stock and projection checks still apply.':'No position fits the full pedestal base plus the selected extra edge clearance.'}
}
