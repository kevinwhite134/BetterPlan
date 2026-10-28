import { useState } from 'react'
import type { Plan, Settings } from './planner'

export default function InstallerPlanDownload({plan,settings}:{plan:Plan|null;settings:Settings}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const download=async()=>{
    if(!plan?.frame.geometryPass)return
    setBusy(true);setError('')
    try{
      const [{exportInstallerPdf},{loadBetterDeckLogo}]=await Promise.all([import('./installerPdf'),import('./pdfBrand')])
      const logo=await loadBetterDeckLogo()
      const bytes=await exportInstallerPdf(plan,settings,{logo})
      const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer],{type:'application/pdf'})),a=document.createElement('a')
      a.href=url;a.download='betterdeck-installer-plan.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch{setError('Could not create the PDF. Please try again.')}finally{setBusy(false)}
  }
  return <span className="installer-download" title={!plan?.frame.geometryPass?'Resolve support geometry to download the installer plan.':'Includes a personalised installation guide, matching frame illustration and relevant span-report pages.'}><button type="button" className="button secondary" disabled={busy||!plan?.frame.geometryPass} aria-busy={busy} onClick={download}>{busy?'Creating PDF…':'↓ Download plan PDF'}</button>{error?<span className="installer-download-error" role="alert">{error}</span>:null}</span>
}
