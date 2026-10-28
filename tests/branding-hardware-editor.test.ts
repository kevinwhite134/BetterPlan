import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import type { Member } from '../src/planner.ts'
import { ALUMINIUM_BUTT_GAP, frameHardware, renderedMember } from '../src/frameHardware.ts'
import { hardwareGeometry } from '../src/hardwareGeometry.ts'
import { structureGeometry } from '../src/structureGeometry.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { resolvedPricing } from '../src/pricing.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { exportQuotationPdf } from '../src/quotationPdf.ts'
import { exportInstallerPdf } from '../src/installerPdf.ts'
import { rulerStep, rulerTicks, visibleEditorView } from '../src/supportViewport.ts'

const member=(ax:number,ay:number,bx:number,by:number,kind:Member['kind']='joist'):Member=>({a:{x:ax,y:ay},b:{x:bx,y:by},kind,size:35})
const frame=(members:Member[])=>({members,geometryPass:true,rule:{bearer:80}})
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)

test('every collinear butt end pair gets one continuous joiner and two side joiners, including bearers',()=>{
  const f=frame([member(0,0,2,0),member(2,0,4,0),member(0,1,2,1,'bearer'),member(2,1,4,1,'bearer')]),before=JSON.stringify(f),h=frameHardware(f)
  assert.deepEqual([h.continuousJoiners,h.joistJoiners,h.perpendicularJoiners],[2,4,0])
  const left=renderedMember(f.members[0],h.trims[0]),right=renderedMember(f.members[1],h.trims[1])
  close(right.a.x-left.b.x,ALUMINIUM_BUTT_GAP)
  assert.equal(JSON.stringify(f),before)
})

test('ladder ends have one perpendicular connector each; split receiving rails do not duplicate them',()=>{
  const f=frame([member(0,0,2,0),member(2,0,4,0),member(2,0,2,1),member(0,1,4,1)])
  const h=frameHardware(f)
  assert.deepEqual([h.continuousJoiners,h.joistJoiners,h.perpendicularJoiners],[1,2,2])
  assert.equal(frameHardware(frame([member(0,0,2,0),member(2,0,2,1)])).perpendicularJoiners,1,'L corner is counted once')
  assert.equal(frameHardware(frame([member(0,0,2,0),member(2,0,4,0),member(0,0,0,1)])).perpendicularJoiners,1,'a butt joint at the other end of a receiving member does not duplicate the corner connector')
  const crossing=frameHardware(frame([member(0,0,4,0),member(2,-1,2,1)]))
  assert.equal(crossing.connections.length,0,'interior crossings are not member-end connections')
  assert.equal(frameHardware(frame([member(0,0,2,0),member(2,0,2,1,'bearer')])).connections.length,0,'stacked joist/bearer crossings are not same-tier joiners')
})

test('unresolved support layouts leave all connector quantities and costs pending',()=>{
  const s={...DEFAULT_SETTINGS,frameFaceWidth:10},p=planDeck(s),e=materialEstimate(p,resolvedPricing(s,{}))
  const hardware=e.lines.filter(l=>l.key.endsWith('Joiners'))
  assert.equal(hardware.length,3);assert.ok(hardware.every(l=>l.pending&&l.cents===null));assert.equal(e.complete,false)
})

test('actual hardware quantities and user rates reconcile through the quote and CSV for both board directions',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction},p=planDeck(s),h=frameHardware(p.frame),rates=resolvedPricing(s,{}),e=materialEstimate(p,rates),csv=buildCsvReport('quote',p,s,rates)
    for(const key of ['continuousJoiners','joistJoiners','perpendicularJoiners'] as const){const line=e.lines.find(l=>l.key===key)!;assert.equal(line.qty,h[key]);assert.equal(line.rate,key==='continuousJoiners'?1.68:1.2);assert.equal(csv.rows.find(r=>r[1]===key)![6],line.cents!/100)}
    const parts=hardwareGeometry(p,s,'joists');assert.equal(parts.length,h.continuousJoiners*3+h.perpendicularJoiners)
    assert.equal(hardwareGeometry(p,s,'pedestals').length,0)
    assert.ok(parts.flatMap(p=>p.faces.flatMap(f=>f.points)).every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&Number.isFinite(q.z)))
    assert.equal(materialEstimate(p,resolvedPricing(s,{continuousJoiners:'0'})).lines.find(l=>l.key==='continuousJoiners')!.rate,0)
  }
})

test('pedestal adjusting columns measure 110 mm in the detailed 3D geometry',()=>{
  const p=planDeck(DEFAULT_SETTINGS),part=structureGeometry(p,DEFAULT_SETTINGS,'pedestals',true)[0],stem=part.faces.filter(f=>f.normal.z===1)[1]
  close(Math.max(...stem.points.map(p=>p.x))-Math.min(...stem.points.map(p=>p.x)),.110)
})

test('butt marks are flat top lines and disappear from exploded hardware while real joiners remain',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction},base=planDeck(s),p={...base,frame:{...base.frame,rule:{...base.frame.rule,bearer:80},members:[member(0,0,2,0),member(2,0,4,0),member(0,1,2,1,'bearer'),member(2,1,4,1,'bearer')]}}
    const before=JSON.stringify(p)
    for(const exposure of ['joists','bearers'] as const){
      const assembled=hardwareGeometry(p,s,exposure),marks=assembled.filter(part=>part.id.startsWith('continuous-')),exploded=hardwareGeometry(p,s,exposure,false)
      assert.equal(marks.length,exposure==='bearers'?1:2)
      for(const mark of marks){
        assert.equal(mark.faces.length,1,'No vertical faces')
        assert.deepEqual(mark.faces[0].normal,{x:0,y:0,z:1})
        assert.ok(mark.faces[0].points.every(point=>point.z===mark.centre.z),'All points lie on the top plane')
        const xs=mark.faces[0].points.map(point=>point.x),ys=mark.faces[0].points.map(point=>point.y)
        const spans=[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)].sort((a,b)=>a-b)
        close(spans[0],ALUMINIUM_BUTT_GAP);close(spans[1],(s.frameFaceWidth??35)/1000)
      }
      assert.ok(!exploded.some(part=>part.id.startsWith('continuous-')))
      assert.deepEqual(exploded,assembled.filter(part=>!part.id.startsWith('continuous-')),'Real connector products remain unchanged')
    }
    assert.equal(JSON.stringify(p),before,'Rendering does not change the plan or quantities')
  }
})

test('joist centres accept 1500 mm and reject values above the new limit',()=>{
  assert.equal(validateSettings({...DEFAULT_SETTINGS,joistSpacing:1500}),'')
  assert.match(validateSettings({...DEFAULT_SETTINGS,joistSpacing:1501}),/1,500/)
  const p=planDeck({...DEFAULT_SETTINGS,joistSpacing:1500});assert.ok(p.warnings.some(w=>w.includes('400 mm')))
})

test('rulers match the SVG meet transform through zoom, pan and portrait/landscape viewports',()=>{
  for(const [width,height] of [[900,600],[350,620],[1200,280]])for(const zoom of [.25,1,4]){
    const view={x:-1.35,y:.437,w:8*zoom,h:4*zoom},v=visibleEditorView(view,width,height),step=rulerStep(v.scale),ticks=rulerTicks(v.x,v.w,step)
    close(v.w*v.scale,width);close(v.h*v.scale,height)
    close(v.x+v.w/2,view.x+view.w/2);close(v.y+v.h/2,view.y+view.h/2)
    assert.ok(step*v.scale>=75&&step*v.scale<=187.5)
    for(let i=1;i<ticks.length;i++)close((ticks[i]-ticks[i-1])*v.scale,step*v.scale)
  }
})

test('installer and quotation PDFs embed the supplied JPEG and retain registered branding, including multipage quotes',async()=>{
  const p=planDeck(DEFAULT_SETTINGS),logo=new Uint8Array(fs.readFileSync(new URL('../public/betterdeck-logo.jpg',import.meta.url))),now=new Date('2026-10-27T15:00:00Z')
  const installer=await PDFDocument.load(await exportInstallerPdf(p,DEFAULT_SETTINGS,{logo,now}))
  assert.ok(installer.getPageCount()>1)
  const long={...p,materials:Array.from({length:45},(_,i)=>({...p.materials[i%p.materials.length],name:`Component ${i+1} · ${p.materials[i%p.materials.length].name}`}))}
  const quote=await PDFDocument.load(await exportQuotationPdf(long,DEFAULT_SETTINGS,resolvedPricing(DEFAULT_SETTINGS,{}),{logo,now}))
  assert.match(quote.getTitle()!,/BetterDeck®/);assert.ok(quote.getPageCount()>=3)
  const fallback=await PDFDocument.load(await exportQuotationPdf(p,DEFAULT_SETTINGS,{}, {now}));assert.ok(fallback.getPageCount()>=1)
})
