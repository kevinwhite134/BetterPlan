import DeckView from './DeckView'
import type { Plan, Settings } from './planner'

function ViewIcon({dimensions}:{dimensions:boolean}){
  return <svg viewBox="0 0 64 48" className="support-view-icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{dimensions?<><rect x="22" y="18" width="30" height="23" rx="2"/><path d="M22 7v6m30-6v6M22 10h30m-26-3-4 3 4 3m22-6 4 3-4 3M9 18h6m-6 23h6M12 18v23m-3-19 3-4 3 4m-6 15 3 4 3-4"/></>:<><rect x="12" y="8" width="40" height="32" rx="2"/><path d="M22 8v32M32 8v32M42 8v32M12 18h40M12 30h40"/><circle cx="12" cy="8" r="2.5" fill="#f6f8ef"/><circle cx="52" cy="8" r="2.5" fill="#f6f8ef"/><circle cx="12" cy="40" r="2.5" fill="#f6f8ef"/><circle cx="52" cy="40" r="2.5" fill="#f6f8ef"/></>}</svg>
}

export default function SupportViews({plan,settings,measurements,onMeasurements}:{plan:Plan;settings:Settings;measurements:boolean;onMeasurements:(value:boolean)=>void}){
  return <div className="support-views"><DeckView plan={plan} settings={settings} layer="frame" showSupports measurements={measurements}/><nav className="support-view-rail" aria-label="Support drawing views">{[{measured:false,label:'Layout'},{measured:true,label:'Dimensions'}].map(view=><button type="button" key={view.label} aria-label={view.label} className={`layer-card ${measurements===view.measured?'selected':''}`} aria-pressed={measurements===view.measured} onClick={()=>onMeasurements(view.measured)}><span className="layer-card-picture"><ViewIcon dimensions={view.measured}/></span><span className="layer-card-label">{view.label}</span></button>)}</nav></div>
}
