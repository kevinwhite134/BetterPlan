import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument, PDFArray, PDFRawStream } from 'pdf-lib'
import { DEFAULT_SETTINGS, frameRule, planDeck, validateSettings } from '../src/planner.ts'
import type { Member } from '../src/planner.ts'
import { quotationEstimate, quotationSummary } from '../src/quotationEstimate.ts'
import { buildCsvReport, serializeCsv } from '../src/csvExport.ts'
import { createDeckWorkbook } from '../src/workbookExport.ts'
import { exportQuotationPdf } from '../src/quotationPdf.ts'
import { exportCustomerQuotePack } from '../src/customerQuotePack.ts'
import { calculationReferenceSelection, appendCalculationReport } from '../src/installerReferences.ts'
import { pedestalSpans } from '../src/pedestalSpans.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { supportPdfScene, exportSupportPdf } from '../src/supportPdf.ts'
import { FRAME_FACE_COLOURS } from '../src/frameColours.ts'
import { structureGeometry, structurePaths } from '../src/structureGeometry.ts'

const settings={...DEFAULT_SETTINGS,quotation:{customerName:'Test Customer',customerAddress:'Example address',customerEircode:'D02 XY12',deliveryNet:75.55,vatRate:23}}
const plan=planDeck(settings),prices=Object.fromEntries(plan.materials.map((m,i)=>[m.key,String(i?1.2345:0)]))
const report=new Uint8Array(fs.readFileSync(new URL('../public/installer-reference/alu-joist-span-report.pdf',import.meta.url)))
const streams=(doc:PDFDocument,index:number)=>{const contents=doc.getPage(index).node.Contents(),values=contents instanceof PDFArray?contents.asArray():[contents];return values.map(value=>Buffer.from(doc.context.lookup(value,PDFRawStream).getContents()).toString('base64'))}

test('quotation delivery and VAT use rounded line cents, preserve zero and withhold incomplete gross totals',()=>{
  const q=quotationEstimate(plan,settings,prices)
  assert.equal(q.deliveryCents,7555);assert.equal(q.netCents,q.subtotalCents+7555)
  assert.equal(q.vatCents,Math.round(q.netCents*.23));assert.equal(q.totalCents,q.netCents+q.vatCents!)
  const zero=quotationEstimate(plan,{...settings,quotation:{deliveryNet:0,vatRate:0}},prices)
  assert.equal(zero.deliveryCents,0);assert.equal(zero.vatCents,0);assert.equal(zero.totalCents,zero.subtotalCents)
  const unset=quotationEstimate(plan,{...settings,quotation:{}},prices)
  assert.equal(unset.vatCents,null);assert.equal(unset.totalCents,null)
  const missing=quotationEstimate(plan,settings,{...prices,boards:''})
  assert.equal(missing.complete,false);assert.equal(missing.vatCents,null);assert.equal(missing.totalCents,null)
  assert.match(quotationSummary(missing).at(-1)!.label,/incomplete/)
  const unresolved=planDeck({...settings,frameFaceWidth:10}),pending=quotationEstimate(unresolved,settings,prices)
  assert.equal(pending.pending,true);assert.equal(pending.totalCents,null)
  assert.equal(quotationEstimate(plan,{...settings,quotation:{deliveryNet:1.005,vatRate:0}},prices).deliveryCents,101)
})

test('version-1 settings round-trip optional quotation fields and retain old stock',()=>{
  const imported=JSON.parse(JSON.stringify({version:1,settings:{...settings,frameStock:3.66}}))
  assert.equal(validateSettings(imported.settings),'');assert.equal(imported.settings.frameStock,3.66)
  assert.deepEqual(imported.settings.quotation,settings.quotation);assert.equal(DEFAULT_SETTINGS.frameStock,3)
  assert.equal(validateSettings({...DEFAULT_SETTINGS,quotation:undefined}),'')
  for(const value of [-1,NaN,Infinity,'23',101])assert.match(validateSettings({...settings,quotation:{vatRate:value}} as never),/VAT/)
  for(const value of [-1,NaN,Infinity,'75'])assert.match(validateSettings({...settings,quotation:{deliveryNet:value}} as never),/Delivery/)
})

test('CSV and recalculable Excel quotation totals match the shared calculation',()=>{
  const q=quotationEstimate(plan,settings,prices),csv=buildCsvReport('quote',plan,settings,prices),amount=csv.headers.indexOf('Line total EUR')
  for(const row of quotationSummary(q).slice(1))assert.equal(csv.rows.find(r=>r[2]===row.label)?.[amount],row.cents===null?null:row.cents/100)
  assert.doesNotThrow(()=>serializeCsv(csv))
  const wb=createDeckWorkbook(plan,settings,prices),sheet=wb.getWorksheet('Quote')!,subtotal=9+plan.materials.length+1
  assert.equal(sheet.getCell(subtotal+2,5).value,75.55)
  assert.equal(sheet.getCell(subtotal+3,5).result,q.netCents/100)
  assert.equal(sheet.getCell(subtotal+4,5).value,.23)
  assert.equal(sheet.getCell(subtotal+5,5).result,q.vatCents!/100)
  assert.equal(sheet.getCell(subtotal+6,5).result,q.totalCents!/100)
  assert.match(sheet.getCell(subtotal+5,5).formula,/COUNT\(E9:E\d+\)/)
  assert.match(sheet.getCell(subtotal+5,5).formula,/ROUND\(E\d+\*E\d+,2\)/)
  assert.match(sheet.getCell(subtotal+6,5).formula,/ISNUMBER/)
  for(const quote of [{deliveryNet:0},{deliveryNet:0,vatRate:0}]){
    const expected=quotationEstimate(plan,{...settings,quotation:quote},prices),ws=createDeckWorkbook(plan,{...settings,quotation:quote},prices).getWorksheet('Quote')!
    assert.equal(ws.getCell(subtotal+5,5).result,expected.vatCents===null?'':expected.vatCents/100)
    assert.equal(ws.getCell(subtotal+6,5).result,expected.totalCents===null?'':expected.totalCents/100)
  }
  const unpriced=createDeckWorkbook(plan,settings,{...prices,boards:''}).getWorksheet('Quote')!
  assert.equal(unpriced.getCell(subtotal+6,5).result,'')
})

test('all frame/load quotation extracts contain the matching three unchanged source pages',async()=>{
  const source=await PDFDocument.load(report),expected={small:{3:[56,57,58],5:[59,60,61]},big:{3:[8,9,10],5:[11,12,13]},'small-small':{3:[62,63,64],5:[65,66,67]},'big-small':{3:[14,15,16],5:[17,18,19]}}
  for(const frame of ['small','big','small-small','big-small'] as const)for(const load of [3,5] as const){
    const s={...settings,frame,load},selection=calculationReferenceSelection(s)
    assert.deepEqual(selection,expected[frame][load])
    const pdf=await PDFDocument.load(await exportQuotationPdf(planDeck(s),s,prices,{spanReport:report}))
    for(const [i,page] of selection.entries())assert.deepEqual(streams(pdf,pdf.getPageCount()-3+i),streams(source,page-1))
  }
  await assert.rejects(async()=>appendCalculationReport(source,settings,new Uint8Array(await (await PDFDocument.create()).save())),/67-page/)
})

test('customer packs append one unmodified engineer extract with or without installer pages',async()=>{
  const source=await PDFDocument.load(report),selected=calculationReferenceSelection(settings),sourceStreams=selected.map(n=>streams(source,n-1))
  for(const includeInstaller of [false,true]){
    const pdf=await PDFDocument.load(await exportCustomerQuotePack(plan,settings,prices,{spanReport:report,includeInstaller}))
    for(let i=0;i<3;i++){
      assert.deepEqual(streams(pdf,pdf.getPageCount()-3+i),sourceStreams[i])
      assert.equal(pdf.getPages().filter((_,index)=>JSON.stringify(streams(pdf,index))===JSON.stringify(sourceStreams[i])).length,1)
    }
  }
})

test('pedestal spans use actual member neighbours, diagonals and unique shared pairs without crossing gaps',()=>{
  const m=(a:number,b:number):Member=>({a:{x:a,y:a},b:{x:b,y:b},kind:'joist',size:35})
  const frame={members:[m(0,1),m(0,1),m(2,3),{...m(0,3),support:'transfer' as const}],pedestals:[{x:0,y:0},{x:.5,y:.5},{x:1,y:1},{x:2,y:2},{x:3,y:3},{x:.5,y:.6}],rule:frameRule('small',3)}
  const spans=pedestalSpans(frame)
  assert.deepEqual(spans.map(s=>[s.from,s.to]),[[0,1],[1,2],[3,4]])
  assert.ok(Math.abs(spans[0].length-Math.SQRT1_2)<1e-9)
  const bearers={...frame,members:[{...m(0,3),kind:'joist' as const},{...m(0,1),kind:'bearer' as const}],rule:frameRule('big-small',3)}
  assert.deepEqual(pedestalSpans(bearers).map(s=>[s.from,s.to]),[[0,1],[1,2]])
  for(const direction of ['horizontal','vertical'] as const){const s={...settings,direction},p=planDeck(s),model=installerPlan(p,s);assert.ok(model.pedestalSpans.length>0);for(const span of model.pedestalSpans){assert.ok(Math.abs(span.length-Math.hypot(span.b.x-span.a.x,span.b.y-span.a.y))<1e-6);assert.ok(model.pedestals.some(p=>p.id===span.from&&Math.hypot(p.x-span.a.x,p.y-span.a.y)<1e-6))}}
})

test('3D support PDFs use actual assembled components, silver metal and finite fitted bounds',async()=>{
  for(const frame of ['small','big-small'] as const)for(const direction of ['horizontal','vertical'] as const){
    const s={...settings,frame,direction},p=planDeck(s),scene=supportPdfScene(p,s)
    assert.equal(scene.members,p.frame.members.length);assert.equal(scene.pedestals,p.frame.pedestals.length)
    assert.ok(scene.width>0&&scene.height>0);assert.ok(scene.faces.every(f=>f.points.every(p=>Number.isFinite(p.x+p.y))))
    assert.ok(scene.faces.some(f=>f.fill===FRAME_FACE_COLOURS.joist[0]))
    assert.equal(scene.faces.some(f=>f.fill===FRAME_FACE_COLOURS.bearer[0]),frame==='big-small')
    const pdf=await PDFDocument.load(await exportSupportPdf(p,s));assert.equal(pdf.getPageCount(),1);assert.ok(pdf.getTitle()?.includes('3D support'))
    const parts=structureGeometry(p,s,'joists',true),paths=structurePaths(p,s,'joists',true,35,52,q=>q)
    assert.ok(parts.filter(p=>p.kind!=='pedestal').every(p=>p.faces.every(f=>Object.values(FRAME_FACE_COLOURS).flat().includes(f.fill))))
    assert.ok(paths.paths.some(p=>p.fill===FRAME_FACE_COLOURS.joist[0]))
  }
  await assert.rejects(()=>exportSupportPdf(planDeck({...settings,frameFaceWidth:10}),settings),/Resolve support geometry/)
})
