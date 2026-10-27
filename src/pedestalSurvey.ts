import type { Point, Settings } from './planner.ts'
export const surveyPointKey=(p:Point)=>`${Math.round(p.x*100000)},${Math.round(p.y*100000)}`
export function surveyReadings(s:Settings){return new Map((s.groundSurvey??[]).map(r=>[surveyPointKey(r),r.level]))}
export function pedestalHeight(point:Point,s:Settings,rule:{joist:number;bearer:number},readings=surveyReadings(s)){
  const p=s.direction==='vertical'?{x:point.y,y:point.x}:point,level=readings.get(surveyPointKey(p))??null
  const average=s.height-s.board.thickness-rule.joist-rule.bearer,required=average-(level??0),min=level===null?required-s.variation:required,max=level===null?required+s.variation:required
  return {point:p,level,required,min,max,fits:min>=s.pedestalMin-1e-7&&max<=s.pedestalMax+1e-7,ground:-(s.height-(level??0))/1000,surveyed:level!==null}
}
export function pedestalHeights(points:Point[],s:Settings,rule:{joist:number;bearer:number}){
  const readings=surveyReadings(s),rows=points.map(p=>pedestalHeight(p,s,rule,readings)),matched=new Set(rows.filter(r=>r.surveyed).map(r=>surveyPointKey(r.point)))
  return {rows,surveyed:rows.filter(r=>r.surveyed).length,unmatched:(s.groundSurvey??[]).filter(r=>!matched.has(surveyPointKey(r))).length,fits:rows.every(r=>r.fits),range:rows.length?rows.reduce((range,r)=>({min:Math.min(range.min,r.min),max:Math.max(range.max,r.max)}),{min:Infinity,max:-Infinity}):null}
}
export function setSurveyLevel(s:Settings,point:Point,level:number|null):Settings{
  const key=surveyPointKey(point),readings=(s.groundSurvey??[]).filter(r=>surveyPointKey(r)!==key)
  if(level!==null)readings.push({...point,level})
  return {...s,groundSurvey:readings}
}
