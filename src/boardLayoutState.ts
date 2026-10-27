import type { Settings } from './planner.ts'

export function boardLayoutKey(s:Settings){
  return JSON.stringify([s.polygon,s.cutouts?.map(h=>h.polygon),s.direction,s.joints,s.board.width,s.board.stock,s.board.gap,s.board.endGap,s.breakerMode,s.breakerPositions,s.breakerCount,s.breakerWidth,s.perimeterEdges,s.pictureFrameRows,s.perimeterJoints])
}
