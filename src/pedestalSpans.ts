import type { Plan, Point } from './planner.ts'

// Match the primary-bearing classification used by the support audit. Pair only
// neighbours on one real member; an absent member across an opening is never bridged.
export function pedestalSpans(frame:Pick<Plan['frame'],'members'|'pedestals'|'rule'>){
  const tolerance=1e-5,cell=.5,buckets=new Map<string,number[]>(),pairs=new Map<string,{from:number;to:number;length:number}>()
  const key=(x:number,y:number)=>`${x},${y}`
  frame.pedestals.forEach((p,i)=>{const k=key(Math.floor(p.x/cell),Math.floor(p.y/cell));const list=buckets.get(k)??[];list.push(i);buckets.set(k,list)})
  for(const member of frame.members){
    if(member.kind!==(frame.rule.bearer?'bearer':'joist')||member.role==='bearer-link'||member.support==='transfer')continue
    const dx=member.b.x-member.a.x,dy=member.b.y-member.a.y,length=Math.hypot(dx,dy)
    if(length<tolerance)continue
    const along=(p:Point)=>((p.x-member.a.x)*dx+(p.y-member.a.y)*dy)/length
    const nodes:{index:number;t:number}[]=[]
    for(let x=Math.floor((Math.min(member.a.x,member.b.x)-tolerance)/cell);x<=Math.floor((Math.max(member.a.x,member.b.x)+tolerance)/cell);x++)for(let y=Math.floor((Math.min(member.a.y,member.b.y)-tolerance)/cell);y<=Math.floor((Math.max(member.a.y,member.b.y)+tolerance)/cell);y++){
      for(const index of buckets.get(key(x,y))??[]){const p=frame.pedestals[index],t=along(p),offset=Math.abs((p.x-member.a.x)*dy-(p.y-member.a.y)*dx)/length;if(t>=-tolerance&&t<=length+tolerance&&offset<tolerance)nodes.push({index,t})}
    }
    nodes.sort((a,b)=>a.t-b.t||a.index-b.index)
    for(let i=1;i<nodes.length;i++){
      const from=Math.min(nodes[i-1].index,nodes[i].index),to=Math.max(nodes[i-1].index,nodes[i].index),a=frame.pedestals[from],b=frame.pedestals[to],span=Math.hypot(b.x-a.x,b.y-a.y)
      if(span>tolerance)pairs.set(`${from}:${to}`,{from,to,length:span})
    }
  }
  return [...pairs.values()].sort((a,b)=>a.from-b.from||a.to-b.to)
}
