export default function Brand({name='BetterPlan'}:{name?:'BetterPlan'|'BetterDeck'}){
  if(name==='BetterDeck')return <img className="betterdeck-logo" src="/betterdeck-logo.jpg" alt="BetterDeck® — a lifetime outdoors"/>
  return <span className="brand-lockup"><img className="brand-mark" src="/favicon.svg" width="40" height="40" alt=""/><span className="brand-name">Better<span>Plan</span></span></span>
}
