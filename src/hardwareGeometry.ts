import type { Plan, Settings } from './planner.ts'
import type { Position3, StructureExposure, StructurePart, StructureFace } from './structureGeometry.ts'
import { frameHardware, ALUMINIUM_BUTT_GAP } from './frameHardware.ts'

export function hardwareGeometry(plan:Plan,s:Settings,exposure:StructureExposure):StructurePart[]{
  if(exposure==='pedestals')return []
  const hardware=frameHardware(plan.frame,s.frameFaceWidth??35),half=(s.frameFaceWidth??35)/2000,parts:StructurePart[]=[]
  for(const c of hardware.connections){
    if(exposure==='bearers'&&c.tier!=='bearer')continue
    const p=s.direction==='vertical'?{x:c.point.y,y:c.point.x}:c.point,u=s.direction==='vertical'?{x:c.axis.y,y:c.axis.x}:c.axis,n={x:-u.y,y:u.x}
    const top=-s.board.thickness/1000-(c.tier==='bearer'?plan.frame.rule.joist/1000:0),bottom=top-c.size/1000
    const box=(along:number,across:number,span:number,width:number,zTop:number,zBottom:number):StructureFace[]=>{
      const at=(x:number,y:number,z:number):Position3=>({x:p.x+u.x*x+n.x*y,y:p.y+u.y*x+n.y*y,z})
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]],ring=corners.map(([a,b])=>at(along+a*span/2,across+b*width/2,zTop))
      return [{points:ring,normal:{x:0,y:0,z:1},fill:'#202520'},...ring.map((a,i)=>{const b=ring[(i+1)%4],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);return {points:[{...a,z:zBottom},{...b,z:zBottom},b,a],normal:{x:dy/l,y:-dx/l,z:0},fill:'#111711'}})]
    }
    if(c.kind==='butt'){
      parts.push({id:`continuous-${c.id}`,label:'Continuous joiner · 2 mm aluminium butt gap · EUR 1.68',kind:c.tier,centre:{...p,z:(top+bottom)/2},faces:box(0,0,ALUMINIUM_BUTT_GAP,half*2,top,bottom)})
      for(const side of [-1,1])parts.push({id:`side-${side}-${c.id}`,label:'Joist joiner · one on each side of a joist or bearer butt joint · EUR 1.20',kind:c.tier,centre:{x:p.x+n.x*side*half,y:p.y+n.y*side*half,z:(top+bottom)/2},faces:box(0,side*(half+.0015),.12,.003,top-.004,Math.max(bottom+.004,top-.032))})
    }else{
      parts.push({id:c.id,label:'Perpendicular joist joiner · black connection marker; no physical gap · EUR 1.20',kind:c.tier,centre:{...p,z:top},faces:box(.012,0,.024,half*2+.006,top+.001,top-.004)})
    }
  }
  return parts
}
