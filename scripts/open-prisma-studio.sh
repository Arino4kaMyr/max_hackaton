#!/bin/bash

# Скрипт для запуска Prisma Studio в Docker контейнере

echo "🚀 Запускаю Prisma Studio..."
echo "📡 Откройте в браузере: http://localhost:5555"
echo "⏹️  Нажмите Ctrl+C для остановки"
echo ""

docker compose exec bot npx prisma studio --hostname 0.0.0.0 --port 5555 --browser none

