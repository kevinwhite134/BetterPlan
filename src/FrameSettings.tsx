import { useMemo, useState } from 'react'
import { ChoiceField, Field } from './SettingControls'
import type { ControlLabelProps } from './SettingControls'
import { FRAME_NAMES, frameRule } from './planner'
import type { Frame, Plan, Settings } from './planner'
import { heightFit, heightNumber } from './heightFit'
import { pedestalSelectionMode, recommendFrames, SELECTION_OBJECTIVES, selectionObjective } from './frameRecommendation'
import type { FrameRecommendation, SelectionObjective } from './frameRecommendation'
import { CUSTOM_PEDESTAL, PEDESTAL_MODELS, PRODUCT_SOURCES } from './productNames'
import FrameEdgeControls from './FrameEdgeControls'
import { supportLayoutIsCurrent } from './supportLayoutState'
import { ProductPicker } from './ProductsPanel'
import { appliedProduct } from './productLibrary'
import type { LibraryProduct, ProductKind } from './productLibrary'

function NumberInput({value,onChange,min,max,step=1,...label}:{value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number}&ControlLabelProps){
  return <input {...label} type="number" value={Number.isFinite(value)?value:''} min={min} max={max} step={step} onChange={e=>onChange(e.target.value===''?NaN:+e.target.value)}/>
}

export default function FrameSettings({settings:s,onChange,plan,prices,products,onApplyProduct,onManageProducts,onSaveProduct,providedRecommendation,pending=false,onEditSupports}:{settings:Settings;onChange:(s:Settings)=>void;plan:Plan|null;prices:Record<string,string>;products:LibraryProduct[];onApplyProduct:(p:LibraryProduct)=>void;onManageProducts:()=>void;onSaveProduct:(kind:ProductKind)=>void;providedRecommendation?:FrameRecommendation;pending?:boolean;onEditSupports:()=>void}){
  const [advanced,setAdvanced]=useState(false)
  const set=(patch:Partial<Settings>)=>onChange({...s,...patch})
  const rule=frameRule(s.frame,s.load),fit=heightFit(s,rule)
  const automatic=s.frameSelection!=='manual',automaticPedestal=pedestalSelectionMode(s)==='auto',anyAutomatic=automatic||automaticPedestal
  const recommendation=useMemo(()=>providedRecommendation??recommendFrames(s,prices),[providedRecommendation,s,prices]),selectedOption=recommendation.options.find(o=>o.frame===s.frame)
  const activeRecommendation=automatic?recommendation.selected:selectedOption?.choice
  const pedestal=PEDESTAL_MODELS.find(p=>p.name===s.pedestalName&&p.min===s.pedestalMin&&p.max===s.pedestalMax&&p.diameter===(s.pedestalDiameter??150))
  const savedPedestal=appliedProduct(s,'pedestal')
  const changePedestal=(patch:Partial<Settings>)=>set({...patch,pedestalSelection:'manual',edgeDetailConfirmed:false,...(pedestal?{pedestalName:CUSTOM_PEDESTAL}:{})})
  const selectedFits=fit.fits,frameDepth=rule.joist+rule.bearer
  const confirmations=Number(!s.edgeDetailConfirmed)+Number(!s.confirmed)
  return <div className="frame-settings"><div className="section-heading"><h2>Alu-Joist settings</h2></div>
    {s.supportLayout?<div className="manual-support-note"><strong>{supportLayoutIsCurrent(s)?'Manual support layout':'Supports regenerated for this outline'}</strong><p>{supportLayoutIsCurrent(s)?'Edits are saved with this project. Choosing another frame or automatic selection regenerates its layout.':'Earlier support edits are kept with their original outline. The changed outline uses a new automatic layout.'}</p><button className="button secondary full" onClick={onEditSupports}>Edit or regenerate layout</button></div>:null}
    <div className="field-grid customer-height-inputs"><Field label="Average build-up height" unit="mm"><NumberInput value={s.height} onChange={height=>set({height})} min={30} max={2000}/></Field><Field label="Ground-level variation ±" unit="mm"><NumberInput value={s.variation} onChange={variation=>set({variation})} min={0} max={1000}/></Field></div>
    <p className="field-note customer-height-note">Ground to top of finished boards. The frame and pedestal are chosen to fit this height.</p>
    <ChoiceField<3|5> label="Design live load" value={s.load} options={[{value:3,label:'3 kN/m²'},{value:5,label:'5 kN/m²'}]} onChange={load=>set({load,confirmed:false,edgeDetailConfirmed:false})}/>
    
    
    <ChoiceField<SelectionObjective> label="Automatic selection priority" value={selectionObjective(s)} options={SELECTION_OBJECTIVES.map(o=>({value:o.id,label:o.label}))} onChange={selectionObjective=>set({selectionObjective})}/>
    <section className="main-frame-selection" aria-label="Alu-Joist selection">
      <ProductPicker kind="frame" settings={s} products={products} onApply={onApplyProduct} onManage={onManageProducts} onSaveCurrent={()=>onSaveProduct('frame')}/>
      <ChoiceField<'auto'|'manual'> label="Alu-Joist selection" ariaLabel="Frame selection mode" value={automatic?'auto':'manual'} options={[{value:'auto',label:'Automatic'},{value:'manual',label:'Choose manually'}]} onChange={frameSelection=>set({frameSelection,...(frameSelection==='auto'?{supportLayout:undefined}:{}),edgeDetailConfirmed:false})}/>
      <fieldset className="frame-options"><legend>Alu-Joist configuration</legend>{(Object.keys(FRAME_NAMES) as Frame[]).map(key=>{const r=frameRule(key,s.load),check=heightFit(s,r),option=recommendation.options.find(o=>o.frame===key),choice=option?.choice,required=choice?.required??check.required;return <label key={key} className={`frame-option ${s.frame===key?'active':''}`}><input type="radio" name="frame" checked={s.frame===key} onChange={()=>set({frame:key,frameSelection:'manual',...(key!==s.frame?{supportLayout:undefined}:{}),edgeDetailConfirmed:false,confirmed:false})}/><span><strong>{FRAME_NAMES[key]}</strong><small>{r.bearer?`${r.bearer} + ${r.joist}`:r.joist} mm · supports ≤ {r.support*1000} mm</small><small className="frame-height-range">{check.valid?required.min<0?'Insufficient pedestal clearance':`Pedestals ${heightNumber(required.min)}–${heightNumber(required.max)} mm`:'Check height inputs'}</small>{choice?<small>{choice.pedestals} pedestals · {choice.materialCostCents===null?'Prices incomplete':`€${(choice.materialCostCents/100).toFixed(2)} materials`}</small>:<small className="frame-option-reason">{pending?'Calculating support options…':option?.reason||check.reason}</small>}</span><em className={choice?'fit':'no-fit'}>{pending?'Calculating…':choice?'Available':'Unavailable'}</em></label>})}</fieldset>
      {automatic?<p className="automatic-selection-reason" role="status">{recommendation.reason}</p>:null}
    </section>
    <section className="main-pedestal-selection" aria-label="Pedestal product selection">
      <ProductPicker kind="pedestal" settings={s} products={products} onApply={onApplyProduct} onManage={onManageProducts} onSaveCurrent={()=>onSaveProduct('pedestal')}/>
      <ChoiceField<'auto'|'manual'> label="Pedestal selection" ariaLabel="Pedestal selection mode" value={automaticPedestal?'auto':'manual'} options={[{value:'auto',label:'Automatic',ariaLabel:'Automatically select pedestal'},{value:'manual',label:'Manual override',ariaLabel:'Choose pedestal manually'}]} onChange={pedestalSelection=>set({pedestalSelection,edgeDetailConfirmed:false})}/>
      <Field label="Pedestal model"><select value={savedPedestal?'saved-product':automaticPedestal&&!activeRecommendation&&!fit.fits?'':pedestal?.name??''} onChange={e=>{if(e.target.value==='saved-product')return;const p=PEDESTAL_MODELS.find(p=>p.name===e.target.value);if(!p)setAdvanced(true);set(p?{products:{...s.products,pedestal:undefined},pedestalSelection:'manual',pedestalName:p.name,pedestalMin:p.min,pedestalMax:p.max,pedestalDiameter:p.diameter,edgeDetailConfirmed:false}:{products:{...s.products,pedestal:undefined},pedestalSelection:'manual',pedestalName:CUSTOM_PEDESTAL,edgeDetailConfirmed:false})}}><option value="">{automaticPedestal&&!activeRecommendation&&!fit.fits?'No height-compatible model found':'Custom pedestal'}</option>{savedPedestal?<option value="saved-product">{savedPedestal.name} · {s.pedestalMin}–{s.pedestalMax} mm</option>:null}{PEDESTAL_MODELS.map(p=><option key={p.name} value={p.name}>{p.name} · {p.min}–{p.max} mm</option>)}</select></Field>
      {!pedestal&&!savedPedestal&&!automaticPedestal?<Field label="Custom pedestal name"><input value={s.pedestalName} onChange={e=>set({pedestalName:e.target.value,pedestalSelection:'manual'})}/></Field>:null}
    </section>
    <section className={`selected-frame-system ${selectedFits?'height-fits':'needs-review'}`} aria-label="Selected support system">
      <div className="selected-system-heading"><span>Height check</span><span className="support-mode-badge">{automatic&&automaticPedestal?'Automatic':'Manual override'}</span></div>
      <div className="support-height-summary" role="status" aria-live="polite"><strong>{pending?'Calculating support system…':selectedFits?'Fits customer height':fit.label}</strong>
        {selectedFits?<p>Required pedestal adjustment <b>{heightNumber(fit.required.min)}–{heightNumber(fit.required.max)} mm</b></p>:<p>{anyAutomatic?recommendation.error||selectedOption?.reason||fit.reason:fit.reason}</p>}
      </div>
      {fit.valid&&fit.average>=0?<><div className="height-stack" role="img" aria-label={`${s.board.thickness} mm decking plus ${frameDepth} mm frame leaves ${heightNumber(fit.average)} mm for the pedestal at the supplied ${heightNumber(s.height)} mm build-up height`}><span className="stack-board" style={{flex:s.board.thickness}}/><span className="stack-frame" style={{flex:frameDepth}}/><span className="stack-pedestal" style={{flex:fit.average}}/></div><div className="height-stack-key"><span><i className="stack-board"/>Boards <b>{s.board.thickness}</b></span><span><i className="stack-frame"/>Frame <b>{frameDepth}</b></span><span><i className="stack-pedestal"/>Pedestal <b>{heightNumber(fit.average)}</b></span></div><p className="height-stack-total">Total: {heightNumber(s.height)} mm · ground variation sets the adjustment range.</p></>:null}
      <p className="selected-product-range">Product adjustment: {heightNumber(s.pedestalMin)}–{heightNumber(s.pedestalMax)} mm</p>
      {!automatic||!automaticPedestal?<button type="button" className="text-button full" onClick={()=>set({frameSelection:'auto',pedestalSelection:'auto',supportLayout:undefined,edgeDetailConfirmed:false,confirmed:false})}>Use automatic selection</button>:null}
    </section>
    {plan?.frame.geometryPass&&plan.frame.supportArrangement==='same-depth-headers'?<p className="field-note">Same-depth headers connect the joists where individual pedestal rows cannot fit. Connection details require supplier confirmation.</p>:null}
    {plan&&!plan.frame.geometryPass?<div className="support-resolution" role="status"><strong>Support layout needs review</strong><p>{plan.frame.placementDiagnostics[0]?.detail??plan.frame.issues[0]}</p>{plan.frame.placementDiagnostics[0]?<p className="support-failed-member">Search member P-{plan.frame.placementDiagnostics[0].memberIndex+1} · {Math.round(Math.hypot(plan.frame.placementDiagnostics[0].member.b.x-plan.frame.placementDiagnostics[0].member.a.x,plan.frame.placementDiagnostics[0].member.b.y-plan.frame.placementDiagnostics[0].member.a.y)*1000)} mm. Inspect its edge-clear and blocked positions in the editor.</p>:null}<button type="button" className="button secondary full" onClick={onEditSupports}>Inspect positions &amp; setting options</button>{s.joints==='breaker'&&s.breakerMode==='manual'&&plan.boards.breakers.length>0&&plan.frame.issues.some(q=>q.includes('upper support faces overlap'))?<button type="button" className="button secondary full" onClick={()=>set({breakerMode:'balanced',breakerPositions:[],edgeDetailConfirmed:false,confirmed:false})}>Try automatic breaker layout</button>:null}</div>:null}

    <details id="support-advanced-settings" className="support-advanced" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}>
      <summary><span><strong>Advanced settings</strong><small>Stock, spacing, bearing &amp; clearance</small></span><span className="advanced-chevron" aria-hidden="true">⌄</span></summary>
      <section className="support-settings-group"><h3>Stock &amp; spacing</h3>
        <Field label="Joist centres" unit="mm"><NumberInput value={s.joistSpacing} onChange={joistSpacing=>set({joistSpacing,confirmed:false})} min={100} max={400}/></Field>
        <Field label="Saw kerf" unit="mm"><NumberInput value={s.kerf} onChange={kerf=>set({kerf})} min={0} max={10}/></Field>
        <Field label="Alu-Joist stock length" unit="m"><NumberInput value={s.frameStock} onChange={frameStock=>set({frameStock,edgeDetailConfirmed:false})} min={.5} max={15} step={.01}/></Field>
      </section>
      <section className="support-settings-group"><h3>Custom product dimensions</h3>
        <div className="field-grid"><Field label="Minimum adjustment" unit="mm"><NumberInput value={s.pedestalMin} onChange={pedestalMin=>changePedestal({pedestalMin})} min={1} max={2000}/></Field><Field label="Maximum adjustment" unit="mm"><NumberInput value={s.pedestalMax} onChange={pedestalMax=>changePedestal({pedestalMax})} min={1} max={3000}/></Field></div>
        <Field label="Pedestal base diameter" unit="mm"><NumberInput value={s.pedestalDiameter??150} onChange={pedestalDiameter=>changePedestal({pedestalDiameter})} min={50} max={600}/></Field>
      </section>
      <section className="support-settings-group"><h3>Bearing &amp; clearance</h3>
        <FrameEdgeControls settings={s} onChange={onChange}/>
        <div className="field-grid"><Field label="Frame top-face width" unit="mm"><NumberInput value={s.frameFaceWidth??35} onChange={frameFaceWidth=>set({frameFaceWidth,edgeDetailConfirmed:false})} min={10} max={200}/></Field><Field label="Required board-end bearing" unit="mm"><NumberInput value={s.boardEndBearing??10} onChange={boardEndBearing=>set({boardEndBearing,edgeDetailConfirmed:false})} min={1} max={80}/></Field></div>
        <Field label="Extra edge clearance" unit="mm"><NumberInput value={s.pedestalClearance??0} onChange={pedestalClearance=>set({pedestalClearance,edgeDetailConfirmed:false})} min={0} max={300}/></Field>
      </section>
      <section className="support-settings-group"><h3>Product checks</h3><ChoiceField label="Connection confirmation" value={!!s.edgeDetailConfirmed} options={[{value:false,label:'Not confirmed'},{value:true,label:'Confirmed'}]} onChange={edgeDetailConfirmed=>set({edgeDetailConfirmed})}/><ChoiceField label="Board compatibility confirmation" value={s.confirmed} options={[{value:false,label:'Not confirmed'},{value:true,label:'Confirmed'}]} onChange={confirmed=>set({confirmed})}/></section>
      <details className="product-reference"><summary>Product references</summary><p><a href={PRODUCT_SOURCES.frame} target="_blank" rel="noreferrer">BetterDeck Alu-Joist system ↗</a></p><p><a href={PRODUCT_SOURCES.pedestals} target="_blank" rel="noreferrer">BetterDeck pedestal catalogue ↗</a></p></details>
    </details>
    {confirmations?<p className="support-confirmation-note">{confirmations} product {confirmations===1?'check':'checks'} to confirm in Advanced settings.</p>:null}
  </div>
}
