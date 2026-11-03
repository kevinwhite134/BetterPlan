import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../src/planner.ts'
import { DEFAULT_SECTIONS, initialWorkspace, makeProject, parseProjectFile, projectFile, readProjectWorkspace, saveActiveProject, visibleProjects } from '../src/projectLibrary.ts'
import { projectThumbnail } from '../src/projectThumbnail.ts'

test('legacy current and previous decks migrate without sharing project state',()=>{
  const previous={settings:{...DEFAULT_SETTINGS,frameStock:3.66},prices:{boards:'0'}}
  const w=initialWorkspace(DEFAULT_SETTINGS,{boards:'17'},previous)
  assert.equal(w.projects.length,2);assert.equal(w.projects[1].settings.frameStock,3.66)
  assert.notEqual(w.projects[0].id,w.projects[1].id);assert.deepEqual(w.projects[0].prices,{boards:'17'})
  w.projects[0].settings.board.width=155
  assert.equal(DEFAULT_SETTINGS.board.width,136);assert.equal(w.projects[1].settings.board.width,136)
  assert.equal(initialWorkspace(DEFAULT_SETTINGS,{},null).projects.length,1)
  assert.equal(initialWorkspace(DEFAULT_SETTINGS,{}, {settings:DEFAULT_SETTINGS,prices:{}}).projects.length,1)
  assert.equal(initialWorkspace(DEFAULT_SETTINGS,{}, {settings:undefined,prices:{}} as never).projects.length,1)
})

test('saving only updates the active project and preserves the catalogue metadata',()=>{
  const a=makeProject('Home','residential',undefined,'a',1),b=makeProject('Hotel','commercial',undefined,'b',2)
  const w={version:1 as const,activeId:'a',projects:[a,b],sections:DEFAULT_SECTIONS}
  const edited={settings:{...DEFAULT_SETTINGS,height:375,quotation:{customerName:'A',deliveryNet:50,vatRate:0}},prices:{boards:'0',pedestals:''},stage:'materials' as const}
  const next=saveActiveProject(w,edited,3)
  assert.equal(next.projects[0].name,'Home');assert.equal(next.projects[0].sectionId,'residential');assert.equal(next.projects[0].stage,'materials')
  assert.equal(next.projects[0].updatedAt,3);assert.equal(next.projects[0].lastOpenedAt,1)
  assert.equal(next.projects[1],b);assert.equal(w.projects[0].settings.height,DEFAULT_SETTINGS.height)
  assert.equal(saveActiveProject(next,edited,4),next,'Unchanged renders do not repeatedly save')
  assert.equal(saveActiveProject(next,{...edited,settings:{...edited.settings,height:-1}},4),next,'Invalid draft settings do not replace the saved design')
})

test('project files round-trip names, sections, prices, customer data and legacy stock',()=>{
  const p=makeProject('Hotel terrace','commercial',{settings:{...DEFAULT_SETTINGS,frameStock:3.66,quotation:{customerName:'Test',customerEircode:'D02 XY12',deliveryNet:23.15,vatRate:0}},prices:{boards:'0',profile35:''},stage:'finish'})
  const imported=parseProjectFile(JSON.parse(JSON.stringify(projectFile(p,DEFAULT_SECTIONS,[]))))
  assert.equal(imported.name,p.name);assert.equal(imported.section,'Commercial');assert.deepEqual(imported.settings,p.settings);assert.deepEqual(imported.prices,p.prices)
  const legacy=parseProjectFile({version:1,settings:DEFAULT_SETTINGS,prices:{boards:'12'},profiles:[]},'Legacy deck')
  assert.equal(legacy.name,'Legacy deck');assert.deepEqual(legacy.prices,{boards:'12'})
  assert.throws(()=>parseProjectFile({version:2,settings:DEFAULT_SETTINGS}),/version/)
  assert.throws(()=>parseProjectFile({version:1}),/settings/)
  assert.throws(()=>parseProjectFile({version:1,settings:DEFAULT_SETTINGS,products:[{}]}),/Product import/)
  assert.throws(()=>parseProjectFile({version:1,settings:DEFAULT_SETTINGS,prices:{boards:-1}}),/prices/)
})

test('recent projects follow last opened time and section searches do not mutate order',()=>{
  const projects=Array.from({length:15},(_,i)=>({...makeProject(`Deck ${i}`,i%2?'commercial':'residential',undefined,String(i),i+1),lastOpenedAt:100-i}))
  const before=projects.map(p=>p.id)
  assert.equal(visibleProjects(projects,'recent','').length,12);assert.equal(visibleProjects(projects,'recent','')[0].id,'0')
  assert.equal(visibleProjects(projects,'all','')[0].id,'14')
  assert.equal(visibleProjects(projects,'commercial','Deck 1').length,3)
  assert.deepEqual(projects.map(p=>p.id),before)
})

test('workspace validation rejects broken records without silently discarding projects',()=>{
  const w=initialWorkspace(DEFAULT_SETTINGS,{})
  assert.deepEqual(readProjectWorkspace(JSON.parse(JSON.stringify(w))),w)
  assert.throws(()=>readProjectWorkspace({...w,activeId:'missing'}),/could not be found/)
  assert.throws(()=>readProjectWorkspace({...w,projects:[...w.projects,...w.projects]}),/could not be read/)
  assert.throws(()=>readProjectWorkspace({...w,projects:[{...w.projects[0],settings:null}]}),/could not be read/)
})

test('library previews follow shape, openings, colour and board direction without planning a support frame',()=>{
  const svg=projectThumbnail(DEFAULT_SETTINGS)
  assert.equal(svg,projectThumbnail(DEFAULT_SETTINGS));assert.ok(!/NaN|Infinity/.test(svg));assert.match(svg,/clipPath/)
  assert.notEqual(svg,projectThumbnail({...DEFAULT_SETTINGS,direction:'vertical'}))
  assert.notEqual(svg,projectThumbnail({...DEFAULT_SETTINGS,board:{...DEFAULT_SETTINGS.board,colour:'#abc123'}}))
  assert.notEqual(svg,projectThumbnail({...DEFAULT_SETTINGS,cutouts:[{id:'h',name:'Opening',polygon:[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]}]}))
  const shifted={...DEFAULT_SETTINGS,polygon:DEFAULT_SETTINGS.polygon.map(p=>({x:p.x-4,y:p.y-7}))}
  assert.equal(projectThumbnail(shifted),svg,'The preview uses the physical outline rather than an arbitrary site offset')
})
