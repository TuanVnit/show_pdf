@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
dist\PDF_Toolkit\CropPDF_Tool.exe %*