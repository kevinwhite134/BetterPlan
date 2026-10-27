import type { Settings } from './planner.ts'

type BreakerSettings = Pick<Settings, 'frame'|'board'|'pedestalDiameter'|'breakerWidth'>

// A paired breaker is two real, side-by-side stock boards. Its outer support
// rails can therefore have separate pedestal bases, without assuming a wider
// head, an unsupported joist tip or a special same-level header connection.
export function breakerBoardCount(s: BreakerSettings): 1|2 {
  if(s.breakerWidth==='single')return 1
  if(s.breakerWidth==='double')return 2
  const direct=s.frame==='small'||s.frame==='big'
  return direct&&(s.pedestalDiameter??150)>s.board.width+2*s.board.endGap+1e-5?2:1
}

export function breakerStripWidth(s: BreakerSettings): number {
  const count=breakerBoardCount(s)
  return (count*s.board.width+(count-1)*s.board.gap)/1000
}

export function breakerRailOffset(s: BreakerSettings): number {
  return breakerStripWidth(s)/2+s.board.endGap/1000
}

export function breakerBoardCentres(s: BreakerSettings,centre: number): number[] {
  return breakerBoardCount(s)===1?[centre]:[centre-(s.board.width+s.board.gap)/2000,centre+(s.board.width+s.board.gap)/2000]
}
