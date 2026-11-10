import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useLiveRefresh } from "../components/operations/useLiveRefresh";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
let visibility="visible";
Object.defineProperty(document,"visibilityState",{get:()=>visibility});
let calls=0;
let release: (()=>void) | undefined;
const refresh=async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});};
function Probe(){useLiveRefresh(refresh,"qa",true,20);return <input defaultValue="pagamento em andamento"/>;}
const root=createRoot(document.getElementById("root")!);
const wait=()=>new Promise(resolve=>setTimeout(resolve,40));
try {
 await act(async()=>root.render(<Probe/>));
 assert.equal(calls,1);
 await act(async()=>{window.dispatchEvent(new dom.window.Event("focus"));await wait();});
 assert.equal(calls,1,"does not overlap a slow request");
 await act(async()=>{release!();await wait();});
 assert.equal(calls,2,"refreshes automatically without interaction");
 visibility="hidden";
 await act(async()=>{document.dispatchEvent(new dom.window.Event("visibilitychange"));release!();await wait();});
 assert.equal(calls,2,"hidden tabs pause");
 visibility="visible";
 await act(async()=>document.dispatchEvent(new dom.window.Event("visibilitychange")));
 assert.equal(calls,3,"returning to the tab refreshes immediately");
 assert.equal((document.querySelector("input") as HTMLInputElement).value,"pagamento em andamento");
 await act(async()=>root.unmount());
 release!();await wait();assert.equal(calls,3,"unmount stops polling");
 console.log("PASS: automatic refresh, no overlap, visibility pause/resume, preserved input and cleanup.");
} finally {dom.window.close();}
