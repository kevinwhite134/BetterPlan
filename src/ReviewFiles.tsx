import CsvExport from './CsvExportPanel'
import type { Plan, Settings } from './planner'

type Props={plan:Plan|null;settings:Settings;prices:Record<string,string>;pending:boolean;onDownload:(name:string,data:string|ArrayBuffer,type?:string)=>void}
export default function ReviewFiles(p:Props){
  return <section className="review-files" id="project-downloads" aria-labelledby="review-files-title"><header><h2 id="review-files-title">Downloads &amp; reports</h2><p>Download your customer quotation, technical plan and cutting lists.</p></header>
    {p.plan&&!p.pending?<CsvExport plan={p.plan} settings={p.settings} prices={p.prices} onDownload={p.onDownload}/>:<p className="field-note">{p.pending?'Preparing your current design…':'Resolve the design settings to prepare PDF and CSV downloads.'}</p>}
  </section>
}
