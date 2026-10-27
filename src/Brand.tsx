export default function Brand({name='BetterPlan'}:{name?:'BetterPlan'|'BetterDeck'}){
  if(name==='BetterDeck')return <img className="betterdeck-logo" src="/betterdeck-logo.jpg" alt="BetterDeck® — a lifetime outdoors"/>
  return <span className="brand-lockup"><img className="brand-mark" src="/betterplan-mark.png" alt=""/><span className="brand-name">Better<span>Plan</span></span></span>
}
