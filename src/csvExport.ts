import { bounds, FRAME_NAMES, pieceOutline } from './planner.ts'
import type { Plan, Point, Settings } from './planner.ts'
import { materialEstimate } from './materialEstimate.ts'
import { deckingBoardName, frameMemberName, pedestalReference } from './productNames.ts'
import { breakerBoardCount, breakerStripWidth } from './breakerWidth.ts'
import { installerPlan } from './installerPlan.ts'
import { perimeterEdgeEnabled } from './perimeterEdges.ts'

export type CsvCell=string|number|null
export type CsvKind='materials'|'quote'|'boards'|'frame'|'skirting'|'pedestals'|'project'
export type CsvReport={headers:string[];rows:CsvCell[][];unavailable?:string}
export const CSV_REPORTS:{id:CsvKind;label:string;description:string}[]=[
  {id:'materials',label:'Materials & pricing',description:'Purchase quantities, stock sizes, entered rates and material subtotals. Missing quantities and prices stay pending.'},
  {id:'quote',label:'Materials quote',description:'A concise materials estimate with entered prices. Labour, delivery, VAT and unlisted hardware are excluded.'},
  {id:'boards',label:'Decking board cutting list',description:'Every infill, perimeter and breaker piece, grouped by stock board, with finished sizes, cut shapes and offcuts.'},
  {id:'frame',label:'Alu-Joist cutting list',description:'35 / 80 mm Alu-Joist K Series profile cuts, stock allocation and member positions. Available once support geometry passes.'},
  {id:'skirting',label:'Fascia cutting list',description:'Separate fascia stock, edge positions and cutting lengths. Available when fascia is enabled.'},
  {id:'pedestals',label:'Pedestal positions',description:'Each base location, diameter and required height range. Available once support geometry passes.'},
  {id:'project',label:'Project details & checks',description:'Dimensions, products, outline corners, report limits, individual checks and review notes.'},
]
const mm=(m:number)=>Math.round(m*10000)/10
const round=(n:number)=>Math.round(n*1000)/1000
const id=(prefix:string,n:number)=>`${prefix}${String(n+1).padStart(4,'0')}`
const physical=(q:Point,s:Settings)=>s.direction==='vertical'?{x:q.y,y:q.x}:q
const supportStatus=(p:Plan)=>p.frame.geometryPass?'Provisional; product/site checks required':'UNRESOLVED: support geometry needs correction'
const exclusions='Materials only. Excludes labour, delivery, VAT, unlisted hardware and spare allowances. Provisional estimate; not a construction specification.'

// Quote every field; preserve numbers, and neutralise spreadsheet formulas in
// user-authored text. UTF-8 BOM and CRLF make Excel imports predictable.
export function serializeCsv(report:CsvReport,delimiter:','|';'=','):string{
  const cell=(value:CsvCell)=>{
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Cannot export a non-finite CSV number.')
    let text=value===null?'':String(value)
    if(typeof value==='string'&&/^[\s\uFEFF]*[=+\-@]/.test(text))text=`'${text}`
    return `"${text.replaceAll('"','""')}"`
  }
  if(report.rows.some(row=>row.length!==report.headers.length))throw new Error('CSV row does not match its header.')
  return '\uFEFF'+[report.headers,...report.rows].map(row=>row.map(cell).join(delimiter)).join('\r\n')+'\r\n'
}

function boardShape(plan:Plan,s:Settings,index:number){
  const p=plan.boards.pieces[index],outline=pieceOutline(p)
  let ux=p.axis?.x??(p.breaker?0:1),uy=p.axis?.y??(p.breaker?1:0)
  if(p.kind==='perimeter'){
    const edge=plan.p.findIndex(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-6)
    if(edge>=0){const a=plan.p[edge],b=plan.p[(edge+1)%plan.p.length],l=Math.hypot(b.x-a.x,b.y-a.y);ux=(b.x-a.x)/l;uy=(b.y-a.y)/l}
  }
  const local=outline.map(q=>({x:q.x*ux+q.y*uy,y:-q.x*uy+q.y*ux})),minX=Math.min(...local.map(q=>q.x)),minY=Math.min(...local.map(q=>q.y))
  const angled=local.some((q,i)=>{const b=local[(i+1)%local.length];return Math.abs(q.x-b.x)>1e-6&&Math.abs(q.y-b.y)>1e-6}),rip=p.width<s.board.width/1000-1e-6
  const holeText=(p.holes??[]).map((ring,i)=>`HOLE ${i+1}: ${ring.map(q=>`${mm(q.x*ux+q.y*uy-minX)} ${mm(-q.x*uy+q.y*ux-minY)}`).join(' | ')}`).join(' ; ')
  return {type:p.holes?.length?'Internal cutout':p.localRip?'Local rip / notch':rip&&angled?'Rip + angled cut':rip?'Straight rip':angled?'Angled / tapered cut':'Square cut',points:local.map(q=>`${mm(q.x-minX)} ${mm(q.y-minY)}`).join(' | ')+(holeText?` ; ${holeText}`:'')}
}

export function buildCsvReport(kind:CsvKind,plan:Plan,s:Settings,prices:Record<string,string>):CsvReport{
  const estimate=materialEstimate(plan,prices)
  if(kind==='materials'||kind==='quote'){
    const quote=kind==='quote'
    const headers=quote?['Record','Item ID','Component','Quantity','Unit','Unit rate EUR','Line total EUR','Status','Notes']:['Record','Item ID','Component','Quantity','Unit','Stock length mm','Width mm','Thickness / profile height mm','Unit rate EUR','Line total EUR','Status','Notes']
    const rows:CsvCell[][]=estimate.lines.map(q=>{
      const stock=q.key==='boards'||q.key==='skirting'?mm(s.board.stock):q.key.startsWith('profile')?mm(s.frameStock):null
      const width=q.key==='boards'?s.board.width:q.key==='skirting'?s.skirtingHeight??200:null
      const thickness=q.key==='boards'?s.board.thickness:q.key.startsWith('profile')?Number(q.key.slice(7)):null
      const status=q.pending?'Quantity pending':q.rate===null?'Price missing':'Priced; provisional quantity'
      const base:CsvCell[]=['Item',q.key,q.name,q.pending?null:q.qty,q.unit]
      return [...base,...(quote?[]:[stock,width,thickness]),q.rate,q.cents===null?null:q.cents/100,status,q.note]
    })
    const summary:CsvCell[]=['Summary','',estimate.complete?'Entered materials total':'Known priced subtotal',null,'']
    rows.push([...summary,...(quote?[]:[null,null,null]),null,estimate.priced?estimate.subtotalCents/100:null,estimate.complete?'All material rates entered':estimate.pending?'INCOMPLETE: quantities pending':'INCOMPLETE: prices missing',exclusions])
    rows.push(['Status','','Project review',null,'',...(quote?[]:[null,null,null]),null,null,supportStatus(plan),`${plan.heightFits?'Pedestal height range fits.':'Pedestal height range needs correction.'} ${!plan.boards.fit.needsAdjustment?'':'Infill fit needs review. '}${s.skirting&&plan.skirtingGap<0?'Fascia extends below ground. ':''}Board compatibility: ${s.confirmed?'recorded':'unconfirmed'}. Edge detail: ${s.edgeDetailConfirmed?'recorded':'unconfirmed'}. Applied fascia recess: ${mm(plan.frame.fasciaClearance)} mm; maximum metal projection: ${mm(Math.max(0,...plan.frame.projections.map(q=>q.distance)))} mm. Supplier projection limits and connector capacities require verification.`])
    return {headers,rows}
  }
  if(kind==='boards'){
    const rows:CsvCell[][]=[]
    for(const [barIndex,bar] of plan.boards.bars.entries())for(const [sequence,cut] of bar.cuts.entries()){
      const p=plan.boards.pieces[cut.piece],shape=boardShape(plan,s,cut.piece),outline=pieceOutline(p).map(q=>physical(q,s)),minX=Math.min(...outline.map(q=>q.x)),minY=Math.min(...outline.map(q=>q.y))
      rows.push([id('DB-',barIndex),sequence+1,id('B-',cut.piece),p.kind||'infill',p.row>=0?p.row+1:null,mm(s.board.stock),s.board.width,s.board.thickness,mm(cut.length),mm(p.width),shape.type,shape.points,mm(minX),mm(minY),sequence?s.kerf:0,sequence===bar.cuts.length-1?mm(bar.remaining):null,s.board.colourName])
    }
    return {headers:['Stock board ID','Cut order','Piece ID','Board use','Infill row','Stock length mm','Stock width mm','Thickness mm','Blank cut length mm','Finished maximum width mm','Cut type','Cut outline mm (local length width pairs)','Deck minimum X mm','Deck minimum Y mm','Kerf before cut mm','End offcut mm (once per stock)','Colour'],rows}
  }
  if(kind==='frame'){
    const headers=['Stock profile ID','Cut order','Piece ID','Member ID','Member type','Profile height mm','Stock length mm','Cut length mm','Start X mm','Start Y mm','End X mm','End Y mm','Kerf before cut mm','End offcut mm (once per stock)','Start projection mm','End projection mm','Entered profile limit mm','Applied fascia recess mm','Status','Connection detail']
    if(!plan.frame.geometryPass)return {headers,rows:[],unavailable:'Resolve support geometry before exporting Alu-Joist cuts.'}
    const rows:CsvCell[][]=[]
    for(const size of [35,80])for(const [barIndex,bar] of plan.frameCuts[size].entries())for(const [sequence,cut] of bar.cuts.entries()){
      const p=plan.framePieces[size][cut.piece],a=physical(p.a,s),b=physical(p.b,s),projections=plan.frame.projections.filter(q=>q.member===p.member),limit=plan.frame.profileLimits[size as 35|80]
      rows.push([id(`AL${size}-`,barIndex),sequence+1,id(`F${size}-`,cut.piece),id('M-',p.member),frameMemberName(size,p.kind,plan.frame.members[p.member].role),size,mm(s.frameStock),mm(cut.length),mm(a.x),mm(a.y),mm(b.x),mm(b.y),sequence?s.kerf:0,sequence===bar.cuts.length-1?mm(bar.remaining):null,mm(projections.find(q=>q.end==='start')?.distance??0),mm(projections.find(q=>q.end==='end')?.distance??0),limit===null?null:mm(limit),mm(plan.frame.fasciaClearance),'Provisional; supplier details unverified','Confirm end cuts, mitres, heads, connectors and load transfer.'])
    }
    return {headers,rows}
  }
  if(kind==='skirting'){
    const headers=['Stock fascia ID','Cut order','Piece ID','Deck edge','Stock length mm','Cut length mm','Fascia height mm','Start X mm','Start Y mm','End X mm','End Y mm','Kerf before cut mm','End offcut mm (once per stock)','Colour','Status']
    if(!s.skirting)return {headers,rows:[],unavailable:'Enable fascia in Finish to export its cutting list.'}
    const rows:CsvCell[][]=[]
    for(const [barIndex,bar] of plan.skirtBars.entries())for(const [sequence,cut] of bar.cuts.entries()){
      const p=plan.skirtPieces[cut.piece],a=physical(p.a,s),b=physical(p.b,s)
      rows.push([id('SK-STOCK-',barIndex),sequence+1,id('SK-',cut.piece),p.edge+1,mm(s.board.stock),mm(cut.length),s.skirtingHeight??200,mm(a.x),mm(a.y),mm(b.x),mm(b.y),sequence?s.kerf:0,sequence===bar.cuts.length-1?mm(bar.remaining):null,s.board.colourName,plan.skirtingGap<0?'REVIEW: fascia extends below ground':'Provisional; confirm site clearance'])
    }
    return {headers,rows}
  }
  if(kind==='pedestals'){
    const headers=['Pedestal ID','Deck X mm','Deck Y mm','Base diameter mm','Extra edge clearance mm','Required minimum height mm','Required maximum height mm','Product minimum height mm','Product maximum height mm','Product','Shared junction','Status']
    if(!plan.frame.geometryPass)return {headers,rows:[],unavailable:'Resolve support geometry before exporting pedestal positions.'}
    return {headers,rows:plan.frame.pedestals.map((p,i)=>{const q=physical(p,s);return [pedestalReference(s.pedestalName,i),mm(q.x),mm(q.y),s.pedestalDiameter??150,s.pedestalClearance??0,round(plan.range.min),round(plan.range.max),s.pedestalMin,s.pedestalMax,s.pedestalName,plan.frame.junctions.some(j=>Math.hypot(j.x-p.x,j.y-p.y)<1e-6)?'Yes':'No',plan.heightFits?'Provisional; product/site checks required':'REVIEW: product height range does not fit']})}
  }
  const box=bounds(plan.physical),rows:CsvCell[][]=[]
  const detail=(category:string,label:string,value:CsvCell,unit='',status='',notes='')=>rows.push([category,label,value,unit,status,notes])
  detail('Project','Export format','BetterPlan CSV v2')
  detail('Project','Support status',supportStatus(plan))
  detail('Geometry','Deck area',round(plan.area),'m2')
  detail('Geometry','Overall width',mm(box.width),'mm');detail('Geometry','Overall depth',mm(box.depth),'mm')
  detail('Geometry','Perimeter',mm(plan.perimeter),'mm')
  detail('Geometry','Board run',s.direction==='horizontal'?'Along deck X':'Along deck Y')
  detail('Coordinates','Origin','Normalised deck minimum X / Y','', '', 'Position exports use deck X right and Y down. Cut-outline pairs use local blank length and width, from their minimum bounds; rotate the blank to match the plan.')
  for(const [i,q] of plan.physical.entries()){detail('Outline',`Corner ${i+1} X`,mm(q.x),'mm');detail('Outline',`Corner ${i+1} Y`,mm(q.y),'mm')}
  for(const [i] of plan.physical.entries())detail('Edge boards',`E${String(i+1).padStart(2,'0')} picture-frame board`,perimeterEdgeEnabled(s,i)?'Included':'Omitted')
  detail('Geometry','Internal cutouts',plan.cutouts.length,'openings')
  for(const [i,h] of plan.cutouts.entries()){
    detail('Cutout',`H-${String(i+1).padStart(2,'0')}`,h.name)
    for(const [j,q] of h.polygon.entries()){detail('Cutout',`H${i+1} point ${j+1} X`,mm(q.x),'mm');detail('Cutout',`H${i+1} point ${j+1} Y`,mm(q.y),'mm')}
  }
  detail('Board','Product',deckingBoardName(s.board.name));detail('Board','Stock length',mm(s.board.stock),'mm');detail('Board','Width',s.board.width,'mm');detail('Board','Thickness',s.board.thickness,'mm')
  detail('Board','Side gap',s.board.gap,'mm');detail('Board','End gap',s.board.endGap,'mm');detail('Board','Saw kerf',s.kerf,'mm');detail('Board','Colour',s.board.colourName)
  detail('Board','Picture-frame rows',s.pictureFrameRows??1,'rows')
  for(const [i,ring] of plan.boards.fit.cornerGaps.entries())detail('Corner installation gap',`Gap ${i+1}`,null,'mm','Not a separate board piece',ring.map(q=>{const p=physical(q,s);return `${mm(p.x)},${mm(p.y)}`}).join('; '))
  detail('Board','Infill joints',s.joints==='butt'?'Butt joints allowed':'No infill butt joints; use breakers')
  detail('Board','Breaker stock joints','Only where a continuous section exceeds stock length')
  if(s.joints==='breaker'){detail('Board','Breaker width selection',s.breakerWidth??'auto');detail('Board','Boards per breaker strip',breakerBoardCount(s),'boards');detail('Board','Breaker strip width',mm(breakerStripWidth(s)),'mm')}
  detail('Board','Ripping',s.allowRipping!==false?'Allowed':'Disabled');detail('Board','Local rip / notch pieces',plan.boards.fit.localRipPieces,'pieces')
  detail('Frame','Configuration',FRAME_NAMES[s.frame]);detail('Frame','Design load',s.load,'kN/m2');detail('Frame','Joist centres',s.joistSpacing,'mm')
  detail('Frame','Stock length',mm(s.frameStock),'mm');detail('Frame','Top face width',s.frameFaceWidth??35,'mm');detail('Frame','Required board bearing',s.boardEndBearing??10,'mm')
  detail('Frame','Build-up height',s.height,'mm');detail('Frame','Ground variation',s.variation,'mm')
  detail('Construction','Frame layout','Board-driven joists, blocking and collectors')
  detail('Construction','Layout source',plan.frame.manual?'Manually edited and geometry checked':'Automatic solver')
  detail('Construction','Support arrangement',plan.frame.supportArrangement==='same-depth-headers'?'Same-depth support headers and connected joists':'Pedestal grid with local opening trims')
  detail('Construction','Frame-end setback for fascia',mm(plan.frame.fasciaClearance),'mm','Applied to solved geometry','Minimum frame-end recess from the deck outline. Some members terminate further inside at a collector or rail.')
  for(const [size,limit] of [[35,plan.frame.profileLimits[35]===null?undefined:mm(plan.frame.profileLimits[35])],[80,plan.frame.profileLimits[80]===null?undefined:mm(plan.frame.profileLimits[80])]] as const)detail('Construction',`${size} mm profile end-overhang limit`,limit??null,limit===undefined?'':'mm',limit===undefined?'Pending supplier value':'Limit entered','A user-entered limit requires supplier verification. Missing values are not assumed to be zero.')
  detail('Frame','Automatic selection priority',({cost:'Lowest material cost',simple:'Simplest frame',pedestals:'Fewest pedestals',spread:'More pedestals'} as const)[s.selectionObjective??'cost'])
  const settingOut=installerPlan(plan,s)
  for(const q of settingOut.construction.projections)detail('Calculated overhang',`${q.member} ${q.end}`,round(q.distance),'mm',q.limit===null?'Unverified supplier limit':q.distance<=q.limit+.01?'Within entered limit':'EXCEEDS LIMIT',`${q.tier}; ${q.size} mm profile; support X ${round(q.support.x)} / Y ${round(q.support.y)} mm; entered limit ${q.limit===null?'unset':round(q.limit)+' mm'}`)
  for(const q of settingOut.construction.boardProjections)detail('Decking projection',`B-${String(q.piece+1).padStart(4,'0')}`,round(q.distance),'mm','Unverified board limit',`Cut end X ${round(q.point.x)} / Y ${round(q.point.y)} mm`)
  for(const q of settingOut.construction.connections)detail('Connection',q.id,q.members.join(', '),'','Unverified',`X ${round(q.point.x)} / Y ${round(q.point.y)} mm; supplier connector/head and load transfer required`)
  for(const [i,note] of plan.frame.verification.notes.entries())detail('Product verification',`Detail ${i+1}`,null,'','Unverified',note)
  for(const c of settingOut.centreLines)detail('Setting-out',c.id,c.coordinate,'mm',c.kind,`${c.axis} coordinate from datum${c.spacing===null?'':`; previous parallel line gap ${round(c.spacing)} mm`}`)
  for(const j of settingOut.stockJoints){detail('Stock joint',`${j.id} X`,round(j.x),'mm');detail('Stock joint',`${j.id} Y`,round(j.y),'mm')}
  detail('Source','Span report','Betterdeck Aluminium Profiles Design, contract 1513-1, revision 2, 15 June 2021')
  detail('Source','Report case',plan.frame.rule.sheet);detail('Source','PDF pages',plan.frame.rule.pages)
  detail('Source','Primary support span limit',mm(plan.frame.rule.support),'mm');detail('Source','Secondary span limit',plan.frame.rule.bearer?mm(plan.frame.rule.bearerSpacing):null,'mm')
  for(const check of plan.frame.checks)detail('Check',check.name,null,'',check.ok?'PASS':'FAIL',check.detail)
  for(const [i,note] of plan.warnings.entries())detail('Review note',`Note ${i+1}`,null,'','Review',note)
  detail('Pricing','Currency','EUR');detail('Pricing','Rates entered',estimate.priced,'items');detail('Pricing','Rates required',estimate.lines.length,'items')
  detail('Pricing','Scope',exclusions)
  detail('Cutting','Packing method','Best-fit decreasing; heuristic, not a guaranteed optimum')
  detail('Cutting','Offcut convention','End offcut is reported once per stock item; kerf before each additional cut. Width offcuts are not reused.')
  return {headers:['Category','Detail','Value','Unit','Status','Notes'],rows}
}
