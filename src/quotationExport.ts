import { customerPlanSvg } from './customerPlan'
import { deckPreviewPng, deckPreviewSvg } from './deckPreview'
import { QUOTATION_VIEWS } from './quotationDetails'
import { quotationSections } from './quotationSections'
import type { Plan, Settings } from './planner'

export async function createQuotationDownload(plan:Plan,settings:Settings,prices:Record<string,string>){
  const angle=(QUOTATION_VIEWS.find(v=>v.value===settings.quotation?.view)??QUOTATION_VIEWS[0]).angle
  const png=async(svg:string,width=1800,height=1000)=>new Uint8Array(await (await fetch(await deckPreviewPng(svg,width,height))).arrayBuffer())
  const [{exportCustomerQuotePack},{loadBetterDeckLogo},sectionPreviews]=await Promise.all([
    import('./customerQuotePack'),import('./pdfBrand'),
    Promise.all(quotationSections(plan,settings,prices).map(async section=>{
      const [preview,planPreview]=await Promise.all([png(deckPreviewSvg(section.plan,section.settings,angle)),png(customerPlanSvg(section.plan,section.settings),1800,1250)])
      return {id:section.id,preview,planPreview}
    })),
  ])
  return exportCustomerQuotePack(plan,settings,prices,{logo:await loadBetterDeckLogo(),preview:sectionPreviews[0].preview,planPreview:sectionPreviews[0].planPreview,sectionPreviews})
}
