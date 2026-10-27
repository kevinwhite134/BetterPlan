import type { Plan, Settings } from './planner'
import { ChoiceField, Field } from './SettingControls'
import { PRODUCT_SOURCES } from './productNames'

export function BoardFit({plan,settings:s}: {plan:Plan;settings:Settings}){
  const fit=plan.boards.fit
  return <div className={`fit-card ${fit.needsAdjustment?'needs-review':''}`}>
    <div><h3>{fit.needsAdjustment?'Board fit needs adjustment':fit.rippedRows.length||fit.localRipPieces?'Boards fit with cuts':'Whole board rows fit'}</h3><p>{fit.rows} rows · {s.board.width} mm perimeter board</p></div>
    {fit.edgeGap>.01?<><p><b>{(fit.edgeGap*1000).toFixed(1)} mm</b> extra clearance remains at each outside infill row while straight ripping is disabled.</p><p>Allow ripped boards, or use “Board smaller” / “Board bigger” to preview a whole-board dimension change.</p></>:null}
    {fit.rippedRows.length>0?<p>{fit.rippedRows.length===1?'One edge row is':'Two edge rows are'} ripped to <b>{(fit.rippedRows[0]*1000).toFixed(1)} mm</b> finished width.</p>:null}
    {fit.taperedPieces>0?<p>{fit.taperedPieces} angled edge cuts.</p>:null}
    {fit.localRipPieces>0?<p>{fit.localRipPieces} {fit.localRipPieces===1?'piece':'pieces'} cut around steps and recesses.</p>:null}
    {fit.localGap?<p><b>Local corner fit:</b> an internal edge interrupts a board row. Enable ripped boards to fill this area, or adjust that corner.</p>:null}
  </div>
}
export function SupportAudit({plan,settings:s}: {plan:Plan;settings:Settings}){
  return <section className="support-audit"><div className="audit-heading"><div><h3>{plan.frame.geometryPass?'Support geometry checks pass':'Support layout needs correction'}</h3></div><span className={`audit-badge ${plan.frame.geometryPass?'pass':'fail'}`}>{plan.frame.checks.filter(c=>c.ok).length}/{plan.frame.checks.length} checks</span></div>
    <p className="field-note">Report case {plan.frame.rule.sheet} · {s.load} kN/m² · Alu-Joist K Series · composite decking. Perimeter framing and connections require supplier design.</p>
    <details className="audit-source"><summary>Product &amp; span-report references</summary><p>BetterDeck Aluminium Profiles Design, contract 1513-1, revision 2 (15 June 2021). PDF pages {plan.frame.rule.pages}. Joists ≤ 400 mm centres at 90° to boards; primary support span ≤ {plan.frame.rule.support*1000} mm{plan.frame.rule.bearer?`; secondary span ≤ ${plan.frame.rule.bearerSpacing*1000} mm`:''}.</p><p><a href={PRODUCT_SOURCES.frame} target="_blank" rel="noreferrer">BetterDeck Alu-Joist Decking System ↗</a></p></details>
    {plan.frame.layoutStatus==='unbuildable'?<p className="support-resolution" role="status">{plan.frame.issues[0]} The amber draft is for inspection only; frame and pedestal quantities stay pending.</p>:null}
    <details className="audit-results" open={!plan.frame.geometryPass}><summary>Geometry checks</summary><div className="audit-checks">{plan.frame.checks.map(c=><div key={c.name} className={c.ok?'pass':'fail'}><span>{c.ok?'✓':'!'}</span><div><strong>{c.name}</strong><p>{c.detail}</p></div></div>)}</div></details>
    <details className="audit-product-note"><summary>Calculated projections &amp; product checks · provisional</summary>
      <p>Applied fascia recess: {Math.round(plan.frame.fasciaClearance*1000)} mm minimum. Pedestal edge clearance: {Math.round(plan.frame.baseInset*1000)} mm.</p>
      <p>Largest primary projection: {Math.round(Math.max(0,...plan.frame.projections.filter(q=>q.tier==='primary').map(q=>q.distance))*1000)} mm. Largest secondary/blocking projection: {Math.round(Math.max(0,...plan.frame.projections.filter(q=>q.tier!=='primary').map(q=>q.distance))*1000)} mm.</p>
      {plan.frame.verification.notes.map(note=><p key={note}>{note}</p>)}
      <p>The download includes each calculated projection and its support position.</p>
    </details>
  </section>
}
export function FinishSettings({settings:s,onChange,plan}: {settings:Settings;onChange:(s:Settings)=>void;plan:Plan|null}){
  return <><div className="section-heading"><h2>Colour &amp; fascia</h2></div>
    <Field label="Deck colour"><input aria-label="Deck finish colour" type="color" value={s.board.colour} onInput={e=>onChange({...s,board:{...s.board,colour:e.currentTarget.value,id:'custom'}})} onChange={e=>onChange({...s,board:{...s.board,colour:e.target.value,id:'custom'}})}/></Field>
    <Field label="Finish name"><input value={s.board.colourName} onChange={e=>onChange({...s,board:{...s.board,colourName:e.target.value,id:'custom'}})}/></Field>
    <ChoiceField label="Perimeter fascia" value={!!s.skirting} options={[{value:false,label:'Without fascia'},{value:true,label:'With fascia'}]} onChange={skirting=>onChange({...s,skirting})}/>
    {s.skirting?<><Field label="Fascia board height" unit="mm" hint="Actual fascia height, without ripping."><input type="number" min="25" max="1000" value={Number.isFinite(s.skirtingHeight??200)?s.skirtingHeight??200:''} onChange={e=>onChange({...s,skirtingHeight:e.target.value===''?NaN:+e.target.value})}/></Field>{plan?<div className={`height-result ${plan.skirtingGap<0?'mismatch':''}`}><span>Clearance below fascia</span><strong>{Math.round(plan.skirtingGap)} <small>mm</small></strong><span>{plan.skirtingGap<0?'Product extends below ground: choose a shorter height.':'Based on average build-up height; check ground variation on site.'}</span></div>:null}<p className="field-note">Uses board stock length and finish. Check fixings, ventilation and ground levels.</p></>:null}
    </>
}
