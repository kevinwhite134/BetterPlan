import { customerPlanSvg } from './customerPlan'
import { ChoiceField, Field } from './SettingControls'
import { useMemo, useState } from 'react'
import Brand from './Brand'
import { buildCsvReport, CSV_REPORTS, serializeCsv } from './csvExport'
import type { CsvKind } from './csvExport'
import type { Plan, Settings } from './planner'
import { materialEstimate } from './materialEstimate'
import { deckPreviewPng, deckPreviewSvg, deckPreviewUrl } from './deckPreview'

export default function CsvExport({plan,settings,prices,onDownload}:{plan:Plan;settings:Settings;prices:Record<string,string>;onDownload:(filename:string,content:string|ArrayBuffer,type?:string)=>void}){
  const [kind,setKind]=useState<CsvKind>('materials'),[delimiter,setDelimiter]=useState<','|';'>(',')
  const [includeInstaller,setIncludeInstaller]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const report=useMemo(()=>buildCsvReport(kind,plan,settings,prices),[kind,plan,settings,prices])
  const deckSvg=useMemo(()=>deckPreviewSvg(plan,settings),[plan,settings])
  const selected=CSV_REPORTS.find(q=>q.id===kind)!
  const estimate=materialEstimate(plan,prices),pricing=kind==='quote'||kind==='materials'
  const columns=pricing?['Component','Quantity','Unit','Unit rate EUR','Line total EUR','Status']:report.headers
  const indices=columns.map(q=>report.headers.indexOf(q)),previewRows=(pricing?report.rows.filter(q=>q[0]==='Item'):report.rows).slice(0,8)
  const currency=new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}),rateCurrency=new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:4}),number=new Intl.NumberFormat('en-IE',{maximumFractionDigits:2})
  const excel=async()=>{setBusy(true);setError('');try{const [{exportDeckWorkbook},preview]=await Promise.all([import('./workbookExport'),deckPreviewPng(deckSvg)]);const data=await exportDeckWorkbook(plan,settings,prices,preview);onDownload('betterplan-deck-pack.xlsx',data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}catch{setError('The Excel workbook could not be created. Try again, or download the CSV.')}finally{setBusy(false)}}
  const quotation=async()=>{setBusy(true);setError('');try{const [{exportQuotationPdf},{loadBetterDeckLogo},preview]=await Promise.all([import('./quotationPdf'),import('./pdfBrand'),deckPreviewPng(deckSvg)]);const logo=await loadBetterDeckLogo(),image=new Uint8Array(await (await fetch(preview)).arrayBuffer()),data=await exportQuotationPdf(plan,settings,prices,{logo,preview:image});onDownload('betterdeck-quotation.pdf',Uint8Array.from(data).buffer,'application/pdf')}catch{setError('The quotation PDF could not be created. Please try again.')}finally{setBusy(false)}}
  const customerPack=async()=>{setBusy(true);setError('');try{const [{exportCustomerQuotePack},{loadBetterDeckLogo},render,layout]=await Promise.all([import('./customerQuotePack'),import('./pdfBrand'),deckPreviewPng(deckSvg),deckPreviewPng(customerPlanSvg(plan,settings),1440,1000)]);const [logo,preview,planPreview]=await Promise.all([loadBetterDeckLogo(),fetch(render).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)),fetch(layout).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b))]);const bytes=await exportCustomerQuotePack(plan,settings,prices,{logo,preview,planPreview,includeInstaller:includeInstaller&&plan.frame.geometryPass});onDownload('betterdeck-customer-quotation.pdf',Uint8Array.from(bytes).buffer,'application/pdf')}catch{setError('The customer quotation pack could not be created. Please try again.')}finally{setBusy(false)}}
  return <section className="csv-export" aria-labelledby="csv-export-title">
    <div className="csv-export-heading"><div><h3 id="csv-export-title">Reports</h3></div><span className="export-file-tag">PDF + XLSX + CSV</span></div>
    <div className="csv-export-controls">
      <Field label="Report preview"><select value={kind} onChange={e=>setKind(e.target.value as CsvKind)}>{CSV_REPORTS.map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select></Field>
      <button className="button primary" disabled={busy} onClick={customerPack}>↓ Customer PDF pack</button>
      <button className="button secondary" aria-busy={busy} disabled={busy} onClick={excel}>{busy?'Creating files…':'↓ Excel pack'}</button>
      <button className="button secondary" disabled={busy} onClick={quotation}>↓ Quotation PDF</button>
      <button className="button secondary" disabled={!!report.unavailable||!report.rows.length} onClick={()=>onDownload(`betterplan-${kind}.csv`,serializeCsv(report,delimiter))}>↓ CSV report</button>
    </div>
    <label className="pack-installer-option"><input type="checkbox" checked={includeInstaller} disabled={!plan.frame.geometryPass} onChange={e=>setIncludeInstaller(e.target.checked)}/>Include installer setting-out schedules in the customer pack</label>
    {error?<p className="csv-unavailable" role="alert">{error}</p>:null}
    
    {report.unavailable?<p className="csv-unavailable" role="status">{report.unavailable}</p>:<details className="csv-preview" open><summary>Document preview <span>{pricing?previewRows.length:report.rows.length} {pricing?'items':'rows'}</span></summary><div className="export-paper">
      <div className="paper-brand"><Brand name="BetterDeck"/><span>{kind==='quote'?'MATERIALS QUOTE':'DECK PLANNING'}</span></div>
      <div className={`paper-header ${pricing?'has-deck-render':''}`}>
        <div className="paper-header-copy"><div className="paper-title"><h4>{selected.label}</h4><span>{plan.area.toFixed(2)} <small>m²</small></span></div>
        <p className="paper-context">{settings.board.colourName} <span>·</span> {settings.board.stock} m stock <span>·</span> {settings.board.width} mm boards</p></div>
        {pricing?<img className="paper-deck-render" src={deckPreviewUrl(deckSvg)} alt={`3D preview of the current deck in ${settings.board.colourName}`}/>:null}
      </div>
      <div className="table-scroll"><table><thead><tr>{columns.map(header=><th key={header}>{header.replace('Line total EUR','Amount').replace('Unit rate EUR','Unit rate')}</th>)}</tr></thead><tbody>{previewRows.map((row,i)=><tr key={i}>{indices.map((index,j)=>{const cell=row[index],money=columns[j].includes('EUR'),status=columns[j]==='Status';return <td key={j} className={`${typeof cell==='number'?'paper-numeric':''} ${status?'paper-status':''}`} title={cell===null?'':String(cell)}>{cell===null?<span className="paper-empty">—</span>:typeof cell==='number'?money?(columns[j].startsWith('Unit rate')?rateCurrency:currency).format(cell):number.format(cell):cell}</td>})}</tr>)}</tbody></table></div>
      {pricing?<div className="paper-total"><div><span>{estimate.complete?'Entered materials total':'Known priced subtotal'}</span><small>{estimate.priced} of {estimate.lines.length} unit rates entered</small></div><strong>{estimate.priced?currency.format(estimate.subtotalCents/100):'Rates not entered'}</strong></div>:report.rows.length>8?<p className="paper-more">Showing 8 of {report.rows.length} rows. The download includes the complete schedule.</p>:null}
      <p className="paper-scope">{pricing?'Materials only. Labour, delivery, VAT and unlisted hardware are excluded.':'All sizes and positions in millimetres. Refer to the project details for coordinate conventions.'} Provisional quantities. Applied fascia recess: {Math.round(plan.frame.fasciaClearance*1000)} mm. Maximum metal end projection: {Math.round(Math.max(0,...plan.frame.projections.map(q=>q.distance))*1000)} mm; supplier limits and connections require confirmation.</p>
    </div></details>}
    <div className="csv-format-note"><p>Excel: all reports, formatted. CSV: selected report.</p><ChoiceField<','|';'> label="CSV separator" ariaLabel="Column separator" value={delimiter} options={[{value:',',label:'Comma (,)'},{value:';',label:'Semicolon (;)'}]} onChange={setDelimiter}/></div>
  </section>
}
