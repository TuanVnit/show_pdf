@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" exit /b 1

set INPUTPDF=%~1
set OUTPUTFOLDER=%~dp1%~n1
if not exist "%OUTPUTFOLDER%" mkdir "%OUTPUTFOLDER%"

REM ==== Tool 1: CutPDF_Tool.exe ====
dist\PDF_Toolkit\CutPDF_Tool.exe "%INPUTPDF%" > "%OUTPUTFOLDER%\CutPDF.log" 2>&1
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM ==== Tool 2: CutTable_Tool.exe ====
dist\PDF_Toolkit\CutTable_Tool.exe "%OUTPUTFOLDER%" > "%OUTPUTFOLDER%\CutTable.log" 2>&1
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM ==== Tool 3: CutImage_Tool.exe ====
dist\PDF_Toolkit\CutImage_Tool.exe "%OUTPUTFOLDER%" > "%OUTPUTFOLDER%\CutImage.log" 2>&1
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM ==== Tool 4: ExportWord_Tool.exe ====
dist\PDF_Toolkit\ExportWord_Tool.exe "%OUTPUTFOLDER%" > "%OUTPUTFOLDER%\ExportWord.log" 2>&1
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM ==== Tool 5: CopyTable.exe ====
dist\ExtractTableTool\CopyTable.exe "%OUTPUTFOLDER%" > "%OUTPUTFOLDER%\CopyTable.log" 2>&1
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM ==== Viết status.txt với value=2 ====
echo 2 > "%OUTPUTFOLDER%\status.txt"

exit /b 0
