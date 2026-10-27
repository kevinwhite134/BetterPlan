import type { Settings } from './planner.ts'

type HeightSettings=Pick<Settings,'height'|'variation'|'pedestalMin'|'pedestalMax'|'board'>
type FrameHeights={joist:number;bearer:number}
export type HeightStatus='fits'|'too-low'|'too-high'|'insufficient-travel'|'invalid'
const EPS=1e-7
export const heightNumber=(value:number)=>Number(value.toFixed(3)).toLocaleString('en-IE',{maximumFractionDigits:3})

export function heightFit(s:HeightSettings,frame:FrameHeights){
  const fixed=s.board.thickness+frame.joist+frame.bearer,average=s.height-fixed
  const required={min:average-s.variation,max:average+s.variation}
  const travel=s.pedestalMax-s.pedestalMin,requiredTravel=2*s.variation
  const total={min:fixed+s.pedestalMin+s.variation,max:fixed+s.pedestalMax-s.variation}
  const valid=[s.height,s.board.thickness,frame.joist,frame.bearer,s.variation,s.pedestalMin,s.pedestalMax].every(Number.isFinite)&&s.height>=30&&s.height<=2000&&s.board.thickness>=10&&s.board.thickness<=100&&frame.joist>=0&&frame.bearer>=0&&s.variation>=0&&s.variation<=1000&&s.pedestalMin>=1&&s.pedestalMin<=2000&&s.pedestalMax>=s.pedestalMin&&s.pedestalMax<=3000
  const status:HeightStatus=!valid?'invalid':travel+EPS<requiredTravel?'insufficient-travel':required.min+EPS<s.pedestalMin?'too-low':required.max-EPS>s.pedestalMax?'too-high':'fits'
  const label={fits:'Fits height','too-low':'Assembly too tall','too-high':'Pedestal too short','insufficient-travel':'Pedestal range too narrow',invalid:'Check height inputs'}[status]
  const reason=status==='invalid'?'Enter valid height values and keep maximum adjustment at least equal to minimum adjustment.':status==='insufficient-travel'?`Ground variation ±${heightNumber(s.variation)} mm needs ${heightNumber(requiredTravel)} mm adjustment travel. This pedestal has ${heightNumber(travel)} mm (${heightNumber(s.pedestalMin)}–${heightNumber(s.pedestalMax)} mm). Select a pedestal with enough travel for the supplied ground variation.`:status==='too-low'?`At ${heightNumber(s.height)} mm total height, pedestals need ${heightNumber(required.min)}–${heightNumber(required.max)} mm. The selected pedestal cannot go below ${heightNumber(s.pedestalMin)} mm.`:status==='too-high'?`At ${heightNumber(s.height)} mm total height, pedestals need ${heightNumber(required.min)}–${heightNumber(required.max)} mm. The selected pedestal cannot extend above ${heightNumber(s.pedestalMax)} mm.`:`Required pedestal adjustment ${heightNumber(required.min)}–${heightNumber(required.max)} mm is within ${heightNumber(s.pedestalMin)}–${heightNumber(s.pedestalMax)} mm.`
  return {valid,status,fits:status==='fits',label,reason,fixed,average,required,total,travel,requiredTravel}
}
