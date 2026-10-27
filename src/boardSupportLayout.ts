import type { Member, Piece, Point, Settings } from './planner.ts'
import { boundaryDistance, insetEdgeSegment, insetPolygon, insetPolygonEdges, pointInside, pointSegmentDistance, signedArea } from './deckGeometry.ts'
import { memberCrossesOpening, subtractIntervals } from './shapeGeometry.ts'
import { segmentBearings } from './supportLayout.ts'
import type { PlacementDiagnostic } from './pedestalPlacement.ts'
import { pedestalBaseIntervals, placePrimary } from './pedestalPlacement.ts'
import { perimeterBoardRuns, perimeterEdgeEnabled, pictureFrameWidth } from './perimeterEdges.ts'
import { breakerRailOffset } from './breakerWidth.ts'

// X is the infill run, Y the joist run. All distances here are metres.
const E=1e-7,T=1e-5
const length=(m:{a:Point;b:Point})=>Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)
const at=(m:{a:Point;b:Point},t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t,y:m.a.y+(m.b.y-m.a.y)*t})
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const on=(p:Point,m:Member)=>pointSegmentDistance(p,m.a,m.b)<T
const inFace=(q:Point,m:Member,half:number)=>{
  const l=length(m),ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l,x=(q.x-m.a.x)*ux+(q.y-m.a.y)*uy,y=-(q.x-m.a.x)*uy+(q.y-m.a.y)*ux
  return x>=-T&&x<=l+T&&Math.abs(y)<=half+T
}
const boardAxis=(piece:Piece)=>piece.axis??(piece.kind==='breaker'?{x:0,y:1}:{x:1,y:0})
const unique=(ns:number[])=>[...new Set(ns.map(n=>Math.round(n*1e7)/1e7))].sort((a,b)=>a-b)
const evenly=(a:number,b:number,limit:number)=>{const n=Math.max(1,Math.ceil((b-a)/limit-E));return Array.from({length:n+1},(_,i)=>a+(b-a)*i/n)}
type Rule={joist:number;bearer:number;support:number;bearerSpacing:number;pages:string;sheet:string}
type Boards={pieces:Piece[];breakers:number[];perimeterSplices?:{point:Point;horizontal:boolean}[]}
export type FrameProjection={member:number;size:number;tier:'primary'|'secondary'|'blocking';supportKind:'pedestal'|'bearer'|'connector';end:'start'|'end';point:Point;support:Point;distance:number;limit:number|null}

function scan(p:Point[],n:number,vertical=false):[number,number][]{
  n=Math.round(n*1e9)/1e9
  const q=(vertical?p.map(a=>({x:a.y,y:a.x})):p).map(a=>({x:Math.round(a.x*1e9)/1e9,y:Math.round(a.y*1e9)/1e9})),xs:number[]=[],runs:[number,number][]=[]
  for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length]
    if(Math.abs(a.y-b.y)<E){if(Math.abs(n-a.y)<E)runs.push([Math.min(a.x,b.x),Math.max(a.x,b.x)]);continue}
    if((a.y<=n&&b.y>n)||(b.y<=n&&a.y>n))xs.push(a.x+(n-a.y)*(b.x-a.x)/(b.y-a.y))
  }
  xs.sort((a,b)=>a-b);for(let i=1;i<xs.length;i+=2)runs.push([xs[i-1],xs[i]])
  const result:[number,number][]=[]
  for(const [a,b] of runs.sort((a,b)=>a[0]-b[0])){if(b-a<E)continue;const last=result.at(-1);if(last&&a<=last[1]+T)last[1]=Math.max(last[1],b);else result.push([a,b])}return result
}
function regionScan(outer:Point[],holes:Point[][],n:number,vertical=false){return subtractIntervals(scan(outer,n,vertical),holes.flatMap(h=>scan(h,n,vertical)))}
function ringSegments(ring:Point[],kind:Member['kind'],size:number):Member[]{return ring.map((a,i)=>({a,b:ring[(i+1)%ring.length],kind,size}))}
function boardStockJoints(pieces:Piece[],gap:number){
  const ends=pieces.flatMap((piece,i)=>{
    let axis=boardAxis(piece);if(axis.x<-E||Math.abs(axis.x)<E&&axis.y<0)axis={x:-axis.x,y:-axis.y}
    const outline=piece.outline??[],us=outline.map(q=>q.x*axis.x+q.y*axis.y),centre=(Math.min(...us)+Math.max(...us))/2
    return outline.flatMap((a,j)=>{const b=outline[(j+1)%outline.length],u=(a.x+b.x)/2*axis.x+(a.y+b.y)/2*axis.y
      return Math.abs((b.x-a.x)*axis.x+(b.y-a.y)*axis.y)<T&&distance(a,b)>T?[{a,b,piece:i,axis,u,side:Math.sign(u-centre)}]:[]})
  }),lookup=index(ends,gap+T),result:{a:Point;b:Point;pieces:number[];gap:number}[]=[]
  for(const end of ends)for(const other of lookup.along(end)){
    if(other.piece<=end.piece||other.side===end.side||Math.abs(end.axis.x*other.axis.y-end.axis.y*other.axis.x)>1e-5)continue
    const g=Math.abs(end.u-other.u);if(g>gap+T||g<E)continue
    const v=(q:Point)=>-q.x*end.axis.y+q.y*end.axis.x,lo=Math.max(Math.min(v(end.a),v(end.b)),Math.min(v(other.a),v(other.b))),hi=Math.min(Math.max(v(end.a),v(end.b)),Math.max(v(other.a),v(other.b)))
    if(hi-lo<T)continue
    const u=(end.u+other.u)/2,toPoint=(v:number)=>({x:u*end.axis.x-v*end.axis.y,y:u*end.axis.y+v*end.axis.x})
    result.push({a:toPoint(lo),b:toPoint(hi),pieces:[end.piece,other.piece],gap:g})
  }return result
}
// Supports and member lookups use metre buckets. Queries are candidates only;
// the exact segment/disc tests still decide every accepted result.
function index<M extends {a:Point;b:Point}>(items:M[],pad=0){
  const cells=new Map<string,M[]>()
  for(const m of items)for(let x=Math.floor(Math.min(m.a.x,m.b.x)-pad);x<=Math.floor(Math.max(m.a.x,m.b.x)+pad);x++)for(let y=Math.floor(Math.min(m.a.y,m.b.y)-pad);y<=Math.floor(Math.max(m.a.y,m.b.y)+pad);y++){const k=`${x},${y}`,a=cells.get(k);if(a)a.push(m);else cells.set(k,[m])}
  return {at:(q:Point)=>cells.get(`${Math.floor(q.x)},${Math.floor(q.y)}`)??[],along:(m:{a:Point;b:Point})=>{const found=new Set<M>();for(let x=Math.floor(Math.min(m.a.x,m.b.x)-pad);x<=Math.floor(Math.max(m.a.x,m.b.x)+pad);x++)for(let y=Math.floor(Math.min(m.a.y,m.b.y)-pad);y<=Math.floor(Math.max(m.a.y,m.b.y)+pad);y++)for(const item of cells.get(`${x},${y}`)??[])found.add(item);return [...found]}}
}
function mergeLines(raw:Member[],gap=.00001):Member[]{
  const groups=new Map<string,Member[]>()
  for(const m of raw){if(length(m)<T)continue;const l=length(m);let ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l;if(ux<-E||Math.abs(ux)<E&&uy<0){ux=-ux;uy=-uy}
    const key=[m.kind,m.role??'',m.size,ux.toFixed(6),uy.toFixed(6),(-uy*m.a.x+ux*m.a.y).toFixed(6)].join('|'),a=groups.get(key);if(a)a.push(m);else groups.set(key,[m])
  }
  const result:Member[]=[]
  for(const group of groups.values()){const base=group[0],l=length(base),ux=(base.b.x-base.a.x)/l,uy=(base.b.y-base.a.y)/l,project=(p:Point)=>(p.x-base.a.x)*ux+(p.y-base.a.y)*uy
    const runs=group.map(m=>[Math.min(project(m.a),project(m.b)),Math.max(project(m.a),project(m.b))]).sort((a,b)=>a[0]-b[0]),joined:number[][]=[]
    for(const r of runs){const last=joined.at(-1);if(last&&r[0]<=last[1]+gap)last[1]=Math.max(last[1],r[1]);else joined.push(r)}
    for(const [a,b] of joined)result.push({...base,a:{x:base.a.x+ux*a,y:base.a.y+uy*a},b:{x:base.a.x+ux*b,y:base.a.y+uy*b}})
  }return result
}
function splitCrossings(members:Member[]):Member[]{
  const lookup=index(members,T)
  return members.flatMap(m=>{const l=length(m),cuts=unique([0,l,...segmentBearings(m,lookup.along(m).filter(n=>n!==m))]);return cuts.slice(1).flatMap((b,i)=>b-cuts[i]>T?[{...m,a:at(m,cuts[i]/l),b:at(m,b/l)}]:[])})
}
// A cut rung may finish inside the rail's finite bearing face rather than
// exactly on its centreline. Only transverse members provide these contacts.
function rungContacts(rail:Member,members:Member[],halfFace:number){
  const l=length(rail),ux=(rail.b.x-rail.a.x)/l,uy=(rail.b.y-rail.a.y)/l
  const transverse=members.filter(n=>Math.abs(ux*(n.b.y-n.a.y)-uy*(n.b.x-n.a.x))>=1e-6*length(n))
  return unique([...segmentBearings(rail,transverse),...transverse.flatMap(n=>[n.a,n.b].filter(q=>pointSegmentDistance(q,rail.a,rail.b)<=halfFace+T).map(q=>Math.max(0,Math.min(l,(q.x-rail.a.x)*ux+(q.y-rail.a.y)*uy))))])
}
function faceClash(members:Member[],face:number):Point[]|undefined{
  const lookup=index(members,face)
  for(const m of members){const l=length(m),ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l
    for(const n of lookup.along(m)){if(n===m)continue;const nl=length(n),vx=(n.b.x-n.a.x)/nl,vy=(n.b.y-n.a.y)/nl
      // Nonparallel members must be cut at their meeting point. Their mitres /
      // end connectors are separately unverified, not treated as solid crosses.
      if(Math.abs(ux*vy-uy*vx)>1e-5){
        const ts=segmentBearings(m,[n])
        if(ts.some(t=>t>T&&l-t>T&&distance(at(m,t/l),n.a)>T&&distance(at(m,t/l),n.b)>T))return [at(m,ts[0]/l)]
        // End cuts / mitres are not square solid caps. Their detailed finite
        // faces and connectors stay unverified and are scheduled separately.
        continue
      }

      const separation=Math.abs((n.a.x-m.a.x)*uy-(n.a.y-m.a.y)*ux),a=(n.a.x-m.a.x)*ux+(n.a.y-m.a.y)*uy,b=(n.b.x-m.a.x)*ux+(n.b.y-m.a.y)*uy
      if(separation<face-T&&Math.min(l,Math.max(a,b))-Math.max(0,Math.min(a,b))>T)return [at(m,.5),at(n,.5)]
    }
  }
}
function splitStock(raw:Member[],primary:Member[],stock:number){
  const lookup=index(primary,T),members:Member[]=[],splices:Point[]=[]
  for(const m of raw){const l=length(m),bearings=segmentBearings(m,lookup.along(m));let start=0
    while(l-start>stock+T){const end=bearings.filter(t=>t>start+T&&t<=start+stock+E).at(-1);if(end===undefined)return {members,splices,error:'A secondary stock joint has no real supporting bearer. Use longer stock or closer bearer centres.'};members.push({...m,a:at(m,start/l),b:at(m,end/l)});splices.push(at(m,end/l));start=end}
    members.push({...m,a:at(m,start/l)})
  }return {members,splices,error:''}
}
function continuouslyBorne(m:Member,supports:Member[]){
  const l=length(m),ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l,ranges:[number,number][]=[]
  for(const n of supports){if(Math.abs((n.a.x-m.a.x)*uy-(n.a.y-m.a.y)*ux)>T||Math.abs((n.b.x-m.a.x)*uy-(n.b.y-m.a.y)*ux)>T)continue
    const a=(n.a.x-m.a.x)*ux+(n.a.y-m.a.y)*uy,b=(n.b.x-m.a.x)*ux+(n.b.y-m.a.y)*uy;ranges.push([Math.max(0,Math.min(a,b)),Math.min(l,Math.max(a,b))])}
  let covered=0;for(const [a,b] of ranges.filter(([a,b])=>b>=a-E).sort((a,b)=>a[0]-b[0])){if(covered>=l-T)return true;if(a>covered+T)return false;covered=Math.max(covered,b)}return covered>=l-T
}
function longitudinalFaceRuns(line:Member,members:Member[],halfFace:number):Member[]{
  const l=length(line),ux=(line.b.x-line.a.x)/l,uy=(line.b.y-line.a.y)/l
  return members.flatMap(m=>{
    if(Math.abs(ux*(m.b.y-m.a.y)-uy*(m.b.x-m.a.x))>1e-5*length(m)||Math.abs((m.a.x-line.a.x)*uy-(m.a.y-line.a.y)*ux)>halfFace+T)return []
    const a=(m.a.x-line.a.x)*ux+(m.a.y-line.a.y)*uy,b=(m.b.x-line.a.x)*ux+(m.b.y-line.a.y)*uy,lo=Math.max(0,Math.min(a,b)),hi=Math.min(l,Math.max(a,b))
    return hi-lo>T?[{...m,a:at(line,lo/l),b:at(line,hi/l)}]:[]
  })
}

function installedBoardLines(piece:Piece,envelope:Point[],envelopeHoles:Point[][]):Member[]{
  const outline=piece.outline??[],axis=boardAxis(piece);if(!outline.length)return []
  const origin=outline[0],normal={x:-axis.y,y:axis.x},local=outline.map(q=>({x:(q.x-origin.x)*axis.x+(q.y-origin.y)*axis.y,y:(q.x-origin.x)*normal.x+(q.y-origin.y)*normal.y})),vs=local.map(q=>q.y),lo=Math.min(...vs),hi=Math.max(...vs)
  const candidates=[(lo+hi)/2,lo+(hi-lo)*.25,lo+(hi-lo)*.75]
  const v=candidates.find(v=>scan(local,v).every(([a,b])=>[.1,.3,.5,.7,.9].every(t=>{const u=a+(b-a)*t,q={x:origin.x+axis.x*u+normal.x*v,y:origin.y+axis.y*u+normal.y*v};return pointInside(envelope,q)&&!envelopeHoles.some(h=>pointInside(h,q))})))??candidates[0]
  return scan(local,v).map(([a,b])=>({a:{x:origin.x+axis.x*a+normal.x*v,y:origin.y+axis.y*a+normal.y*v},b:{x:origin.x+axis.x*b+normal.x*v,y:origin.y+axis.y*b+normal.y*v},kind:'noggin',size:0}))
}

function installedBoardBearings(line:Member,supports:Member[],face:number,contact:number){
  const l=length(line),longitudinal=longitudinalFaceRuns(line,supports,face/2)
  return unique([...longitudinal.flatMap(m=>[distance(line.a,m.a),distance(line.a,m.b)]),...supports.flatMap(m=>{
    const hits=segmentBearings(line,[m]);if(hits.length)return hits
    return [0,l].filter(t=>pointSegmentDistance(at(line,t/l),m.a,m.b)<=Math.max(contact,0)+T)
  })]).filter(t=>t>=-T&&t<=l+T)
}

function repairInstalledBoardSupports(boards:Boards,raw:Member[],holes:Point[][],envelope:Point[],envelopeHoles:Point[][],s:Settings,rule:Rule){
  const face=(s.frameFaceWidth??35)/1000,contact=face/2-(s.boardEndBearing??10)/1000,spacing=s.joistSpacing/1000
  const connected=new Set(raw.filter(m=>m.kind!=='noggin'&&m.role!=='edge-rail'&&m.support!=='transfer')),queue=[...connected],seedIndex=index(raw,T)
  for(let i=0;i<queue.length;i++)for(const n of seedIndex.along(queue[i]))if(!connected.has(n)&&segmentBearings(n,[queue[i]]).length){connected.add(n);queue.push(n)}
  const supports=raw.filter(m=>connected.has(m)),added:Member[]=[],boundaries=[...ringSegments(envelope,'rim',0),...envelopeHoles.flatMap(h=>ringSegments(h,'rim',0))]
  let lookup=index(supports,Math.max(face,spacing))
  const maxLength=Math.min(s.frameStock,rule.bearer?rule.bearerSpacing:rule.support),cap=rule.joist===80?s.joistOverhang80:s.joistOverhang35
  const inside=(m:Member)=>{
    const l=length(m),cuts=unique([0,l,...segmentBearings(m,boundaries)])
    return l>T&&cuts.every(t=>pointInside(envelope,at(m,t/l)))&&cuts.slice(1).every((b,i)=>{const q=at(m,(cuts[i]+b)/2/l);return pointInside(envelope,q)&&envelopeHoles.every(h=>!pointInside(h,q))})&&!memberCrossesOpening(m,holes,face)
  }
  // A short angled offcut may lie outside the inset main joists. Add actual
  // upper blocking back to an anchored member; base exclusion is unchanged.
  // The same search fills a real support gap under an angled border board.
  for(const piece of boards.pieces)for(const line of installedBoardLines(piece,envelope,envelopeHoles))for(let attempt=0;attempt<16;attempt++){
    const l=length(line);if(l<T)break
    const ts=installedBoardBearings(line,lookup.along(line),face,contact),gap=ts.slice(1).map((b,i)=>[ts[i],b]).find(([a,b])=>b-a-face>spacing+T)
    if(ts.length&&!gap)break
    const positions=gap?[(gap[0]+gap[1])/2]:l<=spacing+face+T?[l/2,l*.25,l*.75]:[]
    const ux=(line.b.x-line.a.x)/l,uy=(line.b.y-line.a.y)/l,normal={x:-uy,y:ux},options:Member[][]=[]
    for(const t of positions){
      const q=at(line,t/l);if(!pointInside(envelope,q)||envelopeHoles.some(h=>pointInside(h,q)))continue
      const endpoints:Point[]=[]
      for(const direction of [-1,1]){
        const ray:Member={a:q,b:{x:q.x+normal.x*maxLength*direction,y:q.y+normal.y*maxLength*direction},kind:'noggin',size:rule.joist,role:'blocking'}
        const hit=segmentBearings(ray,lookup.along(ray)).find(t=>t>face/2+T)
        if(hit!==undefined){
          const end=at(ray,hit/maxLength),joint=lookup.at(end).flatMap(m=>[m.a,m.b]).filter(q=>distance(q,end)<.0001).sort((a,b)=>distance(a,end)-distance(b,end))[0]
          // Adjust the new cut to an existing real junction; do not create a
          // separate connector a few hundredths of a millimetre beyond it.
          endpoints.push(joint??end)
        }
      }
      const beams:Member[]=[...(endpoints.length===2?[{a:endpoints[0],b:endpoints[1],kind:'noggin' as const,size:rule.joist,role:'blocking' as const}]:[]),...endpoints.map(b=>({a:q,b,kind:'noggin' as const,size:rule.joist,role:'blocking' as const}))]
      for(const beam of beams){
        if(length(beam)>maxLength+T||!inside(beam))continue
        const nodes=segmentBearings(beam,lookup.along(beam));if(!nodes.length)continue
        if(cap!==undefined&&(nodes[0]>cap/1000+T||length(beam)-nodes.at(-1)!>cap/1000+T))continue
        const bl=length(beam),positions=unique([0,bl,...segmentBearings(beam,lookup.along(beam))]),cuts=positions.slice(1).flatMap((b,i)=>b-positions[i]>T?[{...beam,a:at(beam,positions[i]/bl),b:at(beam,b/bl)}]:[])
        if(!cuts.length||faceClash([...supports,...cuts],face))continue
        if(!installedBoardBearings(line,[...lookup.along(line),...cuts],face,contact).some(n=>Math.abs(n-t)<face+T))continue
        options.push(cuts);break
      }
      if(options.length)break
    }
    const chosen=options[0];if(!chosen)break
    supports.push(...chosen);added.push(...chosen);lookup=index(supports,Math.max(face,spacing))
  }
  return added
}

const rimContacts=(ring:Member[],supports:Member[])=>{
    let offset=0;const hits:number[]=[],circumference=ring.reduce((n,m)=>n+length(m),0),lookup=index(supports,T)
    for(const m of ring){hits.push(...segmentBearings(m,lookup.along(m)).map(t=>offset+t));offset+=length(m)}
    const ts=unique(hits.map(t=>t>=circumference-T?0:t)),gaps=ts.length?ts.map((a,i)=>({a,b:i===ts.length-1?ts[0]+circumference:ts[i+1]})):[{a:0,b:circumference}]
    return {circumference,gaps,max:Math.max(...gaps.map(g=>g.b-g.a))}
  }

function solveBoardSupports(p:Point[],s:Settings,boards:Boards,rule:Rule,transferFrame=false){
  const face=(s.frameFaceWidth??35)/1000,bearing=(s.boardEndBearing??10)/1000,gap=s.board.gap/1000,w=pictureFrameWidth(s),fascia=(s.fasciaClearance??s.board.thickness)/1000
  const diameter=(s.pedestalDiameter??150)/1000,baseInset=diameter/2+(s.pedestalClearance??0)/1000,holes=(s.cutouts??[]).map(h=>h.polygon),contact=face/2-bearing
  const issues:string[]=[],conflicts:Point[]=[]
  const boardJoints=boardStockJoints(boards.pieces,s.board.endGap/1000)
  const rounded=holes.map((h,i)=>{
    const shape=s.cutouts?.[i].shape,turns=h.map((a,j)=>{const b=h[(j+1)%h.length],c=h[(j+2)%h.length];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)}).filter(n=>Math.abs(n)>E)
    return shape==='circle'||shape==='oval'||shape!=='custom'&&h.length>=8&&turns.length>0&&turns.every(n=>n*turns[0]>0)
  })
  let envelope:Point[]=[],envelopeHoles:Point[][]=[],footprint:Point[]=[],trimHoles:Point[][]=[]
  const edgeOffset=(a:Point,b:Point,enabled:boolean)=>Math.abs(a.y-b.y)<T?fascia:Math.max(fascia+face/2,!transferFrame&&(!rule.bearer||Math.abs(a.x-b.x)>T)?baseInset:0,enabled?Math.max(w+gap/2,fascia+face*1.5):0)
  try{
    // Horizontal member ends use the fascia plane. Edges parallel to a member
    // also need half its physical face inside that plane.
    envelope=insetPolygon(p,fascia);envelopeHoles=holes.map(h=>insetPolygon(h,-face/2))
    footprint=insetPolygonEdges(p,p.map((a,i)=>edgeOffset(a,p[(i+1)%p.length],perimeterEdgeEnabled(s,i))))
    const openingTrim=Math.max(w+gap/2,baseInset)
    trimHoles=holes.map((h,holeIndex)=>{
      if(rounded[holeIndex])return insetPolygon(h,-s.board.width/2000)
      return insetPolygonEdges(h,h.map(()=>-openingTrim))
    })
  }catch{issues.push('The required frame recess cannot fit this outline or opening. Reduce the fascia recess or widen this part of the deck.')}
  const straightTrims=trimHoles.filter((_,i)=>!rounded[i])
  const openingRims=holes.flatMap((h,i)=>!rounded[i]?[]:Array.from({length:s.pictureFrameRows??1},(_,row)=>ringSegments(insetPolygon(h,-(row*(s.board.width+s.board.gap)/1000+s.board.width/2000)),'joist',rule.joist).map(m=>({...m,role:'opening-rim' as const,support:'transfer' as const,openingIndex:i,openingRow:row}))).flat())
  if(s.supportLayout){
    const working=(q:Point)=>s.direction==='vertical'?{x:q.y,y:q.x}:{...q},raw=s.supportLayout.members.map(m=>({...m,a:working(m.a),b:working(m.b)})),pedestals=s.supportLayout.pedestals.map(working)
    const prepared=prepareEditedMembers(raw,pedestals,s,rule)
    return auditBoardSupports(p,s,boards,rule,{members:prepared.members,pedestals,splices:prepared.splices,primarySplices:[],edgeRailSplices:[],openingRimSplices:[],footprint,envelope,envelopeHoles,rimGroups:holes.flatMap((_,i)=>!rounded[i]?[]:Array.from({length:s.pictureFrameRows??1},(_,row)=>openingRims.filter(m=>m.openingIndex===i&&m.openingRow===row))),issues,conflicts,transferFrame:raw.some(m=>m.role==='support-header'),draftMembers:raw,placementDiagnostics:[],manual:true})
  }
  const collectors=mergeLines([footprint,...straightTrims].flatMap(r=>ringSegments(r,'joist',rule.joist).filter(m=>Math.abs(m.a.x-m.b.x)>T&&Math.abs(m.a.y-m.b.y)>T).map(m=>({...m,role:'collector' as const}))))
  const edgeColumns=[footprint,...straightTrims].flatMap(r=>ringSegments(r,'joist',rule.joist).filter(m=>Math.abs(m.a.x-m.b.x)<T).map(m=>m.a.x))
  const infill=boards.pieces.filter(q=>q.kind==='infill'),jointXs:number[]=[]
  // Interior end joints, not every clipped row, create mandatory rail columns.
  const infillTrims=holes.flatMap((h,i)=>rounded[i]?[insetPolygon(h,-(w+gap))]:[])
  const trimEdges=[footprint,...trimHoles,...infillTrims].flatMap(r=>ringSegments(r,'rim',rule.joist)),trimIndex=index(trimEdges,face)
  for(const piece of infill){const outline=piece.outline??[];for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],q={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
    if(Math.abs(a.x-b.x)<E&&distance(a,b)>E&&!trimIndex.at(q).some(m=>pointSegmentDistance(q,m.a,m.b)<=face+fascia+T))jointXs.push(q.x)
  }}
  // Opposing butt ends share a rail centred in the gap, with enough bearing
  // on both pieces. Near rails are combined only within actual spare face.
  const pairedColumns=boardJoints.filter(j=>Math.abs(j.a.x-j.b.x)<T&&j.pieces.some(i=>boards.pieces[i].kind==='infill')).map(j=>j.a.x)
  const actualJointColumns=jointXs.map(x=>pairedColumns.find(t=>Math.abs(t-x)<=s.board.endGap/1000+T)??x)
  const snap=Math.max(0,contact-s.board.endGap/2000),mandatory=unique([...(footprint.length?[Math.min(...footprint.map(q=>q.x)),Math.max(...footprint.map(q=>q.x))]:[]),...edgeColumns,...boards.breakers.flatMap(x=>[x-breakerRailOffset(s),x+breakerRailOffset(s)]),...actualJointColumns,...pairedColumns,...(boards.perimeterSplices??[]).filter(q=>q.horizontal).map(q=>q.point.x)])
  const combined:number[]=[]
  for(const x of mandatory){const last=combined.at(-1);if(last!==undefined&&x-last<=2*snap+E)combined[combined.length-1]=(last+x)/2;else combined.push(x)}
  const xs=unique(combined.flatMap((x,i)=>i?evenly(combined[i-1],x,s.joistSpacing/1000):[x]))
  let upper:Member[]=footprint.length?xs.flatMap(x=>regionScan(footprint,trimHoles,x,true).map(([a,b])=>({a:{x,y:a},b:{x,y:b},kind:'joist' as const,size:rule.joist}))):[]
  const edgeExtensions:Member[]=footprint.length?xs.flatMap(x=>subtractIntervals(regionScan(envelope,envelopeHoles,x,true),regionScan(footprint,trimHoles,x,true)).filter(([a,b])=>!trimHoles.some((h,i)=>rounded[i]&&pointInside(h,{x,y:(a+b)/2}))).map(([a,b])=>({a:{x,y:a},b:{x,y:b},kind:'noggin' as const,size:rule.joist,role:'blocking' as const}))):[]
  const openingHeaders=straightTrims.flatMap(r=>ringSegments(r,'joist',rule.joist).filter(m=>Math.abs(m.a.y-m.b.y)<T).map(m=>({...m,role:'collector' as const})))
  upper=mergeLines([...upper,...collectors,...openingHeaders,...openingRims])
  let primary:Member[]=[],primaryAlternatives:Member[][]=[]
  let boundaryRowAlternatives:(()=>Member[][])|undefined
  const headerExtensions=new Map<Member[],Member[]>()
  const headerFrame=!!rule.bearer||transferFrame
  if(headerFrame&&envelope.length){
    const maxY=Math.max(...envelope.map(q=>q.y)),a=Math.min(maxY,(Math.min(...p.map(q=>q.y))+Math.max(baseInset,fascia))),b=Math.max(a,Math.max(...p.map(q=>q.y))-Math.max(baseInset,fascia))
    // Keep the report's 900 / 600 mm secondary spacing separate from primary
    // pedestal spans. No lower perimeter ring is added.
    const headerRows=openingHeaders.map(m=>m.a.y)
    const boardEndRows=transferFrame?boards.pieces.filter(piece=>piece.kind!=='infill').flatMap(piece=>{
      const axis=boardAxis(piece),ring=piece.outline??[],origin=ring[0];if(!origin||Math.abs(axis.y)<E)return []
      const local=ring.map(q=>({x:(q.x-origin.x)*axis.x+(q.y-origin.y)*axis.y,y:-(q.x-origin.x)*axis.y+(q.y-origin.y)*axis.x})),v=(Math.min(...local.map(q=>q.y))+Math.max(...local.map(q=>q.y)))/2
      return scan(local,v).flatMap(([a,b])=>[origin.y+axis.y*a+axis.x*v,origin.y+axis.y*b+axis.x*v])
    }):[]
    const jointRows=transferFrame?boardJoints.filter(j=>Math.abs(j.a.y-j.b.y)<T).map(j=>j.a.y):[]
    const nearestRow=(values:number[],y:number)=>values.filter(v=>Math.abs(y-v)<face+T).sort((a,b)=>Math.abs(a-y)-Math.abs(b-y))[0]
    const snapRow=(y:number)=>nearestRow(headerRows,y)??nearestRow(jointRows,y)??nearestRow(boardEndRows,y)??y
    const lowerCollectors:Member[]=transferFrame?[]:[...collectors,...openingHeaders].map(m=>({...m,kind:'bearer' as const,size:rule.bearer}))
    const headerLimit=transferFrame?rule.support:rule.bearerSpacing
    primaryAlternatives=[0,.025,.05,.075,.1,.15,.2].flatMap(inset=>{
      if(b-a<2*inset+T)return []
      let ys=unique(evenly(a+inset,b-inset,Math.min(headerLimit,s.frameStock)).map(snapRow))
      const rows=()=>{
        const across:Member[]=ys.flatMap(y=>regionScan(envelope,trimHoles,y).map(([lo,hi])=>({a:{x:lo,y},b:{x:hi,y},kind:transferFrame?'joist':'bearer',size:rule.bearer||rule.joist,...(transferFrame?{role:'support-header' as const,support:'pedestal' as const}:{})})))
        const directHeaders:Member[]=transferFrame?openingHeaders.map(m=>({...m,role:'support-header',support:'pedestal'})):[]
        const all=mergeLines([...across,...directHeaders,...lowerCollectors.filter(m=>!continuouslyBorne(m,across))]),legal=pedestalBaseIntervals(all,p,holes,s)
        // An acute corner can clip a grid row outside every legal base centre.
        // Do not demand a pedestal on that sliver. The complete bearing/span
        // audit still checks the joists carried by the adjoining collectors.
        return all.filter((m,i)=>m.role==='collector'||legal[i].length)
      }
      const preliminary=rows(),lookup=index(preliminary,T),entered=rule.joist===80?s.joistOverhang80:s.joistOverhang35,goal=entered===undefined?Math.max(baseInset,.1):entered/1000
      // A new arm beside a house can start halfway between global grid rows.
      // Add a local end row rather than leave a long avoidable projection. The
      // target is an optimisation preference, never a rated overhang allowance.
      for(const m of upper.filter(m=>Math.abs(m.a.x-m.b.x)<T)){
        const l=length(m),ts=segmentBearings(m,lookup.along(m)),start=ts[0]??l,end=ts.at(-1)??0
        for(const [amount,q,sign] of [[start,m.a,1],[l-end,m.b,-1]] as const){
          const atRound=trimHoles.some((h,i)=>rounded[i]&&boundaryDistance(h,q)<T)
          // These are measured concept projections, not manufacturer limits.
          // A shared row beside the rim avoids one lower bearer per tiny facet.
          const target=atRound&&entered===undefined?Math.max(baseInset,Math.min(.3,headerLimit/2)):goal,y0=q.y+sign*target,y=transferFrame?snapRow(y0):y0
          if(amount>target+T&&y>=a-T&&y<=b+T&&!ys.some(v=>Math.abs(v-y)<Math.max(face,transferFrame||atRound?diameter:face)+T))ys.push(y)
        }
      }
      ys=unique(ys)
      // Filtering an impossible tiny corner row can open an interior bay a
      // little wider than the report allows. Repair actual member bearings,
      // not just the nominal global grid or terminal projections.
      const upperJunctions=transferFrame?index(upper,T):null
      for(let attempt=0;attempt<200;attempt++){
        const current=rows(),lookup=index(current,T)
        const gap=upper.filter(m=>Math.abs(m.a.x-m.b.x)<T).flatMap(m=>{
          const ts=segmentBearings(m,[...lookup.along(m),...upperJunctions?.along(m).filter(n=>n!==m)??[]])
          return ts.slice(1).flatMap((b,i)=>b-ts[i]>headerLimit+T?[{m,a:ts[i],b}]:[])
        })[0]
        if(!gap)break
        const y=gap.m.a.y+(gap.a+gap.b)/2
        if(ys.some(v=>Math.abs(v-y)<face+T))break
        ys=unique([...ys,y])
      }
      return [rows()]
    })
    if(rule.bearer)boundaryRowAlternatives=()=>{
      // A regular row can enter an L-shaped arm too close to its inner edge:
      // its bases fit the wide part, but cannot fit anywhere along the arm.
      // Generate an alternative grid aligned to actual horizontal boundaries,
      // then subdivide its bays at the applicable report spacing.
      const edgeRows=[p,...holes].flatMap(r=>r.flatMap((q,i)=>Math.abs(q.y-r[(i+1)%r.length].y)<T?[q.y-baseInset,q.y+baseInset]:[]))
      const pinned=unique([a,b,...edgeRows.filter(y=>y>a+T&&y<b-T)]),ys=unique(pinned.flatMap((y,i)=>i?evenly(pinned[i-1],y,Math.min(headerLimit,s.frameStock)):[y]))
      const across:Member[]=ys.flatMap(y=>regionScan(envelope,trimHoles,y).map(([lo,hi])=>({a:{x:lo,y},b:{x:hi,y},kind:'bearer',size:rule.bearer})))
      const raw=mergeLines([...across,...lowerCollectors.filter(m=>!continuouslyBorne(m,across))]),legal=pedestalBaseIntervals(raw,p,holes,s)
      return [raw.filter((m,i)=>m.role==='collector'||legal[i].length)]
    }
    if(transferFrame)primaryAlternatives=primaryAlternatives.map(raw=>{
      const extensions:Member[]=[],legal=pedestalBaseIntervals(raw,p,holes,s),joists=index(upper,T)
      const prepared=raw.map((m,i)=>{
        if(!legal[i].length)return m
        const l=length(m),first=legal[i][0][0],last=legal[i].at(-1)![1],cap=(m.size===80?s.joistOverhang80:s.joistOverhang35),goal=cap===undefined?Math.min(.25,s.frameStock):cap/1000
        const transverse=joists.along(m).filter(n=>Math.abs((m.b.x-m.a.x)*(n.b.y-n.a.y)-(m.b.y-m.a.y)*(n.b.x-n.a.x))>1e-6*l*length(n)),hits=segmentBearings(m,transverse)
        const a=first>goal+T?hits.filter(t=>t<=first+T&&first-t<=goal+T).at(-1)??0:0,b=l-last>goal+T?hits.find(t=>t>=last-T&&t-last<=goal+T)??l:l
        if(a>T)extensions.push({...m,b:at(m,a/l),support:'transfer'})
        if(l-b>T)extensions.push({...m,a:at(m,b/l),support:'transfer'})
        return {...m,a:at(m,a/l),b:at(m,b/l)}
      })
      headerExtensions.set(prepared,extensions);return prepared
    })
    primary=primaryAlternatives[0]??[]
  }else primary=upper.filter(m=>m.support!=='transfer')
  let solved=issues.length?{members:[] as Member[],pedestals:[] as Point[],splices:[] as Point[],conflicts:[] as Point[],error:'',placementDiagnostics:[] as PlacementDiagnostic[]}:placePrimary(primary,p,holes,s,rule)
  if(solved.error&&headerFrame)for(const alternative of primaryAlternatives.slice(1)){
    const candidate=placePrimary(alternative,p,holes,s,rule)
    if(!candidate.error){primary=alternative;solved=candidate;break}
  }
  if(solved.error&&boundaryRowAlternatives)for(const alternative of boundaryRowAlternatives()){
    const candidate=placePrimary(alternative,p,holes,s,rule)
    if(!candidate.error){primary=alternative;solved=candidate;break}
  }
  if(solved.error){issues.push(solved.error);conflicts.push(...solved.conflicts)}
  let members:Member[]=[...solved.members],splices=[...solved.splices]
  if(rule.bearer&&solved.members.length){const secondary=splitStock(upper.filter(m=>m.role!=='opening-rim'),solved.members,s.frameStock);members.push(...secondary.members,...openingRims);splices.push(...secondary.splices);if(secondary.error)issues.push(secondary.error)}
  if(!headerFrame&&solved.members.length)members.push(...openingRims)
  if(transferFrame&&solved.members.length){
    const headers=index(solved.members,T),links=[...upper,...headerExtensions.get(primary)??[]].map(m=>({...m,support:'transfer' as const}))
    members.push(...splitCrossings([...solved.members,...links]).filter(m=>m.support==='transfer'&&!continuouslyBorne(m,headers.along(m))))
  }
  // Follow the actual opening with mitred straight rim sections. Count only
  // real joist/header contacts around the whole ring: touching rim facets do
  // not reset its unsupported span. Add a short outward tie in a missing bay.
  const openingTies:Member[]=[],rimGroups=holes.flatMap((_,i)=>!rounded[i]?[]:Array.from({length:s.pictureFrameRows??1},(_,row)=>openingRims.filter(m=>m.openingIndex===i&&m.openingRow===row)))
  for(const ring of rimGroups){
    const centre=holes[ring[0].openingIndex!].reduce((a,q)=>({x:a.x+q.x/holes[ring[0].openingIndex!].length,y:a.y+q.y/holes[ring[0].openingIndex!].length}),{x:0,y:0})
    for(let attempt=0;attempt<200;attempt++){
      const supports=[...members.filter(m=>m.kind!=='bearer'&&m.role!=='opening-rim'),...openingTies],contacts=rimContacts(ring,supports),bay=contacts.gaps.sort((a,b)=>(b.b-b.a)-(a.b-a.a))[0]
      if(bay.b-bay.a<=s.joistSpacing/1000+T)break
      let t=((bay.a+bay.b)/2)%contacts.circumference,q=ring[0].a
      for(const m of ring){const l=length(m);if(t<=l+T){q=at(m,t/l);break}t-=l}
      const sign=q.x>=centre.x?1:-1,reach=Math.max(...p.map(q=>q.x))-Math.min(...p.map(q=>q.x)),options:Member[]=[]
      for(const direction of [sign,-sign]){
        const ray:Member={a:q,b:{x:q.x+direction*reach,y:q.y},kind:'noggin',size:rule.joist,role:'opening-tie',openingIndex:ring[0].openingIndex}
        for(const d of segmentBearings(ray,supports).filter(d=>d>face+T)){
          const tie={...ray,b:at(ray,d/reach)}
          if(!memberCrossesOpening(tie,holes,face)&&[.25,.5,.75,1].every(t=>pointInside(envelope,at(tie,t)))){options.push(tie);break}
        }
      }
      const tie=options.sort((a,b)=>length(a)-length(b))[0]
      if(!tie)break
      openingTies.push(tie)
    }
  }
  const openingRimSplices:Point[]=[]
  if(openingRims.length){
    const rimStock=splitStock(openingRims,[...members.filter(m=>m.kind!=='bearer'&&m.role!=='opening-rim'),...openingTies],s.frameStock)
    if(rimStock.error)issues.push(`Opening rim: ${rimStock.error}`)
    openingRimSplices.push(...rimStock.splices);splices.push(...rimStock.splices)
    const cut=splitCrossings([...members.filter(m=>m.kind!=='bearer'&&m.role!=='opening-rim'),...rimStock.members,...openingTies]).filter(m=>m.role==='opening-rim'||m.role==='opening-tie')
    members=[...members.filter(m=>m.role!=='opening-rim'),...cut]
  }
  // Cross-running picture-frame boards need a real double-joist ladder. The
  // outer rail's outside FACE, not its centre, is one fascia thickness inside
  // the deck outline. It is carried by real rungs back to the supported inner
  // rail; it does not receive an extra row of out-of-bounds pedestal bases.
  const innerUpper=members.filter(m=>m.kind!=='bearer'),innerIndex=index(innerUpper,T),outerOffsets=p.map((a,i)=>Math.abs(a.y-p[(i+1)%p.length].y)<T?fascia:fascia+face/2)
  const outsideRuns=perimeterBoardRuns(p,s).filter(r=>r.row===0),edgeLadders:{edges:number[];outer:Member;normal:Point}[]=[],edgeRailSplices:Point[]=[],edgeRungs:Member[]=[]
  const winding=signedArea(p)>0?1:-1
  for(const run of outsideRuns){
    const runLength=distance(run.a,run.b),axis={x:(run.b.x-run.a.x)/runLength,y:(run.b.y-run.a.y)/runLength}
    if(Math.abs(axis.y)<E)continue
    const outer:Member={a:insetEdgeSegment(p,outerOffsets,run.edges[0]).a,b:insetEdgeSegment(p,outerOffsets,run.edges.at(-1)!).b,kind:'rim',size:rule.joist,role:'edge-rail'}
    const l=length(outer);if(l<T)continue
    const normal={x:-axis.y*winding,y:axis.x*winding},cuts=evenly(0,l,s.frameStock),levels:number[]=[]
    for(let i=1;i<cuts.length;i++)members.push({...outer,a:at(outer,cuts[i-1]/l),b:at(outer,cuts[i]/l)})
    for(const t of cuts.slice(1,-1)){const q=at(outer,t/l);edgeRailSplices.push(q);levels.push(t)}
    const pieces=boards.pieces.filter(q=>q.kind==='perimeter'&&(q.perimeterEdge===run.edge||q.perimeterEdge===undefined&&distance({x:q.x,y:q.y},run.a)<T))
    for(const piece of pieces){
      const ring=piece.outline??[],origin=ring[0],local=ring.map(q=>({x:(q.x-origin.x)*axis.x+(q.y-origin.y)*axis.y,y:-(q.x-origin.x)*axis.y+(q.y-origin.y)*axis.x}))
      if(!origin)continue
      const v=(Math.min(...local.map(q=>q.y))+Math.max(...local.map(q=>q.y)))/2
      for(const t of scan(local,v).flat()){
        const q={x:origin.x+axis.x*t-axis.y*v,y:origin.y+axis.y*t+axis.x*v}
        levels.push(Math.max(0,Math.min(l,(q.x-outer.a.x)*axis.x+(q.y-outer.a.y)*axis.y)))
      }
    }
    const closeLevels:number[][]=[]
    for(const t of unique(levels.length?levels:[0,l])){const group=closeLevels.at(-1);if(group&&t-group[0]<=2*Math.max(0,contact)+T)group.push(t);else closeLevels.push([t])}
    const mandatory=unique([0,...closeLevels.map(g=>(g[0]+g.at(-1)!)/2),l]),rungs=unique(mandatory.flatMap((t,i)=>i?evenly(mandatory[i-1],t,s.joistSpacing/1000):[t]))
    for(const t of rungs){
      const q=at(outer,t/l),reach=Math.max(.5,w*2+baseInset+fascia+face*2),ray:Member={a:q,b:{x:q.x+normal.x*reach,y:q.y+normal.y*reach},kind:'noggin',size:rule.joist,role:'blocking'}
      const hit=segmentBearings(ray,innerIndex.along(ray)).find(t=>t>face-T)
      if(hit!==undefined)edgeRungs.push({...ray,b:at(ray,hit/reach)})
    }
    edgeLadders.push({edges:run.edges,outer,normal})
  }
  // Cross-running outline boards and breakers need transverse blocking. It is
  // made only where a real installed piece calls for it, including stock ends.
  const blocking:Member[]=[]
  const supportUpper=members.filter(m=>m.kind!=='bearer'),upperIndex=index(supportUpper,face)
  for(const piece of boards.pieces.filter(q=>q.kind==='perimeter'||q.kind==='breaker')){
    if(piece.openingIndex!==undefined&&rounded[piece.openingIndex])continue
    const axis=piece.axis??(piece.kind==='breaker'?{x:0,y:1}:{x:1,y:0})
    if(Math.abs(axis.y)<E)continue
    if(piece.kind==='perimeter'&&edgeLadders.some(ladder=>piece.perimeterEdge===ladder.edges[0]||piece.perimeterEdge===undefined&&distance({x:piece.x,y:piece.y},p[ladder.edges[0]])<T))continue
    const outline=piece.outline??[],origin=outline[0],normal={x:-axis.y,y:axis.x},local=outline.map(q=>({x:(q.x-origin.x)*axis.x+(q.y-origin.y)*axis.y,y:(q.x-origin.x)*normal.x+(q.y-origin.y)*normal.y})),v=(Math.min(...local.map(q=>q.y))+Math.max(...local.map(q=>q.y)))/2
    const centreEnds=scan(local,v).flatMap(([a,b])=>[origin.y+axis.y*a+normal.y*v,origin.y+axis.y*b+normal.y*v])
    const minY=Math.min(...outline.map(q=>q.y)),maxY=Math.max(...outline.map(q=>q.y)),ys=centreEnds.length?evenly(Math.min(...centreEnds),Math.max(...centreEnds),Math.max(.05,s.joistSpacing/1000*Math.abs(axis.y))):[]
    for(const y0 of ys){
      const inward=Math.sign((minY+maxY)/2-y0),attempts=[0,...Array.from({length:50},(_,i)=>(i+1)*.005*Math.abs(axis.y))]
      for(const move of attempts){
        const y=y0+inward*move,runs=scan(outline,Math.max(minY+E,Math.min(maxY-E,y))),physical=regionScan(envelope,envelopeHoles,y)
        const ray={a:{x:Math.min(...p.map(q=>q.x))-1,y},b:{x:Math.max(...p.map(q=>q.x))+1,y},kind:'noggin' as const,size:rule.joist},rayLength=length(ray)
        const hits=unique(upperIndex.along(ray).flatMap(m=>segmentBearings(ray,[m]).map(t=>at(ray,t/rayLength).x)))
        let added=false
        for(const [a,b] of runs)for(const [ea,eb] of physical){
          if(b<ea-E||a>eb+E)continue
          const legalHits=hits.filter(x=>x>=ea-T&&x<=eb+T),left=legalHits.filter(x=>x<=a+contact+T).at(-1),right=legalHits.find(x=>x>=b-contact-T)
          const from=left??legalHits.find(x=>x>=a-T),to=right??legalHits.filter(x=>x<=b+T).at(-1)
          if(from===undefined&&to===undefined)continue
          const start=Math.max(ea,Math.min(a,from??to!)-face/2),end=Math.min(eb,Math.max(b,to??from!)+face/2)
          if(end-start>T){blocking.push({a:{x:start,y},b:{x:end,y},kind:'noggin',size:rule.joist,role:'blocking'});added=true}
        }
        if(added)break
      }
    }
  }

  // Split at real upper intersections so transverse pieces do not pass through
  // a joist at the same level. Matching end connectors remain provisional.
  // Two board ends separated by an installation gap share one centred face.
  // Only combine rows within the face's spare bearing width.
  const stripGroups:{a:number;b:number;members:Member[]}[]=[]
  for(const m of [...blocking].sort((a,b)=>a.a.x-b.a.x)){
    const last=stripGroups.at(-1)
    if(last&&m.a.x<=last.b+T){last.b=Math.max(last.b,m.b.x);last.members.push(m)}else stripGroups.push({a:m.a.x,b:m.b.x,members:[m]})
  }
  const alignedBlocking:Member[]=stripGroups.flatMap(strip=>{
    const rowGroups:number[][]=[]
    for(const y of unique(strip.members.map(m=>m.a.y))){const group=rowGroups.at(-1);if(group&&y-group[0]<=2*contact+E)group.push(y);else rowGroups.push([y])}
    const jointRows=boardJoints.filter(j=>Math.abs(j.a.y-j.b.y)<T&&Math.max(j.a.x,j.b.x)>=strip.a-T&&Math.min(j.a.x,j.b.x)<=strip.b+T).map(j=>j.a.y)
    const rowMap=new Map(rowGroups.flatMap(g=>{
      const centre=(g[0]+g.at(-1)!)/2,preferred=jointRows.filter(y=>Math.abs(y-centre)<=contact+T).sort((a,b)=>Math.abs(a-centre)-Math.abs(b-centre))[0]
      return g.map(y=>[y,preferred??centre] as const)
    }))
    return strip.members.flatMap(m=>{
      let y=rowMap.get(Math.round(m.a.y*1e7)/1e7)??m.a.y
      const sharedHeader=supportUpper.find(n=>Math.abs(n.a.y-n.b.y)<T&&Math.abs(n.a.y-y)<=contact-s.board.endGap/2000+T&&Math.max(n.a.x,n.b.x)>=m.a.x-T&&Math.min(n.a.x,n.b.x)<=m.b.x+T)
      if(sharedHeader)y=sharedHeader.a.y
      const ray={...m,a:{...m.a,x:m.a.x-.1,y},b:{...m.b,x:m.b.x+.1,y}},l=length(ray)
      const hits=segmentBearings(ray,upperIndex.along(ray)).map(t=>at(ray,t/l).x)
      let a=m.a.x,b=m.b.x
      if(!hits.some(x=>x>=a-T&&x<=b+T)&&hits.length){const nearest=hits.sort((x,z)=>Math.min(Math.abs(x-a),Math.abs(x-b))-Math.min(Math.abs(z-a),Math.abs(z-b)))[0];a=Math.min(a,nearest);b=Math.max(b,nearest)}
      return regionScan(envelope,envelopeHoles,y).flatMap(([lo,hi])=>Math.min(b,hi)-Math.max(a,lo)>T?[{...m,a:{x:Math.max(a,lo),y},b:{x:Math.min(b,hi),y}}]:[])
    })
  })
  const jointSamples=(j:{a:Point;b:Point})=>[.25,.5,.75].map(t=>at(j,t)).filter(q=>pointInside(envelope,q)&&!envelopeHoles.some(h=>pointInside(h,q)))
  const preliminary=[...supportUpper,...alignedBlocking,...edgeExtensions,...edgeRungs],preIndex=index(preliminary,Math.max(face,.4)),jointBlocking:Member[]=[]
  for(const j of boardJoints){
    if(jointSamples(j).every(q=>preIndex.at(q).some(m=>pointSegmentDistance(q,m.a,m.b)<=contact-j.gap/2+T)))continue
    const l=length(j),extension=.4,ray:Member={a:at(j,-extension/l),b:at(j,1+extension/l),kind:'noggin',size:rule.joist,role:'blocking'},hits=segmentBearings(ray,preIndex.along(ray)),start=extension,end=extension+l
    const near=hits.sort((a,b)=>Math.min(Math.abs(a-start),Math.abs(a-end))-Math.min(Math.abs(b-start),Math.abs(b-end)))[0]
    if(near===undefined)continue
    const lo=Math.min(start,near),hi=Math.max(end,near),beam={...ray,a:at(ray,lo/length(ray)),b:at(ray,hi/length(ray))}
    const boundaries=[...ringSegments(envelope,'rim',0),...envelopeHoles.flatMap(h=>ringSegments(h,'rim',0))],bl=length(beam),cuts=unique([0,bl,...segmentBearings(beam,boundaries)])
    for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],q=at(beam,(a+b)/2/bl);if(b-a>T&&pointInside(envelope,q)&&!envelopeHoles.some(h=>pointInside(h,q)))jointBlocking.push({...beam,a:at(beam,a/bl),b:at(beam,b/bl)})}
  }
  const candidates=mergeLines([...alignedBlocking,...edgeExtensions,...edgeRungs,...jointBlocking],Math.max(gap,s.board.endGap/1000)+T),candidateIndex=index(candidates,face),removed=new Set<Member>()
  const carriesJoint=(m:Member)=>boardJoints.some(j=>jointSamples(j).length>0&&jointSamples(j).every(q=>pointSegmentDistance(q,m.a,m.b)<=contact-j.gap/2+T))
  for(const m of candidates){if(removed.has(m))continue;const l=length(m),ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l
    for(const n of candidateIndex.along(m)){if(n===m||removed.has(n))continue;const nl=length(n)
      if(Math.abs(ux*(n.b.y-n.a.y)/nl-uy*(n.b.x-n.a.x)/nl)>1e-5)continue
      const separation=Math.abs((n.a.x-m.a.x)*uy-(n.a.y-m.a.y)*ux),a=(n.a.x-m.a.x)*ux+(n.a.y-m.a.y)*uy,b=(n.b.x-m.a.x)*ux+(n.b.y-m.a.y)*uy
      if(separation>=face-T||Math.min(l,Math.max(a,b))-Math.max(0,Math.min(a,b))<=T)continue
      const mj=carriesJoint(m),nj=carriesJoint(n)
      if(mj&&nj)continue // two mandatory faces require a genuine layout change
      const drop=mj?n:nj?m:l>=nl?n:m;removed.add(drop);if(drop===m)break
    }
  }
  const blockerRuns=candidates.filter(m=>!removed.has(m))
  // Pruning a redundant edge row must not leave a breaker with a double bay.
  // Refill any resulting gap between real crossings, then recheck all faces.
  for(const piece of boards.pieces.filter(q=>q.kind==='breaker')){
    const x=piece.x+piece.width/2,ray:Member={a:{x,y:piece.y},b:{x,y:piece.y+piece.length},kind:'noggin',size:rule.joist}
    for(let attempt=0;attempt<100;attempt++){
      const hits=segmentBearings(ray,[...supportUpper,...blockerRuns]),pair=hits.slice(1).map((b,i)=>[hits[i],b]).find(([a,b])=>b-a>s.joistSpacing/1000+T)
      if(!pair)break
      let y=piece.y+(pair[0]+pair[1])/2
      const near=[...supportUpper,...blockerRuns].find(m=>Math.abs(m.a.y-m.b.y)<T&&Math.abs(m.a.y-y)<face+T&&Math.max(m.a.x,m.b.x)>=piece.x-face&&Math.min(m.a.x,m.b.x)<=piece.x+piece.width+face)
      if(near)y=near.a.y
      const horizontal:Member={a:{x:Math.min(...p.map(q=>q.x))-1,y},b:{x:Math.max(...p.map(q=>q.x))+1,y},kind:'noggin',size:rule.joist},l=length(horizontal)
      const xs=segmentBearings(horizontal,upperIndex.along(horizontal)).map(t=>at(horizontal,t/l).x),left=xs.filter(v=>v<=piece.x+contact+T).at(-1),right=xs.find(v=>v>=piece.x+piece.width-contact-T)
      if(left===undefined||right===undefined)break
      blockerRuns.push({a:{x:left,y},b:{x:right,y},kind:'noggin',size:rule.joist,role:'blocking'})
    }
  }
  for(const ladder of edgeLadders){
    const rail=ladder.outer,l=length(rail)
    for(let attempt=0;attempt<100;attempt++){
      const transverse=blockerRuns.filter(m=>!edgeLadders.some(l=>on(m.a,l.outer)&&on(m.b,l.outer)))
      const hits=segmentBearings(rail,[...innerUpper,...transverse]),pair=hits.slice(1).map((b,i)=>[hits[i],b]).find(([a,b])=>b-a>s.joistSpacing/1000+T)
      if(!pair)break
      const q=at(rail,(pair[0]+pair[1])/2/l),reach=Math.max(.5,w*2+baseInset+fascia+face*2),ray:Member={a:q,b:{x:q.x+ladder.normal.x*reach,y:q.y+ladder.normal.y*reach},kind:'noggin',size:rule.joist,role:'blocking'}
      const hit=segmentBearings(ray,innerIndex.along(ray)).find(t=>t>face-T)
      if(hit===undefined)break
      blockerRuns.push({...ray,b:at(ray,hit/reach)})
    }
  }
  const snappedBlocks=blockerRuns.flatMap(m=>{
    if(Math.abs(m.a.y-m.b.y)>T)return [m]
    const reach=transferFrame&&!carriesJoint(m)?face:contact-s.board.endGap/2000
    const header=supportUpper.find(n=>Math.abs(n.a.y-n.b.y)<T&&Math.abs(n.a.y-m.a.y)<=reach+T&&Math.max(n.a.x,n.b.x)>=Math.min(m.a.x,m.b.x)-T&&Math.min(n.a.x,n.b.x)<=Math.max(m.a.x,m.b.x)+T)
    const y=header?.a.y??m.a.y
    return regionScan(envelope,envelopeHoles,y).flatMap(([a,b])=>{
      const lo=Math.max(a,Math.min(m.a.x,m.b.x)),hi=Math.min(b,Math.max(m.a.x,m.b.x))
      return hi-lo>T?[{...m,a:{x:m.a.x<=m.b.x?lo:hi,y},b:{x:m.a.x<=m.b.x?hi:lo,y}}]:[]
    })
  })
  const buried=(m:Member)=>upperIndex.at(m.a).some(n=>inFace(m.a,n,face/2)&&inFace(m.b,n,face/2))
  let joinedBlocks=mergeLines(snappedBlocks),splitBlocks=splitCrossings([...supportUpper,...joinedBlocks]).filter(m=>m.kind==='noggin'&&!buried(m))
  // Check the actual cut rungs as well: joining, snapping and removing pieces
  // buried in an existing joist can change the contacts used by the seed grid.
  for(const ladder of edgeLadders)for(let attempt=0;attempt<100;attempt++){
    const rail=ladder.outer,l=length(rail),hits=rungContacts(rail,[...innerUpper,...splitBlocks],face/2),pair=hits.slice(1).map((b,i)=>[hits[i],b]).find(([a,b])=>b-a>s.joistSpacing/1000+T)
    if(!pair)break
    const q=at(rail,(pair[0]+pair[1])/2/l),reach=Math.max(.5,w*2+baseInset+fascia+face*2),ray:Member={a:q,b:{x:q.x+ladder.normal.x*reach,y:q.y+ladder.normal.y*reach},kind:'noggin',size:rule.joist,role:'blocking'}
    const hit=segmentBearings(ray,innerIndex.along(ray)).find(t=>t>face-T)
    if(hit===undefined)break
    const rung={...ray,b:at(ray,hit/reach)}
    joinedBlocks=mergeLines([...joinedBlocks,rung])
    splitBlocks=splitCrossings([...supportUpper,...joinedBlocks]).filter(m=>m.kind==='noggin'&&!buried(m))
  }
  // Cut outer rail stock on the rungs that actually survived spacing/joint
  // alignment, rather than leave an arbitrary equal-length splice unsupported.
  const railCuts=splitStock(edgeLadders.map(l=>l.outer),[...innerUpper,...splitBlocks],s.frameStock)
  if(railCuts.error)issues.push(`Edge ladder: ${railCuts.error}`)
  edgeRailSplices.splice(0,edgeRailSplices.length,...railCuts.splices);splices.push(...railCuts.splices)
  const edgeRails=transferFrame?splitCrossings([...railCuts.members,...innerUpper.filter(m=>m.role==='support-header')]).filter(m=>m.role==='edge-rail'):railCuts.members
  const allUpper=[...innerUpper,...edgeRails,...splitBlocks]
  if(solved.members.length)allUpper.push(...repairInstalledBoardSupports(boards,allUpper,holes,envelope,envelopeHoles,s,rule))
  // Preserve supported stock joints; splitting for an end connection is not a
  // new unsupported stock splice and is recorded separately as a connection.
  const lower=members.filter(m=>m.kind==='bearer'),lowerRows=lower.filter(m=>m.role!=='collector')
  const cutCollectors=splitCrossings(lower).filter(m=>m.role==='collector').map(m=>solved.pedestals.some(q=>on(q,m))?m:{...m,role:'bearer-link' as const})
  members=[...lowerRows,...cutCollectors,...allUpper]
  return auditBoardSupports(p,s,boards,rule,{members,pedestals:solved.pedestals,splices,primarySplices:solved.splices,edgeRailSplices,openingRimSplices,footprint,envelope,envelopeHoles,rimGroups,issues,conflicts,transferFrame,draftMembers:[...primary,...upper,...blockerRuns],placementDiagnostics:solved.placementDiagnostics??[],manual:false})
}


type FrameAuditInput={members:Member[];pedestals:Point[];splices:Point[];primarySplices:Point[];edgeRailSplices:Point[];openingRimSplices:Point[];footprint:Point[];envelope:Point[];envelopeHoles:Point[][];rimGroups:Member[][];issues:string[];conflicts:Point[];transferFrame:boolean;draftMembers:Member[];placementDiagnostics:PlacementDiagnostic[];manual:boolean}
function prepareEditedMembers(raw:Member[],pedestals:Point[],s:Settings,rule:Rule){
  const primary=raw.filter(m=>m.kind===(rule.bearer?'bearer':'joist')&&m.support!=='transfer'&&m.role!=='bearer-link'),primarySet=new Set(primary),lookup=index(raw,T),feet=index(pedestals.map(q=>({a:q,b:q})),T),splices:Point[]=[],members:Member[]=[]
  for(const m of raw){
    const l=length(m);if(l<T){members.push(m);continue}
    const hits=primarySet.has(m)?feet.along(m).filter(q=>on(q.a,m)).map(q=>distance(m.a,q.a)):segmentBearings(m,(rule.bearer&&m.kind==='joist'&&m.support!=='transfer'?primary:lookup.along(m).filter(n=>n!==m&&n.kind!=='bearer'&&Math.abs((m.b.x-m.a.x)*(n.b.y-n.a.y)-(m.b.y-m.a.y)*(n.b.x-n.a.x))>T*l*length(n))))
    let start=0
    while(l-start>s.frameStock+T){const end=hits.filter(t=>t>start+T&&t<=start+s.frameStock+T).sort((a,b)=>a-b).at(-1);if(end===undefined)break;members.push({...m,a:at(m,start/l),b:at(m,end/l)});splices.push(at(m,end/l));start=end}
    members.push({...m,a:at(m,start/l)})
  }
  // Collinear stock ends need a genuine external bearing. Merely touching
  // their neighbour never turns two unsupported pieces into a supported beam.
  const ends=new Map<string,Member[]>()
  for(const m of members)for(const q of [m.a,m.b]){const key=`${q.x.toFixed(5)},${q.y.toFixed(5)}|${m.kind}`,bucket=ends.get(key)??[]
    if(bucket.some(n=>Math.abs((m.b.x-m.a.x)*(n.b.y-n.a.y)-(m.b.y-m.a.y)*(n.b.x-n.a.x))<T*length(m)*length(n)))splices.push(q)
    bucket.push(m);ends.set(key,bucket)
  }
  return {members,splices}
}
function auditBoardSupports(p:Point[],s:Settings,boards:Boards,rule:Rule,input:FrameAuditInput){
  let {members}=input
  const {pedestals,splices,primarySplices,edgeRailSplices,openingRimSplices,footprint,envelope,envelopeHoles,rimGroups,issues,conflicts,transferFrame,draftMembers,placementDiagnostics,manual}=input
  const face=(s.frameFaceWidth??35)/1000,bearing=(s.boardEndBearing??10)/1000,gap=s.board.gap/1000,w=pictureFrameWidth(s),fascia=(s.fasciaClearance??s.board.thickness)/1000,diameter=(s.pedestalDiameter??150)/1000,baseInset=diameter/2+(s.pedestalClearance??0)/1000,holes=(s.cutouts??[]).map(h=>h.polygon),contact=face/2-bearing
  const checks:{name:string;ok:boolean;detail:string}[]=[],verificationNotes:string[]=[],projections:FrameProjection[]=[],boardJoints=boardStockJoints(boards.pieces,s.board.endGap/1000),allUpper=members.filter(m=>m.kind!=='bearer')
  const jointSamples=(j:{a:Point;b:Point})=>[.25,.5,.75].map(t=>at(j,t)).filter(q=>pointInside(envelope,q)&&!envelopeHoles.some(h=>pointInside(h,q)))
  const jointBorne=(j:{a:Point;b:Point;gap:number},q:Point,faces:ReturnType<typeof index<Member>>)=>{
    const candidates=faces.at(q)
    if(candidates.some(m=>pointSegmentDistance(q,m.a,m.b)<=contact-j.gap/2+T))return true
    const l=length(j),nx=-(j.b.y-j.a.y)/l,ny=(j.b.x-j.a.x)/l,reach=bearing+j.gap/2,probe:Member={a:{x:q.x-nx*reach,y:q.y-ny*reach},b:{x:q.x+nx*reach,y:q.y+ny*reach},kind:'rim',size:rule.joist}
    return continuouslyBorne(probe,longitudinalFaceRuns(probe,candidates,face/2))
  }
  const primaryMembers=members.filter(m=>m.kind===(rule.bearer?'bearer':'joist')&&m.role!=='bearer-link'&&m.support!=='transfer'),primaryIndex=index(primaryMembers,T),lowerBearingIndex=rule.bearer?index(members.filter(m=>m.kind==='bearer'),T):primaryIndex,pedIndex=index(pedestals.map(q=>({a:q,b:q})),diameter)
  const bearingUpper=index(allUpper,face/2+T),connected=new Set(allUpper.filter(m=>m.kind!=='noggin'&&m.role!=='edge-rail'&&m.support!=='transfer')),queue=[...connected]
  const editedSpliceIndex=manual?index(members,T):null,primarySet=new Set(primaryMembers)
  // Establish a geometric load path through the actual cut ends. These edges
  // explicitly require unverified connectors; connectivity is not a capacity
  // approval. An isolated set of touching blocking pieces cannot pass.
  for(let cursor=0;cursor<queue.length;cursor++){const m=queue[cursor];for(const n of bearingUpper.along(m))if(!connected.has(n)&&segmentBearings(n,[m]).length){connected.add(n);queue.push(n)}}
  // Generated extensions without an anchored connection are not installed
  // framing. Drop them, then check every board/joint against the real members.
  const orphaned=new Set(allUpper.filter(m=>m.kind==='noggin'&&!connected.has(m)))
  if(!manual&&orphaned.size){members=members.filter(m=>!orphaned.has(m));for(let i=allUpper.length-1;i>=0;i--)if(orphaned.has(allUpper[i]))allUpper.splice(i,1)}
  const upperClash=faceClash(allUpper,face),primaryClash=faceClash(members.filter(m=>m.kind==='bearer'),face)
  if(upperClash||primaryClash){issues.push('Required upper support faces overlap or members cross at the same elevation. Change the joint layout or support face width.');conflicts.push(...upperClash??primaryClash??[])}
  let maxPrimarySpan=0,maxSecondarySpan=0,maxEdgeRailSpan=0,stockBearing=true,projectionLimits=true,hasSupports=true
  members.forEach((m,i)=>{
    const l=length(m),isLink=m.role==='bearer-link',isTransfer=m.support==='transfer',isPrimary=m.kind===(rule.bearer?'bearer':'joist')&&!isLink&&!isTransfer,isBlocking=m.kind==='noggin'||m.role==='edge-rail'||isTransfer
    const supports=(isLink?primaryIndex:isBlocking?bearingUpper:lowerBearingIndex).along(m).filter(n=>n!==m&&(!isBlocking||connected.has(n))&&(m.role!=='edge-rail'||n.role!=='edge-rail')),continuous=!isPrimary&&!isBlocking&&!isLink&&continuouslyBorne(m,supports)
    let ts=isPrimary?unique(pedIndex.along(m).map(q=>q.a).filter(q=>on(q,m)).map(q=>distance(m.a,q))):segmentBearings(m,supports)
    if(m.role==='edge-rail')ts=rungContacts(m,supports,face/2)
    if(!ts.length||isBlocking&&!connected.has(m)){hasSupports=false;conflicts.push(m.a);return}
    ts=ts.filter(t=>t>=-T&&t<=l+T)
    if(!ts.length){hasSupports=false;return}
    for(let j=1;j<ts.length;j++){if(isPrimary||isLink||isTransfer){maxPrimarySpan=Math.max(maxPrimarySpan,ts[j]-ts[j-1]);if(ts[j]-ts[j-1]>rule.support+T)conflicts.push(at(m,(ts[j]+ts[j-1])/2/l))}else if(m.role==='edge-rail')maxEdgeRailSpan=Math.max(maxEdgeRailSpan,ts[j]-ts[j-1]);else if(!isBlocking&&!continuous&&!continuouslyBorne({...m,a:at(m,ts[j-1]/l),b:at(m,ts[j]/l)},supports))maxSecondarySpan=Math.max(maxSecondarySpan,ts[j]-ts[j-1])}
    const limit=(m.size===80?s.joistOverhang80:s.joistOverhang35)??null
    for(const [end,t,span] of [['start',ts[0],ts[0]],['end',ts.at(-1)!,l-ts.at(-1)!]] as const){
      if(span>T)projections.push({member:i,size:m.size,tier:isPrimary||isLink||isTransfer?'primary':isBlocking?'blocking':'secondary',supportKind:isPrimary?'pedestal':isBlocking||isLink?'connector':'bearer',end,point:end==='start'?m.a:m.b,support:at(m,t/l),distance:span,limit:limit===null?null:limit/1000})
      if(limit!==null&&span>limit/1000+T)projectionLimits=false
    }
  })
  const spliceKeys=new Set<string>(),uniqueSplices:Point[]=[];for(const q of splices){const key=`${q.x.toFixed(5)},${q.y.toFixed(5)}`;if(!spliceKeys.has(key)){spliceKeys.add(key);uniqueSplices.push(q)}}
  for(const q of primarySplices)if(!pedIndex.at(q).some(m=>distance(q,m.a)<T))stockBearing=false
  for(const q of uniqueSplices){
    if(manual){
      const touching=editedSpliceIndex!.at(q).filter(m=>on(q,m)),ends=touching.filter(m=>distance(q,m.a)<T||distance(q,m.b)<T),primaryJoint=ends.some(m=>primarySet.has(m)&&ends.some(n=>n!==m&&primarySet.has(n)&&m.kind===n.kind&&Math.abs((m.b.x-m.a.x)*(n.b.y-n.a.y)-(m.b.y-m.a.y)*(n.b.x-n.a.x))<T*length(m)*length(n)))
      if(primaryJoint?!pedIndex.at(q).some(m=>distance(q,m.a)<T):!touching.some(m=>m.kind==='bearer'||connected.has(m)&&touching.some(n=>n!==m&&Math.abs((m.b.x-m.a.x)*(n.b.y-n.a.y)-(m.b.y-m.a.y)*(n.b.x-n.a.x))>T*length(m)*length(n)))){stockBearing=false;conflicts.push(q)}
      continue
    }
    const edgeJoint=edgeRailSplices.some(p=>distance(p,q)<T)
    const openingJoint=openingRimSplices.some(p=>distance(p,q)<T)
    if(openingJoint?!bearingUpper.at(q).some(m=>m.role!=='opening-rim'&&connected.has(m)&&on(q,m)):edgeJoint?!bearingUpper.at(q).some(m=>(m.kind==='noggin'||m.role==='support-header')&&connected.has(m)&&pointSegmentDistance(q,m.a,m.b)<=face/2+T):!primaryIndex.at(q).some(m=>on(q,m)))stockBearing=false
  }
  const boardProjections:{piece:number;distance:number;point:Point}[]=[],boardChecks:{piece:number;ok:boolean;reason:string}[]=[],allFaces=index(allUpper,Math.max(face,s.joistSpacing/1000))
  // Check installed pieces, not a hypothetical complete perimeter ring. For
  // each board axis the actual transverse support crossings govern its span.
  let infillBearing=true,breakerBearing=true,perimeterBearing=true,maxBoardGap=0
  boards.pieces.forEach((piece,i)=>{
    const outline=piece.outline??[],axis=piece.axis??(piece.kind==='breaker'?{x:0,y:1}:{x:1,y:0});if(!outline.length)return
    const origin=outline[0],normal={x:-axis.y,y:axis.x},toLocal=(q:Point)=>({x:(q.x-origin.x)*axis.x+(q.y-origin.y)*axis.y,y:(q.x-origin.x)*normal.x+(q.y-origin.y)*normal.y}),local=outline.map(toLocal)
    const minV=Math.min(...local.map(q=>q.y)),maxV=Math.max(...local.map(q=>q.y));let ok=true,reason=''
    const centreV=(minV+maxV)/2,candidateVs=[centreV,minV+(maxV-minV)*.25,minV+(maxV-minV)*.75]
    const supportedV=candidateVs.find(v=>scan(local,v).every(([a,b])=>[.1,.3,.5,.7,.9].every(t=>{
      const u=a+(b-a)*t,q={x:origin.x+axis.x*u+normal.x*v,y:origin.y+axis.y*u+normal.y*v}
      return pointInside(envelope,q)&&!envelopeHoles.some(h=>pointInside(h,q))
    })))??centreV
    for(const v of [supportedV])for(const [a,b] of scan(local,v)){
      const line={a:{x:origin.x+axis.x*a+normal.x*v,y:origin.y+axis.y*a+normal.y*v},b:{x:origin.x+axis.x*b+normal.x*v,y:origin.y+axis.y*b+normal.y*v},kind:'noggin' as const,size:0},l=b-a
      const candidates=allFaces.along(line),longitudinal=longitudinalFaceRuns(line,candidates,face/2),ts=unique([...longitudinal.flatMap(m=>[distance(line.a,m.a),distance(line.a,m.b)]),...candidates.flatMap(m=>{
        const hits=segmentBearings(line,[m]);if(hits.length)return hits
        // A longitudinal collector supports the cut edge along its finite face.
        const out:number[]=[];for(const t of [0,l])if(pointSegmentDistance(at(line,t/l),m.a,m.b)<=Math.max(contact,0)+T)out.push(t);return out
      })]).filter(t=>t>=-T&&t<=l+T)
      if(!ts.length){ok=false;reason='No support crossing';continue}
      for(let j=1;j<ts.length;j++){if(continuouslyBorne({...line,a:at(line,ts[j-1]/l),b:at(line,ts[j]/l)},longitudinal))continue;const clear=Math.max(0,ts[j]-ts[j-1]-face);maxBoardGap=Math.max(maxBoardGap,ts[j]-ts[j-1]);if(clear>s.joistSpacing/1000+T){ok=false;reason=`Support gap ${Math.round((ts[j]-ts[j-1])*1000)} mm`}}
      // The fascia recess necessarily leaves a short decking end projection.
      // Measure it separately; it is not a metal-profile cantilever allowance.
      for(const [t,q] of [[ts[0],line.a],[l-ts.at(-1)!,line.b]] as const)if(t>face/2+T)boardProjections.push({piece:i,distance:t-face/2,point:q})
    }
    boardChecks.push({piece:i,ok,reason});if(!ok){if(piece.kind==='infill')infillBearing=false;else if(piece.kind==='breaker')breakerBearing=false;else perimeterBearing=false;conflicts.push(origin)}
  })
  const jointFaces=index(allUpper,face),unborneJoints=boardJoints.filter(j=>face<j.gap+2*bearing-T||!jointSamples(j).length||!jointSamples(j).every(q=>jointBorne(j,q,jointFaces))),stockJointBearing=unborneJoints.length===0
  conflicts.push(...unborneJoints.map(j=>at(j,.5)))
  const add=(name:string,ok:boolean,detail:string)=>checks.push({name,ok,detail})
  if(manual){
    const boundaries=ringSegments(envelope,'rim',0),inside=(m:Member)=>{const l=length(m);if(l<T)return false;const cuts=unique([0,l,...segmentBearings(m,boundaries)]);return cuts.every(t=>pointInside(envelope,at(m,t/l)))&&cuts.slice(1).every((b,i)=>pointInside(envelope,at(m,(cuts[i]+b)/2/l)))}
    const outsideEdges=ringSegments(p,'rim',0),recessedFace=(m:Member)=>outsideEdges.every(edge=>{
      const l=length(m),el=length(edge);if(l<T||el<T)return false
      const ux=(m.b.x-m.a.x)/l,uy=(m.b.y-m.a.y)/l,vx=(edge.b.x-edge.a.x)/el,vy=(edge.b.y-edge.a.y)/el
      if(Math.abs(ux*vy-uy*vx)>T)return true
      const a=(m.a.x-edge.a.x)*vx+(m.a.y-edge.a.y)*vy,b=(m.b.x-edge.a.x)*vx+(m.b.y-edge.a.y)*vy
      if(Math.max(a,b)<-T||Math.min(a,b)>el+T)return true
      return Math.abs((m.a.x-edge.a.x)*vy-(m.a.y-edge.a.y)*vx)>=fascia+face/2-T
    })
    const wrong=members.filter(m=>!inside(m)||m.role==='edge-rail'&&!recessedFace(m)||m.size!==(m.kind==='bearer'?rule.bearer:rule.joist)||!['bearer','joist','rim','noggin'].includes(m.kind))
    conflicts.push(...wrong.map(m=>m.a))
    add('Edited members fit outline and profile',wrong.length===0,'Edited ends and the outer faces of edge-ladder rails must respect the applied fascia recess, fit the selected frame profiles and not bridge an outside corner.')
    verificationNotes.push('This support layout contains manual edits. Geometry, spans, stock joints and board bearing are recalculated from the edited members and pedestal positions; connection capacities still require supplier confirmation.')
  }
  add('Primary support spans',pedestals.length>0&&maxPrimarySpan<=rule.support+T,`${Math.round(maxPrimarySpan*1000)} mm actual / ${rule.support*1000} mm report limit`)
  add('Joist bearings and stock splices',hasSupports&&stockBearing,'Every member has a real load path. Stock splices meet actual pedestals, bearers or edge-ladder rungs; connector capacities remain a separate product check.')
  add('Secondary joist spans',!rule.bearer||maxSecondarySpan<=rule.bearerSpacing+T,rule.bearer?`${Math.round(maxSecondarySpan*1000)} mm actual / ${rule.bearerSpacing*1000} mm report limit`:'Joists bear directly on pedestals.')
  const outsideBases=pedestals.filter(q=>!pointInside(p,q)||boundaryDistance(p,q)<baseInset-T||holes.some(h=>pointInside(h,q)||boundaryDistance(h,q)<baseInset-T));conflicts.push(...outsideBases)
  add('Pedestal base clearance',pedestals.length>0&&outsideBases.length===0,`${Math.round(diameter*1000)} mm bases; ${Math.round((s.pedestalClearance??0))} mm additional edge clearance.`)
  const discs=new Map<string,Point[]>();let noOverlap=true
  for(const q of pedestals){const x=Math.floor(q.x/diameter),y=Math.floor(q.y/diameter);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of discs.get(`${x+dx},${y+dy}`)??[])if(distance(q,other)<diameter-T){noOverlap=false;conflicts.push(q,other)}const k=`${x},${y}`,a=discs.get(k);if(a)a.push(q);else discs.set(k,[q])}
  add('Pedestal bases do not overlap',noOverlap&&pedestals.length>0,'Actual circular footprints are separated; support positions may stagger along their own member.')
  add('Joist centres',infillBearing,`${Math.round(maxBoardGap*1000)} mm maximum measured board support centres / ${s.joistSpacing} mm selected; includes shaped cut ends.`)
  add('Breaker ladder spans',members.every(m=>length(m)<=s.frameStock+T),'Actual transverse cuts are divided at upper rails and remain within available stock.')
  add('Picture-frame edge ladders',maxEdgeRailSpan<=s.joistSpacing/1000+T&&allUpper.filter(m=>m.role==='edge-rail').every(m=>connected.has(m)),`Two continuous rails joined by real rungs; outer face recessed ${Math.round(fascia*1000)} mm. Maximum rung spacing ${Math.round(maxEdgeRailSpan*1000)} mm / ${s.joistSpacing} mm selected. End connectors require supplier confirmation.`)
  add('Noggin end bearings',hasSupports,'Blocking has real rail intersections; any end projections and end connectors are listed separately.')
  const floatingBases=pedestals.filter(q=>!primaryIndex.at(q).some(m=>on(q,m)));conflicts.push(...floatingBases)
  add('Pedestals attached to primary members',pedestals.length>0&&floatingBases.length===0,'Every pedestal remains on its actual supporting joist, bearer or collector.')
  add('Perimeter board bearing reach',perimeterBearing,'Installed picture-frame pieces are checked in their actual run direction; omitted edges add no board-specific blocking.')
  add('Infill board end bearings',infillBearing,'Actual infill pieces, shaped ends and stock joints are checked against generated upper members. Decking end projections are recorded separately.')
  add('Breaker board end bearings',breakerBearing,'Installed breaker pieces and stock ends are checked against real transverse supports.')
  add('Decking stock-joint bearings',stockJointBearing,'Opposing infill, breaker and picture-frame stock ends are checked over the central bearing width, including angled joints and their actual end gap. Outer board lips remain a separate supplier detail.')
  add('Upper support face clearance',!upperClash&&!primaryClash,'Oriented parallel faces and same-level interior crossings are checked, including angled collectors.')
  add('Profile end-overhang limits',projectionLimits,'Calculated projections are checked against any entered profile limits. Unset limits remain an unverified product detail.')
  add('Opening physical clearance',members.every(m=>!memberCrossesOpening(m,holes,face)),'Actual finite member faces remain outside every opening. Change an opening or frame detail if this fails.')
  const rimSpan=Math.max(0,...rimGroups.map(r=>rimContacts(r,allUpper.filter(m=>m.role!=='opening-rim'&&connected.has(m))).max))
  add('Opening rim support spacing',rimSpan<=s.joistSpacing/1000+T,`${Math.round(rimSpan*1000)} mm maximum around the actual rim between joists or ties / ${s.joistSpacing} mm selected. Facet mitres are not counted as external supports.`)
  add('Single support elevation',true,rule.bearer?'All pedestals bear below the primary bearer tier.':'All pedestals bear below the joist tier.')
  issues.push(...checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail} Change the joint layout, frame or product dimensions to resolve this area.`))
  if(projections.some(p=>p.limit===null))verificationNotes.push('Supplier end-overhang limits are unset. Required metal-profile projections are calculated below; these are not approved allowances.')
  if(boardProjections.length)verificationNotes.push('Decking end projections at the fascia and shaped edges require confirmation against the board supplier’s limits; metal-profile limits do not approve decking overhang.')
  verificationNotes.push('Decking side lips, ripped edge rows and perimeter-board support angles require board-supplier confirmation. The geometry check establishes a bearing path within each installed piece, not approval of unsupported board width.')
  if(!s.edgeDetailConfirmed)verificationNotes.push('Joist, blocking and collector end connections, bearing heads and any reaction transfer require supplier design/confirmation. Drawn intersections alone do not establish connection capacity.')
  verificationNotes.push('Finite faces at cut-end junctions need supplier-designed mitres/recesses and connectors. Their square-cap overlap is not an approved connection detail; through-member crossings and parallel face clashes remain blocking geometry errors.')
  verificationNotes.push('Pedestal capacity, substrate/roof capacity, bracing and site levels require separate verification.')
  if(transferFrame)verificationNotes.push(`This ${rule.joist} mm direct frame uses same-depth support headers and connected joist sections. Their end hangers, header reactions and transfer connections require supplier design; the report's direct-joist grid does not approve these connection capacities.`)
  if(rimGroups.length)verificationNotes.push('Rounded openings use short straight Alu-Joist rim sections with mitred joints and spaced ties. Rim continuity, mitre connectors, torsion and transferred reactions require supplier design; no bent profile or approved circular connection detail is assumed.')
  const connectionIndex=index(members,face),connectionKeys=new Set<string>(),connections:{point:Point;members:number[];status:'unverified'}[]=[]
  const memberNumbers=new Map(members.map((m,i)=>[m,i]))
  for(const m of members)for(const q of [m.a,m.b]){
    const key=`${q.x.toFixed(5)},${q.y.toFixed(5)}`;if(connectionKeys.has(key))continue
    const touching=connectionIndex.at(q).filter(n=>on(q,n)||m.kind!=='bearer'&&n.kind!=='bearer'&&pointSegmentDistance(q,n.a,n.b)<=face+T);if(touching.length<2)continue
    connectionKeys.add(key);connections.push({point:q,members:touching.map(n=>memberNumbers.get(n)!),status:'unverified'})
  }
  const junctions=pedestals.filter(q=>primaryIndex.at(q).filter(m=>on(q,m)).length>1)
  const geometryPass=issues.length===0,layoutStatus: 'ready'|'unbuildable'=geometryPass?'ready':'unbuildable',diagnostic=geometryPass?{members:[] as Member[],pedestals:[] as Point[]}:{members:members.length?members:draftMembers,pedestals:pedestals}
  if(!manual&&!geometryPass&&!placementDiagnostics.length){
    const candidates=draftMembers.filter(m=>m.kind===(rule.bearer?'bearer':'joist')&&m.role!=='bearer-link'),ranges=pedestalBaseIntervals(candidates,p,holes,s),failed=ranges.findIndex(r=>!r.length)
    if(failed>=0)placementDiagnostics.push({member:candidates[failed],memberIndex:failed,reason:'boundary',edgeClear:[],available:[],trialBases:[],detail:'This draft member has no position for the full pedestal base plus the selected edge clearance. The automatic search did not produce a supported arrangement here.'})
  }
  return {manual,placementDiagnostics,members:geometryPass?members:[],pedestals:geometryPass?pedestals:[],diagnostic,rule,footprint,setback:w+gap/2,baseInset,faceWidth:face,boardBearing:bearing,splices:geometryPass?uniqueSplices:[],checks,issues,geometryPass,maxPrimarySpan,maxSecondarySpan,layoutStatus,conflicts,junctions:geometryPass?junctions:[],fasciaClearance:fascia,profileLimits:{35:s.joistOverhang35===undefined?null:s.joistOverhang35/1000,80:s.joistOverhang80===undefined?null:s.joistOverhang80/1000},construction:'board-driven' as const,supportArrangement:transferFrame?'same-depth-headers' as const:'pedestal-grid' as const,projections,boardProjections,boardChecks,connections,verification:{status:'provisional' as const,notes:verificationNotes}}
}

export function layoutBoardSupports(p:Point[],s:Settings,boards:Boards,rule:Rule){
  const direct=solveBoardSupports(p,s,boards,rule)
  return !s.supportLayout&&!direct.geometryPass&&!rule.bearer?solveBoardSupports(p,s,boards,rule,true):direct
}


