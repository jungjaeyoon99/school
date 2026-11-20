# 학교 시간표 정적 웹앱

## 구성
- `index.html`: 화면과 CDN 로딩
- `style.css`: 반응형 디자인
- `app.js`: Firebase 로그인, 학교 검색, 시간표 UI, 관리자 도구
- `python.js`: Pyodide와 pycomcigan, urllib-fetch 브리지
- `firebase.js`: 기존 Firebase 프로젝트 설정
- `firebase-rules.json`: 앱 경로에 대한 규칙 예시

## 배포
1. `firebase.js`의 `apiKey`를 Firebase 콘솔의 실제 Web API Key로 교체합니다.
2. Firebase Authentication에서 이메일/비밀번호 로그인 제공업체를 켜고 GitHub Pages 도메인을 승인 도메인에 추가합니다.
3. 기존 RTDB 규칙을 백업하고 이 파일의 규칙을 기존 규칙과 병합합니다. 기존 규칙 전체를 덮어쓰지 마세요.
4. 일곱 파일을 GitHub 저장소에 올리고 Pages로 배포합니다.

관리자 역할은 `roles/{uid}` 값이 문자열 `admin`일 때입니다. 차단 계정은 `blockedUsers/{uid}`에 boolean `true`로 저장됩니다. 로그인 기록은 `timetableLogs/{uid}/{logId}`에 저장됩니다.

## 매우 중요한 Comcigan 연결 제한
현재 pycomcigan 1.4.1의 Comcigan 원본 요청은 `http://comci.net:4082` 주소를 사용합니다. GitHub Pages는 HTTPS이므로 브라우저에서 HTTP 요청을 차단하는 혼합 콘텐츠 문제가 발생할 수 있고, 원격 서버가 CORS를 허용하지 않으면 fetch도 실패합니다.

`firebase.js`의 `COMCIGAN_FETCH_RELAY`에는 별도의 HTTPS·CORS 중계 서비스 주소를 설정할 수 있습니다. 이 앱은 중계 서버에 POST JSON `{url, method, headers, bodyBase64}`를 보내고, 중계 서버가 `{status, bodyBase64}` JSON으로 답하는 형식을 기대합니다. **중계 서버는 이 ZIP에 포함되어 있지 않습니다.** 따라서 중계 주소가 없으면 HTTPS 브라우저에서 실시간 Comcigan 조회가 차단될 수 있습니다. 순수 정적 HTML/JS만으로 브라우저 보안 제한을 우회할 수는 없습니다.

## Pyodide / pycomcigan
Pyodide 0.29.5를 사용하고 `pycomcigan==1.4.1`을 `deps=False`로 설치합니다. pycomcigan 내부에서 사용하는 `requests`는 Pyodide 배포 패키지로 별도 로드합니다. Pyodide의 `Crypto`를 `Cryptodome` 이름으로 연결합니다. Python의 `urllib.request.urlopen`을 브라우저 fetch 브리지로 대체합니다. 학교 검색 결과는 `[지역 코드, 지역명, 학교명, 학교 코드]` 형식입니다.

## IP 및 로그 관련 한계
이 버전은 IP 주소를 수집하지 않습니다. 정적 브라우저 코드만으로 공인 IP를 신뢰성 있게 확인하거나 IP 차단을 강제할 수 없습니다. UID 차단은 Firebase DB에 저장되며, 실질적인 접근 제어는 RTDB 규칙에서도 검사해야 합니다. 클라이언트 로그는 조작 가능하므로 감사용 보안 로그로 간주하면 안 됩니다.

## 보안
- Web API Key만으로 DB가 보호되는 것은 아닙니다. RTDB 규칙을 반드시 적용하세요.
- 관리자 UI 숨김은 보안 기능이 아닙니다.
- 이 규칙 JSON은 기존 DB 규칙과 병합해야 하며 전체 덮어쓰기를 권장하지 않습니다.

참고: https://github.com/hegelty/pycomcigan · https://pyodide.org/ · https://firebase.google.com/docs/database/security
