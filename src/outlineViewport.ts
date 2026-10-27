import type { Point } from './planner.ts'
import { MAX_PROJECT_SIZE } from './projectLimits.ts'

export type OutlineViewport={x:number;y:number;width:number;height:number}
export function fitOutline(points:Point[]):OutlineViewport{
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
  const minX=points.length?Math.min(...xs):0,minY=points.length?Math.min(...ys):0
  const w=points.length?Math.max(...xs)-minX:6,h=points.length?Math.max(...ys)-minY:4
  const margin=Math.max(1,Math.max(w,h)*.18)
  return {x:minX-margin,y:minY-margin,width:Math.max(3,w+margin*2),height:Math.max(3,h+margin*2)}
}
export function zoomOutline(camera:OutlineViewport,factor:number,anchor:Point={x:camera.x+camera.width/2,y:camera.y+camera.height/2}):OutlineViewport{
  if(!Number.isFinite(factor)||factor<=0)return camera
  const scale=Math.max(.25/Math.min(camera.width,camera.height),Math.min(MAX_PROJECT_SIZE*4/Math.max(camera.width,camera.height),factor))
  return {x:anchor.x+(camera.x-anchor.x)*scale,y:anchor.y+(camera.y-anchor.y)*scale,width:camera.width*scale,height:camera.height*scale}
}
export function panOutline(camera:OutlineViewport,delta:Point):OutlineViewport{
  return {...camera,x:camera.x+delta.x,y:camera.y+delta.y}
}
export function visibleGrid(camera:OutlineViewport){
  const target=Math.max(.1,Math.max(camera.width,camera.height)/100),power=10**Math.floor(Math.log10(target))
  return [1,2,5,10].map(n=>n*power).find(n=>n>=target-1e-8)!
}
