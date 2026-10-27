import { MAX_PROJECT_SIZE, MAX_PROJECT_COORDINATE, MAX_OUTLINE_POINTS, MAX_CUTTING_BLANKS } from './projectLimits.ts'
import { boardInfillInset, perimeterBoardRuns, pictureFrameWidth } from './perimeterEdges.ts'
import { boardProfileError } from './boardProfiles.ts'
import { layoutBoardSupports } from './boardSupportLayout.ts'
import { heightFit } from './heightFit.ts'
import { cutoutPlacementError, physicalCutouts, subtractCutouts } from './shapeGeometry.ts'
import { aluJoistName, deckingBoardName } from './productNames.ts'
import { allowedBoardCut, boardBands, clipRectangle, clipRectangleParts, fullWidthRuns, insetPolygon, signedArea } from './deckGeometry.ts'
import { breakerBoardCentres, breakerRailOffset, breakerStripWidth } from './breakerWidth.ts'
import { boardLayoutKey } from './boardLayoutState.ts'
import { supportLayoutIsCurrent } from './supportLayoutState.ts'
import type { ProductSelections } from './productLibrary.ts'
import { appliedProduct } from './productLibrary.ts'
import { frameHardware } from './frameHardware.ts'
import { pedestalHeights } from './pedestalSurvey.ts'
import { quotationDetailsError } from './quotationDetails.ts'
import type { QuotationDetails } from './quotationDetails.ts'
// All geometry uses metres. Report limits are transcribed, not interpolated.
export type Point = { x: number; y: number }
export type Cutout = { id:string; name:string; polygon:Point[]; shape?:'rectangle'|'circle'|'oval'|'custom' }
export type Frame = 'small' | 'big' | 'small-small' | 'big-small'
export type BoardProfile = { id: string; name: string; width: number; thickness: number; stock: number; colour: string; colourName: string; gap: number; endGap: number }
export type Settings = {
  groundSurvey?:{x:number;y:number;level:number}[]; quotation?:QuotationDetails;
  products?:ProductSelections;
  polygon: Point[]; cutouts?:Cutout[]; direction: 'horizontal' | 'vertical'; joints: 'breaker' | 'butt';
  board: BoardProfile; frame: Frame; load: 3 | 5; height: number; variation: number;
  pedestalMin: number; pedestalMax: number; pedestalName: string; joistSpacing: number;
  kerf: number; frameStock: number; confirmed: boolean;
  breakerMode?: 'balanced' | 'economy' | 'manual'; breakerPositions?: number[]; breakerCount?:number;
  perimeterEdges?:boolean[]; pictureFrameRows?:1|2;
  frameLayout?:'continuous'|'open'; fasciaClearance?:number; joistOverhang35?:number; joistOverhang80?:number;
  breakerWidth?: 'auto'|'single'|'double'; selectionObjective?:'cost'|'simple'|'pedestals'|'spread';
  perimeterJoints?: boolean; skirting?: boolean; skirtingHeight?: number;
  pedestalDiameter?: number; pedestalClearance?: number; edgeDetailConfirmed?: boolean;
  frameFaceWidth?: number; boardEndBearing?: number; allowRipping?: boolean; frameSelection?: 'auto'|'manual'; pedestalSelection?: 'auto'|'manual';
  supportLayout?: {version:1;members:Member[];pedestals:Point[];outlineKey?:string;boardLayout?:{key:string;phase:number;perimeterJointShift:number;breakers?:number[]}};
}
export type Piece = { x: number; y: number; length: number; width: number; breaker: boolean; row: number; kind?: 'infill'|'breaker'|'perimeter'; outline?: Point[]; holes?:Point[][]; axis?:Point; localRip?: boolean; perimeterEdge?:number; perimeterRow?:number; openingIndex?:number }
export type Member = { a: Point; b: Point; kind: 'joist' | 'bearer' | 'noggin' | 'rim'; size: number; role?:'collector'|'blocking'|'edge-rail'|'bearer-link'|'support-header'|'opening-rim'|'opening-tie'; support?:'pedestal'|'transfer'; openingIndex?:number; openingRow?:number }
export type StockCut = { length: number; piece: number }
export type StockBar = { cuts: StockCut[]; remaining: number }
export const DEFAULT_BOARD: BoardProfile = { id: 'default', name: 'Custom composite decking board', width: 136, thickness: 25, stock: 3.66, colour: '#a17a54', colourName: 'Warm oak', gap: 5, endGap: 5 }
export const DEFAULT_SETTINGS: Settings = {
  polygon: [{x:0,y:0},{x:6,y:0},{x:6,y:3.238},{x:0,y:3.238}], direction:'horizontal', joints:'breaker', board: DEFAULT_BOARD,
  frame:'big-small', frameSelection:'auto', pedestalSelection:'auto', load:3, height:250, variation:20, pedestalMin:35, pedestalMax:250,
  pedestalName:'Custom adjustable pedestal', joistSpacing:400, kerf:3, frameStock:3.66, confirmed:false, allowRipping:true, breakerWidth:'auto', selectionObjective:'cost',
}
export const FRAME_NAMES: Record<Frame, string> = { small:'35 mm Alu-Joist', 'small-small':'35 mm Alu-Joist bearer + 35 mm joist', big:'80 mm Alu-Joist', 'big-small':'80 mm Alu-Joist bearer + 35 mm joist' }
export function isBoardProfile(value: unknown): value is BoardProfile {
  return !boardProfileError(value)
}
export function frameRule(frame: Frame, load: 3 | 5) {
  const high = load === 5
  switch (frame) {
    case 'small': return { joist:35, bearer:0, support:high ? .6 : .9, bearerSpacing:0, pages:'7, 56–61', sheet:'4A' }
    case 'big': return { joist:80, bearer:0, support:high ? 1.6 : 1.9, bearerSpacing:0, pages:'5, 8–13', sheet:'1A' }
    case 'small-small': return { joist:35, bearer:35, support:high ? .8 : .7, bearerSpacing:high ? .6 : .9, pages:'7, 62–67', sheet:'4B' }
    case 'big-small': return { joist:35, bearer:80, support:1.5, bearerSpacing:high ? .6 : .9, pages:'5, 14–19', sheet:'1B' }
  }
}
const EPS = 1e-7
const round = (n: number) => Math.round(n * 1e6) / 1e6
export const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.y-b.y)
export function polygonArea(p: Point[]) { return Math.abs(p.reduce((sum,a,i) => {const b=p[(i+1)%p.length]; return sum+a.x*b.y-b.x*a.y},0))/2 }
export function bounds(p: Point[]) { return { width:Math.max(...p.map(a=>a.x))-Math.min(...p.map(a=>a.x)), depth:Math.max(...p.map(a=>a.y))-Math.min(...p.map(a=>a.y)) } }
export function normalize(p: Point[]) { const x=Math.min(...p.map(a=>a.x)),y=Math.min(...p.map(a=>a.y));return p.map(a=>({x:a.x-x,y:a.y-y})) }
function cross(a: Point,b: Point,c: Point) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) }
function onSegment(a: Point,b: Point,p: Point) { return Math.abs(cross(a,b,p))<EPS && p.x>=Math.min(a.x,b.x)-EPS && p.x<=Math.max(a.x,b.x)+EPS && p.y>=Math.min(a.y,b.y)-EPS && p.y<=Math.max(a.y,b.y)+EPS }
function intersects(a: Point,b: Point,c: Point,d: Point) {
  return (cross(a,b,c)*cross(a,b,d)<-EPS && cross(c,d,a)*cross(c,d,b)<-EPS) || onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b)
}
export function polygonError(p: Point[],minArea=.1,minEdge=.005) {
  if(p.length<3||p.length>MAX_OUTLINE_POINTS) return `Use between 3 and ${MAX_OUTLINE_POINTS} outline points.`
  if(p.some(a=>!Number.isFinite(a.x)||!Number.isFinite(a.y)||Math.abs(a.x)>MAX_PROJECT_COORDINATE||Math.abs(a.y)>MAX_PROJECT_COORDINATE)) return `Coordinates must be finite numbers within ${MAX_PROJECT_COORDINATE} m of the drawing origin.`
  if(polygonArea(p)<minArea) return `The outline must enclose at least ${minArea} m².`
  if(bounds(p).width>MAX_PROJECT_SIZE||bounds(p).depth>MAX_PROJECT_SIZE) return `This planner supports decks up to ${MAX_PROJECT_SIZE} m in each direction.`
  for(let i=0;i<p.length;i++) {
    if(distance(p[i],p[(i+1)%p.length])<minEdge) return `Adjacent outline points must be at least ${Math.round(minEdge*1000)} mm apart.`
    for(let j=i+1;j<p.length;j++) {
      if(j===i+1||(i===0&&j===p.length-1)) continue
      if(intersects(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length])) return 'The outline crosses or touches itself. Move the corners to make one simple outline.'
    }
  }
  return ''
}
export function inside(p: Point[], q: Point) {
  let hit=false
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i],b=p[j]
    if(onSegment(a,b,q)) return true
    if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x) hit=!hit
  }
  return hit
}
// Intersections include boundary runs, so perimeter joists are retained.
export function scan(p: Point[], coordinate: number, vertical=false): [number,number][] {
  const q=vertical?p.map(a=>({x:a.y,y:a.x})):p
  const xs: number[]=[], edges: [number,number][]=[]
  for(let i=0;i<q.length;i++) {
    const a=q[i],b=q[(i+1)%q.length]
    if(Math.abs(a.y-b.y)<EPS) { if(Math.abs(coordinate-a.y)<EPS) edges.push([Math.min(a.x,b.x),Math.max(a.x,b.x)]); continue }
    if((a.y<=coordinate&&b.y>coordinate)||(b.y<=coordinate&&a.y>coordinate)) xs.push(a.x+(coordinate-a.y)*(b.x-a.x)/(b.y-a.y))
  }
  xs.sort((a,b)=>a-b)
  for(let i=0;i+1<xs.length;i+=2) if(xs[i+1]-xs[i]>EPS) edges.push([xs[i],xs[i+1]])
  return merge(edges)
}
function merge(intervals: [number,number][]): [number,number][] {
  const out: [number,number][]=[]
  for(const [a,b] of intervals.sort((a,b)=>a[0]-b[0])) {
    const last=out.at(-1)
    if(last&&a<=last[1]+EPS) last[1]=Math.max(last[1],b)
    else out.push([a,b])
  }
  return out
}
// Conservative rectangular cutting blanks covering the entire board strip,
// including diagonal edges. The displayed boards are clipped to the outline.
export function strip(p: Point[], start: number, end: number, vertical=false) {
  const levels=[start+EPS,end-EPS,...p.map(a=>vertical?a.x:a.y).filter(y=>y>start+EPS&&y<end-EPS)]
  const sorted=[...levels].sort((a,b)=>a-b)
  for(let i=1;i<sorted.length;i++) levels.push((sorted[i-1]+sorted[i])/2)
  return merge(levels.flatMap(y=>scan(p,y,vertical)))
}
export function spaced(start: number,end: number,max: number) {
  if(end-start<EPS) return [start]
  const n=Math.ceil((end-start)/max-EPS)
  return Array.from({length:n+1},(_,i)=>round(start+(end-start)*i/n))
}
export function packCuts(lengths: number[], stock: number, kerf: number): StockBar[] {
  // The same best-fit-decreasing rule, indexed by remaining stock rather than
  // scanning every purchased bar for every cut on large projects.
  type Bin={remaining:number;index:number;priority:number;left:Bin|null;right:Bin|null}
  const bars:StockBar[]=[],compare=(a:Pick<Bin,'remaining'|'index'>,b:Pick<Bin,'remaining'|'index'>)=>a.remaining-b.remaining||a.index-b.index
  const priority=(index:number)=>{let n=index+1;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0}
  const join=(a:Bin|null,b:Bin|null):Bin|null=>{
    if(!a)return b;if(!b)return a
    if(a.priority<b.priority){a.right=join(a.right,b);return a}b.left=join(a,b.left);return b
  }
  const insert=(tree:Bin|null,node:Bin):Bin=>{
    if(!tree)return node
    if(compare(node,tree)<0){tree.left=insert(tree.left,node);if(tree.left.priority<tree.priority){const root=tree.left;tree.left=root.right;root.right=tree;return root}}
    else{tree.right=insert(tree.right,node);if(tree.right.priority<tree.priority){const root=tree.right;tree.right=root.left;root.left=tree;return root}}
    return tree
  }
  const remove=(tree:Bin|null,node:Bin):Bin|null=>{
    if(!tree)return null
    const order=compare(node,tree);if(!order)return join(tree.left,tree.right)
    if(order<0)tree.left=remove(tree.left,node);else tree.right=remove(tree.right,node);return tree
  }
  const lowerBound=(tree:Bin|null,remaining:number,index=-1)=>{
    let found:Bin|null=null
    while(tree){if(tree.remaining>remaining||(tree.remaining===remaining&&tree.index>index)){found=tree;tree=tree.left}else tree=tree.right}
    return found
  }
  let tree:Bin|null=null
  for(const cut of lengths.map((length,piece)=>({length,piece})).sort((a,b)=>b.length-a.length)){
    if(cut.length>stock+EPS)throw new Error('A cutting blank exceeds the selected stock length.')
    let best=lowerBound(tree,cut.length+kerf-EPS-Number.EPSILON*Math.max(1,stock)*4)
    while(best&&best.remaining-cut.length-kerf<-EPS)best=lowerBound(tree,best.remaining,best.index)
    let index:number
    if(!best){index=bars.length;bars.push({cuts:[cut],remaining:Math.max(0,stock-cut.length)})}
    else{index=best.index;tree=remove(tree,best);bars[index].cuts.push(cut);bars[index].remaining=Math.max(0,best.remaining-cut.length-kerf)}
    tree=insert(tree,{remaining:bars[index].remaining,index,priority:priority(index),left:null,right:null})
  }
  return bars
}

function splitRun(start: number,end: number,stock: number,gap: number,offset=0): [number,number][] {
  const length=end-start
  if(length<=stock+EPS) return [[start,end]]
  const n=Math.ceil((length+gap)/(stock+gap))
  // Balanced joints avoid tiny end pieces; alternate rows shift the first joint.
  const equal=(length-(n-1)*gap)/n
  const shift=Math.min(offset,stock-equal,Math.max(0,equal-.3))
  const cuts=Array.from({length:n},()=>equal)
  if(n>1) {cuts[0]+=shift;cuts[n-1]-=shift}
  let x=start
  return cuts.map(l=>{const a=x;x+=l+gap;return [a,a+l]})
}
function alignedButtRun(start:number,end:number,stock:number,gap:number,row:number,offset=0):[number,number][]{
  // A common staggered joint lattice keeps shaped rows on the same support
  // columns. Splitting each tapered row into equal lengths created almost
  // coincident joists for its slightly different joint coordinates.
  if(end-start<=stock+EPS)return [[start,end]]
  const pitch=stock+gap,phase=offset+(row%2?pitch/2:0),cuts:[number,number][]=[]
  for(let k=Math.floor((start-phase)/pitch);phase+k*pitch<end-EPS;k++){
    const a=Math.max(start,phase+k*pitch),b=Math.min(end,phase+k*pitch+stock)
    if(b-a>EPS)cuts.push([a,b])
  }
  return cuts
}
function makeBoards(p: Point[],s: Settings,breakers: number[],initialPhase=0): Piece[] {
  const {width:run,depth:across}=bounds(p),w=s.board.width/1000,g=s.board.gap/1000,eg=s.board.endGap/1000
  const breakerWidth=breakerStripWidth(s)
  const pieces: Piece[]=[]
  const bands: [number,number][]=[]
  let cursor=0
  for(const x of breakers) {bands.push([cursor,x-breakerWidth/2-eg]);cursor=x+breakerWidth/2+eg}
  bands.push([cursor,run])
  const bandsAcross=boardBands(across,w,g,s.allowRipping!==false)
  const runs:{start:number;end:number;row:number;y:number;width:number;region:Point[]}[]=[]
  for(const [row,band] of bandsAcross.entries()) {
    const {y,width}=band
    const regions=s.allowRipping!==false?clipRectangleParts(p,0,run,y,y+width):fullWidthRuns(p,y,y+width).map(([a,b])=>clipRectangle(p,a,b,y,y+width))
    for(const region of regions) for(const [a,b] of bands) {
      const left=Math.min(...region.map(q=>q.x)),right=Math.max(...region.map(q=>q.x))
      const start=Math.max(left,a),end=Math.min(right,b)
      if(end-start<EPS) continue
      if(s.joints==='breaker'&&end-start>s.board.stock+EPS) throw new Error('A board bay exceeds the stock length. Add a breaker or move the existing lines closer together.')
      runs.push({start,end,row,y,width,region})
    }
  }
  const parts=(region:Point[],a:number,b:number,y:number,width:number)=>s.allowRipping!==false?clipRectangleParts(region,a,b,y,y+width):[clipRectangle(region,a,b,y,y+width)]
  const buttCuts=(entry:typeof runs[number],offset:number):[number,number][]|undefined=>{
    const valid=(cuts:[number,number][])=>cuts.every(([a,b])=>parts(entry.region,a,b,entry.y,entry.width).every(outline=>allowedBoardCut(outline,entry.y,entry.y+entry.width,s.allowRipping!==false)))
    for(let shift=0;shift<2;shift++){
      const cuts=alignedButtRun(entry.start,entry.end,s.board.stock,eg,entry.row+shift,offset)
      if(valid(cuts))return cuts
    }
  }
  let phase=initialPhase
  if(s.joints==='butt'&&!runs.every(entry=>buttCuts(entry,phase))){
    // Move both staggered lattices together. Individual angled rows never
    // invent an almost coincident third line to make their end cuts fit.
    const pitch=s.board.stock+eg,phases=[0,.25,.125,.375,...Array.from({length:63},(_,i)=>(i+1)/128)]
    const found=phases.find(value=>runs.every(entry=>buttCuts(entry,pitch*value)))
    if(found===undefined){
      throw new Error('These board cuts require a straight rip along a full board length. Change the board product, layout or outline; angled and tapered edge cuts are allowed.')
    }
    phase=pitch*found
  }
  for(const entry of runs){
    const {start,end,row,y,width}=entry,cuts=s.joints==='butt'?buttCuts(entry,phase)!:splitRun(start,end,s.board.stock,eg)
    for(const [x1,x2] of cuts){
      for(const outline of parts(entry.region,x1,x2,y,width)){
        if(!allowedBoardCut(outline,y,y+width,s.allowRipping!==false))throw new Error('This bay needs a straight rip along the full board length. Allow straight rip cuts or change the breaker, board product or outline.')
        const minX=Math.min(...outline.map(q=>q.x)),maxX=Math.max(...outline.map(q=>q.x)),minY=Math.min(...outline.map(q=>q.y)),maxY=Math.max(...outline.map(q=>q.y))
        const localRip=s.allowRipping!==false&&outline.some((a,i)=>{const b=outline[(i+1)%outline.length];return Math.abs(a.y-b.y)<EPS&&a.y>y+EPS&&a.y<y+width-EPS})
        pieces.push({x:minX,y:s.allowRipping!==false&&Math.abs(minY-y)>EPS?minY:y,length:maxX-minX,width:s.allowRipping!==false&&Math.abs(maxY-minY-width)>EPS?maxY-minY:width,breaker:false,row,kind:'infill',outline,localRip})
      }
    }
  }
  const transposed=p.map(q=>({x:q.y,y:q.x}))
  for(const centre of breakers){
    const runs=breakerBoardCentres(s,centre).flatMap(x=>{
      const regions=s.allowRipping!==false?clipRectangleParts(transposed,0,across,x-w/2,x+w/2):fullWidthRuns(transposed,x-w/2,x+w/2).map(([a,b])=>clipRectangle(transposed,a,b,x-w/2,x+w/2))
      return regions.map(region=>{const a=Math.min(...region.map(q=>q.x)),b=Math.max(...region.map(q=>q.x));return {x,region,a,b,cuts:splitRun(a,b,s.board.stock,eg)}})
    })
    // Paired boards beside a sloping edge have slightly different lengths.
    // Independent balanced splits create nearly coincident support rows.
    // Align their stock joints where one common split still gives EACH run
    // its minimum piece count. Runs that fit stock always remain unbroken.
    const visited=new Set<number>()
    for(let i=0;i<runs.length;i++){
      if(visited.has(i)||runs[i].cuts.length===1)continue
      const group=[i];visited.add(i)
      for(let cursor=0;cursor<group.length;cursor++)for(let j=0;j<runs.length;j++){
        const a=runs[group[cursor]],b=runs[j]
        if(!visited.has(j)&&a.cuts.length===b.cuts.length&&Math.min(a.b,b.b)-Math.max(a.a,b.a)>EPS){group.push(j);visited.add(j)}
      }
      if(group.length<2)continue
      const common=splitRun(Math.min(...group.map(j=>runs[j].a)),Math.max(...group.map(j=>runs[j].b)),s.board.stock,eg)
      if(common.length!==runs[i].cuts.length)continue
      const clipped=group.map(j=>common.map(([a,b])=>[Math.max(a,runs[j].a),Math.min(b,runs[j].b)] as [number,number]))
      if(clipped.some(cuts=>cuts.some(([a,b])=>b-a<=EPS||b-a>s.board.stock+EPS)))continue
      group.forEach((j,k)=>{runs[j].cuts=clipped[k]})
    }
    for(const {x,region,cuts} of runs){
      // Breakers stay in one piece whenever stock reaches. Only an overlong
      // continuous run receives the minimum necessary number of butt joints.
      for(const [y1,y2] of cuts)for(const cut of parts(region,y1,y2,x-w/2,w)){
        const outline=cut.map(q=>({x:q.y,y:q.x})),minX=Math.min(...outline.map(q=>q.x)),maxX=Math.max(...outline.map(q=>q.x)),minY=Math.min(...outline.map(q=>q.y)),maxY=Math.max(...outline.map(q=>q.y))
        pieces.push({x:minX,y:minY,length:maxY-minY,width:s.allowRipping!==false&&Math.abs(maxX-minX-w)>EPS?maxX-minX:w,breaker:true,row:-1,kind:'breaker',outline})
      }
    }
  }
  return pieces
}
export function boardLayout(p: Point[],s: Settings,buttPhase=0) {
  const run=bounds(p).width,w=breakerStripWidth(s),g=s.board.endGap/1000,stock=s.board.stock
  if(s.joints==='breaker'&&s.breakerMode==='manual') {
    const breakers=[...(s.breakerPositions||[])].sort((a,b)=>a-b)
    let previous=-w/2-g
    for(const x of breakers) {
      if(!Number.isFinite(x)||x<w/2+g+.05-EPS||x>run-w/2-g-.05+EPS) throw new Error('Keep each breaker inside the outline bounds, with at least 50 mm of board at either outside edge.')
      if(x-previous<w+2*g+.05-EPS) throw new Error('Breaker lines overlap or leave less than 50 mm between them.')
      if(strip(p,x-w/2,x+w/2,true).length===0) throw new Error('A breaker line does not intersect the deck outline.')
      previous=x
    }
    const pieces=makeBoards(p,s,breakers)
    return {pieces,breakers,bars:packCuts(pieces.map(a=>a.length),stock,s.kerf/1000),strategy:'Your custom breaker positions, with offcut reuse'}
  }
  if(s.joints==='butt'||run<=stock+EPS) {const pieces=makeBoards(p,s,[],buttPhase);return {pieces,breakers:[] as number[],bars:packCuts(pieces.map(a=>a.length),stock,s.kerf/1000),strategy:s.joints==='butt'?'Balanced, alternating butt joints':'Single-length board runs'}}
  const minBays=Math.ceil((run+w+2*g)/(stock+w+2*g))
  if(s.breakerMode!=='economy') {
    // Aesthetic default: the minimum necessary number of equal bays. Symmetry
    // refers to the overall bounds; the actual boards are clipped to the shape.
    const available=run-(minBays-1)*(w+2*g),bay=available/minBays
    const breakers=Array.from({length:minBays-1},(_,i)=>round((i+1)*bay+i*(w+2*g)+g+w/2))
    const pieces=makeBoards(p,s,breakers)
    return {pieces,breakers,bars:packCuts(pieces.map(a=>a.length),stock,s.kerf/1000),strategy:'Equal-width bays with the fewest necessary breaker lines'}
  }
  const candidates: number[][]=[]
  // Compare equal bays, full-stock bays from either end, and complementary
  // half-stock bays. Best-fit decreasing reuses offcuts across all rows.
  for(let n=minBays;n<=minBays+2;n++) {
    const available=run-(n-1)*(w+2*g),equal=available/n
    if(equal<=.15) continue
    const variants=[Array(n).fill(equal) as number[]]
    for(const target of [stock,stock/2-s.kerf/2000,stock/3-s.kerf/1500]) {
      const counts=n<=12?Array.from({length:n-1},(_,i)=>i+1):[1,Math.floor(n/2),n-1]
      for(const count of counts) {
        const remainder=(available-count*target)/(n-count)
        if(remainder>=.3&&remainder<=stock) {
          variants.push([...Array(count).fill(target),...Array(n-count).fill(remainder)])
          variants.push([...Array(n-count).fill(remainder),...Array(count).fill(target)])
        }
      }
    }
    if(available-(n-1)*stock>.15) {
      variants.push([...Array(n-1).fill(stock),available-(n-1)*stock])
      variants.push([available-(n-1)*stock,...Array(n-1).fill(stock)])
    }
    const half=stock/2-s.kerf/2000
    if(n>1) {
      const rest=(available-half)/(n-1)
      if(rest>.15&&rest<=stock) { variants.push([half,...Array(n-1).fill(rest)]);variants.push([...Array(n-1).fill(rest),half]) }
    }
    for(const lengths of variants) {
      if(lengths.some(l=>l>stock+EPS)) continue
      let cursor=0
      candidates.push(lengths.slice(0,-1).map(l=>{cursor+=l;const x=cursor+g+w/2;cursor+=w+2*g;return round(x)}))
    }
  }
  let failure='No board layout fits these inputs.'
  const options=candidates.flatMap(breakers=>{try{const pieces=makeBoards(p,s,breakers);return [{pieces,breakers,bars:packCuts(pieces.map(a=>a.length),stock,s.kerf/1000),strategy:'Compared equal, full-stock and offcut-friendly bays'}]}catch(error){failure=error instanceof Error?error.message:failure;return []}})
  options.sort((a,b)=>a.bars.length-b.bars.length||a.breakers.length-b.breakers.length||a.pieces.length-b.pieces.length)
  if(!options[0]) throw new Error(failure)
  return options[0]
}
export function pieceOutline(p:Piece):Point[]{return p.outline||[{x:p.x,y:p.y},{x:p.x+(p.breaker?p.width:p.length),y:p.y},{x:p.x+(p.breaker?p.width:p.length),y:p.y+(p.breaker?p.length:p.width)},{x:p.x,y:p.y+(p.breaker?p.length:p.width)}]}
function gapSizeIsland(piece:Piece,s:Settings){
  if(piece.kind!=='infill')return false
  const ring=pieceOutline(piece),xs=ring.map(q=>q.x),ys=ring.map(q=>q.y),gap=s.board.gap/1000
  return Math.max(...xs)-Math.min(...xs)<=gap+EPS&&Math.max(...ys)-Math.min(...ys)<=gap+EPS
}
function framedBoardLayout(p:Point[],s:Settings,buttPhase=0,perimeterJointShift=0){
  const w=s.board.width/1000,g=s.board.gap/1000,inner=boardInfillInset(p,s)
  const ox=Math.min(...inner.map(q=>q.x)),oy=Math.min(...inner.map(q=>q.y)),local=inner.map(q=>({x:q.x-ox,y:q.y-oy}))
  const infill=boardLayout(local,{...s,breakerPositions:s.breakerPositions?.map(x=>x-ox)},buttPhase)
  const perimeterSplices:{point:Point;horizontal:boolean}[]=[],perimeterJointGuides=new Map<number,Point[]>()
  const rawInfill=infill.pieces.map(q=>({...q,x:q.x+ox,y:q.y+oy,outline:pieceOutline(q).map(v=>({x:v.x+ox,y:v.y+oy}))})),cornerGaps=rawInfill.filter(q=>gapSizeIsland(q,s)).map(pieceOutline)
  const pieces:Piece[]=rawInfill.filter(q=>!gapSizeIsland(q,s))
  for(const run of perimeterBoardRuns(p,s)){
    const i=run.edge,a=run.a,b=run.b,length=distance(a,b),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,sign=signedArea(p)>0?1:-1,nx=-uy*sign,ny=ux*sign
    const quad=[a,b,run.innerB,run.innerA],axis=quad.map(q=>({x:(q.x-a.x)*ux+(q.y-a.y)*uy,y:(q.x-a.x)*nx+(q.y-a.y)*ny})),lo=Math.min(...axis.map(q=>q.x)),hi=Math.max(...axis.map(q=>q.x))
    if(hi-lo>s.board.stock+EPS&&s.perimeterJoints===false)throw new Error(`Perimeter edge ${i+1} exceeds the board stock length. Allow supported perimeter end joints or select longer stock.`)
    const balanced=splitRun(lo,hi,s.board.stock,s.board.endGap/1000),shifted=balanced.map(([a,b],j)=>[a+(j?perimeterJointShift:0),b+(j<balanced.length-1?perimeterJointShift:0)] as [number,number])
    let cuts=shifted.every(([a,b])=>b-a>EPS&&b-a<=s.board.stock+EPS)?shifted:balanced
    // Mitred inner rows can have a slightly different run length. Rebalancing
    // each row independently creates nearly coincident support columns. Where
    // stock permits, align their actual cuts on the outer row's joint lines.
    if(run.row>0&&cuts.length>1){
      const joints=(perimeterJointGuides.get(i)??[]).map(q=>(q.x-a.x)*ux+(q.y-a.y)*uy).filter(t=>t>lo+s.board.endGap/2000&&t<hi-s.board.endGap/2000).sort((a,b)=>a-b)
      const starts=[lo,...joints.map(t=>t+s.board.endGap/2000)],ends=[...joints.map(t=>t-s.board.endGap/2000),hi],aligned=starts.map((start,j)=>[start,ends[j]] as [number,number])
      if(aligned.length===cuts.length&&aligned.every(([a,b])=>b-a>EPS&&b-a<=s.board.stock+EPS))cuts=aligned
    }
    if(run.row===0)perimeterJointGuides.set(i,cuts.slice(1).map((cut,j)=>{const t=(cuts[j][1]+cut[0])/2;return {x:a.x+t*ux,y:a.y+t*uy}}))
    for(let j=1;j<cuts.length;j++){const t=(cuts[j-1][1]+cuts[j][0])/2;perimeterSplices.push({point:{x:a.x+t*ux+w/2*nx,y:a.y+t*uy+w/2*ny},horizontal:Math.abs(uy)<1e-6})}
    for(const [start,end] of cuts){
      const outline=clipRectangle(axis,start,end,-EPS,w+EPS).map(q=>({x:a.x+q.x*ux+q.y*nx,y:a.y+q.x*uy+q.y*ny}))
      pieces.push({x:a.x,y:a.y,length:end-start,width:w,breaker:false,row:-2,kind:'perimeter',axis:{x:ux,y:uy},outline,perimeterEdge:i,perimeterRow:run.row})
    }
  }
  const across=bounds(local).depth,wholeRows=Math.floor((across+g+EPS)/(w+g)),remainder=across-(wholeRows*w+Math.max(0,wholeRows-1)*g)
  const bands=boardBands(across,w,g,s.allowRipping!==false),rows=bands.length,rippedRows=bands.filter(q=>q.width<w-EPS).map(q=>q.width)
  const rectangle=p.length===4&&p.every((a,i)=>Math.abs(a.x-p[(i+1)%p.length].x)<EPS||Math.abs(a.y-p[(i+1)%p.length].y)<EPS)
  const targetDepths=[Math.max(1,wholeRows),Math.max(1,wholeRows+1)].map(n=>round(bounds(p).depth-bounds(inner).depth+n*w+(n-1)*g))
  const minY=Math.min(...local.map(q=>q.y)),maxY=Math.max(...local.map(q=>q.y))
  const localGap=s.allowRipping===false&&!rectangle&&local.some((q,i)=>Math.abs(q.y-local[(i+1)%local.length].y)<EPS&&q.y>minY+EPS&&q.y<maxY-EPS&&bands.some(b=>q.y>b.y+EPS&&q.y<b.y+b.width-EPS))
  const taperedPieces=pieces.filter(q=>q.kind==='infill'&&Math.max(...pieceOutline(q).map(v=>v.y))-Math.min(...pieceOutline(q).map(v=>v.y))<w-EPS&&pieceOutline(q).some((a,i,outline)=>{const b=outline[(i+1)%outline.length];return Math.abs(a.x-b.x)>EPS&&Math.abs(a.y-b.y)>EPS})).length
  const edgeGap=s.allowRipping!==false?0:Math.max(0,remainder/2)
  const localRipPieces=pieces.filter(q=>q.localRip).length
  const fit={rows,edgeGap,rectangle,targetDepths,localGap,taperedPieces,rippedRows,localRipPieces,cornerGaps,needsAdjustment:edgeGap>.01||localGap,inner}

  return {...infill,pieces,breakers:infill.breakers.map(x=>x+ox),bars:packCuts(pieces.map(q=>q.length),s.board.stock,s.kerf/1000),fit,perimeterSplices}
}
export function buildFrame(p:Point[],s:Settings,boards:{pieces:Piece[];breakers:number[];perimeterSplices?:{point:Point;horizontal:boolean}[]}) {
  return layoutBoardSupports(p,s,boards,frameRule(s.frame,s.load))
}
function openingBorder(hole:Point[],s:Settings,openingIndex:number):Piece[]{
  const w=s.board.width/1000,sign=signedArea(hole)>0?1:-1
  return Array.from({length:s.pictureFrameRows??1},(_,row)=>row).flatMap(row=>{
    const offset=row*(s.board.width+s.board.gap)/1000,ring=offset?insetPolygon(hole,-offset):hole,outer=insetPolygon(hole,-offset-w)
    return ring.flatMap((a,i)=>{
    const b=ring[(i+1)%ring.length],length=distance(a,b),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,nx=uy*sign,ny=-ux*sign
    const quad=[a,b,outer[(i+1)%hole.length],outer[i]],axis=quad.map(q=>({x:(q.x-a.x)*ux+(q.y-a.y)*uy,y:(q.x-a.x)*nx+(q.y-a.y)*ny})),lo=Math.min(...axis.map(q=>q.x)),hi=Math.max(...axis.map(q=>q.x))
    if(hi-lo>s.board.stock+EPS&&s.perimeterJoints===false)throw new Error('A cutout perimeter board exceeds stock length. Allow perimeter end joints or choose longer stock.')
    return splitRun(lo,hi,s.board.stock,s.board.endGap/1000).map(([start,end])=>({x:a.x,y:a.y,length:end-start,width:w,breaker:false,row:-2,kind:'perimeter' as const,openingIndex,perimeterRow:row,axis:{x:ux,y:uy},outline:clipRectangle(axis,start,end,-EPS,w+EPS).map(q=>({x:a.x+q.x*ux+q.y*nx,y:a.y+q.x*uy+q.y*ny}))}))
  })})
}
export type Material = { key: string; name: string; qty: number; unit: string; note: string }
export function validateSettings(s: Settings) {
  if(!s||!Array.isArray(s.polygon)||!s.polygon.every(p=>p&&typeof p.x==='number'&&typeof p.y==='number')||!s.board) return 'Invalid project data.'
  const quoteError=quotationDetailsError(s.quotation);if(quoteError)return quoteError
  if(s.groundSurvey!==undefined){
    if(!Array.isArray(s.groundSurvey)||s.groundSurvey.length>150000||s.groundSurvey.some(r=>!r||![r.x,r.y,r.level].every(Number.isFinite)||Math.abs(r.x)>1000||Math.abs(r.y)>1000||Math.abs(r.level)>2000))return 'Ground readings need finite site coordinates and levels between -2,000 and 2,000 mm.'
    const keys=s.groundSurvey.map(r=>`${Math.round(r.x*100000)},${Math.round(r.y*100000)}`);if(new Set(keys).size!==keys.length)return 'Use one ground reading per pedestal coordinate.'
  }
  if(!['horizontal','vertical'].includes(s.direction)||!['breaker','butt'].includes(s.joints)||!['small','big','small-small','big-small'].includes(s.frame)||![3,5].includes(s.load)) return 'Invalid direction, joint type, frame or design load.'
  if(s.pedestalSelection!==undefined&&!['auto','manual'].includes(s.pedestalSelection))return 'Invalid pedestal selection mode.'
  if(s.frameSelection!==undefined&&!['auto','manual'].includes(s.frameSelection))return 'Invalid frame selection mode.'
  if(s.breakerMode!==undefined&&!['balanced','economy','manual'].includes(s.breakerMode))return 'Invalid breaker layout mode.'
  if(s.breakerCount!==undefined&&(!Number.isInteger(s.breakerCount)||s.breakerCount<0||s.breakerCount>100))return 'Choose between 0 and 100 breakers.'
  if(s.perimeterEdges!==undefined&&(!Array.isArray(s.perimeterEdges)||s.perimeterEdges.length!==s.polygon.length||s.perimeterEdges.some(v=>typeof v!=='boolean')))return 'Choose framing boards for each outline edge.'
  if(s.pictureFrameRows!==undefined&&s.pictureFrameRows!==1&&s.pictureFrameRows!==2)return 'Choose one or two picture-frame board rows.'
  if(s.supportLayout!==undefined){
    const layout=s.supportLayout,point=(q:Point)=>q&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&Math.abs(q.x)<=1000&&Math.abs(q.y)<=1000
    if(!layout||layout.version!==1||!Array.isArray(layout.members)||!Array.isArray(layout.pedestals)||layout.members.length>150000||layout.pedestals.length>150000||layout.members.some(m=>!m||!point(m.a)||!point(m.b)||!['joist','bearer','noggin','rim'].includes(m.kind)||![35,80].includes(m.size)||m.role!==undefined&&!['collector','blocking','edge-rail','bearer-link','support-header','opening-rim','opening-tie'].includes(m.role)||m.support!==undefined&&!['pedestal','transfer'].includes(m.support))||layout.pedestals.some(q=>!point(q)))return 'The edited support layout contains invalid members or pedestal coordinates.'
    if(layout.outlineKey!==undefined&&(typeof layout.outlineKey!=='string'||layout.outlineKey.length>2000000))return 'The edited support layout contains an invalid source outline.'
    const b=layout.boardLayout
    if(b!==undefined&&(!b||typeof b!=='object'||(typeof b.key!=='string'||b.key.length>100000)||!Number.isFinite(b.phase)||Math.abs(b.phase)>1||!Number.isFinite(b.perimeterJointShift)||Math.abs(b.perimeterJointShift)>1||b.breakers!==undefined&&(!Array.isArray(b.breakers)||b.breakers.length>100||b.breakers.some(n=>!Number.isFinite(n)))))return 'The edited layout contains invalid board-joint settings.'
  }
  if(s.frameLayout!==undefined&&!['continuous','open'].includes(s.frameLayout))return 'Invalid frame layout style.'
  for(const value of [s.fasciaClearance,s.joistOverhang35,s.joistOverhang80])if(value!==undefined&&(!Number.isFinite(value)||value<0||value>500))return 'Frame edge clearance and overhang limits must be between 0 and 500 mm.'
  if(s.breakerWidth!==undefined&&!['auto','single','double'].includes(s.breakerWidth))return 'Invalid breaker width option.'
  if(s.selectionObjective!==undefined&&!['cost','simple','pedestals','spread'].includes(s.selectionObjective))return 'Invalid automatic frame selection objective.'
  if(s.breakerPositions!==undefined&&(!Array.isArray(s.breakerPositions)||s.breakerPositions.length>100||s.breakerPositions.some(x=>typeof x!=='number'||!Number.isFinite(x))))return 'Breaker positions must be a list of up to 100 finite distances.'
  if(typeof s.board.name!=='string'||typeof s.board.id!=='string'||typeof s.board.colourName!=='string'||!/^#[0-9a-f]{6}$/i.test(s.board.colour)||typeof s.pedestalName!=='string'||typeof s.confirmed!=='boolean') return 'Invalid board profile or pedestal data.'
  for(const key of ['perimeterJoints','skirting','edgeDetailConfirmed','allowRipping'] as const)if(s[key]!==undefined&&typeof s[key]!=='boolean')return 'Invalid perimeter, fascia or edge confirmation setting.'
  const error=polygonError(s.polygon);if(error) return error
  if(s.cutouts!==undefined){
    if(!Array.isArray(s.cutouts)||s.cutouts.length>10)return 'Use up to 10 internal cutouts.'
    const ids=new Set<string>()
    for(const h of s.cutouts){
      if(!h||typeof h.id!=='string'||!h.id||ids.has(h.id)||typeof h.name!=='string'||!h.name.trim()||!Array.isArray(h.polygon)||!h.polygon.every(p=>p&&typeof p.x==='number'&&typeof p.y==='number'))return 'Invalid cutout data.'
      if(h.shape!==undefined&&!['rectangle','circle','oval','custom'].includes(h.shape))return 'Invalid cutout shape.'
      ids.add(h.id)
      const issue=polygonError(h.polygon,.0025,.001);if(issue)return `${h.name}: ${issue}`
    }
    const issue=cutoutPlacementError(s.polygon,s.cutouts,pictureFrameWidth(s)+s.board.gap/1000+.05);if(issue)return issue
    if(s.cutouts.length&&s.allowRipping===false)return 'Allow ripped and notched boards to make internal cutouts.'
  }
  const checks: [number,number,number,string][]=[
    [s.board.stock,.3,15,'Board length must be between 0.3 and 15 m.'],[s.board.width,60,300,'Board width must be between 60 and 300 mm.'],
    [s.board.thickness,10,100,'Board thickness must be between 10 and 100 mm.'],[s.board.gap,1,15,'Side gap must be between 1 and 15 mm.'],
    [s.board.endGap,1,20,'End gap must be between 1 and 20 mm.'],[s.joistSpacing,100,1500,'Joist centres must be between 100 and 1,500 mm.'],
    [s.height,30,2000,'Build-up height must be between 30 and 2,000 mm.'],[s.variation,0,1000,'Ground variation must be between 0 and 1,000 mm.'],
    [s.pedestalMin,1,2000,'Enter a valid pedestal minimum height.'],[s.pedestalMax,1,3000,'Enter a valid pedestal maximum height.'],
    [s.pedestalDiameter??150,50,600,'Pedestal base diameter must be between 50 and 600 mm.'],[s.pedestalClearance??0,0,300,'Pedestal edge clearance must be between 0 and 300 mm.'],[s.skirtingHeight??200,25,1000,'Fascia board height must be between 25 and 1,000 mm.'],
    [s.frameFaceWidth??35,10,200,'Frame bearing face width must be between 10 and 200 mm.'],[s.boardEndBearing??10,1,80,'Required board end bearing must be between 1 and 80 mm.'],
    [s.kerf,0,10,'Saw kerf must be between 0 and 10 mm.'],[s.frameStock,.5,15,'Frame stock length must be between 0.5 and 15 m.'],
  ]
  for(const [value,min,max,msg] of checks) if(!Number.isFinite(value)||value<min||value>max)return msg
  if(s.pedestalMax<s.pedestalMin) return 'Pedestal maximum must be at least its minimum.'
  const box=bounds(s.polygon),run=s.direction==='horizontal'?box.width:box.depth,across=s.direction==='horizontal'?box.depth:box.width
  if(Math.ceil(across/((s.board.width+s.board.gap)/1000))*Math.ceil(run/s.board.stock)>MAX_CUTTING_BLANKS) return `This combination exceeds ${MAX_CUTTING_BLANKS.toLocaleString('en-IE')} cutting blanks. Use longer board stock or split the project into smaller decks.`
  return ''
}
// Board-only geometry for interactive breaker placement. Uses the identical
// perimeter, opening borders, clipping and stock schedule without a frame solve.
export function planBoardsOnly(s:Settings){
  const error=validateSettings(s);if(error)throw new Error(error)
  const physical=normalize(s.polygon),p=s.direction==='vertical'?physical.map(a=>({x:a.y,y:a.x})):physical
  const holes=physicalCutouts(s).map(h=>h.polygon.map(q=>s.direction==='vertical'?{x:q.y,y:q.x}:q))
  const b=framedBoardLayout(p,s),pieces=[...subtractCutouts(b.pieces,holes.map(h=>insetPolygon(h,-(pictureFrameWidth(s)+s.board.gap/1000)))),...holes.flatMap((h,i)=>openingBorder(h,s,i))]
  return {...b,pieces,resolvedLayout:{phase:0,perimeterJointShift:0,breakers:undefined as number[]|undefined},bars:packCuts(pieces.map(q=>q.length),s.board.stock,s.kerf/1000)}
}
export function planDeck(s: Settings) {
  const error=validateSettings(s);if(error) throw new Error(error)
  const physical=normalize(s.polygon),p=s.direction==='vertical'?physical.map(a=>({x:a.y,y:a.x})):physical
  const cutouts=physicalCutouts(s),holes=cutouts.map(h=>h.polygon.map(q=>s.direction==='vertical'?{x:q.y,y:q.x}:q))
  const cutoutInfill=holes.map(h=>insetPolygon(h,-(pictureFrameWidth(s)+s.board.gap/1000))),borders=holes.flatMap((h,i)=>openingBorder(h,s,i))
  const layout=(phase=0,positions?:number[],perimeterJointShift=0)=>{const b=framedBoardLayout(p,positions?{...s,breakerMode:'manual',breakerPositions:positions}:s,phase,perimeterJointShift),pieces=[...subtractCutouts(b.pieces,cutoutInfill),...borders];return {...b,pieces,resolvedLayout:{phase,perimeterJointShift,breakers:positions},strategy:perimeterJointShift?'Perimeter stock joints adjusted to share valid supports':positions?'Automatic breaker layout adjusted for corner clearance':b.strategy,bars:holes.length?packCuts(pieces.map(q=>q.length),s.board.stock,s.kerf/1000):b.bars,fit:{...b.fit,localRipPieces:pieces.filter(q=>q.localRip).length}}}
  const currentEdits=supportLayoutIsCurrent(s),supportSettings={...s,supportLayout:currentEdits?s.supportLayout:undefined,polygon:p,cutouts:cutouts.map((h,i)=>({...h,polygon:holes[i]}))}
  const savedBoardLayout=currentEdits?s.supportLayout?.boardLayout:undefined,retainBoards=savedBoardLayout?.key===boardLayoutKey(s)
  let boards=retainBoards?layout(savedBoardLayout.phase,savedBoardLayout.breakers,savedBoardLayout.perimeterJointShift):layout(),frame=buildFrame(p,supportSettings,boards)
  if(s.joints==='breaker'&&s.breakerMode!=='manual'&&boards.breakers.length&&!frame.geometryPass&&frame.issues.some(q=>q.includes('upper support faces overlap')||(!frame.rule.bearer&&q.includes('Required bearing nodes are only')))){
    // Automatic equal bays are a starting point, not a reason to force a
    // breaker rail into a re-entrant rim. Try the smallest local shift that
    // shares a real edge rail or clears it. On direct frames, separate bases
    // can clash before the narrower upper faces do; their actual diameter sets
    // the local search distance. Stock and every support audit must still pass.
    // Explicit manual breaker positions are never moved here.
    const face=(s.frameFaceWidth??35)/1000,rail=breakerRailOffset(s),breakers=boards.breakers
    const shiftLimit=Math.max(2*face,frame.rule.bearer?0:(s.pedestalDiameter??150)/1000)
    const rings=[frame.footprint,...holes.map(h=>insetPolygon(h,-frame.setback))]
    const trimXs=[...new Set(rings.flatMap(r=>r.flatMap((a,i)=>Math.abs(a.x-r[(i+1)%r.length].x)<EPS?[a.x]:[])))]
    const centre=(Math.min(...boards.fit.inner.map(q=>q.x))+Math.max(...boards.fit.inner.map(q=>q.x)))/2,candidates:number[][]=[]
    for(const [i,x] of breakers.entries()){
      const targets=[...trimXs.flatMap(t=>[t-rail,t+rail]),x-face,x+face,x-2*face,x+2*face].filter(t=>Math.abs(t-x)>EPS&&Math.abs(t-x)<=shiftLimit+EPS).sort((a,b)=>Math.abs(a-x)-Math.abs(b-x))
      for(const target of targets){
        const next=breakers.map((value,j)=>j===i?target:value)
        const pair=breakers.findIndex((value,j)=>j!==i&&Math.abs(value-(2*centre-x))<.002)
        if(s.breakerMode!=='economy'&&pair>=0)candidates.push(next.map((value,j)=>j===pair?2*centre-target:value))
        candidates.push(next)
      }
    }
    const tried=new Set<string>()
    for(const positions of candidates){const key=positions.map(x=>x.toFixed(7)).join(',');if(tried.has(key))continue;tried.add(key)
      try{const candidate=layout(0,positions),support=buildFrame(p,supportSettings,candidate);if(support.geometryPass){boards=candidate;frame=support;break}}catch{/* A shift may exceed stock or the legal bay limits. */}
    }
  }
  if(s.joints==='butt'&&!frame.geometryPass&&frame.issues.some(q=>q.includes('upper support faces overlap'))){
    // Keep the common staggered lattice, moving it as a unit when a joint rail
    // would crowd a required edge rail after rip widths change the row phase.
    const face=(s.frameFaceWidth??35)/1000
    for(const phase of [face,-face,2*face,-2*face]){
      try{const candidate=layout(phase),support=buildFrame(p,supportSettings,candidate)
        if(support.geometryPass){boards=candidate;frame=support;break}
      }catch{/* Another phase may create an unsuitable end blank. */}
    }
  }
  if(!frame.geometryPass&&boards.perimeterSplices.length&&frame.issues.some(q=>q.includes('upper support faces overlap'))){
    // Perimeter stock joins are automatic cutting choices. Move those joins,
    // rather than overlap two supporting faces or alter a manual breaker.
    const fixedBreakers=s.joints==='breaker'?[...boards.breakers]:undefined
    for(const shift of [.005,-.005,.01,-.01,.02,-.02,.035,-.035,.05,-.05,.075,-.075,.1,-.1]){
      try{const candidate=layout(0,fixedBreakers,shift),support=buildFrame(p,supportSettings,candidate)
        if(support.geometryPass){boards=candidate;frame=support;break}
      }catch{/* Every candidate must still satisfy the real stock and board cuts. */}
    }
  }
  const area=polygonArea(p)-holes.reduce((sum,h)=>sum+polygonArea(h),0)
  const lengths=boards.pieces.map(a=>a.length),used=lengths.reduce((a,b)=>a+b,0)
  const purchased=boards.bars.length*s.board.stock,blankArea=used*s.board.width/1000
  // Length loss includes kerf and residual stock, not angled end-cut area.
  const offcut=purchased-used,footprint=purchased*s.board.width/1000
  const perimeter=p.reduce((sum,a,i)=>sum+distance(a,p[(i+1)%p.length]),0)
  const timber=frame.members.reduce((t,m)=>{t[m.size]=(t[m.size]||0)+distance(m.a,m.b);return t},{} as Record<number,number>)
  const frameCuts: Record<number, StockBar[]>={}
  const framePieces:Record<number,{member:number;length:number;a:Point;b:Point;kind:Member['kind']}[]>={}
  for(const size of [35,80]) {
    // The support solver has already placed stock splices on real bearings.
    framePieces[size]=frame.members.flatMap((m,member)=>{if(m.size!==size)return [];const l=distance(m.a,m.b);return Array.from({length:Math.ceil(l/s.frameStock-EPS)},(_,i)=>{const start=i*s.frameStock,end=Math.min(l,start+s.frameStock),at=(t:number)=>({x:m.a.x+(m.b.x-m.a.x)*t/l,y:m.a.y+(m.b.y-m.a.y)*t/l});return {member,length:end-start,a:at(start),b:at(end),kind:m.kind}})})
    frameCuts[size]=packCuts(framePieces[size].map(q=>q.length),s.frameStock,s.kerf/1000)
  }
  // The cards, required adjustment and report all use the same height check.
  const heightCheck=heightFit(s,frame.rule),survey=pedestalHeights(frame.pedestals,s,frame.rule),range=survey.range??heightCheck.required,heightFits=survey.rows.length?survey.fits:heightCheck.fits
  const warnings: string[]=[]
  if(!heightFits) warnings.push(survey.surveyed?'One or more pedestal adjustments fall outside the selected product range at the surveyed ground levels.':heightCheck.reason)
  if(survey.unmatched)warnings.push(`${survey.unmatched} saved ground readings do not match current pedestal coordinates. Resurvey the changed support positions.`)
  if(!s.confirmed) warnings.push('Confirm the selected board is approved for this Alu-Joist K Series frame and the chosen joist centres. The report covers BetterDeck-recommended composite decking only.')
  if(s.joistSpacing>400)warnings.push('Entered joist centres exceed the report’s 400 mm decking limit. Confirm the board supplier’s span approval for this spacing.')
  if(s.frame==='small-small'&&s.load===5) warnings.push('Report 4B lists 800 mm support spacing at 5 kN/m² versus 700 mm at 3 kN/m². These exact values are retained; confirm with the supplier before construction.')
  warnings.push('Support positions are a geometric concept layout using the report span limits. Pedestal capacity, bearing, slope, bracing and connections require product/site verification. The span report does not approve end projections or the generated blocking/collector connections.')
  warnings.push(...frame.verification.notes)
  if(frame.junctions.length&&frame.layoutStatus==='ready')warnings.push(`${frame.junctions.length} primary junction nodes require pedestal heads and connections that support every meeting member. These exact common bearings are drawn once; distinct nearby bases are never merged.`)
  warnings.push(...frame.issues)
  if(!s.edgeDetailConfirmed)warnings.push(`Physical frame ends are recessed at least ${Math.round(frame.fasciaClearance*1000)} mm for fascia. The entered top face is ${s.frameFaceWidth??35} mm with ${s.boardEndBearing??10} mm required board bearing. Confirm decking projections and the generated connection details with the supplier.`)
  if(boards.fit.cornerGaps.length)warnings.push(`${boards.fit.cornerGaps.length} tiny corner islands, no larger than the ${s.board.gap} mm installation gap in either direction, are left as corner gaps rather than counted as separate unsupported board pieces. Their locations are retained in the plan data.`)
  if(boards.fit.edgeGap>.01)warnings.push(`Full-width boards leave ${Math.round(boards.fit.edgeGap*1000)} mm extra clearance at each outside infill row. Adjust the outline or board width; no straight full-length rip is used.`)
  if(frame.splices.length) warnings.push('Frame stock joints sit on real bearings; their splice connections still require supplier detailing.')
  if(boards.fit.localGap)warnings.push('Some internal corners fall through a full-width row. Allow straight rip cuts to fill these regions, or adjust those dimensions.')
  const skirtingHeight=s.skirtingHeight??200,skirtingGap=s.height-s.board.thickness-skirtingHeight
  const skirtPieces=s.skirting?p.flatMap((a,i)=>{const b=p[(i+1)%p.length],l=distance(a,b),at=(t:number)=>({x:a.x+(b.x-a.x)*t/l,y:a.y+(b.y-a.y)*t/l});return splitRun(0,l,s.board.stock,s.board.endGap/1000).map(([start,end])=>({edge:i,length:end-start,a:at(start),b:at(end)}))}):[]
  const skirtBars=packCuts(skirtPieces.map(q=>q.length),s.board.stock,s.kerf/1000)
  if(s.skirting)warnings.push('Fascia edge loads, wind exposure, ventilation, fixings and bracing require supplier/site verification.')
  if(s.skirting&&skirtingGap<0)warnings.push('The selected full-height fascia board extends below the ground. Select a shorter product; the planner does not rip it down.')
  const clips=Math.ceil(boards.pieces.reduce((sum,p)=>sum+Math.ceil(p.length/(s.joistSpacing/1000))+1,0))
  const hardware=frameHardware(frame,s.frameFaceWidth??35)
  const hardwareNote=frame.geometryPass?'Derived from actual same-tier aluminium member ends.':'UNRESOLVED: connector quantities are pending support geometry.'
  const materials: Material[]=[
    {key:'boards',name:`${deckingBoardName(s.board.name)} · ${s.board.stock} m`,qty:boards.bars.length,unit:'boards',note:`Includes perimeter, infill and breaker pieces. ${used.toFixed(2)} linear m of cutting blanks.`},
    ...[35,80].filter(size=>size===frame.rule.joist||size===frame.rule.bearer).map(size=>{const product=appliedProduct(s,'frame');return {key:`profile${size}`,name:`${product?.kind==='frame'&&product.height===size?product.name:aluJoistName(size)} · ${s.frameStock} m`,qty:frameCuts[size].length,unit:'lengths',note:frame.geometryPass?`${(timber[size]||0).toFixed(2)} installed linear m; includes picture-frame and breaker supports.`:'UNRESOLVED: frame quantity and cost are unavailable until the support geometry passes.'}}),
    {key:'pedestals',name:s.pedestalName||'Adjustable pedestals',qty:frame.pedestals.length,unit:'units',note:frame.layoutStatus==='ready'?`Provisional locations; ${Math.round(range.min)}–${Math.round(range.max)} mm required adjustment.`:'UNRESOLVED: support quantity and frame costs are unavailable until a complete arrangement fits.'},
    {key:'continuousJoiners',name:'Continuous joiner',qty:hardware.continuousJoiners,unit:'units',note:`One at each aluminium butt joint; 2 mm visual gap. ${hardwareNote}`},
    {key:'joistJoiners',name:'Joist joiner',qty:hardware.joistJoiners,unit:'units',note:`Two per butt joint, one on each side, for joists and bearers. ${hardwareNote}`},
    {key:'perpendicularJoiners',name:'Perpendicular joist joiner',qty:hardware.perpendicularJoiners,unit:'units',note:`One per same-tier perpendicular end connection, including ladder blocking; no physical gap. ${hardwareNote}`},
    ...(s.skirting?[{key:'skirting',name:`Fascia board · ${skirtingHeight} mm × ${s.board.stock} m`,qty:skirtBars.length,unit:'boards',note:`${perimeter.toFixed(2)} m perimeter; separate fascia product, no height ripping.`}]:[]),
    {key:'clips',name:'Decking fixing positions',qty:clips,unit:'positions',note:'Allowance only. Clip type, shared clips, starter clips and screws need a product fixing schedule.'},
  ]
  return {p,physical,cutouts,holes,boards,frame,area,perimeter,used,purchased,offcut,blankArea,footprint,range,heightFits,warnings,materials,frameCuts,framePieces,clips,skirtingGap,skirtBars,skirtPieces}
}
export type Plan = ReturnType<typeof planDeck>

