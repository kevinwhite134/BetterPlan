import type { Member, Point, Settings } from './planner.ts'
import { boundaryDistance, pointInside, pointSegmentDistance } from './deckGeometry.ts'
import { segmentBearings } from './supportLayout.ts'
import { subtractIntervals } from './shapeGeometry.ts'

const E=1e-7,T=1e-5
const length=(m:{a:Point;b:Point})=>Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)
const at=(m:{a:Point;b:Point},t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t,y:m.a.y+(m.b.y-m.a.y)*t})
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const unique=(ns:number[])=>[...new Set(ns.map(n=>Math.round(n*1e7)/1e7))].sort((a,b)=>a-b)
export type PlacementDiagnostic={member:Member;memberIndex:number;reason:'boundary'|'collision'|'projection'|'span'|'stock';edgeClear:[number,number][];available:[number,number][];trialBases:Point[];detail:string}
function legalIntervals(m:Member,rings:Point[][],radius:number,valid:(p:Point)=>boolean):[number,number][]{
  const l=length(m);if(!Number.isFinite(l)||l<E)return []
  const ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l,events=[0,l]
  const add=(t:number)=>{if(t>=-E&&t<=l+E)events.push(Math.max(0,Math.min(l,t)))}
  // A circular foot is clear of a finite edge outside that edge's capsule:
  // two offset sides and circular end caps. Mitred polygon offsets omit valid
  // corner pockets and do not provide all the transitions along a member.
  for(const ring of rings)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,edgeLength=Math.hypot(dx,dy)
    for(const q of [a,b]){
      const x=q.x-m.a.x,y=q.y-m.a.y,t=x*ux+y*uy,perpendicular=x*uy-y*ux,disc=radius*radius-perpendicular*perpendicular
      if(disc>=-1e-12){const half=Math.sqrt(Math.max(0,disc));add(t-half);add(t+half)}
    }
    if(edgeLength<E)continue
    const vx=dx/edgeLength,vy=dy/edgeLength,nx=-vy,ny=vx,start=(m.a.x-a.x)*nx+(m.a.y-a.y)*ny,slope=ux*nx+uy*ny
    if(Math.abs(slope)<1e-12)continue
    for(const side of [-radius,radius]){
      const t=(side-start)/slope,along=(m.a.x+ux*t-a.x)*vx+(m.a.y+uy*t-a.y)*vy
      if(along>=-E&&along<=edgeLength+E)add(t)
    }
  }
  const cuts=unique(events),out:[number,number][]=[]
  for(let i=1;i<cuts.length;i++){
    let a=cuts[i-1],b=cuts[i];if(!valid(at(m,(a+b)/2/l)))continue
    if(!valid(at(m,a/l)))a+=3e-6;if(!valid(at(m,b/l)))b-=3e-6
    if(b>=a&&valid(at(m,a/l))&&valid(at(m,b/l)))out.push([a,b])
  }
  // A just-fitting circular base may have a single tangent position rather
  // than a nonzero interval. Keep it, without merging distinct nearby bases.
  for(const t of cuts)if(valid(at(m,t/l))&&!out.some(([a,b])=>t>=a-E&&t<=b+E))out.push([t,t])
  const merged:[number,number][]=[]
  for(const range of out.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&range[0]<=last[1]+E)last[1]=Math.max(last[1],range[1]);else merged.push(range)}
  return merged
}
export function placePrimary(raw:Member[],p:Point[],holes:Point[][],s:Settings,rule:{support:number}){
  const diameter=(s.pedestalDiameter??150)/1000,baseInset=diameter/2+(s.pedestalClearance??0)/1000
  const valid=(q:Point)=>pointInside(p,q)&&boundaryDistance(p,q)>=baseInset-T&&holes.every(h=>!pointInside(h,q)&&boundaryDistance(h,q)>=baseInset-T)
  const allowed=raw.map(m=>legalIntervals(m,[p,...holes],baseInset,valid)),limit=Math.min(rule.support,s.frameStock)-3e-6
  let failure='A primary member has no collision-free support positions inside the outline.',conflicts:Point[]=[]
  let diagnostic:PlacementDiagnostic|undefined
  const orders=[raw.map((_,i)=>i),raw.map((_,i)=>i).reverse(),raw.map((_,i)=>i).sort((a,b)=>length(raw[a])-length(raw[b]))]
  for(const phase of [0,.25,.5,.75,1])for(const order of orders){
    const pedestals:Point[]=[],cells=new Map<string,Point[]>(),members:Member[]=[],splices:Point[]=[];let failed=false
    const add=(q:Point)=>{
      const x=Math.floor(q.x),y=Math.floor(q.y)
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if((cells.get(`${x+dx},${y+dy}`)??[]).some(p=>distance(p,q)<1e-6))return
      pedestals.push(q);const k=`${x},${y}`,a=cells.get(k);if(a)a.push(q);else cells.set(k,[q])
    }
    for(const i of order){const m=raw[i],l=length(m),ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l
      const neighbours:Point[]=[];for(let x=Math.floor(Math.min(m.a.x,m.b.x)-diameter);x<=Math.floor(Math.max(m.a.x,m.b.x)+diameter);x++)for(let y=Math.floor(Math.min(m.a.y,m.b.y)-diameter);y<=Math.floor(Math.max(m.a.y,m.b.y)+diameter);y++)neighbours.push(...cells.get(`${x},${y}`)??[])
      const forbidden:[number,number][]=[]
      for(const q of neighbours){const dx=q.x-m.a.x,dy=q.y-m.a.y,t=dx*ux+dy*uy,d2=Math.max(0,dx*dx+dy*dy-t*t)
        if(d2<(diameter+3e-6)**2){const half=Math.sqrt((diameter+3e-6)**2-d2);forbidden.push([t-half,t+half])}}
      let intervals=subtractIntervals(allowed[i],forbidden)
      // An existing base at an exact member intersection is one real shared
      // bearing, not two colliding bases. Its head/connector remains provisional.
      const shared=neighbours.filter(q=>pointSegmentDistance(q,m.a,m.b)<1e-6).map(q=>(q.x-m.a.x)*ux+(q.y-m.a.y)*uy)
      intervals=[...intervals,...shared.map(t=>[t,t] as [number,number])].sort((a,b)=>a[0]-b[0])
      const cap=(m.size===80?s.joistOverhang80:s.joistOverhang35)
      // A configured supplier limit constrains the search itself, as well as
      // the final audit. Unknown limits do not become an invented allowance.
      const maxProjection=cap===undefined?s.frameStock:cap/1000
      const record=(reason:PlacementDiagnostic['reason'],detail:string)=>{diagnostic={member:m,memberIndex:i,reason,edgeClear:allowed[i],available:intervals,trialBases:neighbours,detail}}
      const preferred=(i%2?phase:phase/2)*diameter
      const first=intervals.flatMap(([a,b])=>Math.max(a,preferred)<=Math.min(b,maxProjection)+T?[Math.max(a,preferred)]:[])[0]
      if(first===undefined){
        // A phase offset is a search preference, not a customer-entered end
        // limit. Preserve the actual earlier constraint when only that phase
        // exhausted a short member's otherwise valid start range.
        if(!intervals.some(([a])=>a<=maxProjection+T))record(!allowed[i].length?'boundary':!intervals.length?'collision':'projection',!allowed[i].length?'The full pedestal base plus extra edge clearance cannot fit anywhere along this member.':!intervals.length?'Other trial pedestal bases block every edge-clear position on this member.':'No available position satisfies the entered start-projection or stock limit.')
        failed=true;conflicts=[m.a,m.b];break
      }
      const last=intervals.filter(([a])=>a<=l+E).at(-1)?.[1]
      if(last===undefined||l-last>maxProjection+T){record('projection','The end of this member cannot reach an available base within the entered projection limit.');failed=true;conflicts=[m.a,m.b];break}
      const nodes=[Math.max(0,first)];let cursor=nodes[0]
      while(last-cursor>limit+T){const candidates=intervals.map(([,b])=>Math.min(b,cursor+limit)).filter((t,j)=>t>=intervals[j][0]-E&&t>cursor+diameter-T)
        const next=candidates.at(-1);if(next===undefined){failed=true;break}nodes.push(next);cursor=next
      }
      if(failed){record('span','A gap between available support positions exceeds the report span or available stock length.');conflicts=[m.a,m.b];break}
      if(last-cursor>=diameter-T)nodes.push(last)
      else if(l-cursor>maxProjection+T){
        if(nodes.length===1){
          // A short member cannot fit two full bases. Its one base can still
          // slide to satisfy both terminal projections; the first greedy
          // position is not a fixed bearing requirement.
          const target=intervals.flatMap(([a,b])=>{const lo=Math.max(a,l-maxProjection),hi=Math.min(b,maxProjection);return lo<=hi+E?[lo]:[]})[0]
          if(target===undefined){record('projection','One base cannot satisfy both end-projection limits, and two full bases cannot fit.');failed=true;conflicts=[m.a,m.b];break}nodes[0]=target
        }else{
          const previous=nodes[nodes.length-2],target=last-diameter-3e-6
          if(last-previous<=limit+T)nodes[nodes.length-1]=last
          else if(target-previous>=diameter+E&&target-previous<=limit+T&&intervals.some(([a,b])=>target>=a-E&&target<=b+E)){nodes[nodes.length-1]=target;nodes.push(last)}
          else{record('span','The final pair of bases cannot satisfy both circular clearance and the report span.');failed=true;conflicts=[m.a,m.b];break}
        }
      }
      // Stock joints only at these real bearing nodes; terminal projections
      // are retained as measured projections, never silently cut off.
      let start=0
      while(l-start>s.frameStock+T){const end=nodes.filter(t=>t>start+T&&t<=start+s.frameStock+E).at(-1)
        if(end===undefined){failed=true;break}members.push({...m,a:at(m,start/l),b:at(m,end/l)});splices.push(at(m,end/l));start=end
      }
      if(failed){record('stock','No actual pedestal can carry the required stock splice within the selected aluminium stock length.');conflicts=[m.a,m.b];failure='A primary stock splice cannot be placed on an actual pedestal within the entered stock length.';break}
      members.push({...m,a:at(m,start/l)});for(const t of nodes)add(at(m,t/l))
    }
    if(!failed)return {members,pedestals,splices,conflicts:[] as Point[],error:'',placementDiagnostics:[] as PlacementDiagnostic[]}
  }
  const repair=reflowSupports(raw,allowed,s,rule.support)
  if(repair)return {...repair,conflicts:[] as Point[],error:'',placementDiagnostics:[] as PlacementDiagnostic[]}
  return {members:[] as Member[],pedestals:[] as Point[],splices:[] as Point[],conflicts,placementDiagnostics:diagnostic?[diagnostic]:[],error:failure+' Sliding and staggering along the supporting members did not find a complete arrangement within the span, stock and clearance limits. Review the marked area or try a bearer + joist frame.'}
}

export function pedestalBaseIntervals(raw:Member[],p:Point[],holes:Point[][],s:Settings){
  const inset=(s.pedestalDiameter??150)/2000+(s.pedestalClearance??0)/1000
  const valid=(q:Point)=>pointInside(p,q)&&boundaryDistance(p,q)>=inset-T&&holes.every(h=>!pointInside(h,q)&&boundaryDistance(h,q)>=inset-T)
  return raw.map(m=>legalIntervals(m,[p,...holes],inset,valid))
}

type Placement={members:Member[];pedestals:Point[];splices:Point[]}
function reflowSupports(raw:Member[],allowed:[number,number][][],s:Settings,support:number):Placement|null{
  if(allowed.some(a=>!a.length))return null
  const diameter=(s.pedestalDiameter??150)/1000,clear=diameter+3e-6,limit=Math.min(support,s.frameStock)-3e-6
  if(limit<diameter-T)return null
  const cells=new Map<string,number[]>(),adjacent=raw.map(()=>new Set<number>())
  raw.forEach((m,i)=>{
    const candidates=new Set<number>()
    for(let x=Math.floor(Math.min(m.a.x,m.b.x)-clear);x<=Math.floor(Math.max(m.a.x,m.b.x)+clear);x++)for(let y=Math.floor(Math.min(m.a.y,m.b.y)-clear);y<=Math.floor(Math.max(m.a.y,m.b.y)+clear);y++){
      const key=`${x},${y}`,bucket=cells.get(key)??[];for(const j of bucket)candidates.add(j)
      bucket.push(i);cells.set(key,bucket)
    }
    for(const j of candidates){const n=raw[j]
      if(segmentBearings(m,[n]).length||Math.min(pointSegmentDistance(m.a,n.a,n.b),pointSegmentDistance(m.b,n.a,n.b),pointSegmentDistance(n.a,m.a,m.b),pointSegmentDistance(n.b,m.a,m.b))<clear){adjacent[i].add(j);adjacent[j].add(i)}
    }
  })
  // These are exact physical joints, not sampled offsets. A small T-junction
  // may only have room for one shared base; a 1 mm near miss still gives two
  // overlapping bases. Seed the real joint before exploring coarse phases.
  const junctions=raw.map((m,i)=>unique(segmentBearings(m,[...adjacent[i]].map(j=>raw[j]))).filter(t=>allowed[i].some(([a,b])=>t>=a-E&&t<=b+E)))
  const components:number[][]=[],seen=new Set<number>()
  for(let i=0;i<raw.length;i++)if(!seen.has(i)){const group=[i];seen.add(i);for(let k=0;k<group.length;k++)for(const j of adjacent[group[k]])if(!seen.has(j)){seen.add(j);group.push(j)}components.push(group)}
  const result:Placement={members:[],pedestals:[],splices:[]}
  for(const component of components){
    if(component.length>128)return null
    const shortest=[...component].sort((a,b)=>allowed[a].reduce((n,[lo,hi])=>n+hi-lo,0)-allowed[b].reduce((n,[lo,hi])=>n+hi-lo,0)||a-b)
    const crowded=[...component].sort((a,b)=>adjacent[b].size-adjacent[a].size||length(raw[a])-length(raw[b])||a-b)
    let solved:Placement|null=null
    for(const order of [shortest,crowded,component,[...component].reverse()]){
      const bases:Point[]=[],choices=new Map<number,{members:Member[];splices:Point[]}>();let budget=1000
      const search=(depth:number):boolean=>{
        if(depth===order.length)return true
        if(--budget<0)return false
        const i=order[depth],m=raw[i],l=length(m),ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l
        const nearby=bases.filter(q=>pointSegmentDistance(q,m.a,m.b)<clear),forbidden:[number,number][]=[]
        for(const q of nearby){const dx=q.x-m.a.x,dy=q.y-m.a.y,t=dx*ux+dy*uy,d2=Math.max(0,dx*dx+dy*dy-t*t),half=Math.sqrt(Math.max(0,clear*clear-d2));forbidden.push([t-half,t+half])}
        const shared=nearby.filter(q=>pointSegmentDistance(q,m.a,m.b)<1e-6).map(q=>(q.x-m.a.x)*ux+(q.y-m.a.y)*uy)
        const intervals=[...subtractIntervals(allowed[i],forbidden),...shared.map(t=>[t,t] as [number,number])].sort((a,b)=>a[0]-b[0])
        const cap=(m.size===80?s.joistOverhang80:s.joistOverhang35),projection=cap===undefined?s.frameStock:cap/1000
        for(const nodes of slidingPaths(intervals,l,diameter,limit,projection,junctions[i])){
          const cuts=cutAtBases(m,nodes,s.frameStock);if(!cuts)continue
          const oldLength=bases.length
          for(const t of nodes){const q=at(m,t/l);if(!bases.some(p=>distance(p,q)<1e-6))bases.push(q)}
          choices.set(i,cuts)
          if(search(depth+1))return true
          choices.delete(i);bases.length=oldLength
          if(budget<0)break
        }
        return false
      }
      if(search(0)){solved={members:component.flatMap(i=>choices.get(i)!.members),pedestals:bases,splices:component.flatMap(i=>choices.get(i)!.splices)};break}
    }
    if(!solved)return null
    result.members.push(...solved.members);result.pedestals.push(...solved.pedestals);result.splices.push(...solved.splices)
  }
  return result
}

// Move earlier rows as well as later ones. Both end positions and the interior
// pitch vary; stock joints are recut on the resulting real bearing nodes.
function* slidingPaths(intervals:[number,number][],l:number,diameter:number,limit:number,projection:number,junctions:number[]=[]){
  if(!intervals.length)return
  const offsets=unique([0,.25,.5,.75,1,1.5,2,3].map(n=>Math.min(n*diameter,limit/2))),seen=new Set<string>()
  for(const nodes of anchoredPaths(intervals,l,diameter,limit,projection,junctions)){
    const key=nodes.map(n=>n.toFixed(6)).join(',');if(seen.has(key))continue;seen.add(key);yield nodes
  }
  for(const shift of offsets)for(const endShift of offsets)for(const pitch of [limit,Math.max(diameter+3e-6,limit-diameter/2)]){
    const first=intervals.flatMap(([a,b])=>Math.max(a,shift)<=Math.min(b,projection)+T?[Math.max(a,shift)]:[])[0]
    const last=intervals.map(([,b])=>Math.min(b,l-endShift)).filter((b,i)=>b>=intervals[i][0]-E).at(-1)
    if(first===undefined||last===undefined||last<first-T||l-last>projection+T)continue
    const nodes=[first];let cursor=first,failed=false
    while(last-cursor>limit+T){
      const next=intervals.map(([,b])=>Math.min(b,cursor+pitch,last)).filter((t,i)=>t>=intervals[i][0]-E&&t>cursor+diameter+E).at(-1)
      if(next===undefined){failed=true;break}nodes.push(next);cursor=next
    }
    if(failed)continue
    if(last-cursor>=diameter+E)nodes.push(last)
    if(nodes.length<2&&l>limit+T)continue
    if(l-nodes.at(-1)!>projection+T)continue
    const key=nodes.map(n=>n.toFixed(6)).join(',');if(seen.has(key))continue;seen.add(key)
    yield nodes
  }
}
function* anchoredPaths(intervals:[number,number][],l:number,diameter:number,limit:number,projection:number,junctions:number[]){
  const grow=(anchor:number,ranges:[number,number][],pitch:number)=>{
    const target=ranges.at(-1)![1],nodes=[anchor];let cursor=anchor
    while(target-cursor>limit+T){
      const next=ranges.map(([,b])=>Math.min(b,cursor+pitch,target)).filter((t,i)=>t>=ranges[i][0]-E&&t>cursor+diameter+E).at(-1)
      if(next===undefined)return null
      nodes.push(next);cursor=next
    }
    if(target-cursor>=diameter+E)nodes.push(target)
    if(l-nodes.at(-1)!>projection+T)return null
    return nodes
  }
  const mirrored=intervals.map(([a,b])=>[l-b,l-a] as [number,number]).reverse()
  for(const anchor of junctions){
    if(!intervals.some(([a,b])=>anchor>=a-E&&anchor<=b+E))continue
    for(const pitch of [limit,Math.max(diameter+3e-6,limit-diameter/2)]){
      const left=grow(l-anchor,mirrored,pitch),right=grow(anchor,intervals,pitch)
      if(!left||!right)continue
      const nodes=[...left.slice(1).reverse().map(t=>l-t),...right]
      if(nodes[0]>projection+T||l-nodes.at(-1)!>projection+T)continue
      yield nodes
    }
  }
}
function cutAtBases(m:Member,nodes:number[],stock:number){
  const l=length(m),members:Member[]=[],splices:Point[]=[];let start=0
  while(l-start>stock+T){const end=nodes.filter(t=>t>start+T&&t<=start+stock+E).at(-1)
    if(end===undefined)return null
    const point=at(m,end/l);members.push({...m,a:at(m,start/l),b:point});splices.push(point);start=end
  }
  members.push({...m,a:at(m,start/l)})
  return {members,splices}
}
