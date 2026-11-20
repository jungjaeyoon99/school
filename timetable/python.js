(() => {
"use strict";
const VERSION="0.29.5", BASE=`https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
let py=null, initPromise=null;
const PY=String.raw`
import sys, json, io, base64, urllib.request, urllib.error
class BrowserFetchRequired(Exception): pass
_responses=[]; _response_index=0
class BrowserResponse:
 def __init__(self,p):
  self.status=int(p.get("status",200)); self.code=self.status
  self.headers=p.get("headers",{}); self.stream=io.BytesIO(base64.b64decode(p.get("bodyBase64","")))
 def read(self,n=-1): return self.stream.read(n)
 def close(self): self.stream.close()
 def __enter__(self): return self
 def __exit__(self,*a): self.close()
def browser_urlopen(url,data=None,timeout=30,**kwargs):
 global _response_index
 if isinstance(url,urllib.request.Request):
  req=url; target=req.full_url; method=req.get_method(); headers=dict(req.header_items()); body=req.data
 else:
  target=str(url); method="POST" if data is not None else "GET"; headers={}; body=data
 if _response_index>=len(_responses):
  payload={"url":target,"method":method,"headers":headers,"bodyBase64":base64.b64encode(body).decode() if body else None}
  raise BrowserFetchRequired("BROWSER_FETCH_REQUIRED:"+json.dumps(payload,ensure_ascii=False))
 p=_responses[_response_index]; _response_index+=1; response=BrowserResponse(p)
 if response.status>=400: raise urllib.error.HTTPError(target,response.status,"HTTP error",response.headers,None)
 return response
def bridge_begin():
 global _response_index
 _response_index=0
def bridge_push(s): _responses.append(json.loads(s))
def bridge_end():
 global _responses,_response_index
 _responses=[]; _response_index=0
urllib.request.urlopen=browser_urlopen
async def install_library():
 import micropip
 await micropip.install("pycomcigan==1.4.1",deps=False)
 import Crypto, Crypto.Util, Crypto.Util.Padding
 sys.modules["Cryptodome"]=Crypto
 sys.modules["Cryptodome.Util"]=Crypto.Util
 sys.modules["Cryptodome.Util.Padding"]=Crypto.Util.Padding
 from pycomcigan import TimeTable, get_school_code
def search_schools(name):
 from pycomcigan import get_school_code
 return get_school_code(name)
def get_timetable(name,local_code,school_code,week,grade,cls):
 from pycomcigan import TimeTable
 t=TimeTable(name,local_code=int(local_code or 0),school_code=int(school_code or 0),week_num=int(week))
 days=t.timetable[int(grade)][int(cls)]
 output=[]
 for day_i,day in enumerate(days):
  if day_i==0: continue
  lessons=[]
  for x in day:
   lessons.append({"period":int(x.period),"subject":str(x.subject or ""),"teacher":str(x.teacher or ""),"replaced":bool(x.replaced),"original":({"subject":str(x.original.subject or "")} if x.original else None)})
  output.append(lessons)
 return {"schoolName":t.school_name,"localName":t.local_name,"schoolYear":t.school_year,"updateDate":str(t.update_date),"days":output}
`;
function decodeFetchError(e){
 const marker="BROWSER_FETCH_REQUIRED:",s=String(e?.message||e),i=s.indexOf(marker);
 if(i<0)return null; try{return JSON.parse(s.slice(i+marker.length).split(/\r?\n/)[0])}catch{return null}
}
function toBase64(buf){
 const b=new Uint8Array(buf);let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s)
}
async function browserFetch(req){
 const relay=String(window.COMCIGAN_FETCH_RELAY||"").trim();
 if(relay){
  const r=await fetch(relay,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(req)});
  if(!r.ok)throw Error(`중계 서버 HTTP ${r.status}`);
  const p=await r.json();if(typeof p.status!=="number"||typeof p.bodyBase64!=="string")throw Error("중계 서버 응답 형식 오류");return p;
 }
 let r;
 try{r=await fetch(req.url,{method:req.method||"GET",headers:req.headers||{},mode:"cors",credentials:"omit",cache:"no-store"})}
 catch(e){throw Error("브라우저에서 Comcigan 원본 서버에 연결할 수 없습니다. HTTP 혼합 콘텐츠 또는 CORS 차단일 수 있습니다. HTTPS·CORS 중계 주소를 firebase.js의 COMCIGAN_FETCH_RELAY에 설정해야 합니다. 원인: "+e.message)}
 return {status:r.status,bodyBase64:toBase64(await r.arrayBuffer()),headers:{}};
}
async function bridged(expr){
 py.runPython("bridge_begin()");
 try{
  while(true){
   try{return await py.runPythonAsync(expr)}
   catch(e){const req=decodeFetchError(e);if(!req)throw e;const response=await browserFetch(req);py.runPython(`bridge_push(${JSON.stringify(JSON.stringify(response))})`)}
  }
 }finally{py.runPython("bridge_end()")}
}
async function initialize(){
 if(initPromise)return initPromise;
 initPromise=(async()=>{py=await loadPyodide({indexURL:BASE});await py.loadPackage(["micropip","pycryptodome","requests"]);await py.runPythonAsync(PY);await py.runPythonAsync("await install_library()")})();
 try{await initPromise}catch(e){initPromise=null;throw e}
}
async function convert(p){try{return p.toJs({dict_converter:Object.fromEntries})}finally{p.destroy()}}
window.TimetablePython={
 initialize,
 async searchSchools(n){await initialize();return convert(await bridged(`search_schools(${JSON.stringify(n)})`))},
 async getTimetable(o){await initialize();const a=[JSON.stringify(o.schoolName),JSON.stringify(o.localCode||0),JSON.stringify(o.schoolCode||0),+o.weekNum,+o.grade,+o.classNum].join(",");return convert(await bridged(`get_timetable(${a})`))},
 version:VERSION
};
})();