import qrcode from 'qrcode-generator'
import type { QuotationDetails } from './quotationDetails.ts'
import { installationLink } from './quotationDetails.ts'
import type { QuotationEstimate } from './quotationEstimate.ts'
import { QUOTATION_EXCLUSIONS } from './quotationEstimate.ts'
import { QUOTE_COLOURS as c } from './quotationDocument.ts'
import type { quotationDocument } from './quotationDocument.ts'

export function quotationNotes(p:Awaited<ReturnType<typeof quotationDocument>>,q:QuotationDetails,estimate:QuotationEstimate,reference:string){
  if(q.scope?.trim()){p.heading('Project scope');p.paragraph(q.scope)}
  if(q.inclusions?.trim()){p.heading('Included');p.paragraph(q.inclusions)}
  if(q.exclusions?.trim()){p.heading('Excluded');p.paragraph(q.exclusions)}
  p.paragraph(QUOTATION_EXCLUSIONS,2.4,false,c.muted)
  for(const section of estimate.sections)if(section.settings.joistSpacing>400)p.paragraph(`${section.name}: entered joist centres ${section.settings.joistSpacing} mm exceed the report's 400 mm limit. Board supplier approval required.`,2.6)
  if(q.terms?.trim()){p.heading('Payment & quotation terms');p.paragraph(q.terms)}
  if(q.notes?.trim()){p.heading('Quotation notes');p.paragraph(q.notes,2.8)}
  p.heading('Let’s bring it to life.')
  p.paragraph(q.acceptance?.trim()||`To accept or request changes, contact BetterDeck at info@betterdeck.ie or +353 49 437-2667, quoting ${reference}. Confirm quantities with your installer before placing an order.`,2.8)
  const url=installationLink(q.installationUrl)
  if(url){
    const qr=qrcode(0,'M');qr.addData(url);qr.make();const count=qr.getModuleCount(),quiet=4,size=30,module=size/(count+quiet*2)
    p.ensure(40);p.y+=3;p.rect(16,p.y,size,size,c.white)
    for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))p.rect(16+(col+quiet)*module,p.y+(row+quiet)*module,module,module,c.ink)
    p.link('Open installation guide',url,52,p.y+10,110,10)
    p.text('Scan the QR code or click the link.',52,p.y+17,2.6,false,c.muted);p.y+=36
  }
}
