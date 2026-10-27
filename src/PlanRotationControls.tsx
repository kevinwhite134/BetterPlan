export default function PlanRotation({value,onChange}:{value:number;onChange:(angle:number)=>void}){
  return <div className="plan-rotation" role="group" aria-label="Rotate plan view"><span>Rotate plan</span><button type="button" aria-label="Rotate plan view left" onClick={()=>onChange((value+270)%360)}>↶</button><span aria-live="polite">{value}°</span><button type="button" aria-label="Rotate plan view right" onClick={()=>onChange((value+90)%360)}>↷</button><button type="button" disabled={value===0} onClick={()=>onChange(0)}>Reset</button></div>
}
