import type { Point } from './planner.ts'
export type LabelView={x:number;y:number;w:number;h:number}
// Text lives in a separate key. Only compact numbered markers enter the scene;
// their circles are packed without overlap, so no crossing leader lines exist.
export function placeLabelMarkers(anchors:Point[],view:LabelView,radius:number){
  const placed:Point[]=[],clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
  const within=(p:Point)=>({x:clamp(p.x,view.x+radius*1.3,view.x+view.w-radius*1.3),y:clamp(p.y,view.y+radius*1.3,view.y+view.h-radius*1.3)})
  const clear=(p:Point)=>placed.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=radius*2.5)
  return anchors.map(anchor=>{
    let chosen:Point|null=null
    for(let ring=0;ring<20&&!chosen;ring++)for(let i=0;i<(ring?24:1);i++){
      const angle=i*Math.PI/12,p=within({x:anchor.x+Math.cos(angle)*radius*ring*2.6,y:anchor.y+Math.sin(angle)*radius*ring*2.6})
      if(clear(p)){chosen=p;break}
    }
    if(!chosen)for(let y=view.y+radius*1.3;y<view.y+view.h-radius;y+=radius*2.6){for(let x=view.x+radius*1.3;x<view.x+view.w-radius;x+=radius*2.6)if(clear({x,y})){chosen={x,y};break}if(chosen)break}
    if(chosen)placed.push(chosen)
    return chosen
  })
}
