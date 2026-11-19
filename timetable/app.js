import { firebaseConfig } from "./firebase.js";
import { initializePython, searchSchools, getTimetable } from "./python.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, push, set, get, query, orderByChild,
  equalTo, update, remove
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const $ = id => document.getElementById(id);
const firebaseConfigured = !firebaseConfig.apiKey.startsWith("YOUR_") &&
  !firebaseConfig.projectId.startsWith("YOUR_");

let auth = null, db = null, currentUser = null, isAdmin = false;
let selectedSchool = null;
let latestSchools = [];

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3300);
}
function setPythonStatus(text, state="idle") {
  $("python-status").textContent = text;
  $("python-status").className = `status-pill status-${state}`;
  $("python-message").textContent = text;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function firebaseReady() {
  if (!firebaseConfigured) {
    toast("firebase.js에 기존 Firebase 프로젝트 설정을 입력해 주세요.");
    return false;
  }
  return true;
}

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    isAdmin = false;
    if (user) {
      $("auth-state").textContent = user.email || "로그인됨";
      $("login-open").classList.add("hidden");
      $("logout").classList.remove("hidden");
      try {
        const roleSnap = await get(ref(db, `roles/${user.uid}`));
        isAdmin = roleSnap.val() === "admin";
      } catch (error) {
        console.warn("역할 확인 실패", error);
      }
      $("admin-panel").classList.toggle("hidden", !isAdmin);
      await writeLog("access", {event:"auth_state", success:true});
    } else {
      $("auth-state").textContent = "로그인하지 않음";
      $("login-open").classList.remove("hidden");
      $("logout").classList.add("hidden");
      $("admin-panel").classList.add("hidden");
    }
  });
} else {
  $("auth-state").textContent = "Firebase 설정 필요";
  $("login-open").title = "firebase.js 설정을 먼저 입력하세요.";
}

async function writeLog(activity, details={}) {
  if (!db || !currentUser) return;
  try {
    const logRef = push(ref(db, `logs/${activity}`));
    await set(logRef, {
      uid: currentUser.uid,
      timestamp: Date.now(),
      activity,
      ...details
    });
  } catch (error) {
    console.warn("활동 로그 기록 실패", error);
  }
}

// Python 런타임을 미리 준비할 수도 있지만, 초기 다운로드 부담을 줄이기 위해 첫 검색 때 초기화합니다.
$("school-search-form").addEventListener("submit", async event => {
  event.preventDefault();
  const queryText = $("school-query").value.trim();
  if (!queryText) return;
  const button = $("school-search-button");
  button.disabled = true;
  $("school-results").innerHTML = `<div class="empty-state">Python 준비 및 학교 검색 중…</div>`;
  setPythonStatus("브라우저 Python 준비 중…", "loading");
  try {
    const rows = await searchSchools(queryText, message => setPythonStatus(message, "loading"));
    latestSchools = rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      $("school-results").innerHTML = `<div class="empty-state">검색 결과가 없습니다.</div>`;
      await writeLog("searchschools", {searchQuery:queryText, success:true, resultCount:0});
      setPythonStatus("검색 완료", "ok");
      return;
    }
    $("school-results").innerHTML = rows.map((row, index) => {
      // pycomcigan 1.4.5 반환 순서: [지역코드, 지역명, 학교명, 학교코드]
      const [localCode, regionName, schoolName, schoolCode] = row;
      return `<button class="result-item" data-index="${index}">
        <span><span class="result-name">${escapeHtml(schoolName)}</span><span class="result-meta">${escapeHtml(regionName)} · 학교 코드 ${escapeHtml(schoolCode)}</span></span>
        <span aria-hidden="true">›</span>
      </button>`;
    }).join("");
    $("school-results").querySelectorAll("[data-index]").forEach(button => {
      button.addEventListener("click", () => selectSchool(latestSchools[Number(button.dataset.index)]));
    });
    await writeLog("searchschools", {searchQuery:queryText, success:true, resultCount:rows.length});
    setPythonStatus("Python 및 학교 검색 준비 완료", "ok");
  } catch (error) {
    console.error(error);
    $("school-results").innerHTML = `<div class="notice notice-error">${escapeHtml(error.message || error)}</div>`;
    setPythonStatus("Python 또는 학교 검색 오류", "error");
    await writeLog("searchschools", {searchQuery:queryText, success:false, errorType:String(error.message || error).slice(0,180)});
  } finally {
    button.disabled = false;
  }
});

function selectSchool(row) {
  const [localCode, regionName, schoolName, schoolCode] = row;
  selectedSchool = {localCode, regionName, schoolName, schoolCode};
  $("selected-school-title").textContent = schoolName;
  $("selected-school-meta").textContent = `${regionName} · 코드 ${schoolCode}`;
  $("timetable-panel").classList.remove("hidden");
  $("timetable-output").innerHTML = `<div class="empty-state">학년과 반을 선택한 후 시간표를 조회하세요.</div>`;
  $("grade-select").innerHTML = `<option value="">학년 선택</option>`;
  // 학년 선택지는 조회 가능한 범위를 위한 입력값이며, 실제 학년 존재 여부는 조회 결과로 검증합니다.
  for (let grade = 1; grade <= 12; grade++) {
    $("grade-select").add(new Option(`${grade}학년`, String(grade)));
  }
  $("class-select").innerHTML = `<option value="">반 선택</option>`;
  $("timetable-panel").scrollIntoView({behavior:"smooth", block:"start"});
}

$("grade-select").addEventListener("change", async () => {
  // 라이브러리 반환 데이터에서 학급 수를 알아내려면 먼저 조회가 필요합니다.
  // 1~12반을 임의로 단정하지 않고, 사용자가 입력한 숫자 목록을 제공합니다.
  const grade = Number($("grade-select").value);
  populateClasses(grade);
});
function populateClasses(grade) {
  const select = $("class-select");
  select.innerHTML = `<option value="">반 선택</option>`;
  for (let n=1; n<=20; n++) select.add(new Option(`${n}반`, String(n)));
}

function renderTimetable(data, grade, classNo) {
  const dayNames = ["월","화","수","목","금","토","일"];
  const days = data.days || [];
  const maxPeriods = Math.max(0, ...days.map(day => day.length));
  if (!days.length || !maxPeriods) {
    $("timetable-output").innerHTML = `<div class="empty-state">해당 학급의 시간표 데이터가 없습니다.</div>`;
    return;
  }
  let html = `<table class="timetable"><thead><tr><th>교시</th>${days.map((_,i)=>`<th>${dayNames[i] || `${i+1}일차`}</th>`).join("")}</tr></thead><tbody>`;
  for (let period=0; period<maxPeriods; period++) {
    html += `<tr><td class="period">${period+1}</td>`;
    for (const day of days) {
      const lesson = day[period];
      html += `<td>${lesson && lesson.subject ? `<div class="lesson">${escapeHtml(lesson.subject)}</div><div class="teacher">${escapeHtml(lesson.teacher)}</div>${lesson.replaced ? `<div class="replaced">변경 수업</div>` : ""}` : `<span class="muted">—</span>`}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  $("timetable-output").innerHTML = html;
  $("timetable-meta").textContent = `${grade}학년 ${classNo}반 · 담임 ${data.homeroom || "정보 없음"} · 자료 갱신 ${data.updateDate || "정보 없음"}`;
}

$("timetable-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedSchool) return toast("먼저 학교를 선택하세요.");
  const grade = Number($("grade-select").value);
  const classNo = Number($("class-select").value);
  const weekNum = Number($("week-select").value);
  if (!grade || !classNo) return toast("학년과 반을 선택하세요.");
  const button = $("timetable-button");
  button.disabled = true;
  $("timetable-output").innerHTML = `<div class="empty-state">시간표를 가져오는 중…</div>`;
  try {
    const data = await getTimetable({
      schoolName:selectedSchool.schoolName,
      localCode:selectedSchool.localCode,
      schoolCode:selectedSchool.schoolCode,
      grade, classNo, weekNum
    }, message => $("timetable-meta").textContent = message);
    if (grade > data.gradeCount || classNo > data.classCount) {
      throw new Error(`해당 학교는 ${data.gradeCount}개 학년, 선택한 학년은 ${data.classCount}개 반까지만 데이터가 있습니다.`);
    }
    renderTimetable(data, grade, classNo);
    await writeLog("searchtimetable", {
      schoolName:selectedSchool.schoolName, schoolCode:String(selectedSchool.schoolCode),
      grade, class:classNo, weekNum, success:true
    });
  } catch (error) {
    console.error(error);
    $("timetable-output").innerHTML = `<div class="notice notice-error">${escapeHtml(error.message || error)}</div>`;
    await writeLog("searchtimetable", {
      schoolName:selectedSchool.schoolName, schoolCode:String(selectedSchool.schoolCode),
      grade, class:classNo, weekNum, success:false,
      errorType:String(error.message || error).slice(0,180)
    });
  } finally {
    button.disabled = false;
  }
});

// 인증 UI
$("login-open").addEventListener("click", () => {
  if (!firebaseReady()) return;
  $("auth-title").textContent = "로그인";
  $("auth-submit").textContent = "로그인";
  $("auth-dialog").showModal();
});
$("switch-signup").addEventListener("click", () => {
  $("auth-title").textContent = "회원가입";
  $("auth-submit").textContent = "회원가입";
  $("auth-password").value = "";
  $("auth-error").textContent = "회원가입을 진행합니다.";
});
$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!firebaseReady()) return;
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const signup = $("auth-title").textContent === "회원가입";
  $("auth-submit").disabled = true;
  $("auth-error").textContent = "";
  try {
    await setPersistence(auth, $("remember-login").checked ? browserLocalPersistence : browserSessionPersistence);
    if (signup) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      currentUser = credential.user;
      await writeLog("signup", {success:true});
      toast("회원가입이 완료되었습니다.");
    } else {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      currentUser = credential.user;
      await writeLog("login", {success:true});
      toast("로그인되었습니다.");
    }
    $("auth-dialog").close();
    $("auth-form").reset();
  } catch (error) {
    $("auth-error").textContent = authErrorMessage(error);
    await writeLog(signup ? "signup" : "login", {success:false,errorType:error.code || "unknown"});
  } finally {
    $("auth-submit").disabled = false;
  }
});
$("reset-password").addEventListener("click", async () => {
  if (!firebaseReady()) return;
  const email = $("auth-email").value.trim();
  if (!email) return $("auth-error").textContent = "비밀번호 재설정 이메일을 입력하세요.";
  try {
    await sendPasswordResetEmail(auth, email);
    $("auth-error").textContent = "비밀번호 재설정 이메일을 전송했습니다.";
  } catch (error) {
    $("auth-error").textContent = authErrorMessage(error);
  }
});
$("logout").addEventListener("click", async () => {
  if (!auth) return;
  await writeLog("logout", {success:true});
  await signOut(auth);
  toast("로그아웃되었습니다.");
});
function authErrorMessage(error) {
  const map = {
    "auth/email-already-in-use":"이미 사용 중인 이메일입니다.",
    "auth/invalid-email":"이메일 형식이 올바르지 않습니다.",
    "auth/weak-password":"비밀번호는 6자 이상이어야 합니다.",
    "auth/invalid-credential":"이메일 또는 비밀번호를 확인하세요.",
    "auth/too-many-requests":"요청이 많습니다. 잠시 후 다시 시도하세요."
  };
  return map[error.code] || `인증 오류: ${error.message || error.code}`;
}

// 관리자 패널은 역할 확인 후에만 표시됩니다. DB Rules가 실제 보안 경계입니다.
document.querySelectorAll("[data-admin-tab]").forEach(button => {
  button.addEventListener("click", () => renderAdminTab(button.dataset.adminTab));
});
async function requireAdmin() {
  if (!currentUser || !db) throw new Error("로그인이 필요합니다.");
  const role = await get(ref(db, `roles/${currentUser.uid}`));
  if (role.val() !== "admin") throw new Error("관리자 권한이 없습니다.");
}
async function renderAdminTab(tab) {
  const target = $("admin-content");
  target.innerHTML = `<div class="empty-state">불러오는 중…</div>`;
  try {
    await requireAdmin();
    if (tab === "restrictions") {
      target.innerHTML = `
        <div class="admin-block"><h3>UID 차단 및 시간 제한</h3>
          <form id="uid-restriction-form" class="admin-form">
            <label class="field"><span>Firebase UID</span><input name="uid" required></label>
            <label class="field"><span>종류</span><select name="kind"><option value="uidBan">UID BAN</option><option value="uidTimeout">UID Timeout</option></select></label>
            <label class="field"><span>사유</span><input name="reason" required maxlength="200"></label>
            <label class="field"><span>제한 시간(분, Timeout 전용)</span><input name="minutes" type="number" min="1" max="10080" value="60"></label>
            <button class="button button-primary wide">등록</button>
          </form>
          <div id="uid-restriction-list" class="admin-list"></div>
        </div>
        <div class="notice notice-warn">정적 클라이언트 차단은 이 사이트의 UI에서만 적용할 수 있습니다. Firebase 데이터에 대한 실제 UID 강제 차단은 별도의 Rules 조건을 추가해야 하며, 컴시간알리미 직접 요청은 차단하지 못합니다.</div>
        <div class="admin-block"><h3>IP 차단</h3><p class="muted">서버 없이 접속자의 신뢰할 수 있는 IP를 알아낼 수 없으므로 IP BAN/Timeout 입력 및 강제 기능은 제공하지 않습니다.</p></div>`;
      $("uid-restriction-form").addEventListener("submit", saveUidRestriction);
      await loadUidRestrictions();
    } else if (tab === "unavailable") {
      target.innerHTML = `<div class="admin-block"><h3>조회 불가능 학교 관리</h3><form id="unavailable-form" class="admin-form"><label class="field"><span>학교 코드</span><input name="schoolCode" required></label><label class="field"><span>학교명</span><input name="schoolName" required></label><label class="field wide"><span>사유</span><input name="reason" maxlength="200"></label><button class="button button-primary wide">목록에 추가</button></form><div id="unavailable-list" class="admin-list"></div></div>`;
      $("unavailable-form").addEventListener("submit", saveUnavailableSchool);
      await loadUnavailableSchools();
    } else if (tab === "logs") {
      target.innerHTML = `<div class="admin-block"><h3>최근 활동 로그</h3><p class="muted">각 로그 유형에서 최근 100건을 표시합니다.</p><div id="logs-list" class="admin-list"></div></div>`;
      await loadLogs();
    }
  } catch (error) {
    target.innerHTML = `<div class="notice notice-error">${escapeHtml(error.message)}</div>`;
  }
}
async function saveUidRestriction(event) {
  event.preventDefault();
  try {
    await requireAdmin();
    const form = new FormData(event.currentTarget);
    const kind = form.get("kind");
    const uid = String(form.get("uid")).trim();
    const now = Date.now();
    const minutes = Math.min(10080, Math.max(1, Number(form.get("minutes")) || 60));
    const record = {
      uid, reason:String(form.get("reason")).slice(0,200),
      createdAt:now, createdBy:currentUser.uid,
      expiresAt:kind === "uidTimeout" ? now + minutes*60000 : null
    };
    await set(ref(db, `restrictions/${kind}/${uid}`), record);
    await writeLog("admin", {action:"restriction_add", targetUid:uid, restrictionType:kind});
    toast("제한을 등록했습니다.");
    await loadUidRestrictions();
  } catch (error) { toast(error.message); }
}
async function loadUidRestrictions() {
  const list = $("uid-restriction-list");
  if (!list) return;
  const blocks = [];
  for (const kind of ["uidBan","uidTimeout"]) {
    const snap = await get(ref(db, `restrictions/${kind}`));
    snap.forEach(child => {
      const v = child.val();
      blocks.push({kind,key:child.key,...v});
    });
  }
  list.innerHTML = blocks.length ? blocks.map(v => `<div class="admin-row"><span><b>${escapeHtml(v.kind)}</b> · ${escapeHtml(v.key)}<br><span class="muted">${escapeHtml(v.reason || "")}</span></span><button data-remove-restriction="${escapeHtml(v.kind)}:${escapeHtml(v.key)}">해제</button></div>`).join("") : `<p class="muted">등록된 UID 제한이 없습니다.</p>`;
  list.querySelectorAll("[data-remove-restriction]").forEach(btn => btn.addEventListener("click", async () => {
    const [kind,key] = btn.dataset.removeRestriction.split(":");
    await requireAdmin();
    await remove(ref(db, `restrictions/${kind}/${key}`));
    await writeLog("admin", {action:"restriction_remove", targetUid:key, restrictionType:kind});
    await loadUidRestrictions();
  }));
}
async function saveUnavailableSchool(event) {
  event.preventDefault();
  try {
    await requireAdmin();
    const f = new FormData(event.currentTarget);
    const code = String(f.get("schoolCode")).trim();
    await set(ref(db, `unavailableSchools/${code}`), {
      schoolCode:code, schoolName:String(f.get("schoolName")).slice(0,100),
      reason:String(f.get("reason") || "").slice(0,200),
      manuallyBlocked:true, createdAt:Date.now(), createdBy:currentUser.uid
    });
    await writeLog("admin", {action:"unavailable_school_add", schoolCode:code});
    await loadUnavailableSchools();
  } catch (error) { toast(error.message); }
}
async function loadUnavailableSchools() {
  const list = $("unavailable-list");
  if (!list) return;
  const snap = await get(ref(db, "unavailableSchools"));
  const rows = [];
  snap.forEach(child => rows.push({key:child.key,...child.val()}));
  list.innerHTML = rows.length ? rows.map(v => `<div class="admin-row"><span>${escapeHtml(v.schoolName)} · ${escapeHtml(v.key)}</span><button data-remove-school="${escapeHtml(v.key)}">삭제</button></div>`).join("") : `<p class="muted">등록된 학교가 없습니다.</p>`;
  list.querySelectorAll("[data-remove-school]").forEach(btn => btn.addEventListener("click", async () => {
    await requireAdmin();
    await remove(ref(db, `unavailableSchools/${btn.dataset.removeSchool}`));
    await writeLog("admin", {action:"unavailable_school_remove", schoolCode:btn.dataset.removeSchool});
    await loadUnavailableSchools();
  }));
}
async function loadLogs() {
  const list = $("logs-list");
  if (!list) return;
  const types = ["login","signup","logout","changepassword","searchschools","searchtimetable","access","admin"];
  const all = [];
  for (const type of types) {
    const snap = await get(ref(db, `logs/${type}`));
    snap.forEach(child => all.push({type,key:child.key,...child.val()}));
  }
  all.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
  const rows = all.slice(0,100);
  list.innerHTML = rows.length ? rows.map(v => `<div class="admin-row"><span><b>${escapeHtml(v.type)}</b> · ${escapeHtml(v.uid || "익명")}<br><span class="muted">${escapeHtml(new Date(v.timestamp || 0).toLocaleString("ko-KR"))} · ${escapeHtml(v.schoolName || v.searchQuery || v.action || "")}</span></span><span>${v.success === false ? "실패" : "기록"}</span></div>`).join("") : `<p class="muted">로그가 없습니다.</p>`;
}

// 기본으로 관리자 첫 탭은 자동 실행하지 않습니다. 사용자가 탭을 눌렀을 때 조회합니다.
