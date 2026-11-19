# 학교 시간표 조회 - 완전 정적 버전

## 파일 구성
- `index.html`: 화면 구조 및 CDN 로딩
- `style.css`: 반응형 디자인
- `app.js`: Firebase 인증, 학교 검색 UI, 시간표 렌더링, 관리자 화면 및 로그
- `python.js`: Pyodide 초기화 및 pycomcigan 호출
- `firebase.js`: 기존 Firebase 프로젝트 설정
- `firebase-rules.json`: RTDB 보안 규칙 초안

## 반드시 알아야 할 구현 한계

### 1. pycomcigan 브라우저 호환성은 아직 실환경 통과로 확인되지 않았습니다
현재 확인한 pycomcigan 1.4.5 소스에는 다음 요소가 있습니다.
- `pycryptodomex >=3.23,<4` 의존성
- `Cryptodome.Cipher.AES` 및 `Cryptodome.Util.Padding` 사용
- `urllib.request.urlopen()` 네트워크 요청
- `COMCIGAN_URL = 'http://comci.net:4082'`

Pyodide micropip은 순수 Python wheel 또는 Pyodide용 wasm wheel을 설치할 수 있습니다. 네이티브 확장 패키지는 Pyodide용 빌드가 없으면 설치할 수 없습니다. 따라서 pycryptodomex가 현재 Pyodide 환경에서 호환되는 wheel로 제공되는지 확인되지 않은 상태에서 pycomcigan 설치가 성공한다고 단정할 수 없습니다.

또한 GitHub Pages는 HTTPS입니다. pycomcigan 소스가 사용하는 `http://comci.net:4082` 요청은 HTTPS 페이지에서 Mixed Content 정책에 의해 차단될 수 있습니다. 설령 Python 패키지가 설치되어도 컴시간 서버 통신이 실패할 수 있습니다. 컴시간 서버가 HTTPS 엔드포인트를 공식적으로 제공하고 CORS를 허용하는지도 별도로 확인해야 합니다.

**따라서 현재 구현은 브라우저에서 실제 설치/통신을 시도하고 실패 원인을 표시하는 검증 가능한 테스트 구현입니다. 실제 학교 데이터가 정상 반환되는지 확인하기 전에는 호환 성공으로 간주하지 않습니다.**

### 2. 라이브러리 주차 제한
현재 pycomcigan `TimeTable` 생성자의 `week_num`은 0(이번 주), 1(다음 주)만 허용합니다. 임의의 과거/미래 주차는 이 라이브러리 API만으로 제공할 수 없습니다.

### 3. 완전 정적 사이트의 보안 한계
서버가 없으므로 다음은 완전하게 보장할 수 없습니다.
- 접속 IP의 신뢰성 있는 수집 및 IP BAN/Timeout 강제
- 클라이언트에서 생성한 로그의 위조 방지
- 브라우저에서 검사하는 UID/학교/학급 제한의 우회 방지
- Firebase를 통하지 않고 컴시간 서버로 직접 보내는 요청의 차단

현재 버전은 IP를 수집하지 않습니다. 임의의 외부 IP 확인 서비스를 자동으로 호출하지 않습니다. UID BAN은 관리자 화면에서 DB에 기록할 수 있지만, Firebase Rules에 UID 제한 조건을 적용하는 것과 컴시간 서버 직접 요청 차단은 별개의 문제입니다.

### 4. Firebase 설정
`firebase.js`에 기존 프로젝트의 웹 앱 설정을 입력하세요. Realtime Database URL은 Firebase 콘솔에서 확인한 정확한 URL을 사용해야 합니다. 별도 Firebase 프로젝트를 만들 필요는 없습니다.

Firebase Authentication에서 이메일/비밀번호 로그인을 활성화해야 합니다. 기존 `roles/{uid}` 구조에서 관리자 UID의 값은 `admin`이어야 합니다.

### 5. 보안 규칙 적용 전 확인
`firebase-rules.json`은 이 사이트의 경로를 위한 시작점입니다. 기존 사이트에서 이미 사용하는 `roles`, `logs`, `restrictions`, `unavailableSchools` 경로가 있다면 기존 규칙과 병합하기 전에 반드시 백업하고 충돌을 검토하세요. RTDB 규칙은 전체 JSON을 덮어쓰는 방식으로 게시되므로 기존 서비스 규칙을 보존해야 합니다.

현재 규칙은 사용자의 본인 로그 생성만 허용하는 기본안입니다. 클라이언트 로그는 위조 방지된 감사 로그가 아닙니다. 관리자 로그는 관리자 UID만 생성하도록 되어 있습니다.

### 6. 반 선택
UI는 1~20반을 선택지로 표시하지만, 실제 존재하는 학급인지 여부는 조회 시 라이브러리 데이터로 검사합니다. 잘못된 학년/반이면 오류 안내가 표시됩니다.

## 배포
1. `firebase.js`를 기존 Firebase 프로젝트 값으로 수정합니다.
2. Firebase Authentication 이메일/비밀번호 제공업체를 활성화합니다.
3. 기존 Realtime Database 규칙을 백업합니다.
4. 새 경로 규칙을 기존 규칙과 병합하고 Firebase Rules 시뮬레이터에서 테스트합니다.
5. 이 폴더의 파일을 GitHub 저장소의 `timetable/` 경로에 업로드합니다.
6. GitHub Pages에서 해당 저장소를 배포합니다.
7. `https://<도메인>/timetable/`에서 테스트합니다. `timetable` 폴더가 Pages 루트라면 경로는 다를 수 있습니다.
8. 브라우저 개발자 도구 Console/Network에서 Pyodide, micropip, pycomcigan 설치 및 CORS/Mixed Content 오류를 확인합니다.

## 현재 미구현 또는 제한된 기능
- IP BAN / IP Timeout: 서버 없이 신뢰성 있게 구현 불가
- 특정 날짜/학교/학급 차단: 관리자 UI 및 규칙/검증의 추가 설계 필요
- 로그 페이지네이션: 현재 최근 100건 단순 표시
- 비밀번호 변경: Firebase 재인증 절차를 포함한 전용 화면은 후속 구현 필요
- 임의 주차 조회: pycomcigan의 0/1 제한
- 실제 브라우저 통신 성공: 배포 환경에서 테스트 필요
