@echo off
echo Avvio del Registro Riconciliazione...
echo.

echo Avvio del server proxy...
start "Server Proxy" cmd /k "python server.py"

timeout /t 3 /nobreak > nul

echo Avvio dell'applicazione frontend...
start "Frontend" cmd /k "npm run dev"

echo.
echo Applicazione in avvio...
echo Server proxy: http://localhost:8787
echo Applicazione frontend: http://localhost:5173
echo.
echo Premi un tasto per chiudere questa finestra...
pause > nul