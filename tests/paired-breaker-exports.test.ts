import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, pieceOutline, planDeck } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { breakerBoardCount, breakerStripWidth } from '../src/breakerWidth.ts'
import { breakerSpace, keepBreakersInBounds, validBreakerPlacement } from '../src/breakerPlacement.ts'
import { pointInside } from '../src/deckGeometry.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { recommendFrames, selectAutomaticFrame } from '../src/frameRecommendation.ts'
import { materialEstimate } from '../src/materialEstimate.ts'
import { resolvedPricing } from '../src/pricing.ts'

const rect=(w:number,d:number)=>[{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]
const close=(a:number,b:number,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`)

test('saved manual breakers refit the real strip width after changing frame, board width, or explicit strip choice',()=>{
  for(const direction of ['horizontal','vertical'] as const){
    const polygon=direction==='horizontal'?rect(6,3.238):rect(3.238,6)
    const input:Settings={...DEFAULT_SETTINGS,polygon,direction,breakerMode:'manual',breakerPositions:[.264,.46,5.736],pedestalDiameter:205,board:{...DEFAULT_SETTINGS.board,stock:15},edgeDetailConfirmed:true}
    assert.equal(breakerBoardCount(input),1)
    assert.equal(validBreakerPlacement(input,input.breakerPositions!),true)
    for(const patch of [
      {frame:'big' as const},
      {breakerWidth:'double' as const},
      {breakerWidth:'double' as const,board:{...input.board,width:200}},
    ]){
      const changed={...input,...patch},fixed=keepBreakersInBounds(changed),space=breakerSpace(fixed),width=breakerStripWidth(fixed)
      assert.equal(breakerBoardCount(fixed),2)
      assert.equal(validBreakerPlacement(fixed,fixed.breakerPositions!),true)
      assert.notDeepEqual(fixed.breakerPositions,input.breakerPositions)
      assert.equal(fixed.breakerPositions!.length,input.breakerPositions!.length)
      assert.equal(fixed.edgeDetailConfirmed,false)
      assert.equal(fixed.height,input.height);assert.equal(fixed.variation,input.variation)
      assert.strictEqual(fixed.polygon,input.polygon);assert.strictEqual(fixed.board,changed.board)
      for(const [i,x] of fixed.breakerPositions!.entries()){
        assert.ok(x-width/2>=space.left+fixed.board.endGap/1000+.05-1e-6)
        assert.ok(x+width/2<=space.right-fixed.board.endGap/1000-.05+1e-6)
        if(i)assert.ok(x-fixed.breakerPositions![i-1]>=width+2*fixed.board.endGap/1000+.05-1e-6)
      }
      const plan=planDeck(fixed)
      for(const piece of plan.boards.pieces.filter(p=>p.kind==='breaker'))for(const point of pieceOutline(piece)){
        assert.equal(pointInside(plan.boards.fit.inner,point),true)
      }
    }
  }
})

test('paired-breaker board exports contain every physical piece once and no infill within the two-board strip',()=>{
  for(const direction of ['horizontal','vertical'] as const)for(const depth of [3.238,4]){
    const polygon=direction==='horizontal'?rect(6,depth):rect(depth,6)
    const supplied:Settings={...DEFAULT_SETTINGS,polygon,direction,frame:'big',frameSelection:'manual',pedestalSelection:'auto'}
    const s=selectAutomaticFrame(supplied),plan=planDeck(s),rates=resolvedPricing(s,{})
    assert.equal(plan.frame.geometryPass,true,plan.frame.issues.join('; '))
    assert.equal(breakerBoardCount(s),2);assert.equal(plan.boards.breakers.length,1)
    const breaker=plan.boards.breakers[0],width=breakerStripWidth(s),gap=s.board.endGap/1000
    const infill=plan.boards.pieces.filter(q=>q.kind==='infill'),breakers=plan.boards.pieces.filter(q=>q.kind==='breaker')
    assert.equal(infill.length,plan.boards.fit.rows*2,'there are exactly two infill bays in every rectangular row')
    assert.equal(breakers.length,depth===4?4:2,'each of the two real breaker boards is split only when longer than stock')
    assert.equal(new Set(breakers.map(q=>q.x.toFixed(6))).size,2)
    for(const piece of infill){
      assert.ok(piece.x+piece.length<=breaker-width/2-gap+1e-6||piece.x>=breaker+width/2+gap-1e-6,'no phantom infill lies between the paired breaker boards')
    }
    const report=buildCsvReport('boards',plan,s,rates),column=(name:string)=>report.headers.indexOf(name)
    const byPiece=new Map(report.rows.map(row=>[row[column('Piece ID')],row]))
    assert.equal(report.rows.length,plan.boards.pieces.length)
    assert.equal(byPiece.size,plan.boards.pieces.length)
    assert.equal(report.rows.filter(row=>row[column('Board use')]==='breaker').length,breakers.length)
    for(const [i,piece] of plan.boards.pieces.entries()){
      const row=byPiece.get(`B-${String(i+1).padStart(4,'0')}`)!
      assert.ok(row)
      assert.equal(row[column('Board use')],piece.kind)
      close(Number(row[column('Blank cut length mm')]),piece.length*1000,.051)
      close(Number(row[column('Finished maximum width mm')]),piece.width*1000,.051)
      assert.ok(Number(row[column('Blank cut length mm')])<=s.board.stock*1000+.051)
    }
    const stocks=new Set(report.rows.map(row=>row[column('Stock board ID')]))
    assert.equal(stocks.size,plan.boards.bars.length)
    assert.equal(stocks.size,plan.materials.find(q=>q.key==='boards')?.qty)
    const project=buildCsvReport('project',plan,s,rates),detail=(name:string)=>project.rows.find(row=>row[1]===name)
    assert.deepEqual(detail('Boards per breaker strip')?.slice(2,4),[2,'boards'])
    assert.deepEqual(detail('Breaker strip width')?.slice(2,4),[277,'mm'])
  }
})

test('automatic frame comparison prices the same strip geometry and purchased quantities shown in final exports',()=>{
  const overrides={boards:'42.25',profile35:'31.50',profile80:'37.80',pedestals:'10.25',clips:'0.47'}
  const stripCounts=new Set<number>()
  for(const selectionObjective of ['cost','pedestals'] as const){
    const input:Settings={...DEFAULT_SETTINGS,height:300,variation:0,selectionObjective}
    const recommendation=recommendFrames(input,overrides),choice=recommendation.selected!,s=selectAutomaticFrame(input,overrides),plan=planDeck(s),rates=resolvedPricing(s,overrides)
    assert.ok(choice);assert.equal(plan.frame.geometryPass,true)
    assert.equal(s.height,300);assert.equal(s.variation,0)
    assert.equal(s.frame,choice.frame);assert.equal(s.pedestalName,choice.settings.pedestalName)
    const estimate=materialEstimate(plan,rates)
    assert.equal(estimate.complete,true);assert.equal(estimate.subtotalCents,choice.materialCostCents)
    for(const kind of ['materials','quote'] as const){
      const report=buildCsvReport(kind,plan,s,rates),column=(name:string)=>report.headers.indexOf(name)
      assert.equal(report.rows.find(row=>row[0]==='Summary')![column('Line total EUR')],choice.materialCostCents!/100)
      for(const item of plan.materials){
        const row=report.rows.find(row=>row[column('Item ID')]===item.key)!
        assert.equal(row[column('Quantity')],item.qty)
        assert.equal(row[column('Unit rate EUR')],Number(rates[item.key]))
      }
    }
    assert.equal(buildCsvReport('pedestals',plan,s,rates).rows.length,choice.pedestals)
    assert.equal(buildCsvReport('frame',plan,s,rates).rows.length,choice.memberPieces)
    const project=buildCsvReport('project',plan,s,rates)
    assert.equal(project.rows.find(row=>row[1]==='Automatic selection priority')?.[2],selectionObjective==='cost'?'Lowest material cost':'Fewest pedestals')
    const count=breakerBoardCount(s);stripCounts.add(count)
    assert.equal(project.rows.find(row=>row[1]==='Boards per breaker strip')?.[2],count)
    assert.equal(plan.boards.pieces.filter(q=>q.kind==='breaker').length,count)
  }
  assert.ok(stripCounts.size>0);assert.ok([...stripCounts].every(n=>n===1||n===2),'Each objective prices the actual checked strip width; objectives may choose the same assembly')
})
