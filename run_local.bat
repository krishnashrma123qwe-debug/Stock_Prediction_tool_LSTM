@echo off
echo Starting Stock Prediction Portal locally...

:: 1. Start Django Backend
echo Starting Django Backend...
start "Django Backend" cmd /k "cd stock_prediction_portal && venv\Scripts\activate && python manage.py runserver 8000"

:: 2. Start Celery Worker (Windows requires the 'solo' pool)
echo Starting Celery Worker...
start "Celery Worker" cmd /k "cd stock_prediction_portal && venv\Scripts\activate && celery -A core worker -l info -P solo"

:: 3. Start React Frontend
echo Starting React Frontend...
start "React Frontend" cmd /k "cd frontend && npm install && npm run dev"

echo All services started in separate windows!
echo ----------------------------------------------------
echo IMPORTANT: You need a local Redis instance running on 
echo port 6379 for Celery tasks and caching to work.
echo ----------------------------------------------------
pause
