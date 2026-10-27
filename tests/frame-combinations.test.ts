import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { planBoardsOnly, planDeck } from '../src/planner.ts'
import type { Frame, Member, Plan, Point, Settings } from '../src/planner.ts'

const fixture:Settings=JSON.parse(fs.readFileSync(new URL('./fixtures/irregular-opening-update.json',import.meta.url),'utf8'))
const T=2e-5,frames:Frame[]=['small','big','small-small','big-small']
// Independent transcription of the supplied K Series cases. A production
// rule change must not silently expand these acceptance limits.
const reportLimits:Record<Frame,Record<3|5,[number,number,number,number]>>={
  small:{3:[35,0,.9,0],5:[35,0,.6,0]},
  big:{3:[80,0,1.9,0],5:[80,0,1.6,0]},
  'small-small':{3:[35,35,.7,.9],5:[35,35,.8,.6]},
  'big-small':{3:[35,80,1.5,.9],5:[35,80,1.5,.6]},
}
const delta=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y})
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const at=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
function pointDistance(q:Point,m:{a:Point;b:Point}){
  const d=delta(m.b,m.a),l=d.x*d.x+d.y*d.y,t=l?Math.max(0,Math.min(1,((q.x-m.a.x)*d.x+(q.y-m.a.y)*d.y)/l)):0
  return distance(q,at(m.a,m.b,t))
}
function inside(ring:Point[],q:Point){
  let crossings=0
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length]
    if(pointDistance(q,{a,b})<T)return true
    if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)crossings++
  }
  return crossings%2===1
}
function hits(a:Member,b:Member):number[]{
  const u=delta(a.b,a.a),v=delta(b.b,b.a),r=delta(b.a,a.a),den=cross(u,v),l=distance(a.a,a.b)
  if(Math.abs(den)<1e-10)return [...[b.a,b.b].filter(q=>pointDistance(q,a)<T).map(q=>Math.max(0,Math.min(l,((q.x-a.a.x)*u.x+(q.y-a.a.y)*u.y)/l))),...(pointDistance(a.a,b)<T?[0]:[]),...(pointDistance(a.b,b)<T?[l]:[])]
  const t=cross(r,v)/den,s=cross(r,u)/den
  return t>=-T&&t<=1+T&&s>=-T&&s<=1+T?[Math.max(0,Math.min(l,t*l))]:[]
}
function combo(frame:Frame,direction:Settings['direction'],load:3|5,pictureFrameRows:1|2):Settings{
  return {...fixture,frame,direction,load,pictureFrameRows,frameSelection:'manual',pedestalSelection:'manual',
    // 261 - 24 - 35 = 202 mm. Keep the 205 mm base and customer height;
    // the 35 mm direct frame needs the catalogued F5 height range, not F4.
    ...(frame==='small'?{pedestalName:'VersiJack F5 Pedestal',pedestalMin:197,pedestalMax:281}:{}),
    // The persisted single guide is for the 7.5 m direction. Rotating the
    // boards to a 9.2 m run needs a different stock-valid breaker arrangement.
    ...(direction==='vertical'?{breakerMode:'balanced',breakerPositions:undefined,breakerCount:undefined}:{})}
}

function audit(p:Plan,s:Settings,id:string){
  const [joist,bearer,support,bearerSpacing]=reportLimits[s.frame][s.load],rule={joist,bearer,support,bearerSpacing}
  const f=p.frame,ms=f.members,face=f.faceWidth,diameter=.205,setback=.2225
  assert.equal(f.geometryPass,true,`${id}: ${f.issues.join('; ')}`)
  assert.ok(p.heightFits,`${id}: selected pedestal fits the fixed customer height`)
  assert.equal(f.rule.joist,rule.joist);assert.equal(f.rule.bearer,rule.bearer)
  assert.equal(f.rule.support,rule.support);assert.equal(f.rule.bearerSpacing,rule.bearerSpacing)
  assert.equal(f.verification.status,'provisional','Geometric transfer paths do not approve connector capacity')
  assert.ok(ms.length&&f.pedestals.length)
  assert.ok(rule.bearer||ms.every(m=>m.kind!=='bearer'),`${id}: a direct frame must not silently acquire a lower bearer tier`)
  assert.ok(ms.every(m=>m.size===(m.kind==='bearer'?rule.bearer:rule.joist)),`${id}: use the selected profile sizes throughout`)
  const tier=(m:Member)=>m.kind==='bearer'?0:1,primaryTier=rule.bearer?0:1
  const anchors=new Set<number>()
  for(const [i,q] of f.pedestals.entries()){
    assert.ok(inside(p.p,q));assert.ok(p.holes.every(h=>!inside(h,q)))
    for(const ring of [p.p,...p.holes])for(let k=0;k<ring.length;k++)assert.ok(pointDistance(q,{a:ring[k],b:ring[(k+1)%ring.length]})>=setback-T,`${id}: base ${i} loses the entered edge clearance`)
    for(const other of f.pedestals.slice(0,i))assert.ok(distance(q,other)>=diameter-T,`${id}: actual circular bases overlap`)
    const supported=ms.flatMap((m,j)=>tier(m)===primaryTier&&pointDistance(q,m)<T?[j]:[])
    assert.ok(supported.length,`${id}: pedestal ${i} is under an actual supporting member`)
    supported.forEach(j=>anchors.add(j))
  }
  const graph=ms.map(()=>new Set<number>())
  // Same-level transfer counts only at an explicitly scheduled physical
  // connection. Ignore accidental/merely nearby visual intersections.
  for(const c of f.connections){
    assert.equal(c.status,'unverified')
    for(const i of c.members)for(const j of c.members)if(i!==j&&tier(ms[i])===tier(ms[j])&&pointDistance(c.point,ms[i])<=face/2+T&&pointDistance(c.point,ms[j])<=face/2+T)graph[i].add(j)
  }
  if(rule.bearer)ms.forEach((m,i)=>{if(m.kind==='bearer')return;ms.forEach((n,j)=>{if(n.kind==='bearer'&&hits(m,n).length)graph[i].add(j)})})
  const reaches=(start:number,excluded:number|Set<number>=-1)=>{
    const blocked=excluded instanceof Set?excluded:new Set([excluded]),queue=[start],seen=new Set([...blocked,start])
    for(let k=0;k<queue.length;k++){const i=queue[k];if(anchors.has(i)&&!blocked.has(i))return true;for(const j of graph[i])if(!seen.has(j)){seen.add(j);queue.push(j)}}
    return false
  }
  for(const [i,m] of ms.entries()){
    const l=distance(m.a,m.b)
    assert.ok(Number.isFinite(l)&&l>T&&l<=s.frameStock+T,`${id}: stock member ${i} exceeds its real purchasing length`)
    assert.ok(reaches(i),`${id}: member ${i} has no scheduled bearing path to a real pedestal`)
    const boundaryMembers=[p.p,...p.holes].flatMap(r=>r.map((a,j)=>({a,b:r[(j+1)%r.length],kind:'rim' as const,size:0}))),cuts=[0,l,...boundaryMembers.flatMap(n=>hits(m,n))].sort((a,b)=>a-b)
    for(let j=1;j<cuts.length;j++){const q=at(m.a,m.b,(cuts[j-1]+cuts[j])/2/l);assert.ok(inside(p.p,q)&&p.holes.every(h=>!inside(h,q)),`${id}: member ${i} bridges a void`)}
    const reactions=f.pedestals.filter(q=>tier(m)===primaryTier&&pointDistance(q,m)<T).map(q=>distance(m.a,q))
    for(const c of f.connections)if(c.members.includes(i)&&pointDistance(c.point,m)<=face/2+T&&c.members.some(j=>j!==i&&tier(ms[j])===tier(m)&&pointDistance(c.point,ms[j])<=face/2+T&&reaches(j,i)))reactions.push(Math.max(0,Math.min(l,((c.point.x-m.a.x)*(m.b.x-m.a.x)+(c.point.y-m.a.y)*(m.b.y-m.a.y))/l)))
    if(rule.bearer&&m.kind!=='bearer')for(const [j,n] of ms.entries())if(n.kind==='bearer'&&reaches(j))reactions.push(...hits(m,n))
    if(m.kind==='joist'||m.kind==='bearer'){
      const spanLimit=m.kind==='bearer'||!rule.bearer?rule.support:rule.bearerSpacing
      reactions.sort((a,b)=>a-b)
      assert.ok(reactions.length,`${id}: member ${i} has no physical support reaction`)
      for(let j=1;j<reactions.length;j++){
        const midpoint=at(m.a,m.b,(reactions[j]+reactions[j-1])/2/l),continuous=rule.bearer&&m.kind!=='bearer'&&ms.some(n=>n.kind==='bearer'&&Math.abs(cross(delta(m.b,m.a),delta(n.b,n.a)))<1e-8&&pointDistance(midpoint,n)<T)
        assert.ok(continuous||reactions[j]-reactions[j-1]<=spanLimit+T,`${id}: independently measured member ${i} support span exceeds ${spanLimit} m`)
      }
    }
  }
  for(let i=0;i<ms.length;i++)for(let j=0;j<i;j++){
    const a=ms[i],b=ms[j];if(tier(a)!==tier(b))continue
    const u=delta(a.b,a.a),v=delta(b.b,b.a),l=distance(a.a,a.b),nl=distance(b.a,b.b)
    if(Math.abs(cross(u,v))<=1e-6*l*nl){
      const dx=u.x/l,dy=u.y/l,separation=Math.abs((b.a.x-a.a.x)*dy-(b.a.y-a.a.y)*dx),start=(b.a.x-a.a.x)*dx+(b.a.y-a.a.y)*dy,end=(b.b.x-a.a.x)*dx+(b.b.y-a.a.y)*dy
      const overlap=Math.min(l,Math.max(start,end))-Math.max(0,Math.min(start,end))
      assert.ok(separation>=face-T||overlap<=T,`${id}: same-level parallel physical faces ${i}/${j} overlap`)
    }else for(const t of hits(a,b)){
      const q=at(a.a,a.b,t/l)
      assert.ok(t<=T||l-t<=T||distance(q,b.a)<=T||distance(q,b.b)<=T,`${id}: same-level members ${i}/${j} cross through both interiors`)
    }
  }
  assert.ok(f.maxPrimarySpan<=rule.support+T)
  assert.ok(!rule.bearer||f.maxSecondarySpan<=rule.bearerSpacing+T)
  for(const q of f.projections){assert.ok(Math.abs(distance(q.point,q.support)-q.distance)<T);assert.ok(q.limit===null||q.distance<=q.limit+T)}
  for(const q of f.splices){
    if(f.pedestals.some(v=>distance(v,q)<T))continue
    const touching=ms.flatMap((m,i)=>pointDistance(q,m)<=face/2+T?[i]:[])
    const ends=touching.filter(i=>distance(ms[i].a,q)<T||distance(ms[i].b,q)<T),stockPieces=new Set(ends.filter(i=>ends.some(j=>i!==j&&tier(ms[i])===tier(ms[j])&&Math.abs(cross(delta(ms[i].b,ms[i].a),delta(ms[j].b,ms[j].a)))<1e-8)))
    assert.ok(stockPieces.size>=2,`${id}: a scheduled splice must correspond to actual cut profile ends`)
    const levels=[...new Set([...stockPieces].map(i=>tier(ms[i])))]
    for(const level of levels)assert.ok(touching.some(j=>tier(ms[j])<=level&&!stockPieces.has(j)&&[...stockPieces].some(i=>tier(ms[i])===level&&Math.abs(cross(delta(ms[i].b,ms[i].a),delta(ms[j].b,ms[j].a)))>1e-8)&&reaches(j,stockPieces)),`${id}: stock splice has no transverse bearing with an independent path to a pedestal`)
  }
  assert.ok(f.boardChecks.every(q=>q.ok),`${id}: an installed decking piece is unsupported`)
  assert.ok(p.boards.pieces.every(q=>q.length<=s.board.stock+T))
  assert.ok(Math.abs(Object.values(p.framePieces).flat().reduce((n,m)=>n+m.length,0)-ms.reduce((n,m)=>n+distance(m.a,m.b),0))<T,`${id}: cutting quantities disagree with solved members`)
}

for(const frame of frames)for(const direction of ['horizontal','vertical'] as const)for(const load of [3,5] as const)for(const rows of [1,2] as const){
  const id=`${frame}/${direction}/${load}kN/${rows}-row border`
  test(`irregular opening has a complete physical support arrangement: ${id}`,()=>{
    const s=combo(frame,direction,load,rows),before=JSON.stringify(s),p=planDeck(s)
    audit(p,s,id)
    assert.equal(JSON.stringify(s),before,'Solving support positions must not mutate customer settings')
    assert.equal(s.height,261);assert.equal(s.pedestalDiameter,205);assert.equal(s.pedestalClearance,120)
    if(direction==='horizontal')assert.deepEqual(p.boards.breakers,[3.69],'A support repair must retain the valid manual breaker')
  })
}

test('an incompatible persisted breaker count remains a board-stock constraint, not a pedestal-placement error',()=>{
  for(const rows of [1,2] as const){
    const s={...fixture,direction:'vertical' as const,pictureFrameRows:rows},before=JSON.stringify(s)
    assert.throws(()=>planBoardsOnly(s),/bay exceeds the stock length/)
    assert.equal(JSON.stringify(s),before)
    assert.deepEqual(s.breakerPositions,[3.69]);assert.equal(s.breakerCount,1)
  }
})
