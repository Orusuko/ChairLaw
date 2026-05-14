@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
title Generador de Horarios — Terminal

set PYEXE=C:\Users\Orusuko\AppData\Local\Programs\Python\Python313\python.exe

if not exist "%PYEXE%" (
    echo Usando python del PATH...
    set PYEXE=python
)

"%PYEXE%" "%~dp0horarios.py"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Revisa que tengas Python y la libreria rich instalada.
    echo Ejecuta: pip install rich
    pause
)
