# 🧪 Тестирование подключения к Яндекс Календарю

## Быстрая проверка через скрипт

Создан скрипт для тестирования подключения:

```bash
node scripts/test-yandex-calendar.js <login> <app_password>
```

### Пример:

```bash
node scripts/test-yandex-calendar.js user@yandex.ru your_app_password_here
```

### Что делает скрипт:

1. ✅ Проверяет доступ к календарю через PROPFIND запрос
2. ✅ Пытается получить список событий через REPORT запрос
3. ✅ Показывает подробную информацию об ошибках

---

## Ручная проверка через curl

### 1. Проверка доступа (PROPFIND)

```bash
curl -X PROPFIND \
  -u "your_login@yandex.ru:your_app_password" \
  -H "Depth: 0" \
  -H "Content-Type: application/xml" \
  "https://caldav.yandex.ru/calendars/your_login@yandex.ru/events/"
```

**Ожидаемый результат:**
- `207 Multi-Status` - успешно
- `401 Unauthorized` - неверные учетные данные
- `404 Not Found` - календарь не найден

### 2. Получение списка событий (REPORT)

```bash
curl -X REPORT \
  -u "your_login@yandex.ru:your_app_password" \
  -H "Depth: 1" \
  -H "Content-Type: application/xml; charset=utf-8" \
  -d '<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="20240101T000000Z" end="20251231T235959Z"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>' \
  "https://caldav.yandex.ru/calendars/your_login@yandex.ru/events/"
```

**Ожидаемый результат:**
- `207 Multi-Status` с XML содержащим события
- `401 Unauthorized` - неверные учетные данные

### 3. Создание тестового события (PUT)

```bash
curl -X PUT \
  -u "your_login@yandex.ru:your_app_password" \
  -H "Content-Type: text/calendar; charset=utf-8" \
  -d 'BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//NONSGML v1.0//RU
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:test-event-123@test
DTSTAMP:20250101T120000Z
DTSTART:20250115T140000Z
DTEND:20250115T150000Z
SUMMARY:Тестовое событие
DESCRIPTION:Это тестовое событие для проверки
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR' \
  "https://caldav.yandex.ru/calendars/your_login@yandex.ru/events/test-event-123.ics"
```

**Ожидаемый результат:**
- `201 Created` - событие создано
- `204 No Content` - событие обновлено
- `401 Unauthorized` - неверные учетные данные

---

## Проверка через Node.js код

Можно использовать сервис напрямую:

```javascript
import { YandexCalendarService } from './bot/src/services/yandexCalendar.js';

const login = 'your_login@yandex.ru';
const appPassword = 'your_app_password';

const calendarService = new YandexCalendarService(login, appPassword);

// Проверка подключения
const isConnected = await calendarService.testConnection();
console.log('Подключение:', isConnected ? '✅ Успешно' : '❌ Ошибка');

// Получение событий
const events = await calendarService.getEvents(
  new Date('2025-01-01'),
  new Date('2025-12-31')
);
console.log('Событий найдено:', events.length);
```

---

## Типичные ошибки и решения

### 401 Unauthorized

**Причины:**
- Неверный логин
- Неверный пароль приложения
- Пароль создан не для "Календарь CalDAV"

**Решение:**
1. Проверьте правильность логина
2. Убедитесь, что пароль приложения создан для "Календарь CalDAV"
3. Создайте новый пароль приложения

### 404 Not Found

**Причины:**
- Неверный URL календаря
- Календарь не существует

**Решение:**
- Проверьте формат URL: `https://caldav.yandex.ru/calendars/USERNAME/events/`
- Убедитесь, что у вас есть доступ к Яндекс Календарю

### Connection timeout

**Причины:**
- Проблемы с сетью
- Блокировка файрволом

**Решение:**
- Проверьте интернет-соединение
- Проверьте настройки файрвола

---

## Проверка через браузер

К сожалению, CalDAV не поддерживает прямую проверку через браузер, так как это требует HTTP Basic Auth, который браузеры не поддерживают напрямую.

Но можно проверить:
1. Зайдите на https://calendar.yandex.ru/
2. Убедитесь, что календарь работает
3. Проверьте, что у вас есть события

---

## Интеграция в бота

Бот автоматически проверяет подключение при вводе пароля:

```javascript
// В bot.js при подключении
const calendarService = new YandexCalendarService(login, password);
const isConnected = await calendarService.testConnection();
```

Если подключение не удалось, пользователь увидит сообщение с инструкциями.

