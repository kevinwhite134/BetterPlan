import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString } from 'pdf-lib'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { installationGuide, INSTALLATION_SOURCES } from '../src/installationGuide.ts'
import { exportInstallerPdf } from '../src/installerPdf.ts'

test('guide follows every frame stack and physical board direction',()=>{
  for(const frame of ['small','big','small-small','big-small'] as const)for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,frame,direction},p=planDeck(s),g=installationGuide(p,s)
    assert.equal(g.stack.length,p.frame.rule.bearer?3:2)
    assert.equal(g.stack.reduce((n,l)=>n+l.height,0),s.board.thickness+p.frame.rule.joist+p.frame.rule.bearer)
    const text=g.steps.map(s=>s.body).join(' ')
    assert.ok(text.includes(`${p.frame.pedestals.length} ${s.pedestalName}`))
    assert.ok(text.includes(direction==='horizontal'?'X / width':'Y / depth'))
    assert.match(g.steps[3].title,p.frame.rule.bearer?/bearer tier/:/single-layer/)
  }
})

test('optional guide steps reflect openings, butt joints, selected edges and fascia rows',()=>{
  const s:Settings={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}],joints:'butt',perimeterEdges:[true,false,true,false],pictureFrameRows:2,skirtingRows:3,skirtingHeight:100,cutouts:[{id:'h',name:'Tree',shape:'rectangle',polygon:[{x:2,y:1.5},{x:3,y:1.5},{x:3,y:2.5},{x:2,y:2.5}]}]}
  const p=planDeck(s),before=JSON.stringify(p),g=installationGuide(p,s)
  assert.ok(g.steps.some(s=>s.title==='Frame and protect the openings'))
  assert.match(g.steps.find(s=>s.title==='Dry-lay picture frames and breaker bays')!.body,/omitted on 2 outside edges/)
  assert.match(g.steps.find(s=>s.title==='Dry-lay picture frames and breaker bays')!.body,/alternating butt joints/)
  assert.match(g.steps.find(s=>s.title==='Fit the fascia rows')!.body,/3 full-width rows of 100 mm/)
  assert.ok(g.review.some(s=>s.includes('Fascia extends 75 mm')))
  assert.equal(JSON.stringify(p),before)
  const plain={...DEFAULT_SETTINGS,skirting:false},plainGuide=installationGuide(planDeck(plain),plain)
  assert.ok(!plainGuide.steps.some(s=>s.title==='Fit the fascia rows'||s.title==='Frame and protect the openings'))
})

test('export embeds supplier links in guide pages without an online dependency',async()=>{
  const s=DEFAULT_SETTINGS,pdf=await PDFDocument.load(await exportInstallerPdf(planDeck(s),s)),urls:string[]=[]
  for(const page of pdf.getPages()){
    const annotations=page.node.lookupMaybe(PDFName.of('Annots'),PDFArray)
    for(let i=0;i<(annotations?.size()??0);i++){
      const annotation=annotations!.lookup(i,PDFDict),action=annotation.lookupMaybe(PDFName.of('A'),PDFDict)
      const url=action?.lookupMaybe(PDFName.of('URI'),PDFString);if(url)urls.push(url.decodeText())
    }
  }
  assert.deepEqual(urls,INSTALLATION_SOURCES.map(s=>s.url))
})
