import { Field } from './SettingControls'
import type { Settings } from './planner'

export default function FrameEdgeControls({settings:s,onChange}:{settings:Settings;onChange:(s:Settings)=>void}){
  const set=(patch:Partial<Settings>)=>onChange({...s,...patch,edgeDetailConfirmed:false})
  return <section className="frame-edge-controls">
    <Field label="Frame recess for fascia" unit="mm" hint={`Defaults to the ${s.board.thickness} mm board thickness.`} help={{description:'The physical frame ends stay inside the deck outline so matching fascia can finish flush. Picture-frame boards are chosen in Boards.',affects:'Actual frame ends and measured end projections. This is separate from pedestal base clearance.'}}><input type="number" min="0" max="500" step="1" value={s.fasciaClearance??s.board.thickness} onChange={e=>set({fasciaClearance:e.target.value===''?undefined:+e.target.value})}/></Field>

  </section>
}
