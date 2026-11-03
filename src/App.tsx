import ProjectLibrary from './ProjectHome'
import ReviewFiles from './ReviewFiles'
import { useProjectWorkspace } from './useProjectWorkspace'
import { parseProjectFile, projectFile } from './projectLibrary'
import type { SavedProject } from './projectLibrary'
import QuotationTotals from './QuotationTotals'
import { quotationEstimate } from './quotationEstimate'
import './DeckScene.css'
import QuotationSettings from './QuotationSettings'
import OpenIcon from './OpenIcon'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChoiceField, Field } from './SettingControls'
import { MAX_PROJECT_SIZE } from './projectLimits'
import { useDeckPlanning } from './useDeckPlanning'
import PerimeterEdgePicker from './PerimeterEdgePicker'
import { breakerBoardCount } from './breakerWidth'
import type { ControlLabelProps } from './SettingControls'
import DeckView from './DeckView'
import Brand from './Brand'
import FrameSettings from './FrameSettings'
import SupportEditor from './SupportEditor'
import ProductLibrary, { ProductPicker } from './ProductsPanel'
import { appliedProduct, applyProduct, importProductLibrary, mergeProductLibraries, PRODUCT_STORAGE, productFromSettings, productPriceKey, readProductLibrary } from './productLibrary'
import type { LibraryProduct, ProductKind } from './productLibrary'
import { materialEstimate } from './materialEstimate'
import { defaultPricing, PRICE_CHECKED, resolvedPricing } from './pricing'
import DeckSizeOptions from './DeckSizeOptions'
import OutlineEditor from './OutlineEditor'
import CutoutEditor from './CutoutEditor'
import { pictureFrameWidth } from './perimeterEdges'
import { cutoutPlacementError } from './shapeGeometry'
import type { CutoutTool } from './cutoutInteraction'
import BreakerDesigner from './BreakerDesigner'
import { BoardFit, SupportAudit, FinishSettings } from './FlowPanels'
import { DEFAULT_SETTINGS, bounds, normalize, polygonError, validateSettings } from './planner'
import type { BoardProfile, Plan, Point, Settings } from './planner'
import './App.css'

const STORAGE='betterdeck-project-v1',PROFILES='betterdeck-board-profiles-v1'
const TABS=[{id:'shape',label:'Shape',n:'01'},{id:'boards',label:'Boards',n:'02'},{id:'frame',label:'Supports',n:'03'},{id:'finish',label:'Finish',n:'04'},{id:'materials',label:'Review',n:'05'}] as const
type Tab=typeof TABS[number]['id']
function readSaved<T,>(key:string,fallback:T):T {try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}}
function initialSettings():Settings {const saved=readSaved<Settings|null>(STORAGE,null);try{if(saved&&!validateSettings(saved))return saved}catch{/* Ignore old/invalid projects. */}return DEFAULT_SETTINGS}
function Numeric({value,onChange,min,max,step=1,...controlProps}: {value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number}&ControlLabelProps) {return <input {...controlProps} type="number" value={Number.isNaN(value)?'':value} min={min} max={max} step={step} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value))}/>}
function download(name:string,content:string|ArrayBuffer,type:string) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function ColourHex({value,onChange,...controlProps}: {value:string;onChange:(value:string)=>void}&ControlLabelProps) {
  const [draft,setDraft]=useState(value)
  return <input {...controlProps} aria-label={controlProps['aria-label']??'Colour hex code'} value={draft} maxLength={7} spellCheck={false} onBlur={()=>setDraft(value)} onChange={e=>{setDraft(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))onChange(e.target.value)}}/>
}
function ShapeEditor({settings,onChange}: {settings:Settings;onChange:(p:Point[])=>void}) {
  const box=bounds(settings.polygon),[width,setWidth]=useState(box.width),[depth,setDepth]=useState(box.depth),[notchW,setNotchW]=useState(2),[notchD,setNotchD]=useState(1.5),[shape,setShape]=useState('rectangle')
  const [text,setText]=useState(settings.polygon.map(p=>`${p.x}, ${p.y}`).join('\n')),[error,setError]=useState('')
  const [previousPolygon,setPreviousPolygon]=useState(settings.polygon)
  if(previousPolygon!==settings.polygon){setPreviousPolygon(settings.polygon);setWidth(box.width);setDepth(box.depth);setText(settings.polygon.map(p=>`${p.x}, ${p.y}`).join('\n'))}
  const apply=(p:Point[])=>{const err=polygonError(p)||cutoutPlacementError(p,settings.cutouts??[],pictureFrameWidth(settings)+settings.board.gap/1000+.05);setError(err);if(!err){const q=normalize(p);onChange(q);setText(q.map(a=>`${a.x}, ${a.y}`).join('\n'))}}
  const preset=()=>{
    if(!Number.isFinite(width+depth)||width<.3||depth<.3){setError('Enter dimensions of at least 0.3 m.');return}
    if((shape==='l'||shape==='u')&&(!Number.isFinite(notchW+notchD)||notchW<=0||notchW>=width||notchD<=0||notchD>=depth)){setError('The cut-out must fit inside the deck dimensions.');return}
    if(shape==='rectangle')apply([{x:0,y:0},{x:width,y:0},{x:width,y:depth},{x:0,y:depth}])
    if(shape==='l')apply([{x:0,y:0},{x:width,y:0},{x:width,y:depth-notchD},{x:width-notchW,y:depth-notchD},{x:width-notchW,y:depth},{x:0,y:depth}])
    if(shape==='u'){const left=(width-notchW)/2;apply([{x:0,y:0},{x:width,y:0},{x:width,y:depth},{x:left+notchW,y:depth},{x:left+notchW,y:depth-notchD},{x:left,y:depth-notchD},{x:left,y:depth},{x:0,y:depth}])}
    if(shape==='angled')apply([{x:0,y:0},{x:width,y:0},{x:width*.8,y:depth},{x:0,y:depth}])
  }
  return <><div className="section-heading"><h2>Dimensions</h2></div>
    <Field label="Outline template"><select value={shape} onChange={e=>setShape(e.target.value)}><option value="rectangle">Rectangle</option><option value="l">L-shaped</option><option value="u">U-shaped</option><option value="angled">Angled edge</option></select></Field>
    <div className="field-grid"><Field label="Overall width" unit="m"><Numeric value={width} onChange={setWidth} min={.3} max={MAX_PROJECT_SIZE} step={.1}/></Field><Field label="Overall depth" unit="m"><Numeric value={depth} onChange={setDepth} min={.3} max={MAX_PROJECT_SIZE} step={.1}/></Field></div>
    {shape==='l'||shape==='u'?<div className="field-grid"><Field label="Cut-out width" unit="m"><Numeric value={notchW} onChange={setNotchW} min={.1} step={.1}/></Field><Field label="Cut-out depth" unit="m"><Numeric value={notchD} onChange={setNotchD} min={.1} step={.1}/></Field></div>:null}
    <button className="button primary full" onClick={preset}>Apply outline <span><OpenIcon/></span></button>
    <details className="custom-outline"><summary>Custom outline / edit corners</summary><p>One x, y pair per line in metres, in boundary order. Add internal openings in Cutouts below.</p><Field label="Corner coordinates"><textarea rows={8} value={text} onChange={e=>setText(e.target.value)} spellCheck={false}/></Field><button className="button secondary full" onClick={()=>apply(text.trim().split(/\n/).map(line=>{const a=line.trim().split(/[,\s]+/);return{x:a.length===2?Number(a[0]):NaN,y:a.length===2?Number(a[1]):NaN}}))}>Apply corners</button></details>
    {error?<p className="error" role="alert">{error}</p>:null}</>
}
function BoardEditor({settings:s,onChange,products,onApply,onManage,onSaveCurrent,onEditBreakers}: {settings:Settings;onChange:(s:Settings)=>void;products:LibraryProduct[];onApply:(p:LibraryProduct)=>void;onManage:()=>void;onSaveCurrent:()=>void;onEditBreakers:()=>void}) {
  const board=s.board
  const change=(patch:Partial<BoardProfile>)=>onChange({...s,board:{...board,...patch,id:'custom'},confirmed:false})
  return <><div className="section-heading"><h2>Board settings</h2></div>
    <ProductPicker kind="board" settings={s} products={products} onApply={onApply} onManage={onManage} onSaveCurrent={onSaveCurrent}/>
    <Field label="Decking stock length" unit="m"><select value={board.stock===3.66?'3.66':board.stock===4.88?'4.88':'custom'} onChange={e=>change({stock:e.target.value==='custom'?4:Number(e.target.value)})}><option value="3.66">3.66 m</option><option value="4.88">4.88 m</option><option value="custom">Custom length</option></select></Field>
    {board.stock!==3.66&&board.stock!==4.88?<Field label="Custom board length" unit="m"><Numeric value={board.stock} onChange={stock=>change({stock})} step={.01} min={.3} max={15}/></Field>:null}
    <details className="board-product-details"><summary>Board dimensions &amp; installation gaps · {board.width} × {board.thickness} mm</summary><div className="field-grid"><Field label="Board width" unit="mm"><Numeric value={board.width} onChange={width=>change({width})} min={60} max={300}/></Field><Field label="Board thickness" unit="mm"><Numeric value={board.thickness} onChange={thickness=>change({thickness})} min={10} max={100}/></Field><Field label="Side-to-side gap" unit="mm"><Numeric value={board.gap} onChange={gap=>change({gap})} min={1} max={15}/></Field><Field label="End-to-end gap" unit="mm"><Numeric value={board.endGap} onChange={endGap=>change({endGap})} min={1} max={20}/></Field></div></details>
    <ChoiceField<Settings['joints']> label="End-to-end joints" value={s.joints} options={[{value:'breaker',label:'Breaker boards'},{value:'butt',label:'Butt joints'}]} onChange={joints=>onChange({...s,joints})}/><p className="field-note">Breaker boards only join when stock is too short. All end joints require support.</p>
    <ChoiceField<Settings['direction']> label="Decking direction" ariaLabel="Board run" value={s.direction} options={[{value:'horizontal',label:'↔ Across width'},{value:'vertical',label:'↕ Across depth'}]} onChange={direction=>onChange({...s,direction})}/>
    <PerimeterEdgePicker settings={s} onChange={onChange}/>
    {s.joints==='breaker'?<><ChoiceField<'auto'|'single'|'double'> label="Breaker width" value={s.breakerWidth??'auto'} options={[{value:'auto',label:'Automatic'},{value:'single',label:'One board'},{value:'double',label:'Two boards'}]} onChange={breakerWidth=>onChange({...s,breakerWidth,edgeDetailConfirmed:false,confirmed:false})}/><p className="field-note">{breakerBoardCount(s)===2?'Two boards per breaker give the separate joist supports room for their pedestal bases.':'One board per breaker.'}</p></>:null}
    <button className="button secondary full breaker-edit-button" onClick={onEditBreakers}>Design breaker placement <span><OpenIcon/></span></button>
    <details className="board-product-details"><summary>Board colour</summary><div className="field-grid colour-fields"><Field label="Board colour"><input aria-label="Board colour" type="color" value={board.colour} onInput={e=>change({colour:e.currentTarget.value})} onChange={e=>change({colour:e.target.value})}/></Field><Field label="Colour name"><input value={board.colourName} onChange={e=>change({colourName:e.target.value})} placeholder="e.g. Coastal grey"/></Field></div><Field label="Colour hex code"><ColourHex key={board.colour} value={board.colour} onChange={colour=>change({colour})}/></Field></details>
</>
}
function Materials({plan,settings,prices,onPrices,highlight}: {highlight?:string|null;plan:Plan;settings:Settings;prices:Record<string,string>;onPrices:(p:Record<string,string>)=>void}) {
  const highlightRow=useRef<HTMLTableRowElement>(null)
  useEffect(()=>{if(highlight)highlightRow.current?.scrollIntoView({behavior:'smooth',block:'center'})},[highlight])
  const rates=resolvedPricing(settings,prices),defaults=defaultPricing(settings)
  const estimate=materialEstimate(plan,rates),unresolved=estimate.pending
  return <><div className="materials-heading"><div><h2>Materials &amp; pricing</h2></div></div>
    {unresolved?<p className="support-resolution" role="status">Resolve the support layout to complete quantities and totals.</p>:null}
    <div className="table-scroll"><table className="materials-table"><thead><tr><th>Component</th><th>Quantity</th><th>Unit rate (€ ex VAT)</th><th>Subtotal</th></tr></thead><tbody>{estimate.lines.map(m=><tr key={m.key} ref={highlight===m.key?highlightRow:undefined} data-material={m.key} className={highlight===m.key?'material-highlight':undefined}><td><strong>{m.name}</strong><small>{m.note}</small></td><td><b>{m.pending?'Pending':m.qty}</b><small>{m.unit}</small></td><td><div className="rate-input"><input aria-label={`Unit price for ${m.name}`} type="number" min="0" step=".01" placeholder="—" value={rates[m.key]??''} onChange={e=>onPrices({...prices,[m.key]:e.target.value===''?'':String(Math.max(0,+e.target.value))})}/>{Object.hasOwn(prices,m.key)?<button type="button" className="text-button" title="Restore default rate" aria-label={`Restore default rate for ${m.name}`} onClick={()=>onPrices(Object.fromEntries(Object.entries(prices).filter(([key])=>key!==m.key)))}>↺</button>:null}</div></td><td>{m.cents!==null?`€${(m.cents/100).toFixed(2)}`:'—'}</td></tr>)}</tbody></table></div>
    <QuotationTotals estimate={quotationEstimate(plan,settings,rates)}/><details className="material-notes"><summary>Ordering allowances</summary><p className="field-note">Fixings are positions only. Confirm trims, fascia, clips, screws, connections, bracing, substrate work and spares before ordering. No automatic wastage allowance is added.</p></details>
    <details className="pricing-notes"><summary>Pricing notes</summary><p>EUR excluding VAT · checked {PRICE_CHECKED}. Default rates follow the stock sizes and pedestal model. Your edited rates stay fixed until reset.</p><ul>{defaults.basis.filter(b=>estimate.lines.some(m=>m.key===b.key)).map(b=><li key={b.key}><strong>{b.name}</strong><p>{b.note} {b.source?<a href={b.source} target="_blank" rel="noreferrer">Price reference <OpenIcon/></a>:null}</p></li>)}</ul></details>
    <div className="cut-summary"><div><span>Stock boards</span><strong>{plan.boards.bars.length}</strong></div><div><span>Cutting blanks</span><strong>{plan.boards.pieces.length}</strong></div><div><span>Offcut + kerf</span><strong>{plan.offcut.toFixed(2)} <small>m</small></strong></div><div><span>Stock length loss</span><strong>{(plan.offcut/plan.purchased*100).toFixed(1)}<small>%</small></strong></div></div>
    <details><summary>Board cutting schedule · {settings.board.stock} m stock</summary><p className="field-note">Best-fit offcut reuse, allowing {settings.kerf} mm kerf between cuts. Blanks use the selected stock width. Crosscuts and angled or tapered edge cuts are scheduled. Straight rip cuts follow your board setting; finished widths are shown on each cut. Width offcuts are not reused. Length loss excludes rip-width offcuts, angled end-cut offcuts and intentional gaps. This heuristic does not guarantee a global optimum.</p><div className="cut-list">{plan.boards.bars.map((bar,i)=><div className="cut-row" key={i}><b>#{i+1}</b><div className="cut-bar">{bar.cuts.map((c,j)=><span key={j} style={{width:`${c.length/settings.board.stock*100}%`}} title={`Piece ${c.piece+1} · ${c.length.toFixed(3)} m × ${(plan.boards.pieces[c.piece].width*1000).toFixed(1)} mm finished width${plan.boards.pieces[c.piece].localRip?' · local rip / notch':''} · ${plan.boards.pieces[c.piece].breaker?'breaker':'deck board'}`}>{c.length.toFixed(2)}</span>)}</div><small>{bar.remaining.toFixed(3)} m left</small></div>)}</div></details></>
}
export default function App() {
  const [inputSettings,setSettings]=useState<Settings>(initialSettings)
  const [home,setHome]=useState(true)
  const [stage,setStage]=useState<Tab>('shape'),[highlightMaterial,setHighlightMaterial]=useState<string|null>(null)
  const canvas=useRef<HTMLElement>(null)
  useLayoutEffect(()=>{
    canvas.current?.scrollTo({top:0,left:0,behavior:'instant'})
    window.scrollTo({top:0,left:0,behavior:'instant'})
  },[stage])
  const [prices,setPrices]=useState<Record<string,string>>(()=>readSaved('betterdeck-prices-v1',{}))
  const planning=!home&&stage!=='shape'
  const computed=useDeckPlanning(inputSettings,prices,planning),settings=computed.settings
  const [boardEditing,setBoardEditing]=useState(false)
  const [cutoutPlacement,setCutoutPlacement]=useState<CutoutTool|null>(null),[selectedCutout,setSelectedCutout]=useState<string|null>(null)
  const [outlineDirty,setOutlineDirty]=useState(false),[breakerDirty,setBreakerDirty]=useState(false)
  const [products,setProducts]=useState<LibraryProduct[]>(()=>readProductLibrary(readSaved(PRODUCT_STORAGE,[]),readSaved(PROFILES,[])))
  const [library,setLibrary]=useState<{initial?:LibraryProduct}|null>(null)
  const [status,setStatus]=useState(''),[storageError,setStorageError]=useState(false),[showSupports,setShowSupports]=useState(true)
  const [measurements,setMeasurements]=useState(false),[editingSupports,setEditingSupports]=useState(false)
  const loadProject=(project:SavedProject)=>{
    setSettings(project.settings);setPrices(project.prices);setStage(project.stage);setHighlightMaterial(null)
    setCutoutPlacement(null);setSelectedCutout(null);setBoardEditing(false);setOutlineDirty(false);setBreakerDirty(false);setEditingSupports(false);setMeasurements(false);setStatus('')
  }
  const projectLibrary=useProjectWorkspace({settings,prices,stage},loadProject,!home)
  const currentProject=projectLibrary.workspace?.projects.find(p=>p.id===projectLibrary.workspace?.activeId)
  useEffect(()=>{document.title=home?'Projects | BetterPlan':`${currentProject?.name??'Deck'} | BetterPlan`},[home,currentProject?.name])


  const plan=computed.plan,schemaError=validateSettings(settings),step=TABS.findIndex(t=>t.id===stage),dirty=outlineDirty||breakerDirty
  useEffect(()=>{if(!projectLibrary.ready)return;let unavailable=false;try{if(!validateSettings(settings))localStorage.setItem(STORAGE,JSON.stringify(settings));localStorage.setItem(PRODUCT_STORAGE,JSON.stringify(products));localStorage.setItem(PROFILES,JSON.stringify(products.flatMap(p=>p.kind==='board'?[{...p.board,id:p.id,name:p.name}]:[])));localStorage.setItem('betterdeck-prices-v1',JSON.stringify(prices))}catch{unavailable=true}queueMicrotask(()=>setStorageError(unavailable))},[settings,products,prices,projectLibrary.ready])
  const navigate=(next:Tab)=>{if(dirty&&next!==stage){setStatus('Apply or revert the current drawing changes before continuing.');return}setStage(next);setCutoutPlacement(null);setSelectedCutout(null);setBoardEditing(false);setOutlineDirty(false);setBreakerDirty(false);setStatus('')}
  const openProducts=(kind?:ProductKind)=>{
    if(!kind){setLibrary({});return}
    const old=appliedProduct(settings,kind),draft=productFromSettings(kind,settings,old?.id??crypto.randomUUID()),rate=resolvedPricing(settings,prices)[productPriceKey(draft)]
    setLibrary({initial:{...old,...draft,...(rate!==undefined&&rate!==''?{unitPrice:Number(rate)}:{})}})
  }
  const selectProduct=(p:LibraryProduct,goToSettings=false)=>{const next=applyProduct(settings,prices,p);setSettings(next.settings);setPrices(next.prices);setStatus('');if(goToSettings)navigate(p.kind==='board'?'boards':'frame')}
  const importProducts=async(file:File)=>{try{if(file.size>25000000)throw new Error('Products file is too large.');const incoming=importProductLibrary(JSON.parse(await file.text()));setProducts(current=>mergeProductLibraries(current,incoming));return ''}catch(error){return error instanceof Error?error.message:'Could not import products.'}}
  const canLeave=()=>{
    if(dirty||editingSupports){setStatus('Apply or revert the current drawing changes before switching projects.');return false}
    if(schemaError){setStatus('Correct the current settings before switching projects.');return false}
    return true
  }
  const showProjects=()=>{if(!canLeave())return;projectLibrary.saveCurrent();setHome(true);setStatus('')}
  const openProject=(project:SavedProject)=>{if(!canLeave())return;projectLibrary.open(project);setHome(false)}
  const createProject=(name:string,section:string)=>{if(!canLeave())return;projectLibrary.create(name,section);setHome(false)}
  const exportProject=(project?:SavedProject)=>{
    if(!projectLibrary.workspace)return
    const selected=project??(currentProject?{...currentProject,settings,prices,stage}:null)
    if(!selected||validateSettings(selected.settings))return
    const filename=selected.name.replace(/[<>:"/\\|?*]/g,'-').slice(0,100)||'betterplan-project'
    download(`${filename}.betterplan.json`,JSON.stringify(projectFile(selected,projectLibrary.workspace.sections,products),null,2),'application/json');setStatus('')
  }
  const importProject=async(file:File)=>{
    if(!canLeave())return 'Apply or revert the current drawing and correct its settings before importing.'
    try{
      if(file.size>25000000)throw new Error('Project file is too large.')
      const imported=parseProjectFile(JSON.parse(await file.text()),file.name.replace(/(?:\.betterplan)?\.json$/i,''))
      const section=projectLibrary.addSection(imported.section)
      projectLibrary.create(imported.name,section,{settings:imported.settings,prices:imported.prices,stage:'shape'})
      setProducts(current=>mergeProductLibraries(current,imported.products));setHome(false);setStatus('');return ''
    }catch(error){return error instanceof Error?error.message:'Could not import project.'}
  }
  const exportProducts=()=>download('betterplan-products.json',JSON.stringify({version:1,type:'betterplan-products',products},null,2),'application/json')
  const saveCutouts=(next:Settings)=>{const error=validateSettings(next);if(error)return error;setSettings(next);setStatus('');return ''}
  const ready=!computed.pending&&!dirty&&(stage==='shape'?!polygonError(settings.polygon):!schemaError&&(stage!=='boards'||!!plan))
  const reviewCount=plan?Number(!plan.frame.geometryPass)+Number(!plan.heightFits)+Number(plan.boards.fit.needsAdjustment)+Number(!settings.confirmed)+Number(!settings.edgeDetailConfirmed)+Number(!!settings.skirting&&plan.skirtingGap<0):1
  const titles:Record<Tab,string>={shape:'Deck shape',boards:'Deck boards',frame:'Frame & supports',finish:'Finish',materials:'Review & export'}
  return <div className={`app-shell guided-app ${home?'projects-screen':'project-editor'}`}>
    <header className="topbar"><a className="brand" href="#" aria-label="BetterPlan projects" onClick={e=>{e.preventDefault();showProjects()}}><Brand/></a><div className="header-actions">
      {!home&&currentProject?<div className="editor-project-title"><button type="button" className="text-button" onClick={showProjects}>← Projects</button><input key={currentProject.id} className="editor-project-name" aria-label="Current project name" defaultValue={currentProject.name} maxLength={120} onBlur={e=>{projectLibrary.rename(currentProject.id,e.target.value);e.target.value=e.target.value.trim()||'Untitled project'}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></div>:null}
      <span className={`saved-indicator ${projectLibrary.saveState==='error'?'project-saving-error':''}`}><i/>{projectLibrary.saveState==='error'?'Not saved':!projectLibrary.ready?'Loading…':projectLibrary.saveState==='saving'?'Saving…':dirty?'Draft not applied':'Saved'}</span>
      <button type="button" className="button quiet products-button" onClick={()=>openProducts()} disabled={dirty||!projectLibrary.ready}>Products</button>
    </div></header>
    {projectLibrary.error?<p className="project-storage-error" role="alert">{projectLibrary.error}</p>:null}
    {!projectLibrary.ready?<main className="project-empty" role="status">Loading your projects…</main>:null}

    {library?<ProductLibrary storageUnavailable={storageError} products={products} settings={settings} initial={library.initial} onSave={setProducts} onApply={p=>{selectProduct(p,true);setHome(false)}} onClose={()=>setLibrary(null)} onImport={importProducts} onExport={exportProducts}/>:null}
    {projectLibrary.ready&&home&&projectLibrary.workspace?<ProjectLibrary workspace={projectLibrary.workspace} onOpen={openProject} onCreate={createProject} onRename={projectLibrary.rename} onMove={projectLibrary.move} onAddSection={projectLibrary.addSection} onRenameSection={projectLibrary.renameSection} onImport={importProject} onExport={exportProject}/>:null}
    {projectLibrary.ready&&!home?<>

    <div className="flow-title"><h1>{titles[stage]}</h1></div>
    <nav className="guided-steps" aria-label="Deck creation steps">{TABS.map((t,i)=><button key={t.id} onClick={()=>navigate(t.id)} className={`${i===step?'active':''} ${i<step?'visited':''}`} aria-current={i===step?'step':undefined}><span>{i<step?'✓':i+1}</span><b>{t.label}</b></button>)}</nav>
    {editingSupports&&plan?<SupportEditor plan={plan} settings={settings} onApply={setSettings} onClose={()=>setEditingSupports(false)}/>:null}
    <main className={`workspace flow-workspace stage-${stage}`}>
      <aside className="settings-panel">
        {stage==='shape'?<><ShapeEditor settings={settings} onChange={polygon=>{if(outlineDirty){setStatus('Apply or revert the canvas draft before replacing it with a template.');return}setSettings({...settings,polygon,perimeterEdges:polygon.length===settings.polygon.length?settings.perimeterEdges:undefined})}}/><CutoutEditor settings={settings} selected={selectedCutout} placement={cutoutPlacement} disabled={outlineDirty} onSelect={setSelectedCutout} onPlacement={setCutoutPlacement} onChange={next=>outlineDirty?'Apply or revert the outline draft before editing cutouts.':saveCutouts(next)}/></>:null}
        {stage==='boards'?<BoardEditor settings={settings} onChange={setSettings} products={products} onApply={selectProduct} onManage={()=>openProducts()} onSaveCurrent={()=>openProducts('board')} onEditBreakers={()=>setBoardEditing(true)}/>:null}
        {stage==='frame'?<FrameSettings settings={settings} onChange={setSettings} plan={plan} prices={prices} products={products} onApplyProduct={selectProduct} onManageProducts={()=>openProducts()} onSaveProduct={openProducts} providedRecommendation={computed.recommendation} pending={computed.pending} onEditSupports={()=>setEditingSupports(true)}/>:null}
        {stage==='finish'?<FinishSettings settings={settings} onChange={setSettings} plan={plan}/>:null}
        {stage==='materials'?<><QuotationSettings s={settings} onChange={setSettings}/><div className="section-heading"><h2>Project settings</h2></div><div className={`review-state ${reviewCount?'needs-review':''}`}><strong>{reviewCount?`${reviewCount} areas need review`:'Geometry checks complete'}</strong><p>Concept estimate. Confirm pedestal capacity, ground bearing and connections.</p></div></>:null}
        {stage==='boards'?<DeckSizeOptions key={JSON.stringify(settings)} settings={settings} disabled={dirty} onChange={next=>{setSettings(next);setStatus('')}}/>:null}
        {plan&&stage!=='shape'?<div className="stage-summary"><div><span>Footprint</span><strong>{plan.area.toFixed(2)} m²</strong></div><div><span>Stock decking boards</span><strong>{plan.boards.bars.length}</strong></div><div><span>Pedestals</span><strong>{plan.frame.layoutStatus==='ready'?plan.frame.pedestals.length:'Pending'}</strong></div></div>:null}
      </aside>
      <section ref={canvas} className="canvas-panel flow-canvas">
        <div className="stage-canvas-header"><div><strong>{stage==='shape'?'Outline editor':stage==='boards'?boardEditing?'Breaker design preview':'Board layout':stage==='frame'?'Framing & pedestal positions':stage==='finish'?'Finished deck preview':'Materials & cutting schedule'}</strong>{stage==='frame'?<span className="support-layout-source">{plan?.frame.manual?'Custom support layout':'Automatic support generation'}</span>:null}</div>{stage==='boards'&&boardEditing?<button className="button quiet" onClick={()=>{if(breakerDirty){setStatus('Apply or discard the breaker draft before returning to the board plan.');return}setBoardEditing(false)}}>← Board plan</button>:null}<div className="stage-view-actions">{stage==='frame'?<><button className="button secondary" disabled={!plan||computed.pending} onClick={()=>setEditingSupports(true)}>Edit supports ⛶</button><ChoiceField label="Add measurements" value={measurements} options={[{value:false,label:'Off'},{value:true,label:'On'}]} onChange={setMeasurements} compact/></>:null}{stage==='frame'||stage==='finish'?<ChoiceField label="Show pedestals" value={showSupports||stage==='frame'&&measurements} disabled={stage==='frame'&&measurements} options={[{value:false,label:'Hide'},{value:true,label:'Show'}]} onChange={setShowSupports} compact/>:null}</div></div>
        {stage==='shape'?<OutlineEditor key={JSON.stringify(settings.polygon)} polygon={settings.polygon} cutouts={settings.cutouts} selectedCutout={selectedCutout} onSelectCutout={setSelectedCutout} cutoutPlacement={cutoutPlacement} onCutoutPlacement={setCutoutPlacement} cutoutClearance={pictureFrameWidth(settings)+settings.board.gap/1000+.05} onCutoutsChange={cutouts=>saveCutouts({...settings,cutouts,edgeDetailConfirmed:false,confirmed:false})} onDirtyChange={setOutlineDirty} onApply={polygon=>{const invalid=cutoutPlacementError(polygon,settings.cutouts??[],pictureFrameWidth(settings)+settings.board.gap/1000+.05);if(invalid){setStatus(invalid);return}const x=Math.min(...polygon.map(p=>p.x)),y=Math.min(...polygon.map(p=>p.y));setOutlineDirty(false);setSettings({...settings,polygon:normalize(polygon),perimeterEdges:polygon.length===settings.polygon.length?settings.perimeterEdges:undefined,cutouts:settings.cutouts?.map(h=>({...h,polygon:h.polygon.map(p=>({x:p.x-x,y:p.y-y}))})),edgeDetailConfirmed:false});setStatus('')}}/>:null}
        {stage==='boards'&&boardEditing?<BreakerDesigner key={JSON.stringify([settings.polygon,settings.direction,settings.board,settings.joints,settings.breakerWidth,settings.frame,settings.pedestalDiameter])} settings={settings} plan={plan} onDirtyChange={setBreakerDirty} onApply={next=>{setSettings(next);setBreakerDirty(false);setStatus('')}}/>:null}
        {stage==='boards'&&!boardEditing&&plan?<><DeckView plan={plan} settings={settings} layer="boards" showSupports={showSupports}/><BoardFit plan={plan} settings={settings}/></>:null}
        {stage==='frame'&&plan?<><DeckView plan={plan} settings={settings} layer="frame" showSupports={showSupports} measurements={measurements}/>{measurements?<p className="measurement-key">All dimensions in mm · Support dimensions are centre-to-centre; identical parallel intervals are shown once · Exact support positions remain in the CSV.</p>:null}<SupportAudit plan={plan} settings={settings}/></>:null}
        {stage==='finish'&&plan?<DeckView plan={plan} settings={settings} layer="3d" showSupports={showSupports} prices={resolvedPricing(settings,prices)} onShowMaterial={key=>{setHighlightMaterial(key);setStage('materials')}}/>:null}
        {stage==='materials'?<div className="review-content"><ReviewFiles plan={plan} settings={settings} prices={resolvedPricing(settings,prices)} pending={computed.pending} onDownload={(filename,content,type)=>download(filename,content,type??'text/csv;charset=utf-8')}/>{plan?<><Materials plan={plan} settings={settings} prices={prices} onPrices={setPrices} highlight={highlightMaterial}/><details className="review-details"><summary>Review support checks</summary><SupportAudit plan={plan} settings={settings}/></details><details className="review-details"><summary>Notes to resolve before ordering</summary><ul>{plan.warnings.map(w=><li key={w}>{w}</li>)}</ul></details></>:null}</div>:null}
        {computed.pending?<div className="deck-view preview-unavailable" role="status"><div className={stage==='finish'?'viewer-stage':'plan-stage'}><p className="preview-placeholder">Calculating the larger project… You can keep editing settings.</p></div></div>:null}
        {!plan&&computed.error?(stage==='frame'||stage==='finish'||stage==='boards'&&!boardEditing)?<div className="deck-view preview-unavailable"><div className={stage==='finish'?'viewer-stage':'plan-stage'}><p className="preview-placeholder">Enter valid values to update the preview.</p></div><p className="designer-error" role="alert">{computed.error} Your outline is retained.</p></div>:<p className="designer-error editor-layout-alert" role="alert">{computed.error} Your outline is retained.</p>:null}
      </section>
    </main>
    <div className="flow-navigation"><button className="button secondary" disabled={step===0||dirty} onClick={()=>navigate(TABS[step-1].id)}>← Back</button><span>{dirty?'Apply or revert the current draft to continue.':stage==='materials'?'':`Next: ${TABS[step+1]?.label}`}</span>{step<4?<button className="button primary" disabled={!ready} onClick={()=>navigate(TABS[step+1].id)}>Continue to {TABS[step+1].label.toLowerCase()} →</button>:<button className="button primary" onClick={showProjects} disabled={!!schemaError}>Back to projects →</button>}</div>
    </>:null}
        {status||storageError?<p className="inline-feedback" role="alert">{storageError?'Browser storage is unavailable. Export the project to save your work.':status}</p>:null}
    <footer className="site-footer"><span>BetterPlan</span><span>Concept design · supplier and site checks required</span></footer>
  </div>
}


