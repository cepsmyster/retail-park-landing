@echo off
rem Retail Park: sun through brick. The page uses ES modules and loads a model, so it needs http, not file://.
rem This serves the folder on localhost and opens it. Close the window to stop.
cd /d "%~dp0"
start "" http://localhost:8377/index.html
python -m http.server 8377 --bind 127.0.0.1
