import type { Point, Settings } from './planner.ts'
import { insetEdgeSegment, insetPolygonEdges } from './deckGeometry.ts'

export const perimeterEdgeEnabled=(s:Settings,index:number)=>s.perimeterEdges?.[index]!==false
export const pictureFrameWidth=(s:Settings)=>((s.pictureFrameRows??1)*s.board.width+((s.pictureFrameRows??1)-1)*s.board.gap)/1000
export function boardInfillInset(p:Point[],s:Settings,gap=true){
  return insetPolygonEdges(p,p.map((_,i)=>(perimeterEdgeEnabled(s,i)?pictureFrameWidth(s):0)+(gap?s.board.gap/1000:0)),gap?s.board.endGap/1000:0)
}
/** Normalised deck coordinates, with X along the board run. */
export function boardInfillPolygon(s:Settings){
  const minX=Math.min(...s.polygon.map(q=>q.x)),minY=Math.min(...s.polygon.map(q=>q.y))
  const physical=s.polygon.map(q=>({x:q.x-minX,y:q.y-minY})),p=s.direction==='vertical'?physical.map(q=>({x:q.y,y:q.x})):physical
  return boardInfillInset(p,s)
}

/** Merge drawing-only collinear vertices into continuous physical stock runs. */
export function perimeterBoardRuns(p:Point[],s:Settings){
  const collinear=(a:number,b:number)=>{
    const u={x:p[(a+1)%p.length].x-p[a].x,y:p[(a+1)%p.length].y-p[a].y},v={x:p[(b+1)%p.length].x-p[b].x,y:p[(b+1)%p.length].y-p[b].y}
    return Math.abs(u.x*v.y-u.y*v.x)<1e-7&&u.x*v.x+u.y*v.y>0
  }
  return p.flatMap((a,i)=>{
    if(!perimeterEdgeEnabled(s,i))return []
    const previous=(i+p.length-1)%p.length
    if(perimeterEdgeEnabled(s,previous)&&collinear(previous,i))return []
    let last=i
    const edges=[i]
    while(edges.length<p.length){const next=(last+1)%p.length;if(!perimeterEdgeEnabled(s,next)||!collinear(last,next))break;last=next;edges.push(last)}
    return Array.from({length:s.pictureFrameRows??1},(_,row)=>{
      const offset=row*(s.board.width+s.board.gap)/1000,outer=p.map((_,j)=>perimeterEdgeEnabled(s,j)?offset:0),inner=p.map((_,j)=>perimeterEdgeEnabled(s,j)?offset+s.board.width/1000:0)
      return {edge:i,edges,row,sourceA:a,a:insetEdgeSegment(p,outer,i).a,b:insetEdgeSegment(p,outer,last).b,innerA:insetEdgeSegment(p,inner,i).a,innerB:insetEdgeSegment(p,inner,last).b}
    })
  })
}
