export type EditorView={x:number;y:number;w:number;h:number}
export function visibleEditorView(view:EditorView,width:number,height:number){
  const scale=Math.min(width/view.w,height/view.h),w=width/scale,h=height/scale
  return {x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h,scale}
}
export function rulerStep(scale:number){
  const target=75/scale,power=10**Math.floor(Math.log10(target))
  return [1,2,5,10].map(n=>n*power).find(n=>n>=target)!
}
export function rulerTicks(start:number,length:number,step:number){
  return Array.from({length:Math.min(300,Math.max(0,Math.floor((start+length)/step)-Math.ceil(start/step)+1))},(_,i)=>(Math.ceil(start/step)+i)*step)
}
