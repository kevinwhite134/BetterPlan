import OpenIcon from './OpenIcon'
import { useEffect, useRef, useState } from 'react'
import { Field } from './SettingControls'
import type { ControlLabelProps } from './SettingControls'
import type { Settings } from './planner'
import { appliedProduct, PRODUCT_KINDS, productError, productFromSettings, productMatches, productSummary, sameProduct, saveProduct } from './productLibrary'
import type { BoardProduct, LibraryProduct, ProductKind } from './productLibrary'
import './ProductLibrary.css'

export function ProductPicker({kind,settings,products,onApply,onManage,onSaveCurrent}:{kind:ProductKind;settings:Settings;products:LibraryProduct[];onApply:(p:LibraryProduct)=>void;onManage:()=>void;onSaveCurrent:()=>void}){
  const saved=products.filter(p=>p.kind===kind),snapshot=appliedProduct(settings,kind)
  const selected=saved.find(p=>productMatches(settings,p)&&(snapshot?sameProduct(snapshot,p):kind!=='frame'))
  const title=kind==='board'?'Decking board':kind==='pedestal'?'Saved pedestal':'Saved Alu-Joist'
  return <div className="product-picker"><Field label={title}><select value={selected?.id??''} onChange={e=>{const p=saved.find(p=>p.id===e.target.value);if(p)onApply(p)}}><option value="" disabled={!!selected}>{snapshot&&!selected?`${snapshot.name} · project copy`:'Current / custom product'}</option>{saved.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?` · ${p.sku}`:''}</option>)}</select></Field><div className="product-picker-actions"><button type="button" className="text-button" onClick={onSaveCurrent}>Save current {kind==='frame'?'Alu-Joist':kind}…</button><button type="button" className="text-button" onClick={onManage}>Products <OpenIcon/></button></div></div>
}
function Numeric({value,onChange,min,max,step=1,...props}:{value:number|undefined;onChange:(n:number|undefined)=>void;min?:number;max?:number;step?:number}&ControlLabelProps){
  return <input {...props} type="number" value={value!==undefined&&Number.isFinite(value)?value:''} min={min} max={max} step={step} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/>
}
function ProductIcon({product}:{product:LibraryProduct}){
  return <span className={`product-icon icon-${product.kind}`} aria-hidden="true" style={product.kind==='board'?{backgroundColor:product.board.colour}:undefined}>{product.kind==='pedestal'?<><i/><b/></>:product.kind==='frame'?<i/>:null}</span>
}
function BoardFields({product:p,onChange}:{product:BoardProduct;onChange:(p:BoardProduct)=>void}){
  const board=(patch:Partial<BoardProduct['board']>)=>onChange({...p,board:{...p.board,...patch}})
  return <><div className="field-grid"><Field label="Board width" unit="mm"><Numeric value={p.board.width} min={60} max={300} onChange={n=>board({width:n??NaN})}/></Field><Field label="Board thickness" unit="mm"><Numeric value={p.board.thickness} min={10} max={100} onChange={n=>board({thickness:n??NaN})}/></Field></div>
    <Field label="Stock length" unit="m"><Numeric value={p.board.stock} min={.3} max={15} step={.01} onChange={n=>board({stock:n??NaN})}/></Field>
    <div className="field-grid"><Field label="Side-to-side gap" unit="mm"><Numeric value={p.board.gap} min={1} max={15} step={.5} onChange={n=>board({gap:n??NaN})}/></Field><Field label="End-to-end gap" unit="mm"><Numeric value={p.board.endGap} min={1} max={20} step={.5} onChange={n=>board({endGap:n??NaN})}/></Field></div>
    <div className="field-grid"><Field label="Maximum joist centres" unit="mm"><Numeric value={p.joistCentres} min={100} max={1500} onChange={n=>onChange({...p,joistCentres:n??NaN})}/></Field><Field label="Required board-end bearing" unit="mm"><Numeric value={p.endBearing} min={1} max={80} onChange={n=>onChange({...p,endBearing:n??NaN})}/></Field></div>
    <div className="field-grid product-colour"><Field label="Board colour"><input type="color" value={p.board.colour} onChange={e=>board({colour:e.target.value})}/></Field><Field label="Colour name"><input value={p.board.colourName} onChange={e=>board({colourName:e.target.value})}/></Field></div></>
}

export default function ProductLibrary({products,settings,initial,onSave,onApply,onClose,onTransfer,storageUnavailable=false}:{products:LibraryProduct[];settings:Settings;initial?:LibraryProduct;onSave:(p:LibraryProduct[])=>void;onApply:(p:LibraryProduct)=>void;onClose:()=>void;onTransfer:()=>void;storageUnavailable?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null),nameInput=useRef<HTMLInputElement>(null)
  const [draft,setDraft]=useState<LibraryProduct|null>(initial??null),[filter,setFilter]=useState<ProductKind|'all'>('all'),[search,setSearch]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[removed,setRemoved]=useState<LibraryProduct|null>(null)
  useEffect(()=>{const element=dialog.current;element?.showModal();return ()=>element?.close()},[])
  const resetFeedback=()=>{setMessage('');setError('')}
  const change=(p:LibraryProduct)=>{setDraft(p);resetFeedback()}
  const add=(kind:ProductKind)=>{change({...productFromSettings(kind,settings,crypto.randomUUID()),name:''});nameInput.current?.focus()}
  const save=(apply=false)=>{
    if(!draft)return
    try{const next=saveProduct(products,draft),saved=next.find(p=>p.id===draft.id)!;onSave(next);setDraft(saved);setError('');setMessage('Product saved.');if(apply){onApply(saved);onClose()}}
    catch(e){setError(e instanceof Error?e.message:'Check the product details.');setMessage('')}
  }
  const shown=products.filter(p=>(filter==='all'||p.kind===filter)&&`${p.name} ${p.sku??''} ${p.supplier??''}`.toLowerCase().includes(search.toLowerCase()))
  return <dialog ref={dialog} className="product-library" aria-labelledby="product-library-title" onCancel={onClose}>
    <header className="library-header"><div><span className="eyebrow">YOUR CATALOGUE</span><h2 id="product-library-title">Products</h2><p>Save products once. Select them in any deck.</p></div><button type="button" className="button secondary" onClick={onClose}>Back to deck ×</button></header>
    <div className="library-layout"><section className="library-list" aria-label="Saved products"><div className="library-list-tools"><Field label="Search products"><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, code or supplier"/></Field><Field label="Product type filter"><select value={filter} onChange={e=>setFilter(e.target.value as ProductKind|'all')}><option value="all">All products · {products.length}</option>{PRODUCT_KINDS.map(k=><option key={k.value} value={k.value}>{k.label} · {products.filter(p=>p.kind===k.value).length}</option>)}</select></Field></div>
      <div className="library-cards">{shown.map(p=><article key={p.id} className={`product-card ${draft?.id===p.id?'editing':''}`}><div className="product-card-heading"><ProductIcon product={p}/><div><strong>{p.name}</strong><small>{p.sku||PRODUCT_KINDS.find(k=>k.value===p.kind)?.label}{p.supplier?` · ${p.supplier}`:''}</small></div></div><p>{productSummary(p)}</p><div className="product-card-bottom"><span>{p.unitPrice===undefined?'No saved price':`€${p.unitPrice.toFixed(2)} / ${p.kind==='pedestal'?'unit':p.kind==='board'?'board':'length'}`}</span><div><button type="button" className="text-button" aria-label={`Edit ${p.name}`} onClick={()=>{change(p);nameInput.current?.focus()}}>Edit</button><button type="button" className="button secondary" aria-label={`Use ${p.name}`} onClick={()=>{onApply(p);onClose()}}>Use product <OpenIcon/></button></div></div></article>)}{!shown.length?<div className="library-empty"><strong>{products.length?'No matching products':'Your products belong here'}</strong><p>{products.length?'Try another search or product type.':'Add a board, pedestal or Alu-Joist to get started.'}</p></div>:null}</div>
      <div className="library-portable"><button type="button" className="button secondary" onClick={onTransfer}>Import / export in Review →</button></div>
    </section><section className="library-editor" aria-label="Product details"><div className="library-add"><h3>Add a product</h3><div>{PRODUCT_KINDS.map(k=><button type="button" key={k.value} className="button secondary" onClick={()=>add(k.value)}>＋ {k.value==='board'?'Board':k.value==='pedestal'?'Pedestal':'Alu-Joist'}</button>)}</div></div>
      {draft?<form onSubmit={e=>{e.preventDefault();save()}} noValidate><div className="library-form-title"><h3>{products.some(p=>p.id===draft.id)?'Edit product':'New product'}</h3><span>{PRODUCT_KINDS.find(k=>k.value===draft.kind)?.label}</span></div>
        <Field label="Product name"><input ref={nameInput} value={draft.name} maxLength={160} placeholder={draft.kind==='board'?'e.g. BetterDeck Oak 156':draft.kind==='pedestal'?'e.g. VersiJack F4':'e.g. 35 mm Alu-Joist (K Series)'} onChange={e=>change({...draft,name:e.target.value})}/></Field>
        {draft.kind==='board'?<BoardFields product={draft} onChange={change}/>:draft.kind==='pedestal'?<><div className="field-grid"><Field label="Minimum adjustment" unit="mm"><Numeric value={draft.min} min={1} max={2000} onChange={n=>change({...draft,min:n??NaN})}/></Field><Field label="Maximum adjustment" unit="mm"><Numeric value={draft.max} min={1} max={3000} onChange={n=>change({...draft,max:n??NaN})}/></Field></div><Field label="Pedestal base diameter" unit="mm" hint="Full circular base diameter. Used for edge clearance and collision checks."><Numeric value={draft.diameter} min={50} max={600} onChange={n=>change({...draft,diameter:n??NaN})}/></Field><p className="field-note">Selecting a saved pedestal keeps this model as a manual override. Customer build-up height stays unchanged.</p></>:<><Field label="K Series profile height" unit="mm"><select value={draft.height} onChange={e=>change({...draft,height:Number(e.target.value) as 35|80,maxOverhang:undefined})}><option value="35">35 mm Alu-Joist</option><option value="80">80 mm Alu-Joist</option></select></Field><div className="field-grid"><Field label="Stock length" unit="m"><Numeric value={draft.stock} min={.5} max={15} step={.01} onChange={n=>change({...draft,stock:n??NaN})}/></Field><Field label="Bearing-face width" unit="mm"><Numeric value={draft.faceWidth} min={10} max={200} onChange={n=>change({...draft,faceWidth:n??NaN})}/></Field></div><Field label="Supplier overhang limit" unit="mm" hint="Optional. Leave blank if not confirmed by the supplier."><Numeric value={draft.maxOverhang} min={0} max={500} onChange={n=>change({...draft,maxOverhang:n})}/></Field><p className="field-note">Uses the K Series span report. Selection starts with this profile as a single joist frame; you can choose a bearer combination in Supports. Stock length and face width apply to all frame members.</p></>}
        <Field label={`Price per ${draft.kind==='pedestal'?'pedestal':draft.kind==='board'?'stock board':'stock length'}`} unit="€ ex VAT" hint="Optional. Used in materials and quotes when this product is selected."><Numeric value={draft.unitPrice} min={0} max={10000000} step={.01} onChange={n=>change({...draft,unitPrice:n})}/></Field>
        <details className="library-extra"><summary>Product code, supplier &amp; notes</summary><Field label="Product code / SKU"><input value={draft.sku??''} maxLength={100} onChange={e=>change({...draft,sku:e.target.value})}/></Field><Field label="Supplier"><input value={draft.supplier??''} maxLength={160} onChange={e=>change({...draft,supplier:e.target.value})}/></Field><Field label="Product notes"><textarea value={draft.notes??''} maxLength={2000} rows={3} onChange={e=>change({...draft,notes:e.target.value})}/></Field></details>
        <div className="library-form-actions"><button type="submit" className="button secondary">Save product</button><button type="button" className="button primary" onClick={()=>save(true)}>Save &amp; use <OpenIcon/></button></div>
        {products.some(p=>p.id===draft.id)?<div className="library-edit-actions"><button type="button" className="text-button" onClick={()=>change({...draft,id:crypto.randomUUID(),name:`${draft.name.slice(0,150)} copy`})}>Duplicate product</button><button type="button" className="text-button library-remove" onClick={()=>{setRemoved(products.find(p=>p.id===draft.id)!);onSave(products.filter(p=>p.id!==draft.id));setDraft(null);resetFeedback();setMessage('Product removed. Existing decks keep their product details.')}}>Remove product</button></div>:null}
      </form>:<div className="library-form-empty"><span aria-hidden="true">＋</span><h3>Choose a product type</h3><p>Or select Edit on a saved product.</p></div>}
      {error?<p className="library-feedback error" role="alert">{error}</p>:null}
      {message?<p className="library-feedback" role="status">{message}</p>:null}
      {removed?<button type="button" className="text-button" onClick={()=>{
        try{onSave(saveProduct(products,removed));setRemoved(null);setMessage('Product restored.')}
        catch(e){setError(e instanceof Error?e.message:'Could not restore product.')}
      }}>Undo removal</button>:null}
      {draft&&productError(draft)&&!error?<span className="library-unsaved">Complete the product details, then save.</span>:null}
    </section></div>
    <footer className="library-footer">{storageUnavailable?'Browser storage is unavailable. Export products to save your catalogue.':'Saved in this browser. Export products to back them up or move them to another computer.'} Saved edits apply when you next select the product.</footer>
  </dialog>
}

