import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFArray, PDFRawStream } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { installerDrawing, installerPlan, installerSvg } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { exportInstallerPdf } from '../src/installerPdf.ts'
import { supportPdfScene } from '../src/supportPdf.ts'
import { FRAME_DIAGRAM_FACE_COLOURS } from '../src/frameColours.ts'

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
  assert.ok(!svg.includes(m.pedestals[0].id));assert.ok(!svg.includes('C-01'));assert.ok(!svg.includes('E01'));assert.ok(drawing.marks.some(p=>p.type==='text'&&p.pedestalSpan))
  assert.ok(drawing.marks.some(p=>p.type==='text'&&p.text.includes('c/c')))
  assert.ok(drawing.marks.some(p=>p.type==='circle'&&Math.abs(p.radius-150/drawing.scale/2)<1e-6))
  assert.equal(m.reference,installerPlan(planDeck(DEFAULT_SETTINGS),DEFAULT_SETTINGS).reference)
})

test('installer PDF keeps scalable A3 drawings and the concise installation guide',async()=>{
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

test('dense measured plans label real pedestal intervals on the drawing, including local changes at openings',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction,polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],frame:'small-small' as const,pedestalDiameter:205,cutouts:[{id:'hole',name:'Opening',shape:'circle' as const,polygon:Array.from({length:32},(_,i)=>({x:5.25+.5*Math.cos(i*Math.PI/16),y:5+.5*Math.sin(i*Math.PI/16)}))}]}
    const p=planDeck(s),model=installerPlan(p,s),drawing=installerDrawing(model,392,189,3),labels=drawing.marks.filter(m=>m.type==='text'&&m.pedestalSpan)
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '));assert.ok(labels.length>0)
    assert.ok(labels.some(m=>m.type==='text'&&m.text==='700'))
    assert.ok(labels.some(m=>m.type==='text'&&m.pedestalSpan&&Math.abs(m.pedestalSpan.length-700)>.1),'Local exceptions retain separate measured dimensions')
    assert.ok(labels.length<model.pedestalSpans.length,'Repeated intervals on parallel runs do not clutter every row')
    for(const mark of labels){if(mark.type!=='text'||!mark.pedestalSpan)continue;const span=mark.pedestalSpan
      assert.ok(model.pedestalSpans.some(s=>s.from===span.from&&s.to===span.to))
      assert.ok(Math.abs(span.length-Math.hypot(span.b.x-span.a.x,span.b.y-span.a.y))<1e-6)
      assert.ok(mark.at.x>0&&mark.at.x<drawing.width&&mark.at.y>0&&mark.at.y<drawing.height)
    }
    assert.equal(drawing.labelled,false)
  }
})

test('diagonal support dimensions use true centre distance rather than an X or Y projection',()=>{
  const model=installerPlan(planDeck(DEFAULT_SETTINGS),DEFAULT_SETTINGS),a={x:1000,y:1000},b={x:2000,y:2000},length=Math.hypot(b.x-a.x,b.y-a.y)
  const drawing=installerDrawing({...model,pedestalSpans:[{from:'test-a',to:'test-b',a,b,length}]})
  const mark=drawing.marks.find(m=>m.type==='text'&&m.pedestalSpan)
  assert.ok(mark?.type==='text');assert.match(mark.text,/1414\.2/)
})

test('installer PDF includes a purple/green 3D support page and no coordinate-table appendix',async()=>{
  const s=DEFAULT_SETTINGS,plan=planDeck(s),pdf=await PDFDocument.load(await exportInstallerPdf(plan,s,{includeReferences:false}))
  const decoded=pdf.getPages().map(page=>{const contents=page.node.Contents(),values=contents instanceof PDFArray?contents.asArray():[contents];return values.map(value=>inflateSync(pdf.context.lookup(value,PDFRawStream).getContents()).toString('latin1')).join('')})
  const encoded=(s:string)=>Buffer.from(s,'latin1').toString('hex').toUpperCase()
  assert.ok(decoded[1].includes(encoded('3D joist & pedestal support frame')))
  assert.ok(decoded[1].includes(encoded('Purple: bearers')));assert.ok(decoded[1].includes(encoded('Green: joists, rim & blocking')))
  assert.ok(decoded.every(page=>!page.includes(encoded('From X / Y (mm)'))&&!page.includes(encoded('Pedestal centre-to-centre spans'))))
  const diagram=supportPdfScene(plan,s,true),metal=supportPdfScene(plan,s)
  assert.deepEqual(diagram.faces.map(f=>f.points),metal.faces.map(f=>f.points),'The print palette must not change the model')
  for(const kind of ['joist','bearer'] as const)assert.ok(diagram.faces.some(f=>f.fill===FRAME_DIAGRAM_FACE_COLOURS[kind][0]))
  assert.ok(metal.faces.every(f=>!Object.values(FRAME_DIAGRAM_FACE_COLOURS).flat().includes(f.fill)))
})
