@echo off
cd %~dp0

setlocal

echo %date% %time% start
set PYTHONPATH=.\modules

set BOOKS_DIR=%~1
set ESUSER=%~2
set ESPASSWORD=%~3
set FROM_DATE=%~4

python indexer.py -d %BOOKS_DIR% --xpdfrc .\xpdfrc --esuser %ESUSER% -P %ESPASSWORD% -f %FROM_DATE%

echo %date% %time% finished

endlocal