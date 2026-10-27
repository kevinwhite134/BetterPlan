import clipping from 'polygon-clipping'
import type { Polygon } from 'polygon-clipping'
import type { Cutout, Member, Piece, Point, Settings } from './planner.ts'
import { insetPolygon, signedArea } from './deckGeometry.ts'

// Offsetting collinear/angled borders can leave endpoints different only in
// floating-point noise. Use a 10 nm input grid for stable boolean topology.
const geometry=(ring:Point[]):Polygon=>[ring.map(p=>[Math.round(p.x*1e8)/1e8,Math.round(p.y*1e8)/1e8])]
const points=(ring:number[][]):Point[]=>ring.slice(0,-1).map(([x,y])=>({x,y}))
export const ringPath=(rings:Point[][])=>rings.filter(r=>r.length).map(r=>`M${r.map(p=>`${p.x},${p.y}`).join('L')}Z`).join(' ')
export const boardRings=(piece:Piece):Point[][]=>{const w=piece.breaker?piece.width:piece.length,d=piece.breaker?piece.length:piece.width;return [piece.outline??[{x:piece.x,y:piece.y},{x:piece.x+w,y:piece.y},{x:piece.x+w,y:piece.y+d},{x:piece.x,y:piece.y+d}],...(piece.holes??[])]}

export function ellipseOutline(width:number,depth:number,segments=32):Point[]{
  return Array.from({length:segments},(_,i)=>{const a=i*2*Math.PI/segments;return {x:width/2*(1+Math.cos(a)),y:depth/2*(1+Math.sin(a))}})
}
export function roundedOutline(width:number,depth:number,radius:number,segments=6):Point[]{
  const r=Math.min(radius,width/2,depth/2),out:Point[]=[]
  for(const [x,y,start] of [[width-r,r,-90],[width-r,depth-r,0],[r,depth-r,90],[r,r,180]]){
    for(let i=0;i<=segments;i++){const a=(start+90*i/segments)*Math.PI/180,p={x:x+r*Math.cos(a),y:y+r*Math.sin(a)};if(!out.length||Math.hypot(p.x-out.at(-1)!.x,p.y-out.at(-1)!.y)>1e-7)out.push(p)}
  }
  if(Math.hypot(out[0].x-out.at(-1)!.x,out[0].y-out.at(-1)!.y)<1e-7)out.pop()
  return out
}
// Circular arc through both edge ends and a signed midpoint bulge. Positive
// bulge is to the right of the outgoing edge in deck X/Y coordinates.
export function curveEdge(polygon:Point[],index:number,bulge:number,segments=8):Point[]{
  if(Math.abs(bulge)<.005)throw new Error('Enter a curve bulge of at least 5 mm.')
  const a=polygon[index],b=polygon[(index+1)%polygon.length],length=Math.hypot(b.x-a.x,b.y-a.y)
  if(!length)throw new Error('Choose an edge with a length.')
  const nx=(b.y-a.y)/length,ny=-(b.x-a.x)/length,mx=(a.x+b.x)/2,my=(a.y+b.y)/2
  const centreOffset=bulge/2-length*length/(8*bulge),cx=mx+nx*centreOffset,cy=my+ny*centreOffset,r=Math.hypot(a.x-cx,a.y-cy)
  const start=Math.atan2(a.y-cy,a.x-cx),sweep=4*Math.atan(2*bulge/length)
  const arc=Array.from({length:segments-1},(_,i)=>{const angle=start+sweep*(i+1)/segments;return {x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle)}})
  return [...polygon.slice(0,index+1),...arc,...polygon.slice(index+1)]
}

export function physicalCutouts(s:Settings):Cutout[]{
  const x=Math.min(...s.polygon.map(p=>p.x)),y=Math.min(...s.polygon.map(p=>p.y))
  return (s.cutouts??[]).map(h=>({...h,polygon:h.polygon.map(p=>({x:p.x-x,y:p.y-y}))}))
}
export function cutoutPlacementError(outer:Point[],holes:Cutout[],edgeClearance:number):string{
  if(!holes.length)return ''
  let inset:Point[]
  try{inset=insetPolygon(outer,edgeClearance)}catch{return 'This outline is too narrow for an internal cutout and its perimeter boards.'}
  for(let i=0;i<holes.length;i++){
    const h=holes[i],difference=clipping.difference(geometry(h.polygon),geometry(inset))
    if(difference.length)return `${h.name}: keep the cutout inside the deck, at least ${Math.round(edgeClearance*1000)} mm from the outside edge for the perimeter boards.`
    const separation=2*(edgeClearance-.05)+.05
    try{const expanded=insetPolygon(h.polygon,-separation);for(const other of holes.slice(0,i))if(clipping.intersection(geometry(expanded),geometry(other.polygon)).length)return `${h.name}: leave at least ${Math.round(separation*1000)} mm between cutouts for both perimeter borders.`}catch{return `${h.name}: simplify the cutout so its perimeter boards can fit without crossing.`}
  }
  return ''
}

export function subtractCutouts(pieces:Piece[],holes:Point[][]):Piece[]{
  if(!holes.length)return pieces
  return pieces.flatMap(piece=>{
    const outline=boardRings(piece)[0],result=clipping.difference(geometry(outline),...holes.map(geometry))
    if(result.length===1&&result[0].length===1&&Math.abs(Math.abs(signedArea(points(result[0][0])))-Math.abs(signedArea(outline)))<1e-9)return [piece]
    return result.flatMap(rings=>{
      const outline=points(rings[0]);if(Math.abs(signedArea(outline))<1e-8)return []
      const xs=outline.map(p=>p.x),ys=outline.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,depth=Math.max(...ys)-y
      // A hole wholly inside one board stays one machined blank. Disconnected
      // results become separate cut pieces and are repacked for stock reuse.
      return [{...piece,x:piece.kind==='perimeter'?piece.x:x,y:piece.kind==='perimeter'?piece.y:y,length:piece.kind==='perimeter'?piece.length:piece.breaker?depth:width,width:piece.kind==='perimeter'?piece.width:piece.breaker?width:depth,outline,holes:rings.slice(1).map(points),localRip:true}]
    })
  })
}

export function subtractIntervals(intervals:[number,number][],voids:[number,number][]):[number,number][]{
  let out=intervals
  for(const [lo,hi] of voids)out=out.flatMap(([a,b])=>b<=lo+1e-7||a>=hi-1e-7?[[a,b] as [number,number]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([u,v])=>v-u>1e-7) as [number,number][])
  return out
}
export function memberCrossesOpening(m:Member,holes:Point[][],face:number):boolean{
  if(!holes.length)return false
  const dx=m.b.x-m.a.x,dy=m.b.y-m.a.y,length=Math.hypot(dx,dy),nx=-dy/length*face/2,ny=dx/length*face/2
  const rectangle=[{x:m.a.x+nx,y:m.a.y+ny},{x:m.b.x+nx,y:m.b.y+ny},{x:m.b.x-nx,y:m.b.y-ny},{x:m.a.x-nx,y:m.a.y-ny}]
  return holes.some(h=>clipping.intersection(geometry(rectangle),geometry(h)).some(p=>Math.abs(signedArea(points(p[0])))>1e-9))
}
