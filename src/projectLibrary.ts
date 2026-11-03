import { DEFAULT_SETTINGS, validateSettings } from './planner.ts'
import type { Settings } from './planner.ts'
import { importProductLibrary, readProductLibrary } from './productLibrary.ts'
import type { LibraryProduct } from './productLibrary.ts'
import { PRICE_VERSION, resolvedPricing } from './pricing.ts'

export type ProjectStage='shape'|'boards'|'frame'|'finish'|'materials'
export type ProjectSnapshot={settings:Settings;prices:Record<string,string>;stage:ProjectStage}
export type SavedProject=ProjectSnapshot&{id:string;name:string;sectionId:string;createdAt:number;updatedAt:number;lastOpenedAt:number}
export type ProjectSection={id:string;name:string}
export type ProjectWorkspace={version:1;activeId:string;projects:SavedProject[];sections:ProjectSection[]}
export const DEFAULT_SECTIONS:ProjectSection[]=[{id:'residential',name:'Residential'},{id:'commercial',name:'Commercial'}]
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))
const validSettings=(value:unknown)=>{try{return !validateSettings(value as Settings)}catch{return false}}
const validPrices=(value:unknown):value is Record<string,string>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(v=>typeof v==='string'&&(v===''||Number.isFinite(Number(v))&&Number(v)>=0))
export function projectName(value:string){return value.trim().slice(0,120)||'Untitled project'}
export function makeProject(name:string,sectionId:string,snapshot:ProjectSnapshot={settings:DEFAULT_SETTINGS,prices:{},stage:'shape'},id:string=crypto.randomUUID(),now=Date.now()):SavedProject{
  return {...clone(snapshot),id,name:projectName(name),sectionId,createdAt:now,updatedAt:now,lastOpenedAt:now}
}
export function initialWorkspace(settings:Settings,prices:Record<string,string>,previous?:{settings:Settings;prices:Record<string,string>}|null):ProjectWorkspace{
  const current=makeProject(settings.quotation?.projectReference||'Untitled project','residential',{settings,prices:validPrices(prices)?prices:{},stage:'shape'})
  const projects=[current]
  if(previous&&validSettings(previous.settings)&&validPrices(previous.prices)&&JSON.stringify([previous.settings,previous.prices])!==JSON.stringify([settings,prices]))projects.push(makeProject('Previous deck','residential',{...previous,stage:'shape'}))
  return {version:1,activeId:current.id,projects,sections:clone(DEFAULT_SECTIONS)}
}
export function readProjectWorkspace(value:unknown):ProjectWorkspace{
  const w=value as ProjectWorkspace
  if(!w||w.version!==1||!Array.isArray(w.projects)||!Array.isArray(w.sections)||!w.projects.length)throw new Error('The saved project library could not be read. Your stored data has not been replaced.')
  const ids=new Set<string>(),sections=new Set<string>()
  for(const s of w.sections){if(!s||typeof s.id!=='string'||typeof s.name!=='string'||!s.name.trim()||s.name.length>120||sections.has(s.id))throw new Error('Invalid saved project sections.');sections.add(s.id)}
  for(const p of w.projects){if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||!sections.has(p.sectionId)||!['shape','boards','frame','finish','materials'].includes(p.stage)||!validSettings(p.settings)||!validPrices(p.prices)||![p.createdAt,p.updatedAt,p.lastOpenedAt].every(Number.isFinite))throw new Error('A saved project could not be read. Your stored data has not been replaced.');ids.add(p.id)}
  if(!ids.has(w.activeId))throw new Error('The current saved project could not be found.')
  return w
}
export function saveActiveProject(workspace:ProjectWorkspace,snapshot:ProjectSnapshot,now=Date.now()):ProjectWorkspace{
  if(!validSettings(snapshot.settings)||!validPrices(snapshot.prices))return workspace
  const current=workspace.projects.find(p=>p.id===workspace.activeId)
  if(!current||JSON.stringify([current.settings,current.prices,current.stage])===JSON.stringify([snapshot.settings,snapshot.prices,snapshot.stage]))return workspace
  return {...workspace,projects:workspace.projects.map(p=>p.id===workspace.activeId?{...p,...clone(snapshot),updatedAt:now}:p)}
}
export function projectFile(project:SavedProject,sections:ProjectSection[],products:LibraryProduct[]){
  return {version:1,project:{name:project.name,section:sections.find(s=>s.id===project.sectionId)?.name??'Residential'},settings:project.settings,products,profiles:products.flatMap(p=>p.kind==='board'?[p.board]:[]),prices:resolvedPricing(project.settings,project.prices),priceOverrides:project.prices,pricingVersion:PRICE_VERSION}
}
export function parseProjectFile(value:unknown,fallbackName='Imported project'){
  if(!value||typeof value!=='object')throw new Error('Choose a BetterPlan project JSON file.')
  const data=value as {version?:unknown;settings:Settings;products?:unknown;profiles?:unknown;prices?:unknown;priceOverrides?:unknown;pricingVersion?:unknown;project?:{name?:unknown;section?:unknown}}
  if(data.version!==1)throw new Error('Unsupported project version.')
  if(!validSettings(data.settings))throw new Error('Invalid project settings.')
  const products=data.products!==undefined?importProductLibrary(data):readProductLibrary([],data.profiles)
  const source=data.pricingVersion===PRICE_VERSION&&data.priceOverrides!==undefined?data.priceOverrides:data.prices,prices:Record<string,string>={}
  if(source!==undefined){if(!validPrices(source))throw new Error('Invalid project prices.');Object.assign(prices,source)}
  return {settings:clone(data.settings),prices,products,name:projectName(typeof data.project?.name==='string'?data.project.name:fallbackName),section:typeof data.project?.section==='string'?projectName(data.project.section):'Residential'}
}
export function visibleProjects(projects:SavedProject[],filter:string,search:string){
  const query=search.trim().toLocaleLowerCase()
  const filtered=projects.filter(p=>(filter==='all'||filter==='recent'||p.sectionId===filter)&&`${p.name} ${p.settings.quotation?.customerName??''} ${p.settings.quotation?.projectReference??''}`.toLocaleLowerCase().includes(query))
  return filtered.sort((a,b)=>(filter==='recent'?b.lastOpenedAt-a.lastOpenedAt:b.updatedAt-a.updatedAt)||a.name.localeCompare(b.name)).slice(0,filter==='recent'?12:undefined)
}
