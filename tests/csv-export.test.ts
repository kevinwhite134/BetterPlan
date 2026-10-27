import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCsvReport, CSV_REPORTS, serializeCsv } from '../src/csvExport.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'

const rect=(w:number,d:number)=>[{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]
const s={...DEFAULT_SETTINGS,polygon:rect(6,4),skirting:true}
const plan=planDeck(s)
const prices=Object.fromEntries(plan.materials.map((q,i)=>[q.key,String(i?i*2.31:0)]))
const close=(a:number,b:number,tol=.11)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`)

function parseCsv(text:string,delimiter=','){
  const rows:string[][]=[],row:string[]=[];let field='',quoted=false
  for(let i=1;i<text.length;i++){
    const c=text[i]
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(!quoted&&c===delimiter){row.push(field);field=''}
    else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(field);rows.push([...row]);row.length=0;field='';i++}
    else field+=c
  }
  assert.equal(quoted,false)
  return rows
}

test('every export is a single rectangular table in comma and semicolon formats',()=>{
  for(const choice of CSV_REPORTS){
    const report=buildCsvReport(choice.id,plan,s,prices)
    assert.ok(report.rows.length>0,choice.id)
    assert.ok(report.rows.every(row=>row.length===report.headers.length),choice.id)
    for(const delimiter of [',',';'] as const){
      const csv=serializeCsv(report,delimiter),parsed=parseCsv(csv,delimiter)
      assert.equal(csv.charCodeAt(0),0xfeff)
      assert.equal(parsed.length,report.rows.length+1)
      assert.ok(parsed.every(row=>row.length===report.headers.length))
      assert.deepEqual(parsed[0],report.headers)
    }
  }
})

test('CSV safely round-trips commas, quotes, line breaks, Unicode and user-authored formula text',()=>{
  const report={headers:['Text','Number','Empty'],rows:[['Oak, "warm"\r\n€ / Éire',-12.5,null],['  =1+2',0,null],['\t@SUM(A1)',1,null],['+123',2,null],['-supplier text',3,null]]}
  for(const delimiter of [',',';'] as const){
    const parsed=parseCsv(serializeCsv(report,delimiter),delimiter)
    assert.deepEqual(parsed[1],['Oak, "warm"\r\n€ / Éire','-12.5',''])
    assert.equal(parsed[2][0],"'  =1+2");assert.equal(parsed[2][1],'0')
    assert.equal(parsed[3][0],"'\t@SUM(A1)")
    assert.equal(parsed[4][0],"'+123");assert.equal(parsed[5][0],"'-supplier text")
  }
  assert.throws(()=>serializeCsv({headers:['A'],rows:[[NaN]]}),/non-finite/)
  assert.throws(()=>serializeCsv({headers:['A'],rows:[['x','y']]}),/header/)
})

test('material pricing preserves zero rates, rounds each line to cents and sums those displayed amounts',()=>{
  const rates=Object.fromEntries(plan.materials.map(q=>[q.key,'1.2345']));rates.boards='0'
  const estimate=materialEstimate(plan,rates)
  assert.equal(estimate.complete,true)
  assert.equal(estimate.lines[0].rate,0);assert.equal(estimate.lines[0].cents,0)
  assert.equal(estimate.subtotalCents,estimate.lines.reduce((sum,q)=>sum+Math.round(q.qty*Number(rates[q.key])*100),0))
  for(const kind of ['materials','quote'] as const){
    const report=buildCsvReport(kind,plan,s,rates),totalIndex=report.headers.indexOf('Line total EUR')
    assert.equal(report.rows.find(row=>row[0]==='Summary')![totalIndex],estimate.subtotalCents/100)
    assert.equal(report.rows[0][report.headers.indexOf('Unit rate EUR')],0)
  }
})

test('missing or invalid prices remain blank and a partial estimate never becomes a complete quote',()=>{
  for(const rate of ['', ' ', '-1','Infinity','NaN']){
    const estimate=materialEstimate(plan,{...prices,boards:rate})
    assert.equal(estimate.complete,false)
    assert.equal(estimate.lines[0].rate,null)
    const report=buildCsvReport('quote',plan,s,{...prices,boards:rate})
    assert.equal(report.rows[0][report.headers.indexOf('Line total EUR')],null)
    assert.equal(report.rows.find(q=>q[0]==='Summary')![2],'Known priced subtotal')
  }
  const noPrices=buildCsvReport('quote',plan,s,{})
  assert.equal(noPrices.rows.find(q=>q[0]==='Summary')![6],null,'no entered rates must not look like a free quote')
})

test('unresolved frame quantities stay pending, remain in the materials list and cannot produce position/cut exports',()=>{
  const invalid={...s,frame:'small' as const,breakerWidth:'single' as const,pedestalDiameter:200,joistOverhang35:0,joistOverhang80:0},p=planDeck(invalid)
  assert.equal(p.frame.geometryPass,false)
  assert.ok(p.materials.some(q=>q.key==='profile35'))
  const estimate=materialEstimate(p,prices)
  for(const line of estimate.lines.filter(q=>q.key==='pedestals'||q.key.startsWith('profile'))){assert.equal(line.pending,true);assert.equal(line.cents,null)}
  assert.equal(estimate.complete,false)
  for(const kind of ['materials','quote'] as const){
    const report=buildCsvReport(kind,p,invalid,prices)
    for(const row of report.rows.filter(q=>q[1]==='pedestals'||String(q[1]).startsWith('profile'))){assert.equal(row[3],null);assert.equal(row[report.headers.indexOf('Line total EUR')],null)}
  }
  for(const kind of ['frame','pedestals'] as const){const report=buildCsvReport(kind,p,invalid,prices);assert.ok(report.unavailable);assert.equal(report.rows.length,0)}
  assert.ok(buildCsvReport('boards',p,invalid,prices).rows.length>0)
})

test('board cutting rows preserve every piece once and reconcile stock with kerf and one remainder per bar',()=>{
  const report=buildCsvReport('boards',plan,s,prices),h=report.headers,index=(n:string)=>h.indexOf(n)
  assert.equal(report.rows.length,plan.boards.pieces.length)
  assert.equal(new Set(report.rows.map(q=>q[index('Piece ID')])).size,report.rows.length)
  const ids=new Set(report.rows.map(q=>q[0]))
  for(const stock of ids){
    const rows=report.rows.filter(q=>q[0]===stock),sum=(column:string)=>rows.reduce((n,q)=>n+Number(q[index(column)]??0),0)
    close(sum('Blank cut length mm')+sum('Kerf before cut mm')+sum('End offcut mm (once per stock)'),s.board.stock*1000,rows.length*.11)
    assert.equal(rows.filter(q=>q[index('End offcut mm (once per stock)')]!==null).length,1)
  }
  assert.ok(report.rows.some(q=>q[index('Board use')]==='breaker'))
  assert.ok(report.rows.some(q=>String(q[index('Cut type')]).includes('rip')))
  assert.ok(report.rows.every(q=>String(q[index('Cut outline mm (local length width pairs)')]).includes(' | ')))
})

test('aluminium and skirting schedules map packed cuts back to real members and deck edges',()=>{
  const frame=buildCsvReport('frame',plan,s,prices),skirt=buildCsvReport('skirting',plan,s,prices)
  assert.equal(frame.rows.length,Object.values(plan.framePieces).reduce((n,q)=>n+q.length,0))
  assert.equal(skirt.rows.length,plan.skirtPieces.length)
  for(const report of [frame,skirt]){
    const h=report.headers,index=(n:string)=>h.indexOf(n)
    assert.equal(new Set(report.rows.map(q=>q[index('Piece ID')])).size,report.rows.length)
    for(const row of report.rows){
      const length=Math.hypot(Number(row[index('End X mm')])-Number(row[index('Start X mm')]),Number(row[index('End Y mm')])-Number(row[index('Start Y mm')]))
      close(length,Number(row[index('Cut length mm')]),.2)
      assert.ok(Number(row[index('Cut length mm')])<=Number(row[index('Stock length mm')])+.1)
    }
    for(const stock of new Set(report.rows.map(q=>q[0]))){
      const rows=report.rows.filter(q=>q[0]===stock),sum=(column:string)=>rows.reduce((n,q)=>n+Number(q[index(column)]??0),0)
      close(sum('Cut length mm')+sum('Kerf before cut mm')+sum('End offcut mm (once per stock)'),Number(rows[0][index('Stock length mm')]),rows.length*.11)
    }
  }
})

test('pedestal exports use physical deck axes after flipping the board run',()=>{
  const flipped={...s,direction:'vertical' as const},p=planDeck(flipped),report=buildCsvReport('pedestals',p,flipped,prices)
  assert.equal(report.rows.length,p.frame.pedestals.length)
  for(const [i,row] of report.rows.entries()){
    close(Number(row[1]),p.frame.pedestals[i].y*1000);close(Number(row[2]),p.frame.pedestals[i].x*1000)
    close(Number(row[5]),p.range.min);close(Number(row[6]),p.range.max)
  }
})

test('disabled skirting gives a clear unavailable report instead of a misleading empty order',()=>{
  const settings={...s,skirting:false},p=planDeck(settings),report=buildCsvReport('skirting',p,settings,prices)
  assert.ok(report.unavailable);assert.equal(report.rows.length,0)
  assert.ok(!buildCsvReport('materials',p,settings,prices).rows.some(q=>q[1]==='skirting'))
})

test('project details keep checks and notes in individual records with units and source limits',()=>{
  const report=buildCsvReport('project',plan,s,prices)
  assert.equal(report.rows.filter(q=>q[0]==='Check').length,plan.frame.checks.length)
  assert.equal(report.rows.filter(q=>q[0]==='Review note').length,plan.warnings.length)
  assert.equal(report.rows.filter(q=>q[0]==='Outline').length,s.polygon.length*2)
  assert.ok(report.rows.some(q=>q[1]==='Primary support span limit'&&q[2]===1500&&q[3]==='mm'))
})
