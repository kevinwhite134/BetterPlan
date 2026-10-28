import { fasciaHeight } from './planner.ts'
import { memo, useMemo } from 'react'
import { bounds } from './planner'
import type { Plan, Point, Settings } from './planner'
import { thumbnailPlan } from './renderOverview'
import StructureDrawing from './StructureDrawing'
import { boardRings, ringPath } from './shapeGeometry'
import type { StructureExposure as Exposure } from './structureGeometry'
const coordinates=(p:Point[])=>p.map(q=>`${q.x},${q.y}`).join(' ')
// Thumbnails use actual components and keep a fixed camera while the scene rotates.
export const LayerThumbnail=memo(function LayerThumbnail({plan:fullPlan,settings:s,exposure}:{plan:Plan;settings:Settings;exposure:Exposure}) {
  const plan=useMemo(()=>thumbnailPlan(fullPlan),[fullPlan])
  const box=bounds(plan.physical),angle=35*Math.PI/180,t=52*Math.PI/180
  const project=(p:Point,z=0)=>{const q=s.direction==='vertical'?{x:p.y,y:p.x}:p,x=q.x-box.width/2,y=q.y-box.depth/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:(x*Math.sin(angle)+y*Math.cos(angle))*Math.cos(t)-z*Math.sin(t)}}
  const ground=-s.height/1000,boardBottom=-s.board.thickness/1000
  const projected=plan.p.flatMap(p=>[project(p),project(p,ground)]),xs=projected.map(p=>p.x),ys=projected.map(p=>p.y),minX=Math.min(...xs)-.25,minY=Math.min(...ys)-.25
  const showBoards=exposure==='finished'||exposure==='boards'
  return <svg viewBox={`${minX} ${minY} ${Math.max(...xs)-minX+.25} ${Math.max(...ys)-minY+.25}`} aria-hidden="true" focusable="false">
    <polygon points={coordinates(plan.p.map(p=>project(p,ground)))} fill="#dbe3d0"/>
    <StructureDrawing plan={plan} settings={s} exposure={exposure} showSupports={true} rotation={35} tilt={52} project={p=>{const x=p.x-box.width/2,y=p.y-box.depth/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:(x*Math.sin(angle)+y*Math.cos(angle))*Math.cos(t)-p.z*Math.sin(t)}}}/>
    {exposure==='finished'&&s.skirting?plan.p.map((a,i)=>{const b=plan.p[(i+1)%plan.p.length],u=project(a),v=project(b);if(v.x<u.x)return null;return <polygon key={i} points={coordinates([project(a,boardBottom),project(b,boardBottom),project(b,boardBottom-fasciaHeight(s)/1000),project(a,boardBottom-fasciaHeight(s)/1000)])} fill={s.board.colour} stroke="#5f4f38" strokeWidth=".01"/>}):null}
    {showBoards?plan.boards.pieces.map((piece,i)=><path key={i} d={ringPath(boardRings(piece).map(r=>r.map(p=>project(p))))} fillRule="evenodd" fill={s.board.colour} stroke="#5f4f38" strokeWidth=".01"/>):null}
  </svg>
})
