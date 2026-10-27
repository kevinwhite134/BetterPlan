import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { installerDrawing, installerPlan, installerSvg } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { exportInstallerPdf } from '../src/installerPdf.ts'

test('installer coordinates and IDs match the physical pedestal and member CSV axes in both board directions',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction},plan=planDeck(s),model=installerPlan(plan,s),csv=buildCsvReport('pedestals',plan,s,{})
    assert.equal(model.pedestals.length,csv.rows.length)
    for(const [i,p]of model.pedestals.entries()){
      assert.equal(p.id,csv.rows[i][0]);assert.ok(Math.abs(p.x-Number(csv.rows[i][1]))<=.051);assert.ok(Math.abs(p.y-Number(csv.rows[i][2]))<=.051)
    }
    for(const [i,m]of model.members.entries()){
      const original=plan.frame.members[i],a=direction==='vertical'?{x:original.a.y,y:original.a.x}:original.a
      assert.equal(m.id,`M-${String(i+1).padStart(4,'0')}`);assert.equal(m.a.x,a.x*1000);assert.equal(m.a.y,a.y*1000)
      assert.ok(Math.abs(m.length-Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y))<1e-6)
    }
  }
})

test('angled edge lengths are true lengths, with reflex angles preserved at concave corners',()=>{
  const triangle={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:3,y:0},{x:0,y:4}]},m=installerPlan(planDeck(triangle),triangle)
  assert.deepEqual(m.edges.map(e=>e.length),[3000,5000,4000])
  const concave={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:3,y:2},{x:3,y:4},{x:0,y:4}]}
  assert.ok(installerPlan(planDeck(concave),concave).corners.some(p=>p.angle===270))
})

test('measured SVG is finite, escaped and deterministic, and keeps real-sized pedestal footprints',()=>{
  const m=installerPlan(planDeck(DEFAULT_SETTINGS),DEFAULT_SETTINGS),drawing=installerDrawing(m),svg=installerSvg(m)
  assert.equal(svg,installerSvg(m));assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('Infinity'))
  assert.ok(svg.includes(m.pedestals[0].id));assert.ok(svg.includes('C-01'));assert.ok(svg.includes('E01'))
  assert.ok(drawing.marks.some(p=>p.type==='text'&&p.text.includes('c/c')))
  assert.ok(drawing.marks.some(p=>p.type==='circle'&&Math.abs(p.radius-150/drawing.scale/2)<1e-6))
  assert.equal(m.reference,installerPlan(planDeck(DEFAULT_SETTINGS),DEFAULT_SETTINGS).reference)
})

test('installer PDF contains scalable A3 drawings and automatically paginated complete schedules',async()=>{
  const s=DEFAULT_SETTINGS,plan=planDeck(s),bytes=await exportInstallerPdf(plan,s,{now:new Date('2026-10-25T12:00:00Z')}),pdf=await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount()>=5)
  assert.ok(pdf.getTitle()?.includes(installerPlan(plan,s).reference))
  const size=pdf.getPages()[0].getSize();assert.ok(Math.abs(size.width-420*72/25.4)<.01);assert.ok(Math.abs(size.height-297*72/25.4)<.01)
  const tall={...s,polygon:[{x:0,y:0},{x:2,y:0},{x:2,y:6},{x:0,y:6}]},tallPlan=planDeck(tall)
  assert.equal(tallPlan.frame.geometryPass,true)
  const portrait=await PDFDocument.load(await exportInstallerPdf(tallPlan,tall));assert.ok(portrait.getPages()[0].getWidth()<portrait.getPages()[0].getHeight())
})

test('an unresolved support layout cannot produce a misleading installer PDF',async()=>{
  const s={...DEFAULT_SETTINGS,frameFaceWidth:10},plan=planDeck(s)
  assert.equal(plan.frame.geometryPass,false)
  await assert.rejects(()=>exportInstallerPdf(plan,s),/Resolve the support geometry/)
})
