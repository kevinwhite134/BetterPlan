import { arrangeSupportGroup, supportItemKey, supportItemsInBox, translateSupportGroup } from './supportGroups'
import type { SupportItem } from './supportGroups'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { frameRule } from './planner'
import type { Member, Plan, Point, Settings } from './planner'
import { editableSupports, memberPlacementDiagnostic, nearestSupport, physicalSupportPoint } from './supportEditing'
import type { EditedSupports } from './supportEditing'
import type { SupportSuggestion } from './supportSuggestions'
import { frameMemberName } from './productNames'
import { supportLayoutIsCurrent } from './supportLayoutState'
import { visibleEditorView, rulerStep } from './supportViewport'
import SupportRulers from './SupportRulers'
import './SupportEditor.css'

type Selection={kind:'member'|'pedestal';index:number}|null
type Tool='select'|'box'|'pan'|'measure'|'pedestal'|'joist'|'bearer'|'noggin'|'remove'
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const line=(m:{a:Point;b:Point})=>`M${m.a.x},${m.a.y}L${m.b.x},${m.b.y}`
const circle=(q:Point,r:number)=>`M${q.x-r},${q.y}a${r},${r} 0 1 0 ${2*r},0a${r},${r} 0 1 0 ${-2*r},0`
const editedSettings=(s:Settings,supportLayout:EditedSupports|undefined):Settings=>({...s,frameSelection:'manual',confirmed:false,edgeDetailConfirmed:false,supportLayout})
function Numeric({label,value,onChange}:{label:string;value:number;onChange:(n:number)=>void}){
  const [draft,setDraft]=useState<string|null>(null),shown=draft??String(Math.round(value*1000))
  return <label className="support-coordinate"><span>{label} <small>mm</small></span><input type="number" step="1" value={shown} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==null&&draft.trim()!==''&&Number.isFinite(+draft)&&Math.abs(+draft/1000-value)>.0000001)onChange(+draft/1000);setDraft(null)}} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur()}else if(e.key==='Escape'){setDraft(null);e.stopPropagation()}}}/></label>
}
export default function SupportEditor({plan,settings:original,onApply,onClose}:{plan:Plan;settings:Settings;onApply:(s:Settings)=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),svg=useRef<SVGSVGElement>(null)
  const [history,setHistory]=useState(()=>({past:[] as EditedSupports[],present:editableSupports(plan,original),future:[] as EditedSupports[]})),[moving,setMoving]=useState<EditedSupports|null>(null)
  const [settings,setSettings]=useState(original),[tool,setTool]=useState<Tool>('select'),[selection,setSelectionRaw]=useState<Selection>(null),[start,setStart]=useState<Point|null>(null),[cursor,setCursor]=useState<Point|null>(null),[snap,setSnap]=useState(25),[discard,setDiscard]=useState(false),[message,setMessage]=useState('')
  const [selectedItems,setSelectedItems]=useState<SupportItem[]>([]),[selectionBox,setSelectionBox]=useState<{a:Point;b:Point}|null>(null),[groupSpacing,setGroupSpacing]=useState(400)
  const setSelection=(item:Selection)=>{setSelectionRaw(item);setSelectedItems(item?[item]:[])}
  const groupSelection=(items:SupportItem[])=>{setSelectedItems(items);setSelectionRaw(items.at(-1)??null)}
  const [visible,setVisible]=useState({joist:true,bearer:true,pedestal:true}),[audit,setAudit]=useState<{key:string;frame?:Plan['frame'];heightFits?:boolean;error?:string}|null>(null)
  const [suggestions,setSuggestions]=useState<SupportSuggestion[]|null>(null),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[suggestionError,setSuggestionError]=useState(''),suggestionWorker=useRef<Worker|null>(null)
  const [automatic,setAutomatic]=useState(false),automaticSeed=useRef(false)
  const draft=moving??history.present,rule=frameRule(settings.frame,settings.load),radius=(settings.pedestalDiameter??150)/2000
  const fullView=useMemo(()=>{const xs=plan.physical.map(q=>q.x),ys=plan.physical.map(q=>q.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys),pad=Math.max(.25,Math.max(w,h)*.08);return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:w+pad*2,h:h+pad*2}},[plan.physical])
  const [view,setView]=useState(fullView)
  const [canvasSize,setCanvasSize]=useState({width:900,height:600}),[measure,setMeasure]=useState<{a:Point;b:Point}|null>(null)
  const viewport=visibleEditorView(view,canvasSize.width,canvasSize.height),scale=viewport.scale,step=rulerStep(scale),ruler=25/scale,leftRuler=43/scale
  const [pointer,setPointer]=useState<Point|null>(null),[showGrid,setShowGrid]=useState(true)
  const pointers=useRef(new Map<number,Point>()),touchTap=useRef<Point|null>(null)
  const pinch=useRef<{distance:number;anchor:Point;view:typeof view;scale:number}|null>(null)
  const gesture=useRef<{kind:'pan'|'pedestal'|'member'|'endpoint'|'group'|'box';items?:SupportItem[];append?:boolean;point:Point;view:typeof view;index?:number;end?:'a'|'b';draft:EditedSupports}|null>(null)
  const key=useMemo(()=>JSON.stringify(editedSettings(settings,automatic?undefined:(moving??history.present))),[settings,moving,history.present,automatic])
  const pending=audit?.key!==key,checked=audit?.key===key?audit:null
  const cancelSuggestions=()=>{suggestionWorker.current?.terminate();setProgress(null);setSuggestions(null)}
  const commit=(next:EditedSupports,keepSelection=false)=>{cancelSuggestions();setHistory(h=>({past:[...h.past.slice(-39),h.present],present:next,future:[]}));setAutomatic(false);if(!keepSelection)setSelection(null);setMessage('')}
  const undo=()=>{cancelSuggestions();setHistory(h=>h.past.length?{past:h.past.slice(0,-1),present:h.past.at(-1)!,future:[h.present,...h.future]}:h);setSelection(null);setAutomatic(false)}
  const redo=()=>{cancelSuggestions();setHistory(h=>h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h);setSelection(null);setAutomatic(false)}
  const dirty=history.past.length>0||settings!==original||automatic
  const close=()=>dirty?setDiscard(true):onClose()
  useEffect(()=>{const element=dialog.current,canvas=svg.current,blockWheel=(event:WheelEvent)=>event.preventDefault();element?.showModal();canvas?.addEventListener('wheel',blockWheel,{passive:false});return ()=>{element?.close();canvas?.removeEventListener('wheel',blockWheel);suggestionWorker.current?.terminate()}},[])
  useEffect(()=>{const element=svg.current;if(!element)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width>0&&height>0)setCanvasSize({width,height})});observer.observe(element);return ()=>observer.disconnect()},[])
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
  const changeTool=(next:Tool)=>{setTool(next);setStart(null);setCursor(null);setMessage('');if(automatic&&next!=='pan'&&next!=='measure'){setAutomatic(false);automaticSeed.current=false}}
  const coordinates=(event:{clientX:number;clientY:number})=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const q=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return {x:q.x,y:q.y}}
  const snapPoint=(q:Point)=>{const nearest=nearestSupport(q,draft.members),tolerance=view.w/100;if(nearest&&nearest.distance<tolerance)return nearest.point;return snap?{x:Math.round(q.x*1000/snap)*snap/1000,y:Math.round(q.y*1000/snap)*snap/1000}:q}
  const remove=(picked:Selection)=>{if(!picked)return;commit({...draft,members:picked.kind==='member'?draft.members.filter((_,i)=>i!==picked.index):draft.members,pedestals:picked.kind==='pedestal'?draft.pedestals.filter((_,i)=>i!==picked.index):draft.pedestals})}
  const hit=(q:Point):Selection=>{
    const tolerance=22/(svg.current?.getScreenCTM()?.a||100),feet=shown.pedestals.map((p,index)=>({index,d:dist(p,q)})).sort((a,b)=>a.d-b.d)[0]
    if(visible.pedestal&&feet&&feet.d<Math.max(radius,tolerance))return {kind:'pedestal',index:feet.index}
    const indices=shown.members.flatMap((m,index)=>(m.kind==='bearer'?visible.bearer:visible.joist)?[index]:[]),nearest=nearestSupport(q,indices.map(i=>shown.members[i]))
    return nearest&&nearest.distance<tolerance?{kind:'member',index:indices[nearest.index]}:null
  }
  const beginEdit=(event:{clientX:number;clientY:number;button:number;shiftKey?:boolean})=>{
    const q=coordinates(event)
    if(q.x<viewport.x+leftRuler||q.y<viewport.y+ruler)return
    if(tool==='pan'||event.button===1){gesture.current={kind:'pan',point:{x:event.clientX,y:event.clientY},view,draft};return}
    if(tool==='box'){gesture.current={kind:'box',point:q,view,draft,append:event.shiftKey};setSelectionBox({a:q,b:q});return}
    if(tool==='measure'){const point=snapPoint(q);if(!start){setStart(point);setMeasure(null)}else{setMeasure({a:start,b:point});setStart(null);setCursor(null)}return}
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
    if(tool==='select'&&selectedMember&&selectedItems.length===1&&!event.shiftKey){const end=(['a','b'] as const).find(end=>dist(q,selectedMember[end])<12/scale);if(end){gesture.current={kind:'endpoint',end,index:selection!.index,point:q,view,draft};return}}
    const picked=hit(q);setShowFailure(false)
    if(tool==='remove'){remove(picked);return}
    if(event.shiftKey&&picked){const key=supportItemKey(picked);groupSelection(selectedItems.some(i=>supportItemKey(i)===key)?selectedItems.filter(i=>supportItemKey(i)!==key):[...selectedItems,picked]);return}
    if(picked&&selectedItems.length>1&&selectedItems.some(i=>supportItemKey(i)===supportItemKey(picked))){gesture.current={kind:'group',items:selectedItems,point:q,view,draft};return}
    setSelection(picked)
    if(picked?.kind==='pedestal')gesture.current={kind:'pedestal',point:q,view,index:picked.index,draft}
    if(picked?.kind==='member')gesture.current={kind:'member',point:q,view,index:picked.index,draft}
  }
  const down=(event:ReactPointerEvent<SVGSVGElement>)=>{
    if(event.button!==0&&event.button!==1)return
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(pointers.current.size>=2){
      const [a,b]=[...pointers.current.values()],matrix=svg.current?.getScreenCTM()
      if(matrix)pinch.current={distance:Math.max(1,dist(a,b)),anchor:coordinates({clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2}),view,scale:matrix.a}
      touchTap.current=null;gesture.current=null;setMoving(null);setSelectionBox(null);return
    }
    // Defer touch additions/removals until release so a pinch cannot edit the draft.
    if(event.pointerType==='touch'&&tool!=='select'&&tool!=='pan'&&tool!=='box'){touchTap.current={x:event.clientX,y:event.clientY};return}
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
    const q=coordinates(event),active=gesture.current;setPointer(q)
    if(active?.kind==='pan'){const matrix=svg.current?.getScreenCTM();if(!matrix)return;const delta={x:(event.clientX-active.point.x)/matrix.a,y:(event.clientY-active.point.y)/matrix.d};setView({...active.view,x:active.view.x-delta.x,y:active.view.y-delta.y});return}
    if(active?.kind==='box'){setSelectionBox({a:active.point,b:q});return}
    if(active?.kind==='group'){
      let dx=q.x-active.point.x,dy=q.y-active.point.y
      if(event.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0}
      if(snap){dx=Math.round(dx*1000/snap)*snap/1000;dy=Math.round(dy*1000/snap)*snap/1000}
      setMoving(translateSupportGroup(active.draft,active.items??[],{x:dx,y:dy}));return
    }
    if(active?.kind==='pedestal'){
      const point=snap?{x:Math.round(q.x*1000/snap)*snap/1000,y:Math.round(q.y*1000/snap)*snap/1000}:q,nearest=nearestSupport(point,carriers);if(!nearest)return
      setMoving({...active.draft,pedestals:active.draft.pedestals.map((p,i)=>i===active.index?nearest.point:p)});return
    }
    if(active?.kind==='member'||active?.kind==='endpoint'){
      const member=active.draft.members[active.index!]
      if(active.kind==='endpoint'){
        const end=active.end!,other=member[end==='a'?'b':'a'];let point=snapPoint(q)
        if(event.shiftKey)point=Math.abs(point.x-other.x)>Math.abs(point.y-other.y)?{x:point.x,y:other.y}:{x:other.x,y:point.y}
        if(dist(point,other)>=.01)setMoving({...active.draft,members:active.draft.members.map((m,i)=>i===active.index?{...m,[end]:point}:m)})
      }else{
        let dx=q.x-active.point.x,dy=q.y-active.point.y
        if(event.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0}
        if(snap){dx=Math.round(dx*1000/snap)*snap/1000;dy=Math.round(dy*1000/snap)*snap/1000}
        setMoving({...active.draft,members:active.draft.members.map((m,i)=>i===active.index?{...m,a:{x:m.a.x+dx,y:m.a.y+dy},b:{x:m.b.x+dx,y:m.b.y+dy}}:m)})
      }
      return
    }
    if(start)setCursor(snapPoint(q))
  }
  const up=(event:ReactPointerEvent<SVGSVGElement>)=>{
    pointers.current.delete(event.pointerId)
    if(pinch.current){if(!pointers.current.size)pinch.current=null;return}
    if(touchTap.current){beginEdit({clientX:event.clientX,clientY:event.clientY,button:0});touchTap.current=null}
    if(gesture.current?.kind==='box'&&selectionBox){const items=supportItemsInBox(draft,selectionBox.a,coordinates(event)).filter(i=>i.kind==='pedestal'?visible.pedestal:draft.members[i.index].kind==='bearer'?visible.bearer:visible.joist);groupSelection(gesture.current.append?[...new Map([...selectedItems,...items].map(i=>[supportItemKey(i),i])).values()]:items);setSelectionBox(null)}
    if(moving&&gesture.current&&JSON.stringify(moving)!==JSON.stringify(gesture.current.draft))commit(moving,true)
    setMoving(null);gesture.current=null
  }
  const cancelPointer=(event:ReactPointerEvent<SVGSVGElement>)=>{pointers.current.delete(event.pointerId);touchTap.current=null;setMoving(null);setSelectionBox(null);gesture.current=null;if(!pointers.current.size)pinch.current=null}
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
  const removeGroup=()=>{const items=new Set(selectedItems.map(supportItemKey));commit({...draft,members:draft.members.filter((_,i)=>!items.has(`member-${i}`)),pedestals:draft.pedestals.filter((_,i)=>!items.has(`pedestal-${i}`))})}
  const duplicate=()=>{if(!selectedItems.length||automatic)return;const offset=(snap||25)/1000,shifted=translateSupportGroup(draft,selectedItems,{x:offset,y:offset}),members=[...draft.members],pedestals=[...draft.pedestals],items:SupportItem[]=[];for(const item of selectedItems){if(item.kind==='member'){items.push({kind:'member',index:members.length});members.push(shifted.members[item.index])}else{items.push({kind:'pedestal',index:pedestals.length});pedestals.push(shifted.pedestals[item.index])}}commit({...draft,members,pedestals});groupSelection(items)}
  const nudge=(dx:number,dy:number)=>{if(!selectedItems.length||automatic)return;commit(translateSupportGroup(draft,selectedItems,{x:dx,y:dy}),true)}
  const selectAll=()=>{if(automatic)return;groupSelection([...draft.members.flatMap((m,index)=>(m.kind==='bearer'?visible.bearer:visible.joist)?[{kind:'member' as const,index}]:[]),...draft.pedestals.flatMap((_,index)=>visible.pedestal?[{kind:'pedestal' as const,index}]:[])])}
  const arrange=(axis:'x'|'y',mode:'align'|'distribute'|'spacing')=>commit(arrangeSupportGroup(draft,selectedItems,axis,mode,groupSpacing/1000),true)
  const keys=(e:ReactKeyboardEvent<SVGSVGElement>)=>{
    const command=e.ctrlKey||e.metaKey
    if(command&&e.key.toLowerCase()==='a'){e.preventDefault();selectAll()}
    else if(command&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo()}
    else if(command&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate()}
    else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeGroup()}
    else if(e.key==='Escape'&&(start||selection||measure)){e.preventDefault();e.stopPropagation();setStart(null);setSelection(null);setMeasure(null)}
    else if(e.key.startsWith('Arrow')){e.preventDefault();const delta=(snap||1)/1000*(e.shiftKey?10:1);nudge(e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0,e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0)}
    else if(e.key.toLowerCase()==='v')changeTool('select')
    else if(e.key.toLowerCase()==='h')changeTool('pan')
    else if(e.key.toLowerCase()==='m')changeTool('measure')
    else if(e.key.toLowerCase()==='f')setView(fullView)
  }
  const drawingTools=<><h3>Drawing tools</h3><div className="support-tool-grid">{([['select','Select / move'],['box','Box select'],['pan','Pan'],['measure','Measure'],['pedestal','＋ Pedestal'],['joist','＋ Joist'],['bearer','＋ Bearer'],['noggin','＋ Blocking'],['remove','− Remove']] as [Tool,string][]).map(([value,label])=><button key={value} aria-pressed={tool===value} disabled={value==='bearer'&&!rule.bearer||automatic&&value!=='pan'&&value!=='measure'} title={value==='bearer'&&!rule.bearer?'Select a bearer + joist frame to add bearers':undefined} onClick={()=>changeTool(value)}>{label}</button>)}</div></>
  return <dialog ref={dialog} className="support-editor" aria-labelledby="support-editor-title" onCancel={e=>{e.preventDefault();close()}}>
    <header className="support-editor-header"><div><small>BETTERPLAN · SUPPORTS</small><h2 id="support-editor-title">Support layout editor</h2></div><span>{shown.members.length} members · {shown.pedestals.length} pedestals</span></header>
    <div className="support-mobile-tools">{drawingTools}</div><div className="support-editor-body"><aside id="support-editor-tools" className="support-editor-inspector">
      <div className="support-desktop-tools">{drawingTools}</div>
      <p className="support-help">{automatic?'Automatic layout preview.':tool==='measure'?'Choose two points to measure. Rulers and the scale bar follow every zoom and pan.':tool==='pedestal'?'Tap a supporting member to add a base.':tool==='joist'||tool==='bearer'||tool==='noggin'?'Tap a start, then an end. Existing members attract the ends.':tool==='remove'?'Tap a pedestal or member to remove it.':'Drag members, their end handles, or pedestals. Hold Shift to constrain member movement. Arrow keys nudge; Shift moves ten steps.'}</p>
      <label className="support-snap">Grid snap<select aria-label="Support editor grid snap" value={snap} onChange={e=>setSnap(+e.target.value)}>{[0,10,25,50,100].map(n=><option key={n} value={n}>{n?`${n} mm`:'Off'}</option>)}</select></label>
      {selectedItems.length===1&&selection?<section className="support-selection"><h3>{selection.kind==='pedestal'?`Pedestal P-${selection.index+1}`:`Member M-${selection.index+1}`}</h3>{selectedMember?<><p>{frameMemberName(selectedMember.size,selectedMember.kind,selectedMember.role)} · {Math.round(dist(selectedMember.a,selectedMember.b)*1000)} mm</p><div className="support-coordinate-grid">{(['a','b'] as const).flatMap(end=>(['x','y'] as const).map(axis=><Numeric key={end+axis} label={`${end==='a'?'Start':'End'} ${axis.toUpperCase()}`} value={selectedMember[end][axis]} onChange={n=>commit({...draft,members:draft.members.map((m,i)=>i===selection.index?{...m,[end]:{...m[end],[axis]:n}}:m)},true)}/>))}</div><button className="text-button" onClick={()=>focusMember(selectedMember)}>Zoom to member</button><Numeric label="Member length" value={dist(selectedMember.a,selectedMember.b)} onChange={length=>{if(length<.01)return;const l=dist(selectedMember.a,selectedMember.b);commit({...draft,members:draft.members.map((m,i)=>i===selection.index?{...m,b:{x:m.a.x+(m.b.x-m.a.x)*length/l,y:m.a.y+(m.b.y-m.a.y)*length/l}}:m)},true)}}/></>:null}{selectedBase?<div className="support-coordinate-grid">{(['x','y'] as const).map(axis=><Numeric key={axis} label={axis.toUpperCase()} value={selectedBase[axis]} onChange={n=>{const next={...draft,pedestals:draft.pedestals.map((q,i)=>i===selection.index?{...q,[axis]:n}:q)};commit(next);setSelection(selection)}}/>)}</div>:null}<button className="button secondary full" onClick={duplicate}>Duplicate selected</button><button className="button secondary full" onClick={()=>remove(selection)}>Remove selected {selection.kind}</button></section>:null}
      <section className="support-group-controls"><h3>{selectedItems.length} selected</h3><p>Shift-click to add or remove parts, or drag a selection box. Drag any selected part to move the group.</p><div className="support-group-buttons"><button onClick={selectAll} disabled={automatic}>Select all visible</button><button onClick={()=>setSelection(null)} disabled={!selectedItems.length}>Clear selection</button></div>{selectedItems.length>1?<><div className="support-group-buttons"><button onClick={()=>arrange('x','align')}>Align X centres</button><button onClick={()=>arrange('y','align')}>Align Y centres</button><button onClick={()=>arrange('x','distribute')} disabled={selectedItems.length<3}>Equal X centres</button><button onClick={()=>arrange('y','distribute')} disabled={selectedItems.length<3}>Equal Y centres</button></div><label className="support-coordinate"><span>Exact centre spacing <small>mm</small></span><input aria-label="Group centre spacing" type="number" min={1} max={30000} value={groupSpacing} onChange={e=>{const n=+e.target.value;if(Number.isFinite(n)&&n>=1&&n<=30000)setGroupSpacing(n)}}/></label><div className="support-group-buttons"><button onClick={()=>arrange('x','spacing')}>Space along X</button><button onClick={()=>arrange('y','spacing')}>Space along Y</button><button onClick={duplicate}>Duplicate group</button><button onClick={removeGroup}>Remove group</button></div><p>Alignment uses the first selected part. Equal distribution keeps the outer centres fixed. Every edit is checked before application.</p></>:null}</section>
      {failure?<section className="support-failure"><h3>Failed search member P-{failure.memberIndex+1}</h3><p>{failure.detail}</p><p>{Math.round(dist(failure.member.a,failure.member.b)*1000)} mm · {settings.pedestalDiameter??150} mm base · {settings.pedestalClearance??0} mm extra clearance</p><button className="button secondary full" onClick={()=>{setSelection(null);setShowFailure(true);focusMember(failure.member)}}>Show valid / blocked positions</button><small>Trial positions explain this search attempt; they do not prove that every arrangement is impossible.</small></section>:null}
      {diagnostic?<p className="support-help">{diagnostic.detail}</p>:null}
      <section className={`support-live-check ${checked?.frame?.geometryPass&&checked.heightFits?'passes':'review'}`} aria-live="polite"><strong>{pending?'Checking edited layout…':checked?.error?'Check unavailable':checked?.frame?.geometryPass&&checked.heightFits?'Geometry checks pass':'Draft needs review'}</strong>{checked?.error?<p>{checked.error}</p>:null}{checked?.heightFits===false?<p>The pedestal adjustment range does not fit the unchanged customer height.</p>:null}{checked?.frame?<details open={!checked.frame.geometryPass}><summary>{checked.frame.checks.filter(c=>c.ok).length} / {checked.frame.checks.length} checks</summary><ul>{checked.frame.checks.filter(c=>!c.ok).map(c=><li key={c.name}><b>{c.name}</b><span>{c.detail}</span></li>)}</ul></details>:null}<small>Unverified connection and overhang details remain provisional.</small></section>
      <details className="support-current-limits"><summary>Current limits</summary><p>{settings.pedestalDiameter??150} mm base · {settings.pedestalClearance??0} mm extra clearance<br/>{settings.joistSpacing} mm joist centres<br/>{Math.round(rule.support*1000)} mm report pedestal span<br/>{settings.frameStock} m aluminium stock<br/>35 mm end limit: {settings.joistOverhang35===undefined?'unverified':`${settings.joistOverhang35} mm`}<br/>80 mm end limit: {settings.joistOverhang80===undefined?'unverified':`${settings.joistOverhang80} mm`}</p></details>
      {settings!==original?<section className="support-preview-changes"><h3>Setting preview</h3>{(['pedestalClearance','frameStock','joistSpacing','pedestalName'] as const).filter(field=>settings[field]!==original[field]).map(field=><p key={field}>{({pedestalClearance:'Extra clearance (mm)',frameStock:'Stock length (m)',joistSpacing:'Joist centres (mm)',pedestalName:'Pedestal product'})[field]}: {original[field]??0} → {settings[field]}</p>)}<button className="text-button" onClick={()=>{cancelSuggestions();setSettings(original);if(automatic)automaticSeed.current=true}}>Revert setting preview</button></section>:null}
      <section className="support-setting-options"><h3>Setting options</h3><p>Test advanced settings at the same deck size, height and live load.</p><button className="button secondary full" disabled={!!progress} onClick={findSuggestions}>{progress?`Testing ${progress.done} / ${progress.total||'…'}`:'Find settings that fit'}</button>{progress?<button className="text-button" onClick={()=>{suggestionWorker.current?.terminate();setProgress(null)}}>Cancel search</button>:null}{suggestionError?<p>{suggestionError}</p>:null}{suggestions?.length===0?<p>No tested setting change produced a complete fit. The draft remains available for manual correction.</p>:null}{suggestions?.map(option=><article key={option.id}><strong>{option.title}</strong><ul>{option.changes.map(c=><li key={c}>{c}</li>)}</ul><small>{option.note}</small><p>{option.pedestals} pedestals · {option.members} members · geometry and height pass</p><button className="button secondary full" onClick={()=>applySuggestion(option)}>Preview these settings</button></article>)}</section>
    </aside><section className="support-editor-drawing">
      <div className="support-editor-toolbar"><div className="support-history"><button aria-label="Undo support edit" disabled={!history.past.length} onClick={undo}>↶ Undo</button><button aria-label="Redo support edit" disabled={!history.future.length} onClick={redo}>↷ Redo</button></div><div className="support-layer-toggles"><label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/>Grid</label>{(['joist','bearer','pedestal'] as const).map(kind=><label key={kind}><input type="checkbox" checked={visible[kind]} onChange={e=>setVisible(v=>({...v,[kind]:e.target.checked}))}/>{kind==='joist'?'Joists & blocking':kind==='bearer'?'Bearers':'Pedestals'}</label>)}</div><div><button aria-label="Zoom in support plan" onClick={()=>zoom(.8)}>＋</button><button aria-label="Zoom out support plan" onClick={()=>zoom(1.25)}>−</button><button onClick={()=>setView(fullView)}>Fit deck</button></div></div>
      <div className="support-touch-hint"><span>{tool==='box'?'Drag a box around members and pedestals':tool==='pan'?'Drag to pan':tool==='measure'?'Pick two points · M to measure · Esc to clear':tool==='select'?'Drag members or end handles · Shift locks an axis':tool==='remove'?'Tap an item to remove':tool==='pedestal'?'Tap a supporting member to add a pedestal':start?'Tap the end of the new member':'Tap the start of the new member'}</span>{start?<button onClick={()=>{setStart(null);setCursor(null)}}>Cancel line</button>:null}</div><svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={`support-edit-canvas tool-${tool}`} tabIndex={0} role="application" aria-label="Interactive support layout. Select members, drag pedestals, or draw a member with two taps. Pinch to zoom and use two fingers to pan." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer} onWheel={e=>{zoom(e.deltaY>0?1.15:.87,coordinates(e))}} onKeyDown={keys} onPointerLeave={()=>setPointer(null)}>
        <defs><pattern id="support-edit-grid" width={step/5} height={step/5} patternUnits="userSpaceOnUse"><path d={`M${step/5} 0H0V${step/5}`} fill="none" stroke="#dfe6d5" strokeWidth={1/scale}/></pattern></defs><rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} fill={showGrid?"url(#support-edit-grid)":"#f1f4e9"}/>
        <path d={`M${plan.physical.map(q=>`${q.x},${q.y}`).join('L')}Z ${plan.cutouts.map(h=>`M${h.polygon.map(q=>`${q.x},${q.y}`).join('L')}Z`).join(' ')}`} fill="#fff" fillOpacity=".72" fillRule="evenodd" stroke="#7f8b70" strokeWidth=".009"/>
        {visible.bearer?<path d={paths.bearer} fill="none" stroke="#be934b" strokeWidth={(settings.frameFaceWidth??35)/1000+.01}/>:null}{visible.joist?<path d={paths.joist} fill="none" stroke="#426c52" strokeWidth={(settings.frameFaceWidth??35)/1000}/>:null}{visible.pedestal?<path d={paths.pedestals} fill="#dce3ce" fillOpacity=".65" stroke="#667d56" strokeWidth=".007"/>:null}
        {selectedItems.length>1?<g className="support-multi-selection" fill="none" stroke="#254f83" strokeWidth={3/scale}>{selectedItems.map(item=>item.kind==='member'?<path key={supportItemKey(item)} d={line(draft.members[item.index])}/>:<circle key={supportItemKey(item)} cx={draft.pedestals[item.index].x} cy={draft.pedestals[item.index].y} r={radius+3/scale}/>)}</g>:null}
        {selectionBox?<rect x={Math.min(selectionBox.a.x,selectionBox.b.x)} y={Math.min(selectionBox.a.y,selectionBox.b.y)} width={Math.abs(selectionBox.b.x-selectionBox.a.x)} height={Math.abs(selectionBox.b.y-selectionBox.a.y)} fill="#bdd7ef" fillOpacity=".25" stroke="#254f83" strokeWidth={1/scale} strokeDasharray={`${5/scale} ${3/scale}`}/>:null}
        {selectedMember&&diagnostic?<path d={line(selectedMember)} stroke="#254f83" strokeWidth=".095" strokeOpacity=".25" fill="none"/>:null}
        {diagnostic?<g className="support-position-ranges"><path d={line(diagnostic.member)} stroke="#b6674a" strokeWidth=".065"/>{diagnostic.edgeClear.map(([a,b],i)=>{const m=diagnostic.member,l=dist(m.a,m.b),point=(t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t/l,y:m.a.y+(m.b.y-m.a.y)*t/l});return <path key={`clear${i}`} d={line({a:point(a),b:point(b)})} stroke="#d49b3e" strokeWidth=".06"/>})}{diagnostic.available.map(([a,b],i)=>{const m=diagnostic.member,l=dist(m.a,m.b),point=(t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t/l,y:m.a.y+(m.b.y-m.a.y)*t/l});return <path key={`free${i}`} d={line({a:point(a),b:point(b)})} stroke="#52a267" strokeWidth=".06"/>})}{showFailure?diagnostic.trialBases.map((q,i)=><circle key={i} cx={q.x} cy={q.y} r={radius} fill="none" stroke="#d49b3e" strokeWidth=".008" strokeDasharray=".025 .012"/>):null}</g>:null}
        {selectedMember&&!diagnostic?<path d={line(selectedMember)} stroke="#254f83" strokeWidth=".045" fill="none"/>:null}{selectedBase?<circle cx={selectedBase.x} cy={selectedBase.y} r={radius} fill="#bdd7ef" stroke="#254f83" strokeWidth=".012"/>:null}
        {checked?.frame?.conflicts.map((point,i)=>{const q=physicalSupportPoint(point,settings);return <g key={i} stroke="#b86e44" strokeWidth=".012"><circle cx={q.x} cy={q.y} r=".07" fill="#fff3e1"/><path d={`M${q.x-.03},${q.y-.03}l.06 .06m-.06 0l.06 -.06`}/></g>})}
        {selectedItems.length===1&&selectedMember?<g className="support-member-handles">{(['a','b'] as const).map(end=><circle key={end} cx={selectedMember[end].x} cy={selectedMember[end].y} r={6/scale} fill="#fff" stroke="#254f83" strokeWidth={2/scale}/>)}<text x={(selectedMember.a.x+selectedMember.b.x)/2} y={(selectedMember.a.y+selectedMember.b.y)/2-12/scale} fontSize={12/scale} textAnchor="middle" fill="#254f83" stroke="#fff" strokeWidth={4/scale} paintOrder="stroke">{Math.round(dist(selectedMember.a,selectedMember.b)*1000)} mm</text></g>:null}
        {measure||tool==='measure'&&start&&cursor?(()=>{const m=measure??{a:start!,b:cursor!};return <g className="support-measurement" stroke="#254f83" strokeWidth={1.5/scale}><path d={line(m)} strokeDasharray={`${6/scale} ${3/scale}`}/>{[m.a,m.b].map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4/scale} fill="#fff"/>)}<text x={(m.a.x+m.b.x)/2} y={(m.a.y+m.b.y)/2-10/scale} fontSize={13/scale} textAnchor="middle" fill="#254f83" stroke="#fff" strokeWidth={4/scale} paintOrder="stroke">{(dist(m.a,m.b)*1000).toFixed(1)} mm</text></g>})():null}
        {start?<g stroke="#345c89" strokeWidth=".025"><circle cx={start.x} cy={start.y} r=".035"/>{cursor?<path d={line({a:start,b:cursor})} strokeDasharray=".06 .03"/>:null}</g>:null}
      <SupportRulers viewport={viewport} step={step} pointer={pointer}/></svg><div className="support-editor-legend">{diagnostic?<><span className="range-clear">● Clear of edges / bases</span><span className="range-occupied">● Existing / trial base collisions</span><span className="range-blocked">● Boundary / edge clearance</span></>:<span>Pinch to zoom · Two fingers to pan · Mouse wheel to zoom · Ctrl/Cmd Z undoes</span>}<span>{pointer?`X ${Math.round(pointer.x*1000)} · Y ${Math.round(pointer.y*1000)} mm`:'V Select · H Pan · M Measure · F Fit · Arrow keys nudge'}</span></div>
    </section></div>
    <footer className="support-editor-footer">{discard?<><strong>Discard unsaved support edits?</strong><button className="button secondary" onClick={()=>setDiscard(false)}>Keep editing</button><button className="button" onClick={onClose}>Discard changes</button></>:<><div><span role="status">{message||`${settings.height} mm finished height · ${settings.load} kN/m² · ${settings.frameStock} m stock`}</span><small>Edits and setting previews are saved only when applied.</small></div><span className={`support-check-badge ${checked?.frame?.geometryPass&&checked.heightFits?'passes':'review'}`}>{pending?'Checking…':checked?.frame?.geometryPass&&checked.heightFits?'Geometry checks pass':'Draft needs review'}</span><button className="button quiet" onClick={close}>Close ✕</button><button className="button secondary" onClick={previewAutomatic}>Preview automatic layout</button>{automatic?<button className="button secondary" disabled={pending||!checked?.frame} onClick={()=>{setAutomatic(false);automaticSeed.current=false}}>Edit this preview</button>:null}<button className="button" disabled={pending||!!checked?.error||!checked?.frame} onClick={apply}>{checked?.frame?.geometryPass&&checked.heightFits?'Apply layout':'Save draft'}</button></>}</footer>
  </dialog>
}
