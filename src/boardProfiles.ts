import type { BoardProfile } from './planner.ts'

// A product profile is independent of deck geometry, framing and pedestal fit.
export function boardProfileError(value:unknown):string{
  if(!value||typeof value!=='object')return 'Enter the board product details.'
  const b=value as BoardProfile
  if(typeof b.id!=='string'||!b.id)return 'The board profile needs an ID.'
  if(typeof b.name!=='string'||!b.name.trim())return 'Enter a name for the board profile.'
  const dimensions:[unknown,number,number,string][]=[
    [b.width,60,300,'Board width must be between 60 and 300 mm.'],
    [b.thickness,10,100,'Board thickness must be between 10 and 100 mm.'],
    [b.stock,.3,15,'Board stock length must be between 0.3 and 15 m.'],
    [b.gap,1,15,'Side-to-side gap must be between 1 and 15 mm.'],
    [b.endGap,1,20,'End-to-end gap must be between 1 and 20 mm.'],
  ]
  for(const [n,min,max,message] of dimensions)if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)return message
  if(typeof b.colour!=='string'||!/^#[0-9a-f]{6}$/i.test(b.colour))return 'Enter a six-digit board colour, such as #a17a54.'
  if(typeof b.colourName!=='string')return 'Enter a valid colour name.'
  return ''
}

export function saveBoardProfile(board:BoardProfile,name:string,profiles:BoardProfile[],createId=()=>crypto.randomUUID()){
  const cleanName=name.trim()
  if(!cleanName)throw new Error('Enter a name for the board profile.')
  const existing=profiles.find(p=>p.name.toLowerCase()===cleanName.toLowerCase())
  const candidate={...board,id:existing?.id||'new-profile',name:cleanName}
  const error=boardProfileError(candidate);if(error)throw new Error(error)
  const profile={...candidate,id:existing?.id||createId()}
  return {profile,profiles:existing?profiles.map(p=>p.id===existing.id?profile:p):[...profiles,profile]}
}
