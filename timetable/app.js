(() => {
"use strict";
const $=id=>document.getElementById(id), state={user:null,admin:false,python:false};
const days=["월","화","수","목","금","토","일"];
function message(s,error=false){$("message").textContent=s;$("message").hidden=false;$("message").classList.toggle("error",error)}
function clearMessage(){$("message").hidden=true}
function configured(){return window.FIREBASE_CONFIG?.apiKey&&!window.FIREBASE_CONFIG.apiKey.includes("REPLACE_WITH")}
async function authChanged(user){
 state.user=user||null;state.admin=false;
 $("auth-status").textContent=user?(user.displayName||user.email||"로그인됨"):"로그인하지 않음";
 $("login").hidden=!!user;$("logout").hidden=!user;$("admin").hidden=true;
 if(!user)return;
 try{
  const role=(await firebase.database().ref("roles/"+user.uid).once("value")).val();
  state.admin=role==="admin";$("admin").hidden=!state.admin;
  if((await firebase.database().ref("blockedUsers/"+user.uid).once("value")).val()===true&&!state.admin){message("이 계정은 서비스 이용이 제한되어 있습니다.",true);await firebase.auth().signOut();return}
  const ref=firebase.database().ref("timetableLogs/"+user.uid).push();
  await ref.set({uid:user.uid,email:user.email||"",displayName:user.displayName||"",timestamp:firebase.database.ServerValue.TIMESTAMP,userAgent:navigator.userAgent||"",page:location.pathname});
 }catch(e){message("권한 확인 또는 로그 저장 실패: "+e.message,true)}
}
function initFirebase(){
 if(!configured()){$("auth-status").textContent="firebase.js에 API Key 입력 필요";$("login").disabled=true;return}
 try{if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);firebase.auth().onAuthStateChanged(authChanged);
 $("login").onclick=()=>firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>message("로그인 실패: "+e.message,true));
 $("logout").onclick=()=>firebase.auth().signOut()}catch(e){message("Firebase 초기화 실패: "+e.message,true)}
}
async function startPython(){
 try{await TimetablePython.initialize();state.python=true;$("python-status").textContent="Python 준비 완료";$("school-search").disabled=false;$("load").disabled=false;$("hint").textContent="학교명을 검색하거나 입력하세요."}
 catch(e){$("python-status").textContent="Python 초기화 실패";message("Python 준비 실패: "+e.message,true)}
}
function busy(btn,on,label){if(!btn.dataset.original)btn.dataset.original=btn.textContent;btn.disabled=on;btn.textContent=on?label:btn.dataset.original}
async function searchSchools(){
 clearMessage();const name=$("school-name").value.trim();if(!name)return message("학교명을 입력하세요.",true);
 busy($("school-search"),true,"검색 중...");
 try{
  const rows=await TimetablePython.searchSchools(name),box=$("school-results");box.replaceChildren();
  if(!rows.length){box.hidden=true;return message("검색 결과가 없습니다.",true)}
  rows.forEach(row=>{const [lc,ln,sn,sc]=row,div=document.createElement("div");div.className="school-option";
   const info=document.createElement("span");info.textContent=`${sn} · ${ln} · 지역 ${lc} / 학교 ${sc}`;
   const b=document.createElement("button");b.textContent="선택";b.onclick=()=>{$("school-name").value=sn;$("local-code").value=lc;$("school-code").value=sc;box.hidden=true;message(`${sn} 선택 완료`)};
   div.append(info,b);box.append(div)});box.hidden=false;
 }catch(e){message("학교 검색 실패:\\n"+e.message,true)}finally{busy($("school-search"),false)}
}
async function loadTable(){
 clearMessage();if(!state.user)return message("시간표 조회 전에 Google 로그인이 필요합니다.",true);
 const name=$("school-name").value.trim(),cls=+$("class-number").value;if(!name||!Number.isInteger(cls)||cls<1)return message("학교명과 올바른 반 번호를 입력하세요.",true);
 busy($("load"),true,"불러오는 중...");$("result").hidden=true;
 try{
  const data=await TimetablePython.getTimetable({schoolName:name,localCode:$("local-code").value,schoolCode:$("school-code").value,grade:+$("grade").value,classNum:cls,weekNum:+$("week-number").value});
  render(data,+$("grade").value,cls,+$("week-number").value);
 }catch(e){message("시간표 조회 실패:\\n"+e.message,true)}finally{busy($("load"),false)}
}
function render(data,grade,cls,week){
 $("result-title").textContent=`${data.schoolName} ${grade}학년 ${cls}반`;
 $("result-meta").textContent=`${data.localName||""} · ${week?"다음 주":"이번 주"} · 자료 갱신 ${data.updateDate||"정보 없음"}`;
 const table=document.createElement("table"),head=document.createElement("tr");
 ["교시",...days.slice(0,data.days.length).map(d=>d+"요일")].forEach(x=>{const th=document.createElement("th");th.textContent=x;head.append(th)});
 const thead=document.createElement("thead");thead.append(head);table.append(thead);const body=document.createElement("tbody");
 const max=Math.max(0,...data.days.map(d=>d.length));
 for(let p=1;p<=max;p++){const tr=document.createElement("tr"),n=document.createElement("th");n.textContent=p+"교시";tr.append(n);
  data.days.forEach(day=>{const td=document.createElement("td"),x=day.find(v=>+v.period===p),box=document.createElement("div");box.className="lesson";
   if(!x||!x.subject)box.textContent="—";else{if(x.replaced)box.classList.add("changed");const s=document.createElement("b");s.textContent=x.subject;const t=document.createElement("small");t.textContent=x.teacher||"";box.append(s,t);
    if(x.replaced&&x.original?.subject){const old=document.createElement("span");old.className="old";old.textContent="기존: "+x.original.subject;box.append(old)}}
   td.append(box);tr.append(td)});body.append(tr)}
 table.append(body);$("table-wrap").replaceChildren(table);$("result").hidden=false;$("result").scrollIntoView({behavior:"smooth"});
}
async function block(uid,value){if(!state.admin)return;uid=$("blocked-uid").value.trim();if(!uid)return message("UID를 입력하세요.",true);
 try{await firebase.database().ref("blockedUsers/"+uid).set(value);message(value?"UID 차단 완료":"차단 해제 완료")}catch(e){message("변경 실패: "+e.message,true)}}
async function logs(){
 if(!state.admin)return;const box=$("logs");box.textContent="불러오는 중...";
 try{const snap=await firebase.database().ref("timetableLogs").once("value"),rows=[];
 snap.forEach(u=>u.forEach(l=>rows.push(l.val())));rows.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
 const table=document.createElement("table"),head=document.createElement("tr");["시각","이메일","UID","User-Agent"].forEach(x=>{const th=document.createElement("th");th.textContent=x;head.append(th)});
 const thead=document.createElement("thead");thead.append(head);table.append(thead);const body=document.createElement("tbody");
 rows.slice(0,200).forEach(r=>{const tr=document.createElement("tr");[r.timestamp?new Date(r.timestamp).toLocaleString("ko-KR"):"-",r.email||"-",r.uid||"-",r.userAgent||"-"].forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.append(td)});body.append(tr)});
 table.append(body);box.replaceChildren(table);if(!rows.length)box.textContent="로그가 없습니다.";
 }catch(e){box.textContent="로그 조회 실패: "+e.message}
}
document.addEventListener("DOMContentLoaded",()=>{
 $("school-search").onclick=searchSchools;$("load").onclick=loadTable;$("school-name").onkeydown=e=>{if(e.key==="Enter")searchSchools()};
 $("print").onclick=()=>print();$("block").onclick=()=>block(null,true);$("unblock").onclick=()=>block(null,false);$("refresh-logs").onclick=logs;
 initFirebase();$("school-search").disabled=true;$("load").disabled=true;startPython();
});
})();