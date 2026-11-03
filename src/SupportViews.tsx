import DeckView from './DeckView'
import SupportPlanThumbnail from './SupportPlanThumbnail'
import type { Plan, Settings } from './planner'

export default function SupportViews({plan,settings,measurements,onMeasurements}:{plan:Plan;settings:Settings;measurements:boolean;onMeasurements:(value:boolean)=>void}){
  return <div className="support-views"><DeckView plan={plan} settings={settings} layer="frame" showSupports measurements={measurements}/><nav className="support-view-rail" aria-label="Support drawing views"><span className="layer-rail-title">EXPLORE VIEWS</span>{[{measured:false,label:'Support layout',note:'Joists & pedestals'},{measured:true,label:'Measured plan',note:'Dimensions in mm'}].map(view=><button type="button" key={view.label} aria-label={view.label} className={`layer-card ${measurements===view.measured?'selected':''}`} aria-pressed={measurements===view.measured} onClick={()=>onMeasurements(view.measured)}><span className="layer-card-picture"><SupportPlanThumbnail plan={plan} settings={settings} measured={view.measured}/></span><span className="layer-card-label">{view.label}<span className="support-view-check" aria-hidden="true">{measurements===view.measured?'✓':''}</span></span><span className="support-view-note">{view.note}</span></button>)}</nav></div>
}
