import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { createDeckWorkbook, exportDeckWorkbook } from '../src/workbookExport.ts'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { materialEstimate } from '../src/materialEstimate.ts'

const s={...DEFAULT_SETTINGS,skirting:true},plan=planDeck(s)
const prices=Object.fromEntries(plan.materials.map((q,i)=>[q.key,String(i?i*1.23:0)]))

test('styled Excel round-trips all available schedules, frozen headings, filters and numeric currency formats',async()=>{
  const data=await exportDeckWorkbook(plan,s,prices),wb=new ExcelJS.Workbook()
  await wb.xlsx.load(data)
  assert.deepEqual(wb.worksheets.map(q=>q.name),['Quote','Materials','Board cuts','Alu-Joist cuts','Fascia cuts','Pedestals','Project details'])
  for(const ws of wb.worksheets){
    assert.equal(ws.views[0].showGridLines,false)
    assert.equal(ws.views[0].state,'frozen')
    assert.ok(ws.autoFilter)
    assert.equal(ws.getCell('A8').fill.type,'pattern')
    assert.ok(ws.getColumn(1).width!>=30||ws.name==='Board cuts'||ws.name==='Alu-Joist cuts'||ws.name==='Fascia cuts'||ws.name==='Pedestals'||ws.name==='Project details')
  }
  const materials=wb.getWorksheet('Materials')!,quote=wb.getWorksheet('Quote')!
  assert.equal(materials.getCell('G9').value,0)
  assert.equal(materials.getCell('B9').numFmt,'#,##0')
  assert.equal(materials.getCell('G9').numFmt.includes('€'),true)
  assert.equal(materials.getCell('H9').result,0)
  assert.equal(quote.getCell('E9').result,0)
  assert.equal(materials.getCell('H9').formula,'IF(AND(ISNUMBER(B9),ISNUMBER(G9)),ROUND(B9*G9,2),"")')
  assert.equal(quote.getCell('E9').formula,'IF(ISNUMBER(Materials!H9),Materials!H9,"")')
  assert.equal(quote.getCell(`E${9+plan.materials.length+1}`).result,materialEstimate(plan,prices).subtotalCents/100)
  assert.equal(wb.getWorksheet('Project details')!.getCell('D9').value,null)
})

test('missing workbook prices and unavailable quantities never cache a numeric zero',()=>{
  const unpriced=createDeckWorkbook(plan,s,{})
  assert.equal(unpriced.getWorksheet('Materials')!.getCell('G9').value,null)
  assert.equal(unpriced.getWorksheet('Materials')!.getCell('H9').result,'')
  assert.equal(unpriced.getWorksheet('Quote')!.getCell('E9').result,'')
  const invalid={...s,pedestalDiameter:400,joistOverhang35:0,joistOverhang80:0},p=planDeck(invalid),wb=createDeckWorkbook(p,invalid,prices)
  assert.ok(!wb.getWorksheet('Alu-Joist cuts'))
  assert.ok(!wb.getWorksheet('Pedestals'))
  const pending=materialEstimate(p,prices).lines.findIndex(q=>q.key==='pedestals')+9
  assert.equal(wb.getWorksheet('Materials')!.getCell(`B${pending}`).value,null)
  assert.equal(wb.getWorksheet('Materials')!.getCell(`H${pending}`).result,'')
})

test('workbook amounts are linked to one editable rate source and remain recalculable',()=>{
  const wb=createDeckWorkbook(plan,s,prices),m=wb.getWorksheet('Materials')!,q=wb.getWorksheet('Quote')!
  for(let i=0;i<plan.materials.length;i++){
    const r=i+9
    assert.equal(q.getCell(`D${r}`).formula,`IF(ISNUMBER(Materials!G${r}),Materials!G${r},"")`)
    assert.equal(q.getCell(`F${r}`).formula,`Materials!I${r}`)
    assert.equal(m.getCell(`G${r}`).dataValidation.type,'decimal')
  }
  assert.equal(wb.calcProperties.fullCalcOnLoad,true)
})

test('user product names remain literal strings in the workbook',async()=>{
  const settings={...s,board:{...s.board,name:'=HYPERLINK("https://example.com")'}},p=planDeck(settings)
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportDeckWorkbook(p,settings,{}))
  assert.equal(wb.getWorksheet('Materials')!.getCell('A9').type,ExcelJS.ValueType.String)
  assert.ok(String(wb.getWorksheet('Materials')!.getCell('A9').value).startsWith('='))
})
