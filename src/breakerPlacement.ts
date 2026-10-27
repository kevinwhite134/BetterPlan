import { boardLayout, bounds, normalize } from './planner.ts'
import type { Settings } from './planner.ts'
import { boardInfillPolygon } from './perimeterEdges.ts'
import { moveBreaker } from './editorGeometry.ts'
import { breakerStripWidth } from './breakerWidth.ts'

const EPS=1e-7
const millimetre=(x:number)=>Math.round(x*1000)/1000
export function breakerSpace(s:Settings){
  if(![s.board.width,s.board.gap,s.board.endGap,s.board.stock].every(Number.isFinite)||s.board.width<=0||s.board.gap<0||s.board.endGap<0||s.board.stock<=0)throw new Error('Enter valid board dimensions before positioning breakers.')
  const physical=normalize(s.polygon),outer=s.direction==='vertical'?physical.map(p=>({x:p.y,y:p.x})):physical
  const inner=boardInfillPolygon(s),left=Math.min(...inner.map(p=>p.x)),right=Math.max(...inner.map(p=>p.x)),top=Math.min(...inner.map(p=>p.y)),width=breakerStripWidth(s),gap=s.board.endGap/1000
  const min=Math.ceil((left+width/2+gap+.05-EPS)*1000)/1000,max=Math.floor((right-width/2-gap-.05+EPS)*1000)/1000,separation=Math.ceil((width+2*gap+.05-EPS)*1000)/1000
  return {inner,local:inner.map(p=>({x:p.x-left,y:p.y-top})),left,right,min,max,separation,run:bounds(outer).width,capacity:max<min?0:Math.min(100,Math.floor((max-min+EPS)/separation)+1)}
}
export function validBreakerPlacement(s:Settings,positions:number[]){
  try{
    if(positions.length>100||positions.some(x=>!Number.isFinite(x)))return false
    const space=breakerSpace(s)
    boardLayout(space.local,{...s,joints:'breaker',breakerMode:'manual',breakerPositions:positions.map(x=>x-space.left)})
    return true
  }catch{return false}
}
export function fitBreakerPositions(s:Settings,positions:number[],fixedCount=false):number[]{
  if(validBreakerPlacement(s,positions))return [...positions]
  const space=breakerSpace(s)
  if(positions.length<=space.capacity){
    const sorted=positions.filter(Number.isFinite).toSorted((a,b)=>a-b)
    const fitted=sorted.map((x,i)=>millimetre(Math.max(space.min+i*space.separation,Math.min(space.max-(sorted.length-i-1)*space.separation,x))))
    for(let i=1;i<fitted.length;i++)fitted[i]=millimetre(Math.max(fitted[i],fitted[i-1]+space.separation))
    if(validBreakerPlacement(s,fitted))return fitted
  }
  if(fixedCount){
    const equal=spaceBoundedBreakers(s,positions.length)
    if(equal.length===positions.length&&validBreakerPlacement(s,equal))return equal
    throw new Error('The chosen breaker count cannot fit the current outline and stock length. Change the count or stock length in Breaker layout.')
  }
  const balanced=boardLayout(space.local,{...s,joints:'breaker',breakerMode:'balanced'})
  const fitted=balanced.breakers.map(x=>x+space.left)
  if(validBreakerPlacement(s,fitted))return fitted
  throw new Error('The selected board product cannot fit a breaker and the required edge clearances inside this outline.')
}
export function keepBreakersInBounds(s:Settings):Settings{
  if(s.joints!=='breaker'||s.breakerMode!=='manual')return s
  try{
    const positions=fitBreakerPositions(s,s.breakerPositions??[],s.breakerCount!==undefined)
    return JSON.stringify(positions)===JSON.stringify(s.breakerPositions??[])?s:{...s,breakerPositions:positions,edgeDetailConfirmed:false}
  }catch{return s}
}
// A draft drag must follow the pointer even when its adjacent bay exceeds
// stock. Only the outline and neighbouring guides constrain this preview;
// the board solver explains the invalid bay and prevents applying that draft.
export function dragBreakerWithinOutline(s:Settings,positions:number[],index:number,requested:number,mirror:boolean):number[]{
  if(!Number.isFinite(requested)||index<0||index>=positions.length)return [...positions]
  const space=breakerSpace(s),original=positions[index]
  let lo=space.min,hi=space.max
  if(mirror){lo=Math.max(lo,space.run-space.max);hi=Math.min(hi,space.run-space.min)}
  for(const p of positions.filter((_,i)=>i!==index)){
    if(mirror&&Math.abs(p-(space.run-original))<.002)continue
    if(p<original)lo=Math.max(lo,p+space.separation);else if(p>original)hi=Math.min(hi,p-space.separation)
  }
  if(lo>hi)return [...positions]
  const next=moveBreaker(positions,index,millimetre(Math.max(lo,Math.min(hi,requested))),space.run,mirror)
  return next.length===positions.length?next:[...positions]
}
export function moveBoundedBreaker(s:Settings,positions:number[],index:number,requested:number,mirror:boolean):number[]{
  if(!Number.isFinite(requested)||index<0||index>=positions.length)return [...positions]
  const space=breakerSpace(s),original=positions[index]
  let lo=space.min,hi=space.max
  if(mirror){lo=Math.max(lo,space.run-space.max);hi=Math.min(hi,space.run-space.min)}
  if(lo>hi)return [...positions]
  for(const p of positions.filter((_,i)=>i!==index)){
    if(mirror&&Math.abs(p-(space.run-original))<.002)continue
    if(p<original)lo=Math.max(lo,p+space.separation);else if(p>original)hi=Math.min(hi,p-space.separation)
  }
  if(lo>hi)return [...positions]
  const x=millimetre(Math.max(lo,Math.min(hi,requested))),candidate=(value:number)=>moveBreaker(positions,index,value,space.run,mirror)
  const target=candidate(x)
  if(s.breakerCount!==undefined&&target.length!==s.breakerCount)return [...positions]
  if(validBreakerPlacement(s,target))return target
  if(!validBreakerPlacement(s,positions)){try{return fitBreakerPositions(s,positions,s.breakerCount!==undefined)}catch{return [...positions]}}
  // Find a safe position approaching the requested edit; stock-length and
  // shaped-cut constraints remain authoritative throughout a drag.
  let safe=original,blocked=x
  for(let i=0;i<18;i++){
    const mid=millimetre((safe+blocked)/2);if(mid===safe||mid===blocked)break
    if(validBreakerPlacement(s,candidate(mid)))safe=mid;else blocked=mid
  }
  const result=candidate(safe)
  return validBreakerPlacement(s,result)?result:[...positions]
}
export function addBoundedBreaker(s:Settings,positions:number[],mirror:boolean){
  const space=breakerSpace(s)
  if(positions.length>=space.capacity)return [...positions]
  const sorted=[space.min-space.separation,...positions.toSorted((a,b)=>a-b),space.max+space.separation]
  const candidates=sorted.slice(1).map((right,i)=>({x:millimetre((sorted[i]+right)/2),room:right-sorted[i]})).sort((a,b)=>b.room-a.room)
  for(const candidate of candidates){
    const next=[...positions,candidate.x]
    if(mirror&&!next.some(p=>Math.abs(p-(space.run-candidate.x))<.002))next.push(millimetre(space.run-candidate.x))
    if(validBreakerPlacement(s,next))return next
  }
  return [...positions]
}

export function spaceBoundedBreakers(s:Settings,count:number):number[]{
  const space=breakerSpace(s)
  if(!Number.isInteger(count)||count<0||count>space.capacity)return []
  const occupied=breakerStripWidth(s)+2*s.board.endGap/1000,bay=(space.right-space.left-count*occupied)/(count+1)
  return Array.from({length:count},(_,i)=>space.left+(i+1)*bay+i*occupied+occupied/2)
}
