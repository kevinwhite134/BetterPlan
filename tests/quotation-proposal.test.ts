import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { quotationEstimate } from '../src/quotationEstimate.ts'
import { quotationDetailsError, QUOTATION_VIEWS } from '../src/quotationDetails.ts'
import { quotationSections } from '../src/quotationSections.ts'
import { deckPreviewSvg } from '../src/deckPreview.ts'
import { buildCsvReport, serializeCsv } from '../src/csvExport.ts'
import { exportCustomerQuotePack } from '../src/customerQuotePack.ts'
import { createDeckWorkbook } from '../src/workbookExport.ts'

const plan=planDeck(DEFAULT_SETTINGS),prices=Object.fromEntries(plan.materials.map(m=>[m.key,'1.2345']))
const quotation={quotationNumber:'BD-2026-42',revision:'2',validUntil:'2026-12-06',fulfilment:'collection' as const,vatRate:23,extras:[{id:'steps',description:'Two entrance steps',quantity:2,unit:'steps',unitRate:123.455}],additionalDecks:[{id:'terrace',name:'Rear terrace',settings:structuredClone(DEFAULT_SETTINGS),prices:{...prices}}]}
const settings:Settings={...DEFAULT_SETTINGS,quotation}

test('multiple decks and extras reconcile across quotation, CSV and editable Excel formulas',()=>{
  const quote=quotationEstimate(plan,settings,prices),base=quotationEstimate(plan,DEFAULT_SETTINGS,prices)
  assert.equal(quote.subtotalCents,base.subtotalCents*2+24691)
  assert.equal(quote.deliveryCents,0);assert.equal(quote.totalCents,quote.netCents+Math.round(quote.netCents*.23))
  const csv=buildCsvReport('quote',plan,settings,prices),rows=csv.rows.filter(row=>row[0]==='Item')
  assert.equal(rows.length,quote.lines.length)
  assert.equal(rows.reduce((sum,r)=>sum+Math.round(Number(r[6])*100),0),quote.subtotalCents)
  assert.equal(csv.rows.find(r=>r[2]==='Total including VAT')?.[6],quote.totalCents!/100)
  assert.ok(rows.some(r=>String(r[8]).includes('Rear terrace')))
  assert.doesNotThrow(()=>serializeCsv(csv))
  const workbook=createDeckWorkbook(plan,settings,prices),sheet=workbook.getWorksheet('Quote')!,total=quote.lines.length+16
  assert.equal(sheet.getCell(total,5).result,quote.totalCents!/100)
  assert.match(sheet.getCell(total,5).formula,/ISNUMBER/)
  assert.equal(sheet.getCell(quote.lines.length+8,1).value,'Two entrance steps')
})

test('a missing extra rate, blank description or unresolved additional deck withholds final totals',()=>{
  for(const extras of [[{id:'a',description:'Step',quantity:1,unit:'item'}],[{id:'a',description:'',quantity:1,unit:'item',unitRate:0}]]){
    const q=quotationEstimate(plan,{...settings,quotation:{...quotation,extras}},prices)
    assert.equal(q.complete,false);assert.equal(q.totalCents,null)
  }
  const q=quotationEstimate(plan,{...settings,quotation:{...quotation,additionalDecks:[{...quotation.additionalDecks[0],settings:{...DEFAULT_SETTINGS,frameFaceWidth:10}}]}},prices)
  assert.equal(q.pending,true);assert.equal(q.totalCents,null)
  const free=quotationEstimate(plan,{...settings,quotation:{...quotation,vatRate:0,extras:[{id:'a',description:'Complimentary item',quantity:1,unit:'item',unitRate:0}]}},prices)
  assert.equal(free.complete,true);assert.equal(free.vatCents,0)
})

test('unfinished numeric and unit inputs stay pending without leaking non-finite totals',()=>{
  for(const extra of [{id:'draft',description:'Steps',quantity:NaN,unit:'items',unitRate:100},{id:'draft',description:'Steps',quantity:2,unit:'',unitRate:100}]){
    const q=quotationEstimate(plan,{...settings,quotation:{...quotation,extras:[extra]}},prices)
    assert.equal(q.pending,true);assert.equal(q.totalCents,null);assert.ok(Number.isFinite(q.subtotalCents))
  }
})

test('a typical customer proposal keeps its scope and next steps within three pages',async()=>{
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64'))
  const s:Settings={...DEFAULT_SETTINGS,quotation:{customerName:'Sample customer',customerAddress:'24 Sample Street\nCo. Cavan',customerEircode:'H12 AB34',scope:'A composite garden terrace with matching fascia, perimeter border and an adjustable substructure.',vatRate:23,extras:quotation.extras}}
  const pdf=await PDFDocument.load(await exportCustomerQuotePack(plan,s,prices,{preview:png,planPreview:png}))
  assert.equal(pdf.getPageCount(),3)
})

test('quotation snapshots round-trip without recursive project data and reject malformed inputs',()=>{
  assert.equal(validateSettings(JSON.parse(JSON.stringify(settings))),'')
  assert.equal(quotationDetailsError({additionalDecks:[{...quotation.additionalDecks[0],settings}]}),'Additional decks must contain design settings only.')
  assert.match(quotationDetailsError({additionalDecks:[{...quotation.additionalDecks[0],settings:{...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:.2},{x:0,y:.2}]}}]}),/could not be planned/)
  for(const change of [{validUntil:'2026-02-30'},{installationUrl:'javascript:alert(1)'},{fulfilment:'collection',deliveryNet:5},{extras:[{id:'a',description:'Step',quantity:-1,unit:'item'}]}])assert.notEqual(quotationDetailsError(change),'')
  const before=JSON.stringify(settings),sections=quotationSections(plan,settings,prices)
  assert.equal(sections.length,2);assert.equal(quotationSections(plan,settings,prices)[1].plan,sections[1].plan)
  assert.equal(JSON.stringify(settings),before)
})

test('all quotation camera choices fit the real geometry in both board directions',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction},p=planDeck(s),images=new Set<string>()
    for(const view of QUOTATION_VIEWS){
      const svg=deckPreviewSvg(p,s,view.angle);images.add(svg);assert.doesNotMatch(svg,/NaN|Infinity|undefined/)
      const [x,y,w,h]=svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
      for(const match of svg.matchAll(/points="([^"]+)"/g))for(const pair of match[1].split(' ')){
        const [a,b]=pair.split(',').map(Number);assert.ok(a>=x-.001&&a<=x+w+.001&&b>=y-.001&&b<=y+h+.001)
      }
    }
    assert.equal(images.size,4)
  }
})

test('proposal exports all deck layouts and a clickable guide; long scope and item descriptions paginate',async()=>{
  const plain=await PDFDocument.load(await exportCustomerQuotePack(plan,settings,prices)),linked=await PDFDocument.load(await exportCustomerQuotePack(plan,{...settings,quotation:{...quotation,installationUrl:'https://example.com/install'}},prices))
  assert.match(plain.getTitle()!,/BD-2026-42/);assert.ok(plain.getPageCount()>=4)
  assert.ok(linked.getPages().some(p=>(p.node.Annots()?.size()??0)>0))
  const long=await PDFDocument.load(await exportCustomerQuotePack(plan,{...settings,quotation:{...quotation,scope:'Detailed scope and exclusions.\n'.repeat(90),extras:[{id:'long',description:'A long description for additional installation work. '.repeat(6).slice(0,300),quantity:2,unit:'items',unitRate:50}]}},prices))
  assert.ok(long.getPageCount()>plain.getPageCount())
})
