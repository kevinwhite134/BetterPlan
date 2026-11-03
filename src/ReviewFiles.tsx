import { useState } from 'react'
import CsvExport from './CsvExportPanel'
import type { Plan, Settings } from './planner'

type Props={plan:Plan|null;settings:Settings;prices:Record<string,string>;pending:boolean;onDownload:(name:string,data:string|ArrayBuffer,type?:string)=>void;onImportProject:(file:File)=>Promise<string>;onExportProject:()=>void;onImportProducts:(file:File)=>Promise<string>;onExportProducts:()=>void;productsAvailable:boolean;invalid:boolean}
export default function ReviewFiles(p:Props){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const upload=async(file:File|undefined,products=false)=>{if(!file)return;setError('');setBusy(true);try{const message=products?await p.onImportProducts(file):await p.onImportProject(file);if(message)setError(message)}catch(e){setError(e instanceof Error?e.message:'Could not import the file.')}finally{setBusy(false)}}
  return <section className="review-files" aria-labelledby="review-files-title"><header><h2 id="review-files-title">Downloads &amp; files</h2><p>Your customer quotation, technical plan, cutting lists and project files in one place.</p></header>
    {p.plan&&!p.pending?<CsvExport plan={p.plan} settings={p.settings} prices={p.prices} onDownload={p.onDownload}/>:<p className="field-note">{p.pending?'Preparing your current design…':'Resolve the design settings to prepare PDF and CSV downloads. Project files are available below.'}</p>}
    <div className="review-file-transfers"><section><h3>Project file</h3><p>Export an editable backup. Importing a file creates a new project and keeps the current one.</p><div><button type="button" className="button secondary" disabled={p.invalid} onClick={p.onExportProject}>Export project JSON ↓</button><label className="button secondary import-button">Import project<input aria-label="Import project" type="file" accept=".json" disabled={busy||p.invalid} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></label></div></section>
    <section><h3>Product catalogue</h3><p>Share saved boards, pedestals and aluminium products between projects or devices.</p><div><button type="button" className="button secondary" disabled={!p.productsAvailable} onClick={p.onExportProducts}>Export products JSON ↓</button><label className="button secondary import-button">Import products<input aria-label="Import products" type="file" accept=".json" disabled={busy} onChange={e=>{void upload(e.target.files?.[0],true);e.target.value=''}}/></label></div></section></div>
    {error?<p className="error" role="alert">{error}</p>:null}
  </section>
}
