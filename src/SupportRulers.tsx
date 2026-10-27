import { rulerTicks } from './supportViewport'
import type { visibleEditorView } from './supportViewport'
import type { Point } from './planner'

export default function SupportRulers({viewport,step,pointer}:{viewport:ReturnType<typeof visibleEditorView>;step:number;pointer:Point|null}){
  const {x,y,w,h,scale}=viewport,top=25/scale,left=43/scale,font=10/scale,stroke=1/scale
  const xTicks=rulerTicks(x,w,step/5),yTicks=rulerTicks(y,h,step/5),major=(n:number)=>Math.abs(n/step-Math.round(n/step))<.00001
  const label=(n:number)=>String(Math.round(n*1000))
  return <g className="support-rulers" pointerEvents="none" aria-label="Millimetre rulers calibrated to the current zoom">
    <rect x={x} y={y} width={w} height={top} fill="#fbfcf8"/><rect x={x} y={y} width={left} height={h} fill="#fbfcf8"/>
    <path d={`M${x+left} ${y}V${y+h}M${x} ${y+top}H${x+w}`} stroke="#bbc9ac" strokeWidth={stroke}/>
    {xTicks.filter(n=>n>x+left).map(n=><g key={`x${n}`}><path d={`M${n} ${y+top}v${-(major(n)?8:4)/scale}`} stroke="#81916d" strokeWidth={stroke}/>{major(n)?<text x={n+3/scale} y={y+12/scale} fontSize={font} fill="#526747">{label(n)}</text>:null}</g>)}
    {yTicks.filter(n=>n>y+top).map(n=><g key={`y${n}`}><path d={`M${x+left} ${n}h${-(major(n)?8:4)/scale}`} stroke="#81916d" strokeWidth={stroke}/>{major(n)?<text x={x+3/scale} y={n-4/scale} fontSize={font} fill="#526747">{label(n)}</text>:null}</g>)}
    <text x={x+6/scale} y={y+16/scale} fontSize={font} fill="#526747">mm</text>
    {pointer?<g stroke="#477333" strokeWidth={stroke}><path d={`M${pointer.x-4/scale} ${y+top}l${4/scale} ${-6/scale}l${4/scale} ${6/scale}Z`} fill="#477333"/><path d={`M${x+left} ${pointer.y-4/scale}l${-6/scale} ${4/scale}l${6/scale} ${4/scale}Z`} fill="#477333"/></g>:null}
    <g aria-label={`${label(step)} millimetre scale bar`}><rect x={x+w-step-32/scale} y={y+h-45/scale} width={step+24/scale} height={34/scale} rx={4/scale} fill="#fbfcf8" fillOpacity=".94"/><path d={`M${x+w-step-20/scale} ${y+h-20/scale}v${-5/scale}m0 ${3/scale}h${step}m0 ${-3/scale}v${5/scale}`} fill="none" stroke="#526747" strokeWidth={stroke*1.5}/><text x={x+w-step/2-20/scale} y={y+h-31/scale} fontSize={font} textAnchor="middle" fill="#526747">{label(step)} mm</text></g>
  </g>
}
