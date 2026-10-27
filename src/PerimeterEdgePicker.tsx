import { ChoiceField, SettingHeading } from './SettingControls'
import { perimeterEdgeEnabled } from './perimeterEdges'
import { bounds, distance, normalize } from './planner'
import type { Settings } from './planner'

export default function PerimeterEdgePicker({settings:s,onChange}:{settings:Settings;onChange:(s:Settings)=>void}){
  const p=normalize(s.polygon),box=bounds(p),pad=Math.max(box.width,box.depth)*.12,font=Math.max(box.width,box.depth)*.035
  const set=(edges:boolean[])=>onChange({...s,perimeterEdges:edges,confirmed:false,edgeDetailConfirmed:false})
  const toggle=(i:number)=>set(p.map((_,j)=>j===i?!perimeterEdgeEnabled(s,j):perimeterEdgeEnabled(s,j)))
  return <section className="perimeter-edge-picker" aria-label="Picture-frame edges">
    <ChoiceField<1|2> label="Picture-frame boards" value={s.pictureFrameRows??1} options={[{value:1,label:'Single'},{value:2,label:'Double'}]} onChange={pictureFrameRows=>onChange({...s,pictureFrameRows,confirmed:false,edgeDetailConfirmed:false})} help={{description:'One or two full-width boards following each selected outside edge and the openings, with the normal installation gap between rows.',affects:'The infill area, edge ladder width, board cuts and purchase quantities.'}}/>
    <SettingHeading label="Picture-frame edges" help={{description:'Choose which outside edges have a framing board. Switch it off where the deck meets a wall or house. Click a numbered edge or its button.',affects:'Infill dimensions, board cuts, perimeter blocking and quantities. The structure follows the installed boards; no full perimeter ring is added automatically.'}}/>
    <svg viewBox={`${-pad} ${-pad} ${box.width+2*pad} ${box.depth+2*pad}`} aria-label="Choose perimeter framing edges">
      <polygon points={p.map(q=>`${q.x},${q.y}`).join(' ')} fill="#f0f3e7" stroke="#ccd6bf" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      {p.map((a,i)=>{const b=p[(i+1)%p.length],enabled=perimeterEdgeEnabled(s,i);return <g key={i} role="button" tabIndex={0} aria-pressed={enabled} aria-label={`Edge ${i+1} framing board ${enabled?'on':'off'}`} onClick={()=>toggle(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(i)}}}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="20" vectorEffect="non-scaling-stroke"/>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={enabled?'#697b32':'#b7c0ac'} strokeWidth={enabled?5:2} strokeDasharray={enabled?undefined:'4 4'} vectorEffect="non-scaling-stroke"/>
        <text x={(a.x+b.x)/2} y={(a.y+b.y)/2-font*.35} fontSize={font} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={font*.18} fill="#3d512d" pointerEvents="none">E{i+1}</text>
      </g>})}
    </svg>
    <div className="perimeter-edge-buttons">{p.map((a,i)=><button type="button" key={i} aria-pressed={perimeterEdgeEnabled(s,i)} onClick={()=>toggle(i)} title={`${distance(a,p[(i+1)%p.length]).toFixed(3)} m`}>E{i+1}</button>)}</div>
    <div className="perimeter-edge-presets"><button type="button" className="text-button" onClick={()=>set(p.map(()=>true))}>All edges</button><button type="button" className="text-button" onClick={()=>set(p.map(()=>false))}>No framing boards</button></div>
  </section>
}
