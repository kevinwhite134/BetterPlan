import type { Point } from './planner.ts'
import type { EditedSupports } from './supportEditing.ts'
export type SupportItem={kind:'member'|'pedestal';index:number}
export const supportItemKey=(item:SupportItem)=>`${item.kind}-${item.index}`
export function supportItemCentre(draft:EditedSupports,item:SupportItem):Point{
  if(item.kind==='pedestal')return draft.pedestals[item.index]
  const m=draft.members[item.index];return {x:(m.a.x+m.b.x)/2,y:(m.a.y+m.b.y)/2}
}
export function translateSupportGroup(draft:EditedSupports,items:SupportItem[],delta:Point):EditedSupports{
  const selected=new Set(items.map(supportItemKey)),move=(p:Point)=>({x:p.x+delta.x,y:p.y+delta.y})
  return {...draft,members:draft.members.map((m,i)=>selected.has(`member-${i}`)?{...m,a:move(m.a),b:move(m.b)}:m),pedestals:draft.pedestals.map((p,i)=>selected.has(`pedestal-${i}`)?move(p):p)}
}
export function arrangeSupportGroup(draft:EditedSupports,items:SupportItem[],axis:'x'|'y',mode:'align'|'distribute'|'spacing',spacing=0):EditedSupports{
  if(items.length<2)return draft
  const ordered=[...items].sort((a,b)=>supportItemCentre(draft,a)[axis]-supportItemCentre(draft,b)[axis]),start=supportItemCentre(draft,ordered[0])[axis],end=supportItemCentre(draft,ordered.at(-1)!)[axis]
  return ordered.reduce((next,item,i)=>{const target=mode==='align'?supportItemCentre(draft,items[0])[axis]:start+i*(mode==='spacing'?spacing:(end-start)/(items.length-1));return translateSupportGroup(next,[item],{x:axis==='x'?target-supportItemCentre(draft,item).x:0,y:axis==='y'?target-supportItemCentre(draft,item).y:0})},draft)
}
export function supportItemsInBox(draft:EditedSupports,a:Point,b:Point){
  const inside=(p:Point)=>p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y)
  return [...draft.members.flatMap((m,index)=>inside(m.a)&&inside(m.b)?[{kind:'member' as const,index}]:[]),...draft.pedestals.flatMap((p,index)=>inside(p)?[{kind:'pedestal' as const,index}]:[])]
}
