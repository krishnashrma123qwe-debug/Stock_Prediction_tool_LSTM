#!/bin/bash
set -e

echo "⏳ Waiting for database..."
python -c "
import time, os, sys
import dj_database_url

db = dj_database_url.config(default='sqlite:///db.sqlite3')
if db['ENGINE'] == 'django.db.backends.sqlite3':
    print('Using SQLite — no wait needed')
    sys.exit(0)

# Wait for PostgreSQL
import socket
host = db.get('HOST', 'localhost')
port = int(db.get('PORT', 5432))
for i in range(30):
    try:
        sock = socket.create_connection((host, port), timeout=2)
        sock.close()
        print(f'✅ Database is ready at {host}:{port}')
        sys.exit(0)
    except (OSError, socket.timeout):
        print(f'  Attempt {i+1}/30 — waiting...')
        time.sleep(1)
print('❌ Database not reachable after 30s')
sys.exit(1)
"

echo "🔄 Running migrations..."
python manage.py migrate --noinput

echo "🚀 Starting server..."
exec "$@"
