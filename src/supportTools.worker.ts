import { planDeck } from './planner.ts'
import type { Settings } from './planner.ts'
import { boardLayoutKey } from './boardLayoutState.ts'
import { supportOutlineKey } from './supportLayoutState.ts'
import { findSupportSuggestions } from './supportSuggestions.ts'

export type SupportToolTask={key:string;kind:'audit'|'suggestions';settings:Settings}
self.onmessage=({data}:MessageEvent<SupportToolTask>)=>{
  try{
    if(data.kind==='suggestions'){
      const suggestions=findSupportSuggestions(data.settings,(done,total)=>self.postMessage({key:data.key,progress:{done,total}}))
      self.postMessage({key:data.key,suggestions})
    }else{
      const plan=planDeck(data.settings)
      self.postMessage({key:data.key,frame:plan.frame,heightFits:plan.heightFits,outlineKey:supportOutlineKey(data.settings),boardLayout:{key:boardLayoutKey(data.settings),...plan.boards.resolvedLayout}})
    }
  }catch(error){self.postMessage({key:data.key,error:error instanceof Error?error.message:'The support check could not run.'})}
}
