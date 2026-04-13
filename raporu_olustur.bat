@echo off
CHCP 65001 > nul
set SCRIPT_PATH="a:\TOOLS\kodlama\km\PT SİHİRBAZI\proje_rapor_botu.py"

echo Python kütüphaneleri kontrol ediliyor...
pip install openpyxl --user >nul 2>&1

echo Python aranıyor...
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python bulundu, script çalıştırılıyor...
    python %SCRIPT_PATH%
    goto finish
)

py --version >nul 2>&1
if %errorlevel% equ 0 (
    echo 'py' komutu ile çalıştırılıyor...
    py %SCRIPT_PATH%
    goto finish
)

echo.
echo HATA: Python bulunamadı. Lütfen Python'u kurun.
pause
exit

:finish
echo.
echo İşlem tamamlandı.
pause
