/*
 * Pyodide + pycomcigan 브라우저 어댑터
 *
 * 중요:
 * - 런타임은 한 번만 초기화합니다.
 * - pycomcigan 1.4.5는 pycryptodomex에 의존합니다.
 * - pycomcigan의 현재 소스는 http://comci.net:4082 로 요청합니다.
 *   HTTPS GitHub Pages에서 HTTP 요청은 Mixed Content로 차단될 수 있습니다.
 * - 따라서 설치 성공만으로 실시간 시간표 조회가 가능하다고 판단하지 않습니다.
 */
const PYODIDE_VERSION = "0.27.7";
const PYCOMCIGAN_VERSION = "1.4.5";

let runtimePromise = null;
let pyodide = null;
let packageReady = false;

const PYTHON_BRIDGE = `
import json
from pycomcigan import TimeTable, get_school_code

def js_search_schools(query):
    rows = get_school_code(query)
    return json.dumps(rows, ensure_ascii=False)

def js_get_timetable(school_name, local_code, school_code, week_num):
    table = TimeTable(
        school_name,
        local_code=int(local_code),
        school_code=int(school_code),
        week_num=int(week_num)
    )
    days = []
    # pycomcigan timetable: grade -> class -> weekday -> period
    for day_index, day in enumerate(table.timetable[int(_grade)][int(_class)]):
        if day_index == 0:
            continue
        lessons = []
        for item in day:
            lessons.append({
                "period": int(item.period),
                "subject": str(item.subject or ""),
                "teacher": str(item.teacher or ""),
                "replaced": bool(item.replaced),
                "original": str(item.original) if item.original else ""
            })
        days.append(lessons)
    return json.dumps({
        "schoolName": table.school_name,
        "regionName": table.local_name,
        "schoolYear": str(table.school_year),
        "updateDate": str(table.update_date),
        "homeroom": str(table.homeroom(int(_grade), int(_class)) or ""),
        "days": days,
        "gradeCount": max(0, len(table.timetable)-1),
        "classCount": max(0, len(table.timetable[int(_grade)])-1)
    }, ensure_ascii=False)
`;

export function getPythonStatus() {
  return { initialized: !!pyodide, packageReady };
}

export async function initializePython(onProgress = () => {}) {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    onProgress("브라우저 Python 런타임 다운로드 중…");
    if (typeof loadPyodide !== "function") {
      throw new Error("Pyodide 스크립트를 불러오지 못했습니다. 네트워크 또는 CDN 접근을 확인하세요.");
    }
    pyodide = await loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
    });
    onProgress("Python 패키지 설치 도구 준비 중…");
    await pyodide.loadPackage("micropip");
    onProgress(`pycomcigan ${PYCOMCIGAN_VERSION} 설치 가능 여부 확인 중…`);
    const micropip = pyodide.pyimport("micropip");
    try {
      await micropip.install(`pycomcigan==${PYCOMCIGAN_VERSION}`);
      pyodide.runPython(PYTHON_BRIDGE);
      // 실제 import 성공만 확인. 컴시간 서버 통신 성공을 의미하지는 않습니다.
      pyodide.runPython("import pycomcigan; print('pycomcigan import OK')");
      packageReady = true;
      onProgress("Python 및 pycomcigan 설치 완료. 실제 통신은 검색 단계에서 검증합니다.");
      return pyodide;
    } catch (error) {
      packageReady = false;
      const message = String(error?.message || error);
      throw new Error(
        "pycomcigan 설치 또는 의존성 로딩에 실패했습니다. " +
        "현재 패키지는 pycryptodomex(네이티브 암호화 구현)에 의존하므로 " +
        "Pyodide용 호환 wheel이 없으면 브라우저 설치가 불가능합니다. " + message
      );
    }
  })().catch(error => {
    // 실패한 Promise를 캐시하지 않아 재시도 버튼으로 다시 시도할 수 있습니다.
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

export async function searchSchools(query, onProgress) {
  const runtime = await initializePython(onProgress);
  if (!packageReady) throw new Error("pycomcigan 패키지가 준비되지 않았습니다.");
  runtime.globals.set("_school_query", query);
  try {
    const result = runtime.runPython("js_search_schools(_school_query)");
    return JSON.parse(result);
  } finally {
    runtime.globals.delete("_school_query");
  }
}

export async function getTimetable({schoolName, localCode, schoolCode, grade, classNo, weekNum}, onProgress) {
  const runtime = await initializePython(onProgress);
  if (!packageReady) throw new Error("pycomcigan 패키지가 준비되지 않았습니다.");
  runtime.globals.set("_school_name", schoolName);
  runtime.globals.set("_local_code", Number(localCode));
  runtime.globals.set("_school_code", Number(schoolCode));
  runtime.globals.set("_week_num", Number(weekNum));
  runtime.globals.set("_grade", Number(grade));
  runtime.globals.set("_class", Number(classNo));
  try {
    const source = `
def _run_table():
    table = TimeTable(_school_name, local_code=_local_code, school_code=_school_code, week_num=_week_num)
    days = []
    for day_index, day in enumerate(table.timetable[int(_grade)][int(_class)]):
        if day_index == 0: continue
        lessons = []
        for item in day:
            lessons.append({
                "period": int(item.period),
                "subject": str(item.subject or ""),
                "teacher": str(item.teacher or ""),
                "replaced": bool(item.replaced),
                "original": str(item.original) if item.original else ""
            })
        days.append(lessons)
    return json.dumps({
        "schoolName": table.school_name,
        "regionName": table.local_name,
        "schoolYear": str(table.school_year),
        "updateDate": str(table.update_date),
        "homeroom": str(table.homeroom(int(_grade), int(_class)) or ""),
        "days": days,
        "gradeCount": max(0, len(table.timetable)-1),
        "classCount": max(0, len(table.timetable[int(_grade)])-1)
    }, ensure_ascii=False)
_run_table()
`;
    return JSON.parse(runtime.runPython(source));
  } finally {
    ["_school_name","_local_code","_school_code","_week_num","_grade","_class"].forEach(k => runtime.globals.delete(k));
  }
}
