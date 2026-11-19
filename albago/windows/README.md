# ALBAGO 알바고 — 매장 PC(POS)용 Windows 설치 파일

`ALBAGO-Setup.exe` 를 매장 PC에서 실행하면 됩니다. 관리자 권한은 필요 없습니다.

## 설치되는 것
- **바탕화면·시작 메뉴 바로가기**
  - **ALBAGO 출퇴근 기록부**: 알바가 이름과 PIN으로 출근·휴식·퇴근을 기록하는 화면
  - **ALBAGO 사장님**: 직원·근무표·급여·소통 관리 화면
- **(선택) Windows를 켤 때 출퇴근 기록부 자동 실행, 전체 화면 모드**
- **제어판 → 프로그램 제거**에 "ALBAGO 알바고"가 등록됩니다.

서버나 데이터베이스는 설치하지 않습니다. 바로가기는 ALBAGO 서버(기본 `https://albago.kr`)를 크롬 앱 창으로 엽니다. 크롬이 없으면 엣지, 둘 다 없으면 기본 브라우저를 씁니다.
로그인 정보와 "출퇴근 기록부 등록"은 `%LOCALAPPDATA%\ALBAGO\profile` 에 따로 저장되어, 평소 쓰는 브라우저와 섞이지 않습니다.

## 처음 쓸 때
1. **ALBAGO 사장님** 바로가기를 열어 로그인합니다(이메일 인증번호).
2. 위쪽 **[출퇴근 기록부]**를 누르면 이 PC가 매장 기록부로 등록되고, 그 화면으로 바뀝니다.
3. 다음부터는 **ALBAGO 출퇴근 기록부** 바로가기만 열면 됩니다.

## 다시 만들기 (개발자)
```bash
sudo apt-get install nsis      # 또는 Windows용 NSIS 3
cd albago/windows
makensis albago-pos.nsi        # → ALBAGO-Setup.exe
```
`albago-pos.nsi` 는 UTF-8(BOM) 파일이어야 한글이 깨지지 않습니다.
배포 전에는 코드 서명 인증서로 서명하는 것을 권장합니다. 서명하지 않으면 Windows SmartScreen이 "알 수 없는 게시자" 경고를 띄웁니다.
