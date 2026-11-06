import { bounds, fasciaHeight, FRAME_NAMES, planDeck } from './planner.ts'
import type { Plan, Settings } from './planner.ts'
import type { QuotationDeck } from './quotationDetails.ts'
import { materialEstimate } from './materialEstimate.ts'

export type QuotationSection={id:string;name:string;settings:Settings;plan:Plan;prices:Record<string,string>}
const snapshots=new WeakMap<QuotationDeck,QuotationSection>()
export function quotationSections(plan:Plan,s:Settings,prices:Record<string,string>):QuotationSection[]{
  return [{id:'current',name:s.quotation?.deckName?.trim()||'Main deck',settings:s,plan,prices},...(s.quotation?.additionalDecks??[]).map(deck=>{
    let section=snapshots.get(deck)
    if(!section){section={...deck,plan:planDeck(deck.settings)};snapshots.set(deck,section)}
    return section
  })]
}
export const materialGroup=(key:string)=>key==='boards'||key==='skirting'?'Decking & fascia':key==='pedestals'||key.startsWith('profile')?'Substructure':'Fixings & connectors'
export function sectionSpecification({plan,settings:s}:QuotationSection){
  const b=bounds(plan.physical)
  return [
    `${Math.round(b.width*1000)} × ${Math.round(b.depth*1000)} mm overall · ${plan.area.toFixed(2)} m²`,
    `${s.board.name} · ${s.board.colourName} · ${s.board.width} × ${s.board.thickness} mm · ${s.board.stock} m stock`,
    `Boards run ${s.direction==='horizontal'?'across the width':'across the depth'} · ${plan.boards.pieces.filter(p=>p.kind==='perimeter').length?'Perimeter border included':'No perimeter border'}`,
    s.skirting?`Fascia: ${new Set(plan.skirtPieces.map(p=>p.edge)).size} edges · ${fasciaHeight(s)} mm high`:'Fascia not included',
    FRAME_NAMES[s.frame],
  ]
}
export function quotationMaterialLines(sections:QuotationSection[]){
  const order=['Decking & fascia','Substructure','Fixings & connectors']
  return sections.flatMap(section=>materialEstimate(section.plan,section.prices).lines.filter(line=>line.qty!==0||line.pending).map(line=>({...line,key:section.id==='current'?line.key:`deck:${section.id}:${line.key}`,sectionId:section.id,sectionName:section.name,group:materialGroup(line.key)})).sort((a,b)=>order.indexOf(a.group)-order.indexOf(b.group)))
}
