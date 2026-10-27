export default function Brand({name='BetterPlan'}:{name?:'BetterPlan'|'BetterDeck'}){
  return <span className="brand-lockup"><img className="brand-mark" src="/betterplan-mark.png" alt=""/><span className="brand-name">Better<span>{name==='BetterDeck'?'Deck':'Plan'}</span></span></span>
}
