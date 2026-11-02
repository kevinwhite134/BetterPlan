// Role colours for flat technical drawings; 3D aluminium retains its metal finish.
export const FRAME_COLOURS={joist:'#3c995e',bearer:'#a078d4',noggin:'#3c995e',rim:'#3c995e'} as const
export const FRAME_FACE_COLOURS={joist:['#d4d9dc','#8e989f'],bearer:['#c6cdd2','#7c878f'],noggin:['#e0e4e7','#96a0a7'],rim:['#d4d9dc','#8e989f']} as const
export type FrameFaceColours=Record<keyof typeof FRAME_FACE_COLOURS,readonly [string,string]>
export const FRAME_DIAGRAM_FACE_COLOURS:FrameFaceColours={joist:['#65b581','#2c7045'],bearer:['#b798df','#75549f'],noggin:['#65b581','#2c7045'],rim:['#65b581','#2c7045']}
