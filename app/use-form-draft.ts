"use client";
import {useState,useSyncExternalStore} from "react";
import {createFormDraftController,type DraftEditor} from "@/lib/form-draft";

export function useFormDraft<T extends DraftEditor>(){
 const [controller]=useState(()=>createFormDraftController<T>(()=>typeof window==="undefined"?undefined:window.localStorage));
 const snapshot=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 return {...snapshot,syncSession:controller.syncSession,open:controller.open,setForm:controller.setForm,close:controller.close,resume:controller.resume,discard:controller.discard,submitted:controller.submitted};
}
