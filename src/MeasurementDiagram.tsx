import { useId } from 'react'

export default function MeasurementDiagram({label}:{label:string}){
  const id=useId().replaceAll(':',''),name=label.toLowerCase()
  const kind=/angle|outgoing bearing|next edge bearing/.test(name)?'angle':/variation/.test(name)?'variation':/diameter|edge clearance/.test(name)?'base':/fascia board height/.test(name)?'fascia':/build-up|adjustment/.test(name)?'height':/bearing|top-face|recess/.test(name)?'bearing':/centres/.test(name)?'centres':/thickness/.test(name)?'thickness':/width|depth|length|gap|kerf|position|coordinate/.test(name)?'plan':null
  if(!kind)return null
  const arrow=`url(#${id})`,vertical=/depth|thickness/.test(name),gap=/gap|kerf/.test(name)
  return <svg className="measurement-diagram" viewBox="0 0 260 145" role="img" aria-label={`${label}: illustrated measurement`}>
    <defs><marker id={id} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="#66782d"/></marker></defs>
    <rect x="1" y="1" width="258" height="143" rx="10" fill="#f5f7ee"/>
    {kind==='fascia'?<>
      <rect x="38" y="26" width="144" height="14" fill="#ba905c"/><rect x="100" y="41" width="68" height="25" fill="#bbc3c7"/><rect x="168" y="40" width="14" height="74" fill="#a88050"/>
      <path d="M207 40V114" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="108" y="135">Height of the vertical fascia board</text>
    </>:kind==='angle'?<>
      <path d="M54 110H220M54 110L185 30" stroke="#9aab8c" strokeWidth="5" fill="none"/><path d="M101 110A47 47 0 0 0 94 86" stroke="#66782d" strokeWidth="2" markerEnd={arrow} fill="none"/><text x="138" y="105">Angle from the edge</text>
    </>:kind==='height'||kind==='variation'?<>
      <path d="M28 111H226" stroke="#94a083" strokeWidth="2"/>
      <rect x="44" y="26" width="174" height="13" fill="#ba905c"/>
      <rect x="59" y="40" width="20" height="25" fill="#bbc3c7"/>
      <rect x="176" y="40" width="20" height="25" fill="#bbc3c7"/>
      <path d="M69 67V103M186 67V103" stroke="#53684b" strokeWidth="7"/>
      <path d="M53 106H85M170 106H202" stroke="#53684b" strokeWidth="5"/>
      {kind==='variation'?<><path d="M28 104Q66 82 122 111T226 118" fill="none" stroke="#b59c78" strokeWidth="3"/><path d="M235 88V123" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="214" y="81">± rise / fall</text></>:<><path d={`M31 ${/adjustment/.test(name)?66:26}V107`} stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="105" y="130">{/adjustment/.test(name)?'Pedestal height':'Ground to finished deck'}</text></>}
      <text x="129" y="23">Deck boards</text><text x="112" y="57">Frame</text><text x="113" y="87">Pedestal</text>
    </>:kind==='base'?<>
      <path d="M28 20V125" stroke="#93a07d" strokeWidth="2" strokeDasharray="4 3"/>
      <circle cx="145" cy="72" r="43" fill="#dbe3d0" stroke="#657954"/><circle cx="145" cy="72" r="13" fill="#637753"/>
      {/clearance/.test(name)?<><path d="M28 72H102" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="58" y="61">Clear gap</text><text x="30" y="137">Deck edge</text></>:<><path d="M102 72H188" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="145" y="132">Full base diameter</text></>}
    </>:kind==='bearing'?<>
      <rect x="45" y="35" width={/bearing/.test(name)?72:112} height="15" fill="#ba905c"/><rect x="91" y="51" width="52" height="58" fill="#c2cbd0"/>
      {/recess/.test(name)?<><path d="M157 24V113" stroke="#859575" strokeDasharray="4 3"/><rect x="143" y="50" width="14" height="59" fill="#a88050"/><path d="M143 121H157" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="181" y="130">Recess</text></>:<><path d={`M91 22H${/top-face/.test(name)?143:117}`} stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="124" y="133">{/top-face/.test(name)?'Top supporting face':'Board end on supporting face'}</text></>}
      <text x="210" y="46">Board</text><text x="207" y="87">Joist</text>
    </>:kind==='centres'?<>
      {[53,130,207].map(x=><g key={x}><rect x={x-8} y="34" width="16" height="77" fill="#bac5c8"/><path d={`M${x} 23V122`} stroke="#72856a" strokeDasharray="3 3"/></g>)}
      <path d="M53 20H130" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="130" y="137">Centre to centre</text>
    </>:kind==='thickness'?<>
      <rect x="48" y="54" width="159" height="26" fill="#ba905c"/><path d="M226 54V80" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="129" y="111">Vertical board thickness</text>
    </>:gap&&/end-to-end|kerf/.test(name)?<>
      <rect x="40" y="46" width="77" height="44" fill="#bc9461"/><rect x="130" y="46" width="85" height="44" fill="#bc9461"/>
      <path d="M117 107H130" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="130" y="132">{/kerf/.test(name)?'Material removed by the saw':'Gap between the board ends'}</text>
    </>:<>
      <rect x="50" y="36" width="151" height="29" fill="#bc9461"/><rect x="50" y="78" width="151" height="29" fill="#bc9461"/>
      {gap?<><path d="M218 65V78" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="129" y="130">Clear space between pieces</text></>:name==='board width'?<><path d="M32 36V65" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="130" y="130">Width across one board</text></>:vertical?<><path d="M32 36V107" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="130" y="130">Depth in plan</text></>:<><path d="M50 21H201" stroke="#66782d" markerStart={arrow} markerEnd={arrow}/><text x="130" y="130">{/width/.test(name)?'Width across the outline':'Length or position along the run'}</text></>}
    </>}
  </svg>
}
