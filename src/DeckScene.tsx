import { useFrameState } from './useFrameState'
import { displacePart, explodedLayout } from './explodedLayout'
import { signedArea } from './deckGeometry'
import { frameHardware } from './frameHardware'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ScenePointer } from 'react'
import type { Plan, Point, Settings } from './planner'
import type { Position3, StructureExposure } from './structureGeometry'
import { bounds } from './planner'
import { boardRings, ringPath } from './shapeGeometry'
import { isLargePreview } from './renderOverview'
import StructureDrawing from './StructureDrawing'
import { LayerThumbnail } from './DeckLayerThumbnail'
import { pickBoard, pickStructure, sceneComponent } from './sceneComponents'
import type { SceneTier } from './sceneComponents'
import { materialEstimate } from './materialEstimate'
import { pedestalHeights } from './pedestalSurvey'
import DeckLabels, { DeckLabelKey } from './DeckLabels'

const layers:{id:StructureExposure;name:string}[]=[{id:'finished',name:'Finished deck'},{id:'boards',name:'Decking boards'},{id:'joists',name:'Alu-Joists'},{id:'bearers',name:'Bearers'},{id:'pedestals',name:'Pedestals'}]
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
const points=(ring:Point[])=>ring.map(p=>`${p.x},${p.y}`).join(' ')
export default function DeckScene({plan,s,showSupports,prices,onShowMaterial}:{plan:Plan;s:Settings;showSupports:boolean;prices:Record<string,string>;onShowMaterial?:(key:string)=>void}){
  const [rotation,setRotation]=useFrameState(35),[tilt,setTilt]=useFrameState(52),[explode,setExplode]=useFrameState(0)
  const [exposure,setExposure]=useState<StructureExposure>('finished'),[labels,setLabels]=useState(false),[selected,setSelected]=useState<string|null>(null)
  const [camera,setCamera]=useFrameState<{zoom:number;centre:Point|null;focus:boolean}>({zoom:1,centre:null,focus:false}),[dragging,setDragging]=useState(false)
  const [pixelSize,setPixelSize]=useState({width:700,height:480})
  const svg=useRef<SVGSVGElement>(null),pointers=useRef(new Map<number,Point>())
  const gesture=useRef<{x:number;y:number;rotation:number;tilt:number;centre:Point;zoom:number;pan:boolean;distance?:number;target:string|null;moved:boolean}|null>(null)
  const box=bounds(plan.physical),a=rotation*Math.PI/180,t=tilt*Math.PI/180,hasBearers=plan.frame.rule.bearer>0
  const layout=useMemo(()=>explodedLayout(plan,s,explode),[plan,s,explode])
  const exposed=exposure==='bearers'&&!hasBearers?'joists':exposure,showBoards=exposed==='boards'||exposed==='finished',supports=showSupports||exposed==='pedestals',large=isLargePreview(plan)
  const projectRaw=useCallback((p:Position3):Point=>{const x=p.x-box.width/2,y=p.y-box.depth/2;return {x:x*Math.cos(a)-y*Math.sin(a),y:(x*Math.sin(a)+y*Math.cos(a))*Math.cos(t)-p.z*Math.sin(t)}},[box.width,box.depth,a,t])
  const project=useCallback((p:Position3,tier:SceneTier='board',component?:string):Point=>projectRaw(displacePart(p,layout,component,tier)),[projectRaw,layout])
  const projectStructure=useCallback((p:Position3,kind?:'pedestal'|'bearer'|'joist',component?:string)=>project(p,kind??'joist',component),[project])
  const physical=(p:Point,z=0):Position3=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z})
  const front=(p:Point,q:Point)=>{const u=physical(p),v=physical(q),sign=signedArea(plan.physical)>0?1:-1;return ((v.y-u.y)*Math.sin(a)-(v.x-u.x)*Math.cos(a))*sign>1e-7}
  const board=(p:Point,z=0,component?:string)=>project(physical(p,z),'board',component)
  const survey=useMemo(()=>pedestalHeights(plan.frame.pedestals,s,plan.frame.rule),[plan,s]),ground=Math.min(-s.height/1000,...survey.rows.map(r=>r.ground)),bottom=-s.board.thickness/1000
  const extent=layout.amount?[...layout.boundsByTier].filter(([tier])=>tier==='board'?showBoards:tier==='joist'?exposed!=='pedestals'&&exposed!=='bearers':tier==='bearer'?exposed!=='pedestals':supports).flatMap(([,b])=>[b.minX,b.maxX].flatMap(x=>[b.minY,b.maxY].flatMap(y=>[b.minZ,b.maxZ].map(z=>projectRaw({x,y,z}))))):plan.physical.flatMap(p=>[projectRaw({...p,z:ground}),projectRaw({...p,z:0})])
  if(!extent.length)extent.push(...plan.physical.map(p=>projectRaw({...p,z:0})))
  const pad=.4
  const base={x:Math.min(...extent.map(p=>p.x))-pad,y:Math.min(...extent.map(p=>p.y))-pad,w:Math.max(...extent.map(p=>p.x))-Math.min(...extent.map(p=>p.x))+2*pad,h:Math.max(...extent.map(p=>p.y))-Math.min(...extent.map(p=>p.y))+2*pad}
  const detail=useMemo(()=>selected?sceneComponent(plan,s,selected):null,[plan,s,selected]),focusPoint=detail?project(detail.point,detail.tier,detail.id):null
  const centre=camera.focus&&focusPoint?focusPoint:camera.centre??{x:base.x+base.w/2,y:base.y+base.h/2},view={x:centre.x-base.w/camera.zoom/2,y:centre.y-base.h/camera.zoom/2,w:base.w/camera.zoom,h:base.h/camera.zoom}
  const estimate=useMemo(()=>materialEstimate(plan,prices),[plan,prices]),material=estimate.lines.find(m=>m.key===detail?.materialKey)
  const boardPaths=useMemo(()=>large?plan.boards.pieces.map((p,i)=>ringPath(boardRings(p).map(r=>r.map(q=>project({...(s.direction==='vertical'?{x:q.y,y:q.x}:q),z:0},'board',`board-${i}`))))).join(''):'',[large,plan,s.direction,project])
  const boardSides=useMemo(()=>{
    if(!layout.amount)return ''
    const paths:string[]=[],physical=(p:Point,z:number):Position3=>({...(s.direction==='vertical'?{x:p.y,y:p.x}:p),z})
    for(const [index,piece] of plan.boards.pieces.entries())for(const ring of boardRings(piece))for(let i=0;i<ring.length;i++){
      const p=ring[i],q=ring[(i+1)%ring.length],u=physical(p,0),v=physical(q,0),sign=signedArea(plan.physical)>0?1:-1
      if(((v.y-u.y)*Math.sin(a)-(v.x-u.x)*Math.cos(a))*sign<=1e-7)continue
      const ringPoints=[u,v,physical(q,-s.board.thickness/1000),physical(p,-s.board.thickness/1000)].map(p=>project(p,'board',`board-${index}`))
      paths.push(ringPath([ringPoints]))
    }
    return paths.join('')
  },[layout.amount,plan,s.direction,s.board.thickness,a,project])
  useEffect(()=>{const element=svg.current;if(!element)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width>0&&height>0)setPixelSize({width,height})});observer.observe(element);return ()=>observer.disconnect()},[])
  useEffect(()=>{const element=svg.current,block=(e:WheelEvent)=>e.preventDefault();element?.addEventListener('wheel',block,{passive:false});return ()=>element?.removeEventListener('wheel',block)},[])
  const coordinates=(e:{clientX:number;clientY:number})=>{const m=svg.current?.getScreenCTM();if(!m)return centre;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return {x:p.x,y:p.y}}
  const zoom=(factor:number,anchor=centre)=>{const next=clamp(camera.zoom*factor,1,24),ratio=camera.zoom/next;setCamera({zoom:next,focus:false,centre:next===1?null:{x:anchor.x+(centre.x-anchor.x)*ratio,y:anchor.y+(centre.y-anchor.y)*ratio}})}
  const focus=()=>{if(!detail)return;const projected=detail.rings.flatMap(r=>r.map(p=>project(p,detail.tier,detail.id))),w=Math.max(.1,Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x))),h=Math.max(.1,Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)));setCamera({zoom:clamp(Math.min(base.w/(w*2.5),base.h/(h*2.5)),1,24),centre:null,focus:true})}
  const reset=()=>{setCamera({zoom:1,centre:null,focus:false});setRotation(35);setTilt(52)}
  const pick=(e:ScenePointer<SVGSVGElement>,target:string|null)=>{const q=coordinates(e),id=target??(showBoards?pickBoard(plan,s,q,project):null)??pickStructure(plan,s,q,exposed,supports,project,view.w/75);setSelected(id);setCamera(c=>({...c,focus:false}))}
  const down=(e:ScenePointer<SVGSVGElement>)=>{
    if(e.button>2)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
    const all=[...pointers.current.values()],distance=all.length===2?Math.hypot(all[0].x-all[1].x,all[0].y-all[1].y):undefined
    gesture.current={x:all.reduce((n,p)=>n+p.x/all.length,0),y:all.reduce((n,p)=>n+p.y/all.length,0),rotation,tilt,centre,zoom:camera.zoom,pan:e.shiftKey||e.button!==0,distance,target:(e.target as Element).closest('[data-component]')?.getAttribute('data-component')??null,moved:all.length>1};setDragging(false)
  }
  const move=(e:ScenePointer<SVGSVGElement>)=>{
    if(!pointers.current.has(e.pointerId)||!gesture.current)return
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const all=[...pointers.current.values()],g=gesture.current,x=all.reduce((n,p)=>n+p.x/all.length,0),y=all.reduce((n,p)=>n+p.y/all.length,0),dx=x-g.x,dy=y-g.y
    if(Math.hypot(dx,dy)>4||all.length>1){g.moved=true;setDragging(true)}
    if(all.length>1&&g.distance){const distance=Math.max(1,Math.hypot(all[0].x-all[1].x,all[0].y-all[1].y)),next=clamp(g.zoom*distance/g.distance,1,24),rect=e.currentTarget.getBoundingClientRect(),scale=Math.min(rect.width/(base.w/g.zoom),rect.height/(base.h/g.zoom));setCamera({zoom:next,centre:{x:g.centre.x-dx/scale,y:g.centre.y-dy/scale},focus:false});return}
    if(!g.moved)return
    if(g.pan){const m=e.currentTarget.getScreenCTM();if(m)setCamera({zoom:g.zoom,centre:{x:g.centre.x-dx/m.a,y:g.centre.y-dy/m.d},focus:false})}
    else{setRotation(((g.rotation-dx*.45)%360+360)%360);setTilt(clamp(g.tilt-dy*.25,15,85))}
  }
  const end=(e:ScenePointer<SVGSVGElement>)=>{const g=gesture.current;pointers.current.delete(e.pointerId);if(g&&!g.moved&&!pointers.current.size)pick(e,g.target);if(!pointers.current.size){gesture.current=null;setDragging(false)}if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}
  const chooseLayer=(id:StructureExposure)=>{setExposure(id);setSelected(null);setCamera({zoom:1,centre:null,focus:false})}
  const inspect=(id:string)=>{const item=sceneComponent(plan,s,id);if(!item)return;setSelected(item.id);setExposure(item.tier==='board'?'finished':item.tier==='bearer'?'bearers':item.tier==='pedestal'?'pedestals':'joists');setCamera(c=>({...c,focus:false}))}
  const hardwareChoices=useMemo(()=>{const choices:Record<string,string[]>={continuousJoiners:[],joistJoiners:[],perpendicularJoiners:[]};for(const c of frameHardware(plan.frame,s.frameFaceWidth??35).connections){if(c.kind==='butt'){choices.continuousJoiners.push(`continuous-${c.id}`);choices.joistJoiners.push(`side--1-${c.id}`,`side-1-${c.id}`)}else choices.perpendicularJoiners.push(c.id)}return choices},[plan,s.frameFaceWidth])

  const inspectionId=(type:string,index:number)=>hardwareChoices[type]?.[index]??`${type}-${index}`
  const inspectorType=detail?.id.startsWith('board-')?'board':detail?.id.startsWith('member-')?'member':detail?.id.startsWith('pedestal-')?'pedestal':detail?.id.startsWith('fascia-')?'fascia':detail?.materialKey.endsWith('Joiners')?detail.materialKey:'member'
  return <div className="deck-view perspective interactive-deck-scene">
    <div className="scene-controls"><div role="group" aria-label="3D zoom"><button aria-label="Zoom out 3D" disabled={camera.zoom<=1} onClick={()=>zoom(1/1.3)}>−</button><output>{Math.round(camera.zoom*100)}%</output><button aria-label="Zoom in 3D" disabled={camera.zoom>=24} onClick={()=>zoom(1.3)}>＋</button><button disabled={!detail} onClick={focus}>Focus selected</button><button onClick={reset}>Fit assembly</button></div><label>Exploded view <input aria-label="Exploded view separation" type="range" min={0} max={100} value={explode} onChange={e=>{setExplode(+e.target.value);setCamera(c=>({...c,centre:null}));if(+e.target.value>0)setExposure('finished')}}/><output>{explode}%</output></label><div className="scene-camera-buttons" role="group" aria-label="3D camera controls"><button aria-label="Rotate view left" onClick={()=>setRotation(rotation-15)}>↶</button><button aria-label="Rotate view right" onClick={()=>setRotation(rotation+15)}>↷</button><button aria-label="Tilt view up" onClick={()=>setTilt(clamp(tilt+5,15,85))}>↑</button><button aria-label="Tilt view down" onClick={()=>setTilt(clamp(tilt-5,15,85))}>↓</button></div></div>
    <div className="viewer-stage"><svg ref={svg} className={`deck-svg orbit-canvas ${dragging?'is-orbiting':''}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label={`3D deck view: ${layers.find(l=>l.id===exposed)?.name}. Zoom ${Math.round(camera.zoom*100)} percent. Exploded ${explode} percent. Rotation ${Math.round(rotation)} degrees, tilt ${Math.round(tilt)} degrees.`} tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>{pointers.current.delete(e.pointerId);gesture.current=null;setDragging(false)}} onContextMenu={e=>e.preventDefault()} onWheel={e=>zoom(Math.exp(-e.deltaY*.002),coordinates(e))} onKeyDown={e=>{if(e.key==='+'||e.key==='=')zoom(1.3);else if(e.key==='-')zoom(1/1.3);else if(e.key.toLowerCase()==='f')focus();else if(e.key==='Home')reset();else if(e.key==='ArrowLeft')setRotation(rotation-10);else if(e.key==='ArrowRight')setRotation(rotation+10);else if(e.key==='ArrowUp')setTilt(clamp(tilt+5,15,85));else if(e.key==='ArrowDown')setTilt(clamp(tilt-5,15,85));else if(e.key==='Escape')setSelected(null);else return;e.preventDefault()}}>
      <path d={ringPath([plan.p,...plan.holes].map(r=>r.map(p=>project(physical(p,ground-.01),'pedestal'))))} fill="#344b37" fillRule="evenodd" opacity=".09"/>
      <StructureDrawing plan={plan} settings={s} exposure={exposed} showSupports={supports} rotation={rotation} tilt={tilt} project={projectStructure}/>
      {/* A dark surface behind assembled boards keeps installation gaps visually consistent. */}
      {showBoards&&!layout.amount?<path d={ringPath([plan.p,...plan.holes].map(r=>r.map(p=>board(p))))} fill="#000" fillRule="evenodd" pointerEvents="none"/>:null}
      {showBoards?<>{layout.amount?<path d={boardSides} fill="#806343" stroke="#72583b" strokeWidth=".003"/>:plan.p.map((p,i)=>{const q=plan.p[(i+1)%plan.p.length];if(!front(p,q))return null;return <polygon key={i} points={points([board(p),board(q),board(q,bottom),board(p,bottom)])} fill={s.board.colour} stroke="#72583b" strokeWidth=".003"/>})}{large?<path d={boardPaths} fill={s.board.colour} fillRule="evenodd" stroke="#72583b" strokeWidth=".003"/>:plan.boards.pieces.map((p,i)=><path key={i} data-component={`board-${i}`} d={ringPath(boardRings(p).map(r=>r.map(q=>board(q,0,`board-${i}`))))} fill={s.board.colour} fillRule="evenodd" stroke="#72583b" strokeWidth=".004"><title>Deck board {i+1} · click to inspect</title></path>)}</>:null}
      {exposed==='finished'&&s.skirting?plan.skirtPieces.map((p,i)=>front(p.a,p.b)?<polygon key={i} data-component={`fascia-${i}`} points={points([board(p.a,bottom,`fascia-${i}`),board(p.b,bottom,`fascia-${i}`),board(p.b,bottom-(s.skirtingHeight??200)/1000,`fascia-${i}`),board(p.a,bottom-(s.skirtingHeight??200)/1000,`fascia-${i}`)])} fill={s.board.colour} stroke="#72583b" strokeWidth=".004"/>:null):null}
      {detail?<g className="scene-selected-part" pointerEvents="none">{detail.rings.map((ring,i)=><polygon key={i} points={points(ring.map(p=>project(p,detail.tier,detail.id.startsWith('pedestal-')?`${detail.id}:${i<25?'base':i<50?'stem':'head'}`:detail.id)))} fill="#c6e778" fillOpacity=".12" stroke="#365d22" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}<circle cx={project(detail.point,detail.tier,detail.id).x} cy={project(detail.point,detail.tier,detail.id).y} r={view.w*.007} fill="#53792c"/></g>:null}
      {labels?<DeckLabels plan={plan} s={s} exposure={exposed} showSupports={supports} project={project} view={view} layout={layout} pixelSize={pixelSize}/>:null}
    </svg><aside className="layer-rail" aria-label="Expose deck layers"><span className="layer-rail-title">EXPLORE LAYERS</span>{layers.filter(l=>l.id!=='bearers'||hasBearers).map(l=><button key={l.id} className={`layer-card ${exposed===l.id?'selected':''}`} aria-pressed={exposed===l.id} aria-label={`Show ${l.name.toLowerCase()}`} onClick={()=>chooseLayer(l.id)}><span className="layer-card-picture"><LayerThumbnail plan={plan} settings={s} exposure={l.id}/></span><span className="layer-card-label">{l.name}</span></button>)}</aside></div>
    {labels?<DeckLabelKey plan={plan} s={s} exposure={exposed} showSupports={supports} layout={layout}/>:null}
    <div className="scene-help">Click a part to inspect it. Drag to orbit; Shift-drag to pan. Scroll or pinch to zoom; two fingers pan.</div>
    <div className="scene-inspector"><div className="scene-inspector-heading"><strong>{detail?.name??'Component inspector'}</strong><label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>Label one of each component</label></div>
      {detail?<><p>{detail.dimensions}</p><dl><div><dt>Installed pieces in this category</dt><dd>{detail.count}</dd></div><div><dt>Purchase quantity</dt><dd>{material?.pending?'Pending':`${material?.qty??0} ${material?.unit??''}`}</dd></div><div><dt>Unit rate per purchased unit</dt><dd>{material?.rate==null?'Missing':`€${material.rate.toFixed(2)}`}</dd></div><div><dt>Quotation line total</dt><dd>{material?.cents==null?'Pending':`€${(material.cents/100).toFixed(2)}`}</dd></div></dl><div className="scene-inspector-actions"><button onClick={focus}>Focus on this part</button>{onShowMaterial?<button onClick={()=>onShowMaterial(detail.materialKey)}>Show in quotation</button>:null}<button onClick={()=>setSelected(null)}>Clear selection</button></div></>:<p>Select a board, aluminium member, pedestal or joiner in the model.</p>}
      <div className="scene-accessible-picker"><label>Inspect part<select aria-label="Component category" value={inspectorType} onChange={e=>inspect(inspectionId(e.target.value,0))}><option value="board">Deck board</option><option value="member">Aluminium member</option><option value="pedestal">Pedestal</option><option value="continuousJoiners" disabled={!hardwareChoices.continuousJoiners.length}>Continuous joiner</option><option value="joistJoiners" disabled={!hardwareChoices.joistJoiners.length}>Joist joiner</option><option value="perpendicularJoiners" disabled={!hardwareChoices.perpendicularJoiners.length}>Perpendicular joiner</option>{s.skirting?<option value="fascia">Fascia</option>:null}</select></label><label>Number<input aria-label="Component number" type="number" min={1} max={hardwareChoices[inspectorType]?.length??(inspectorType==='board'?plan.boards.pieces.length:inspectorType==='member'?plan.frame.members.length:inspectorType==='pedestal'?plan.frame.pedestals.length:plan.skirtPieces.length)} value={hardwareChoices[inspectorType]?Math.max(1,hardwareChoices[inspectorType].indexOf(detail?.id??'')+1):detail&&/^(board|member|pedestal|fascia)-\d+$/.test(detail.id)?Number(detail.id.split('-')[1])+1:1} onChange={e=>inspect(inspectionId(inspectorType,Math.max(0,Math.floor(+e.target.value)-1)))}/></label></div>
    </div>
  </div>
}
