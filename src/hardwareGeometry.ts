import type { Plan, Settings } from './planner.ts'
import type { Position3, StructureExposure, StructurePart, StructureFace } from './structureGeometry.ts'
import { frameHardware, ALUMINIUM_BUTT_GAP } from './frameHardware.ts'

export function hardwareGeometry(plan:Plan,s:Settings,exposure:StructureExposure,showButtMarkers=true):StructurePart[]{
  if(exposure==='pedestals')return []
  const hardware=frameHardware(plan.frame,s.frameFaceWidth??35),half=(s.frameFaceWidth??35)/2000,parts:StructurePart[]=[]
  for(const c of hardware.connections){
    if(exposure==='bearers'&&c.tier!=='bearer')continue
    const p=s.direction==='vertical'?{x:c.point.y,y:c.point.x}:c.point,u=s.direction==='vertical'?{x:c.axis.y,y:c.axis.x}:c.axis,n={x:-u.y,y:u.x}
    const top=-s.board.thickness/1000-(c.tier==='bearer'?plan.frame.rule.joist/1000:0),bottom=top-c.size/1000
    const box=(along:number,across:number,span:number,width:number,zTop:number,zBottom:number,topFill='#202520',sideFill='#111711'):StructureFace[]=>{
      const at=(x:number,y:number,z:number):Position3=>({x:p.x+u.x*x+n.x*y,y:p.y+u.y*x+n.y*y,z})
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]],ring=corners.map(([a,b])=>at(along+a*span/2,across+b*width/2,zTop))
      return [{points:ring,normal:{x:0,y:0,z:1},fill:topFill},...ring.map((a,i)=>{const b=ring[(i+1)%4],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);return {points:[{...a,z:zBottom},{...b,z:zBottom},b,a],normal:{x:dy/l,y:-dx/l,z:0},fill:sideFill}})]
    }
    if(c.kind==='butt'){
      // The butt gap is a thin top-surface mark, never a vertical plate.
      if(showButtMarkers)parts.push({id:`continuous-${c.id}`,label:'Continuous joiner · 2 mm aluminium butt gap · EUR 1.68',kind:c.tier,centre:{...p,z:top},faces:box(0,0,ALUMINIUM_BUTT_GAP,half*2,top,top).slice(0,1)})
      const centreHeight=(top+bottom)/2,plateHeight=Math.min(.028,c.size/1000-.008)/2
      for(const side of [-1,1])parts.push({id:`side-${side}-${c.id}`,label:'Joist joiner · centred aluminium plate on each side of a joist or bearer butt joint · EUR 1.20',kind:c.tier,centre:{x:p.x+n.x*side*(half+.0015),y:p.y+n.y*side*(half+.0015),z:centreHeight},faces:box(0,side*(half+.0015),.06,.003,centreHeight+plateHeight/2,centreHeight-plateHeight/2,'#c7cfd4','#a0acb5')})
    }else{
      parts.push({id:c.id,label:'Perpendicular joist joiner · black connection marker; no physical gap · EUR 1.20',kind:c.tier,centre:{...p,z:top},faces:box(.012,0,.024,half*2+.006,top+.001,top-.004)})
    }
  }
  return parts
}
