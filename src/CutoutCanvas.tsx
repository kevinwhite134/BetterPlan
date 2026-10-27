import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Cutout, Point } from './planner'
import type { CutoutTool } from './cutoutInteraction'
import { cutoutBounds, cutoutCorners, cutoutEditError, moveCutout, newCutout, placedCutout, resizeCutout } from './cutoutInteraction'
import { snapPoint } from './editorGeometry'

type Drag={pointer:number;node:SVGElement;kind:'create'|'move'|'resize'|'vertex';start:Point;original:Cutout;corner:number;latest:Cutout[]}
type Props={polygon:Point[];cutouts:Cutout[];selected:string|null;placement:CutoutTool|null;grid:number;clearance:number;camera:{x:number;y:number;width:number;height:number};blocked:boolean;
  onSelect:(id:string|null)=>void;onPlacement:(tool:CutoutTool|null)=>void;onChange:(holes:Cutout[])=>string;onMessage:(message:string)=>void;onPreview:(holes:Cutout[]|null)=>void;onActivity:(busy:boolean)=>void;onCustomReady:(close:(()=>void)|null)=>void}
const pts=(p:Point[])=>p.map(q=>`${q.x},${q.y}`).join(' ')

export default function CutoutCanvas({polygon,cutouts,selected,placement,grid,clearance,camera,blocked,onSelect,onPlacement,onChange,onMessage,onPreview,onActivity,onCustomReady}:Props){
  const group=useRef<SVGGElement>(null),drag=useRef<Drag|null>(null),custom=useRef<Point[]>([])
  const [preview,setPreview]=useState<Cutout[]|null>(null),[cursor,setCursor]=useState<Point|null>(null),[points,setPoints]=useState<Point[]>([]),[dragId,setDragId]=useState<string|null>(null)
  useEffect(()=>()=>{queueMicrotask(()=>{onPreview(null);onActivity(false);onCustomReady(null)})},[onPreview,onActivity,onCustomReady])
  const holes=preview??cutouts,font=camera.width*.018,r=camera.width*.009
  const world=(event:PointerEvent<SVGElement>)=>{const matrix=event.currentTarget.ownerSVGElement?.getScreenCTM();if(!matrix)return {x:0,y:0};const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return snapPoint({x:p.x,y:p.y},grid)}
  const update=(next:Cutout[]|null)=>{setPreview(next);onPreview(next)}
  const cancel=()=>{const d=drag.current;drag.current=null;if(d?.node.hasPointerCapture(d.pointer))d.node.releasePointerCapture(d.pointer);setDragId(null);custom.current=[];setPoints([]);setCursor(null);update(null);onActivity(false);onCustomReady(null)}
  const save=(next:Cutout[],id:string)=>{
    const error=cutoutEditError(polygon,next,clearance)||onChange(next)
    if(error){onMessage(error);return false}
    onMessage('');onSelect(id);return true
  }
  const closeCustom=()=>{
    if(custom.current.length<3){onMessage('Click at least three points around the opening.');return}
    const h:Cutout={id:crypto.randomUUID(),name:`Opening ${cutouts.length+1}`,shape:'custom',polygon:custom.current}
    if(save([...cutouts,h],h.id)){cancel();onPlacement(null)}
  }
  const start=(event:PointerEvent<SVGElement>,kind:Drag['kind'],hole?:Cutout,corner=0)=>{
    if(event.button!==0)return
    event.preventDefault();event.stopPropagation()
    if(blocked){onMessage('Apply or revert the outline draft before editing cutouts.');return}
    if(kind==='create')group.current?.focus({preventScroll:true});else event.currentTarget.focus({preventScroll:true});onMessage('')
    const q=world(event)
    if(kind==='create'&&placement==='custom'){
      if(custom.current.length>=128){onMessage('Use up to 128 points.');return}
      custom.current=[...custom.current,q];setPoints(custom.current);onActivity(true);onCustomReady(closeCustom);return
    }
    if(kind==='create'&&(!placement||placement==='custom'||cutouts.length>=10))return
    const original=hole??placedCutout(placement as Exclude<CutoutTool,'custom'>,q,crypto.randomUUID(),`Opening ${cutouts.length+1}`)
    if(hole)onSelect(hole.id)
    const latest=kind==='create'?[...cutouts,original]:cutouts
    setDragId(original.id);drag.current={pointer:event.pointerId,node:event.currentTarget,kind,start:q,original,corner,latest}
    event.currentTarget.setPointerCapture(event.pointerId);update(latest);onActivity(true)
  }
  const move=(event:PointerEvent<SVGGElement>)=>{
    if(!drag.current&&!placement)return
    event.stopPropagation();const q=world(event);setCursor(q)
    const d=drag.current;if(!d||d.pointer!==event.pointerId)return
    let h=d.original
    if(d.kind==='create'&&placement&&placement!=='custom')h=Math.hypot(q.x-d.start.x,q.y-d.start.y)<.06?placedCutout(placement,d.start,h.id,h.name):newCutout(placement,d.start,q,h.id,h.name)
    if(d.kind==='move')h=moveCutout(h,q.x-d.start.x,q.y-d.start.y)
    if(d.kind==='resize')h=resizeCutout(h,d.corner,q)
    if(d.kind==='vertex')h={...h,polygon:h.polygon.map((p,i)=>i===d.corner?q:p)}
    d.latest=d.kind==='create'?[...cutouts,h]:cutouts.map(p=>p.id===h.id?h:p);update(d.latest)
  }
  const finish=(event:PointerEvent<SVGGElement>,aborted=false)=>{
    const d=drag.current;if(!d||d.pointer!==event.pointerId)return
    event.preventDefault();event.stopPropagation();drag.current=null;setDragId(null)
    if(d.node.hasPointerCapture(d.pointer))d.node.releasePointerCapture(d.pointer)
    const saved=!aborted&&save(d.latest,d.original.id)
    update(null);onActivity(false);if(saved&&d.kind==='create')onPlacement(null)
  }
  const remove=(h:Cutout)=>{const error=onChange(cutouts.filter(p=>p.id!==h.id));if(error)onMessage(error);else{onSelect(null);onMessage('')}}
  const keys=(event:KeyboardEvent<SVGElement>,h:Cutout,corner?:number,vertex=false)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();onPlacement(null);return}
    if(blocked)return
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onSelect(h.id);return}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();remove(h);return}
    const offsets:Record<string,Point>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}},offset=offsets[event.key]
    if(!offset)return
    event.preventDefault();event.stopPropagation();onSelect(h.id)
    const step=event.shiftKey ? .01 : grid||.01,dx=offset.x*step,dy=offset.y*step
    const next=corner===undefined?moveCutout(h,dx,dy):vertex?{...h,polygon:h.polygon.map((p,i)=>i===corner?{x:p.x+dx,y:p.y+dy}:p)}:resizeCutout(h,corner,{x:cutoutCorners(h)[corner].x+dx,y:cutoutCorners(h)[corner].y+dy})
    save(cutouts.map(p=>p.id===h.id?next:p),h.id)
  }
  const error=preview?cutoutEditError(polygon,preview,clearance):''
  return <g ref={group} className={`cutout-canvas ${placement?'is-placing':''}`} role="group" aria-label="Interactive deck cutouts" tabIndex={-1} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>{if(drag.current?.pointer===e.pointerId)finish(e,true)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();onPlacement(null)}if(e.key==='Backspace'&&placement==='custom'){e.preventDefault();custom.current=custom.current.slice(0,-1);setPoints(custom.current);onActivity(custom.current.length>0);if(!custom.current.length)onCustomReady(null)}}}>
    {holes.map(h=>{const b=cutoutBounds(h),active=selected===h.id||dragId===h.id,colour=error&&active?'#ac5739':active?'#526b32':'#9b754c';return <g key={h.id}>
      <polygon points={pts(h.polygon)} fill={active?'#ecf2df':'#f8faf1'} fillOpacity=".8" stroke={colour} strokeWidth={active?'2':'1.5'} strokeDasharray={active?undefined:'5 3'} vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-label={`Cutout ${h.name}. Drag to move; arrow keys adjust; Delete removes.`} className="cutout-hit" onPointerDown={e=>start(e,'move',h)} onKeyDown={e=>keys(e,h)}/>
      <text x={b.x+b.width/2} y={b.y+b.depth/2-font*.2} textAnchor="middle" fontSize={font} fill={colour} pointerEvents="none">{h.name}</text>
      <text x={b.x+b.width/2} y={b.y+b.depth/2+font*.9} textAnchor="middle" fontSize={font*.75} fill={colour} pointerEvents="none">{b.width.toFixed(2)} × {b.depth.toFixed(2)} m</text>
      {active&&!placement?<><rect x={b.x} y={b.y} width={b.width} height={b.depth} fill="none" stroke={colour} strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>{cutoutCorners(h).map((p,i)=><rect key={i} x={p.x-r} y={p.y-r} width={r*2} height={r*2} rx={r*.2} fill="#fff" stroke={colour} strokeWidth="2" vectorEffect="non-scaling-stroke" role="button" tabIndex={0} className={`cutout-resize corner-${i}`} aria-label={`Resize ${h.name} ${['top left','top right','bottom right','bottom left'][i]}`} onPointerDown={e=>start(e,'resize',h,i)} onKeyDown={e=>keys(e,h,i)}/>)}{h.shape==='custom'?h.polygon.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={r*.75} fill={colour} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" role="button" tabIndex={0} className="cutout-vertex" aria-label={`${h.name} point ${i+1}`} onPointerDown={e=>start(e,'vertex',h,i)} onKeyDown={e=>keys(e,h,i,true)}/>):null}</>:null}
    </g>})}
    {placement?<><rect x={camera.x} y={camera.y} width={camera.width} height={camera.height} fill="transparent" className="cutout-place-surface" onPointerDown={e=>start(e,'create')}/>{placement==='custom'?<>
      <polyline points={pts([...points,...(cursor?[cursor]:[])])} fill={points.length>2?'#dce8c5':'none'} fillOpacity=".5" stroke="#526b32" strokeWidth="2" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
      {points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={r} fill={i===0?'#526b32':'#fff'} stroke="#526b32" strokeWidth="2" vectorEffect="non-scaling-stroke" role={i===0?'button':undefined} tabIndex={i===0?0:undefined} aria-label={i===0?'Close custom cutout':undefined} onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(i===0)closeCustom()}} onKeyDown={e=>{if(i===0&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();closeCustom()}}}/>)}
    </>:cursor&&!preview?<polygon points={pts(placedCutout(placement,cursor,'preview','').polygon)} fill="#dde9c7" fillOpacity=".5" stroke="#718650" strokeWidth="1.5" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>:null}</>:null}
  </g>
}
