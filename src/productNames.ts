// Product names and pedestal dimensions from BetterDeck's published catalogue.
// https://betterdeck.ie/alu-joist/
// https://betterdeck.ie/pedestal-systems/
// K Series designation: supplied span report 1513-1, revision 2, pages 5 and 7.
export const PRODUCT_SOURCES={frame:'https://betterdeck.ie/alu-joist/',pedestals:'https://betterdeck.ie/pedestal-systems/'}
export const aluJoistName=(height:number)=>`${height} mm Alu-Joist (K Series)`
export const deckingBoardName=(name:string)=>name==='Example composite board'?'Custom composite decking board':name
export const FRAME_MEMBER_NAMES={joist:'joist',bearer:'bearer',noggin:'noggin',rim:'rim joist'} as const
export const BOARD_USE_NAMES={infill:'Infill decking board',breaker:'Breaker board',perimeter:'Picture-frame board'} as const
export const frameMemberName=(height:number,kind:keyof typeof FRAME_MEMBER_NAMES,role?:string)=>`${aluJoistName(height)} · ${role==='support-header'?'same-depth support header':role==='opening-rim'?'opening rim section':role==='opening-tie'?'opening rim tie':FRAME_MEMBER_NAMES[kind]}`
export const CUSTOM_PEDESTAL='Custom adjustable pedestal'
export function pedestalAbbreviation(name:string):string{
  const versi=name.match(/versi\s*jack\s*(F\d+)/i),spira=name.match(/spira\s*pave\s*(T\d+)/i)
  if(versi)return `VJ-${versi[1].toUpperCase()}`
  if(spira)return `SP-${spira[1].toUpperCase()}`
  if(!name.trim()||name===CUSTOM_PEDESTAL)return 'CP'
  const words=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[A-Za-z0-9]+/g)??[]
  return words.slice(0,3).map(w=>w[0]).join('').toUpperCase()||'CP'
}
export const pedestalReference=(name:string,index:number)=>`${pedestalAbbreviation(name)} (${index+1})`
export const PEDESTAL_MODELS=[
  {name:'VersiJack F1 Pedestal',min:37,max:50,diameter:190},
  {name:'VersiJack F2 Pedestal',min:50,max:75,diameter:190},
  {name:'VersiJack F3 Pedestal',min:74,max:117,diameter:190},
  {name:'VersiJack F4 Pedestal',min:117,max:201,diameter:205},
  {name:'VersiJack F5 Pedestal',min:197,max:281,diameter:205},
  {name:'SpiraPave T11 Pedestal',min:12,max:17,diameter:155},
  {name:'SpiraPave T12 Pedestal',min:18,max:23,diameter:155},
  {name:'SpiraPave T22 Pedestal',min:24,max:29,diameter:155},
  {name:'SpiraPave T33 Pedestal',min:30,max:44,diameter:155},
  {name:'SpiraPave T34 Pedestal',min:45,max:59,diameter:155},
  {name:'SpiraPave T44 Pedestal',min:60,max:74,diameter:155},
] as const
