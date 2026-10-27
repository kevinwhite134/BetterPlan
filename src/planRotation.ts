export function rotatedViewBox(x:number,y:number,width:number,height:number,rotation:number){
  const a=rotation*Math.PI/180,w=Math.abs(width*Math.cos(a))+Math.abs(height*Math.sin(a)),h=Math.abs(width*Math.sin(a))+Math.abs(height*Math.cos(a))
  return `${x+(width-w)/2} ${y+(height-h)/2} ${w} ${h}`
}
export function rotatePlanSvg(svg:string,rotation:number){
  if(!rotation)return svg
  const box=svg.match(/viewBox="([\d. -]+)"/)
  if(!box)return svg
  const [x,y,w,h]=box[1].split(/\s+/).map(Number)
  return svg.replace(box[0],`viewBox="${rotatedViewBox(x,y,w,h,rotation)}"`).replace(/(<svg[^>]*>)/,`$1<g transform="rotate(${rotation} ${x+w/2} ${y+h/2})">`).replace('</svg>','</g></svg>')
}
