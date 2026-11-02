import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument, PDFArray, PDFRawStream } from 'pdf-lib'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { installerReferenceSelection, loadInstallerReferenceAssets } from '../src/installerReferences.ts'
import { installerDrawing, installerPlan } from '../src/installerPlan.ts'
import { installationGuide } from '../src/installationGuide.ts'
import { exportInstallerPdf } from '../src/installerPdf.ts'

const spanReport=new Uint8Array(fs.readFileSync(new URL('../public/installer-reference/alu-joist-span-report.pdf',import.meta.url)))
const illustration=(name:string)=>new Uint8Array(fs.readFileSync(new URL(`../public/installer-reference/${name}`,import.meta.url)))

test('all eight frame/load cases select only the matching K Series calculation pages',()=>{
  const expected={small:{3:[5,7,56,57,58],5:[5,7,59,60,61]},big:{3:[5,8,9,10],5:[5,11,12,13]},'small-small':{3:[5,7,62,63,64],5:[5,7,65,66,67]},'big-small':{3:[5,14,15,16],5:[5,17,18,19]}}
  for(const frame of ['small','big','small-small','big-small'] as const)for(const load of [3,5] as const){
    const selected=installerReferenceSelection({frame,load})
    assert.deepEqual(selected.pages,expected[frame][load])
    assert.equal(selected.illustration,frame==='small-small'?'35-bearer-35-joist.png':frame==='big-small'?'80-bearer-35-joist.png':null)
  }
})

test('both measured drawings omit entry IDs by default while opt-in IDs remain available',()=>{
  const s=DEFAULT_SETTINGS,p=planDeck(s),model=installerPlan(p,s)
  const clean=installerDrawing(model,392,189,3,false).marks.filter(m=>m.type==='text').map(m=>m.text).join(' ')
  assert.doesNotMatch(clean,/C-\d|E\d\d|FJ-|BR-|VJ-|CP \(/)
  const screen=installerDrawing(model).marks.filter(m=>m.type==='text').map(m=>m.text).join(' ')
  assert.doesNotMatch(screen,/C-\d|E\d\d|FJ-|BR-|VJ-|CP \(/)
  const measured=installerDrawing(model,420,205,3,true).marks.filter(m=>m.type==='text').map(m=>m.text).join(' ')
  assert.match(measured,/C-01/)
  assert.doesNotMatch(installationGuide(p,s).steps.map(s=>s.body).join(' '),/M-xxxx|FJ-xxx|C-xx|E-xx|BR centres|coordinate schedule/)
})

test('download loads local report and only the matching image, and rejects missing references',async()=>{
  const urls:string[]=[]
  const fetch=mock.method(globalThis,'fetch',async(url:string)=>{urls.push(url);return new Response(new Uint8Array([1,2,3]))})
  try{
    await loadInstallerReferenceAssets({...DEFAULT_SETTINGS,frame:'small-small'})
    assert.deepEqual(urls,['/installer-reference/alu-joist-span-report.pdf','/installer-reference/35-bearer-35-joist.png'])
    urls.length=0
    await loadInstallerReferenceAssets({...DEFAULT_SETTINGS,frame:'big'})
    assert.deepEqual(urls,['/installer-reference/alu-joist-span-report.pdf'])
    fetch.mock.mockImplementation(async()=>new Response('',{status:404}))
    await assert.rejects(()=>loadInstallerReferenceAssets(DEFAULT_SETTINGS),/could not be loaded/)
  }finally{fetch.mock.restore()}
})

test('PDF appends unchanged source pages and the correct illustration',async()=>{
  const source=await PDFDocument.load(spanReport)
  const streams=(doc:PDFDocument,index:number)=>{
    const contents=doc.getPage(index).node.Contents()
    const values=contents instanceof PDFArray?contents.asArray():[contents]
    return values.map(value=>Buffer.from(doc.context.lookup(value,PDFRawStream).getContents()).toString('base64'))
  }
  for(const frame of ['small-small','big-small'] as const){
    const s={...DEFAULT_SETTINGS,frame},plan=planDeck(s),selected=installerReferenceSelection(s)
    const pdf=await PDFDocument.load(await exportInstallerPdf(plan,s,{references:{spanReport,illustration:illustration(selected.illustration!)}}))
    const offset=pdf.getPageCount()-selected.pages.length
    // Measured plan, coloured 3D view, concise guide and supplier illustration; no coordinate-table pages.
    assert.equal(offset,7)
    for(const [i,page] of selected.pages.entries())assert.deepEqual(streams(pdf,offset+i),streams(source,page-1))
  }
})
