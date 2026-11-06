import { useMemo, useState } from 'react'
import { projectThumbnail } from './projectThumbnail'
import { visibleProjects } from './projectLibrary'
import type { ProjectSection, ProjectWorkspace, SavedProject } from './projectLibrary'
import './ProjectLibrary.css'

type Props={workspace:ProjectWorkspace;productCount:number;onProducts:()=>void;onOpen:(p:SavedProject)=>void;onCreate:(name:string,section:string)=>void;onRename:(id:string,name:string)=>void;onDelete:(id:string)=>void;onMove:(id:string,section:string)=>void;onAddSection:(name:string)=>string;onRenameSection:(id:string,name:string)=>void;onImport:(file:File)=>Promise<string>;onExport:(p:SavedProject)=>void;error?:string}
function ProjectCard({project:p,sections,current,onOpen,onRename,onDelete,onMove,onExport}:{project:SavedProject;sections:ProjectSection[];current:boolean}&Pick<Props,'onOpen'|'onRename'|'onDelete'|'onMove'|'onExport'>){
  const [renaming,setRenaming]=useState(false),[name,setName]=useState(p.name)
  const preview=useMemo(()=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(projectThumbnail(p.settings))}`,[p.settings])
  const updated=new Intl.DateTimeFormat('en-IE',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Dublin'}).format(p.updatedAt)
  return <article className="project-card"><button type="button" className="project-image" aria-label={`Open ${p.name}`} onClick={()=>onOpen(p)}><img src={preview} alt={`${p.name} deck preview`} loading="lazy"/>{current?<span>Current project</span>:null}</button><div className="project-card-body">
    {renaming?<form className="project-rename" onSubmit={e=>{e.preventDefault();if(!name.trim())return;onRename(p.id,name);setRenaming(false)}}><input aria-label="Project name" autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setRenaming(false)}}/><button type="submit" className="text-button" disabled={!name.trim()}>Save</button><button type="button" className="text-button" onClick={()=>setRenaming(false)}>Cancel</button></form>:<div className="project-card-title"><h2>{p.name}</h2><button type="button" className="text-button" aria-label={`Rename ${p.name}`} onClick={()=>{setName(p.name);setRenaming(true)}}>Rename</button></div>}
    <p>{p.settings.quotation?.customerName||p.settings.board.colourName} <span>·</span> Updated {updated}</p>
    <label className="project-section-choice"><span>Section</span><select aria-label={`Section for ${p.name}`} value={p.sectionId} onChange={e=>onMove(p.id,e.target.value)}>{sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="project-card-actions"><button type="button" className="button primary" onClick={()=>onOpen(p)}>Open project →</button><button type="button" className="text-button" onClick={()=>onExport(p)} aria-label={`Back up ${p.name}`}>Back up project ↓</button><button type="button" className="text-button project-delete" aria-label={`Delete ${p.name}`} onClick={()=>{if(window.confirm(`Delete “${p.name}”?\n\nThis permanently removes this project from this browser. This cannot be undone.`))onDelete(p.id)}}>Delete project</button></div>
  </div></article>
}
function CatalogueArtwork(){
  return <svg viewBox="0 0 240 100" fill="none" aria-hidden="true" focusable="false"><rect x="1" y="1" width="238" height="98" rx="12" fill="#e9efdc"/><g stroke="#869d68" strokeWidth="1.5" strokeLinejoin="round"><path d="m24 39 33-17 38 20-33 18Z" fill="#b8c99c"/><path d="M24 39v17l38 20 33-18V42M62 60v16M35 34l38 20M46 28l38 20"/><ellipse cx="129" cy="39" rx="21" ry="8" fill="#a2b783"/><path d="M122 45v24m14-24v24" strokeWidth="6"/><ellipse cx="129" cy="73" rx="25" ry="8" fill="#c2d1aa"/><path d="m174 35 15-8 34 18v23l-15 8-34-18Z" fill="#c2d1aa"/><path d="m174 35 34 18 15-8M208 53v23m-25-38 25 13v16l-25-13Z"/></g></svg>
}

export default function ProjectLibrary(props:Props){
  const {workspace:w,onCreate,onAddSection,onRenameSection,onImport,error}=props
  const [view,setView]=useState<'recent'|'all'>('recent'),[sectionFilter,setSectionFilter]=useState('all'),[search,setSearch]=useState('')
  const [managing,setManaging]=useState(false),[sectionName,setSectionName]=useState(''),[creating,setCreating]=useState(false),[name,setName]=useState(''),[section,setSection]=useState(w.sections[0].id)
  const [importing,setImporting]=useState(false),[importError,setImportError]=useState('')
  const selected=w.sections.find(s=>s.id===sectionFilter)
  const shown=visibleProjects(selected?w.projects.filter(p=>p.sectionId===selected.id):w.projects,view,search)
  const startProject=()=>{setCreating(true);setName('');setSection(selected?.id??w.sections[0].id)}
  return <main className="project-home project-hub">
    <header className="project-home-heading">
      <div><span className="eyebrow">BETTERPLAN HUB</span><h1>Your workspace</h1><p>Pick up a project, or start your next deck.</p></div>
      <div><label className="button secondary import-button">{importing?'Importing…':'Import project'}<input disabled={importing} aria-label="Import project" type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(f){setImporting(true);try{setImportError(await onImport(f))}catch(e){setImportError(e instanceof Error?e.message:'Could not import project.')}finally{setImporting(false)}}}}/></label><button type="button" className="button primary" onClick={startProject}>＋ New project</button></div>
    </header>
    {error||importError?<p className="project-storage-error" role="alert">{error||importError}</p>:null}
    <div className="hub-layout">
      <section className="hub-projects" aria-labelledby="hub-projects-title">
        <div className="hub-projects-heading"><div><h2 id="hub-projects-title">Projects <span>{w.projects.length}</span></h2></div><input aria-label="Search projects" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects or customers"/></div>
        <div className="hub-project-tools">
          <nav className="hub-project-tabs" aria-label="Project views"><button type="button" aria-pressed={view==='recent'} onClick={()=>setView('recent')}>Recent</button><button type="button" aria-pressed={view==='all'} onClick={()=>setView('all')}>All projects</button></nav>
          <div className="hub-section-tools"><label><span>Section</span><select aria-label="Filter projects by section" value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="all">All sections</option>{w.sections.map(s=><option key={s.id} value={s.id}>{s.name} ({w.projects.filter(p=>p.sectionId===s.id).length})</option>)}</select></label><button type="button" className="text-button" aria-expanded={managing} aria-controls="hub-sections" onClick={()=>setManaging(v=>!v)}>Manage sections</button></div>
        </div>
        {managing?<section className="hub-section-manager" id="hub-sections" aria-labelledby="hub-sections-title"><div className="hub-panel-heading"><h3 id="hub-sections-title">Your sections</h3><button type="button" className="text-button" onClick={()=>setManaging(false)}>Done</button></div><div className="hub-section-rows">{w.sections.map(s=><form key={`${s.id}:${s.name}`} onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('name');if(typeof value==='string'&&value.trim())onRenameSection(s.id,value)}}><label><span className="hub-folder-icon" aria-hidden="true">▱</span><input aria-label={`Name for ${s.name} section`} name="name" defaultValue={s.name} maxLength={120} required/></label><span className="hub-section-count">{w.projects.filter(p=>p.sectionId===s.id).length} projects</span><button className="text-button" type="submit">Save</button></form>)}</div><form className="hub-add-section" onSubmit={e=>{e.preventDefault();if(!sectionName.trim())return;const id=onAddSection(sectionName);if(id)setSectionFilter(id);setSectionName('')}}><input aria-label="New section name" placeholder="New section, e.g. Hospitality" maxLength={120} value={sectionName} onChange={e=>setSectionName(e.target.value)}/><button type="submit" className="button secondary" disabled={!sectionName.trim()}>Add section</button></form></section>:null}
        {creating?<form className="new-project-form" onSubmit={e=>{e.preventDefault();if(!name.trim())return;onCreate(name,section);setCreating(false)}}><h2>New project</h2><label>Name<input autoFocus aria-label="New project name" required maxLength={120} placeholder="e.g. Hotel terrace" value={name} onChange={e=>setName(e.target.value)}/></label><label>Section<select aria-label="New project section" value={section} onChange={e=>setSection(e.target.value)}>{w.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div><button className="button primary" type="submit">Create project</button><button className="button secondary" type="button" onClick={()=>setCreating(false)}>Cancel</button></div></form>:null}
        <div className="project-grid">{shown.map(p=><ProjectCard key={p.id} project={p} sections={w.sections} current={p.id===w.activeId} onOpen={props.onOpen} onRename={props.onRename} onDelete={props.onDelete} onMove={props.onMove} onExport={props.onExport}/>)}</div>
        {!shown.length?<div className="project-empty"><h3>{search?'No matching projects':selected?`No projects in ${selected.name} yet`:'Start your first project'}</h3><p>{search?'Try another name, customer or section.':'Create a new deck, import a saved project, or move one here.'}</p>{!search?<button type="button" className="button primary" onClick={startProject}>＋ New project</button>:null}</div>:null}
        {view==='recent'&&shown.length===12?<p className="hub-recent-note">Showing your 12 most recently opened projects. <button type="button" className="text-button" onClick={()=>setView('all')}>View all projects →</button></p>:null}
      </section>
      <aside className="hub-sidebar" aria-label="Workspace tools">
        <section className="hub-products" aria-labelledby="hub-products-title"><span className="eyebrow">YOUR CATALOGUE</span><h2 id="hub-products-title">Products</h2><p>Boards, pedestals and Alu-Joists. Save them once, use them across your projects.</p><CatalogueArtwork/><button type="button" className="button primary" onClick={props.onProducts}>Open products <span aria-hidden="true">→</span></button><span className="hub-products-count">{props.productCount?`${props.productCount} saved ${props.productCount===1?'product':'products'}`:'Ready for your first product'}</span></section>
        <div className="hub-backup-note"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 4h12l3 3v13H4V4h1ZM8 4v6h8V4M8 20v-6h8v6"/></svg><div><strong>Saved in this browser</strong><p>Use “Back up project” on a project card to keep a copy or move it to another device.</p></div></div>
      </aside>
    </div>
  </main>
}
