import type { BoardProfile, Settings } from './planner.ts'
import { boardProfileError } from './boardProfiles.ts'

export const PRODUCT_STORAGE='betterplan-products-v1'
export const PRODUCT_KINDS=[{value:'board',label:'Decking boards'},{value:'pedestal',label:'Pedestals'},{value:'frame',label:'Alu-Joists'}] as const
export type ProductKind=typeof PRODUCT_KINDS[number]['value']
type ProductBase={id:string;name:string;sku?:string;supplier?:string;notes?:string;unitPrice?:number}
export type BoardProduct=ProductBase&{kind:'board';board:BoardProfile;joistCentres:number;endBearing:number}
export type PedestalProduct=ProductBase&{kind:'pedestal';min:number;max:number;diameter:number}
export type FrameProduct=ProductBase&{kind:'frame';height:35|80;stock:number;faceWidth:number;maxOverhang?:number}
export type LibraryProduct=BoardProduct|PedestalProduct|FrameProduct
export type ProductSelections={board?:BoardProduct;pedestal?:PedestalProduct;frame?:FrameProduct}
const numberIn=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max
const text=(n:unknown,max:number)=>typeof n==='string'&&n.length<=max

export function productError(value:unknown):string{
  if(!value||typeof value!=='object')return 'Enter the product details.'
  const p=value as LibraryProduct
  if(!text(p.id,200)||!p.id.trim())return 'The product needs an ID.'
  if(!text(p.name,160)||!p.name.trim())return 'Enter a product name (up to 160 characters).'
  if(p.sku!==undefined&&!text(p.sku,100))return 'Product code must be 100 characters or fewer.'
  if(p.supplier!==undefined&&!text(p.supplier,160))return 'Supplier must be 160 characters or fewer.'
  if(p.notes!==undefined&&!text(p.notes,2000))return 'Notes must be 2,000 characters or fewer.'
  if(p.unitPrice!==undefined&&!numberIn(p.unitPrice,0,10000000))return 'Enter a valid price, or leave it blank.'
  if(p.kind==='board'){
    const error=boardProfileError(p.board);if(error)return error
    if(!numberIn(p.joistCentres,100,400))return 'Maximum joist centres must be between 100 and 400 mm.'
    if(!numberIn(p.endBearing,1,80))return 'Required board-end bearing must be between 1 and 80 mm.'
  }else if(p.kind==='pedestal'){
    if(!numberIn(p.min,1,2000))return 'Minimum adjustment must be between 1 and 2,000 mm.'
    if(!numberIn(p.max,p.min,3000))return 'Maximum adjustment must be at least the minimum, up to 3,000 mm.'
    if(!numberIn(p.diameter,50,600))return 'Base diameter must be between 50 and 600 mm.'
  }else if(p.kind==='frame'){
    if(p.height!==35&&p.height!==80)return 'Choose a 35 mm or 80 mm K Series profile covered by the span report.'
    if(!numberIn(p.stock,.5,15))return 'Stock length must be between 0.5 and 15 m.'
    if(!numberIn(p.faceWidth,10,200))return 'Bearing-face width must be between 10 and 200 mm.'
    if(p.maxOverhang!==undefined&&!numberIn(p.maxOverhang,0,500))return 'Supplier overhang limit must be between 0 and 500 mm, or blank.'
  }else return 'Choose a product type.'
  return ''
}
export function isLibraryProduct(value:unknown):value is LibraryProduct{return !productError(value)}
export function saveProduct(products:LibraryProduct[],value:LibraryProduct):LibraryProduct[]{
  const error=productError(value);if(error)throw new Error(error)
  const name=value.name.trim()
  if(products.some(p=>p.id!==value.id&&p.kind===value.kind&&p.name.toLowerCase()===name.toLowerCase()))throw new Error('A product with this name already exists. Edit it or choose another name.')
  const clean={...value,name,sku:value.sku?.trim(),supplier:value.supplier?.trim(),notes:value.notes?.trim()}
  const product=clean.kind==='board'?{...clean,board:{...clean.board,id:clean.id,name}}:clean
  return products.some(p=>p.id===product.id)?products.map(p=>p.id===product.id?product:p):[...products,product]
}

// Existing board profiles are migrated once, without needing a valid deck or frame.
export function readProductLibrary(value:unknown,legacyBoards:unknown=[]):LibraryProduct[]{
  const saved=Array.isArray(value)?value.filter(isLibraryProduct):[]
  const products:LibraryProduct[]=[]
  for(const p of saved)if(!products.some(q=>q.id===p.id))products.push(p)
  if(Array.isArray(legacyBoards))for(const board of legacyBoards){
    if(boardProfileError(board))continue
    const b=board as BoardProfile
    if(!products.some(p=>p.id===b.id||p.kind==='board'&&p.name.toLowerCase()===b.name.toLowerCase()))products.push({id:b.id,name:b.name,kind:'board',board:{...b},joistCentres:400,endBearing:10})
  }
  return products
}
export function mergeProductLibraries(current:LibraryProduct[],incoming:LibraryProduct[]):LibraryProduct[]{
  // An imported project must not overwrite a user's existing catalogue entry.
  // Identical records merge; ID/name conflicts become a separately named copy.
  let result=[...current]
  for(const original of incoming){
    if(result.some(p=>sameProduct(p,original)||p.kind===original.kind&&p.name.startsWith(`${original.name.slice(0,135)} (import `)&&sameProduct(p,original,true)))continue
    let p={...original},suffix=1
    const base=p.name
    while(result.some(q=>q.id===p.id||q.kind===p.kind&&q.name.toLowerCase()===p.name.toLowerCase())){
      suffix++;p={...original,id:`${original.id}-import-${suffix}`,name:`${base.slice(0,135)} (import ${suffix})`}
    }
    result=saveProduct(result,p)
  }
  return result
}
export function sameProduct(a:LibraryProduct,b:LibraryProduct,ignoreIdentity=false):boolean{
  const stable=(value:unknown):unknown=>{
    if(!value||typeof value!=='object')return value
    return Object.fromEntries(Object.entries(value).filter(([key,v])=>v!==undefined&&(!ignoreIdentity||key!=='id'&&key!=='name')).sort(([x],[y])=>x.localeCompare(y)).map(([key,v])=>[key,stable(v)]))
  }
  return JSON.stringify(stable(a))===JSON.stringify(stable(b))
}
export function importProductLibrary(value:unknown):LibraryProduct[]{
  if(!value||typeof value!=='object')throw new Error('Choose a BetterPlan products or project JSON file.')
  const data=value as {version?:unknown;products?:unknown}
  if(data.version!==1||!Array.isArray(data.products))throw new Error('Choose a BetterPlan products or project JSON file.')
  if(data.products.length>10000)throw new Error('Import up to 10,000 products at a time.')
  for(const p of data.products){const error=productError(p);if(error)throw new Error(`Product import: ${error}`)}
  return readProductLibrary(data.products)
}

export function productFromSettings(kind:ProductKind,s:Settings,id:string):LibraryProduct{
  if(kind==='board')return {kind,id,name:s.board.name,board:{...s.board,id},joistCentres:s.joistSpacing,endBearing:s.boardEndBearing??10}
  if(kind==='pedestal')return {kind,id,name:s.pedestalName,min:s.pedestalMin,max:s.pedestalMax,diameter:s.pedestalDiameter??150}
  const height=s.frame==='big'||s.frame==='big-small'?80:35
  return {kind,id,name:`${height} mm Alu-Joist (K Series)`,height,stock:s.frameStock,faceWidth:s.frameFaceWidth??35,maxOverhang:height===35?s.joistOverhang35:s.joistOverhang80}
}
export function productMatches(s:Settings,p:LibraryProduct):boolean{
  if(p.kind==='board')return s.board.id===p.id&&['width','thickness','stock','colour','colourName','gap','endGap'].every(key=>s.board[key as keyof BoardProfile]===p.board[key as keyof BoardProfile])&&s.joistSpacing<=p.joistCentres&&(s.boardEndBearing??10)===p.endBearing
  if(p.kind==='pedestal')return s.pedestalName===p.name&&s.pedestalMin===p.min&&s.pedestalMax===p.max&&(s.pedestalDiameter??150)===p.diameter
  const used=p.height===35?s.frame!=='big':s.frame==='big'||s.frame==='big-small'
  return used&&s.frameStock===p.stock&&(s.frameFaceWidth??35)===p.faceWidth&&(p.height===35?s.joistOverhang35:s.joistOverhang80)===p.maxOverhang
}
export function appliedProduct(s:Settings,kind:ProductKind):LibraryProduct|undefined{
  const p=s.products?.[kind]
  return isLibraryProduct(p)&&p.kind===kind&&productMatches(s,p)?p:undefined
}
export function productPriceKey(p:LibraryProduct):string{return p.kind==='board'?'boards':p.kind==='pedestal'?'pedestals':`profile${p.height}`}

export function applyProduct(s:Settings,prices:Record<string,string>,p:LibraryProduct){
  const error=productError(p);if(error)throw new Error(error)
  const snapshot=JSON.parse(JSON.stringify(p)) as LibraryProduct
  let next:Settings={...s,products:{...s.products,[p.kind]:snapshot},supportLayout:undefined,confirmed:false,edgeDetailConfirmed:false}
  if(p.kind==='board')next={...next,board:{...p.board,id:p.id,name:p.name},joistSpacing:p.joistCentres,boardEndBearing:p.endBearing}
  else if(p.kind==='pedestal')next={...next,pedestalSelection:'manual',pedestalName:p.name,pedestalMin:p.min,pedestalMax:p.max,pedestalDiameter:p.diameter}
  else next={...next,frame:p.height===35?'small':'big',frameSelection:'manual',frameStock:p.stock,frameFaceWidth:p.faceWidth,...(p.height===35?{joistOverhang35:p.maxOverhang}:{joistOverhang80:p.maxOverhang})}
  // Product selection starts with that product's rate. Subsequent quote edits
  // still take precedence, and selecting another product clears only its row.
  return {settings:next,prices:Object.fromEntries(Object.entries(prices).filter(([key])=>key!==productPriceKey(p)))}
}
export function productSummary(p:LibraryProduct):string{
  if(p.kind==='board')return `${p.board.width} × ${p.board.thickness} mm · ${p.board.stock} m · ${p.board.colourName}`
  if(p.kind==='pedestal')return `${p.min}–${p.max} mm adjustment · Ø ${p.diameter} mm base`
  return `${p.height} mm K Series · ${p.stock} m stock · ${p.faceWidth} mm bearing face`
}
