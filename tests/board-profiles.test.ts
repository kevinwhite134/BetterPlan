import test from 'node:test'
import assert from 'node:assert/strict'
import { boardProfileError, saveBoardProfile } from '../src/boardProfiles.ts'
import { DEFAULT_BOARD, isBoardProfile } from '../src/planner.ts'

test('valid wide and thick boards save without building a tiny dummy deck',()=>{
  for(const width of [60,136,156,180,200,300])for(const stock of [.3,3.66,4.88,15]){
    const board={...DEFAULT_BOARD,width,stock,thickness:40},result=saveBoardProfile(board,'  Saved board  ',[],()=>`board-${width}-${stock}`)
    assert.equal(result.profile.name,'Saved board');assert.equal(result.profile.width,width);assert.equal(result.profile.stock,stock)
    assert.equal(result.profiles.length,1);assert.equal(isBoardProfile(result.profile),true)
    assert.deepEqual(JSON.parse(JSON.stringify(result.profiles)),result.profiles,'profiles survive browser storage serialization')
  }
})
test('updating a profile by name preserves its ID, order and all edited product details',()=>{
  const first={...DEFAULT_BOARD,id:'oak',name:'Oak'},second={...DEFAULT_BOARD,id:'grey',name:'Grey'},profiles=[first,second]
  const before=JSON.stringify(profiles),result=saveBoardProfile({...second,width:156,thickness:30,gap:6,endGap:8,colour:'#556677',colourName:'Silver grey'},'  gReY ',profiles,()=>{throw new Error('Existing products must keep their ID')})
  assert.equal(result.profiles.length,2);assert.equal(result.profiles[0],first);assert.equal(result.profile.id,'grey');assert.equal(result.profiles[1],result.profile)
  assert.deepEqual({...result.profile,id:'',name:''},{...second,id:'',name:'',width:156,thickness:30,gap:6,endGap:8,colour:'#556677',colourName:'Silver grey'})
  assert.equal(JSON.stringify(profiles),before,'saving does not mutate prior profiles')
})
test('saving under a different name makes another reusable product without overwriting the original',()=>{
  const existing={...DEFAULT_BOARD,id:'existing',name:'Original'},result=saveBoardProfile({...existing,width:180},'New product',[existing],()=> 'new')
  assert.deepEqual(result.profiles.map(p=>p.id),['existing','new']);assert.equal(result.profiles[0].width,136);assert.equal(result.profile.width,180)
})
test('invalid products report the field to correct and do not produce a saved profile',()=>{
  const invalid:[Partial<typeof DEFAULT_BOARD>,RegExp][]=[
    [{width:301},/Board width/],[{width:NaN},/Board width/],[{thickness:5},/Board thickness/],
    [{stock:0},/stock length/],[{gap:0},/Side-to-side gap/],[{endGap:21},/End-to-end gap/],
    [{colour:'green'},/six-digit board colour/],
  ]
  for(const [patch,message] of invalid){assert.throws(()=>saveBoardProfile({...DEFAULT_BOARD,...patch},'Product',[],()=> 'id'),message);assert.equal(isBoardProfile({...DEFAULT_BOARD,...patch}),false)}
  assert.throws(()=>saveBoardProfile(DEFAULT_BOARD,'   ',[]),/name/)
  assert.ok(boardProfileError(null));assert.ok(boardProfileError({}));assert.ok(boardProfileError({...DEFAULT_BOARD,name:''}))
})
