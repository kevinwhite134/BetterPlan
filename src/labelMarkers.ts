import type { Point } from './planner.ts'
export type LabelView={x:number;y:number;w:number;h:number}
export function placeLabelBoxes(anchors:Point[],view:LabelView,sizes:{w:number;h:number}[],gap:number){
  const placed:{x:number;y:number;w:number;h:number}[]=[]
  return anchors.map((anchor,i)=>{
    const {w,h}=sizes[i],clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
    const candidates:Point[]=[{x:clamp(anchor.x-w/2,view.x,view.x+view.w-w),y:clamp(anchor.y-h/2,view.y,view.y+view.h-h)}]
    for(let y=view.y;y<=view.y+view.h-h;y+=gap*2)for(let x=view.x;x<=view.x+view.w-w;x+=gap*2)candidates.push({x,y})
    candidates.sort((a,b)=>Math.hypot(a.x+w/2-anchor.x,a.y+h/2-anchor.y)-Math.hypot(b.x+w/2-anchor.x,b.y+h/2-anchor.y))
    const point=candidates.find(p=>placed.every(q=>p.x+w+gap<=q.x||q.x+q.w+gap<=p.x||p.y+h+gap<=q.y||q.y+q.h+gap<=p.y))
    if(!point)return null
    const box={...point,w,h};placed.push(box);return box
  })
}
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
