@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
where py >nul 2>nul
if not errorlevel 1 (
    set "helper_python=py -3"
) else (
    where python >nul 2>nul
    if errorlevel 1 goto missing_python
    set "helper_python=python"
)
%helper_python% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if errorlevel 1 goto missing_python
echo Copy the connection key below into the Tampermonkey attachment menu:
%helper_python% "%~dp0helper.py" --show-key %*
if errorlevel 1 goto failed
%helper_python% "%~dp0helper.py" %*
if errorlevel 1 goto failed
exit /b 0

:missing_python
echo Python 3.10 or newer is required. Install it from https://www.python.org/downloads/windows/
echo Enable the Python launcher or add Python to PATH, then run this file again.
pause
exit /b 1

:failed
echo The attachment helper stopped with an error. See the message above.
pause
exit /b 1
