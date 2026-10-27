import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { DEFAULT_SETTINGS, frameRule, planDeck, validateSettings } from '../src/planner.ts'
import type { Settings } from '../src/planner.ts'
import { appliedProduct, applyProduct, importProductLibrary, mergeProductLibraries, productError, productFromSettings, readProductLibrary, sameProduct, saveProduct } from '../src/productLibrary.ts'
import type { BoardProduct, FrameProduct, LibraryProduct, PedestalProduct } from '../src/productLibrary.ts'
import { defaultPricing, resolvedPricing } from '../src/pricing.ts'
import { computeDeckPlanning } from '../src/planning.ts'
import type { PlanningReply } from '../src/planning.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { materialEstimate } from '../src/materialEstimate.ts'

const board:BoardProduct={kind:'board',id:'oak',name:'Oak 156',sku:'OAK156',supplier:'Board supplier',notes:'Matching fixing required.',unitPrice:52.5,board:{...DEFAULT_SETTINGS.board,id:'oak',name:'Oak 156',width:156,thickness:26,stock:4.88,colour:'#cfa76c',colourName:'Natural oak',gap:6,endGap:8},joistCentres:350,endBearing:12}
const pedestal:PedestalProduct={kind:'pedestal',id:'p1',name:'Saved pedestal',sku:'P-150',min:30,max:450,diameter:155,unitPrice:8.75}
const frame:FrameProduct={kind:'frame',id:'f1',name:'K35 standard',height:35,stock:3,faceWidth:35,unitPrice:31.2}
const baseline:Settings={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}],joints:'butt',height:250,variation:0,frame:'small',frameSelection:'manual',pedestalSelection:'manual',pedestalName:'Custom pedestal',pedestalMin:1,pedestalMax:500,pedestalDiameter:150}

test('legacy board profiles migrate without duplicates and remain available after a browser storage round trip',()=>{
  const old={...board.board,id:'legacy',name:'Legacy oak'},saved=readProductLibrary(null,[old,null,{id:'bad'}])
  assert.equal(saved.length,1);assert.equal(saved[0].kind,'board');assert.equal(saved[0].id,'legacy')
  const stored=JSON.parse(JSON.stringify(saved))
  assert.deepEqual(readProductLibrary(stored,[old]),saved)
  assert.deepEqual(readProductLibrary(stored,[]),saved,'starting a deck without legacy profiles retains the library')
  assert.equal(productError(saved[0]),'')
})

test('saving, editing and duplicating products preserves their complete data independently of a project',()=>{
  const products=saveProduct(saveProduct([],board),pedestal),before=JSON.stringify(products)
  const edited=saveProduct(products,{...board,name:'  Oak renamed  ',unitPrice:55})
  assert.equal(edited.length,2);assert.equal(edited[0].name,'Oak renamed');assert.equal(edited[0].unitPrice,55)
  assert.equal(edited[0].kind==='board'&&edited[0].board.name,'Oak renamed')
  assert.equal(edited[0].sku,'OAK156');assert.equal(edited[0].notes,board.notes)
  assert.equal(JSON.stringify(products),before)
  const duplicated=saveProduct(edited,{...board,id:'copy',name:'Another finish'})
  assert.equal(duplicated.length,3)
  assert.throws(()=>saveProduct(edited,{...board,id:'different',name:'oak renamed'}),/already exists/)
  assert.deepEqual(JSON.parse(JSON.stringify(duplicated)),readProductLibrary(JSON.parse(JSON.stringify(duplicated))))
})

test('invalid product dimensions and price data cannot be saved or partially imported',()=>{
  const invalid:unknown[]=[null,{}, {...board,name:' '},{...board,board:{...board.board,thickness:5}}, {...board,joistCentres:1501},{...board,endBearing:0},
    {...pedestal,min:0},{...pedestal,max:20},{...pedestal,diameter:20}, {...frame,height:50},{...frame,stock:0},{...frame,faceWidth:300},{...frame,maxOverhang:501},
    {...board,unitPrice:-1},{...pedestal,unitPrice:Infinity},{...frame,unitPrice:'20'},{...frame,notes:25}]
  for(const p of invalid){assert.ok(productError(p));assert.throws(()=>saveProduct([],p as LibraryProduct));assert.throws(()=>importProductLibrary({version:1,products:[board,p]}))}
  assert.throws(()=>importProductLibrary({version:2,products:[]}));assert.throws(()=>importProductLibrary({version:1,products:{}}))
  assert.equal(productError({...frame,maxOverhang:0,unitPrice:0}),'')
  assert.equal(productError({...frame,maxOverhang:undefined,unitPrice:undefined}),'')
})

test('library imports preserve existing records, retain conflicting variants and are idempotent',()=>{
  const current=[board,pedestal],incoming=importProductLibrary({version:1,type:'betterplan-products',products:[{...board,unitPrice:77},frame]})
  const merged=mergeProductLibraries(current,incoming)
  assert.equal(merged.length,4);assert.equal(merged[0].unitPrice,52.5)
  assert.equal(merged[2].unitPrice,77);assert.notEqual(merged[2].id,board.id)
  assert.match(merged[2].name,/import/)
  assert.deepEqual(mergeProductLibraries(merged,incoming),merged)
  const reordered=Object.fromEntries(Object.entries(board).reverse()) as BoardProduct
  assert.equal(sameProduct(reordered,board),true)
  assert.deepEqual(mergeProductLibraries(current,[reordered]),current)
})

test('selecting a board applies real installation dimensions without changing the customer outline or height',()=>{
  const input={...baseline,supportLayout:{version:1 as const,members:[],pedestals:[]}},original=JSON.stringify(input)
  const next=applyProduct(input,{boards:'99',pedestals:'10'},board)
  assert.equal(validateSettings(next.settings),'');assert.equal(next.settings.board.width,156);assert.equal(next.settings.board.thickness,26)
  assert.equal(next.settings.board.stock,4.88);assert.equal(next.settings.joistSpacing,350);assert.equal(next.settings.boardEndBearing,12)
  assert.deepEqual(next.settings.polygon,input.polygon);assert.equal(next.settings.height,250);assert.equal(next.settings.variation,0)
  assert.equal(next.settings.supportLayout,undefined,'a different product regenerates actual supports')
  assert.deepEqual(next.prices,{pedestals:'10'});assert.equal(resolvedPricing(next.settings,next.prices).boards,'52.50')
  const plan=planDeck(next.settings)
  assert.ok(plan.boards.pieces.some(p=>Math.abs(p.width-.156)<1e-6));assert.ok(plan.materials.find(p=>p.key==='boards')?.name.includes(board.name))
  assert.equal(JSON.stringify(input),original)
})

test('saved pedestal selection uses its actual base and adjustment range, retaining automatic frame choice',()=>{
  const input={...baseline,frameSelection:'auto' as const,pedestalSelection:'auto' as const},selected=applyProduct(input,{},pedestal).settings
  assert.equal(selected.pedestalSelection,'manual');assert.equal(selected.frameSelection,'auto')
  const result=computeDeckPlanning(selected,{})
  assert.equal(result.error,'');assert.ok(result.plan?.frame.geometryPass)
  assert.equal(result.settings.pedestalName,pedestal.name);assert.equal(result.settings.pedestalDiameter,155)
  assert.equal(result.settings.pedestalMin,30);assert.equal(result.settings.pedestalMax,450);assert.equal(result.settings.height,input.height)
  assert.equal(resolvedPricing(result.settings,{}).pedestals,'8.75')
  const radius=pedestal.diameter/1000
  const peds=result.plan.frame.pedestals
  for(let i=0;i<peds.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(peds[i].x-peds[j].x,peds[i].y-peds[j].y)>=radius-1e-6)
})

test('frame profiles apply stock, bearing face and optional caps while retaining report spans',()=>{
  for(const height of [35,80] as const){
    const p={...frame,height,maxOverhang:undefined},s=applyProduct({...baseline,joistOverhang35:2,joistOverhang80:4},{},p).settings
    assert.equal(s.frame,height===35?'small':'big');assert.equal(s.frameSelection,'manual')
    assert.equal(s.frameStock,3);assert.equal(s.frameFaceWidth,35)
    assert.equal(height===35?s.joistOverhang35:s.joistOverhang80,undefined)
    assert.equal(frameRule(s.frame,3).support,height===35?.9:1.9)
    assert.equal(frameRule(s.frame,5).support,height===35?.6:1.6)
    assert.equal(resolvedPricing(s,{})[`profile${height}`],'31.20')
  }
  const limited=applyProduct(baseline,{}, {...frame,maxOverhang:0}).settings
  assert.equal(limited.joistOverhang35,0);assert.ok(!planDeck(limited).frame.geometryPass,'a saved zero supplier limit is enforced')
})

test('project snapshots retain original product prices after library edits/removal and ignore stale matches',()=>{
  const selected=applyProduct(baseline,{},board).settings
  const library=saveProduct([board],{...board,unitPrice:99})
  assert.equal(library[0].unitPrice,99);assert.equal(defaultPricing(selected).rates.boards,'52.50')
  assert.equal(defaultPricing(JSON.parse(JSON.stringify(selected))).rates.boards,'52.50','project JSON retains product snapshots without the library')
  assert.equal(defaultPricing({...selected,board:{...selected.board,stock:3.66}}).rates.boards,defaultPricing({...baseline,board:{...selected.board,stock:3.66}}).rates.boards)
  assert.equal(appliedProduct({...selected,board:{...selected.board,width:140}},'board'),undefined)
  const p=applyProduct(baseline,{},pedestal).settings
  assert.equal(appliedProduct({...p,pedestalDiameter:205},'pedestal'),undefined)
  assert.equal(resolvedPricing(selected,{boards:'0'}).boards,'0');assert.equal(resolvedPricing(selected,{boards:''}).boards,'')
})

test('selected product rates, actual quantities and totals agree in material and CSV quotes',()=>{
  let s=baseline
  for(const p of [board,pedestal,frame])s=applyProduct(s,{},p).settings
  const plan=planDeck(s),rates=resolvedPricing(s,{}),estimate=materialEstimate(plan,rates),csv=buildCsvReport('quote',plan,s,rates)
  assert.ok(plan.frame.geometryPass,plan.frame.issues.join('\n'));assert.equal(estimate.complete,true)
  assert.equal(estimate.lines.find(l=>l.key==='boards')?.rate,52.5)
  assert.equal(csv.rows.find(r=>r[0]==='Summary')![6],estimate.subtotalCents/100)
  assert.equal(estimate.lines.find(l=>l.key==='profile35')?.name,`${frame.name} · 3 m`)
  assert.equal(defaultPricing(s).basis.find(b=>b.key==='boards')?.source,'','a saved product rate must not claim the benchmark source')
})

test('saving current product details captures current dimensions without project-only geometry and customer height',()=>{
  for(const kind of ['board','pedestal','frame'] as const){
    const p=productFromSettings(kind,baseline,`saved-${kind}`)
    assert.equal(productError(p),'');assert.equal('polygon' in p,false);assert.equal('variation' in p,false)
    assert.equal(p.id,`saved-${kind}`)
  }
})

test('the actual planning worker preserves selected library product settings and prices', {timeout:30000},async()=>{
  const source=new URL('../src/planning.worker.ts',import.meta.url).href
  const bridge=`const {parentPort}=require('node:worker_threads');globalThis.self={onmessage:null,postMessage:data=>parentPort.postMessage(data)};parentPort.on('message',data=>self.onmessage({data}));import(${JSON.stringify(source)}).then(()=>parentPort.postMessage({ready:true}));`
  const worker=new Worker(bridge,{eval:true,execArgv:['--experimental-strip-types']})
  let s=baseline
  for(const p of [board,pedestal,frame])s=applyProduct(s,{},p).settings
  try{
    const reply=await new Promise<PlanningReply>((resolve,reject)=>{worker.on('error',reject);worker.on('message',data=>{if(data.ready)worker.postMessage({key:'saved-products',settings:s,prices:{}});else resolve(data)})})
    assert.equal(reply.result.error,'');assert.ok(reply.result.plan?.frame.geometryPass)
    assert.deepEqual(reply.result.settings.products,s.products);assert.equal(reply.result.settings.height,250)
    assert.equal(resolvedPricing(reply.result.settings,{}).boards,'52.50');assert.equal(resolvedPricing(reply.result.settings,{}).pedestals,'8.75')
    assert.equal(reply.result.plan.materials.find(l=>l.key==='profile35')?.name,`${frame.name} · 3 m`)
  }finally{await worker.terminate()}
})
