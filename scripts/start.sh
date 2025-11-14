#!/bin/bash

# Скрипт для быстрого запуска проекта

echo "🚀 Запуск MAX Productivity Bot"
echo ""

# Проверяем наличие .env
if [ ! -f .env ]; then
    echo "❌ Файл .env не найден!"
    echo "Создайте файл .env на основе примера:"
    echo ""
    echo "DATABASE_URL=\"postgresql://postgres:postgres@localhost:5432/productivity_bot?schema=public\""
    echo "BOT_TOKEN=ваш_токен_здесь"
    echo "TIMEZONE=Europe/Moscow"
    echo ""
    exit 1
fi

# Проверяем, какой вариант запуска выбран
if command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
    echo "📦 Запуск через Docker Compose..."
    echo ""
    
    # Проверяем, запущен ли Docker
    if ! docker info &> /dev/null; then
        echo "❌ Docker не запущен! Запустите Docker Desktop и попробуйте снова."
        exit 1
    fi
    
    # Генерируем Prisma Client
    echo "🔧 Генерация Prisma Client..."
    npm run prisma:generate
    
    # Запускаем через Docker Compose
    echo "🐳 Запуск контейнеров..."
    docker compose up --build
else
    echo "💻 Локальный запуск..."
    echo ""
    
    # Проверяем наличие PostgreSQL
    if ! command -v psql &> /dev/null; then
        echo "⚠️  PostgreSQL не найден. Установите PostgreSQL или используйте Docker Compose."
        exit 1
    fi
    
    # Генерируем Prisma Client
    echo "🔧 Генерация Prisma Client..."
    npm run prisma:generate
    
    # Применяем миграции
    echo "📊 Применение миграций..."
    npm run migrate
    
    # Запускаем бота
    echo "🤖 Запуск бота..."
    cd bot
    npm start
fi

