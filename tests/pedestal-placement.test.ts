import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../src/planner.ts'
import type { Member, Point, Settings } from '../src/planner.ts'
import { pedestalBaseIntervals, placePrimary } from '../src/pedestalPlacement.ts'

const square=[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}]
const opening=[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]
const corner=[{x:0,y:0},{x:3,y:0},{x:3,y:1},{x:1,y:1},{x:1,y:3},{x:0,y:3}]
const member:Member={a:{x:.8,y:.8},b:{x:.86,y:.8},kind:'joist',size:35}
const settings=(patch:Partial<Settings>={}):Settings=>({...DEFAULT_SETTINGS,pedestalDiameter:500,pedestalClearance:0,...patch})
const length=(m:Member)=>Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y)
const distanceToEndpoint=(m:Member,q:Point)=>Math.max(Math.hypot(q.x-m.a.x,q.y-m.a.y),Math.hypot(q.x-m.b.x,q.y-m.b.y))
const along=(m:Member,t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t/length(m),y:m.a.y+(m.b.y-m.a.y)*t/length(m)})
function edgeDistance(p:Point,a:Point,b:Point){const x=b.x-a.x,y=b.y-a.y,d=x*x+y*y,t=d?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/d)):0;return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y)}
function boundaryDistance(ring:Point[],q:Point){return Math.min(...ring.map((a,i)=>edgeDistance(q,a,ring[(i+1)%ring.length])))}
function inside(ring:Point[],q:Point){let odd=false;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)odd=!odd}return odd}

test('a circular base can slide into a valid rounded corner pocket beside an opening',()=>{
  const s=settings(),allowed=pedestalBaseIntervals([member],square,[opening],s)[0]
  assert.equal(allowed.length,1);assert.ok(Math.abs(allowed[0][0])<1e-7);assert.ok(Math.abs(allowed[0][1]-.05)<1e-6)
  const result=placePrimary([member],square,[opening],s,{support:.9})
  assert.equal(result.error,'');assert.ok(result.pedestals.length>0)
  for(const q of result.pedestals)assert.ok(boundaryDistance(opening,q)>=.25-1e-5)
})

test('concave outline corners retain their exact circular-base pocket through winding and rotation',()=>{
  for(const degrees of [0,31,90,173])for(const reversed of [false,true]){
    const a=degrees*Math.PI/180,transform=(q:Point)=>({x:q.x*Math.cos(a)-q.y*Math.sin(a)-2.3,y:q.x*Math.sin(a)+q.y*Math.cos(a)+4.1})
    const p=(reversed?[...corner].reverse():corner).map(transform),m={...member,a:transform(member.a),b:transform(member.b)},allowed=pedestalBaseIntervals([m],p,[],settings())[0]
    assert.equal(allowed.length,1);assert.ok(Math.abs(allowed[0][1]-.05)<1e-6)
    const result=placePrimary([m],p,[],settings(),{support:.9})
    assert.equal(result.error,'');assert.ok(result.pedestals.every(q=>boundaryDistance(p,q)>=.25-1e-5))
  }
})

test('extra edge clearance participates in the true circle and entered projection caps remain enforced',()=>{
  const m:Member={...member,a:{x:.85,y:.8},b:{x:1,y:.8}},s=settings({pedestalDiameter:205,pedestalClearance:120})
  const allowed=pedestalBaseIntervals([m],square,[opening],s)[0]
  assert.ok(Math.abs(allowed[0][1]-.0525)<1e-6,'102.5 mm radius plus 120 mm extra clearance is a 222.5 mm exclusion radius')
  const fits=placePrimary([m],square,[opening],{...s,joistOverhang35:97.5},{support:.9})
  assert.equal(fits.error,'');assert.ok(fits.pedestals.every(q=>boundaryDistance(opening,q)>=.2225-1e-5))
  assert.ok(fits.pedestals.every(q=>distanceToEndpoint(m,q)<=.0975+1e-5),'The one base slides to satisfy both configured end projections')
  const refused=placePrimary([m],square,[opening],{...s,joistOverhang35:97},{support:.9})
  assert.ok(refused.error);assert.equal(refused.members.length,0);assert.equal(refused.pedestals.length,0)
})

test('an exactly fitting base retains an isolated tangent support position',()=>{
  const x=Math.sqrt(3)*.3,triangle=[{x:0,y:0},{x:2*x,y:0},{x,y:.9}],m:Member={a:{x:.3,y:.3},b:{x:.7,y:.3},kind:'joist',size:35},s=settings({pedestalDiameter:600})
  const allowed=pedestalBaseIntervals([m],triangle,[],s)[0]
  assert.equal(allowed.length,1);assert.ok(Math.abs(allowed[0][0]-(x-.3))<1e-6);assert.ok(allowed[0][1]-allowed[0][0]<1e-7)
  const result=placePrimary([m],triangle,[],s,{support:.9})
  assert.equal(result.error,'');assert.equal(result.pedestals.length,1);assert.ok(boundaryDistance(triangle,result.pedestals[0])>=.3-1e-5)
})

test('separate feasible lobes survive when a narrow polygon neck cannot contain a base',()=>{
  const p=[{x:0,y:0},{x:2,y:.9},{x:4,y:0},{x:4,y:2},{x:2,y:1.1},{x:0,y:2}],s=settings({pedestalDiameter:300})
  const members:Member[]=[.4,3.6].map(x=>({a:{x,y:.4},b:{x,y:1.6},kind:'joist',size:35})),result=placePrimary(members,p,[],s,{support:.9})
  assert.equal(result.error,'');assert.ok(result.pedestals.length>=4)
  for(const [i,q] of result.pedestals.entries()){
    assert.ok(inside(p,q)&&boundaryDistance(p,q)>=.15-1e-5)
    for(const other of result.pedestals.slice(0,i))assert.ok(Math.hypot(q.x-other.x,q.y-other.y)>=.3-1e-5)
  }
})

test('all returned intervals match independently sampled finite-edge circular clearance',()=>{
  const p=[{x:0,y:0},{x:5,y:0},{x:5,y:4},{x:3,y:4},{x:3,y:2.8},{x:2,y:2.8},{x:2,y:4},{x:0,y:4}]
  const holes=[opening,[{x:3.2,y:.7},{x:4.4,y:.9},{x:3.8,y:1.9}]],s=settings({pedestalDiameter:205,pedestalClearance:120}),radius=.2225
  const members:Member[]=Array.from({length:17},(_,i)=>({a:{x:.05,y:.2+i*.18},b:{x:4.95,y:.45+i*.18},kind:'joist',size:35}))
  const all=pedestalBaseIntervals(members,p,holes,s)
  for(const [i,m] of members.entries())for(let j=0;j<=700;j++){
    const t=length(m)*j/700,q=along(m,t),distance=Math.min(boundaryDistance(p,q),...holes.map(h=>boundaryDistance(h,q))),region=inside(p,q)&&holes.every(h=>!inside(h,q)),covered=all[i].some(([a,b])=>t>=a-1e-6&&t<=b+1e-6)
    if(region&&distance>radius+2e-5)assert.ok(covered,'A valid interior interval must not disappear behind a mitred corner')
    if(!region||distance<radius-2e-5)assert.equal(covered,false,'No returned interval may cross the actual circular-clearance boundary')
  }
})

test('short T-junction members use one exact shared base through rotations, endpoint reversals and ordering',()=>{
  const raw:Member[]=[{a:{x:1.9,y:2},b:{x:2,y:2},kind:'joist',size:35},{a:{x:2,y:1.95},b:{x:2,y:2.05},kind:'joist',size:35}]
  for(const degrees of [0,31,90,173])for(const reversed of [false,true])for(const order of [false,true])for(const size of [35,80]){
    const angle=degrees*Math.PI/180,transform=(q:Point)=>({x:q.x*Math.cos(angle)-q.y*Math.sin(angle)-3.2,y:q.x*Math.sin(angle)+q.y*Math.cos(angle)+1.7}),p=square.map(transform),joint=transform({x:2,y:2})
    const members=(order?[...raw].reverse():raw).map(m=>({...m,size,a:transform(reversed?m.b:m.a),b:transform(reversed?m.a:m.b)})),s=settings({pedestalDiameter:205,joistOverhang35:100,joistOverhang80:100}),result=placePrimary(members,p,[],s,{support:.9})
    assert.equal(result.error,'',`rotation ${degrees}; reversed ${reversed}; order ${order}; profile ${size}`)
    assert.equal(result.pedestals.length,1,'The joint shares one real base; it is not two overlapping circles')
    assert.ok(Math.hypot(result.pedestals[0].x-joint.x,result.pedestals[0].y-joint.y)<1e-7)
    assert.ok(boundaryDistance(p,result.pedestals[0])>=.1025-1e-5)
    for(const m of members)assert.ok(distanceToEndpoint(m,result.pedestals[0])<=.1000001,'Both entered end-projection limits still apply')
  }
})

test('nearby unconnected tips and an insufficient entered overhang remain genuine shared-base failures',()=>{
  const raw:Member[]=[{a:{x:1.9,y:2},b:{x:2,y:2},kind:'joist',size:35},{a:{x:2,y:1.95},b:{x:2,y:2.05},kind:'joist',size:35}]
  for(const shifted of [false,true]){
    const members=raw.map((m,i)=>shifted&&i===1?{...m,a:{...m.a,x:m.a.x+.01},b:{...m.b,x:m.b.x+.01}}:m),s=settings({pedestalDiameter:205,...(!shifted?{joistOverhang35:99}:{})}),result=placePrimary(members,square,[],s,{support:.9})
    assert.ok(result.error,'A close visual joint or an exceeded entered limit cannot be accepted as a real shared bearing')
    assert.equal(result.members.length,0);assert.equal(result.pedestals.length,0)
    assert.ok(result.placementDiagnostics.length)
  }
})

test('joint-anchored repairs keep actual support spans and cut every stock splice over a real base',()=>{
  const members:Member[]=[{a:{x:.4,y:2},b:{x:3.6,y:2},kind:'joist',size:35},{a:{x:2.37,y:1.95},b:{x:2.37,y:2.05},kind:'joist',size:35}],s=settings({pedestalDiameter:205,frameStock:.5}),result=placePrimary(members,square,[],s,{support:.6})
  assert.equal(result.error,'');assert.ok(result.splices.length>=6)
  for(const [i,q] of result.pedestals.entries())for(const other of result.pedestals.slice(0,i))assert.ok(Math.hypot(q.x-other.x,q.y-other.y)>=.205-1e-5)
  for(const m of result.members)assert.ok(length(m)<=.50001)
  for(const splice of result.splices)assert.ok(result.pedestals.some(q=>Math.hypot(q.x-splice.x,q.y-splice.y)<1e-6))
  for(const m of members){const ts=result.pedestals.filter(q=>edgeDistance(q,m.a,m.b)<1e-6).map(q=>Math.hypot(q.x-m.a.x,q.y-m.a.y)).sort((a,b)=>a-b);assert.ok(ts.length);for(let i=1;i<ts.length;i++)assert.ok(ts[i]-ts[i-1]<=.60001)}
})
