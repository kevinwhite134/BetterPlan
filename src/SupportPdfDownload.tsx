import { useState } from 'react'
import type { Plan, Settings } from './planner'

export default function SupportPdfDownload({plan,settings}:{plan:Plan|null;settings:Settings}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const download=async()=>{
    if(!plan?.frame.geometryPass)return
    setBusy(true);setError('')
    try{
      const [{exportSupportPdf},{loadBetterDeckLogo}]=await Promise.all([import('./supportPdf'),import('./pdfBrand')])
      const bytes=await exportSupportPdf(plan,settings,{logo:await loadBetterDeckLogo()})
      const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer],{type:'application/pdf'})),a=document.createElement('a')
      a.href=url;a.download='betterdeck-3d-supports.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch{setError('Could not create the 3D support PDF. Please try again.')}finally{setBusy(false)}
  }
  return <span className="installer-download"><button type="button" className="button secondary" disabled={busy||!plan?.frame.geometryPass} aria-busy={busy} title={!plan?.frame.geometryPass?'Resolve support geometry to export the support frame.':undefined} onClick={download}>{busy?'Creating PDF…':'↓ Download 3D support PDF'}</button>{error?<span role="alert">{error}</span>:null}</span>
}
