import type { Frame, Settings } from './planner.ts'
import { PDFDocument } from 'pdf-lib'

export type InstallerReferenceAssets={spanReport:Uint8Array;illustration?:Uint8Array}
// One-based PDF pages, not the report's printed Sheet No. (which is one lower).
// All selected cases are K Series with composite decking; no paving/R Series.
const CASE_PAGES:Record<Frame,Record<3|5,number[]>>={
  small:{3:[5,7,56,57,58],5:[5,7,59,60,61]},
  big:{3:[5,8,9,10],5:[5,11,12,13]},
  'small-small':{3:[5,7,62,63,64],5:[5,7,65,66,67]},
  'big-small':{3:[5,14,15,16],5:[5,17,18,19]},
}
export function installerReferenceSelection(s:Pick<Settings,'frame'|'load'>){
  return {pages:[...CASE_PAGES[s.frame][s.load]],illustration:s.frame==='small-small'?'35-bearer-35-joist.png':s.frame==='big-small'?'80-bearer-35-joist.png':null}
}
export function calculationReferenceSelection(s:Pick<Settings,'frame'|'load'>){
  return CASE_PAGES[s.frame][s.load].slice(-3)
}
export async function loadSpanReport():Promise<Uint8Array>{
  const response=await fetch('/installer-reference/alu-joist-span-report.pdf')
  if(!response.ok)throw new Error('The span report could not be loaded. Please retry the PDF download.')
  return new Uint8Array(await response.arrayBuffer())
}
export async function appendCalculationReport(doc:PDFDocument,s:Pick<Settings,'frame'|'load'>,bytes:Uint8Array){
  const source=await PDFDocument.load(bytes)
  if(source.getPageCount()!==67)throw new Error('The bundled span report does not match the reviewed 67-page revision.')
  for(const page of await doc.copyPages(source,calculationReferenceSelection(s).map(n=>n-1)))doc.addPage(page)
}
export async function loadInstallerReferenceAssets(s:Pick<Settings,'frame'|'load'>):Promise<InstallerReferenceAssets>{
  const selection=installerReferenceSelection(s)
  const read=async(name:string)=>{
    const response=await fetch(`/installer-reference/${name}`)
    if(!response.ok)throw new Error('The installation reference files could not be loaded. Please retry the PDF download.')
    return new Uint8Array(await response.arrayBuffer())
  }
  const [spanReport,illustration]=await Promise.all([read('alu-joist-span-report.pdf'),selection.illustration?read(selection.illustration):undefined])
  return {spanReport,illustration}
}
