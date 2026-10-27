import type { Member, Piece, Point, Settings } from './planner.ts'
import { boundaryDistance, insetPolygon, pointInside, pointSegmentDistance, signedArea } from './deckGeometry.ts'
import { memberCrossesOpening, subtractIntervals } from './shapeGeometry.ts'
import { breakerBoardCount, breakerStripWidth, breakerRailOffset } from './breakerWidth.ts'

// The solver works on centre lines. Distinct bearing nodes are never merged to
// hide a collision. One exact junction is one physical bearing/head location.
const E=1e-7, TOL=1e-5
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const along=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
// Intersections computed by scanning and offsetting can differ below one
// micrometre. Coalesce only that numerical noise, never real nearby bearings.
const uniquePoints=(points:Point[])=>{
  const cells=new Map<string,Point[]>(),result:Point[]=[],epsilon=1e-6
  for(const q of points){const x=Math.floor(q.x/epsilon),y=Math.floor(q.y/epsilon)
    let same=false
    for(let dx=-1;dx<=1&&!same;dx++)for(let dy=-1;dy<=1&&!same;dy++)same=(cells.get(`${x+dx},${y+dy}`)??[]).some(p=>dist(p,q)<=epsilon)
    if(same)continue
    const cell=`${x},${y}`;cells.set(cell,[...cells.get(cell)??[],q]);result.push(q)
  }
  return result
}
const values=(ns:number[])=>[...new Set(ns.map(n=>Math.round(n*1e7)/1e7))].sort((a,b)=>a-b)
const on=(q:Point,m:Member)=>pointSegmentDistance(q,m.a,m.b)<TOL
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
type Rule={joist:number;bearer:number;support:number;bearerSpacing:number;pages:string;sheet:string}
type Boards={pieces:Piece[];breakers:number[];perimeterSplices?:{point:Point;horizontal:boolean}[]}

// Candidate queries only; all final geometric predicates and tolerances stay
// unchanged. Long projects avoid comparing every bearing with every member.
function memberIndex(members:Member[],padding=TOL){
  const cells=new Map<string,Member[]>(),cell=1
  for(const m of members)for(let x=Math.floor((Math.min(m.a.x,m.b.x)-padding)/cell);x<=Math.floor((Math.max(m.a.x,m.b.x)+padding)/cell);x++)for(let y=Math.floor((Math.min(m.a.y,m.b.y)-padding)/cell);y<=Math.floor((Math.max(m.a.y,m.b.y)+padding)/cell);y++){
    const key=`${x},${y}`,list=cells.get(key);if(list)list.push(m);else cells.set(key,[m])
  }
  return {
    at:(q:Point)=>cells.get(`${Math.floor(q.x/cell)},${Math.floor(q.y/cell)}`)??[],
    along:(m:Member)=>{
      const found=new Set<Member>()
      for(let x=Math.floor((Math.min(m.a.x,m.b.x)-padding)/cell);x<=Math.floor((Math.max(m.a.x,m.b.x)+padding)/cell);x++)for(let y=Math.floor((Math.min(m.a.y,m.b.y)-padding)/cell);y<=Math.floor((Math.max(m.a.y,m.b.y)+padding)/cell);y++)for(const candidate of cells.get(`${x},${y}`)??[])found.add(candidate)
      return [...found]
    },
  }
}
function pointIndex(points:Point[]){
  const cells=new Map<string,Point[]>()
  for(const q of points){const key=`${Math.floor(q.x)},${Math.floor(q.y)}`,list=cells.get(key);if(list)list.push(q);else cells.set(key,[q])}
  return (m:Member)=>{
    const found:Point[]=[]
    for(let x=Math.floor(Math.min(m.a.x,m.b.x)-TOL);x<=Math.floor(Math.max(m.a.x,m.b.x)+TOL);x++)for(let y=Math.floor(Math.min(m.a.y,m.b.y)-TOL);y<=Math.floor(Math.max(m.a.y,m.b.y)+TOL);y++)found.push(...cells.get(`${x},${y}`)??[])
    return found
  }
}

function breakerJointRows(boards:Boards,x:number,width:number,gap:number):number[]{
  const pieces=boards.pieces.filter(q=>{
    if(q.kind!=='breaker')return false
    const xs=q.outline?.map(p=>p.x)||[q.x,q.x+q.width]
    return Math.min(...xs)>=x-width/2-TOL&&Math.max(...xs)<=x+width/2+TOL
  }),ys:number[]=[]
  for(const a of pieces)for(const b of pieces){
    if(a===b||Math.abs(b.y-(a.y+a.length)-gap)>TOL)continue
    const end=(q:Piece,y:number)=>{const outline=q.outline||[];return outline.filter(p=>Math.abs(p.y-y)<TOL).map(p=>p.x)}
    const ax=end(a,a.y+a.length),bx=end(b,b.y)
    if(ax.length>1&&bx.length>1&&Math.min(Math.max(...ax),Math.max(...bx))-Math.max(Math.min(...ax),Math.min(...bx))>E)ys.push((a.y+a.length+b.y)/2)
  }
  return values(ys)
}

export function segmentBearings(m:Member,primary:Member[]):number[]{
  const d={x:m.b.x-m.a.x,y:m.b.y-m.a.y},length=dist(m.a,m.b),result:number[]=[]
  for(const b of primary){
    // Endpoint tolerances are in metres, independent of short segment length.
    if(on(m.a,b))result.push(0)
    if(on(m.b,b))result.push(length)
    const v={x:b.b.x-b.a.x,y:b.b.y-b.a.y},delta={x:b.a.x-m.a.x,y:b.a.y-m.a.y},den=cross(d,v)
    if(Math.abs(den)<E){
      for(const q of [b.a,b.b])if(on(q,m))result.push(((q.x-m.a.x)*d.x+(q.y-m.a.y)*d.y)/length)
      continue
    }
    const t=cross(delta,v)/den,u=cross(delta,d)/den
    if(t>=-E&&t<=1+E&&u>=-E&&u<=1+E)result.push(Math.max(0,Math.min(1,t))*length)
  }
  return values(result)
}

function cleanRing(input:Point[]):Point[]{
  let p=input.map(q=>({...q})),changed=true
  while(changed&&p.length>3){changed=false;p=p.filter((q,i)=>{
    const a=p[(i+p.length-1)%p.length],b=p[(i+1)%p.length]
    if(pointSegmentDistance(q,a,b)<1e-6){changed=true;return false}return true
  })}
  if(signedArea(p)<0)p.reverse()
  const first=p.reduce((best,q,i)=>q.x<p[best].x-E||(Math.abs(q.x-p[best].x)<E&&q.y<p[best].y)?i:best,0)
  return [...p.slice(first),...p.slice(0,first)]
}
function scanLine(p:Point[],n:number,vertical=false):[number,number][]{
  const q=vertical?p.map(v=>({x:v.y,y:v.x})):p,xs:number[]=[],edges:[number,number][]=[]
  for(let i=0;i<q.length;i++){
    const a=q[i],b=q[(i+1)%q.length]
    if(Math.abs(a.y-b.y)<E){if(Math.abs(n-a.y)<E)edges.push([Math.min(a.x,b.x),Math.max(a.x,b.x)]);continue}
    if((a.y<=n&&b.y>n)||(b.y<=n&&a.y>n))xs.push(a.x+(n-a.y)*(b.x-a.x)/(b.y-a.y))
  }
  xs.sort((a,b)=>a-b)
  for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>E)edges.push([xs[i],xs[i+1]])
  edges.sort((a,b)=>a[0]-b[0]);const out:[number,number][]=[]
  for(const [a,b] of edges){const last=out.at(-1);if(last&&a<=last[1]+E)last[1]=Math.max(last[1],b);else out.push([a,b])}return out
}
function evenly(a:number,b:number,limit:number):number[]{const n=Math.max(1,Math.ceil((b-a)/limit-E));return Array.from({length:n+1},(_,i)=>a+(b-a)*i/n)}

// A trimmed sloping perimeter is itself a board support. Check the actual
// cross-sections, including the thin region after the last full joist, rather
// than forcing a joist through every perimeter vertex's X coordinate.
function crossRunSupportGap(footprint:Point[],holes:Point[][],members:Member[],skip:(a:number,b:number)=>boolean){
  const levels=values([...footprint,...holes.flat(),...members.flatMap(m=>[m.a,m.b])].map(q=>q.y))
  const ys=values([...levels,...levels.slice(1).map((y,i)=>(levels[i]+y)/2)])
  let maximum=0
  for(const y of ys)for(const [a,b] of subtractIntervals(scanLine(footprint,y),holes.flatMap(h=>scanLine(h,y)))){
    const supports=values([a,b,...members.filter(m=>Math.abs(m.a.x-m.b.x)<E&&y>=Math.min(m.a.y,m.b.y)-E&&y<=Math.max(m.a.y,m.b.y)+E&&m.a.x>=a-E&&m.a.x<=b+E).map(m=>m.a.x)])
    for(let i=1;i<supports.length;i++)if(!skip(supports[i-1],supports[i]))maximum=Math.max(maximum,supports[i]-supports[i-1])
  }
  return maximum
}

// Fill a primary interval with the fewest reachable supports. Subtract the
// actual circular exclusion intervals of every existing base from this line.
function fillSpan(a:Point,b:Point,supports:Point[],diameter:number,limit:number):boolean{
  const length=dist(a,b),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,forbidden:[number,number][]=[]
  const separation=diameter+2e-6
  for(const q of supports){const dx=q.x-a.x,dy=q.y-a.y,t=dx*ux+dy*uy,d2=dx*dx+dy*dy-t*t
    if(d2<separation*separation){const half=Math.sqrt(Math.max(0,separation*separation-d2));forbidden.push([t-half,t+half])}}
  let current=0
  for(let count=0;length-current>limit+E;count++){
    if(count>1000)return false
    let next=Math.min(length,current+limit-2e-7),moved=true
    while(moved){moved=false;for(const [lo,hi] of forbidden)if(next>lo+E&&next<hi-E){next=lo-2e-7;moved=true}}
    if(next<current+separation-E)return false
    supports.push({x:a.x+ux*next,y:a.y+uy*next});current=next
  }
  return true
}
function firstCollision(points:Point[],diameter:number):[Point,Point]|undefined{
  // Spatial buckets also keep large outlines responsive.
  const cells=new Map<string,Point[]>()
  for(const q of points){const x=Math.floor(q.x/diameter),y=Math.floor(q.y/diameter)
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const p of cells.get(`${x+dx},${y+dy}`)||[])if(dist(p,q)<diameter-TOL)return [p,q]
    const k=`${x},${y}`;cells.set(k,[...(cells.get(k)||[]),q])
  }
}
function upperFaceConflict(members:Member[],face:number):Point[]|undefined{
  const upper=members.filter(m=>m.kind==='joist'||m.kind==='rim'||m.kind==='noggin')
  for(const axis of ['x','y'] as const){
    const run=axis==='x'?'y':'x',lines=upper.filter(m=>Math.abs(m.a[axis]-m.b[axis])<E).sort((a,b)=>a.a[axis]-b.a[axis])
    for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length&&lines[j].a[axis]-lines[i].a[axis]<face-TOL;j++){
      const a=lines[i],b=lines[j],lo=Math.max(Math.min(a.a[run],a.b[run]),Math.min(b.a[run],b.b[run])),hi=Math.min(Math.max(a.a[run],a.b[run]),Math.max(b.a[run],b.b[run]))
      if(hi-lo>TOL)return [{...a.a,[run]:(lo+hi)/2},{...b.a,[run]:(lo+hi)/2}]
    }
  }
}
function supportPrimary(raw:Member[],diameter:number,limit:number,stock:number){
  const supports=uniquePoints(raw.flatMap(m=>[m.a,m.b])),fixedCollision=firstCollision(supports,diameter)
  if(fixedCollision)return {error:`Required bearing nodes are only ${Math.round(dist(...fixedCollision)*1000)} mm apart for ${Math.round(diameter*1000)} mm bases.`,conflicts:fixedCollision}
  const fixedPoints=pointIndex(supports)
  const spans=raw.flatMap(m=>{
    const nodes=fixedPoints(m).filter(q=>on(q,m)).sort((a,b)=>dist(m.a,a)-dist(m.a,b))
    return nodes.slice(1).map((b,i)=>({a:nodes[i],b}))
  })
  for(const span of spans)if(!fillSpan(span.a,span.b,supports,diameter,Math.min(limit,stock)))return {error:'There is no collision-free position for a required intermediate support within the selected span and stock limits.',conflicts:[span.a,span.b]}
  const collision=firstCollision(supports,diameter)
  if(collision)return {error:'Required support bases cannot be separated in this local area.',conflicts:collision}
  const members:Member[]=[],splices:Point[]=[],allPoints=pointIndex(supports)
  for(const m of raw){
    const nodes=uniquePoints(allPoints(m).filter(q=>on(q,m))).sort((a,b)=>dist(m.a,a)-dist(m.a,b));let cursor=0
    while(cursor<nodes.length-1){let end=cursor+1;while(end+1<nodes.length&&dist(nodes[cursor],nodes[end+1])<=stock+E)end++
      if(dist(nodes[cursor],nodes[end])>stock+TOL)return {error:'A primary stock splice has no feasible bearing.',conflicts:[nodes[cursor],nodes[end]]}
      members.push({...m,a:nodes[cursor],b:nodes[end]});if(end<nodes.length-1)splices.push(nodes[end]);cursor=end
    }
  }
  return {members,supports,splices}
}

export function layoutSupports(p:Point[],s:Settings,boards:Boards,rule:Rule){
  const base=((s.pedestalDiameter??150)/2+(s.pedestalClearance??0))/1000,joint=s.board.width/1000+s.board.gap/2000
  const allowance=Math.max(0,((s.frameFaceWidth??35)/2-(s.boardEndBearing??10)-s.board.gap/2)/1000)
  // Select a usable trim position, not merely a minimum base setback. The same
  // finite face has a small legal range between the two board products; search
  // that range before asking for a local detail at a neck or internal corner.
  const offsets=[joint+allowance/2,joint,joint+allowance,joint-allowance/2,joint-allowance].map(n=>Math.max(base,n))
  let best:ReturnType<typeof solveAtOffset>|undefined
  for(const offset of [...new Set(offsets)]){
    const result=solveAtOffset(p,s,boards,rule,offset)
    if(result.geometryPass)return result
    if(!best||(result.layoutStatus==='ready'&&best.layoutStatus!=='ready')||result.issues.length<best.issues.length)best=result
  }
  return best!
}
function solveAtOffset(p:Point[],s:Settings,boards:Boards,rule:Rule,setback:number){
  const diameter=(s.pedestalDiameter??150)/1000,radius=diameter/2,clearance=(s.pedestalClearance??0)/1000,baseInset=radius+clearance
  const face=(s.frameFaceWidth??35)/1000,bearing=(s.boardEndBearing??10)/1000,joint=s.board.width/1000+s.board.gap/2000
  const withinBreaker=(a:number,b:number)=>boards.breakers.some(x=>a>=x-breakerRailOffset(s)-E&&b<=x+breakerRailOffset(s)+E)
  const nogginLimit=Math.min(.4,rule.support,s.frameStock)
  const directEdgeTrim=!rule.bearer&&p.some((a,i)=>{const b=p[(i+1)%p.length];return Math.abs(a.x-b.x)>E&&Math.abs(a.y-b.y)>E})
  // One bearing face straddles the picture-frame / infill installation gap.
  // Heights in the report are deliberately NOT used as assumed face widths.
  const bearingAllowance=face/2-bearing-s.board.gap/2000
  let rimOuter:Point[]=[],rimInner:Point[]=[]
  if((rule.bearer||directEdgeTrim)&&face/2>=bearing)try{
    // The upper ring has joined, mitred corners, not disconnected round-ended
    // line capsules. Offset bands describe its usable bearing face there.
    rimOuter=insetPolygon(cleanRing(p),setback-(face/2-bearing))
    rimInner=insetPolygon(cleanRing(p),setback+(face/2-bearing))
  }catch{/* Extremely tight offsets retain the conservative segment audit. */}
  const holes=(s.cutouts??[]).map(h=>cleanRing(h.polygon)),holeRims:Point[][]=[],holeBands:{outer:Point[];inner:Point[]}[]=[]
  let holeOffsetError=''
  try{for(const h of holes){holeRims.push(cleanRing(insetPolygon(h,-setback)));holeBands.push({outer:insetPolygon(h,-(setback+face/2-bearing)),inner:insetPolygon(h,-(setback-(face/2-bearing)))})}}catch{holeOffsetError='A cutout trim frame cannot fit this boundary. Simplify the cutout or increase the space around it.'}
  const rimBorne=(q:Point)=>rimOuter.length>0&&rimInner.length>0&&pointInside(rimOuter,q)&&(!pointInside(rimInner,q)||boundaryDistance(rimInner,q)<TOL)||holeBands.some(b=>pointInside(b.outer,q)&&(!pointInside(b.inner,q)||boundaryDistance(b.inner,q)<TOL))
  const scanDeck=(ring:Point[],n:number,vertical=false)=>subtractIntervals(scanLine(ring,n,vertical),holeRims.flatMap(h=>scanLine(h,n,vertical)))
  const issues:string[]=[],members:Member[]=[],pedestals:Point[]=[],splices:Point[]=[],conflicts:Point[]=[]
  let draftPrimary:Member[]=[]
  let footprint:Point[]=[],layoutStatus:'ready'|'unbuildable'='unbuildable'
  try{footprint=cleanRing(insetPolygon(cleanRing(p),setback))}catch(error){issues.push(error instanceof Error?error.message:'Pedestal bases do not fit this outline.')}
  if(holeOffsetError)issues.push(holeOffsetError)
  if(!rule.bearer&&holes.some(h=>h.some((a,i)=>{const b=h[(i+1)%h.length];return Math.abs(a.x-b.x)>E&&Math.abs(a.y-b.y)>E})))issues.push('Angled or curved cutouts need a bearer + joist frame. Direct-joist openings currently support square corners, with a pedestal-supported trim on every side.')
  if(holeRims.some(h=>h.some(q=>!pointInside(footprint,q))))issues.push('There is too little room between a cutout trim frame and the outside frame. Move or reduce the cutout.')
  if(bearingAllowance<-E||Math.abs(setback-joint)>bearingAllowance+E)issues.push('The entered frame bearing face cannot support both the picture-frame board and infill ends at this base setback. Use a wider face, smaller base, wider perimeter product or a supplier-designed edge arrangement.')
  if(footprint.length&&!issues.length){
    const minX=Math.min(...footprint.map(q=>q.x)),maxX=Math.max(...footprint.map(q=>q.x)),minY=Math.min(...footprint.map(q=>q.y)),maxY=Math.max(...footprint.map(q=>q.y)),w=s.board.width/1000,eg=s.board.endGap/1000
    const ring:Member[]=[footprint,...holeRims].flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length],kind:'bearer' as const,size:rule.bearer})))
    // A sloping cut end is supported by the perimeter frame, not a new global
    // column. Two ends at a butt joint share its centre support line.
    const inner=insetPolygon(cleanRing(p),w+s.board.gap/1000),jointEnds:{x:number;row:number;left:boolean}[]=[]
    for(const piece of boards.pieces.filter(q=>q.kind==='infill')){
      const outline=piece.outline||[]
      for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],mid=along(a,b,.5)
        if([.1,.3,.5,.7,.9].every(t=>rimBorne(along(a,b,t))))continue
        if(Math.abs(a.x-b.x)<E&&dist(a,b)>E&&boundaryDistance(inner,mid)>TOL)jointEnds.push({x:mid.x,row:piece.row,left:Math.abs(mid.x-piece.x)<TOL})}
    }
    const breakerJoints=new Map(boards.breakers.map(x=>[x,breakerJointRows(boards,x,breakerStripWidth(s),eg)]))
    const jointColumns:number[]=[],usedEnds=new Set<number>();let buttFaceTooNarrow=[...breakerJoints.values()].some(ys=>ys.length>0)&&face<eg+2*bearing-E
    const jointEndIndex=new Map<string,number[]>()
    jointEnds.forEach((end,i)=>{const key=`${end.row}|${end.left}|${Math.floor(end.x/TOL)}`,list=jointEndIndex.get(key);if(list)list.push(i);else jointEndIndex.set(key,[i])})
    jointEnds.forEach((end,i)=>{if(usedEnds.has(i))return
      let j=-1
      for(const target of [end.x-eg,end.x+eg])for(let dx=-1;dx<=1;dx++)for(const k of jointEndIndex.get(`${end.row}|${!end.left}|${Math.floor(target/TOL)+dx}`)??[]){
        if(k!==i&&!usedEnds.has(k)&&Math.abs(Math.abs(jointEnds[k].x-end.x)-eg)<TOL&&(j<0||k<j))j=k
      }
      if(j>=0){jointColumns.push((end.x+jointEnds[j].x)/2);usedEnds.add(j);if(face<eg+2*bearing-E)buttFaceTooNarrow=true}else jointColumns.push(end.x)
      usedEnds.add(i)
    })
    // Inside corners have fixed upper rim rails too. Fill between those real
    // rails instead of laying a global grid beside them and finding a clash
    // afterwards. A required joint rail can share a rim only within the actual
    // spare bearing width, including the gap between opposing board ends.
    const edgeColumns=values(ring.filter(m=>Math.abs(m.a.x-m.b.x)<TOL).map(m=>m.a.x))
    const rimColumns=rule.bearer?edgeColumns:[]
    const snapAllowance=Math.max(0,Math.min(bearingAllowance,face/2-bearing-eg/2))
    const supportX=(x:number)=>{const near=rimColumns.filter(v=>Math.abs(v-x)<=snapAllowance+E).sort((a,b)=>Math.abs(a-x)-Math.abs(b-x));return near[0]??x}
    const breakerRails=new Map(boards.breakers.map(x=>[x,[supportX(x-breakerRailOffset(s)),supportX(x+breakerRailOffset(s))]]))
    // Re-entrant square board ends require a real joist on the corresponding
    // vertical edge, even when there is no lower bearer/perimeter ring.
    const mandatory=values([minX,maxX,...edgeColumns,...(directEdgeTrim?footprint.map(q=>q.x):[]),...holeRims.flatMap(h=>[Math.min(...h.map(q=>q.x)),Math.max(...h.map(q=>q.x))]),...[...breakerRails.values()].flat(),...jointColumns.map(supportX)].filter(x=>x>=minX-E&&x<=maxX+E))
    // Across a direct-frame breaker bay the boards run the other way: the
    // transverse ladder supports them at the selected centres. Do not insert
    // unnecessary primary columns just to satisfy the infill's perpendicular
    // spacing; those columns would require additional colliding tip bases.
    const xs=values(mandatory.flatMap((x,i)=>i?evenly(mandatory[i-1],x,!rule.bearer&&withinBreaker(mandatory[i-1],x)?nogginLimit:s.joistSpacing/1000):[x]))
    const joistsAt=(columns:number[]):Member[]=>columns.flatMap(x=>{
      let intervals=scanDeck(footprint,x,true)
      for(const m of (rule.bearer||directEdgeTrim?ring:holeRims.flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length]})))).filter(m=>Math.abs(m.a.x-x)<TOL&&Math.abs(m.b.x-x)<TOL)){
        const lo=Math.min(m.a.y,m.b.y),hi=Math.max(m.a.y,m.b.y)
        intervals=intervals.flatMap(([a,b])=>b<=lo+E||a>=hi-E?[[a,b] as [number,number]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([u,v])=>v-u>E) as [number,number][])
      }
      return intervals.map(([a,b])=>({a:{x,y:a},b:{x,y:b},kind:'joist' as const,size:rule.joist}))
    })
    let rawJoists=joistsAt(xs)
    let solved:ReturnType<typeof supportPrimary>|undefined,rawPrimary:Member[]=[],failure='No base arrangement fits the entered geometry.'
    if(buttFaceTooNarrow){failure=`The ${Math.round(face*1000)} mm frame face is too narrow for a ${s.board.endGap} mm butt gap plus ${Math.round(bearing*1000)} mm bearing on each board end. Enter the actual wider joint-support product or change the joint details.`}
    else if(rule.bearer){
      const limit=Math.min(rule.bearerSpacing,s.frameStock),cells=Math.max(1,Math.ceil((maxY-minY)/limit-E))
      // Search the phase of a restrained regular grid. Extra rows are only
      // considered to create enough room around corners, never per joist tip.
      const rowAt=(y:number,trim=false):Member[]=>{
        let intervals=scanDeck(footprint,y)
        // A row exactly through a corner is allowed. Remove any coincident
        // horizontal ring portion so there is still only one physical beam.
        for(const m of ring.filter(m=>Math.abs(m.a.y-y)<E&&Math.abs(m.b.y-y)<E)){
          const lo=Math.min(m.a.x,m.b.x),hi=Math.max(m.a.x,m.b.x)
          intervals=intervals.flatMap(([a,b])=>b<=lo+E||a>=hi-E?[[a,b] as [number,number]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([x1,x2])=>x2-x1>E) as [number,number][])
        }
        if(trim)intervals=intervals.flatMap(([a,b])=>{const columns=xs.filter(x=>x>=a-E&&x<=b+E);return columns.length>1?[[columns[0],columns.at(-1)!] as [number,number]]:[]})
        return intervals.map(([a,b])=>({a:{x:a,y},b:{x:b,y},kind:'bearer',size:rule.bearer}))
      }
      const secondaryFits=(candidate:Member[])=>rawJoists.every(m=>{
        const ts=segmentBearings(m,candidate),length=dist(m.a,m.b)
        return ts.length>0&&ts[0]<TOL&&length-ts.at(-1)!<TOL&&ts.slice(1).every((t,i)=>t-ts[i]<=limit+TOL)
      })
      search:for(const trim of [false,true])for(let n=cells;n<=cells+4;n++){
        const step=(maxY-minY)/n;if(n>1&&step<diameter+TOL)break
        const slack=Math.min(step*.45,Math.max(0,limit-step-1e-6)),shifts=[0,...Array.from({length:20},(_,i)=>slack*(i%2?-1:1)*(Math.floor(i/2)+1)/10)]
        for(const shift of shifts){
          const ys=Array.from({length:n-1},(_,i)=>minY+(i+1)*step+shift)
          const rows:Member[]=ys.flatMap(y=>rowAt(y,trim))
          const candidate=[...ring,...rows];if(!secondaryFits(candidate))continue
          const result=supportPrimary(candidate,diameter,rule.support,s.frameStock)
          if(result.members){solved=result;rawPrimary=candidate;break search}
          failure=result.error||failure;conflicts.splice(0,conflicts.length,...result.conflicts||[])
        }
      }
      if(!solved?.members){
        // A discretised shortest path supplies independently movable rows when
        // one global grid phase cannot avoid a sequence of unrelated corners.
        // The row-to-row vertical separation guarantees disc separation even
        // on opposite sides of concave shapes. Exact corner levels supplement
        // the samples so a useful true junction is not missed by the grid.
        graph:for(const resolution of [.01,.005]){
          const ys=values([...footprint.map(q=>q.y),...evenly(minY,maxY,resolution)]).filter(y=>y>minY+E&&y<maxY-E)
          const fixed=uniquePoints(ring.flatMap(m=>[m.a,m.b]))
          const nodes=ys.flatMap(y=>[false,true].flatMap(trim=>{
            const rows=rowAt(y,trim),anchors=uniquePoints([...fixed,...rows.flatMap(m=>[m.a,m.b])])
            return firstCollision(anchors,diameter)?[]:[{y,rows,cost:Infinity,prev:-1}]
          }))
          for(let i=0;i<nodes.length;i++){
            const node=nodes[i]
            if(node.y-minY<=limit+E)node.cost=1
            for(let j=i-1;j>=0&&node.y-nodes[j].y<=limit+E;j--){
              if(node.y-nodes[j].y<diameter+2e-6)continue
              if(nodes[j].cost+1<node.cost){node.cost=nodes[j].cost+1;node.prev=j}
            }
          }
          const ends=nodes.map((node,i)=>({node,i})).filter(({node})=>maxY-node.y<=limit+E&&Number.isFinite(node.cost)).sort((a,b)=>a.node.cost-b.node.cost||b.node.y-a.node.y)
          for(const end of ends.slice(0,16)){
            const rows:Member[]=[];let cursor=end.i
            while(cursor>=0){rows.push(...nodes[cursor].rows);cursor=nodes[cursor].prev}
            const candidate=[...ring,...rows];if(!secondaryFits(candidate))continue
            const result=supportPrimary(candidate,diameter,rule.support,s.frameStock)
            if(result.members){solved=result;rawPrimary=candidate;break graph}
            failure=result.error||failure;conflicts.splice(0,conflicts.length,...result.conflicts||[])
          }
        }
      }
      if(!solved?.members){
        // Nonuniform fallback: each new row can move independently around
        // repeated corners. Greedy furthest reachable rows preserve the span
        // bound; several sampling phases avoid a single unlucky first choice.
        const critical=values(footprint.map(q=>q.y)),ringNodes=uniquePoints(ring.flatMap(m=>[m.a,m.b]))
        nonuniform:for(const trim of [false,true])for(const phase of [0,.125,.25,.5,.75]){
          const rows:Member[]=[],anchors=[...ringNodes];let current=minY,valid=true
          for(let count=0;maxY-current>limit+E;count++){
            if(count>500){valid=false;break}
            const hi=Math.min(maxY-diameter,current+limit-2e-6),lo=current+diameter+2e-6
            const candidates=values([...critical.filter(y=>y>=lo-E&&y<=hi+E),...Array.from({length:97},(_,i)=>hi-(hi-lo)*(i+phase)/96)]).filter(y=>y>=lo-E&&y<=hi+E).reverse()
            let found=false
            for(const y of candidates){
              const next=rowAt(y,trim),nodes=uniquePoints([...anchors,...next.flatMap(m=>[m.a,m.b])])
              if(firstCollision(nodes,diameter))continue
              rows.push(...next);anchors.splice(0,anchors.length,...nodes);current=y;found=true;break
            }
            if(!found){valid=false;break}
          }
          if(!valid)continue
          const candidate=[...ring,...rows];if(!secondaryFits(candidate))continue
          const result=supportPrimary(candidate,diameter,rule.support,s.frameStock)
          if(result.members){solved=result;rawPrimary=candidate;break nonuniform}
          failure=result.error||failure;conflicts.splice(0,conflicts.length,...result.conflicts||[])
        }
      }
    }else{
      // The opening/angled perimeter trim is at joist level, not a lower tier.
      // Every corner, incoming joist end and stock joint gets a real pedestal;
      // no header is assumed to carry unsupported incoming joist reactions.
      const directTrim:Member[]=(directEdgeTrim?[footprint,...holeRims]:holeRims).flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length],kind:'joist' as const,size:rule.joist})))
      rawPrimary=[...rawJoists,...directTrim];solved=supportPrimary(rawPrimary,diameter,rule.support,s.frameStock);failure=solved.error||failure
      if(directEdgeTrim&&!solved.members){
        // Perimeter vertices do not each require an extra joist. Search grid
        // phases around the actual corner-base exclusion discs. Required joint
        // rails stay fixed; every accepted grid is independently span-checked.
        const protectedColumns=values([...jointColumns.map(supportX),...[...breakerRails.values()].flat()])
        const fixed=uniquePoints([...directTrim,...joistsAt(protectedColumns)].flatMap(m=>[m.a,m.b]))
        if(!firstCollision(fixed,diameter)){
          const pitch=Math.max(.005,(maxX-minX)/1000),count=Math.ceil((maxX-minX)/pitch)
          const positions=values([...protectedColumns,...xs,...Array.from({length:count+1},(_,i)=>minX+(maxX-minX)*i/count)])
          type Column={x:number;members:Member[];ends:Point[];required:boolean;boundary:boolean}
          const nodes:Column[]=positions.flatMap(x=>{
            const boundary=Math.abs(x-minX)<TOL||Math.abs(x-maxX)<TOL,required=protectedColumns.some(v=>Math.abs(v-x)<TOL)
            const members=boundary?[]:joistsAt([x]),ends=uniquePoints(members.flatMap(m=>[m.a,m.b]))
            return boundary||!firstCollision(uniquePoints([...fixed,...ends]),diameter)?[{x,members,ends,required,boundary}]:[]
          })
          const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1);costs[0]=0
          for(let j=1;j<nodes.length;j++)for(let i=j-1;i>=0;i--){
            const a=nodes[i],b=nodes[j],gap=b.x-a.x,limit=withinBreaker(a.x,b.x)?nogginLimit:s.joistSpacing/1000
            if(gap>s.joistSpacing/1000+TOL&&gap>nogginLimit+TOL)break
            if(gap>limit+TOL||!Number.isFinite(costs[i])||protectedColumns.some(x=>x>a.x+TOL&&x<b.x-TOL))continue
            if(!a.boundary&&!b.boundary&&gap<diameter-TOL&&!a.required&&!b.required)continue
            if(gap<diameter+TOL&&firstCollision(uniquePoints([...a.ends,...b.ends]),diameter))continue
            const cost=costs[i]+Number(!b.boundary)
            if(cost<costs[j]){costs[j]=cost;previous[j]=i}
          }
          if(Number.isFinite(costs.at(-1))){
            const chosen:Column[]=[];let cursor=nodes.length-1
            while(cursor>=0){chosen.push(nodes[cursor]);cursor=previous[cursor]}
            const joists=chosen.flatMap(q=>q.members),primary=[...joists,...directTrim]
            if(crossRunSupportGap(footprint,holeRims,primary,withinBreaker)<=s.joistSpacing/1000+TOL){
              const result=supportPrimary(primary,diameter,rule.support,s.frameStock)
              if(result.members){rawJoists=joists;rawPrimary=primary;solved=result}
            }
          }
        }
        failure=solved.error||failure
      }
      if(solved.conflicts)conflicts.push(...solved.conflicts)
      if(breakerBoardCount(s)===1&&diameter>2*breakerRailOffset(s)+TOL&&solved.conflicts?.length===2){
        const [a,b]=solved.conflicts
        if(boards.breakers.some(x=>Math.abs(a.y-b.y)<TOL&&Math.abs(Math.min(a.x,b.x)-(x-breakerRailOffset(s)))<TOL&&Math.abs(Math.max(a.x,b.x)-(x+breakerRailOffset(s)))<TOL)){
          failure=`A single breaker puts its required joist rails ${Math.round(2*breakerRailOffset(s)*1000)} mm apart, less than the ${Math.round(diameter*1000)} mm pedestal base diameter. In Boards, choose Automatic or Two-board breaker width to separate these supports.`
        }
      }
    }
    draftPrimary=[...rawPrimary]
    if(solved?.members&&solved.supports){
      members.push(...solved.members);pedestals.push(...solved.supports);splices.push(...solved.splices);conflicts.length=0
      let secondaryValid=true
      if(rule.bearer){
        for(const joist of rawJoists){
          if(ring.some(m=>on(joist.a,m)&&on(joist.b,m)))continue // upper rim already occupies this line
          const length=dist(joist.a,joist.b),bearing=segmentBearings(joist,rawPrimary);let start=0
          while(length-start>E){
            const end=length-start<=s.frameStock+E?length:bearing.filter(t=>t>start+E&&t<=start+s.frameStock+E).at(-1)
            if(end===undefined){secondaryValid=false;break}
            members.push({...joist,a:along(joist.a,joist.b,start/length),b:along(joist.a,joist.b,end/length)})
            if(end<length-E)splices.push(along(joist.a,joist.b,end/length));start=end
          }
        }
        // A second, continuously borne rim reaches the picture-frame boards at
        // the same elevation as the joists. The lower ring supports joist tips.
        for(const r of ring){const length=dist(r.a,r.b),n=Math.ceil(length/s.frameStock-E);for(let i=0;i<n;i++)members.push({...r,kind:'rim',size:rule.joist,a:along(r.a,r.b,i/n),b:along(r.a,r.b,(i+1)/n)})}
      }
      // Breaker ladders have no separate pedestal tier. Their ends meet actual
      // upper rails. Their span and the board-support row spacing are audited
      // separately because the breaker boards run perpendicular to the infill.
      const upper=members.filter(m=>m.kind==='joist'||m.kind==='rim'),upperIndex=memberIndex(upper)
      const rimRows=rule.bearer?values(ring.filter(m=>Math.abs(m.a.y-m.b.y)<TOL).map(m=>m.a.y)):[]
      const edgeRows=values(ring.filter(m=>Math.abs(m.a.y-m.b.y)<TOL).map(m=>m.a.y))
      const supportY=(y:number)=>{const near=rimRows.filter(v=>Math.abs(v-y)<=snapAllowance+E).sort((a,b)=>Math.abs(a-y)-Math.abs(b-y));return near[0]??y}
      for(const x of boards.breakers){const [left,right]=breakerRails.get(x)!
        const jointYs=breakerJoints.get(x)||[]
        const mandatoryY=values([minY,...edgeRows,...jointYs.map(supportY),maxY].filter(y=>y>=minY-E&&y<=maxY+E)),nogginYs=values(mandatoryY.flatMap((y,i)=>i?evenly(mandatoryY[i-1],y,Math.min(.4,s.joistSpacing/1000)):[y]))
        for(const y of nogginYs){
          const rails=values([left,right,...upper.filter(m=>Math.abs(m.a.x-m.b.x)<E&&m.a.x>left+E&&m.a.x<right-E&&y>=Math.min(m.a.y,m.b.y)-E&&y<=Math.max(m.a.y,m.b.y)+E).map(m=>m.a.x)])
          for(let i=1;i<rails.length;i++){
            const a={x:rails[i-1],y},b={x:rails[i],y}
            if(rule.bearer&&ring.some(m=>on(a,m)&&on(b,m)))continue
            if(upperIndex.at(a).some(m=>on(a,m)&&on(b,m)))continue
            if(upperIndex.at(a).some(m=>on(a,m))&&upperIndex.at(b).some(m=>on(b,m))&&scanDeck(footprint,y).some(([lo,hi])=>a.x>=lo-E&&b.x<=hi+E))members.push({a,b,kind:'noggin',size:rule.joist})
          }
        }
      }
      if(secondaryValid)layoutStatus='ready';else issues.push('Secondary stock is too short to reach its next real bearer. Increase frame stock or use closer bearer spacing.')
    }else issues.push(`The automatic solver could not find a complete support layout. ${failure} ${rule.bearer?'Widen the marked corner/neck, use a smaller base or split the deck into separately designed zones.':'Choose a bearer + joist frame to carry close joists on shared bearers, or change the base size / joint layout.'}`)
  }
  const faceConflict=upperFaceConflict(members,face)
  if(faceConflict){layoutStatus='unbuildable';conflicts.push(...faceConflict);issues.push('Required upper support faces overlap in the marked area. Change the joint layout, use a suitable narrower support product or obtain a local supplier-designed framing detail.')}
  if(holes.length&&(members.some(m=>memberCrossesOpening(m,holes,face))||pedestals.some(q=>holes.some(h=>pointInside(h,q)||boundaryDistance(h,q)<baseInset-TOL)))){layoutStatus='unbuildable';issues.push('A frame member or pedestal base conflicts with a cutout. Move or resize the opening, or use another frame/base combination.');conflicts.push(...holes.flatMap(h=>h))}
  // Keep a separately labelled diagnostic drawing. Failed candidates remain
  // excluded from quantities, installer exports and the 3D structural model.
  const diagnostic=layoutStatus==='unbuildable'?{members:[...(members.length?members:draftPrimary)],pedestals:pedestals.length?[...pedestals]:uniquePoints(draftPrimary.flatMap(m=>[m.a,m.b]))}:{members:[] as Member[],pedestals:[] as Point[]}
  if(layoutStatus==='unbuildable'){members.length=0;pedestals.length=0;splices.length=0}
  const primary=members.filter(m=>m.kind===(rule.bearer?'bearer':'joist')),upper=members.filter(m=>m.kind==='joist'||m.kind==='rim')
  const primaryIndex=memberIndex(primary),pedestalIndex=pointIndex(pedestals),upperIndex=memberIndex(upper)
  let maxPrimarySpan=0,maxSecondarySpan=0,endBearing=primary.length>0,secondaryBearing=true
  for(const m of primary){const ts=values(pedestalIndex(m).filter(q=>on(q,m)).map(q=>dist(m.a,q))),l=dist(m.a,m.b)
    if(!ts.length||ts[0]>TOL||l-ts.at(-1)!>TOL)endBearing=false
    for(let i=1;i<ts.length;i++)maxPrimarySpan=Math.max(maxPrimarySpan,ts[i]-ts[i-1])
  }
  if(rule.bearer)for(const m of upper){const ts=segmentBearings(m,primaryIndex.along(m)),l=dist(m.a,m.b)
    if(!ts.length||ts[0]>TOL||l-ts.at(-1)!>TOL)secondaryBearing=false
    if(m.kind==='joist')for(let i=1;i<ts.length;i++)maxSecondarySpan=Math.max(maxSecondarySpan,ts[i]-ts[i-1])
  }
  const basesInside=pedestals.every(q=>pointInside(p,q)&&boundaryDistance(p,q)>=baseInset-TOL&&holes.every(h=>!pointInside(h,q)&&boundaryDistance(h,q)>=baseInset-TOL)),collision=firstCollision(pedestals,diameter)
  const columns=values(upper.filter(m=>Math.abs(m.a.x-m.b.x)<E).map(m=>m.a.x)),maxJoistGap=directEdgeTrim?crossRunSupportGap(footprint,holeRims,upper,withinBreaker):Math.max(0,...columns.slice(1).map((x,i)=>!rule.bearer&&withinBreaker(columns[i],x)?0:x-columns[i]))
  const junctions=pedestals.filter(q=>primaryIndex.at(q).filter(m=>on(q,m)).length>1)
  const contact=face/2-bearing,supportFaces=memberIndex(upper,Math.max(TOL,contact+TOL))
  const borne=(q:Point)=>rimBorne(q)||supportFaces.at(q).some(m=>pointSegmentDistance(q,m.a,m.b)<=contact+TOL)
  const infillBearing=layoutStatus==='ready'&&boards.pieces.filter(q=>q.kind==='infill').every(piece=>{
    const outline=piece.outline||[]
    return outline.every((a,i)=>{const b=outline[(i+1)%outline.length];return Math.abs(a.y-b.y)<E||[.1,.3,.5,.7,.9].every(t=>borne(along(a,b,t)))})
  })
  const breakerUpper=members.filter(m=>m.kind==='joist'||m.kind==='rim'||m.kind==='noggin'),breakerFaces=memberIndex(breakerUpper,Math.max(TOL,contact+TOL))
  const breakerBearing=layoutStatus==='ready'&&boards.pieces.filter(q=>q.kind==='breaker').every(piece=>{
    const outline=piece.outline||[]
    return outline.every((a,i)=>{const b=outline[(i+1)%outline.length];return Math.abs(a.x-b.x)<E||[.1,.3,.5,.7,.9].every(t=>{const q=along(a,b,t);return rimBorne(q)||breakerFaces.at(q).some(m=>pointSegmentDistance(q,m.a,m.b)<=contact+TOL)})})
  })
  const checks=[
    {name:'Primary support spans',ok:primary.length>0&&maxPrimarySpan<=rule.support+TOL,detail:`${Math.round(maxPrimarySpan*1000)} mm actual / ${rule.support*1000} mm report limit`},
    {name:'Joist bearings and stock splices',ok:endBearing&&secondaryBearing,detail:'Primary ends and stock joints sit on pedestal nodes. Secondary ends and stock joints meet real bearers.'},
    {name:'Secondary joist spans',ok:layoutStatus==='ready'&&(!rule.bearer||maxSecondarySpan<=rule.bearerSpacing+TOL),detail:rule.bearer?`${Math.round(maxSecondarySpan*1000)} mm actual / ${rule.bearerSpacing*1000} mm report limit`:'Joists bear directly on pedestals.'},
    {name:'Pedestal base clearance',ok:pedestals.length>0&&basesInside,detail:`${Math.round(diameter*1000)} mm base diameter; ${Math.round(clearance*1000)} mm extra edge clearance.`},
    {name:'Pedestal bases do not overlap',ok:layoutStatus==='ready'&&!collision,detail:layoutStatus==='ready'&&!collision?'All actual base discs are separated.':'A complete collision-free arrangement could not be built. Any amber draft is diagnostic only and is excluded from quantities.'},
    {name:'Joist centres',ok:layoutStatus==='ready'&&maxJoistGap<=s.joistSpacing/1000+TOL,detail:`${Math.round(maxJoistGap*1000)} mm maximum infill support spacing / ${s.joistSpacing} mm selected (400 mm report maximum). Breaker ladder rows also use the selected centres.`},
    {name:'Breaker ladder spans',ok:layoutStatus==='ready'&&members.filter(m=>m.kind==='noggin').every(m=>dist(m.a,m.b)<=nogginLimit+TOL),detail:`Transverse ladder spans stay within ${Math.round(nogginLimit*1000)} mm and both ends bear on real upper rails.`},
    {name:'Noggin end bearings',ok:layoutStatus==='ready'&&members.filter(m=>m.kind==='noggin').every(m=>[m.a,m.b].every(q=>upperIndex.at(q).some(j=>on(q,j)))),detail:'Breaker ladder ends meet upper joists or rim members.'},
    {name:'Pedestals attached to primary members',ok:pedestals.length>0&&pedestals.every(q=>primaryIndex.at(q).some(m=>on(q,m))),detail:'Every pedestal is directly below an actual primary member.'},
    {name:'Perimeter board bearing reach',ok:layoutStatus==='ready'&&bearingAllowance>=-E&&Math.abs(setback-joint)<=bearingAllowance+E,detail:`${Math.round(face*1000)} mm entered face width; ${Math.round(bearing*1000)} mm required bearing each side of the perimeter/infill gap. These product dimensions require confirmation.`},
    {name:'Infill board end bearings',ok:infillBearing,detail:'Square and angled infill cut ends are checked against actual upper bearing faces, including stock butt joints.'},
    {name:'Breaker board end bearings',ok:breakerBearing,detail:'Breaker ends and required stock butt joints bear on real joists, rim members or ladder noggins, using the entered face width and end bearing.'},
    {name:'Upper support face clearance',ok:layoutStatus==='ready'&&!faceConflict,detail:'Parallel joist and ladder faces have physical clearance using the entered product face width.'},
    {name:'Perimeter support topology',ok:layoutStatus==='ready',detail:rule.bearer?'A continuous upper rim bears on a lower perimeter ring; angled joist tips end on that ring. Junction heads and connections require supplier detailing.':holes.length||directEdgeTrim?'Opening and angled-edge trims are at joist level. Trim corners, incoming joist ends and stock joints bear directly on pedestal nodes. Junction heads and connections require supplier detailing.':'Direct joist ends have their own separated pedestal bases; perimeter fixing details require supplier approval.'},
    {name:'Single support elevation',ok:layoutStatus==='ready',detail:rule.bearer?'All heads bear below primary bearers, including the perimeter ring.':'All heads bear below the joists.'},
  ]
  issues.push(...checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`))
  return {members,pedestals,diagnostic,rule,footprint,setback,baseInset,faceWidth:face,boardBearing:bearing,splices:uniquePoints(splices),checks,issues,geometryPass:issues.length===0,maxPrimarySpan,maxSecondarySpan,layoutStatus,conflicts:uniquePoints(conflicts),junctions}
}
