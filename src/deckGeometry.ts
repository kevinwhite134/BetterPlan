import type { Point } from './planner.ts'

const EPS=1e-7
export const signedArea=(p:Point[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y},0)/2
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
export function insetPolygon(p:Point[],offset:number):Point[] {
  return insetPolygonEdges(p,p.map(()=>offset))
}
type OffsetLine={a:Point;b:Point;d:Point;offset:number}
function offsetLines(p:Point[],offsets:number[]):OffsetLine[]{
  if(offsets.length!==p.length||offsets.some(n=>!Number.isFinite(n)))throw new Error('Each outline edge needs a valid inset.')
  const sign=signedArea(p)>0?1:-1
  return p.map((a,i)=>{
    const b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),offset=offsets[i]
    if(l<EPS)throw new Error('An outline edge is too short to inset.')
    const nx=-sign*dy/l*offset,ny=sign*dx/l*offset
    return {a:{x:a.x+nx,y:a.y+ny},b:{x:b.x+nx,y:b.y+ny},d:{x:dx,y:dy},offset}
  })
}
function offsetIntersection(a:OffsetLine,b:OffsetLine):Point|undefined{
  const den=cross(a.d,b.d);if(Math.abs(den)<EPS)return undefined
  const t=cross({x:b.a.x-a.a.x,y:b.a.y-a.a.y},b.d)/den
  return {x:a.a.x+t*a.d.x,y:a.a.y+t*a.d.y}
}
/** The selected edge's own inset endpoints; no indexed expanded polygon. */
export function insetEdgeSegment(p:Point[],offsets:number[],index:number){
  const lines=offsetLines(p,offsets),line=lines[index]
  if(!line)throw new Error('Choose a valid outline edge.')
  return {a:offsetIntersection(lines[(index+p.length-1)%p.length],line)??line.a,b:offsetIntersection(line,lines[(index+1)%p.length])??line.b}
}
export function insetPolygonEdges(p:Point[],offsets:number[],transitionGap=0):Point[]{
  if(offsets.length!==p.length||offsets.some(n=>!Number.isFinite(n)))throw new Error('Each outline edge needs a valid inset.')
  if(!Number.isFinite(transitionGap)||transitionGap<0)throw new Error('Enter a valid framing transition gap.')
  if(offsets.every(n=>!n))return p.map(a=>({...a}))
  const uniform=offsets.every(n=>Math.abs(n-offsets[0])<EPS),offset=offsets[0],sign=signedArea(p)>0?1:-1,lines=offsetLines(p,offsets)
  const result=lines.flatMap((line,i)=>{
    const prev=lines[(i+p.length-1)%p.length],corner=offsetIntersection(prev,line)
    if(corner)return [corner]
    if(Math.abs(prev.offset-line.offset)<EPS)return [line.a]
    // A collinear change in framing width is a real step, not a tapered
    // connector between one vertex on each offset line. Its cap is set back
    // by the board end gap so infill does not butt into the frame board.
    const length=Math.hypot(line.d.x,line.d.y),shift=Math.sign(prev.offset-line.offset)*transitionGap,delta={x:line.d.x/length*shift,y:line.d.y/length*shift}
    return [{x:prev.b.x+delta.x,y:prev.b.y+delta.y},{x:line.a.x+delta.x,y:line.a.y+delta.y}]
  })
  if(signedArea(result)*sign<=EPS||(uniform?(offset>0?result.some(q=>!pointInside(p,q)||boundaryDistance(p,q)<offset-1e-6):p.some(q=>!pointInside(result,q)||boundaryDistance(result,q)<-offset-1e-6)):offsets.every(n=>n>=0)&&result.some(q=>!pointInside(p,q))))throw new Error('This outline is too narrow for the full-width perimeter or pedestal setback. Widen the narrow sections.')
  for(let i=0;i<result.length;i++)for(let j=i+2;j<result.length;j++){
    if(i===0&&j===result.length-1)continue
    const a=result[i],b=result[(i+1)%result.length],c=result[j],d=result[(j+1)%result.length]
    const u={x:b.x-a.x,y:b.y-a.y},v={x:d.x-c.x,y:d.y-c.y},den=cross(u,v)
    if(Math.abs(den)<EPS)continue
    const delta={x:c.x-a.x,y:c.y-a.y},t=cross(delta,v)/den,s=cross(delta,u)/den
    if(t>EPS&&t<1-EPS&&s>EPS&&s<1-EPS)throw new Error('The inset splits or crosses itself at a narrow part of this outline. Split this deck into separate build zones.')
  }
  return result
}

export function pointInside(p:Point[],q:Point){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
  const a=p[i],b=p[j],d=pointSegmentDistance(q,a,b);if(d<EPS)return true
  if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)hit=!hit
}return hit}
export function pointSegmentDistance(q:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/l)):0;return Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy)}
export function boundaryDistance(p:Point[],q:Point){return Math.min(...p.map((a,i)=>pointSegmentDistance(q,a,p[(i+1)%p.length])))}
export function clipRectangle(p:Point[],left:number,right:number,top:number,bottom:number):Point[] {
  let result=p
  for(const [axis,value,greater] of [['x',left,true],['x',right,false],['y',top,true],['y',bottom,false]] as const){
    const input=result;result=[];if(!input.length)break
    for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ia=greater?a[axis]>=value-EPS:a[axis]<=value+EPS,ib=greater?b[axis]>=value-EPS:b[axis]<=value+EPS
      if(ia)result.push(a)
      if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);result.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)})}
    }
  }
  return result
}
// A concave outline can intersect a cutting rectangle in several disconnected
// pieces. Trace the intersection boundary so no blank bridges an empty recess.
export function clipRectangleParts(p:Point[],left:number,right:number,top:number,bottom:number):Point[][] {
  if(right-left<EPS||bottom-top<EPS)return []
  const sign=signedArea(p)>0?1:-1,segments:{a:Point;b:Point}[]=[]
  const rect=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]
  if(sign<0)rect.reverse()
  const add=(a:Point,b:Point)=>{if(Math.hypot(a.x-b.x,a.y-b.y)>EPS)segments.push({a,b})}
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],d={x:b.x-a.x,y:b.y-a.y};let lo=0,hi=1
    for(const [origin,delta,min,max] of [[a.x,d.x,left,right],[a.y,d.y,top,bottom]]){
      if(Math.abs(delta)<EPS){if(origin<min-EPS||origin>max+EPS){hi=-1;break}}
      else {const u=(min-origin)/delta,v=(max-origin)/delta;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v))}
    }
    if(hi<=lo)continue
    const l=Math.hypot(d.x,d.y),mid={x:a.x+(lo+hi)/2*d.x-sign*d.y/l*EPS/4,y:a.y+(lo+hi)/2*d.y+sign*d.x/l*EPS/4}
    if(mid.x<left||mid.x>right||mid.y<top||mid.y>bottom)continue
    add({x:a.x+lo*d.x,y:a.y+lo*d.y},{x:a.x+hi*d.x,y:a.y+hi*d.y})
  }
  for(let i=0;i<4;i++){
    const a=rect[i],b=rect[(i+1)%4],d={x:b.x-a.x,y:b.y-a.y},l2=d.x*d.x+d.y*d.y,ts=[0,1]
    for(let j=0;j<p.length;j++){
      const c=p[j],e=p[(j+1)%p.length],v={x:e.x-c.x,y:e.y-c.y},delta={x:c.x-a.x,y:c.y-a.y},den=cross(d,v)
      if(Math.abs(den)>1e-12){const t=cross(delta,v)/den,u=cross(delta,d)/den;if(t>-EPS&&t<1+EPS&&u>-EPS&&u<1+EPS)ts.push(Math.max(0,Math.min(1,t)))}
      else if(Math.abs(cross(delta,d))<EPS*Math.sqrt(l2))for(const q of [c,e]){const t=((q.x-a.x)*d.x+(q.y-a.y)*d.y)/l2;if(t>0&&t<1)ts.push(t)}
    }
    ts.sort((a,b)=>a-b)
    for(let j=1;j<ts.length;j++){
      const lo=ts[j-1],hi=ts[j];if((hi-lo)*Math.sqrt(l2)<EPS)continue
      const mid={x:a.x+(lo+hi)/2*d.x,y:a.y+(lo+hi)/2*d.y}
      // Coincident edges are already supplied by the polygon. Do not nudge
      // the probe across a thin exterior sliver at a nearly collinear corner.
      if(boundaryDistance(p,mid)<1e-10)continue
      let inside=false
      for(let k=0;k<p.length;k++){const u=p[k],v=p[(k+1)%p.length];if((u.y>mid.y)!==(v.y>mid.y)&&mid.x<(v.x-u.x)*(mid.y-u.y)/(v.y-u.y)+u.x)inside=!inside}
      if(inside)add({x:a.x+lo*d.x,y:a.y+lo*d.y},{x:a.x+hi*d.x,y:a.y+hi*d.y})
    }
  }
  const nodes:Point[]=[],node=(q:Point)=>{const i=nodes.findIndex(v=>Math.hypot(v.x-q.x,v.y-q.y)<EPS);if(i>=0)return i;nodes.push(q);return nodes.length-1}
  for(const {a,b} of segments){node(a);node(b)}
  const edges=new Map<string,{a:number;b:number}>()
  for(const segment of segments){
    const d={x:segment.b.x-segment.a.x,y:segment.b.y-segment.a.y},l2=d.x*d.x+d.y*d.y
    const ids=nodes.map((q,i)=>({i,t:((q.x-segment.a.x)*d.x+(q.y-segment.a.y)*d.y)/l2})).filter(q=>q.t>=-EPS&&q.t<=1+EPS&&pointSegmentDistance(nodes[q.i],segment.a,segment.b)<EPS).sort((a,b)=>a.t-b.t)
    for(let i=1;i<ids.length;i++){const a=ids[i-1].i,b=ids[i].i;if(a!==b)edges.set(`${a}:${b}`,{a,b})}
  }
  const result:Point[][]=[]
  while(edges.size){
    const first=edges.values().next().value!,ring=[nodes[first.a]];let edge=first
    for(let count=0;count<=segments.length*4;count++){
      edges.delete(`${edge.a}:${edge.b}`)
      if(edge.b===first.a)break
      ring.push(nodes[edge.b])
      const incoming={x:nodes[edge.b].x-nodes[edge.a].x,y:nodes[edge.b].y-nodes[edge.a].y}
      const next=[...edges.values()].filter(q=>q.a===edge.b).sort((a,b)=>{
        const angle=(q:typeof a)=>{const d={x:nodes[q.b].x-nodes[q.a].x,y:nodes[q.b].y-nodes[q.a].y};return sign*Math.atan2(cross(incoming,d),incoming.x*d.x+incoming.y*d.y)}
        return angle(b)-angle(a)
      })[0]
      if(!next)throw new Error('The infill cut boundary could not be closed. Adjust the near-coincident corners.')
      edge=next
    }
    if(edge.b!==first.a)throw new Error('The infill cut boundary is too complex. Split this outline into build zones.')
    if(ring.length>=3&&Math.abs(signedArea(ring))>EPS*EPS)result.push(ring)
  }
  return result
}
// All blanks use stock width. When straight ripping is disabled, an edge
// piece may still taper, but cannot be a uniformly narrower strip.
export function allowedBoardCut(outline:Point[],top:number,bottom:number,allowRipping=false):boolean{
  if(outline.length<3||Math.abs(signedArea(outline))<EPS*EPS)return false
  if(allowRipping)return true
  const minX=Math.min(...outline.map(q=>q.x)),maxX=Math.max(...outline.map(q=>q.x)),minY=Math.min(...outline.map(q=>q.y)),maxY=Math.max(...outline.map(q=>q.y))
  if(maxY-minY>=bottom-top-EPS)return true
  const angled=outline.some((a,i)=>{const b=outline[(i+1)%outline.length];return Math.abs(a.x-b.x)>EPS&&Math.abs(a.y-b.y)>EPS})
  if(!angled)return false
  return !outline.some((a,i)=>{const b=outline[(i+1)%outline.length];return Math.abs(a.y-b.y)<EPS&&a.y>top+EPS&&a.y<bottom-EPS&&Math.min(a.x,b.x)<=minX+EPS&&Math.max(a.x,b.x)>=maxX-EPS})
}
export function boardBands(across:number,width:number,gap:number,allowRipping:boolean):{y:number;width:number}[]{
  if(across<=EPS)return []
  const pitch=width+gap
  if(!allowRipping){
    const count=Math.max(0,Math.floor((across+gap+EPS)/pitch)),remainder=across-(count*width+Math.max(0,count-1)*gap)
    return Array.from({length:count},(_,i)=>({y:remainder/2+i*pitch,width}))
  }
  const count=Math.max(1,Math.ceil((across+gap-EPS)/pitch))
  if(count===1)return [{y:0,width:Math.min(width,across)}]
  // Balance the two outside cuts, keeping them at least about half a stock
  // width instead of generating a very narrow sliver along one edge.
  const edge=(across-(count-2)*width-(count-1)*gap)/2
  let y=0
  return Array.from({length:count},(_,i)=>{const w=i===0||i===count-1?(Math.abs(edge-width)<EPS?width:edge):width,band={y,width:w};y+=w+gap;return band})
}
function intervalsAt(p:Point[],y:number):[number,number][]{const xs:number[]=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y))}xs.sort((a,b)=>a-b);const out:[number,number][]=[];for(let i=0;i+1<xs.length;i+=2)out.push([xs[i],xs[i+1]]);return out}
export function fullWidthRuns(p:Point[],top:number,bottom:number):[number,number][] {
  const levels=[top+EPS,bottom-EPS,...p.map(q=>q.y).filter(y=>y>top+EPS&&y<bottom-EPS).flatMap(y=>[y-EPS,y+EPS])]
  let core=intervalsAt(p,levels[0])
  for(const y of levels.slice(1)){const row=intervalsAt(p,y);core=core.flatMap(([a,b])=>row.map(([c,d])=>[Math.max(a,c),Math.min(b,d)] as [number,number]).filter(([a,b])=>b-a>EPS))}
  // A board end may follow several connected angled cuts. Trace maximal
  // boundary chains which travel in one y direction, instead of requiring one
  // individual edge to cross the whole board width. A horizontal step or a
  // reversal stops a chain: extending past those would produce a partial-width
  // notch/filler rather than an end cut across a full-width board.
  const directions=p.map((a,i)=>{const dy=p[(i+1)%p.length].y-a.y;return Math.abs(dy)<EPS?0:Math.sign(dy)})
  const ends:[number,number][]=[]
  for(let i=0;i<p.length;i++){
    const direction=directions[i]
    if(!direction||directions[(i+p.length-1)%p.length]===direction)continue
    const chain:Point[]=[p[i]];let edge=i
    do{chain.push(p[(edge+1)%p.length]);edge=(edge+1)%p.length}while(edge!==i&&directions[edge]===direction)
    if(Math.min(chain[0].y,chain.at(-1)!.y)>top+EPS||Math.max(chain[0].y,chain.at(-1)!.y)<bottom-EPS)continue
    const xs=chain.filter(q=>q.y>=top-EPS&&q.y<=bottom+EPS).map(q=>q.x)
    for(let j=1;j<chain.length;j++){
      const a=chain[j-1],b=chain[j]
      for(const y of [top,bottom])if(y>=Math.min(a.y,b.y)-EPS&&y<=Math.max(a.y,b.y)+EPS)xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y))
    }
    ends.push([Math.min(...xs),Math.max(...xs)])
  }
  return core.map(([left,right])=>{let lo=left,hi=right
    for(const [min,max] of ends){
      if(Math.abs(max-left)<1e-5)lo=Math.min(lo,min)
      if(Math.abs(min-right)<1e-5)hi=Math.max(hi,max)
    }
    return [lo,hi]
  })
}
export function orientedStrip(a:Point,b:Point,width:number):Point[]{const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),nx=-dy/l*width/2,ny=dx/l*width/2;return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]}
