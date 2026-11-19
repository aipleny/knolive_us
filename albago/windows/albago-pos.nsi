; ALBAGO 알바고 — 매장 PC(POS)용 Windows 설치 파일
; 빌드: makensis albago-pos.nsi  →  ALBAGO-Setup.exe
; 서버는 설치하지 않습니다. albago.kr(또는 지정한 주소)을 크롬/엣지 앱 창으로 여는 바로가기를 만듭니다.
Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define APP "ALBAGO 알바고"
!define VER "1.0.0"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALBAGO"

Name "${APP}"
OutFile "ALBAGO-Setup.exe"
InstallDir "$LOCALAPPDATA\ALBAGO"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VER}.0"
VIAddVersionKey "ProductName" "ALBAGO"
VIAddVersionKey "FileDescription" "ALBAGO POS Setup"
VIAddVersionKey "FileVersion" "${VER}"
VIAddVersionKey "LegalCopyright" "albago.kr"

!define MUI_ICON "albago.ico"
!define MUI_UNICON "albago.ico"
!define MUI_WELCOMEPAGE_TITLE "${APP} 설치"
!define MUI_WELCOMEPAGE_TEXT "매장 PC(POS)에 ALBAGO 알바고 바로가기를 설치합니다.$\r$\n$\r$\n• 출퇴근 기록부: 알바가 이름과 PIN으로 출근·휴식·퇴근을 기록하는 화면$\r$\n• 사장님: 직원·근무표·급여·소통 관리 화면$\r$\n$\r$\n프로그램은 크롬 또는 엣지 앱 창으로 열리며, 데이터는 ALBAGO 서버에 저장됩니다."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "출퇴근 기록부 열기"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenKiosk

Var ServerUrl
Var UrlField
Var AutoStart
Var AutoStartBox
Var FullScreen
Var FullScreenBox

!insertmacro MUI_PAGE_WELCOME
Page custom OptionsPage OptionsLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  StrCpy $ServerUrl "https://albago.kr"
  StrCpy $AutoStart ${BST_CHECKED}
  StrCpy $FullScreen ${BST_UNCHECKED}
  ; 다시 설치할 때는 이전 주소 유지
  ReadRegStr $0 HKCU "Software\ALBAGO" "ServerUrl"
  ${If} $0 != ""
    StrCpy $ServerUrl $0
  ${EndIf}
FunctionEnd

Function OptionsPage
  !insertmacro MUI_HEADER_TEXT "설정" "ALBAGO 서버 주소와 실행 방식을 정하세요."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 12u "서버 주소 (보통 그대로 두세요)"
  ${NSD_CreateText} 0 14u 100% 13u "$ServerUrl"
  Pop $UrlField
  ${NSD_CreateLabel} 0 32u 100% 20u "매장 안에 서버를 따로 둔 경우에만 바꿉니다. 예: http://192.168.0.10:8080"
  ${NSD_CreateCheckbox} 0 58u 100% 12u "Windows 시작 시 출퇴근 기록부 자동 실행"
  Pop $AutoStartBox
  ${NSD_SetState} $AutoStartBox $AutoStart
  ${NSD_CreateCheckbox} 0 74u 100% 12u "출퇴근 기록부를 전체 화면으로 열기 (나가기: F11 또는 Alt+F4)"
  Pop $FullScreenBox
  ${NSD_SetState} $FullScreenBox $FullScreen
  nsDialogs::Show
FunctionEnd

Function OptionsLeave
  ${NSD_GetText} $UrlField $ServerUrl
  ${NSD_GetState} $AutoStartBox $AutoStart
  ${NSD_GetState} $FullScreenBox $FullScreen
  StrCpy $0 $ServerUrl 7
  StrCpy $1 $ServerUrl 8
  ${If} $0 != "http://"
  ${AndIf} $1 != "https://"
    MessageBox MB_ICONEXCLAMATION "서버 주소는 http:// 또는 https:// 로 시작해야 합니다."
    Abort
  ${EndIf}
  ; 끝의 / 제거
  StrCpy $2 $ServerUrl 1 -1
  ${If} $2 == "/"
    StrCpy $ServerUrl $ServerUrl -1
  ${EndIf}
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File "albago-launch.cmd"
  File "albago.ico"
  WriteRegStr HKCU "Software\ALBAGO" "ServerUrl" "$ServerUrl"

  ${If} $FullScreen == ${BST_CHECKED}
    StrCpy $3 "full"
  ${Else}
    StrCpy $3 "max"
  ${EndIf}
  CreateDirectory "$SMPROGRAMS\ALBAGO"
  CreateShortCut "$DESKTOP\ALBAGO 출퇴근 기록부.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/kiosk" $3"' "$INSTDIR\albago.ico" 0 SW_SHOWMINIMIZED "" "알바 출퇴근 기록부"
  CreateShortCut "$DESKTOP\ALBAGO 사장님.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/owner" max"' "$INSTDIR\albago.ico" 0 SW_SHOWMINIMIZED "" "사장님 관리 화면"
  CreateShortCut "$SMPROGRAMS\ALBAGO\출퇴근 기록부.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/kiosk" $3"' "$INSTDIR\albago.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\ALBAGO\사장님.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/owner" max"' "$INSTDIR\albago.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\ALBAGO\ALBAGO 제거.lnk" "$INSTDIR\uninstall.exe"
  ${If} $AutoStart == ${BST_CHECKED}
    CreateShortCut "$SMSTARTUP\ALBAGO 출퇴근 기록부.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/kiosk" $3"' "$INSTDIR\albago.ico" 0 SW_SHOWMINIMIZED
  ${Else}
    Delete "$SMSTARTUP\ALBAGO 출퇴근 기록부.lnk"
  ${EndIf}

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "albago.kr"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\albago.ico"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
SectionEnd

Function OpenKiosk
  ${If} $FullScreen == ${BST_CHECKED}
    Exec '"$SYSDIR\cmd.exe" /c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/kiosk" full"'
  ${Else}
    Exec '"$SYSDIR\cmd.exe" /c ""$INSTDIR\albago-launch.cmd" "$ServerUrl/kiosk" max"'
  ${EndIf}
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\ALBAGO 출퇴근 기록부.lnk"
  Delete "$DESKTOP\ALBAGO 사장님.lnk"
  Delete "$SMSTARTUP\ALBAGO 출퇴근 기록부.lnk"
  Delete "$SMPROGRAMS\ALBAGO\출퇴근 기록부.lnk"
  Delete "$SMPROGRAMS\ALBAGO\사장님.lnk"
  Delete "$SMPROGRAMS\ALBAGO\ALBAGO 제거.lnk"
  RMDir "$SMPROGRAMS\ALBAGO"
  Delete "$INSTDIR\albago-launch.cmd"
  Delete "$INSTDIR\albago.ico"
  Delete "$INSTDIR\uninstall.exe"
  ; 브라우저 프로필(로그인·기록부 등록 정보)은 남겨 둡니다: $LOCALAPPDATA\ALBAGO\profile
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\ALBAGO"
SectionEnd
