#!/bin/sh
set -e

echo "🚀 Initializing database..."

cd /app

echo "⏳ Waiting for database to be ready..."
sleep 3

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "📦 Found migrations, deploying..."
  npx prisma migrate deploy || {
    echo "⚠️  Migration deploy failed, trying db push..."
    npx prisma db push --accept-data-loss --skip-generate
  }
else
  echo "🔄 No migrations found, using db push..."
  npx prisma db push --accept-data-loss --skip-generate || {
    echo "❌ Failed to push schema to database!"
    exit 1
  }
fi

echo "✅ Database schema applied successfully!"

echo "🤖 Starting bot..."
exec npm start

