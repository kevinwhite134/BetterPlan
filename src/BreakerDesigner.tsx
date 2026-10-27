import OpenIcon from './OpenIcon'
import PlanRotation from './PlanRotationControls'
import { rotatedViewBox } from './planRotation'
import { boardRings, physicalCutouts, ringPath } from './shapeGeometry'
import { Field } from './SettingControls'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { bounds, normalize, planBoardsOnly, scan } from './planner'
import type { Plan, Point, Settings } from './planner'
import { breakerSpace, dragBreakerWithinOutline, validBreakerPlacement } from './breakerPlacement'
import { alignFullStockBay, arrangeBreakerCount, breakerLoss, mirrorFixedBreakers, optimiseBreakerPositions } from './breakerOptimization'
import { tidy } from './editorGeometry'
import { breakerBoardCentres, breakerBoardCount, breakerStripWidth } from './breakerWidth'

export default function BreakerDesigner({settings:s,plan,onApply,onDirtyChange}: {settings:Settings;plan:Plan|null;onApply:(s:Settings)=>void;onDirtyChange?:(dirty:boolean)=>void}) {
  const physical=normalize(s.polygon),local=s.direction==='vertical'?physical.map(p=>({x:p.y,y:p.x})):physical,box=bounds(physical),run=bounds(local).width,across=bounds(local).depth
  const [changed,setChanged]=useState(false)
  const [positions,setPositions]=useState<number[]>(()=>s.breakerMode==='manual'?[...(s.breakerPositions||[])]:[...(plan?.boards.breakers||[])])
  const [mirror,setMirror]=useState(false),[snapCorners,setSnapCorners]=useState(false),[count,setCount]=useState(s.breakerMode==='manual'?(s.breakerPositions??[]).length:plan?.boards.breakers.length??0),[selected,setSelected]=useState(0),[message,setMessage]=useState('')
  const [viewRotation,setViewRotation]=useState(0)
  const worldLayer=useRef<SVGGElement>(null),svg=useRef<SVGSVGElement>(null),drag=useRef<{index:number;positions:number[];offset:number}|null>(null),id=useId().replaceAll(':','')
  const space=useMemo(()=>{try{return breakerSpace(s)}catch{return null}},[s])
  const draft=useMemo(()=>({...s,joints:'breaker' as const,breakerMode:'manual' as const,breakerPositions:positions,breakerCount:positions.length,edgeDetailConfirmed:false}),[s,positions])
  const preview=useMemo(()=>{try{
    const boards=planBoardsOnly(draft),used=boards.pieces.reduce((sum,p)=>sum+p.length,0),purchased=boards.bars.length*s.board.stock
    return {boards,loss:breakerLoss({boards,used,purchased,offcut:purchased-used}),error:''}
  }catch(error){return {boards:null,loss:null,error:error instanceof Error?error.message:'Check the breaker positions.'}}},[draft,s.board.stock])
  const dirty=changed&&(count!==positions.length||s.joints!=='breaker'||s.breakerMode!=='manual'||JSON.stringify(positions)!==JSON.stringify(s.breakerPositions||[]))
  useEffect(()=>{queueMicrotask(()=>onDirtyChange?.(dirty))},[dirty,onDirtyChange])
  const [lastValidLoss,setLastValidLoss]=useState(preview.loss)
  if(preview.loss&&preview.loss!==lastValidLoss)setLastValidLoss(preview.loss)
  const shownBoards=preview.boards??plan?.boards
  const lines=positions,loss=preview.loss??lastValidLoss
  const activeIndex=Math.min(selected,positions.length-1),activePosition=positions[activeIndex]
  const unresolved=!!preview.error||count!==positions.length
  const convert=(p:Point)=>s.direction==='vertical'?{x:p.y,y:p.x}:p
  const corners=[...new Set(local.map(p=>p.x))]
  const update=(base:number[],i:number,x:number)=>{if(!space)return;const next=dragBreakerWithinOutline({...s,breakerCount:base.length},base,i,x,mirror);if(next.length!==base.length)return;setChanged(true);setPositions(current=>JSON.stringify(current)===JSON.stringify(next)?current:next);setMessage('')}
  const accept=(next:number[],failure:string)=>{if(next.length===count&&validBreakerPlacement(s,next)){setChanged(true);setPositions(next);setMessage('');return true}setMessage(failure);return false}
  const changeCount=(requested:number)=>{
    if(!space)return
    const target=Math.max(0,Math.min(100,Math.floor(requested)))
    setCount(target);setChanged(true);setMirror(false);setSelected(0)
    const next=arrangeBreakerCount(s,target,positions)
    if(next){setPositions(next);setMessage('')}
    else setMessage(`The selected stock and outline cannot fit ${target} breakers. Choose another count or a different stock length.`)
  }
  const spaceEqually=()=>{const next=arrangeBreakerCount(s,count);if(next)accept(next,'That breaker count cannot fit this outline.');else setMessage('That breaker count cannot fit the stock length and edge clearances.');setMirror(false)}
  const minimise=()=>{
    const best=optimiseBreakerPositions(s,count,positions)
    if(best){accept(best.positions,'No valid placement was found.');setMirror(false)}
    else setMessage('No valid placement was found for this breaker count and stock length. The current layout is retained.')
  }
  const fullStock=(index:number,side:'before'|'after')=>{
    const next=alignFullStockBay(s,positions,index,side)
    if(next){accept(next,'A full stock-length bay cannot fit here.');setMirror(false);setSelected(index)}
    else setMessage('A full stock-length bay cannot fit on that side without exceeding another bay, crossing a breaker or leaving the outline.')
  }
  const pointerValue=(e:ReactPointerEvent,offset=0,snap=true)=>{const matrix=worldLayer.current?.getScreenCTM();if(!matrix)return 0;const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());let x=(s.direction==='vertical'?q.y:q.x)-offset
    x=tidy(Math.round(x/.001)*.001)
    if(snap&&snapCorners){const target=[run/2,...corners].find(c=>Math.abs(c-x)<Math.max(run*.012,.03));if(target!==undefined)x=target}
    return x
  }
  const remove=(index:number)=>{
    const next=positions.filter((_,i)=>i!==index)
    if(validBreakerPlacement(s,next)){setPositions(next);setCount(next.length);setSelected(0);setMirror(false);setChanged(true);setMessage('')}
    else setMessage('Removing this breaker would leave boards longer than stock or invalid cuts. The current layout is retained.')
  }
  const toggleMirror=(value:boolean)=>{
    if(!value){setMirror(false);return}
    const next=mirrorFixedBreakers(s,positions)
    if(next&&accept(next,'These mirrored positions cannot fit the selected stock.'))setMirror(true)
    else setMessage('This breaker count cannot be mirrored within the usable deck area. The current layout is retained.')
  }
  const span=(position:number)=>scan(space?.inner??local,position,true).map(([a,b])=>`${(b-a).toFixed(2)} m`).join(' + ')
  return <div className="breaker-designer">
    <div className="designer-heading"><div><h3>Breaker layout</h3><p>Slide boards into place, then fine-tune the selected breaker below.</p></div><span className={`draft-chip ${dirty?'unsaved':''}`}>{dirty?'Unapplied changes':'Current layout'}</span></div>
    <div className="breaker-waste-summary" role="status" aria-live="polite" aria-atomic="true">
      <div><small>Stock length loss</small><strong>{loss?`${loss.lossPercent.toFixed(1)}%`:'—'}</strong></div>
      <div className="breaker-loss-detail"><span>{loss?`${loss.stockBoards} stock boards · ${loss.lossLength.toFixed(2)} m offcut + kerf`:'Move or add a breaker to calculate stock loss.'}</span><small>{unresolved?(loss?'Last valid layout · adjust the draft':'Draft needs adjustment'):'Current draft · includes saw kerf'}</small></div>
    </div>
    <div className="breaker-layout-toolbar">
      <div className="breaker-count-control"><Field label="Number of breakers"><input aria-label="Breaker count" type="number" min="0" max={space?.capacity??0} value={count} onChange={e=>changeCount(e.target.value===''?0:+e.target.value)}/></Field><div className="breaker-count-buttons"><button type="button" aria-label="Remove one breaker" disabled={count===0} onClick={()=>changeCount(count-1)}>−</button><button type="button" aria-label="Add one breaker" disabled={count>=(space?.capacity??0)} onClick={()=>changeCount(count+1)}>＋</button></div></div>
      <div className="breaker-arrange-actions"><button type="button" className="button secondary" onClick={spaceEqually}>Space equally</button><button type="button" className="button secondary" onClick={minimise}>Minimise waste</button></div>
    </div>
    <div className="breaker-canvas-toolbar"><div className="breaker-edit-toggles"><label><input type="checkbox" checked={mirror} onChange={e=>toggleMirror(e.target.checked)}/>Mirror edits</label><label><input type="checkbox" checked={snapCorners} onChange={e=>setSnapCorners(e.target.checked)}/>Snap to corners</label></div><PlanRotation value={viewRotation} onChange={setViewRotation}/></div>
    <svg ref={svg} viewBox={rotatedViewBox(-.6,-.6,box.width+1.2,box.depth+1.2,viewRotation)} className="breaker-svg editable" role="application" aria-label="Interactive breaker board layout" onPointerMove={e=>{const d=drag.current;if(d)update(d.positions,d.index,pointerValue(e,d.offset))}} onPointerUp={e=>{drag.current=null;if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId)}} onPointerCancel={e=>{const d=drag.current;if(d)setPositions(d.positions);drag.current=null;if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId)}}>
      <g ref={worldLayer} transform={`rotate(${viewRotation} ${box.width/2} ${box.depth/2})`}>
      <defs><clipPath id={`${id}-outline`}><path d={ringPath([physical,...physicalCutouts(s).map(h=>h.polygon)])} clipRule="evenodd"/></clipPath><clipPath id={`${id}-infill`}><path d={ringPath([...(space?[space.inner.map(convert)]:[physical]),...physicalCutouts(s).map(h=>h.polygon)])} clipRule="evenodd"/></clipPath><pattern id={`${id}-grid`} width=".2" height=".2" patternUnits="userSpaceOnUse"><path d="M.2 0H0V.2" stroke="#c4cebc" strokeWidth=".6" fill="none" vectorEffect="non-scaling-stroke"/></pattern></defs>
      <rect x="-.6" y="-.6" width={box.width+1.2} height={box.depth+1.2} fill={`url(#${id}-grid)`}/><path d={ringPath([physical,...physicalCutouts(s).map(h=>h.polygon)])} fillRule="evenodd" fill="#e7e8d9" stroke="#7b896f" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      <g clipPath={`url(#${id}-outline)`}>{shownBoards?.pieces.map((p,i)=>{const {breaker}=p;if(breaker)return null;return <path key={i} d={ringPath(boardRings(p).map(r=>r.map(convert)))} fillRule="evenodd" fill={s.board.colour} fillOpacity={.65} stroke="#514d3d" strokeOpacity=".3" strokeWidth=".6" vectorEffect="non-scaling-stroke"/>})}</g>
      {lines.map((x,i)=>{const a=convert({x,y:0}),b=convert({x,y:across}),label=convert({x,y:-.22});return <g key={i} role="button" tabIndex={0} aria-label={`Breaker ${i+1} at ${tidy(x)} metres`} className="breaker-handle" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});setSelected(i);drag.current={index:i,positions:[...positions],offset:pointerValue(e,0,false)-x};svg.current?.setPointerCapture(e.pointerId)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i)}if(e.key==='Delete'){e.preventDefault();remove(i)}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const sign=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;update(positions,i,x+sign*(e.shiftKey ? 0.1 : 0.01));setSelected(i)}}}>
        <g clipPath={`url(#${id}-infill)`}>{preview.boards?preview.boards.pieces.filter(p=>p.breaker&&Math.abs(p.x+p.width/2-x)<=breakerStripWidth(s)/2+.001).map((piece,j)=><path key={j} d={ringPath(boardRings(piece).map(r=>r.map(convert)))} fillRule="evenodd" fill={activeIndex===i?'#45623d':'#798c5f'} stroke="#304f39" strokeWidth="1" vectorEffect="non-scaling-stroke"/>):breakerBoardCentres(s,x).map((centre,j)=>{const half=s.board.width/2000,points=[{x:centre-half,y:0},{x:centre+half,y:0},{x:centre+half,y:across},{x:centre-half,y:across}].map(convert);return <polygon key={j} points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill={unresolved?'#b28a51':activeIndex===i?'#45623d':'#798c5f'} stroke={activeIndex===i?'#304f39':'#647550'} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>})}</g>
        <line clipPath={`url(#${id}-outline)`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="26" vectorEffect="non-scaling-stroke"/>
        <line clipPath={`url(#${id}-outline)`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={activeIndex===i?'#314f39':'#81916b'} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>
        <circle cx={label.x} cy={label.y} r=".1" fill="#304f39"/><text x={label.x} y={label.y+.035} textAnchor="middle" fontSize=".105" fill="#fff">{i+1}</text>
      </g>})}
      <text x={box.width/2} y={box.depth+.32} textAnchor="middle" fontSize=".105" fill="#647658">{box.width.toFixed(2)} × {box.depth.toFixed(2)} m · board run {s.direction==='vertical'?'↕':'↔'}</text>
    </g></svg>
    <div className={`breaker-feedback ${unresolved?'needs-adjustment':''}`} role="status"><strong>{unresolved?'Adjust this draft':message?'Layout note':'Drag to position'}</strong><span>{message||(preview.error?preview.error+' Infill shows the applied layout while you adjust.':'')||(count!==positions.length?'Choose a count that fits this outline and stock length.':`Drag any board or numbered handle. Arrow keys move 10 mm; hold Shift for 100 mm.${breakerBoardCount(s)===2?' Each guide moves a pair of boards.':''}`)}</span></div>
    <section className="breaker-selection-panel" aria-label="Selected breaker controls">
      <div className="breaker-selection-heading"><strong>{positions.length?'Fine-tune a breaker':'No breaker boards'}</strong><span>{positions.length?`${positions.length} ${positions.length===1?'guide':'guides'}`:'Add one above to start a new bay.'}</span></div>
      {positions.length?<>
        <div className="breaker-picker" role="group" aria-label="Select a breaker">{positions.map((x,i)=><button key={i} type="button" aria-label={`Select breaker ${i+1}`} aria-pressed={activeIndex===i} className={activeIndex===i?'selected':''} onClick={()=>setSelected(i)}><b>{i+1}</b><span>{x.toFixed(3)} m</span></button>)}</div>
        <div className="breaker-position-editor"><div className="breaker-selected-label"><strong>Breaker {activeIndex+1}</strong><small>{span(activePosition)||'Outside deck'} of breaker</small></div><Field label="Centre position" unit="m"><input aria-label={`Breaker ${activeIndex+1} centre position`} type="number" min={space?.min} max={space?.max} step=".001" value={activePosition} onChange={e=>{if(e.target.value!=='')update(positions,activeIndex,+e.target.value)}}/></Field><button type="button" className="text-button" aria-label={`Remove breaker ${activeIndex+1}`} onClick={()=>remove(activeIndex)}>Remove</button></div>
        <input className="breaker-position-slider" aria-label={`Slide breaker ${activeIndex+1}`} type="range" min={space?.min??0} max={space?.max??run} step=".001" value={activePosition} onChange={e=>update(positions,activeIndex,+e.target.value)}/>
        <div className="breaker-slider-labels"><span>Start of board run</span><span>End of board run</span></div>
        <div className="breaker-alignment-tools"><Field label="Align selected breaker"><select aria-label={`Snap breaker ${activeIndex+1} to corner`} value="" onChange={e=>{if(e.target.value!=='')update(positions,activeIndex,+e.target.value)}}><option value="">Choose alignment…</option><option value={run/2}>Deck centre · {(run/2).toFixed(2)} m</option>{corners.filter(x=>x>.1&&x<run-.1).map(x=><option key={x} value={x}>Corner line · {x.toFixed(2)} m</option>)}</select></Field><div className="full-stock-actions" role="group" aria-label="Align a full stock board"><button type="button" className="button secondary" onClick={()=>fullStock(activeIndex,'before')}>Full board before</button><button type="button" className="button secondary" onClick={()=>fullStock(activeIndex,'after')}>Full board after</button></div></div>
      </>:null}
    </section>
    <div className="editor-footer"><button className="button secondary" onClick={()=>{setPositions(s.breakerMode==='manual'?[...(s.breakerPositions||[])]:[...(plan?.boards.breakers||[])]);setCount(s.breakerMode==='manual'?(s.breakerPositions??[]).length:plan?.boards.breakers.length??0);setChanged(false);setMirror(false);setSelected(0);setMessage('')}}>Discard draft</button><span>{unresolved?'Adjust the draft before applying.':positions.length+' breaker guides · ready to apply'}</span><button className="button primary" disabled={!preview.boards||count!==positions.length} onClick={()=>{onApply(draft);setChanged(false);setMessage('')}}>Apply breaker layout <OpenIcon/></button></div>
    {s.joints==='butt'?<p className="designer-hint">Applying this design uses breaker boards with no infill butt joints. Breaker boards may have supported butt joints only where stock is too short.</p>:null}
  </div>
}
