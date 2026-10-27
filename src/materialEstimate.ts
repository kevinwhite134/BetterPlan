import type { Plan } from './planner.ts'

export function materialEstimate(plan:Plan,prices:Record<string,string>){
  const lines=plan.materials.map(material=>{
    const pending=!plan.frame.geometryPass&&(material.key==='pedestals'||material.key.startsWith('profile')||material.key.endsWith('Joiners'))
    const raw=prices[material.key],value=typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN
    const rate=Number.isFinite(value)&&value>=0?value:null
    const cents=pending||rate===null?null:Math.round((material.qty*rate+Number.EPSILON)*100)
    return {...material,pending,rate,cents}
  })
  const priced=lines.filter(q=>q.rate!==null).length,pending=lines.some(q=>q.pending),complete=!pending&&priced===lines.length
  return {lines,priced,pending,complete,provisional:true,orderReady:false,subtotalCents:lines.reduce((sum,q)=>sum+(q.cents??0),0)}
}
