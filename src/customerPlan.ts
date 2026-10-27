import type { Plan, Settings, Point } from './planner.ts'
import { bounds } from './planner.ts'
import { boardRings, ringPath } from './shapeGeometry.ts'
export function customerPlanSvg(plan:Plan,s:Settings){
  const {width,depth}=bounds(plan.physical),physical=(p:Point)=>s.direction==='vertical'?{x:p.y,y:p.x}:p,size=Math.max(width,depth)*.023,pad=size*4
  const boards=plan.boards.pieces.map(p=>`<path d="${ringPath(boardRings(p).map(r=>r.map(physical)))}" fill-rule="evenodd" fill="${s.board.colour}" stroke="#67523d" stroke-width="${size*.035}"/>`).join('')
  const outline=`<path d="${ringPath([plan.physical,...plan.cutouts.map(h=>h.polygon)])}" fill="none" stroke="#3e5536" stroke-width="${size*.08}"/>`
  const winding=plan.physical.reduce((sum,p,i)=>{const q=plan.physical[(i+1)%plan.physical.length];return sum+p.x*q.y-q.x*p.y},0)>0?1:-1
  const labels=plan.physical.map((p,i)=>{const q=plan.physical[(i+1)%plan.physical.length],length=Math.hypot(q.x-p.x,q.y-p.y),x=(p.x+q.x)/2+winding*(q.y-p.y)/length*size*1.1,y=(p.y+q.y)/2-winding*(q.x-p.x)/length*size*1.1;let angle=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI;if(angle>90||angle < -90)angle+=180;return `<text x="${x}" y="${y}" transform="rotate(${angle} ${x} ${y})" text-anchor="middle" font-family="Arial" font-size="${size*.7}" fill="#263a27">E${i+1}: ${Math.round(length*1000)} mm</text>`}).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="${-pad} ${-pad} ${width+2*pad} ${depth+2*pad}" preserveAspectRatio="xMidYMid meet">${boards}${outline}${labels}<text x="${width/2}" y="${-size*2.8}" text-anchor="middle" font-family="Arial" font-size="${size}" fill="#263a27">${Math.round(width*1000)} mm overall</text><text x="${-size*2.8}" y="${depth/2}" text-anchor="middle" transform="rotate(-90 ${-size*2.8} ${depth/2})" font-family="Arial" font-size="${size}" fill="#263a27">${Math.round(depth*1000)} mm overall</text></svg>`
}
