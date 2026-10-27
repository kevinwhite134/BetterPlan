import { frameRule } from './planner.ts'
import type { Settings } from './planner.ts'
import { PEDESTAL_MODELS } from './productNames.ts'
import { appliedProduct, PRODUCT_KINDS, productPriceKey } from './productLibrary.ts'
import { HARDWARE_RATES } from './frameHardware.ts'

export const PRICE_CHECKED='25 October 2026'
export const PRICE_VERSION='2026-10-25'
export type PriceBasis={key:string;name:string;note:string;source:string}
const pedestalShop='https://www.budget-bestrating.nl/verstelbare-tegeldrager-'
const pedestalPrice=(gross:number,path:string)=>({net:gross/1.21,source:pedestalShop+path,note:'Listed euro price with 21% Dutch VAT removed.'})
// Net EUR per pedestal. F5 and T34/T44 are allowances based on the family;
// they are not published BetterDeck selling prices. Extenders/adaptors excluded.
const PEDESTAL_PRICES:Record<string,{net:number;source:string;note:string}>={
  'VersiJack F1 Pedestal':pedestalPrice(4.82,'37-50mm-versijack-f1'),
  'VersiJack F2 Pedestal':pedestalPrice(5.55,'50-75mm-versijack-f2'),
  'VersiJack F3 Pedestal':pedestalPrice(7.35,'74-117mm-versijack-f3'),
  'VersiJack F4 Pedestal':pedestalPrice(13.56,'117-201mm-versijack-f4'),
  'VersiJack F5 Pedestal':{net:15,source:pedestalShop+'117-201mm-versijack-f4',note:'Family allowance above the published F4 rate.'},
  'SpiraPave T11 Pedestal':{net:3,source:'https://www.plusjop.nl/product/spirapave-t11-12-17mm/',note:'€3.63 retail benchmark with 21% Dutch VAT removed.'},
  'SpiraPave T12 Pedestal':pedestalPrice(3.10,'18-23mm-spirapave-t12'),
  'SpiraPave T22 Pedestal':pedestalPrice(3.92,'24-29mm-spirapave-t22'),
  'SpiraPave T33 Pedestal':pedestalPrice(4.57,'30-44mm-spirapave-t33'),
  'SpiraPave T34 Pedestal':{net:4.75,source:pedestalShop+'30-44mm-spirapave-t33',note:'Family allowance above the published T33 rate.'},
  'SpiraPave T44 Pedestal':{net:5.75,source:pedestalShop+'30-44mm-spirapave-t33',note:'Family allowance above the published T33 rate.'},
}
const money=(value:number)=>value.toFixed(2)

export function defaultPricing(s:Settings){
  const model=PEDESTAL_MODELS.find(p=>p.name===s.pedestalName&&p.min===s.pedestalMin&&p.max===s.pedestalMax&&p.diameter===(s.pedestalDiameter??150))
  const rule=frameRule(s.frame,s.load),required=s.height-s.board.thickness-rule.joist-rule.bearer+s.variation
  const band=PEDESTAL_MODELS.filter(p=>p.max>=required).sort((a,b)=>a.max-b.max)[0]
  const pedestal=PEDESTAL_PRICES[model?.name??band?.name??'VersiJack F5 Pedestal']
  const extra=required>281?Math.ceil((required-281)/245)*10:0
  // Comparable capped composite boards/fascia, scaled by purchased stock area.
  // No gaps are included in the priced material area and thickness is not scaled.
  const rates:Record<string,string>={
    ...HARDWARE_RATES,
    boards:money(48.74/(4.88*.140)*s.board.stock*s.board.width/1000),
    profile35:money(34.72/1.23/3*s.frameStock),
    profile80:money(34.72/1.23/3*1.2*s.frameStock),
    pedestals:money(pedestal.net+extra),
    skirting:money(65/(3.66*.184)*s.board.stock*(s.skirtingHeight??200)/1000),
    clips:money(15.04/25),
  }
  const basis:PriceBasis[]=[
    {key:'continuousJoiners',name:'Continuous joiner',note:'User-supplied rate: EUR 1.68 each; one per aluminium butt joint.',source:''},
    {key:'joistJoiners',name:'Joist joiner',note:'User-supplied rate: EUR 1.20 each; two per butt joint, including bearer joints.',source:''},
    {key:'perpendicularJoiners',name:'Perpendicular joist joiner',note:'User-supplied rate: EUR 1.20 per perpendicular end connection.',source:''},
    {key:'boards',name:'Decking boards',note:'Comparable capped composite: €48.74 excluding VAT for 4.88 m × 140 mm. Scaled to the entered stock length and width.',source:'https://tjomahony.ie/trex-enhance-naturals-comp-deck-foggy-wharf-140x25mmx4-88m-square-edge-04fw010616e2s56.html'},
    {key:'profile35',name:'35 mm Alu-Joist',note:'Irish aluminium joist benchmark: €34.72 including VAT per 3 m. VAT removed at 23%; scaled by stock length. Benchmark profile is 30 mm high, not a quoted Alu-Joist K Series price.',source:'https://doublel.ie/products/aluminium-joist'},
    {key:'profile80',name:'80 mm Alu-Joist',note:'35 mm benchmark × 1.2, using the published £30 / £36 price relationship between comparable 40 mm / 80 mm profiles. No currency conversion is applied.',source:'https://www.cetadecking.co.uk/product-page/aluminium-joist-aj80'},
    {key:'pedestals',name:model?.name??'Custom pedestal',note:`${model?pedestal.note:'Height-band allowance using the published VersiJack / SpiraPave family rates.'}${extra?' Includes €10 per additional 245 mm height band.':''} Heads, adaptors and shipping are excluded.`,source:pedestal.source},
    {key:'skirting',name:'Fascia boards',note:'Comparable capped fascia: €65 excluding VAT for 3.66 m × 184 mm. Scaled to the entered fascia height and stock length.',source:'https://tjomahony.ie/trex-enhance-naturals-comp-deck-toasted-sand-184x22mmx3-66m-fascia-04ts010812e2s60.html'},
    {key:'clips',name:'Decking fixings',note:'€15.04 excluding VAT for 25 starter/end clips and screws, rounded to €0.60 per fixing position. Clip compatibility and pack purchasing require the product fixing schedule.',source:'https://www.chadwicks.ie/composite-deck-end-clip-comes-with-screw-25-bag-10543.html'},
  ]
  for(const {value} of PRODUCT_KINDS){
    const product=appliedProduct(s,value)
    if(!product||product.unitPrice===undefined)continue
    const key=productPriceKey(product)
    rates[key]=money(product.unitPrice)
    const i=basis.findIndex(b=>b.key===key)
    const saved={key,name:product.name,note:`Saved product price, EUR excluding VAT per ${product.kind==='board'?'stock board':product.kind==='pedestal'?'pedestal':'stock length'}.${product.supplier?` Supplier: ${product.supplier}.`:''}${product.sku?` Product code: ${product.sku}.`:''}`,source:''}
    if(i>=0)basis[i]=saved;else basis.push(saved)
  }
  return {rates,basis}
}

// An explicit zero or blank is intentional. Only absent rates use defaults.
export function resolvedPricing(s:Settings,overrides:Record<string,string>){
  return {...defaultPricing(s).rates,...overrides}
}
