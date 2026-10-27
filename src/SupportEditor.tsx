import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { frameRule } from './planner'
import type { Member, Plan, Point, Settings } from './planner'
import { editableSupports, memberPlacementDiagnostic, nearestSupport, physicalSupportPoint } from './supportEditing'
import type { EditedSupports } from './supportEditing'
import type { SupportSuggestion } from './supportSuggestions'
import { frameMemberName } from './productNames'
import { supportLayoutIsCurrent } from './supportLayoutState'
import './SupportEditor.css'

type Selection={kind:'member'|'pedestal';index:number}|null
type Tool='select'|'pan'|'pedestal'|'joist'|'bearer'|'noggin'|'remove'
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const line=(m:{a:Point;b:Point})=>`M${m.a.x},${m.a.y}L${m.b.x},${m.b.y}`
const circle=(q:Point,r:number)=>`M${q.x-r},${q.y}a${r},${r} 0 1 0 ${2*r},0a${r},${r} 0 1 0 ${-2*r},0`
const editedSettings=(s:Settings,supportLayout:EditedSupports|undefined):Settings=>({...s,frameSelection:'manual',confirmed:false,edgeDetailConfirmed:false,supportLayout})
function Numeric({label,value,onChange}:{label:string;value:number;onChange:(n:number)=>void}){
  return <label className="support-coordinate"><span>{label} <small>mm</small></span><input type="number" step="1" value={Math.round(value*1000)} onChange={e=>{if(e.target.value!==''&&Number.isFinite(+e.target.value))onChange(+e.target.value/1000)}}/></label>
}
export default function SupportEditor({plan,settings:original,onApply,onClose}:{plan:Plan;settings:Settings;onApply:(s:Settings)=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),svg=useRef<SVGSVGElement>(null)
  const [history,setHistory]=useState(()=>({past:[] as EditedSupports[],present:editableSupports(plan,original),future:[] as EditedSupports[]})),[moving,setMoving]=useState<EditedSupports|null>(null)
  const [settings,setSettings]=useState(original),[tool,setTool]=useState<Tool>('select'),[selection,setSelection]=useState<Selection>(null),[start,setStart]=useState<Point|null>(null),[cursor,setCursor]=useState<Point|null>(null),[snap,setSnap]=useState(25),[discard,setDiscard]=useState(false),[message,setMessage]=useState('')
  const [visible,setVisible]=useState({joist:true,bearer:true,pedestal:true}),[audit,setAudit]=useState<{key:string;frame?:Plan['frame'];heightFits?:boolean;error?:string}|null>(null)
  const [suggestions,setSuggestions]=useState<SupportSuggestion[]|null>(null),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[suggestionError,setSuggestionError]=useState(''),suggestionWorker=useRef<Worker|null>(null)
  const [automatic,setAutomatic]=useState(false),automaticSeed=useRef(false)
  const draft=moving??history.present,rule=frameRule(settings.frame,settings.load),radius=(settings.pedestalDiameter??150)/2000
  const fullView=useMemo(()=>{const xs=plan.physical.map(q=>q.x),ys=plan.physical.map(q=>q.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys),pad=Math.max(.25,Math.max(w,h)*.08);return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:w+pad*2,h:h+pad*2}},[plan.physical])
  const [view,setView]=useState(fullView)
  const pointers=useRef(new Map<number,Point>()),touchTap=useRef<Point|null>(null)
  const pinch=useRef<{distance:number;anchor:Point;view:typeof view;scale:number}|null>(null)
  const gesture=useRef<{kind:'pan'|'pedestal';point:Point;view:typeof view;index?:number;draft:EditedSupports}|null>(null)
  const key=useMemo(()=>JSON.stringify(editedSettings(settings,automatic?undefined:(moving??history.present))),[settings,moving,history.present,automatic])
  const pending=audit?.key!==key,checked=audit?.key===key?audit:null
  const cancelSuggestions=()=>{suggestionWorker.current?.terminate();setProgress(null);setSuggestions(null)}
  const commit=(next:EditedSupports,keepSelection=false)=>{cancelSuggestions();setHistory(h=>({past:[...h.past.slice(-39),h.present],present:next,future:[]}));setAutomatic(false);if(!keepSelection)setSelection(null);setMessage('')}
  const undo=()=>{cancelSuggestions();setHistory(h=>h.past.length?{past:h.past.slice(0,-1),present:h.past.at(-1)!,future:[h.present,...h.future]}:h);setSelection(null);setAutomatic(false)}
  const redo=()=>{cancelSuggestions();setHistory(h=>h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h);setSelection(null);setAutomatic(false)}
  const dirty=history.past.length>0||settings!==original||automatic
  const close=()=>dirty?setDiscard(true):onClose()
  useEffect(()=>{const element=dialog.current,canvas=svg.current,blockWheel=(event:WheelEvent)=>event.preventDefault();element?.showModal();canvas?.addEventListener('wheel',blockWheel,{passive:false});return ()=>{element?.close();canvas?.removeEventListener('wheel',blockWheel);suggestionWorker.current?.terminate()}},[])
  useEffect(()=>{
    const candidate=JSON.parse(key) as Settings,worker=new Worker(new URL('./supportTools.worker.ts',import.meta.url),{type:'module'}),timer=setTimeout(()=>worker.postMessage({key,kind:'audit',settings:JSON.parse(key)}),180)
    worker.onmessage=({data})=>{
      if(data.key!==key)return
      setAudit(data)
      if(automaticSeed.current&&data.frame){
        const frame=data.frame as Plan['frame'],source=frame.geometryPass?frame:frame.diagnostic,next:EditedSupports={version:1,outlineKey:data.outlineKey,boardLayout:data.boardLayout,members:source.members.map(m=>({...m,a:physicalSupportPoint(m.a,candidate),b:physicalSupportPoint(m.b,candidate)})),pedestals:source.pedestals.map(q=>physicalSupportPoint(q,candidate))}
        setHistory(h=>({past:[...h.past.slice(-39),h.present],present:next,future:[]}));automaticSeed.current=false
      }
    }
    worker.onerror=()=>setAudit({key,error:'The support check could not run. Your draft is still editable.'})
    return ()=>{clearTimeout(timer);worker.terminate()}
  },[key])
  const live=automatic?checked?.frame:null,display=live?{members:live.geometryPass?live.members:live.diagnostic.members,pedestals:live.geometryPass?live.pedestals:live.diagnostic.pedestals}:null
  const shown=display?{members:display.members.map(m=>({...m,a:physicalSupportPoint(m.a,settings),b:physicalSupportPoint(m.b,settings)})),pedestals:display.pedestals.map(q=>physicalSupportPoint(q,settings))}:draft
  const carriers=useMemo(()=>shown.members.filter(m=>m.kind===(rule.bearer?'bearer':'joist')&&m.role!=='bearer-link'&&m.support!=='transfer'),[shown.members,rule.bearer])
  const selectedMember=selection?.kind==='member'?draft.members[selection.index]:undefined,selectedBase=selection?.kind==='pedestal'?draft.pedestals[selection.index]:undefined
  const initialFailure=plan.frame.placementDiagnostics[0]
  const failure=initialFailure&&settings===original&&history.past.length===0?{...initialFailure,member:{...initialFailure.member,a:physicalSupportPoint(initialFailure.member.a,settings),b:physicalSupportPoint(initialFailure.member.b,settings)},trialBases:initialFailure.trialBases.map(q=>physicalSupportPoint(q,settings))}:undefined
  const [showFailure,setShowFailure]=useState(!!failure)
  const diagnostic=selectedMember&&carriers.includes(selectedMember)?memberPlacementDiagnostic(selectedMember,selection!.index,plan.physical,plan.cutouts.map(h=>h.polygon),settings,draft.pedestals):showFailure?failure:undefined
  const paths=useMemo(()=>({joist:shown.members.filter(m=>m.kind!=='bearer').map(line).join(''),bearer:shown.members.filter(m=>m.kind==='bearer').map(line).join(''),pedestals:shown.pedestals.map(q=>circle(q,radius)).join('')}),[shown.members,shown.pedestals,radius])
  const changeTool=(next:Tool)=>{setTool(next);setStart(null);setCursor(null);setMessage('');if(automatic){setAutomatic(false);automaticSeed.current=false}}
  const coordinates=(event:{clientX:number;clientY:number})=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const q=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return {x:q.x,y:q.y}}
  const snapPoint=(q:Point)=>{const nearest=nearestSupport(q,draft.members),tolerance=view.w/100;if(nearest&&nearest.distance<tolerance)return nearest.point;return snap?{x:Math.round(q.x*1000/snap)*snap/1000,y:Math.round(q.y*1000/snap)*snap/1000}:q}
  const remove=(picked:Selection)=>{if(!picked)return;commit({...draft,members:picked.kind==='member'?draft.members.filter((_,i)=>i!==picked.index):draft.members,pedestals:picked.kind==='pedestal'?draft.pedestals.filter((_,i)=>i!==picked.index):draft.pedestals})}
  const hit=(q:Point):Selection=>{
    const tolerance=22/(svg.current?.getScreenCTM()?.a||100),feet=shown.pedestals.map((p,index)=>({index,d:dist(p,q)})).sort((a,b)=>a.d-b.d)[0]
    if(visible.pedestal&&feet&&feet.d<Math.max(radius,tolerance))return {kind:'pedestal',index:feet.index}
    const indices=shown.members.flatMap((m,index)=>(m.kind==='bearer'?visible.bearer:visible.joist)?[index]:[]),nearest=nearestSupport(q,indices.map(i=>shown.members[i]))
    return nearest&&nearest.distance<tolerance?{kind:'member',index:indices[nearest.index]}:null
  }
  const beginEdit=(event:{clientX:number;clientY:number;button:number})=>{
    const q=coordinates(event)
    if(tool==='pan'||event.button===1){gesture.current={kind:'pan',point:{x:event.clientX,y:event.clientY},view,draft};return}
    if(automatic){setMessage('Choose “Edit this preview” to make changes to the regenerated layout.');return}
    if(tool==='pedestal'){
      const nearest=nearestSupport(q,carriers)
      if(!nearest||nearest.distance>Math.max(.3,view.w/40)){setMessage('Tap near a supporting joist or bearer.');return}
      commit({...draft,pedestals:[...draft.pedestals,nearest.point]});setSelection({kind:'pedestal',index:draft.pedestals.length});return
    }
    if(['joist','bearer','noggin'].includes(tool)){
      const point=snapPoint(q)
      if(!start){setStart(point);return}
      if(dist(start,point)<.01){setMessage('Choose an end at least 10 mm from the start.');return}
      const kind=tool as Member['kind'],member:Member={a:start,b:point,kind,size:kind==='bearer'?rule.bearer:rule.joist}
      commit({...draft,members:[...draft.members,member]});setSelection({kind:'member',index:draft.members.length});setStart(null);return
    }
    const picked=hit(q);setShowFailure(false)
    if(tool==='remove'){remove(picked);return}
    setSelection(picked)
    if(picked?.kind==='pedestal')gesture.current={kind:'pedestal',point:q,view,index:picked.index,draft}
  }
  const down=(event:ReactPointerEvent<SVGSVGElement>)=>{
    if(event.button!==0&&event.button!==1)return
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(pointers.current.size>=2){
      const [a,b]=[...pointers.current.values()],matrix=svg.current?.getScreenCTM()
      if(matrix)pinch.current={distance:Math.max(1,dist(a,b)),anchor:coordinates({clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2}),view,scale:matrix.a}
      touchTap.current=null;gesture.current=null;setMoving(null);return
    }
    // Defer touch additions/removals until release so a pinch cannot edit the draft.
    if(event.pointerType==='touch'&&tool!=='select'&&tool!=='pan'){touchTap.current={x:event.clientX,y:event.clientY};return}
    beginEdit(event)
  }
  const move=(event:ReactPointerEvent<SVGSVGElement>)=>{
    if(!pointers.current.has(event.pointerId)&&event.buttons)return
    if(pointers.current.has(event.pointerId))pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(pinch.current){
      if(pointers.current.size<2)return
      const [a,b]=[...pointers.current.values()],initial=pinch.current,matrix=svg.current?.getScreenCTM()
      if(!matrix)return
      const midpoint=coordinates({clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2}),factor=Math.max(.25/initial.view.w,Math.min(300/initial.view.w,initial.distance/Math.max(1,dist(a,b)))),w=initial.view.w*factor,h=initial.view.h*factor
      const offset={x:(midpoint.x-view.x)*matrix.a,y:(midpoint.y-view.y)*matrix.d}
      setView({x:initial.anchor.x-offset.x/initial.scale*factor,y:initial.anchor.y-offset.y/initial.scale*factor,w,h});return
    }
    if(touchTap.current&&dist(touchTap.current,{x:event.clientX,y:event.clientY})>12)touchTap.current=null
    const q=coordinates(event),active=gesture.current
    if(active?.kind==='pan'){const matrix=svg.current?.getScreenCTM();if(!matrix)return;const delta={x:(event.clientX-active.point.x)/matrix.a,y:(event.clientY-active.point.y)/matrix.d};setView({...active.view,x:active.view.x-delta.x,y:active.view.y-delta.y});return}
    if(active?.kind==='pedestal'){
      const nearest=nearestSupport(q,carriers);if(!nearest)return
      setMoving({...active.draft,pedestals:active.draft.pedestals.map((p,i)=>i===active.index?nearest.point:p)});return
    }
    if(start)setCursor(snapPoint(q))
  }
  const up=(event:ReactPointerEvent<SVGSVGElement>)=>{
    pointers.current.delete(event.pointerId)
    if(pinch.current){if(!pointers.current.size)pinch.current=null;return}
    if(touchTap.current){beginEdit({clientX:event.clientX,clientY:event.clientY,button:0});touchTap.current=null}
    if(moving&&gesture.current?.kind==='pedestal'&&dist(moving.pedestals[gesture.current.index!],gesture.current.draft.pedestals[gesture.current.index!])>.00001)commit(moving,true)
    setMoving(null);gesture.current=null
  }
  const cancelPointer=(event:ReactPointerEvent<SVGSVGElement>)=>{pointers.current.delete(event.pointerId);touchTap.current=null;setMoving(null);gesture.current=null;if(!pointers.current.size)pinch.current=null}
  const zoom=(factor:number,q={x:view.x+view.w/2,y:view.y+view.h/2})=>setView(v=>{const w=Math.max(.25,Math.min(300,v.w*factor)),h=v.h*w/v.w;return {x:q.x-(q.x-v.x)*w/v.w,y:q.y-(q.y-v.y)*h/v.h,w,h}})
  const focusMember=(m:Member)=>{const w=Math.max(1,Math.abs(m.b.x-m.a.x)+.8),h=Math.max(1,Math.abs(m.b.y-m.a.y)+.8);setView({x:(m.a.x+m.b.x-w)/2,y:(m.a.y+m.b.y-h)/2,w,h})}
  const findSuggestions=()=>{
    suggestionWorker.current?.terminate();setSuggestions(null);setProgress({done:0,total:0});setSuggestionError('')
    const worker=new Worker(new URL('./supportTools.worker.ts',import.meta.url),{type:'module'});suggestionWorker.current=worker
    worker.onmessage=({data})=>{if(data.progress)setProgress(data.progress);else{setProgress(null);setSuggestions(data.suggestions??[]);setSuggestionError(data.error??'');worker.terminate()}}
    worker.onerror=()=>{setProgress(null);setSuggestionError('Setting comparisons could not run. Your draft is unchanged.');worker.terminate()}
    const searchSettings=!supportLayoutIsCurrent(original)&&!history.past.length?{...settings,supportLayout:undefined}:JSON.parse(key)
    worker.postMessage({key:'suggestions',kind:'suggestions',settings:searchSettings})
  }
  const applySuggestion=(suggestion:SupportSuggestion)=>{cancelSuggestions();setSettings(s=>({...s,...suggestion.patch}));setSuggestions(null);setMessage('Setting changes are a preview until you apply this layout.');if(!supportLayoutIsCurrent(original)&&!history.past.length){setAutomatic(true);automaticSeed.current=true}}
  const previewAutomatic=()=>{cancelSuggestions();setAutomatic(true);automaticSeed.current=true;setSelection(null);setStart(null);setShowFailure(false)}
  const apply=()=>{onApply({...JSON.parse(key),supportLayout:automatic?undefined:history.present});onClose()}
  const drawingTools=<><h3>Drawing tools</h3><div className="support-tool-grid">{([['select','↖ Select / move'],['pan','✥ Pan'],['pedestal','＋ Pedestal'],['joist','＋ Joist'],['bearer','＋ Bearer'],['noggin','＋ Blocking'],['remove','− Remove']] as [Tool,string][]).map(([value,label])=><button key={value} aria-pressed={tool===value} disabled={value==='bearer'&&!rule.bearer||automatic&&value!=='pan'} title={value==='bearer'&&!rule.bearer?'Select a bearer + joist frame to add bearers':undefined} onClick={()=>changeTool(value)}>{label}</button>)}</div></>
  return <dialog ref={dialog} className="support-editor" aria-labelledby="support-editor-title" onCancel={e=>{e.preventDefault();close()}}>
    <header className="support-editor-header"><div><small>BETTERPLAN · SUPPORTS</small><h2 id="support-editor-title">Support layout editor</h2></div><span>{shown.members.length} members · {shown.pedestals.length} pedestals</span><button className="button quiet" onClick={close}>Close ✕</button></header>
    <div className="support-mobile-tools">{drawingTools}</div><div className="support-editor-body"><aside id="support-editor-tools" className="support-editor-inspector">
      <div className="support-desktop-tools">{drawingTools}</div>
      <p className="support-help">{automatic?'Automatic layout preview.':tool==='pedestal'?'Tap a supporting member to add a base.':tool==='joist'||tool==='bearer'||tool==='noggin'?'Tap a start, then an end. Existing members attract the ends.':tool==='remove'?'Tap a pedestal or member to remove it.':'Select a member or drag a base along the supporting frame.'}</p>
      <label className="support-snap">Grid snap<select aria-label="Support editor grid snap" value={snap} onChange={e=>setSnap(+e.target.value)}>{[0,10,25,50,100].map(n=><option key={n} value={n}>{n?`${n} mm`:'Off'}</option>)}</select></label>
      {selection?<section className="support-selection"><h3>{selection.kind==='pedestal'?`Pedestal P-${selection.index+1}`:`Member M-${selection.index+1}`}</h3>{selectedMember?<><p>{frameMemberName(selectedMember.size,selectedMember.kind,selectedMember.role)} · {Math.round(dist(selectedMember.a,selectedMember.b)*1000)} mm</p><div className="support-coordinate-grid">{(['a','b'] as const).flatMap(end=>(['x','y'] as const).map(axis=><Numeric key={end+axis} label={`${end==='a'?'Start':'End'} ${axis.toUpperCase()}`} value={selectedMember[end][axis]} onChange={n=>commit({...draft,members:draft.members.map((m,i)=>i===selection.index?{...m,[end]:{...m[end],[axis]:n}}:m)},true)}/>))}</div><button className="text-button" onClick={()=>focusMember(selectedMember)}>Zoom to member</button></>:null}{selectedBase?<div className="support-coordinate-grid">{(['x','y'] as const).map(axis=><Numeric key={axis} label={axis.toUpperCase()} value={selectedBase[axis]} onChange={n=>{const next={...draft,pedestals:draft.pedestals.map((q,i)=>i===selection.index?{...q,[axis]:n}:q)};commit(next);setSelection(selection)}}/>)}</div>:null}<button className="button secondary full" onClick={()=>remove(selection)}>Remove selected {selection.kind}</button></section>:null}
      {failure?<section className="support-failure"><h3>Failed search member P-{failure.memberIndex+1}</h3><p>{failure.detail}</p><p>{Math.round(dist(failure.member.a,failure.member.b)*1000)} mm · {settings.pedestalDiameter??150} mm base · {settings.pedestalClearance??0} mm extra clearance</p><button className="button secondary full" onClick={()=>{setSelection(null);setShowFailure(true);focusMember(failure.member)}}>Show valid / blocked positions</button><small>Trial positions explain this search attempt; they do not prove that every arrangement is impossible.</small></section>:null}
      {diagnostic?<p className="support-help">{diagnostic.detail}</p>:null}
      <section className={`support-live-check ${checked?.frame?.geometryPass&&checked.heightFits?'passes':'review'}`} aria-live="polite"><strong>{pending?'Checking edited layout…':checked?.error?'Check unavailable':checked?.frame?.geometryPass&&checked.heightFits?'Geometry checks pass':'Draft needs review'}</strong>{checked?.error?<p>{checked.error}</p>:null}{checked?.heightFits===false?<p>The pedestal adjustment range does not fit the unchanged customer height.</p>:null}{checked?.frame?<details open={!checked.frame.geometryPass}><summary>{checked.frame.checks.filter(c=>c.ok).length} / {checked.frame.checks.length} checks</summary><ul>{checked.frame.checks.filter(c=>!c.ok).map(c=><li key={c.name}><b>{c.name}</b><span>{c.detail}</span></li>)}</ul></details>:null}<small>Unverified connection and overhang details remain provisional.</small></section>
      <details className="support-current-limits"><summary>Current limits</summary><p>{settings.pedestalDiameter??150} mm base · {settings.pedestalClearance??0} mm extra clearance<br/>{settings.joistSpacing} mm joist centres<br/>{Math.round(rule.support*1000)} mm report pedestal span<br/>{settings.frameStock} m aluminium stock<br/>35 mm end limit: {settings.joistOverhang35===undefined?'unverified':`${settings.joistOverhang35} mm`}<br/>80 mm end limit: {settings.joistOverhang80===undefined?'unverified':`${settings.joistOverhang80} mm`}</p></details>
      {settings!==original?<section className="support-preview-changes"><h3>Setting preview</h3>{(['pedestalClearance','frameStock','joistSpacing','pedestalName'] as const).filter(field=>settings[field]!==original[field]).map(field=><p key={field}>{({pedestalClearance:'Extra clearance (mm)',frameStock:'Stock length (m)',joistSpacing:'Joist centres (mm)',pedestalName:'Pedestal product'})[field]}: {original[field]??0} → {settings[field]}</p>)}<button className="text-button" onClick={()=>{cancelSuggestions();setSettings(original);if(automatic)automaticSeed.current=true}}>Revert setting preview</button></section>:null}
      <section className="support-setting-options"><h3>Setting options</h3><p>Test advanced settings at the same deck size, height and live load.</p><button className="button secondary full" disabled={!!progress} onClick={findSuggestions}>{progress?`Testing ${progress.done} / ${progress.total||'…'}`:'Find settings that fit'}</button>{progress?<button className="text-button" onClick={()=>{suggestionWorker.current?.terminate();setProgress(null)}}>Cancel search</button>:null}{suggestionError?<p>{suggestionError}</p>:null}{suggestions?.length===0?<p>No tested setting change produced a complete fit. The draft remains available for manual correction.</p>:null}{suggestions?.map(option=><article key={option.id}><strong>{option.title}</strong><ul>{option.changes.map(c=><li key={c}>{c}</li>)}</ul><small>{option.note}</small><p>{option.pedestals} pedestals · {option.members} members · geometry and height pass</p><button className="button secondary full" onClick={()=>applySuggestion(option)}>Preview these settings</button></article>)}</section>
    </aside><section className="support-editor-drawing">
      <div className="support-editor-toolbar"><div className="support-history"><button aria-label="Undo support edit" disabled={!history.past.length} onClick={undo}>↶ Undo</button><button aria-label="Redo support edit" disabled={!history.future.length} onClick={redo}>↷ Redo</button></div><div className="support-layer-toggles">{(['joist','bearer','pedestal'] as const).map(kind=><label key={kind}><input type="checkbox" checked={visible[kind]} onChange={e=>setVisible(v=>({...v,[kind]:e.target.checked}))}/>{kind==='joist'?'Joists & blocking':kind==='bearer'?'Bearers':'Pedestals'}</label>)}</div><div><button aria-label="Zoom in support plan" onClick={()=>zoom(.8)}>＋</button><button aria-label="Zoom out support plan" onClick={()=>zoom(1.25)}>−</button><button onClick={()=>setView(fullView)}>Fit deck</button></div></div>
      <div className="support-touch-hint"><span>{tool==='pan'?'Drag to pan':tool==='select'?'Tap to select · drag a pedestal to move':tool==='remove'?'Tap an item to remove':tool==='pedestal'?'Tap a supporting member to add a pedestal':start?'Tap the end of the new member':'Tap the start of the new member'}</span>{start?<button onClick={()=>{setStart(null);setCursor(null)}}>Cancel line</button>:null}</div><svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={`support-edit-canvas tool-${tool}`} tabIndex={0} role="application" aria-label="Interactive support layout. Select members, drag pedestals, or draw a member with two taps. Pinch to zoom and use two fingers to pan." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer} onWheel={e=>{zoom(e.deltaY>0?1.15:.87,coordinates(e))}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo()}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(selection)}else if(e.key==='Escape'&&(start||selection)){e.preventDefault();e.stopPropagation();setStart(null);setSelection(null)}}}>
        <defs><pattern id="support-edit-grid" width=".1" height=".1" patternUnits="userSpaceOnUse"><path d="M.1 0H0V.1" fill="none" stroke="#dfe6d5" strokeWidth=".002"/></pattern></defs><rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#support-edit-grid)"/>
        <path d={`M${plan.physical.map(q=>`${q.x},${q.y}`).join('L')}Z ${plan.cutouts.map(h=>`M${h.polygon.map(q=>`${q.x},${q.y}`).join('L')}Z`).join(' ')}`} fill="#fff" fillOpacity=".72" fillRule="evenodd" stroke="#7f8b70" strokeWidth=".009"/>
        {visible.bearer?<path d={paths.bearer} fill="none" stroke="#be934b" strokeWidth={(settings.frameFaceWidth??35)/1000+.01}/>:null}{visible.joist?<path d={paths.joist} fill="none" stroke="#426c52" strokeWidth={(settings.frameFaceWidth??35)/1000}/>:null}{visible.pedestal?<path d={paths.pedestals} fill="#dce3ce" fillOpacity=".65" stroke="#667d56" strokeWidth=".007"/>:null}
        {selectedMember&&diagnostic?<path d={line(selectedMember)} stroke="#254f83" strokeWidth=".095" strokeOpacity=".25" fill="none"/>:null}
        {diagnostic?<g className="support-position-ranges"><path d={line(diagnostic.member)} stroke="#b6674a" strokeWidth=".065"/>{diagnostic.edgeClear.map(([a,b],i)=>{const m=diagnostic.member,l=dist(m.a,m.b),point=(t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t/l,y:m.a.y+(m.b.y-m.a.y)*t/l});return <path key={`clear${i}`} d={line({a:point(a),b:point(b)})} stroke="#d49b3e" strokeWidth=".06"/>})}{diagnostic.available.map(([a,b],i)=>{const m=diagnostic.member,l=dist(m.a,m.b),point=(t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t/l,y:m.a.y+(m.b.y-m.a.y)*t/l});return <path key={`free${i}`} d={line({a:point(a),b:point(b)})} stroke="#52a267" strokeWidth=".06"/>})}{showFailure?diagnostic.trialBases.map((q,i)=><circle key={i} cx={q.x} cy={q.y} r={radius} fill="none" stroke="#d49b3e" strokeWidth=".008" strokeDasharray=".025 .012"/>):null}</g>:null}
        {selectedMember&&!diagnostic?<path d={line(selectedMember)} stroke="#254f83" strokeWidth=".045" fill="none"/>:null}{selectedBase?<circle cx={selectedBase.x} cy={selectedBase.y} r={radius} fill="#bdd7ef" stroke="#254f83" strokeWidth=".012"/>:null}
        {checked?.frame?.conflicts.map((point,i)=>{const q=physicalSupportPoint(point,settings);return <g key={i} stroke="#b86e44" strokeWidth=".012"><circle cx={q.x} cy={q.y} r=".07" fill="#fff3e1"/><path d={`M${q.x-.03},${q.y-.03}l.06 .06m-.06 0l.06 -.06`}/></g>})}
        {start?<g stroke="#345c89" strokeWidth=".025"><circle cx={start.x} cy={start.y} r=".035"/>{cursor?<path d={line({a:start,b:cursor})} strokeDasharray=".06 .03"/>:null}</g>:null}
      </svg><div className="support-editor-legend">{diagnostic?<><span className="range-clear">● Clear of edges / bases</span><span className="range-occupied">● Existing / trial base collisions</span><span className="range-blocked">● Boundary / edge clearance</span></>:<span>Pinch to zoom · Two fingers to pan · Mouse wheel to zoom · Ctrl/Cmd Z undoes</span>}<span>Coordinates and member lengths in mm</span></div>
    </section></div>
    <footer className="support-editor-footer">{discard?<><strong>Discard unsaved support edits?</strong><button className="button secondary" onClick={()=>setDiscard(false)}>Keep editing</button><button className="button" onClick={onClose}>Discard changes</button></>:<><div><span role="status">{message||`${settings.height} mm finished height · ${settings.load} kN/m² · ${settings.frameStock} m stock`}</span><small>Edits and setting previews are saved only when applied.</small></div><span className={`support-check-badge ${checked?.frame?.geometryPass&&checked.heightFits?'passes':'review'}`}>{pending?'Checking…':checked?.frame?.geometryPass&&checked.heightFits?'Geometry checks pass':'Draft needs review'}</span><button className="button secondary" onClick={previewAutomatic}>Preview automatic layout</button>{automatic?<button className="button secondary" disabled={pending||!checked?.frame} onClick={()=>{setAutomatic(false);automaticSeed.current=false}}>Edit this preview</button>:null}<button className="button" disabled={pending||!!checked?.error||!checked?.frame} onClick={apply}>{checked?.frame?.geometryPass&&checked.heightFits?'Apply layout':'Save draft'}</button></>}</footer>
  </dialog>
}
