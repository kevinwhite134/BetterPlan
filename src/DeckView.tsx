import { fasciaHeight } from './planner.ts'
import DeckScene from './DeckScene'
import { LayerThumbnail } from './DeckLayerThumbnail'
import OpenIcon from './OpenIcon'
import PlanRotation from './PlanRotationControls'
import { rotatedViewBox, rotatePlanSvg } from './planRotation'
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { bounds } from './planner'
import { boardRings, ringPath } from './shapeGeometry'
import { signedArea } from './deckGeometry'
import StructureDrawing from './StructureDrawing'
import { DeckLabelKey } from './DeckLabels'
import { BOARD_USE_NAMES, frameMemberName, pedestalReference } from './productNames'
import { installerPlan, installerSvg } from './installerPlan'
import { isLargePreview } from './renderOverview'
import type { Plan, Point, Settings } from './planner'

type Exposure = 'finished'|'boards'|'joists'|'bearers'|'pedestals'
const LAYERS:{id:Exposure;label:string;description:string}[] = [
  {id:'finished',label:'Finished deck',description:'Decking and optional fascia'},
  {id:'boards',label:'Decking boards',description:'Remove fascia to expose the decking boards'},
  {id:'joists',label:'Alu-Joists',description:'Lift the decking to expose the Alu-Joist subframe'},
  {id:'bearers',label:'Bearers',description:'Lift the Alu-Joists to expose primary bearers and pedestals'},
  {id:'pedestals',label:'Pedestals',description:'Expose the pedestal positions and bases'},
]
const coordinates=(p:Point[])=>p.map(q=>`${q.x},${q.y}`).join(' ')
const clampTilt=(value:number)=>Math.max(20,Math.min(80,value))
const wrapRotation=(value:number)=>((value+180)%360+360)%360-180


function PlanDeckView({plan,settings:s,layer,showSupports,measurements=false}: {plan:Plan;settings:Settings;layer:'boards'|'frame'|'3d';showSupports:boolean;measurements?:boolean}) {
  const id=useId().replaceAll(':',''),[rotation,setRotation]=useState(35),[tilt,setTilt]=useState(52),[exposure,setExposure]=useState<Exposure>('finished'),[orbiting,setOrbiting]=useState(false)
  const drag=useRef<{pointerId:number;x:number;y:number;rotation:number;tilt:number}|null>(null)
  const [planZoom,setPlanZoom]=useState(1),[planRotation,setPlanRotation]=useState(0),[labels,setLabels]=useState(false)
  const large=isLargePreview(plan)
  const measured=useMemo(()=>measurements&&layer==='frame'&&plan.frame.layoutStatus==='ready'?installerSvg(installerPlan(plan,s)):null,[measurements,layer,plan,s])
  const exposed=exposure==='bearers'&&!plan.frame.rule.bearer?'joists':exposure
  const activeLayer=LAYERS.find(item=>item.id===exposed)!
  const layers=LAYERS.filter(item=>item.id!=='bearers'||plan.frame.rule.bearer>0)
  const showBoards=exposed==='finished'||exposed==='boards'
  const visibleSupports=showSupports||exposed==='pedestals'
  const box=bounds(plan.physical),angle=rotation*Math.PI/180,t=tilt*Math.PI/180
  const physical=(p:Point)=>s.direction==='vertical'?{x:p.y,y:p.x}:p
  const project=(p:Point,z=0)=>{const q=physical(p),x=q.x-box.width/2,y=q.y-box.depth/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:(x*Math.sin(angle)+y*Math.cos(angle))*Math.cos(t)-z*Math.sin(t)}}
  const projectStructure=useCallback((p:Point&{z:number})=>{const x=p.x-box.width/2,y=p.y-box.depth/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:(x*Math.sin(angle)+y*Math.cos(angle))*Math.cos(t)-p.z*Math.sin(t)}},[box.width,box.depth,angle,t])
  const poly=(p:Point[],z=0)=>coordinates(layer==='3d'?p.map(q=>project(q,z)):p.map(physical))
  const surface=(ring:Point[],z=0)=>ringPath([ring,...plan.holes].map(r=>r.map(p=>layer==='3d'?project(p,z):physical(p))))
  const ground=-s.height/1000,boardBottom=-s.board.thickness/1000
  const projected=plan.p.flatMap(q=>[project(q),project(q,Math.min(ground,s.skirting?boardBottom-fasciaHeight(s)/1000:ground))]),xs=projected.map(q=>q.x),ys=projected.map(q=>q.y),pad=labels?Math.max(.8,box.width*.16):.5,minX=Math.min(...xs)-pad,minY=Math.min(...ys)-pad
  const sceneView={x:minX,y:minY,w:Math.max(...xs)-minX+pad,h:Math.max(...ys)-minY+pad}
  const view=layer==='3d'?`${sceneView.x} ${sceneView.y} ${sceneView.w} ${sceneView.h}`:rotatedViewBox(-.45,-.45,box.width+.9,box.depth+.9,planRotation)
  const sign=signedArea(plan.physical)>0?1:-1
  const fronts=plan.p.map((a,i)=>({a,b:plan.p[(i+1)%plan.p.length]})).filter(({a,b})=>{const u=physical(a),v=physical(b),nx=(v.y-u.y)*sign,ny=-(v.x-u.x)*sign;return nx*Math.sin(angle)+ny*Math.cos(angle)>1e-7}).sort((u,v)=>project(u.a).y+project(u.b).y-project(v.a).y-project(v.b).y)
  const boardPaths=useMemo(()=>{
    if(!large)return []
    const grouped=new Map<string,{kind:string;parts:string[];count:number}>()
    const a=rotation*Math.PI/180,t=tilt*Math.PI/180
    const convert=(p:Point)=>{const q=s.direction==='vertical'?{x:p.y,y:p.x}:p;if(layer!=='3d')return q;const x=q.x-box.width/2,y=q.y-box.depth/2;return {x:x*Math.cos(a)-y*Math.sin(a),y:(x*Math.sin(a)+y*Math.cos(a))*Math.cos(t)}}
    for(const piece of plan.boards.pieces){const kind=piece.kind??'infill';let group=grouped.get(kind);if(!group){group={kind,parts:[],count:0};grouped.set(kind,group)}group.parts.push(ringPath(boardRings(piece).map(r=>r.map(convert))));group.count++}
    return [...grouped.values()].map(g=>({kind:g.kind,path:g.parts.join(''),count:g.count}))
  },[large,plan,rotation,tilt,s,layer,box.width,box.depth])
  const framePaths=useMemo(()=>{
    if(!large)return {members:[],bases:'',centres:'',splices:'',draftMembers:'',draftBases:''}
    const physical=(p:Point)=>s.direction==='vertical'?{x:p.y,y:p.x}:p,groups=new Map<string,string[]>()
    const circle=(p:Point,r:number)=>`M${p.x+r} ${p.y}a${r} ${r} 0 1 0 ${-2*r} 0a${r} ${r} 0 1 0 ${2*r} 0Z`
    const memberLine=(m:Plan['frame']['members'][number])=>{const a=physical(m.a),b=physical(m.b);return `M${a.x} ${a.y}L${b.x} ${b.y}`}
    for(const m of plan.frame.members){let paths=groups.get(m.kind);if(!paths){paths=[];groups.set(m.kind,paths)}paths.push(memberLine(m))}
    return {members:[...groups].map(([kind,paths])=>({kind,path:paths.join('')})),bases:plan.frame.pedestals.map(p=>circle(physical(p),(s.pedestalDiameter??150)/2000)).join(''),centres:plan.frame.pedestals.map(p=>circle(physical(p),.022)).join(''),splices:plan.frame.splices.map(p=>{const q=physical(p);return `M${q.x-.025} ${q.y-.025}h.05v.05h-.05Z`}).join(''),draftMembers:plan.frame.diagnostic.members.map(memberLine).join(''),draftBases:plan.frame.diagnostic.pedestals.map(p=>circle(physical(p),(s.pedestalDiameter??150)/2000)).join('')}
  },[large,plan,s])
  const lowestRow=Math.min(...plan.frame.pedestals.map(q=>q.y)),row=plan.frame.pedestals.filter(q=>Math.abs(q.y-lowestRow)<1e-5).sort((a,b)=>a.x-b.x)
  const resetCamera=()=>{setRotation(35);setTilt(52)}
  const startOrbit=(event:PointerEvent<SVGSVGElement>)=>{if(layer!=='3d'||event.button!==0||drag.current)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,rotation,tilt};setOrbiting(true)}
  const moveOrbit=(event:PointerEvent<SVGSVGElement>)=>{const start=drag.current;if(!start||event.pointerId!==start.pointerId)return;setRotation(wrapRotation(start.rotation-(event.clientX-start.x)*.45));setTilt(clampTilt(start.tilt-(event.clientY-start.y)*.25))}
  const endOrbit=(event:PointerEvent<SVGSVGElement>)=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=null;setOrbiting(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}
  const cameraKeys=(event:KeyboardEvent<SVGSVGElement>)=>{if(layer!=='3d')return;switch(event.key){case 'ArrowLeft':setRotation(value=>wrapRotation(value-10));break;case 'ArrowRight':setRotation(value=>wrapRotation(value+10));break;case 'ArrowUp':setTilt(value=>clampTilt(value+5));break;case 'ArrowDown':setTilt(value=>clampTilt(value-5));break;case 'Home':resetCamera();break;default:return}event.preventDefault()}
  return <div className={`deck-view ${layer==='3d'?'perspective':''}`}>
    {layer!=='3d'?<PlanRotation value={planRotation} onChange={setPlanRotation}/>:null}
    <div className={layer==='3d'?'viewer-stage':'plan-stage'}>
    {measured?<><div className="deck-svg measured-plan-window" tabIndex={0} role="region" aria-label="Measured plan; zoom in and scroll to inspect dimensions"><img className="measured-deck-plan" style={{width:`${planZoom*100}%`,height:`${planZoom*100}%`}} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rotatePlanSvg(measured,planRotation))}`} alt="Measured installer plan: edge lengths and setting-out IDs in millimetres"/></div><div className="measurement-zoom" role="group" aria-label="Measured plan zoom"><button type="button" aria-label="Zoom out measurements" disabled={planZoom===1} onClick={()=>setPlanZoom(z=>Math.max(1,z-.5))}>−</button><span>{Math.round(planZoom*100)}%</span><button type="button" aria-label="Zoom in measurements" disabled={planZoom===4} onClick={()=>setPlanZoom(z=>Math.min(4,z+.5))}>＋</button><button type="button" onClick={()=>setPlanZoom(1)}>Fit</button></div></>:<>
    <svg className={`deck-svg ${layer==='3d'?`orbit-canvas ${orbiting?'is-orbiting':''}`:''}`} viewBox={view} role="img" aria-label={layer==='3d'?`3D deck view: ${activeLayer.label}. Rotation ${Math.round(rotation)} degrees, tilt ${Math.round(tilt)} degrees.`:layer==='frame'?plan.frame.layoutStatus==='ready'?'Checked framing and actual pedestal base footprints':'Unresolved draft framing and bearing positions, not for installation':'Deck boards with angled and tapered edge cuts inside the picture frame'} aria-describedby={layer==='3d'?`${id}-orbit-help`:undefined} tabIndex={layer==='3d'?0:undefined} onPointerDown={startOrbit} onPointerMove={moveOrbit} onPointerUp={endOrbit} onPointerCancel={endOrbit} onLostPointerCapture={()=>{drag.current=null;setOrbiting(false)}} onKeyDown={cameraKeys}>
      <defs>
        <pattern id={`${id}-grid`} width=".2" height=".2" patternUnits="userSpaceOnUse"><path d="M.2 0H0V.2" stroke="#bac7af" strokeWidth=".003" fill="none"/></pattern>
        <pattern id={`${id}-grain`} width="1.1" height=".136" patternUnits="userSpaceOnUse"><rect width="1.1" height=".136" fill={s.board.colour}/><path d="M0 .025Q.4 .005 1.1 .027M0 .055Q.6 .08 1.1 .052M0 .1Q.5 .09 1.1 .105" stroke="#241b13" strokeOpacity=".15" strokeWidth=".003" fill="none"/></pattern>
        <pattern id={`${id}-unfilled`} width=".06" height=".06" patternUnits="userSpaceOnUse"><rect width=".06" height=".06" fill="#ead8c5"/><path d="M0 .06L.06 0" stroke="#c19b7c" strokeOpacity=".4" strokeWidth=".004"/></pattern>
      </defs>
      <g transform={layer==='3d'?undefined:`rotate(${planRotation} ${box.width/2} ${box.depth/2})`}>
      {layer==='3d'?<>
        <path d={surface(plan.p,ground-.015)} fillRule="evenodd" fill="#344b37" opacity=".12"/>
        <StructureDrawing plan={plan} settings={s} exposure={exposed} showSupports={visibleSupports} rotation={rotation} tilt={tilt} project={projectStructure}/>
        {showBoards?fronts.map(({a,b},i)=><polygon key={i} points={coordinates([project(a),project(b),project(b,boardBottom),project(a,boardBottom)])} fill={s.board.colour} stroke="#5b4635" strokeWidth=".005"/>):null}
        {exposed==='finished'&&s.skirting?fronts.map(({a,b},i)=>{const bottom=boardBottom-fasciaHeight(s)/1000;return <g key={i}><polygon points={coordinates([project(a,boardBottom),project(b,boardBottom),project(b,bottom),project(a,bottom)])} fill={s.board.colour} stroke="#554330" strokeWidth=".008"/><polyline points={coordinates([project(a,boardBottom-.025),project(b,boardBottom-.025)])} stroke="#fff" strokeOpacity=".12" strokeWidth=".006"/></g>}):null}
      </>:<rect x="-.45" y="-.45" width={box.width+.9} height={box.depth+.9} fill={`url(#${id}-grid)`}/>}
      {layer!=='3d'||showBoards?<path d={surface(plan.p)} fillRule="evenodd" fill={layer==='frame'?'#f6f7ef':'#534a3c'} stroke="#71816a" strokeWidth=".009"/>:<polygon points={poly(plan.p,ground)} fill="none" stroke="#91a180" strokeDasharray=".05 .04" strokeWidth=".006"/>}
      {layer==='frame'?<>
        <polygon points={poly(plan.frame.footprint)} fill="none" stroke="#9aa58c" strokeDasharray=".04 .04" strokeWidth=".008"/>
        {plan.frame.layoutStatus==='unbuildable'?<g aria-label="Unresolved draft layout, not scheduled for installation">
          <g opacity=".2">{large?boardPaths.map(p=><path key={p.kind} d={p.path} fillRule="evenodd" fill={s.board.colour} stroke="#796b55" strokeWidth=".004"/>):plan.boards.pieces.map((p,i)=><path key={i} d={ringPath(boardRings(p).map(r=>r.map(physical)))} fillRule="evenodd" fill={s.board.colour} stroke="#796b55" strokeWidth=".004"/>)}</g>
          {large?<path d={framePaths.draftMembers} fill="none" stroke="#ae773f" strokeWidth=".023" strokeDasharray=".05 .025"/>:plan.frame.diagnostic.members.map((m,i)=>{const a=physical(m.a),b=physical(m.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ae773f" strokeWidth=".023" strokeDasharray=".05 .025"><title>Draft {frameMemberName(m.size,m.kind,m.role)} · unresolved · excluded from quantities</title></line>})}
          {showSupports?large?<path d={framePaths.draftBases} fill="#edcba5" fillOpacity=".25" stroke="#ae773f" strokeWidth=".007" strokeDasharray=".025 .02"/>:plan.frame.diagnostic.pedestals.map((q,i)=>{const p=physical(q);return <circle key={i} cx={p.x} cy={p.y} r={(s.pedestalDiameter??150)/2000} fill="#edcba5" fillOpacity=".25" stroke="#ae773f" strokeWidth=".007" strokeDasharray=".025 .02"><title>Draft bearing position · not a scheduled pedestal</title></circle>}):null}
        </g>:null}
        {large?framePaths.members.map(m=><path key={m.kind} d={m.path} fill="none" stroke={m.kind==='bearer'?'#ba8d42':m.kind==='noggin'?'#a66850':'#426c52'} strokeWidth={m.kind==='bearer'?.055:.028} data-member-count={plan.frame.members.filter(q=>q.kind===m.kind).length}/>):plan.frame.members.map((m,i)=>{const a=physical(m.a),b=physical(m.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={m.kind==='bearer'?'#ba8d42':m.kind==='noggin'?'#a66850':'#426c52'} strokeWidth={m.kind==='bearer'?.055:.028}><title>{frameMemberName(m.size,m.kind,m.role)} · stock segment</title></line>})}
        {showSupports?large?<g data-pedestal-count={plan.frame.pedestals.length}><path d={framePaths.bases} fill={plan.frame.geometryPass?'#e8edda':'#f4dccb'} fillOpacity=".8" stroke={plan.frame.geometryPass?'#4a6342':'#a56744'} strokeWidth=".008"/><path d={framePaths.centres} fill="#354e3b"/><title>All {plan.frame.pedestals.length} actual pedestal bases · exact setting-out IDs in measured plan and schedules</title></g>:plan.frame.pedestals.map((q,i)=>{const p=physical(q);return <g key={i}><circle cx={p.x} cy={p.y} r={(s.pedestalDiameter??150)/2000} fill={plan.frame.geometryPass?'#e8edda':'#f4dccb'} fillOpacity=".8" stroke={plan.frame.geometryPass?'#4a6342':'#a56744'} strokeWidth=".008"/><circle cx={p.x} cy={p.y} r=".022" fill="#354e3b"/><title>{pedestalReference(s.pedestalName,i)} · base {s.pedestalDiameter??150} mm · adjustment {Math.round(plan.range.min)}–{Math.round(plan.range.max)} mm</title></g>}):null}
        {large?<path d={framePaths.splices} fill="#fff" stroke="#6f6e55" strokeWidth=".006"/>:plan.frame.splices.map((q,i)=>{const p=physical(q);return <rect key={i} x={p.x-.025} y={p.y-.025} width=".05" height=".05" fill="#fff" stroke="#6f6e55" strokeWidth=".006"/>})}
        {plan.frame.layoutStatus==='unbuildable'?plan.frame.conflicts.map((q,i)=>{const p=physical(q);return <g key={i}><circle className="support-conflict" cx={p.x} cy={p.y} r=".12"/><path d={`M${p.x-.035} ${p.y-.035}l.07 .07m0 -.07l-.07 .07`} stroke="#b56946" strokeWidth=".012"/><title>Unresolved bearing area. This marker is not a scheduled pedestal.</title></g>}):null}
        {large?null:row.slice(1).map((b,i)=>{const a=row[i],mid=physical({x:(a.x+b.x)/2,y:a.y-.06});return <text key={i} x={mid.x} y={mid.y} fontSize=".08" textAnchor="middle" fill="#657759">{Math.round((b.x-a.x)*1000)}</text>})}
      </>:layer!=='3d'||showBoards?<>
        <path d={surface(plan.boards.fit.inner)} fillRule="evenodd" fill={`url(#${id}-unfilled)`}/>
        {large?boardPaths.map(p=><path key={p.kind} d={p.path} fillRule="evenodd" fill={`url(#${id}-grain)`} stroke={p.kind==='perimeter'?'#59452f':'#40362b'} strokeOpacity={p.kind==='perimeter'?.65:.3} strokeWidth={p.kind==='perimeter'?.006:.002} data-board-count={p.count}><title>{p.count} actual {p.kind} pieces · complete cutting list available in Review</title></path>):plan.boards.pieces.map((p,i)=><path key={i} d={ringPath(boardRings(p).map(r=>r.map(q=>layer==='3d'?project(q):physical(q))))} fillRule="evenodd" fill={`url(#${id}-grain)`} stroke={p.kind==='perimeter'?'#59452f':'#40362b'} strokeOpacity={p.kind==='perimeter'?.65:.3} strokeWidth={p.kind==='perimeter'?.006:.002}><title>{BOARD_USE_NAMES[p.kind??'infill']} {i+1} · {p.length.toFixed(3)} m × {Math.round(p.width*1000)} mm finished width{p.localRip?' · local rip / notch':''} · {s.board.width} mm stock · angled / tapered cuts allowed</title></path>)}
      </>:null}
      {layer!=='3d'?<g fill="#617155" textAnchor="middle" fontSize=".11"><text x={box.width/2} y="-.18">{box.width.toFixed(3)} m</text><text transform={`translate(-.18 ${box.depth/2}) rotate(-90)`}>{box.depth.toFixed(3)} m</text></g>:null}
    </g></svg>
    </>}
    {layer==='3d'?<aside className="layer-rail" aria-label="Expose deck layers"><span className="layer-rail-title">EXPLORE LAYERS</span>{layers.map(item=><button type="button" key={item.id} className={`layer-card ${exposed===item.id?'selected':''}`} aria-pressed={exposed===item.id} aria-label={`Show ${item.label.toLowerCase()}`} title={item.description+(large?' · simplified thumbnail; main view includes every component':'')} onClick={()=>{setExposure(item.id);if(['joists','bearers','pedestals'].includes(item.id)&&tilt<45)setTilt(58)}}><span className="layer-card-picture"><LayerThumbnail plan={plan} settings={s} exposure={item.id}/></span><span className="layer-card-label">{item.label}<span aria-hidden="true">{exposed===item.id?'●':<OpenIcon/>}</span></span></button>)}</aside>:null}
    </div>
    {layer==='3d'&&labels?<DeckLabelKey plan={plan} s={s} exposure={exposed} showSupports={visibleSupports}/>:null}
    {layer==='3d'?<>
      <div className="orbit-toolbar"><p id={`${id}-orbit-help`}>Drag the deck to rotate and tilt. <span>Arrow keys also move the view; Home resets it.</span></p><div className="orbit-buttons" role="group" aria-label="3D camera controls"><button type="button" aria-label="Rotate view left" onClick={()=>setRotation(value=>wrapRotation(value-15))}>↶</button><button type="button" aria-label="Rotate view right" onClick={()=>setRotation(value=>wrapRotation(value+15))}>↷</button><button type="button" aria-label="Tilt view up" onClick={()=>setTilt(value=>clampTilt(value+5))}>↑</button><button type="button" aria-label="Tilt view down" onClick={()=>setTilt(value=>clampTilt(value-5))}>↓</button><button type="button" onClick={resetCamera}>Reset view</button></div></div>
      <div className="exposure-caption"><span role="status">{activeLayer.description}</span><label className="part-label-toggle"><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>Label one of each component</label><span className="colour-chip"><i style={{background:s.board.colour}}/>{s.board.colourName}</span></div>
    </>:<div className="view-legend">{layer==='boards'?<><span>Picture-frame boards</span><span>{plan.boards.fit.rows} infill rows</span><span><i style={{background:'#d2b18f'}}/>Unfilled space / installation gaps</span></>:plan.frame.layoutStatus==='unbuildable'?<><span><i style={{background:'#ae773f'}}/>Draft only · amber framing and bearings are unresolved</span><span>⊗ Area to correct</span><span>Quantities pending</span></>:<><span><i className="legend-joist"/>Alu-Joists / collectors</span><span><i className="legend-bearer"/>Alu-Joist bearers / collectors</span><span>◉ Actual pedestal bases</span><span>□ Supported stock joints</span><span>Support dimensions in mm</span></>}</div>}
    {plan.frame.layoutStatus==='unbuildable'&&layer!=='boards'?<div className="support-resolution viewer-notice" role="status"><strong>Support layout unresolved</strong>{plan.frame.issues[0]}<p>Frame and pedestal quantities stay pending until this is resolved in Supports.</p></div>:null}
  </div>
}

export default function DeckView(props:{plan:Plan;settings:Settings;layer:'boards'|'frame'|'3d';showSupports:boolean;measurements?:boolean;prices?:Record<string,string>;onShowMaterial?:(key:string)=>void}){
  return props.layer==='3d'?<DeckScene plan={props.plan} s={props.settings} showSupports={props.showSupports} prices={props.prices??{}} onShowMaterial={props.onShowMaterial}/>:<PlanDeckView {...props}/>
}
