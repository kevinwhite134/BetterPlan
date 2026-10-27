import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { DEFAULT_SETTINGS, planDeck, validateSettings } from '../src/planner.ts'
import { pedestalHeight, pedestalHeights, setSurveyLevel } from '../src/pedestalSurvey.ts'
import { editableSupports } from '../src/supportEditing.ts'
import { arrangeSupportGroup, supportItemCentre, supportItemsInBox, translateSupportGroup } from '../src/supportGroups.ts'
import { sceneComponent, explosionOffset, pickBoard, pickStructure } from '../src/sceneComponents.ts'
import { buildCsvReport } from '../src/csvExport.ts'
import { installerPlan } from '../src/installerPlan.ts'
import { structureGeometry } from '../src/structureGeometry.ts'
import { resolvedPricing } from '../src/pricing.ts'
import { exportCustomerQuotePack } from '../src/customerQuotePack.ts'
import { customerPlanSvg } from '../src/customerPlan.ts'
import { recommendFrames } from '../src/frameRecommendation.ts'

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
test('group moves preserve relative geometry and leave unselected supports unchanged',()=>{
  const p=planDeck(DEFAULT_SETTINGS),draft=editableSupports(p,DEFAULT_SETTINGS),before=JSON.stringify(draft),items=[{kind:'member' as const,index:0},{kind:'pedestal' as const,index:0}],moved=translateSupportGroup(draft,items,{x:.125,y:-.05})
  near(moved.members[0].a.x-draft.members[0].a.x,.125);near(moved.members[0].b.y-draft.members[0].b.y,-.05)
  assert.deepEqual(moved.members[1],draft.members[1]);near(moved.pedestals[0].x-draft.pedestals[0].x,.125);assert.equal(JSON.stringify(draft),before)
})
test('group alignment, equal distribution and exact spacing use physical centres',()=>{
  const draft={version:1 as const,members:[],pedestals:[{x:3,y:1},{x:0,y:2},{x:1,y:3},{x:5,y:4}]},items=draft.pedestals.map((_,index)=>({kind:'pedestal' as const,index}))
  const aligned=arrangeSupportGroup(draft,items,'y','align');assert.ok(aligned.pedestals.every(p=>p.y===1))
  const distributed=arrangeSupportGroup(draft,items,'x','distribute');assert.deepEqual(distributed.pedestals.map(p=>p.x).sort((a,b)=>a-b),[0,5/3,10/3,5])
  const spaced=arrangeSupportGroup(draft,items,'x','spacing',.4);spaced.pedestals.map(p=>p.x).sort((a,b)=>a-b).forEach((x,i)=>near(x,i*.4))
  assert.equal(supportItemsInBox(draft,{x:-1,y:0},{x:3.1,y:3.1}).length,3);assert.equal(supportItemCentre(draft,items[0]).x,3)
})
test('surveyed ground levels shorten or lengthen the correct pedestal in either board direction',()=>{
  for(const direction of ['horizontal','vertical'] as const){const base={...DEFAULT_SETTINGS,direction},p=planDeck(base),point=p.frame.pedestals[0],physical=direction==='vertical'?{x:point.y,y:point.x}:point,s=setSurveyLevel(base,physical,20),h=pedestalHeight(point,s,p.frame.rule)
    near(h.required,base.height-base.board.thickness-p.frame.rule.joist-p.frame.rule.bearer-20);assert.equal(h.level,20);near(h.min,h.max)
    assert.equal(pedestalHeight({...point,x:point.x+.1},s,p.frame.rule).level,null,'a moved support does not inherit the old reading')
    assert.equal(pedestalHeights(p.frame.pedestals,s,p.frame.rule).surveyed,1)
    const parts=structureGeometry(p,s,'pedestals',true),bottom=Math.min(...parts[0].faces.flatMap(f=>f.points.map(p=>p.z)));near(bottom,-(base.height-20)/1000)
  }
})
test('survey height failures and individual required heights reach the plan, CSV and PDF model',()=>{
  const p=planDeck(DEFAULT_SETTINGS),s=setSurveyLevel(DEFAULT_SETTINGS,p.frame.pedestals[0],-500),next=planDeck(s),survey=pedestalHeights(next.frame.pedestals,s,next.frame.rule)
  assert.equal(next.heightFits,false);assert.equal(survey.rows[0].fits,false)
  const csv=buildCsvReport('pedestals',next,s,{}),model=installerPlan(next,s)
  near(Number(csv.rows[0][5]),survey.rows[0].required);assert.equal(csv.rows[0].at(-1),-500);near(model.pedestals[0].heightMin,survey.rows[0].required)
  assert.equal(setSurveyLevel(s,p.frame.pedestals[0],null).groundSurvey!.length,0)
})
test('project imports validate customer details and reject invalid or duplicated ground readings',()=>{
  assert.equal(validateSettings({...DEFAULT_SETTINGS,quotation:{customerName:'Test client',notes:'Notes\nSecond line'}}),'')
  assert.match(validateSettings({...DEFAULT_SETTINGS,groundSurvey:[{x:0,y:0,level:NaN}]}),/Ground readings/)
  assert.match(validateSettings({...DEFAULT_SETTINGS,groundSurvey:[{x:0,y:0,level:0},{x:0,y:0,level:1}]}),/one ground reading/)
  assert.match(validateSettings({...DEFAULT_SETTINGS,quotation:{notes:'a'.repeat(6001)}}),/Quotation notes/)
})
test('clickable component metadata uses real positions and correct quotation categories',()=>{
  const p=planDeck(DEFAULT_SETTINGS),before=JSON.stringify(p)
  for(const [id,key] of [['board-0','boards'],['member-0',`profile${p.frame.members[0].size}`],['pedestal-0','pedestals']]){const part=sceneComponent(p,DEFAULT_SETTINGS,id)!;assert.equal(part.materialKey,key);assert.ok(part.rings.length);assert.ok(Number.isFinite(part.point.x))}
  assert.equal(sceneComponent(p,DEFAULT_SETTINGS,'board-999999'),null)
  assert.equal(JSON.stringify(p),before)
})
test('explosion separates tiers without moving the model and hit testing finds real board and support pieces',()=>{
  const p=planDeck(DEFAULT_SETTINGS),s=DEFAULT_SETTINGS
  assert.ok(explosionOffset('board',.3,true)>explosionOffset('joist',.3,true));assert.ok(explosionOffset('joist',.3,true)>explosionOffset('bearer',.3,true));assert.equal(explosionOffset('pedestal',.3,true),0)
  const piece=sceneComponent(p,s,'board-0')!,q={x:piece.point.x,y:piece.point.y}
  assert.ok(pickBoard(p,s,q,p=>p)?.startsWith('board-'))
  const m=p.frame.members[0],point={x:(m.a.x+m.b.x)/2,y:(m.a.y+m.b.y)/2}
  assert.ok(pickStructure(p,s,point,'joists',false,p=>p,.01))
})
test('customer pack includes a cover, itemised quotation, dimensioned plan and optional installer pages',async()=>{
  const s={...DEFAULT_SETTINGS,quotation:{customerName:'Test Customer',siteAddress:'Example site',projectReference:'BD-TEST',notes:'Customer notes'}},p=planDeck(s),prices=resolvedPricing(s,{})
  const short=await PDFDocument.load(await exportCustomerQuotePack(p,s,prices));assert.match(short.getTitle()!,/BD-TEST/);assert.ok(short.getPageCount()>=3)
  const full=await PDFDocument.load(await exportCustomerQuotePack(p,s,prices,{includeInstaller:true}));assert.ok(full.getPageCount()>short.getPageCount())
  const long=await PDFDocument.load(await exportCustomerQuotePack(p,{...s,quotation:{...s.quotation,notes:'A long note with words and newlines.\n'.repeat(150)}},prices));assert.ok(long.getPageCount()>short.getPageCount())
  const svg=customerPlanSvg(p,s);assert.match(svg,/6000 mm overall/);assert.match(svg,/<path/)
})
test('survey-aware recommendations check each product range even when base geometry is shared',()=>{
  const s={...DEFAULT_SETTINGS,polygon:[{x:0,y:0},{x:3.6,y:0},{x:3.6,y:3.2},{x:0,y:3.2}],height:125,variation:0,frame:'small' as const,frameSelection:'manual' as const},p=planDeck(s),survey=setSurveyLevel(s,p.frame.pedestals[0],5),result=recommendFrames(survey)
  for(const option of result.options)for(const choice of option.alternatives){const checked=planDeck(choice.settings);assert.equal(checked.heightFits,true);assert.equal(pedestalHeights(checked.frame.pedestals,choice.settings,checked.frame.rule).fits,true)}
})
