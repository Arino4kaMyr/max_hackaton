# 🔍 Как проверить данные в базе данных

## Способ 1: Prisma Studio (рекомендуется) ⭐

Самый простой и удобный способ - визуальный редактор БД.

### Если используете Docker:

```bash
# Запустите Prisma Studio в контейнере (в фоне)
docker compose exec -d bot npx prisma studio --hostname 0.0.0.0 --port 5555 --browser none

# Или запустите в текущем терминале (Ctrl+C для остановки)
docker compose exec bot npx prisma studio --hostname 0.0.0.0 --port 5555 --browser none
```

Затем откройте в браузере: `http://localhost:5555`

**Альтернатива** - запустить локально (если у вас есть доступ к БД):
```bash
npm run prisma:studio
```

Откроется браузер на `http://localhost:5555` - там вы увидите все таблицы и данные.

### Если запускаете локально:

```bash
# В корне проекта
npm run prisma:studio
```

---

## Способ 2: psql (командная строка)

### Через Docker:

```bash
# Подключитесь к БД в контейнере
docker compose exec db psql -U postgres -d productivity_bot
```

### Локально (если PostgreSQL установлен):

```bash
psql -U postgres -d productivity_bot
```

### Полезные команды в psql:

```sql
-- Посмотреть все таблицы
\dt

-- Посмотреть структуру таблицы
\d users
\d tasks
\d events
\d user_settings
\d pomodoro_sessions

-- Посмотреть все пользователи
SELECT * FROM users;

-- Посмотреть все задачи
SELECT * FROM tasks;

-- Посмотреть все события
SELECT * FROM events;

-- Посмотреть настройки пользователей
SELECT * FROM user_settings;

-- Посмотреть Pomodoro сессии
SELECT * FROM pomodoro_sessions;

-- Посчитать количество записей
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM tasks;
SELECT COUNT(*) FROM events;

-- Посмотреть задачи конкретного пользователя
SELECT t.*, u.max_user_id 
FROM tasks t 
JOIN users u ON t.user_id = u.id 
WHERE u.max_user_id = 'ваш_user_id';

-- Выйти из psql
\q
```

---

## Способ 3: Через Docker exec (быстрая проверка)

```bash
# Выполнить SQL запрос напрямую
docker compose exec db psql -U postgres -d productivity_bot -c "SELECT * FROM users;"
docker compose exec db psql -U postgres -d productivity_bot -c "SELECT * FROM tasks;"
docker compose exec db psql -U postgres -d productivity_bot -c "SELECT * FROM events;"
```

---

## Способ 4: Тестирование через бота

1. **Запустите бота** (если еще не запущен):
   ```bash
   docker compose up
   ```

2. **Откройте MAX мессенджер** и найдите вашего бота

3. **Создайте тестовые данные**:
   - Отправьте `/start`
   - Создайте задачу через меню
   - Создайте событие
   - Запустите Pomodoro таймер

4. **Проверьте в БД** любым из способов выше

---

## Способ 5: SQL скрипт для проверки

Создайте файл `check-db.sql`:

```sql
-- Проверка всех таблиц
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings
UNION ALL
SELECT 'pomodoro_sessions', COUNT(*) FROM pomodoro_sessions;

-- Последние задачи
SELECT id, title, due_date, created_at 
FROM tasks 
ORDER BY created_at DESC 
LIMIT 10;

-- Последние события
SELECT id, title, datetime, created_at 
FROM events 
ORDER BY created_at DESC 
LIMIT 10;
```

Запустите:
```bash
docker compose exec -T db psql -U postgres -d productivity_bot < check-db.sql
```

---

## Быстрая проверка (одна команда)

```bash
# Показать все таблицы и количество записей
docker compose exec db psql -U postgres -d productivity_bot -c "
SELECT 
  'users' as table_name, COUNT(*) as records FROM users
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'events', COUNT(*) FROM events
UNION ALL SELECT 'user_settings', COUNT(*) FROM user_settings
UNION ALL SELECT 'pomodoro_sessions', COUNT(*) FROM pomodoro_sessions;
"
```

---

## Проверка в реальном времени

### Вариант 1: Следить за логами БД

```bash
# В отдельном терминале
docker compose logs -f db
```

### Вариант 2: Мониторинг через psql

```bash
# Подключитесь к БД
docker compose exec db psql -U postgres -d productivity_bot

# Включите показ времени выполнения запросов
\timing

# Выполняйте запросы и смотрите изменения
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 5;
```

---

## Проверка конкретных данных

### Найти пользователя по max_user_id:

```bash
docker compose exec db psql -U postgres -d productivity_bot -c "
SELECT * FROM users WHERE max_user_id = 'ваш_user_id';
"
```

### Найти задачи пользователя:

```bash
docker compose exec db psql -U postgres -d productivity_bot -c "
SELECT t.*, u.max_user_id 
FROM tasks t 
JOIN users u ON t.user_id = u.id 
WHERE u.max_user_id = 'ваш_user_id';
"
```

### Проверить последние записи:

```bash
docker compose exec db psql -U postgres -d productivity_bot -c "
SELECT 'Last 5 tasks:' as info;
SELECT id, title, created_at FROM tasks ORDER BY created_at DESC LIMIT 5;
SELECT 'Last 5 events:' as info;
SELECT id, title, datetime, created_at FROM events ORDER BY created_at DESC LIMIT 5;
"
```

---

## Устранение проблем

### Если Prisma Studio не открывается:

```bash
# Проверьте, что контейнер запущен
docker compose ps

# Проверьте порт
docker compose port bot 5555
```

### Если не можете подключиться к БД:

```bash
# Проверьте, что БД запущена
docker compose ps db

# Проверьте логи
docker compose logs db
```

### Если таблицы пустые:

1. Убедитесь, что бот работает: `docker compose logs bot`
2. Создайте данные через бота
3. Проверьте логи бота на ошибки

---

## Полезные команды для отладки

```bash
# Посмотреть все контейнеры
docker compose ps

# Посмотреть логи бота
docker compose logs bot

# Посмотреть логи БД
docker compose logs db

# Перезапустить только бота
docker compose restart bot

# Перезапустить только БД
docker compose restart db
```

---

## Рекомендация

**Для быстрой проверки используйте Prisma Studio** - это самый удобный способ:
```bash
docker compose exec bot npx prisma studio --host 0.0.0.0
```

Затем откройте `http://localhost:5555` в браузере.

