# 🔄 Как применить миграции Prisma

## Вариант 1: Локально (без Docker)

### Шаг 1: Убедитесь, что PostgreSQL запущен

```bash
# Проверьте, что PostgreSQL доступен
psql -U postgres -c "SELECT version();"
```

### Шаг 2: Проверьте .env файл

Убедитесь, что в `.env` указан правильный `DATABASE_URL`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/productivity_bot?schema=public"
```

### Шаг 3: Создайте и примените миграцию

```bash
# В корне проекта
npm run migrate
```

Эта команда:
1. Создаст папку `prisma/migrations/`
2. Сгенерирует SQL миграцию на основе изменений в `schema.prisma`
3. Применит миграцию к базе данных
4. Сгенерирует Prisma Client

**Что произойдет:**
- Prisma спросит имя миграции (например, `add_daily_digest_time`)
- Создастся файл миграции в `prisma/migrations/`
- Миграция применится к БД
- Prisma Client обновится

### Шаг 4: Проверьте результат

```bash
# Откройте Prisma Studio
npm run prisma:studio
```

Или проверьте через psql:

```bash
psql -U postgres -d productivity_bot -c "\d user_settings"
```

Должно появиться поле `daily_digest_time`.

---

## Вариант 2: Через Docker Compose

### Если контейнеры уже запущены:

```bash
# Войти в контейнер бота
docker compose exec bot bash

# В контейнере выполнить:
cd /app
npx prisma migrate dev --name add_daily_digest_time

# Выйти из контейнера
exit
```

### Если контейнеры не запущены:

```bash
# Остановите контейнеры (если запущены)
docker compose down

# Пересоберите и запустите
docker compose up --build
```

**Важно:** В `Dockerfile` используется `prisma db push` как fallback, но лучше создать миграцию.

---

## Вариант 3: Создать миграцию вручную

Если хотите больше контроля:

```bash
# 1. Создать миграцию без применения
npx prisma migrate dev --create-only --name add_daily_digest_time

# 2. Проверить SQL файл в prisma/migrations/
# (можно отредактировать при необходимости)

# 3. Применить миграцию
npx prisma migrate deploy
```

---

## Что делать, если миграция не применяется

### Ошибка: "Database is not empty"

Если в БД уже есть данные, но нет миграций:

```bash
# Создать baseline миграцию
npx prisma migrate resolve --applied <имя_миграции>

# Или использовать db push (только для разработки!)
npx prisma db push
```

### Ошибка: "Migration failed"

```bash
# Посмотреть статус миграций
npx prisma migrate status

# Откатить последнюю миграцию (если нужно)
npx prisma migrate resolve --rolled-back <имя_миграции>

# Попробовать снова
npm run migrate
```

### Ошибка: "Can't reach database"

1. Проверьте, что PostgreSQL запущен
2. Проверьте `DATABASE_URL` в `.env`
3. Проверьте, что порт 5432 доступен

---

## Проверка после миграции

### 1. Через Prisma Studio

```bash
npm run prisma:studio
```

Откройте таблицу `user_settings` и проверьте наличие поля `dailyDigestTime`.

### 2. Через SQL

```bash
# Локально
psql -U postgres -d productivity_bot -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_settings';"

# Docker
docker compose exec db psql -U postgres -d productivity_bot -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_settings';"
```

Должно быть поле `daily_digest_time` типа `character varying`.

### 3. Через код

```bash
# Запустите бота и проверьте настройки
# В настройках должно показываться время дайджеста
```

---

## Рекомендуемый процесс

### Для разработки:

```bash
# 1. Измените schema.prisma
# 2. Создайте миграцию
npm run migrate

# 3. Проверьте через Prisma Studio
npm run prisma:studio
```

### Для продакшена:

```bash
# 1. Создайте миграцию локально
npm run migrate

# 2. Закоммитьте файлы миграций в Git
git add prisma/migrations/
git commit -m "Add dailyDigestTime field"

# 3. В продакшене примените миграции
npm run migrate:deploy
```

---

## Важные команды

```bash
# Создать и применить миграцию
npm run migrate

# Только применить существующие миграции (в продакшене)
npm run migrate:deploy

# Сгенерировать Prisma Client
npm run prisma:generate

# Посмотреть статус миграций
npx prisma migrate status

# Открыть Prisma Studio
npm run prisma:studio
```

---

## Что будет создано

После `npm run migrate` создастся:

```
prisma/
├── migrations/
│   └── YYYYMMDDHHMMSS_add_daily_digest_time/
│       └── migration.sql    # SQL для добавления поля
└── schema.prisma
```

Файл `migration.sql` будет содержать что-то вроде:

```sql
-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "daily_digest_time" TEXT NOT NULL DEFAULT '09:00';
```

---

## Быстрая команда

Если используете Docker и хотите быстро применить:

```bash
docker compose exec bot npx prisma migrate dev --name add_daily_digest_time
```

Или локально:

```bash
npm run migrate
```

Введите имя миграции (например, `add_daily_digest_time`) и готово! ✅

