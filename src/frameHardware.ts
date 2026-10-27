import type { Member, Point } from './planner.ts'

export const ALUMINIUM_BUTT_GAP=.002
export const PEDESTAL_COLUMN_DIAMETER=.110
export const HARDWARE_RATES={continuousJoiners:'1.68',joistJoiners:'1.20',perpendicularJoiners:'1.20'}
export type FrameConnection={id:string;kind:'butt'|'perpendicular';point:Point;axis:Point;members:number[];tier:'joist'|'bearer';size:number}
type FrameInput={members:Member[];geometryPass:boolean;rule:{bearer:number}}
const tolerance=.00002
const pointKey=(p:Point)=>`${Math.round(p.x/tolerance)},${Math.round(p.y/tolerance)}`
const length=(m:Member)=>Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)
const tier=(m:Member)=>m.kind==='bearer'?'bearer':'joist'

// Connections are derived from real member ends, including split collectors and
// manually edited members. A crossing between stacked tiers is not a joiner.
function calculateHardware(frame:FrameInput,faceWidth:number){
  const connections:FrameConnection[]=[],trims=frame.members.map(()=>({a:0,b:0}))
  if(!frame.geometryPass)return {connections,trims,continuousJoiners:0,joistJoiners:0,perpendicularJoiners:0}
  const ends=new Map<string,{member:number;end:'a'|'b';point:Point;axis:Point}[]>()
  frame.members.forEach((m,member)=>{
    const l=length(m);if(l<tolerance)return
    for(const end of ['a','b'] as const){const p=m[end],other=m[end==='a'?'b':'a'],key=pointKey(p),bucket=ends.get(key)??[];bucket.push({member,end,point:p,axis:{x:(other.x-p.x)/l,y:(other.y-p.y)/l}});ends.set(key,bucket)}
  })
  const buttEnds=new Set<string>()
  for(const bucket of ends.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){
    const a=bucket[i],b=bucket[j],m=frame.members[a.member],n=frame.members[b.member]
    if(tier(m)!==tier(n)||m.size!==n.size||a.axis.x*b.axis.x+a.axis.y*b.axis.y>-.999999)continue
    if(buttEnds.has(`${a.member}:${a.end}`)||buttEnds.has(`${b.member}:${b.end}`))continue
    connections.push({id:`butt-${a.member}-${b.member}`,kind:'butt',point:a.point,axis:a.axis,members:[a.member,b.member],tier:tier(m),size:m.size})
    for(const e of [a,b]){trims[e.member][e.end]=ALUMINIUM_BUTT_GAP/2;buttEnds.add(`${e.member}:${e.end}`)}
  }
  // Spatial buckets keep endpoint-to-face queries bounded on large projects.
  const cell=.5,cells=new Map<string,number[]>(),margin=faceWidth/2000+tolerance
  frame.members.forEach((m,i)=>{
    for(let x=Math.floor((Math.min(m.a.x,m.b.x)-margin)/cell);x<=Math.floor((Math.max(m.a.x,m.b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(m.a.y,m.b.y)-margin)/cell);y<=Math.floor((Math.max(m.a.y,m.b.y)+margin)/cell);y++){
      const key=`${x},${y}`,bucket=cells.get(key)??[];bucket.push(i);cells.set(key,bucket)
    }
  })
  const perpendicularKeys=new Set<string>()
  for(const bucket of ends.values())for(const end of bucket){
    if(buttEnds.has(`${end.member}:${end.end}`))continue
    const m=frame.members[end.member],p=end.point
    for(const i of cells.get(`${Math.floor(p.x/cell)},${Math.floor(p.y/cell)}`)??[]){
      const n=frame.members[i],l=length(n);if(i===end.member||tier(m)!==tier(n)||l<tolerance)continue
      const axis={x:(n.b.x-n.a.x)/l,y:(n.b.y-n.a.y)/l}
      if(Math.abs(end.axis.x*axis.x+end.axis.y*axis.y)>.0001)continue
      const t=(p.x-n.a.x)*axis.x+(p.y-n.a.y)*axis.y
      if(t < -tolerance||t>l+tolerance||Math.abs((p.x-n.a.x)*axis.y-(p.y-n.a.y)*axis.x)>margin)continue
      // A split receiving rail still needs only one connector at this end.
      const receivingEnd=Math.hypot(p.x-n.a.x,p.y-n.a.y)<tolerance?'a':Math.hypot(p.x-n.b.x,p.y-n.b.y)<tolerance?'b':null
      const key=receivingEnd&&!buttEnds.has(`${i}:${receivingEnd}`)?`${pointKey(p)}:${Math.min(end.member,i)}:${Math.max(end.member,i)}`:`${pointKey(p)}:${end.axis.x.toFixed(4)},${end.axis.y.toFixed(4)}:${tier(m)}`
      if(perpendicularKeys.has(key))continue
      perpendicularKeys.add(key)
      connections.push({id:`perpendicular-${end.member}-${end.end}`,kind:'perpendicular',point:p,axis:end.axis,members:[end.member,i],tier:tier(m),size:m.size})
      break
    }
  }
  const continuousJoiners=connections.filter(c=>c.kind==='butt').length
  return {connections,trims,continuousJoiners,joistJoiners:continuousJoiners*2,perpendicularJoiners:connections.length-continuousJoiners}
}

const hardwareCache=new WeakMap<FrameInput,Map<number,ReturnType<typeof calculateHardware>>>()
export function frameHardware(frame:FrameInput,faceWidth=35){
  let cached=hardwareCache.get(frame);if(!cached){cached=new Map();hardwareCache.set(frame,cached)}
  let hardware=cached.get(faceWidth);if(!hardware){hardware=calculateHardware(frame,faceWidth);cached.set(faceWidth,hardware)}
  return hardware
}

export function renderedMember(m:Member,trim:{a:number;b:number}):Member{
  const l=length(m);if(l<tolerance)return m
  const a=Math.min(trim.a,l/4),b=Math.min(trim.b,l/4),x=(m.b.x-m.a.x)/l,y=(m.b.y-m.a.y)/l
  return {...m,a:{x:m.a.x+x*a,y:m.a.y+y*a},b:{x:m.b.x-x*b,y:m.b.y-y*b}}
}
