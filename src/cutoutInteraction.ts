import type { Cutout, Point } from './planner.ts'
import { polygonError } from './planner.ts'
import { cutoutPlacementError, ellipseOutline } from './shapeGeometry.ts'

export type CutoutTool='rectangle'|'circle'|'oval'|'custom'
export function cutoutBounds(h:Cutout){
  const x=Math.min(...h.polygon.map(p=>p.x)),y=Math.min(...h.polygon.map(p=>p.y))
  return {x,y,width:Math.max(...h.polygon.map(p=>p.x))-x,depth:Math.max(...h.polygon.map(p=>p.y))-y}
}
export function cutoutCorners(h:Cutout):Point[]{const b=cutoutBounds(h);return [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.depth},{x:b.x,y:b.y+b.depth}]}
export function newCutout(shape:Exclude<CutoutTool,'custom'>,a:Point,b:Point,id:string,name:string):Cutout{
  const dx=b.x-a.x,dy=b.y-a.y,width=shape==='circle'?Math.max(.05,Math.abs(dx),Math.abs(dy)):Math.max(.05,Math.abs(dx)),depth=shape==='circle'?width:Math.max(.05,Math.abs(dy))
  const x=dx<0?a.x-width:a.x,y=dy<0?a.y-depth:a.y
  const ring=shape==='rectangle'?[{x:0,y:0},{x:width,y:0},{x:width,y:depth},{x:0,y:depth}]:ellipseOutline(width,depth,16)
  return {id,name,shape,polygon:ring.map(p=>({x:p.x+x,y:p.y+y}))}
}
export function placedCutout(shape:Exclude<CutoutTool,'custom'>,at:Point,id:string,name:string,size=1){
  return newCutout(shape,{x:at.x-size/2,y:at.y-size/2},{x:at.x+size/2,y:at.y+size/2},id,name)
}
export function moveCutout(h:Cutout,dx:number,dy:number):Cutout{return {...h,polygon:h.polygon.map(p=>({x:p.x+dx,y:p.y+dy}))}}
export function resizeCutout(h:Cutout,corner:number,target:Point):Cutout{
  const old=cutoutBounds(h),anchor=cutoutCorners(h)[(corner+2)%4]
  const dx=target.x-anchor.x,dy=target.y-anchor.y,width=h.shape==='circle'?Math.max(.05,Math.abs(dx),Math.abs(dy)):Math.max(.05,Math.abs(dx)),depth=h.shape==='circle'?width:Math.max(.05,Math.abs(dy))
  const x=dx<0?anchor.x-width:anchor.x,y=dy<0?anchor.y-depth:anchor.y
  return {...h,polygon:h.polygon.map(p=>({x:x+(p.x-old.x)*width/old.width,y:y+(p.y-old.y)*depth/old.depth}))}
}
export function measureCutout(h:Cutout,x:number,y:number,width:number,depth:number):Cutout{
  const old=cutoutBounds(h),d=h.shape==='circle'?width:depth
  return {...h,polygon:h.polygon.map(p=>({x:x+(p.x-old.x)*width/old.width,y:y+(p.y-old.y)*d/old.depth}))}
}
export function cutoutEditError(outer:Point[],holes:Cutout[],clearance:number):string{
  if(holes.length>10)return 'Use up to 10 cutouts.'
  for(const h of holes){const issue=polygonError(h.polygon,.0025,.001);if(issue)return `${h.name}: ${issue}`}
  return cutoutPlacementError(outer,holes,clearance)
}
