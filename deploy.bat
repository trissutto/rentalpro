@echo off
cd /d "%~dp0"
echo Fazendo deploy...
git add -A
git commit -m "update"
git push origin main
echo Pronto! Aguarde o build no GitHub Actions (~2 min).
pause
