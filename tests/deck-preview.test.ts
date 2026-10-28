import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { deckPreviewSvg, deckPreviewUrl } from '../src/deckPreview.ts'
import { DEFAULT_SETTINGS, planDeck } from '../src/planner.ts'
import { exportDeckWorkbook } from '../src/workbookExport.ts'

test('header render includes real board pieces and fits concave decks in either board direction',()=>{
  const polygon=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:4,y:2},{x:4,y:4},{x:0,y:4}]
  for(const direction of ['horizontal','vertical'] as const)for(const skirting of [false,true]){
    const s={...DEFAULT_SETTINGS,polygon,direction,skirting,board:{...DEFAULT_SETTINGS.board,stock:4.88,colour:'#536775'}},p=planDeck(s),svg=deckPreviewSvg(p,s)
    assert.ok(!/NaN|Infinity|undefined/.test(svg))
    assert.equal((svg.match(/fill="#536775"/g)||[]).length,p.boards.pieces.length)
    const [x,y,w,h]=svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    assert.ok(w>0&&h>0)
    for(const match of svg.matchAll(/points="([^"]+)"/g))for(const pair of match[1].split(' ')){
      const [a,b]=pair.split(',').map(Number)
      assert.ok(a>=x-1e-3&&a<=x+w+1e-3&&b>=y-1e-3&&b<=y+h+1e-3,'rendered surfaces stay inside the snapshot bounds')
    }
    assert.equal(decodeURIComponent(deckPreviewUrl(svg).split(',')[1]),svg)
  }
})

test('header render follows changes to the deck colour, board direction and skirting',()=>{
  const svg=deckPreviewSvg(planDeck(DEFAULT_SETTINGS),DEFAULT_SETTINGS)
  for(const s of [{...DEFAULT_SETTINGS,direction:'vertical' as const},{...DEFAULT_SETTINGS,skirting:false},{...DEFAULT_SETTINGS,board:{...DEFAULT_SETTINGS.board,colour:'#333333'}}])assert.notEqual(deckPreviewSvg(planDeck(s),s),svg)
})

test('Excel embeds one shared preview in the quote and material headers without moving the cutting tables',async()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII='
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportDeckWorkbook(planDeck(DEFAULT_SETTINGS),DEFAULT_SETTINGS,{},png))
  for(const name of ['Quote','Materials']){
    const ws=wb.getWorksheet(name)!,images=ws.getImages()
    assert.equal(images.length,1)
    assert.equal(images[0].range.ext?.width,270)
    assert.equal(images[0].range.ext?.height,150)
    assert.equal(images[0].range.tl.nativeRow,2)
    assert.equal(ws.getCell('A8').value,'Component')
    assert.equal(ws.getRow(4).height,42)
    assert.equal(ws.getRow(6).height,30)
  }
  assert.equal(wb.getWorksheet('Board cuts')!.getImages().length,0)
  assert.equal(wb.getWorksheet('Quote')!.getImages()[0].imageId,wb.getWorksheet('Materials')!.getImages()[0].imageId)
})
