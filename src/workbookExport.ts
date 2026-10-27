import ExcelJS from 'exceljs'
import { buildCsvReport, CSV_REPORTS } from './csvExport.ts'
import type { CsvKind } from './csvExport.ts'
import { materialEstimate } from './materialEstimate.ts'
import type { Plan, Settings } from './planner.ts'

const C={green:'FF626C2C',ink:'FF303728',muted:'FF72765F',pale:'FFF5F7E9',line:'FFE0E4CF',amber:'FFFFF2D4',red:'FFFCE8DD',white:'FFFFFFFF',blue:'FF245A96'}
const rateMoney='"€"#,##0.00##;[Red]("€"#,##0.00##);"€"0.00'
const money='"€"#,##0.00;[Red]("€"#,##0.00);"€"0.00'
const fill=(argb:string):ExcelJS.Fill=>({type:'pattern',pattern:'solid',fgColor:{argb}})
const font:Partial<ExcelJS.Font>={name:'Arial',size:10,color:{argb:C.ink}}
const headerRow=8,firstRow=9

function setup(wb:ExcelJS.Workbook,name:string,title:string,description:string,widths:number[],plan:Plan,s:Settings,date:string,previewImage?:number){
  const ws=wb.addWorksheet(name,{properties:{tabColor:{argb:name==='Quote'?C.green:'FFB5C344'}},views:[{showGridLines:false,state:'frozen',ySplit:headerRow,xSplit:name==='Quote'?0:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.15,footer:.15}}})
  widths.forEach((width,i)=>ws.getColumn(i+1).width=width)
  ws.getCell('A2').value='BetterDeck';ws.getCell('A2').font={...font,bold:true,color:{argb:C.green}}
  ws.getCell(2,widths.length).value=date;ws.getCell(2,widths.length).alignment={horizontal:'right'};ws.getCell(2,widths.length).font={...font,color:{argb:C.muted}}
  ws.getCell('A3').value=title;ws.getCell('A3').font={...font,size:16};ws.getRow(3).height=28
  const textColumns=previewImage===undefined?widths.length:name==='Quote'?3:6
  ws.mergeCells(4,1,4,textColumns);ws.getCell('A4').value=description;ws.getCell('A4').font={...font,color:{argb:C.muted}};ws.getCell('A4').alignment={wrapText:true,vertical:'middle'};ws.getRow(4).height=previewImage===undefined?30:42
  ws.mergeCells(6,1,6,textColumns);ws.getCell('A6').value=`${plan.area.toFixed(2)} m² deck. ${s.board.colourName}. ${s.board.stock} m stock boards. Dimensions in mm; prices in EUR.`;ws.getCell('A6').font={...font,color:{argb:C.muted}};ws.getCell('A6').alignment={wrapText:true,vertical:'middle'};ws.getRow(6).height=previewImage===undefined?24:30
  if(previewImage!==undefined)ws.addImage(previewImage,{tl:{col:textColumns+.1,row:2},ext:{width:270,height:150}})
  ws.pageSetup.printTitlesRow='1:8'
  ws.headerFooter.oddFooter='&LBetterDeck&CProvisional deck estimate&RPage &P of &N'
  return ws
}

function tableHeader(ws:ExcelJS.Worksheet,headers:string[]){
  headers.forEach((text,i)=>{const cell=ws.getCell(headerRow,i+1);cell.value=text;cell.fill=fill(C.green);cell.font={...font,bold:true,color:{argb:C.white}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border={right:{style:'thin',color:{argb:C.white}}}})
  ws.getRow(headerRow).height=34
}

function bodyStyle(ws:ExcelJS.Worksheet,row:number,count:number){
  for(let c=1;c<=count;c++){const cell=ws.getCell(row,c);cell.font={...font};cell.fill=fill((row-firstRow)%2?C.pale:C.white);cell.alignment={vertical:'middle',horizontal:typeof cell.value==='number'?'right':'left',wrapText:true};cell.border={bottom:{style:'hair',color:{argb:C.line}}};cell.numFmt=typeof cell.value==='number'&&!Number.isInteger(cell.value)?'#,##0.0#':'#,##0'}
  ws.getRow(row).height=31
}

function note(ws:ExcelJS.Worksheet,row:number,text:string,count:number,warning=false){
  ws.mergeCells(row,1,row,count);const cell=ws.getCell(row,1);cell.value=text;cell.font={...font,color:{argb:warning?'FF98623D':C.muted}};cell.alignment={vertical:'middle',wrapText:true};if(warning)cell.fill=fill(C.amber)
  const characters=ws.columns.slice(0,count).reduce((n,c)=>n+(c.width??15),0)*.9
  ws.getRow(row).height=Math.max(28,Math.ceil(text.length/characters)*15+10)
}

export function createDeckWorkbook(plan:Plan,s:Settings,prices:Record<string,string>,now=new Date(),previewPng?:string){
  const wb=new ExcelJS.Workbook();wb.creator='BetterDeck';wb.created=now;wb.modified=now;wb.calcProperties.fullCalcOnLoad=true
  const date=new Intl.DateTimeFormat('en-IE',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Dublin'}).format(now)
  const estimate=materialEstimate(plan,prices),end=firstRow+estimate.lines.length-1
  const previewImage=previewPng?wb.addImage({base64:previewPng,extension:'png'}):undefined
  const quote=setup(wb,'Quote','Materials quote','Rates are editable on the Materials tab. This quote updates from those rates.',[44,11,13,18,18,28],plan,s,date,previewImage)
  const materials=setup(wb,'Materials','Material take-off','Enter unit rates in the blue cells. Amber cells need a price; pending quantities remain blank.',[36,9,10,12,10,13,14,14,25],plan,s,date,previewImage)
  tableHeader(quote,['Component','Quantity','Unit','Unit rate EUR','Amount EUR','Status'])
  tableHeader(materials,['Component','Quantity','Unit','Stock length mm','Width mm','Profile / thickness mm','Unit rate EUR','Amount EUR','Status'])
  const materialRows=buildCsvReport('materials',plan,s,prices).rows
  estimate.lines.forEach((line,i)=>{
    const r=firstRow+i,raw=materialRows[i]
    materials.getRow(r).values=[line.name,line.pending?null:line.qty,line.unit,raw[5],raw[6],raw[7],line.rate,{formula:`IF(AND(ISNUMBER(B${r}),ISNUMBER(G${r})),ROUND(B${r}*G${r},2),"")`,result:line.cents===null?'':line.cents/100},{formula:`IF(NOT(ISNUMBER(B${r})),"Quantity pending",IF(NOT(ISNUMBER(G${r})),"Price missing","Priced; provisional"))`,result:line.pending?'Quantity pending':line.rate===null?'Price missing':'Priced; provisional'}]
    bodyStyle(materials,r,9)
    materials.getCell(r,7).font={...font,color:{argb:C.blue}};materials.getCell(r,7).numFmt=rateMoney;materials.getCell(r,8).numFmt=money;materials.getCell(r,8).alignment={horizontal:'right',vertical:'middle'}
    materials.getCell(r,7).dataValidation={type:'decimal',operator:'greaterThanOrEqual',formulae:[0],allowBlank:true,showErrorMessage:true,errorTitle:'Enter a unit rate',error:'Use zero or a positive number.'}
    quote.getRow(r).values=[line.name,{formula:`IF(ISNUMBER(Materials!B${r}),Materials!B${r},"")`,result:line.pending?'':line.qty},line.unit,{formula:`IF(ISNUMBER(Materials!G${r}),Materials!G${r},"")`,result:line.rate??''},{formula:`IF(ISNUMBER(Materials!H${r}),Materials!H${r},"")`,result:line.cents===null?'':line.cents/100},{formula:`Materials!I${r}`,result:line.pending?'Quantity pending':line.rate===null?'Price missing':'Priced; provisional'}]
    bodyStyle(quote,r,6);quote.getCell(r,4).numFmt=rateMoney;quote.getCell(r,5).numFmt=money
    for(const col of [2,4,5])quote.getCell(r,col).alignment={horizontal:'right',vertical:'middle'}
  })
  for(const [ws,amount,status] of [[materials,'H','I'],[quote,'E','F']] as const){
    ws.autoFilter={from:{row:headerRow,column:1},to:{row:end,column:ws===quote?6:9}}
    const r=end+2,count=ws===quote?6:9
    ws.getCell(r,1).value={formula:`IF(COUNT(${amount}${firstRow}:${amount}${end})=${estimate.lines.length},"Entered materials total","Known priced subtotal")`,result:estimate.complete?'Entered materials total':'Known priced subtotal'}
    ws.getCell(r,ws===quote?5:8).value={formula:`IF(COUNT(${amount}${firstRow}:${amount}${end})=0,"",SUM(${amount}${firstRow}:${amount}${end}))`,result:estimate.lines.some(q=>q.cents!==null)?estimate.subtotalCents/100:''}
    for(let c=1;c<=count;c++){const cell=ws.getCell(r,c);cell.fill=fill(C.green);cell.font={...font,bold:true,color:{argb:C.white}};cell.alignment={vertical:'middle',horizontal:c===(ws===quote?5:8)?'right':'left'};cell.numFmt=money}
    ws.getRow(r).height=36
    ws.addConditionalFormatting({ref:`${status}${firstRow}:${status}${end}`,rules:[{type:'containsText',operator:'containsText',text:'pending',priority:1,style:{fill:fill(C.red)}},{type:'containsText',operator:'containsText',text:'missing',priority:2,style:{fill:fill(C.amber)}}]})
    note(ws,r+2,'Materials only. Excludes labour, delivery, VAT, unlisted hardware and spare allowances.',count)
    note(ws,r+3,plan.frame.geometryPass?`Provisional quantities. Applied fascia recess ${Math.round(plan.frame.fasciaClearance*1000)} mm; maximum metal end projection ${Math.round(Math.max(0,...plan.frame.projections.map(q=>q.distance))*1000)} mm. Supplier overhang limits, product compatibility, site conditions and connections require confirmation.`:'Support geometry is unresolved. Frame and pedestal quantities and the complete material total are unavailable.',count,!plan.frame.geometryPass)
    let noteRow=r+5
    for(const line of estimate.lines)note(ws,noteRow++,`${line.name}: ${line.note}`,count)
    ws.pageSetup.printArea=`A1:${ws.getColumn(count).letter}${noteRow}`
  }
  materials.addConditionalFormatting({ref:`G${firstRow}:G${end}`,rules:[{type:'expression',formulae:[`NOT(ISNUMBER(G${firstRow}))`],priority:1,style:{fill:fill(C.amber)}}]})
  const names:Partial<Record<CsvKind,string>>={boards:'Board cuts',frame:'Alu-Joist cuts',skirting:'Fascia cuts',pedestals:'Pedestals',project:'Project details'}
  for(const kind of ['boards','frame','skirting','pedestals','project'] as const){
    const report=buildCsvReport(kind,plan,s,prices),definition=CSV_REPORTS.find(q=>q.id===kind)!
    if(report.unavailable)continue
    const widths=report.headers.map(h=>h==='Notes'||h.includes('outline')?64:h==='Detail'||h==='Value'||h==='Product'?40:h==='Status'?32:h.includes('ID')?18:h==='Category'||h.includes('type')||h==='Colour'?22:17)
    const ws=setup(wb,names[kind]!,definition.label,definition.description,widths,plan,s,date)
    tableHeader(ws,report.headers)
    for(const [i,row] of report.rows.entries()){
      const r=firstRow+i;ws.getRow(r).values=row.map(value=>value===''?null:value);bodyStyle(ws,r,report.headers.length)
      // Coordinate lists and report notes need room to wrap rather than clip.
      const lines=Math.max(1,...row.map((cell,c)=>typeof cell==='string'?Math.ceil(cell.length/(widths[c]*.9)):1))
      ws.getRow(r).height=Math.max(31,lines*14+8)
    }
    ws.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow+report.rows.length,column:report.headers.length}}
    ws.pageSetup.printArea=`A1:${ws.getColumn(report.headers.length).letter}${headerRow+report.rows.length}`
    if(widths.reduce((n,w)=>n+w,0)>160){ws.pageSetup.fitToPage=false;ws.pageSetup.scale=100;ws.pageSetup.printTitlesColumn='A:A'}

  }
  return wb
}

export async function exportDeckWorkbook(plan:Plan,s:Settings,prices:Record<string,string>,previewPng?:string){
  const wb=createDeckWorkbook(plan,s,prices,new Date(),previewPng)
  const data=await wb.xlsx.writeBuffer()
  return new Uint8Array(data).buffer
}
