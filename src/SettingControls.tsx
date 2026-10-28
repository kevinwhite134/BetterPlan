import MeasurementDiagram from './MeasurementDiagram'
import { cloneElement, useId, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { SETTING_HELP } from './settingHelp'
import type { SettingHelp } from './settingHelp'

export type ControlLabelProps={id?:string;'aria-label'?:string;'aria-describedby'?:string}

export function SettingHeading({label,unit,controlId,help}:{label:string;unit?:string;controlId?:string;help?:SettingHelp}){
  const [open,setOpen]=useState(false),id=useId(),content=help??SETTING_HELP[label]
  return <><div className="setting-heading" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>{controlId?<label htmlFor={controlId}>{label}</label>:<span>{label}</span>}{content?<button type="button" className="setting-info-button" aria-label={`Information about ${label}`} aria-expanded={open} aria-controls={`${id}-help`} onClick={()=>setOpen(v=>!v)}>i</button>:null}{unit?<em>{unit}</em>:null}</div>{content?<div hidden={!open} className="setting-help" id={`${id}-help`} role="note" aria-label={`${label} information`}>{open?<MeasurementDiagram label={label}/>:null}<p>{content.description}</p><p><strong>Affects:</strong> {content.affects}</p></div>:null}</>
}

export function Field({label,unit,children,hint,help,className=''}:{label:string;unit?:string;children:ReactElement;hint?:string;help?:SettingHelp;className?:string}){
  const id=useId(),child=children as ReactElement<ControlLabelProps>,controlId=child.props.id??`${id}-control`
  const describedBy=[child.props['aria-describedby'],hint?`${id}-hint`:undefined].filter(Boolean).join(' ')||undefined
  return <div className={`field ${className}`}><SettingHeading label={label} unit={unit} controlId={controlId} help={help}/>{cloneElement(child,{id:controlId,'aria-label':child.props['aria-label']??label,'aria-describedby':describedBy})}{hint?<small id={`${id}-hint`}>{hint}</small>:null}</div>
}

type ChoiceValue=string|number|boolean
type ChoiceOption<T>={value:T;label:ReactNode;ariaLabel?:string}
export function ChoiceButtons<T extends ChoiceValue>({label,value,options,onChange,disabled=false,allowReselect=false}:{label:string;value:T;options:ChoiceOption<T>[];onChange:(value:T)=>void;disabled?:boolean;allowReselect?:boolean}){
  return <div className="segmented choice-control" role="group" aria-label={label}>{options.map(option=><button type="button" key={String(option.value)} className={value===option.value?'selected':''} aria-pressed={value===option.value} aria-label={option.ariaLabel} disabled={disabled} onClick={()=>{if(allowReselect||value!==option.value)onChange(option.value)}}>{option.label}</button>)}</div>
}

export function ChoiceField<T extends ChoiceValue>({label,ariaLabel,value,options,onChange,disabled,help,compact=false,allowReselect=false}:{label:string;ariaLabel?:string;value:T;options:ChoiceOption<T>[];onChange:(value:T)=>void;disabled?:boolean;help?:SettingHelp;compact?:boolean;allowReselect?:boolean}){
  return <div className={`field choice-field ${compact?'compact':''}`}><SettingHeading label={label} help={help}/><ChoiceButtons label={ariaLabel??label} value={value} options={options} onChange={onChange} disabled={disabled} allowReselect={allowReselect}/></div>
}
