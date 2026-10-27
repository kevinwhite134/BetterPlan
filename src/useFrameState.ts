import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

// Pointer and wheel events may arrive several times before one display frame.
// Commit the latest camera value once, instead of rebuilding the scene per event.
export function useFrameState<T>(initial:T):[T,Dispatch<SetStateAction<T>>]{
  const [value,setValue]=useState(initial),latest=useRef(initial),frame=useRef<number|null>(null)
  const update=useCallback<Dispatch<SetStateAction<T>>>(action=>{
    latest.current=typeof action==='function'?(action as (value:T)=>T)(latest.current):action
    if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setValue(latest.current)})
  },[])
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null},[])
  return [value,update]
}
