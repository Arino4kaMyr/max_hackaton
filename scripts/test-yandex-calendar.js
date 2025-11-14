#!/usr/bin/env node

/**
 * Скрипт для тестирования подключения к Яндекс Календарю через CalDAV
 * 
 * Использование:
 * node scripts/test-yandex-calendar.js <login> <app_password>
 * 
 * Пример:
 * node scripts/test-yandex-calendar.js user@yandex.ru your_app_password
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Используем встроенный fetch (Node.js 18+)
// Если fetch недоступен, будет ошибка - нужно установить node-fetch в корневой package.json
const fetch = globalThis.fetch;

if (!fetch) {
  console.error('❌ Ошибка: fetch недоступен. Установите node-fetch или используйте Node.js 18+');
  console.error('   npm install node-fetch');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env
dotenv.config({ path: resolve(__dirname, '../.env') });

const YANDEX_CALDAV_URL = 'https://caldav.yandex.ru';

async function testConnection(login, appPassword) {
  console.log('🔍 Тестирование подключения к Яндекс Календарю...\n');
  console.log(`Логин: ${login}`);
  console.log(`URL: ${YANDEX_CALDAV_URL}\n`);

  const credentials = Buffer.from(`${login}:${appPassword}`).toString('base64');
  const authHeader = `Basic ${credentials}`;

  console.log('📡 Отправка PROPFIND запроса...\n');

  try {
    // Сначала пробуем корневой URL CalDAV
    console.log(`1️⃣ Проверка корневого URL: ${YANDEX_CALDAV_URL}/`);
    let response = await fetch(`${YANDEX_CALDAV_URL}/`, {
      method: 'PROPFIND',
      headers: {
        'Authorization': authHeader,
        'Depth': '1',
        'Content-Type': 'application/xml',
      },
    });

    console.log(`   Статус: ${response.status} ${response.statusText}`);

    if (!response.ok && response.status !== 207) {
      // Пробуем другой вариант - с calendars
      console.log(`\n2️⃣ Пробуем URL: ${YANDEX_CALDAV_URL}/calendars/`);
      response = await fetch(`${YANDEX_CALDAV_URL}/calendars/`, {
        method: 'PROPFIND',
        headers: {
          'Authorization': authHeader,
          'Depth': '1',
          'Content-Type': 'application/xml',
        },
      });
      console.log(`   Статус: ${response.status} ${response.statusText}`);
    }

    if (response.ok || response.status === 207) {
      const xmlText = await response.text();
      console.log('✅ Получен ответ от сервера');
      console.log('📄 Анализ структуры календарей...\n');
      
      // Парсим XML, чтобы найти правильный путь к календарю
      // Ищем href в ответе
      const hrefMatches = xmlText.match(/<D:href>([^<]+)<\/D:href>/g);
      if (hrefMatches) {
        console.log('📋 Найденные пути:');
        hrefMatches.forEach((match, index) => {
          const href = match.replace(/<\/?D:href>/g, '');
          if (index < 5) { // Показываем первые 5
            console.log(`   ${index + 1}. ${href}`);
          }
        });
        console.log('');
      }
      
      // Пробуем разные варианты URL
      const urlVariants = [
        `${YANDEX_CALDAV_URL}/calendars/${login}/events/`,
        `${YANDEX_CALDAV_URL}/calendars/${login}/`,
        `${YANDEX_CALDAV_URL}/calendars/${encodeURIComponent(login)}/events/`,
      ];
      
      let foundCalendar = false;
      for (const testUrl of urlVariants) {
        console.log(`3️⃣ Проверка: ${testUrl}`);
        const testResponse = await fetch(testUrl, {
          method: 'PROPFIND',
          headers: {
            'Authorization': authHeader,
            'Depth': '0',
            'Content-Type': 'application/xml',
          },
        });
        console.log(`   Статус: ${testResponse.status} ${testResponse.statusText}`);
        
        if (testResponse.ok || testResponse.status === 207) {
          console.log(`   ✅ Календарь найден по этому URL!\n`);
          response = testResponse;
          foundCalendar = true;
          break;
        }
      }
      
      if (!foundCalendar) {
        console.log('\n⚠️  Не удалось найти календарь по стандартным путям.');
        console.log('💡 Попробуйте проверить структуру через XML ответ выше.\n');
      }
    }

    console.log(`Статус ответа: ${response.status} ${response.statusText}\n`);

    if (response.ok || response.status === 207) {
      console.log('✅ Подключение успешно!');
      console.log('📅 Календарь доступен для работы.\n');

      // Пробуем получить список событий
      console.log('📋 Попытка получить список событий...');
      
      const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
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
</C:calendar-query>`;

      // Используем базовый URL календаря для REPORT запроса
      const calendarUrl = `${YANDEX_CALDAV_URL}/calendars/${login}/`;
      console.log(`📡 Отправка REPORT запроса на: ${calendarUrl}`);
      const reportResponse = await fetch(calendarUrl, {
        method: 'REPORT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/xml; charset=utf-8',
          'Depth': '1',
        },
        body: reportBody,
      });

      if (reportResponse.ok) {
        const xmlText = await reportResponse.text();
        const eventCount = (xmlText.match(/<C:calendar-data/g) || []).length;
        console.log(`✅ Успешно получен список событий (найдено: ${eventCount})`);
      } else {
        console.log(`⚠️  Не удалось получить список событий: ${reportResponse.status}`);
      }

      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Ошибка подключения:');
      console.log(`Статус: ${response.status} ${response.statusText}`);
      console.log(`Ответ: ${errorText.substring(0, 500)}`);
      
      if (response.status === 401) {
        console.log('\n💡 Возможные причины:');
        console.log('   - Неверный логин или пароль приложения');
        console.log('   - Пароль приложения не создан для "Календарь CalDAV"');
      } else if (response.status === 404) {
        console.log('\n💡 Возможные причины:');
        console.log('   - Календарь не существует или недоступен');
        console.log('   - Неверный URL календаря');
      }
      
      return false;
    }
  } catch (error) {
    console.log('❌ Ошибка при подключении:');
    console.log(error.message);
    return false;
  }
}

// Получаем аргументы командной строки
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('📝 Использование:');
  console.log('   node scripts/test-yandex-calendar.js <login> <app_password>\n');
  console.log('Пример:');
  console.log('   node scripts/test-yandex-calendar.js user@yandex.ru your_app_password\n');
  console.log('💡 Как получить пароль приложения:');
  console.log('   1. Зайдите на https://id.yandex.ru/');
  console.log('   2. Перейдите в "Безопасность"');
  console.log('   3. Создайте "Пароль приложения" для "Календарь CalDAV"');
  process.exit(1);
}

const [login, appPassword] = args;

testConnection(login, appPassword)
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Ошибка:', error);
    process.exit(1);
  });

