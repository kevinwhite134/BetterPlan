import type { Point, Settings } from './planner.ts'

function geometryKey(polygon:Point[],holes:Point[][]){
  const x=Math.min(...polygon.map(q=>q.x)),y=Math.min(...polygon.map(q=>q.y))
  const ringKey=(raw:Point[])=>{
    const points=raw.map(q=>({x:Math.round((q.x-x)*1e7)/1e7,y:Math.round((q.y-y)*1e7)/1e7})),ring=points.filter((b,i)=>{const a=points[(i+points.length-1)%points.length],c=points[(i+1)%points.length];return Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>1e-9})
    const r=ring.length>=3?ring:points,start=r.reduce((best,q,i)=>q.x<r[best].x||q.x===r[best].x&&q.y<r[best].y?i:best,0)
    const forward=Array.from({length:r.length},(_,i)=>r[(start+i)%r.length]),reverse=Array.from({length:r.length},(_,i)=>r[(start-i+r.length)%r.length])
    return [JSON.stringify(forward),JSON.stringify(reverse)].sort()[0]
  }
  return JSON.stringify([ringKey(polygon),holes.map(ringKey).sort()])
}
export const supportOutlineKey=(s:Settings)=>geometryKey(s.polygon,(s.cutouts??[]).map(h=>h.polygon))
export function supportLayoutIsCurrent(s:Settings){
  const layout=s.supportLayout;if(!layout)return false
  if(layout.outlineKey!==undefined)return layout.outlineKey===supportOutlineKey(s)
  // Earlier exports kept the source outline inside the board-layout key.
  // Preserve their edits too, without applying an old rectangle to a new deck.
  if(layout.boardLayout?.key)try{
    const [polygon,holes]=JSON.parse(layout.boardLayout.key)
    if(Array.isArray(polygon)&&polygon.length>=3&&polygon.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)))return geometryKey(polygon,Array.isArray(holes)?holes:[])===supportOutlineKey(s)
  }catch{/* Legacy files without a source outline remain editable and audited. */}
  return true
}
