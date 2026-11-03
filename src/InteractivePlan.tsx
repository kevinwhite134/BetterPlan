import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { constrainPlanView, zoomPlanView } from './planViewport'
import type { PlanViewport } from './planViewport'

const FIT:PlanViewport={zoom:1,x:0,y:0}
type Point={x:number;y:number}
const centre=(points:Point[])=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length})
const distance=(points:Point[])=>points.length>1?Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y):0

export default function InteractivePlan({src}:{src:string}){
  const element=useRef<HTMLDivElement>(null),pointers=useRef(new Map<number,Point>()),current=useRef(FIT)
  const [view,setView]=useState(FIT),[dragging,setDragging]=useState(false)
  const update=(next:PlanViewport)=>{current.current=next;setView(next)}
  useEffect(()=>{
    const window=element.current
    if(!window)return
    const wheel=(event:WheelEvent)=>{
      event.preventDefault()
      const rect=window.getBoundingClientRect(),anchor={x:event.clientX-rect.left,y:event.clientY-rect.top}
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1)
      update(zoomPlanView(current.current,Math.exp(-delta*.002),anchor,anchor,rect.width,rect.height))
    }
    const resize=new ResizeObserver(()=>update(constrainPlanView(current.current,window.clientWidth,window.clientHeight)))
    resize.observe(window);window.addEventListener('wheel',wheel,{passive:false})
    return ()=>{resize.disconnect();window.removeEventListener('wheel',wheel)}
  },[])
  const down=(event:PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0)return
    event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});setDragging(true)
  }
  const move=(event:PointerEvent<HTMLDivElement>)=>{
    if(!pointers.current.has(event.pointerId))return
    const previous=[...pointers.current.values()]
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    const next=[...pointers.current.values()],rect=event.currentTarget.getBoundingClientRect(),before=centre(previous),after=centre(next),span=distance(previous)
    update(zoomPlanView(current.current,span>0?distance(next)/span:1,{x:before.x-rect.left,y:before.y-rect.top},{x:after.x-rect.left,y:after.y-rect.top},rect.width,rect.height))
  }
  const end=(event:PointerEvent<HTMLDivElement>)=>{
    pointers.current.delete(event.pointerId);setDragging(pointers.current.size>0)
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keys=(event:KeyboardEvent<HTMLDivElement>)=>{
    const node=event.currentTarget,anchor={x:node.clientWidth/2,y:node.clientHeight/2},v=current.current
    if(event.key==='Home'||event.key==='0')update(FIT)
    else if(['+','=','-','_'].includes(event.key))update(zoomPlanView(v,event.key==='-'||event.key==='_'?1/1.25:1.25,anchor,anchor,node.clientWidth,node.clientHeight))
    else if(event.key.startsWith('Arrow'))update(constrainPlanView({...v,x:v.x+(event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0),y:v.y+(event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0)},node.clientWidth,node.clientHeight))
    else return
    event.preventDefault()
  }
  return <><div ref={element} className={`deck-svg measured-plan-window interactive-plan ${dragging?'is-dragging':''}`} tabIndex={0} role="region" aria-label="Interactive measured plan. Pinch or scroll to zoom; drag to pan. Keyboard: plus or minus to zoom, arrows to pan, Home to fit." onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={keys} onDoubleClick={event=>{const rect=event.currentTarget.getBoundingClientRect(),anchor={x:event.clientX-rect.left,y:event.clientY-rect.top};update(current.current.zoom>1?FIT:zoomPlanView(current.current,2,anchor,anchor,rect.width,rect.height))}}>
    <img className="measured-deck-plan" draggable={false} style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}} src={src} alt="Measured installer plan: edge lengths and pedestal centre-to-centre dimensions in millimetres"/>
  </div><div className="measurement-zoom"><span>{Math.round(view.zoom*100)}%</span><button type="button" onClick={()=>{pointers.current.clear();setDragging(false);update(FIT)}}>Fit</button></div><span className="interactive-plan-hint">Pinch or scroll to zoom · Drag to move</span></>
}
