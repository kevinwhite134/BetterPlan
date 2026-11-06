import { useEffect, useRef, useState } from 'react'
import { initialWorkspace, makeProject, projectName, removeProject, saveActiveProject } from './projectLibrary'
import { DEFAULT_SETTINGS } from './planner'
import type { ProjectSnapshot, ProjectWorkspace, SavedProject } from './projectLibrary'
import { loadProjectWorkspace, storeProjectWorkspace } from './projectStorage'

export function useProjectWorkspace(snapshot:ProjectSnapshot,onLoad:(project:ProjectSnapshot)=>void,enabled=true){
  const [workspace,setWorkspace]=useState<ProjectWorkspace|null>(null),[ready,setReady]=useState(false),[saveState,setSaveState]=useState<'saving'|'saved'|'error'>('saving'),[error,setError]=useState('')
  const initial=useRef({snapshot,onLoad}),persist=useRef(true)
  useEffect(()=>{
    let live=true
    const boot=async()=>{
      let previous=null;try{previous=JSON.parse(localStorage.getItem('betterdeck-previous-v1')??'null')}catch{/* Legacy backup is optional. */}
      let loaded:ProjectWorkspace,canPersist=true
      try{loaded=await loadProjectWorkspace()??initialWorkspace(initial.current.snapshot.settings,initial.current.snapshot.prices,previous)}catch(e){canPersist=false;loaded=initialWorkspace(initial.current.snapshot.settings,initial.current.snapshot.prices,previous);if(live){setError(`${e instanceof Error?e.message:'Project storage is unavailable.'} Changes are only in memory; export your projects to keep them.`);setSaveState('error')}}
      if(live){persist.current=canPersist;setWorkspace(loaded);initial.current.onLoad(loaded.projects.find(p=>p.id===loaded.activeId)??{settings:DEFAULT_SETTINGS,prices:{},stage:'shape'});setReady(true)}
    }
    void boot();return ()=>{live=false}
  },[])
  const {settings,prices,stage}=snapshot
  useEffect(()=>{let live=true;queueMicrotask(()=>{if(live&&ready&&enabled)setWorkspace(w=>w?saveActiveProject(w,{settings,prices,stage}):w)});return ()=>{live=false}},[settings,prices,stage,ready,enabled])
  useEffect(()=>{
    if(!workspace||!persist.current)return
    let live=true;setSaveState('saving')
    void storeProjectWorkspace(workspace).then(()=>{if(live){setSaveState('saved');setError('')}},()=>{if(live){setSaveState('error');setError('Projects could not be saved in this browser. Export your projects to keep a copy.')}})
    return ()=>{live=false}
  },[workspace])
  const capture=(w:ProjectWorkspace)=>enabled?saveActiveProject(w,snapshot):w
  const saveCurrent=()=>setWorkspace(w=>w?capture(w):w)
  const open=(project:SavedProject)=>{
    setWorkspace(w=>{if(!w)return w;const saved=capture(w);return {...saved,activeId:project.id,projects:saved.projects.map(p=>p.id===project.id?{...p,lastOpenedAt:Date.now()}:p)}})
    onLoad(project)
  }
  const create=(name:string,sectionId:string,data?:ProjectSnapshot)=>{
    const project=makeProject(name,sectionId,data)
    setWorkspace(w=>{if(!w)return w;const saved=capture(w);return {...saved,activeId:project.id,projects:[project,...saved.projects]}})
    onLoad(project)
  }
  const rename=(id:string,name:string)=>setWorkspace(w=>w?{...w,projects:w.projects.map(p=>p.id===id?{...p,name:projectName(name)}:p)}:w)
  const remove=(id:string)=>{
    if(!workspace)return
    const next=removeProject(workspace,id)
    setWorkspace(next)
    if(next.activeId!==workspace.activeId)onLoad(next.projects.find(p=>p.id===next.activeId)??{settings:DEFAULT_SETTINGS,prices:{},stage:'shape'})
  }
  const move=(id:string,sectionId:string)=>setWorkspace(w=>w&&w.sections.some(s=>s.id===sectionId)?{...w,projects:w.projects.map(p=>p.id===id?{...p,sectionId}:p)}:w)
  const addSection=(name:string)=>{
    if(!workspace)return ''
    const clean=projectName(name),existing=workspace.sections.find(s=>s.name.toLocaleLowerCase()===clean.toLocaleLowerCase());if(existing)return existing.id
    const id=crypto.randomUUID();setWorkspace(w=>w?{...w,sections:[...w.sections,{id,name:clean}]}:w);return id
  }
  const renameSection=(id:string,name:string)=>setWorkspace(w=>w&&!w.sections.some(s=>s.id!==id&&s.name.toLocaleLowerCase()===projectName(name).toLocaleLowerCase())?{...w,sections:w.sections.map(s=>s.id===id?{...s,name:projectName(name)}:s)}:w)
  return {workspace,ready,saveState,error,saveCurrent,open,create,rename,remove,move,addSection,renameSection}
}
