import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { installerDrawing, installerPlan } from '../src/installerPlan.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { pedestalAbbreviation, pedestalReference } from '../src/productNames.ts'
import { recommendFrames, selectAutomaticFrame } from '../src/frameRecommendation.ts'

test('pedestal references use the product abbreviation and position consistently',()=>{
  assert.equal(pedestalReference('VersiJack F1 Pedestal',0),'VJ-F1 (1)')
  assert.equal(pedestalReference('Versi Jack F4 Pedestal',22),'VJ-F4 (23)')
  assert.equal(pedestalReference('SpiraPave T12 Pedestal',0),'SP-T12 (1)')
  assert.equal(pedestalAbbreviation('Custom adjustable pedestal'),'CP')
  assert.equal(pedestalAbbreviation('Acme compact pedestal'),'ACP')
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction,pedestalName:'VersiJack F4 Pedestal',pedestalMin:117,pedestalMax:201,pedestalDiameter:205,frame:'big' as const},p=planDeck(s),model=installerPlan(p,s),csv=buildCsvReport('pedestals',p,s,{})
    assert.equal(p.frame.geometryPass,true,p.frame.issues.join('; '))
    assert.equal(model.pedestals[0].id,'VJ-F4 (1)')
    assert.deepEqual(model.pedestals.map(q=>q.id),csv.rows.map(q=>q[0]))
    assert.equal(new Set(csv.rows.map(q=>q[0])).size,csv.rows.length)
  }
})

test('centre-line and joint schedules locate actual framing with physical datum axes after either board run',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const s={...DEFAULT_SETTINGS,direction},p=planDeck(s),m=installerPlan(p,s),report=buildCsvReport('project',p,s,{})
    assert.ok(m.centreLines.some(c=>c.kind==='Joist centre line'))
    assert.ok(m.centreLines.some(c=>c.kind==='Bearer centre line'))
    for(const c of m.centreLines){
      const axis=c.axis==='X'?'x':'y'
      if(c.kind!=='Breaker centre line')assert.ok(m.members.some(member=>member.kind===(c.kind==='Joist centre line'?'joist':'bearer')&&Math.abs(member.a[axis]-c.coordinate)<1e-4&&Math.abs(member.b[axis]-c.coordinate)<1e-4))
      assert.ok(report.rows.some(row=>row[0]==='Setting-out'&&row[1]===c.id&&row[2]===c.coordinate&&String(row[5]).startsWith(c.axis)))
      assert.equal(c.kind==='Joist centre line'?c.axis:c.kind==='Bearer centre line'?c.axis:direction==='horizontal'?'X':'Y',c.kind==='Bearer centre line'?(direction==='horizontal'?'Y':'X'):(direction==='horizontal'?'X':'Y'))
    }
    assert.equal(m.stockJoints.length,p.frame.splices.length)
    for(const [i,j] of m.stockJoints.entries()){
      const original=p.frame.splices[i]
      assert.equal(j.x,(direction==='horizontal'?original.x:original.y)*1000)
      assert.equal(j.y,(direction==='horizontal'?original.y:original.x)*1000)
      assert.ok(report.rows.some(row=>row[0]==='Stock joint'&&row[1]===j.id+' X'))
    }
    const text=installerDrawing(m).marks.filter(mark=>mark.type==='text').map(mark=>mark.text)
    assert.ok(text.some(t=>t.includes('J c/c')))
    if(m.centreLines.some(c=>c.kind==='Breaker centre line'))assert.ok(text.some(t=>t.includes('BR-01')))
  }
})

test('More pedestals compares checked counts while preserving fixed height and manual modes',()=>{
  const s={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:3.6,y:0},{x:3.6,y:3.2},{x:0,y:3.2}],board:{...DEFAULT_SETTINGS.board,stock:4.88},height:250,variation:0,selectionObjective:'spread' as const}
  const result=recommendFrames(s),eligible=result.options.flatMap(o=>o.choice?[o.choice]:[]),chosen=selectAutomaticFrame(s)
  assert.ok(result.selected)
  assert.equal(result.selected.pedestals,Math.max(...eligible.map(c=>c.pedestals)))
  assert.equal(chosen.height,250);assert.equal(chosen.variation,0)
  assert.equal(planDeck(chosen).frame.geometryPass,true)
  assert.match(result.reason,/Roof and substrate load capacity still need verification/)
  const manual={...chosen,frameSelection:'manual' as const,pedestalSelection:'manual' as const}
  assert.deepEqual(selectAutomaticFrame(manual),manual)
})

test('installer and project metadata preserve chosen edge boards, open construction and supplied limits',()=>{
  const s={...DEFAULT_SETTINGS,frameLayout:'open' as const,perimeterEdges:[true,false,true,false],fasciaClearance:30,joistOverhang35:150,joistOverhang80:200},p=planDeck(s),m=installerPlan(p,s),csv=buildCsvReport('project',p,s,{})
  assert.deepEqual(m.edges.map(e=>e.framingBoard),s.perimeterEdges)
  assert.equal(m.construction.layout,'board-driven');assert.equal(m.construction.fasciaClearance,30)
  assert.equal(m.construction.joistOverhang35,150);assert.equal(m.construction.joistOverhang80,200)
  assert.ok(csv.rows.some(row=>row[0]==='Edge boards'&&row[1]==='E02 picture-frame board'&&row[2]==='Omitted'))
  assert.ok(csv.rows.some(row=>row[0]==='Construction'&&row[1]==='Frame layout'&&row[2]==='Board-driven joists, blocking and collectors'))
  assert.ok(csv.rows.some(row=>row[1]==='Frame-end setback for fascia'&&row[2]===30&&row[3]==='mm'&&row[4]==='Applied to solved geometry'))
})

test('missing overhang limits are pending, while an explicit zero is an entered value',()=>{
  const s={...DEFAULT_SETTINGS,frameLayout:'open' as const,joistOverhang35:0},p=planDeck(s),m=installerPlan(p,s),csv=buildCsvReport('project',p,s,{})
  assert.equal(m.construction.fasciaClearance,s.board.thickness)
  assert.equal(m.construction.joistOverhang35,0);assert.equal(m.construction.joistOverhang80,null)
  const entered=csv.rows.find(row=>row[1]==='35 mm profile end-overhang limit')!,missing=csv.rows.find(row=>row[1]==='80 mm profile end-overhang limit')!
  assert.deepEqual(entered.slice(2,5),[0,'mm','Limit entered'])
  assert.deepEqual(missing.slice(2,5),[null,'','Pending supplier value'])
})
