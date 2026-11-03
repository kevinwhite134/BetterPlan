import DeckView from './DeckView'
import { LayerThumbnail } from './DeckLayerThumbnail'
import type { Plan, Settings } from './planner'

export default function SupportViews({plan,settings,measurements,onMeasurements}:{plan:Plan;settings:Settings;measurements:boolean;onMeasurements:(value:boolean)=>void}){
  return <div className="support-views"><DeckView plan={plan} settings={settings} layer="frame" showSupports measurements={measurements}/><nav className="support-view-rail" aria-label="Support drawing views"><span className="layer-rail-title">EXPLORE VIEWS</span>{[{measured:false,label:'Support layout'},{measured:true,label:'Measured plan'}].map(view=><button type="button" key={view.label} className={`layer-card ${measurements===view.measured?'selected':''}`} aria-pressed={measurements===view.measured} onClick={()=>onMeasurements(view.measured)}><span className="layer-card-picture"><LayerThumbnail plan={plan} settings={settings} exposure="joists"/>{view.measured?<span className="support-measure-preview" aria-hidden="true">↔ mm ↔</span>:null}</span><span className="layer-card-label">{view.label}</span></button>)}</nav></div>
}
