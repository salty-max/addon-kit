@echo off
rem Installs every addon zip beside this script into one game's AddOns folder:
rem _classic_era_ (Classic Era) or _classic_beta_ (Forever's beta). Its name
rem picks the game: copied as "Install Classic Era.cmd" and "Install Forever
rem beta.cmd", a double-click is enough (else it asks, or takes the folder's
rem name as its argument: install.cmd _classic_era_).
rem
rem Each zip's folders are removed from AddOns first, so no file of an older
rem version stays behind. Yonder's FieldJournal handover goes to Classic Era
rem only: on Forever, a FieldJournal folder is Field Journal: Forever's, left
rem alone. The game's folder is found where Battle.net puts it, else asked once
rem and kept in wow-folder.txt beside this script. Unzips with Windows' own
rem tar.exe (Windows 10 1803 and later): no PowerShell.
setlocal EnableExtensions EnableDelayedExpansion
set "HERE=%~dp0"
set "FLAVOR=%~1"
rem the script's own name, else ask
if not defined FLAVOR echo %~n0| findstr /i "forever beta" >nul && set "FLAVOR=_classic_beta_"
if not defined FLAVOR echo %~n0| findstr /i "era" >nul && set "FLAVOR=_classic_era_"
if not defined FLAVOR (
  echo Which game?
  echo   1  Classic Era   [_classic_era_]
  echo   2  Forever beta  [_classic_beta_]
  choice /c 12 /n /m "1 or 2: "
  if errorlevel 2 (set "FLAVOR=_classic_beta_") else (set "FLAVOR=_classic_era_")
)

set "TAR=%SystemRoot%\System32\tar.exe"
if not exist "%TAR%" (
  echo This needs tar.exe, part of Windows 10 [1803 and later] and Windows 11.
  goto :end
)

rem the game's folder: the one kept, else where Battle.net installs it, else asked
set "WOW="
if exist "%HERE%wow-folder.txt" set /p WOW=<"%HERE%wow-folder.txt"
if defined WOW if not exist "!WOW!\%FLAVOR%\" set "WOW="
if not defined WOW if exist "%ProgramFiles(x86)%\World of Warcraft\%FLAVOR%\" set "WOW=%ProgramFiles(x86)%\World of Warcraft"
if not defined WOW if exist "%ProgramFiles%\World of Warcraft\%FLAVOR%\" set "WOW=%ProgramFiles%\World of Warcraft"
if not defined WOW if exist "C:\World of Warcraft\%FLAVOR%\" set "WOW=C:\World of Warcraft"
if not defined WOW (
  echo World of Warcraft's folder wasn't found where Battle.net usually puts it.
  set /p "WOW=Paste the folder that holds %FLAVOR%: "
)
set "WOW=!WOW:"=!"
if "!WOW:~-1!"=="\" set "WOW=!WOW:~0,-1!"
if not exist "!WOW!\%FLAVOR%\" (
  echo No %FLAVOR% folder in "!WOW!": is this game installed there?
  goto :end
)
(echo !WOW!)>"%HERE%wow-folder.txt"

set "ADDONS=!WOW!\%FLAVOR%\Interface\AddOns"
if not exist "!ADDONS!\" mkdir "!ADDONS!"
set "SKIP="
if /i "%FLAVOR%"=="_classic_beta_" set "SKIP=FieldJournal"

echo Installing into !ADDONS!
set /a n=0
for %%z in ("%HERE%*.zip") do (
  rem the zip's top folders, each removed once before unzipping
  set "seen=;"
  for /f "usebackq tokens=1 delims=/\" %%d in (`%TAR% -tf "%%~fz"`) do (
    if "!seen:;%%d;=!"=="!seen!" (
      set "seen=!seen!%%d;"
      if /i not "%%d"=="!SKIP!" if not "%%d"==".." if exist "!ADDONS!\%%d\" rmdir /s /q "!ADDONS!\%%d"
    )
  )
  if defined SKIP (
    "%TAR%" -xf "%%~fz" --exclude "!SKIP!" --exclude "!SKIP!/*" -C "!ADDONS!"
  ) else (
    "%TAR%" -xf "%%~fz" -C "!ADDONS!"
  )
  if errorlevel 1 (
    echo   FAILED  %%~nxz
  ) else (
    echo   ok      %%~nz
    set /a n+=1
  )
)
echo.
echo !n! addon zip^(s^) installed. Start the game, or type /reload if it's running.

:end
echo.
pause
endlocal
