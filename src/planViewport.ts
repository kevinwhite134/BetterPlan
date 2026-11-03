export type PlanViewport={zoom:number;x:number;y:number}
type Point={x:number;y:number}
export function constrainPlanView(view:PlanViewport,width:number,height:number):PlanViewport{
  const zoom=Math.max(1,Math.min(4,view.zoom))
  return {zoom,x:Math.max(width*(1-zoom),Math.min(0,view.x)),y:Math.max(height*(1-zoom),Math.min(0,view.y))}
}
export function zoomPlanView(view:PlanViewport,factor:number,from:Point,to:Point,width:number,height:number):PlanViewport{
  const zoom=Math.max(1,Math.min(4,view.zoom*factor)),ratio=zoom/view.zoom
  return constrainPlanView({zoom,x:to.x-(from.x-view.x)*ratio,y:to.y-(from.y-view.y)*ratio},width,height)
}
