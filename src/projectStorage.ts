import { readProjectWorkspace } from './projectLibrary.ts'
import type { ProjectWorkspace } from './projectLibrary.ts'

const DATABASE='betterplan-project-library-v1',STORE='workspace'
function openDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1)
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE)
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error??new Error('Project storage is unavailable.'))
    request.onblocked=()=>reject(new Error('Close other BetterPlan tabs and retry project storage.'))
  })
}
export async function loadProjectWorkspace():Promise<ProjectWorkspace|null>{
  const db=await openDatabase()
  try{return await new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readonly'),request=transaction.objectStore(STORE).get('current')
    request.onsuccess=()=>{try{resolve(request.result===undefined?null:readProjectWorkspace(request.result))}catch(error){reject(error)}}
    request.onerror=()=>reject(request.error)
  })}finally{db.close()}
}
let writes:Promise<void>=Promise.resolve()
export function storeProjectWorkspace(workspace:ProjectWorkspace){
  // Keep rapid edits and project switches in order; each write is atomic.
  const snapshot=structuredClone(workspace)
  writes=writes.catch(()=>{}).then(async()=>{
    const db=await openDatabase()
    try{await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(snapshot,'current')
      transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error??new Error('Project save was interrupted.'))
    })}finally{db.close()}
  })
  return writes
}
