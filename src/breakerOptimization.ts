import { planBoardsOnly } from './planner.ts'
import type { Plan, Settings } from './planner.ts'
import { breakerSpace, spaceBoundedBreakers, validBreakerPlacement } from './breakerPlacement.ts'
import { breakerStripWidth } from './breakerWidth.ts'

const EPS=1e-7
const sorted=(positions:number[])=>positions.toSorted((a,b)=>a-b)
const signature=(positions:number[])=>sorted(positions).map(x=>x.toFixed(6)).join(',')
export type BoardLoss={stockBoards:number;usedLength:number;purchasedLength:number;lossLength:number;lossPercent:number}
export function breakerLoss(plan:Pick<Plan,'boards'|'used'|'purchased'|'offcut'>):BoardLoss{
  return {stockBoards:plan.boards.bars.length,usedLength:plan.used,purchasedLength:plan.purchased,lossLength:plan.offcut,lossPercent:plan.purchased>0?plan.offcut/plan.purchased*100:0}
}

// Each candidate has the requested number of guides. The optimiser moves
// those guides; it never adds a breaker to obtain a lower stock count.
function rawCountBreakerCandidates(s:Settings,count:number,current:number[]=[]):number[][]{
  const space=breakerSpace(s)
  if(!Number.isInteger(count)||count<0||count>space.capacity)return []
  const occupied=breakerStripWidth(s)+2*s.board.endGap/1000,available=space.right-space.left-count*occupied,bays=count+1
  const toPositions=(lengths:number[])=>{
    let cursor=space.left
    return lengths.slice(0,-1).map(length=>{cursor+=length;const centre=cursor+occupied/2;cursor+=occupied;return centre})
  }
  const choices:number[][]=[]
  if(current.length===count)choices.push(sorted(current))
  choices.push(spaceBoundedBreakers(s,count))
  if(count){
    const targets=[s.board.stock,s.board.stock/2-s.kerf/2000,s.board.stock/3-s.kerf/1500]
    const counts=bays<=10?Array.from({length:bays-1},(_,i)=>i+1):[1,Math.floor(bays/2),bays-1]
    for(const target of targets)for(const used of counts){
      const remainder=(available-used*target)/(bays-used)
      if(remainder<.05-EPS||remainder>s.board.stock+EPS)continue
      const lengths=[...Array(used).fill(target),...Array(bays-used).fill(remainder)] as number[]
      choices.push(toPositions(lengths),toPositions(lengths.toReversed()))
      const middle=Math.floor((bays-used)/2)
      choices.push(toPositions([...Array(middle).fill(remainder),...Array(used).fill(target),...Array(bays-used-middle).fill(remainder)]))
    }
    // A full-stock bay can be between two breakers, as well as at an edge.
    if(count>=2){
      const remainder=(available-s.board.stock)/count
      if(remainder>=.05-EPS&&remainder<=s.board.stock+EPS)for(let i=1;i<count;i++)choices.push(toPositions(Array.from({length:bays},(_,j)=>j===i?s.board.stock:remainder)))
    }
  }
  const seen=new Set<string>(),estimated=Math.ceil((space.right-space.left)/s.board.stock)*Math.ceil((Math.max(...space.local.map(q=>q.y))-Math.min(...space.local.map(q=>q.y)))/((s.board.width+s.board.gap)/1000))
  const budget=estimated>5000?8:estimated>1000?24:100
  return choices.filter(positions=>{
    if(positions.length!==count)return false
    const key=signature(positions);if(seen.has(key))return false;seen.add(key)
    const order=sorted(positions)
    return order.every((x,i)=>Number.isFinite(x)&&x>=space.min-EPS&&x<=space.max+EPS&&(!i||x-order[i-1]>=space.separation-EPS))
  }).slice(0,budget)
}

export function fixedCountBreakerCandidates(s:Settings,count:number,current:number[]=[]):number[][]{
  return rawCountBreakerCandidates(s,count,current).filter(positions=>validBreakerPlacement(s,positions))
}

export function arrangeBreakerCount(s:Settings,count:number,current:number[]=[]):number[]|null{
  const equal=spaceBoundedBreakers(s,count)
  if(equal.length===count&&validBreakerPlacement(s,equal))return equal
  return fixedCountBreakerCandidates(s,count,current)[0]??null
}

export function optimiseBreakerPositions(s:Settings,count:number,current:number[]=[]):{positions:number[];loss:BoardLoss}|null{
  // The board-only planner both validates and scores a candidate. Do not build
  // thousands of cutting pieces twice, especially on a 100 m project.
  const candidates=rawCountBreakerCandidates(s,count,current)
  const proximity=(positions:number[])=>positions.reduce((sum,x,i)=>sum+Math.abs(x-(sorted(current)[i]??x)),0)
  const exact=candidates.flatMap(positions=>{
    try{
      const boards=planBoardsOnly({...s,joints:'breaker',breakerMode:'manual',breakerPositions:positions,breakerCount:positions.length})
      const used=boards.pieces.reduce((sum,p)=>sum+p.length,0),purchased=boards.bars.length*s.board.stock
      return [{positions,loss:breakerLoss({boards,used,purchased,offcut:purchased-used})}]
    }catch{return []}
  }).sort((a,b)=>a.loss.stockBoards-b.loss.stockBoards||a.loss.lossPercent-b.loss.lossPercent||proximity(a.positions)-proximity(b.positions))
  return exact[0]??null
}

export function alignFullStockBay(s:Settings,positions:number[],index:number,side:'before'|'after'):number[]|null{
  if(index<0||index>=positions.length)return null
  const space=breakerSpace(s),ordered=sorted(positions),occupied=breakerStripWidth(s)+2*s.board.endGap/1000
  const previous=index?ordered[index-1]:space.left-occupied/2,next=index+1<ordered.length?ordered[index+1]:space.right+occupied/2
  const value=side==='before'?previous+s.board.stock+occupied:next-s.board.stock-occupied
  const candidate=ordered.map((x,i)=>i===index?value:x)
  return validBreakerPlacement(s,candidate)?candidate:null
}

export function mirrorFixedBreakers(s:Settings,positions:number[]):number[]|null{
  const ordered=sorted(positions),run=breakerSpace(s).run,next=[...ordered]
  for(let i=0;i<Math.ceil(next.length/2);i++){
    const j=next.length-1-i
    if(i===j)next[i]=run/2
    else {const x=(ordered[i]+run-ordered[j])/2;next[i]=x;next[j]=run-x}
  }
  return validBreakerPlacement(s,next)?next:null
}
