import OpenIcon from './OpenIcon'
import PlanRotation from './PlanRotationControls'
import { rotatedViewBox } from './planRotation'
import { Field } from './SettingControls'
import { MAX_PROJECT_SIZE, MAX_OUTLINE_POINTS } from './projectLimits'
import { fitOutline as fit, visibleGrid } from './outlineViewport'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { distance, polygonArea, polygonError } from './planner'
import { ringPath } from './shapeGeometry'
import CutoutCanvas from './CutoutCanvas'
import { cutoutBounds } from './cutoutInteraction'
import type { CutoutTool } from './cutoutInteraction'
import type { Cutout, Point } from './planner'
import { bearing, interiorAngle, pointAt, projectOnEdge, setInteriorAngle, snapPoint, tidy } from './editorGeometry'

type Tool='move'|'draw'|'insert'|'remove'
function NumberField({label,value,onChange,min,max}: {label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number}) {
  return <Field label={label} className="editor-field"><input type="number" step=".001" min={min} max={max} value={Number.isFinite(value)?tidy(value):''} onChange={e=>{if(e.target.value!==''&&Number.isFinite(+e.target.value))onChange(+e.target.value)}}/></Field>
}
export default function OutlineEditor({polygon,cutouts=[],selectedCutout,onSelectCutout,cutoutPlacement,onCutoutPlacement,cutoutClearance,onCutoutsChange,onApply,onDirtyChange}: {polygon:Point[];cutouts?:Cutout[];selectedCutout:string|null;onSelectCutout:(id:string|null)=>void;cutoutPlacement:CutoutTool|null;onCutoutPlacement:(tool:CutoutTool|null)=>void;cutoutClearance:number;onCutoutsChange:(holes:Cutout[])=>string;onApply:(p:Point[])=>void;onDirtyChange?:(dirty:boolean)=>void}) {
  const [draft,setDraft]=useState<Point[]>(()=>polygon.map(p=>({...p}))),[tool,setTool]=useState<Tool>('move'),[selected,setSelected]=useState<number|null>(0)
  const [grid,setGrid]=useState(.1),[angleSnap,setAngleSnap]=useState(0),[past,setPast]=useState<Point[][]>([]),[future,setFuture]=useState<Point[][]>([])
  const [edgeLength,setEdgeLength]=useState(1),[edgeAngle,setEdgeAngle]=useState(0),[cursor,setCursor]=useState<Point|null>(null),[message,setMessage]=useState('')
  const [viewRotation,setViewRotation]=useState(0),[dragOutline,setDragOutline]=useState<Point[]|null>(null)
  const worldLayer=useRef<SVGGElement>(null)
  const [cutoutBusy,setCutoutBusy]=useState(false),[cutoutPreview,setCutoutPreview]=useState<Cutout[]|null>(null)
  const customClose=useRef<(()=>void)|null>(null),rememberCustom=useCallback((close:(()=>void)|null)=>{customClose.current=close},[])
  const visibleCutouts=cutoutPreview??cutouts,activeCutout=visibleCutouts.find(h=>h.id===selectedCutout)
  const svg=useRef<SVGSVGElement>(null),drag=useRef<{index:number;start:Point[];latest:Point[]}|null>(null),id=useId().replaceAll(':','')
  // Keep the view steady during a corner drag, then fit the updated outline.
  const camera=fit(dragOutline??draft)
  const minorGrid=visibleGrid(camera),majorGrid=minorGrid*10
  const err=draft.length>=3?polygonError(draft):'Place at least three corners to enclose a deck.'
  const dirty=JSON.stringify(draft)!==JSON.stringify(polygon),r=camera.width*.012,font=camera.width*.019
  useEffect(()=>{queueMicrotask(()=>onDirtyChange?.(dirty||cutoutBusy))},[dirty,cutoutBusy,onDirtyChange])
  useEffect(()=>{if(cutoutPlacement)queueMicrotask(()=>setTool('move'))},[cutoutPlacement])
  const record=(points:Point[],before=draft)=>{setPast(p=>[...p.slice(-49),before]);setFuture([]);setDraft(points);setMessage('')}
  const world=(e:ReactPointerEvent)=>{const matrix=worldLayer.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:p.x,y:p.y}}
  const snapped=(p:Point,origin?:Point)=>snapPoint(p,grid,origin,angleSnap)
  const remove=(i:number)=>{if(draft.length<=3){setMessage('A closed outline needs at least three corners.');return}record(draft.filter((_,j)=>i!==j));setSelected(Math.min(i,draft.length-2))}
  const chooseCorner=(e:ReactPointerEvent<SVGGElement>,i:number)=>{
    if(e.button!==0)return
    e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true})
    if(tool==='draw'){if(i===0&&draft.length>=3){setTool('move');setSelected(0)}return}
    if(tool==='remove'){remove(i);return}
    onSelectCutout(null);onCutoutPlacement(null);setSelected(i)
    if(tool==='move'){setDragOutline(draft);drag.current={index:i,start:draft.map(p=>({...p})),latest:draft};svg.current?.setPointerCapture(e.pointerId)}
  }
  const move=(e:ReactPointerEvent<SVGSVGElement>)=>{
    const raw=world(e),origin=tool==='draw'?draft.at(-1):drag.current?drag.current.start[(drag.current.index+draft.length-1)%draft.length]:undefined,q=snapped(raw,origin)
    setCursor(q)
    if(drag.current){const d=drag.current;d.latest=d.start.map((p,i)=>i===d.index?q:p);setDraft(d.latest)}
  }
  const finishDrag=(e:ReactPointerEvent<SVGSVGElement>,cancel=false)=>{
    const d=drag.current;if(!d)return
    drag.current=null;setDragOutline(null)
    if(cancel)setDraft(d.start);else if(JSON.stringify(d.latest)!==JSON.stringify(d.start))record(d.latest,d.start)
    if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId)
  }
  const undo=()=>{const previous=past.at(-1);if(previous){setFuture(f=>[draft,...f]);setDraft(previous);setPast(p=>p.slice(0,-1));setSelected(null)}}
  const redo=()=>{const next=future[0];if(next){setPast(p=>[...p,draft]);setDraft(next);setFuture(f=>f.slice(1));setSelected(null)}}
  const newDrawing=()=>{onCutoutPlacement(null);onSelectCutout(null);record([]);setSelected(null);setTool('draw');setCursor(null);setMessage('Click each corner in order. Click the first corner or Close outline to finish.')}
  const appendExact=()=>{if(!Number.isFinite(edgeLength)||edgeLength<.05||edgeLength>MAX_PROJECT_SIZE*Math.SQRT2){setMessage(`Enter an edge length between 0.05 and ${(MAX_PROJECT_SIZE*Math.SQRT2).toFixed(2)} m.`);return}if(draft.length>=MAX_OUTLINE_POINTS){setMessage(`Use up to ${MAX_OUTLINE_POINTS} outline points.`);return}const start=draft.length?draft:[{x:0,y:0}];const next=[...start,pointAt(start.at(-1)!,edgeLength,edgeAngle)];record(next);setSelected(start.length)}
  const active=selected!==null?draft[selected]:undefined,next=active?draft[(selected!+1)%draft.length]:undefined
  const drawPreview=tool==='draw'&&draft.length&&cursor?[...draft,cursor]:draft
  return <div className="outline-editor">
    <div className="designer-heading"><div><h3>Custom outline</h3><p>Drag corners or add points. The drawing automatically fits your outline.</p></div><span className={`draft-chip ${dirty?'unsaved':''}`}>{dirty?'Unapplied outline':'Current outline'}</span></div>
    <div className="editor-toolbar" role="group" aria-label="Outline drawing tools">
      <button className={tool==='move'?'active':''} onClick={()=>{onCutoutPlacement(null);onSelectCutout(null);setTool('move')}}>↖ Move / select</button><button className={tool==='draw'?'active':''} onClick={newDrawing}>＋ Draw new</button><button className={tool==='insert'?'active':''} onClick={()=>{onCutoutPlacement(null);onSelectCutout(null);setTool('insert')}}>＋ Insert corner</button><button className={tool==='remove'?'active':''} onClick={()=>{onCutoutPlacement(null);onSelectCutout(null);setTool('remove')}}>− Remove corner</button>
      <button className={cutoutPlacement?'active':''} aria-pressed={!!cutoutPlacement} disabled={dirty||!!err||cutouts.length>=10&&!cutoutPlacement} onClick={()=>{onSelectCutout(null);onCutoutPlacement(cutoutPlacement?null:'rectangle');setMessage('')}}>＋ Cutout</button>
      <button className={cutoutPlacement==='custom'?'':'cutout-action-placeholder'} disabled={cutoutPlacement!=='custom'} onClick={()=>{if(customClose.current)customClose.current();else setMessage('Click at least three points around the opening.')}}>Close cutout</button>
      <button className={cutoutPlacement?'':'cutout-action-placeholder'} disabled={!cutoutPlacement} onClick={()=>onCutoutPlacement(null)}>Cancel cutout</button>
      <button onClick={undo} disabled={!past.length} aria-label="Undo outline edit">↶</button><button onClick={redo} disabled={!future.length} aria-label="Redo outline edit">↷</button>
    </div>
    <p className="cutout-canvas-help" aria-live="polite">{cutoutPlacement==='custom'?'Click the opening’s corners, then click the first point or Close cutout. Escape cancels.':cutoutPlacement?'Click inside the deck to place an opening, or drag to draw its size. Escape cancels.':'Click an opening to select it. Drag to move; pull a corner handle to resize.'}</p>
    <div className="editor-snap"><Field label="Grid snap"><select aria-label="Grid snap" value={grid} onChange={e=>setGrid(+e.target.value)}><option value="0">Off</option><option value="0.01">10 mm</option><option value="0.05">50 mm</option><option value="0.1">100 mm</option><option value="0.5">500 mm</option></select></Field><Field label="Angle snap"><select aria-label="Angle snap" value={angleSnap} onChange={e=>setAngleSnap(+e.target.value)}><option value="0">Free angle</option><option value="15">15°</option><option value="45">45°</option><option value="90">90°</option></select></Field></div>
    <PlanRotation value={viewRotation} onChange={setViewRotation}/>
    <svg ref={svg} className={`outline-svg tool-${tool}`} viewBox={rotatedViewBox(camera.x,camera.y,camera.width,camera.height,viewRotation)} role="application" aria-label="Interactive deck outline editor" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();if(tool==='draw'){if(draft.length>=MAX_OUTLINE_POINTS){setMessage(`Use up to ${MAX_OUTLINE_POINTS} outline points.`);return}const q=snapped(world(e),draft.at(-1));if(draft.length>=3&&distance(q,draft[0])<r*2){setTool('move');setSelected(0)}else {record([...draft,q]);setSelected(draft.length)}}else {setSelected(null);onSelectCutout(null)}}} onPointerMove={move} onPointerUp={e=>finishDrag(e)} onPointerCancel={e=>finishDrag(e,true)} onPointerLeave={()=>{if(!drag.current)setCursor(null)}}>
      <g ref={worldLayer} transform={`rotate(${viewRotation} ${camera.x+camera.width/2} ${camera.y+camera.height/2})`}>
      <defs><pattern id={`${id}-grid`} width={minorGrid} height={minorGrid} patternUnits="userSpaceOnUse"><path d={`M${minorGrid} 0H0V${minorGrid}`} fill="none" stroke="#b7c4b1" strokeWidth=".6" vectorEffect="non-scaling-stroke"/></pattern><pattern id={`${id}-major`} width={majorGrid} height={majorGrid} patternUnits="userSpaceOnUse"><rect width={majorGrid} height={majorGrid} fill={`url(#${id}-grid)`}/><path d={`M${majorGrid} 0H0V${majorGrid}`} stroke="#91a288" strokeWidth=".8" fill="none" vectorEffect="non-scaling-stroke"/></pattern></defs>
      <rect x={camera.x} y={camera.y} width={camera.width} height={camera.height} fill={`url(#${id}-major)`}/>
      <path d={`M${camera.x} 0H${camera.x+camera.width}M0 ${camera.y}V${camera.y+camera.height}`} stroke="#75866d" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" strokeWidth="1" pointerEvents="none"/>
      {tool==='draw'?<polyline points={drawPreview.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#456d43" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/>:<path d={ringPath([draft,...visibleCutouts.map(h=>h.polygon)])} fillRule="evenodd" fill={err?'#f2d9c6':'#d4e1c5'} fillOpacity=".8" stroke={err?'#b86e4a':'#456d43'} strokeWidth="2" vectorEffect="non-scaling-stroke"/>}
      {draft.map((a,i)=>{const b=draft[(i+1)%draft.length];if(tool==='draw'&&i===draft.length-1)return null;const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2},len=distance(a,b)||1,dx=-(b.y-a.y)/len*font,dy=(b.x-a.x)/len*font;return <g key={i}>
        <polygon points={`${a.x+dx},${a.y+dy} ${b.x+dx},${b.y+dy} ${b.x-dx},${b.y-dy} ${a.x-dx},${a.y-dy}`} fill="transparent" className="edge-handle" role="button" tabIndex={0} aria-label={`Edge ${i+1}, ${distance(a,b).toFixed(3)} metres`} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});if(tool==='insert'){if(draft.length>=MAX_OUTLINE_POINTS){setMessage(`Use up to ${MAX_OUTLINE_POINTS} outline points.`);return}const q=projectOnEdge(snapped(world(e)),a,b);record([...draft.slice(0,i+1),q,...draft.slice(i+1)]);setSelected(i+1);setTool('move')}else {onSelectCutout(null);setSelected(i)}}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSelected(i)}}}/>
        <text visibility={draft.length>16&&selected!==i?'hidden':undefined} x={middle.x} y={middle.y-font*.5} textAnchor="middle" fontSize={font} fill="#45623d" paintOrder="stroke" stroke="#f4f6ec" strokeWidth={font*.16} pointerEvents="none">{distance(a,b).toFixed(2)} m</text>
      </g>})}
      {draft.map((p,i)=><g key={i} role="button" tabIndex={0} aria-label={`Corner ${i+1}, x ${p.x}, y ${p.y}`} className="corner-handle" onPointerDown={e=>chooseCorner(e,i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i)}if(e.key==='Delete'){e.preventDefault();remove(i)}const offsets:Record<string,Point>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};if(offsets[e.key]){e.preventDefault();const d=offsets[e.key],step=grid||.01;record(draft.map((q,j)=>i===j?{x:tidy(q.x+d.x*step),y:tidy(q.y+d.y*step)}:q));setSelected(i)}}}>
        <circle cx={p.x} cy={p.y} r={r*1.5} fill="transparent" stroke="none" aria-hidden="true" focusable="false"/><circle cx={p.x} cy={p.y} r={r} fill={selected===i?'#304f39':'#fff'} stroke="#304f39" strokeWidth="2" vectorEffect="non-scaling-stroke"/><text x={p.x} y={p.y+font*.32} fontSize={font*.8} textAnchor="middle" fill={selected===i?'#fff':'#304f39'} pointerEvents="none">{i+1}</text>
      </g>)}
      {cursor?<text x={camera.x+font} y={camera.y+camera.height-font} fontSize={font*.8} fill="#5d7350" pointerEvents="none">x {cursor.x.toFixed(3)}, y {cursor.y.toFixed(3)} m</text>:null}
      <CutoutCanvas key={cutoutPlacement??'edit'} polygon={draft} cutouts={cutouts} selected={selectedCutout} placement={cutoutPlacement} grid={grid} clearance={cutoutClearance} camera={camera} blocked={dirty||tool==='draw'} onSelect={onSelectCutout} onPlacement={onCutoutPlacement} onChange={onCutoutsChange} onMessage={setMessage} onPreview={setCutoutPreview} onActivity={setCutoutBusy} onCustomReady={rememberCustom}/>
    </g></svg>
    <div className="editor-inspector">
      {activeCutout&&!cutoutPlacement?<><div><strong>{activeCutout.name}</strong><small>{cutoutBounds(activeCutout).width.toFixed(2)} × {cutoutBounds(activeCutout).depth.toFixed(2)} m · Drag to move · Square handles resize · Delete removes</small></div><button className="button secondary" disabled={cutoutBusy} onClick={()=>{const issue=onCutoutsChange(cutouts.filter(h=>h.id!==activeCutout.id));setMessage(issue);if(!issue)onSelectCutout(null)}}>Delete cutout</button></>:tool==='draw'?<><div><strong>Build the next edge</strong><small>0° right · 90° up · 180° left · 270° down. With no points, the first edge starts at (0, 0).</small></div><div className="inspector-fields"><NumberField label="Next edge length (m)" value={edgeLength} onChange={setEdgeLength} min={.05} max={MAX_PROJECT_SIZE*Math.SQRT2}/><NumberField label="Next edge bearing (°)" value={edgeAngle} onChange={setEdgeAngle}/><button className="button secondary" onClick={appendExact}>Add exact edge</button><button className="button secondary" disabled={draft.length<3} onClick={()=>{setTool('move');setSelected(0)}}>Close outline</button></div></>:active&&next?<><div><strong>Corner {selected!+1}</strong><small>Changing an edge or corner angle moves the following corner.</small></div><div className="inspector-fields"><NumberField label="Corner X (m)" value={active.x} onChange={x=>record(draft.map((p,i)=>i===selected?{...p,x}:p))}/><NumberField label="Corner Y (m)" value={active.y} onChange={y=>record(draft.map((p,i)=>i===selected?{...p,y}:p))}/><NumberField label="Outgoing edge length (m)" value={distance(active,next)} min={.05} onChange={length=>record(draft.map((p,i)=>i===(selected!+1)%draft.length?pointAt(active,length,bearing(active,next)):p))}/><NumberField label="Outgoing bearing (°)" value={bearing(active,next)} onChange={angle=>record(draft.map((p,i)=>i===(selected!+1)%draft.length?pointAt(active,distance(active,next),angle):p))}/><NumberField label="Interior corner angle (°)" value={interiorAngle(draft,selected!)} min={1} max={359} onChange={angle=>record(setInteriorAngle(draft,selected!,angle))}/></div><div className="angle-presets">Corner angle:{[45,90,135,225,270].map(a=><button key={a} onClick={()=>record(setInteriorAngle(draft,selected!,a))}>{a}°</button>)}<button onClick={()=>remove(selected!)}>Delete corner</button></div></>:<p className="field-note">Select a corner to edit coordinates, edge length, bearing and interior angle. Arrow keys nudge a focused corner by the grid step.</p>}
    </div>
    {(message||err)&&<p className={err&&tool!=='draw'?'designer-error':'designer-hint'} role={err&&tool!=='draw'?'alert':'status'}>{message||err}</p>}
    <div className="editor-footer"><span>{draft.length} corners {draft.length>=3?`· ${(polygonArea(draft)-cutouts.reduce((sum,h)=>sum+polygonArea(h.polygon),0)).toFixed(2)} m²`:''} · Coordinates: X right, Y down</span><div><button className="button secondary" onClick={()=>{record(polygon.map(p=>({...p})));setTool('move');setSelected(0)}}>Revert outline</button><button className="button primary" disabled={!dirty||!!err||tool==='draw'||cutoutBusy} onClick={()=>{onApply(draft);setMessage('')}}>Apply outline to deck <OpenIcon/></button></div></div>
  </div>
}
