import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { format, parse, isValid, differenceInDays, isPast, startOfDay, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';

import store from './dbStore.js';
import NotificationService from './notifications.js';
import PomodoroManager from './pomodoro.js';
import { generatePomodoroChart, cleanupImage } from './utils/chartGenerator.js';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bot = new Bot(process.env.BOT_TOKEN);
const notifications = new NotificationService(bot, store);
const pomodoro = new PomodoroManager(bot);

const MAIN_KEYBOARD = Keyboard.inlineKeyboard([
  [
    Keyboard.button.callback('📋 Задачи', 'menu:tasks'),
    Keyboard.button.callback('📅 События', 'menu:events'),
  ],
  [
    Keyboard.button.callback('🍅 Помодоро таймер', 'menu:timer'),
    Keyboard.button.callback('⚙️ Настройки', 'menu:settings'),
  ],
]);

const MENU_BACK = Keyboard.inlineKeyboard([[Keyboard.button.callback('⬅️ В меню', 'menu:back')]]);

const TASKS_KEYBOARD = Keyboard.inlineKeyboard([
  [Keyboard.button.callback('📝 Создать задачу', 'menu:create_task')],
  [
    Keyboard.button.callback('✅ Завершить задачу', 'tasks:complete'),
    Keyboard.button.callback('🗑 Удалить задачу', 'tasks:delete'),
  ],
  [Keyboard.button.callback('📊 Статистика', 'tasks:stats')],
  [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
]);

const EVENTS_KEYBOARD = Keyboard.inlineKeyboard([
  [Keyboard.button.callback('📅 Создать событие', 'menu:create_event')],
  [Keyboard.button.callback('🗑 Удалить событие', 'events:delete')],
  [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
]);

const TIMER_START_KEYBOARD = Keyboard.inlineKeyboard([
  [Keyboard.button.callback('🚀 По задаче', 'timer:start_task')],
  [Keyboard.button.callback('🧠 Свободный режим', 'timer:start_free')],
  [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
]);

const DATE_PATTERNS = [
  'dd.MM.yyyy HH:mm',
  'dd.MM.yyyy',
  'dd.MM HH:mm',
  "yyyy-MM-dd'T'HH:mm",
  'yyyy-MM-dd',
];

function getUserId(ctx) {
  return ctx?.user?.user_id?.toString();
}

function formatTask(task) {
  const statusIcon = task.completed ? '✅' : '⏳';
  let duePart = '';
  if (task.dueDate) {
    const dueDate = new Date(task.dueDate);
    const daysLeft = differenceInDays(dueDate, new Date());
    const formattedDate = format(dueDate, 'dd MMM HH:mm', { locale: ru });
    
    if (daysLeft < 0) {
      duePart = ` (просрочено: ${formattedDate})`;
    } else if (daysLeft === 0) {
      duePart = ` (сегодня до ${format(dueDate, 'HH:mm', { locale: ru })})`;
    } else if (daysLeft === 1) {
      duePart = ` (завтра до ${format(dueDate, 'HH:mm', { locale: ru })})`;
    } else {
      duePart = ` (через ${daysLeft} дн. до ${formattedDate})`;
    }
  }
  
  let completedPart = '';
  if (task.completed && task.completedAt) {
    const completedDate = format(new Date(task.completedAt), 'dd MMM yyyy', { locale: ru });
    completedPart = ` — завершено ${completedDate}`;
  }
  
  return `${statusIcon} #${task.id} — ${task.title}${duePart}${completedPart}${task.description ? `\n   ${task.description}` : ''}`;
}

function formatEvent(event) {
  return `#${event.id} — ${event.title}\n   ${format(new Date(event.datetime), 'dd MMM HH:mm', { locale: ru })}${event.reminderMinutes ? `, напомнить за ${event.reminderMinutes} мин.` : ''
    }`;
}

// Названия месяцев на русском (в разных регистрах)
const MONTH_NAMES = {
  'январь': 1, 'января': 1, 'янв': 1, 'january': 1, 'jan': 1,
  'февраль': 2, 'февраля': 2, 'фев': 2, 'february': 2, 'feb': 2,
  'март': 3, 'марта': 3, 'мар': 3, 'march': 3, 'mar': 3,
  'апрель': 4, 'апреля': 4, 'апр': 4, 'april': 4, 'apr': 4,
  'май': 5, 'мая': 5, 'may': 5,
  'июнь': 6, 'июня': 6, 'июн': 6, 'june': 6, 'jun': 6,
  'июль': 7, 'июля': 7, 'июл': 7, 'july': 7, 'jul': 7,
  'август': 8, 'августа': 8, 'авг': 8, 'august': 8, 'aug': 8,
  'сентябрь': 9, 'сентября': 9, 'сен': 9, 'сент': 9, 'september': 9, 'sep': 9, 'sept': 9,
  'октябрь': 10, 'октября': 10, 'окт': 10, 'october': 10, 'oct': 10,
  'ноябрь': 11, 'ноября': 11, 'ноя': 11, 'нояб': 11, 'november': 11, 'nov': 11,
  'декабрь': 12, 'декабря': 12, 'дек': 12, 'december': 12, 'dec': 12,
};

function parseMonth(input) {
  const normalized = input.trim().toLowerCase();
  
  // Пробуем как число
  const monthNum = parseInt(normalized, 10);
  if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
    return monthNum;
  }
  
  // Пробуем как название месяца
  if (MONTH_NAMES[normalized]) {
    return MONTH_NAMES[normalized];
  }
  
  return null;
}

function parseDate(raw) {
  const trimmed = raw.trim();
  const now = new Date();
  for (const pattern of DATE_PATTERNS) {
    const parsed = parse(trimmed, pattern, now);
    if (isValid(parsed)) {
      if (pattern === 'dd.MM HH:mm') {
        parsed.setFullYear(now.getFullYear());
      }
      if (pattern === 'dd.MM.yyyy') {
        parsed.setHours(23, 59, 0, 0);
      }
      if (pattern === 'yyyy-MM-dd') {
        parsed.setHours(23, 59, 0, 0);
      }
      return parsed;
    }
  }
  return null;
}

async function showDailyDigest(ctx) {
  const userId = getUserId(ctx);
  if (!userId) {
    await ctx.reply('Что будем делать?', { attachments: [MAIN_KEYBOARD] });
    return;
  }

  const tasks = await store.getTasks(userId, false); // Только активные задачи
  const events = await store.getEvents(userId);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Задачи на сегодня
  const todayTasks = tasks.filter((task) => {
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    return due >= today && due < tomorrow;
  });

  // События на сегодня (с 00:00 до 23:59)
  const todayEvents = events.filter((event) => {
    const eventDate = new Date(event.datetime);
    return eventDate >= today && eventDate < tomorrow;
  }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const taskLines = todayTasks.length > 0
    ? todayTasks.map(
        (task) => `• ${task.title} — до ${format(new Date(task.dueDate), 'HH:mm', { locale: ru })}`,
      )
    : [];

  const eventLines = todayEvents.length > 0
    ? todayEvents.map(
        (event) => `• ${format(new Date(event.datetime), 'HH:mm', { locale: ru })} — ${event.title}${event.description ? `\n  ${event.description}` : ''}`,
      )
    : [];

  const summary = [
    `📅 *Дайджест на ${format(now, 'd MMMM yyyy', { locale: ru })}*`,
    '',
    taskLines.length > 0 ? `📋 *Задачи на сегодня (${todayTasks.length}):*\n${taskLines.join('\n')}` : null,
    eventLines.length > 0 ? `\n📆 *События на сегодня (${todayEvents.length}):*\n${eventLines.join('\n')}` : null,
    (!todayTasks.length && !todayEvents.length) ? 'На сегодня нет задач со сроком и событий. Хорошего дня! ✨' : null,
  ]
    .filter(Boolean)
    .join('\n');

  await ctx.reply(summary, {
    format: 'markdown',
    attachments: [MAIN_KEYBOARD],
  });
}

async function showMainMenu(ctx, message = 'Что будем делать?') {
  await ctx.reply(message, { attachments: [MAIN_KEYBOARD] });
}

async function startTaskFlow(ctx) {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  store.setSession(userId, { type: 'task', step: 'title', draft: {} });
  await ctx.reply('Введите название задачи:', { attachments: [MENU_BACK] });
}

async function startEventFlow(ctx) {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  store.setSession(userId, { type: 'event', step: 'title', draft: {} });
  await ctx.reply('Название события?', { attachments: [MENU_BACK] });
}

async function startPomodoroFlow(ctx, { mode }) {
  const userId = getUserId(ctx);

  if (mode === 'free') {
    store.clearSession(userId);
    store.setSession(userId, { type: 'pomodoro_free', step: 'work', draft: {} });
    await ctx.reply('Сколько минут работать? (по умолчанию 25)', { attachments: [MENU_BACK] });
    return;
  }

  const tasks = await store.getTasks(userId);
  if (!tasks.length) {
    await ctx.reply('У вас пока нет задач. Сначала создайте задачу.', { attachments: [MENU_BACK] });
    return;
  }

  const lines = tasks
    .slice(-10)
    .map(
      (task) =>
        `#${task.id}: ${task.title}${task.dueDate ? ` (до ${format(new Date(task.dueDate), 'dd MMM HH:mm', { locale: ru })})` : ''
        }`,
    )
    .join('\n');

  store.clearSession(userId);
  store.setSession(userId, { type: 'pomodoro', step: 'task', draft: {} });
  await ctx.reply(
    [
      'Выберите задачу для таймера.',
      'Введите номер задачи (например, 3).',
      '',
      lines,
    ].join('\n'),
    { attachments: [MENU_BACK] },
  );
}

async function showSettings(ctx) {
  const userId = getUserId(ctx);
  const settings = await store.getSettings(userId);

  await notifications.ensureDailyJob(userId);

  const keyboard = Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback(
        settings.dailyDigest ? '🔕 Выключить дайджест' : '🔔 Включить дайджест',
        'settings:toggle_daily',
      ),
    ],
    [Keyboard.button.callback('⏰ Изменить время дайджеста', 'settings:digest_time')],
    [Keyboard.button.callback('❗️ Изменить время уведомлений', 'settings:reminder_time')],
    [Keyboard.button.callback('Сменить часовой пояс', 'settings:timezone')],
    [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
  ]);

  await ctx.reply(
    [
      '*Настройки уведомлений*',
      `• Дайджест: ${settings.dailyDigest ? 'включён' : 'выключен'}`,
      settings.dailyDigest ? `• Время дайджеста: ${settings.dailyDigestTime || '09:00'}` : null,
      `• Напоминание о событиях: за ${settings.reminderMinutesBeforeEvent} мин`,
      `• Часовой пояс: ${settings.timezone}`,
    ]
      .filter(Boolean)
      .join('\n'),
    { format: 'markdown', attachments: [keyboard] },
  );
}

async function showTasksHub(ctx) {
  const userId = getUserId(ctx);
  const tasks = await store.getTasks(userId, false); // Показываем только активные задачи

  if (tasks.length === 0) {
    await ctx.reply('Задач пока нет.', {
      format: 'markdown',
      attachments: [TASKS_KEYBOARD],
    });
    return;
  }

  const tasksBlock = ['*Задачи*', '', ...tasks.map(formatTask)].join('\n');

  await ctx.reply(tasksBlock, {
    format: 'markdown',
    attachments: [TASKS_KEYBOARD],
  });
}

async function showEventsHub(ctx) {
  const userId = getUserId(ctx);
  const events = await store.getEvents(userId);

  if (events.length === 0) {
    await ctx.reply('Событий пока нет.', {
      format: 'markdown',
      attachments: [EVENTS_KEYBOARD],
    });
    return;
  }

  // Группируем события по дням
  const eventsByDate = new Map();
  
  for (const event of events) {
    const eventDate = new Date(event.datetime);
    const dateKey = format(eventDate, 'yyyy-MM-dd'); // Ключ для группировки
    const dateLabel = format(eventDate, 'd MMMM', { locale: ru }); // Отображение даты
    
    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, { label: dateLabel, events: [] });
    }
    
    eventsByDate.get(dateKey).events.push(event);
  }

  // Сортируем по дате (от ближайших к дальним)
  const sortedDates = Array.from(eventsByDate.keys()).sort();
  
  // Формируем текст с группировкой по дням
  const eventBlocks = [];
  
  for (const dateKey of sortedDates) {
    const { label, events: dayEvents } = eventsByDate.get(dateKey);
    
    // Сортируем события дня по времени
    dayEvents.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    
    const dayEventsText = dayEvents.map(event => {
      const eventDate = new Date(event.datetime);
      const timeStr = format(eventDate, 'HH:mm', { locale: ru });
      return `#${event.id} - ${event.title} (${timeStr})`;
    }).join('\n');
    
    eventBlocks.push(`*${label}:*\n${dayEventsText}`);
  }

  const eventsBlock = ['*События*', '', ...eventBlocks].join('\n');

  await ctx.reply(eventsBlock, {
    format: 'markdown',
    attachments: [EVENTS_KEYBOARD],
  });
}

async function startCompleteTaskFlow(ctx) {
  const userId = getUserId(ctx);
  const tasks = await store.getTasks(userId, false); // Только незавершенные задачи
  if (!tasks.length) {
    await ctx.reply('Нет незавершенных задач.', { attachments: [TASKS_KEYBOARD] });
    return;
  }
  store.setSession(userId, { type: 'complete_task', step: 'await_id' });
  await ctx.reply(
    [
      'Введите номер задачи, которую нужно завершить.',
      '',
      ...tasks.slice(-10).map(formatTask),
    ].join('\n'),
    { format: 'markdown', attachments: [MENU_BACK] },
  );
}

async function startDeleteTaskFlow(ctx) {
  const userId = getUserId(ctx);
  const tasks = await store.getTasks(userId);
  if (!tasks.length) {
    await ctx.reply('Удалять нечего — список задач пуст.', { attachments: [TASKS_KEYBOARD] });
    return;
  }
  store.setSession(userId, { type: 'delete_task', step: 'await_id' });
  await ctx.reply(
    [
      'Введите номер задачи, которую нужно удалить.',
      '',
      ...tasks.slice(-10).map(formatTask),
    ].join('\n'),
    { format: 'markdown', attachments: [MENU_BACK] },
  );
}

async function showTaskStats(ctx) {
  const userId = getUserId(ctx);
  const stats = await store.getTaskStats(userId);
  
  const statsText = [
    '*📊 Статистика задач*',
    '',
    `📋 Всего задач: ${stats.total}`,
    `⏳ Активных: ${stats.active}`,
    `✅ Завершенных: ${stats.completed}`,
    `📈 Процент выполнения: ${stats.completionRate}%`,
    '',
    stats.total > 0 
      ? `🎯 Прогресс: ${'█'.repeat(Math.floor(stats.completionRate / 5))}${'░'.repeat(20 - Math.floor(stats.completionRate / 5))}`
      : 'Создайте первую задачу, чтобы начать отслеживать прогресс!',
  ].join('\n');
  
  await ctx.reply(statsText, {
    format: 'markdown',
    attachments: [TASKS_KEYBOARD],
  });
}

async function startDeleteEventFlow(ctx) {
  const userId = getUserId(ctx);
  const events = await store.getEvents(userId);
  if (!events.length) {
    await ctx.reply('Удалять нечего — событий нет.', { attachments: [EVENTS_KEYBOARD] });
    return;
  }
  store.setSession(userId, { type: 'delete_event', step: 'await_id' });
  await ctx.reply(
    [
      'Введите номер события, которое нужно удалить.',
      '',
      ...events.slice(-10).map(formatEvent),
    ].join('\n'),
    { attachments: [MENU_BACK] },
  );
}

async function showTimerScreen(ctx) {
  const userId = getUserId(ctx);
  const session = pomodoro.getSession(userId);
  
  // Пытаемся получить задачу из сессии, если есть
  let taskTitle = null;
  if (session?.task?._dbId) {
    // Если есть _dbId, значит это задача из БД
    const tasks = await store.getTasks(userId);
    const task = tasks.find(t => t._dbId === session.task._dbId);
    if (task) taskTitle = task.title;
  } else if (session?.task?.title) {
    taskTitle = session.task.title;
  }
  
  const keyboard = session
    ? Keyboard.inlineKeyboard([
      [Keyboard.button.callback('⏹ Остановить таймер', 'timer:stop')],
      [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
    ])
    : TIMER_START_KEYBOARD;

  try {
    // Получаем статистику
    const stats = await store.getPomodoroTotalStats(userId);
    
    // Генерируем изображение
    const imagePath = await generatePomodoroChart(stats, session);
    const imageBuffer = await readFile(imagePath);
    
    // Отправляем изображение
    if (session) {
      const message = [
        '🍅 *Помодоро запущен*',
        `📋 Режим: ${taskTitle ? `задача "${taskTitle}"` : 'свободный'}`,
        `🔄 Цикл: ${session.currentCycle}/${session.cycles}`,
        `⏱ Интервалы: ${session.workMinutes} мин работа / ${session.breakMinutes} мин отдых`,
      ].join('\n');
      
      // Отправляем изображение через bot.api
      await bot.api.sendMessageToUser(Number(userId), message, {
        format: 'markdown',
        attachments: [keyboard],
        files: [{ name: 'pomodoro.png', data: imageBuffer, mimeType: 'image/png' }]
      });
    } else {
      const message = stats && stats.totalSessions > 0
        ? '🍅 *Помодоро таймер*\n\nТаймер не запущен. Выберите режим запуска.'
        : '🍅 *Помодоро таймер*\n\nТаймер не запущен. Выберите режим запуска.';
      
      // Отправляем изображение через bot.api
      await bot.api.sendMessageToUser(Number(userId), message, {
        format: 'markdown',
        attachments: [keyboard],
        files: [{ name: 'pomodoro.png', data: imageBuffer, mimeType: 'image/png' }]
      });
    }
    
    // Удаляем временный файл
    await cleanupImage(imagePath);
  } catch (error) {
    console.error('Error generating chart:', error);
    // Если не удалось сгенерировать изображение, показываем текстовую версию
    if (session) {
      const { currentCycle, cycles, workMinutes, breakMinutes } = session;
      const progressBar = createProgressBar(currentCycle, cycles);
      const cycleVisualization = createCycleVisualization(currentCycle, cycles);
      
      const message = [
        '🍅 *Помодоро запущен*',
        '',
        `📋 Режим: ${taskTitle ? `задача "${taskTitle}"` : 'свободный'}`,
        `🔄 Цикл: ${currentCycle}/${cycles}`,
        `⏱ Интервалы: ${workMinutes} мин работа / ${breakMinutes} мин отдых`,
        '',
        cycleVisualization,
        progressBar,
      ].join('\n');

      await ctx.reply(message, { format: 'markdown', attachments: [keyboard] });
    } else {
      const stats = await store.getPomodoroTotalStats(userId);
      let message = '🍅 *Помодоро таймер*\n\nТаймер не запущен. Выберите режим запуска.';
      
      if (stats && stats.totalSessions > 0) {
        const statsChart = createStatsChart(stats);
        message = `🍅 *Помодоро таймер*\n\n${statsChart}\n\nВыберите режим запуска:`;
      }
      
      await ctx.reply(message, { format: 'markdown', attachments: [keyboard] });
    }
  }
}

async function handleTaskFlow(ctx, session) {
  const userId = getUserId(ctx);
  const text = ctx.message?.body?.text?.trim();
  if (!text) return;

  if (session.step === 'title') {
    session.draft.title = text;
    session.step = 'description';
    await ctx.reply('Добавьте описание (или введите "-"), чтобы пропустить.', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'description') {
    session.draft.description = text === '-' ? '' : text;
    session.step = 'due_day';
    await ctx.reply('Введите день (1-31):', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'due_day') {
    const day = parseInt(text, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      await ctx.reply('❌ Неверный день. Введите число от 1 до 31:', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.day = day;
    session.step = 'due_month';
    await ctx.reply('Введите месяц (число 1-12 или название, например: ноябрь, ноя, ноября):', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'due_month') {
    const month = parseMonth(text);
    if (!month) {
      await ctx.reply('❌ Неверный месяц. Введите число (1-12) или название (ноябрь, ноя, ноября):', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.month = month;
    session.step = 'due_year';
    await ctx.reply('Введите год (например, 2025) или "-" для текущего года:', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'due_year') {
    let year;
    if (text === '-') {
      year = new Date().getFullYear();
    } else {
      year = parseInt(text, 10);
      if (isNaN(year) || year < new Date().getFullYear() || year > 2100) {
        await ctx.reply(`❌ Неверный год. Введите год от ${new Date().getFullYear()} до 2100 или "-" для текущего:`, { attachments: [MENU_BACK] });
        return;
      }
    }
    session.draft.year = year;
    session.step = 'due_time';
    await ctx.reply('Введите время в формате ЧЧ:ММ (например, 18:00) или "-" чтобы пропустить:', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'due_time') {
    let hours = 23;
    let minutes = 59;
    
    if (text !== '-') {
      const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
      const match = text.match(timePattern);
      if (!match) {
        await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ (например, 18:00) или "-":', { attachments: [MENU_BACK] });
        return;
      }
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
    }

    const { day: taskDay, month: taskMonth, year: taskYear } = session.draft;
    const dueDate = new Date(taskYear, taskMonth - 1, taskDay, hours, minutes);
    
    // Проверяем, что дата валидна
    if (dueDate.getDate() !== taskDay || dueDate.getMonth() !== taskMonth - 1 || dueDate.getFullYear() !== taskYear) {
      await ctx.reply('❌ Неверная дата (например, 31 февраля не существует). Попробуйте снова:', { attachments: [MENU_BACK] });
      session.step = 'due_day';
      delete session.draft.day;
      delete session.draft.month;
      delete session.draft.year;
      await ctx.reply('Введите день (1-31):', { attachments: [MENU_BACK] });
      return;
    }

    // Проверяем, что дата не в прошлом
    const now = new Date();
    if (isPast(dueDate) && !isToday(dueDate)) {
      await ctx.reply('❌ Нельзя добавить задачу с прошедшей датой. Попробуйте снова:', { attachments: [MENU_BACK] });
      session.step = 'due_day';
      delete session.draft.day;
      delete session.draft.month;
      delete session.draft.year;
      await ctx.reply('Введите день (1-31):', { attachments: [MENU_BACK] });
      return;
    }

    // Если дата сегодня, проверяем, что время не в прошлом
    if (isToday(dueDate) && dueDate < now) {
      await ctx.reply('❌ Нельзя добавить задачу с прошедшим временем сегодня. Попробуйте снова:', { attachments: [MENU_BACK] });
      session.step = 'due_time';
      await ctx.reply('Введите время в формате ЧЧ:ММ (например, 18:00) или "-" чтобы пропустить:', { attachments: [MENU_BACK] });
      return;
    }

    const { day: _day, month: _month, year: _year, ...taskData } = session.draft;
    const task = await store.upsertTask(userId, {
      ...taskData,
      dueDate: dueDate.toISOString(),
      createdAt: new Date().toISOString(),
    });

    store.clearSession(userId);

    await ctx.reply(
      `✅ Задача "${task.title}" сохранена на ${format(dueDate, 'd MMMM yyyy, HH:mm', { locale: ru })}.`,
      { attachments: [MENU_BACK] },
    );
    await showTasksHub(ctx);
  }
}

async function handleEventFlow(ctx, session) {
  const userId = getUserId(ctx);
  const text = ctx.message?.body?.text?.trim();
  if (!text) return;

  if (session.step === 'title') {
    session.draft.title = text;
    session.step = 'datetime_day';
    await ctx.reply('Введите день (1-31):', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'datetime_day') {
    const day = parseInt(text, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      await ctx.reply('❌ Неверный день. Введите число от 1 до 31:', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.day = day;
    session.step = 'datetime_month';
    await ctx.reply('Введите месяц (число 1-12 или название, например: ноябрь, ноя, ноября):', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'datetime_month') {
    const month = parseMonth(text);
    if (!month) {
      await ctx.reply('❌ Неверный месяц. Введите число (1-12) или название (ноябрь, ноя, ноября):', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.month = month;
    session.step = 'datetime_year';
    await ctx.reply('Введите год (например, 2025) или "-" для текущего года:', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'datetime_year') {
    let year;
    if (text === '-') {
      year = new Date().getFullYear();
    } else {
      year = parseInt(text, 10);
      if (isNaN(year) || year < new Date().getFullYear() || year > 2100) {
        await ctx.reply(`❌ Неверный год. Введите год от ${new Date().getFullYear()} до 2100 или "-" для текущего:`, { attachments: [MENU_BACK] });
        return;
      }
    }
    session.draft.year = year;
    session.step = 'datetime_time';
    await ctx.reply('Введите время в формате ЧЧ:ММ (например, 10:30):', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'datetime_time') {
    const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = text.match(timePattern);
    if (!match) {
      await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ (например, 10:30):', { attachments: [MENU_BACK] });
      return;
    }
    
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const { day: eventDay, month: eventMonth, year: eventYear } = session.draft;
    
    const datetime = new Date(eventYear, eventMonth - 1, eventDay, hours, minutes);
    
    // Проверяем, что дата валидна
    if (datetime.getDate() !== eventDay || datetime.getMonth() !== eventMonth - 1 || datetime.getFullYear() !== eventYear) {
      await ctx.reply('❌ Неверная дата (например, 31 февраля не существует). Попробуйте снова:', { attachments: [MENU_BACK] });
      session.step = 'datetime_day';
      delete session.draft.day;
      delete session.draft.month;
      delete session.draft.year;
      await ctx.reply('Введите день (1-31):', { attachments: [MENU_BACK] });
      return;
    }

    // Проверяем, что дата не в прошлом
    const now = new Date();
    if (isPast(datetime) && !isToday(datetime)) {
      await ctx.reply('❌ Нельзя добавить событие с прошедшей датой. Попробуйте снова:', { attachments: [MENU_BACK] });
      session.step = 'datetime_day';
      delete session.draft.day;
      delete session.draft.month;
      delete session.draft.year;
      await ctx.reply('Введите день (1-31):', { attachments: [MENU_BACK] });
      return;
    }

    // Если дата сегодня, проверяем, что время не в прошлом
    if (isToday(datetime) && datetime < now) {
      await ctx.reply('❌ Нельзя добавить событие с прошедшим временем сегодня. Попробуйте снова:', { attachments: [MENU_BACK] });
      session.step = 'datetime_time';
      await ctx.reply('Введите время в формате ЧЧ:ММ (например, 10:30):', { attachments: [MENU_BACK] });
      return;
    }
    
    session.draft.datetime = datetime.toISOString();
    session.step = 'reminder';
    
    // Получаем настройки пользователя для показа дефолтного значения
    const settings = await store.getSettings(userId);
    const defaultReminder = settings.reminderMinutesBeforeEvent || 30;
    
    const reminderKeyboard = Keyboard.inlineKeyboard([
      [Keyboard.button.callback(`Использовать по умолчанию (${defaultReminder} мин)`, 'event:reminder:default')],
      [Keyboard.button.callback('⬅️ Назад', 'menu:back')],
    ]);
    
    await ctx.reply(
      `За сколько минут напомнить?\n\n` +
      `💡 По умолчанию: ${defaultReminder} минут\n` +
      `Или введите число минут (например, 15, 30, 60)`,
      { attachments: [reminderKeyboard] }
    );
    return;
  }

  if (session.step === 'reminder') {
    // Если пользователь ввел "-", используем дефолтное значение
    if (text === '-') {
      const settings = await store.getSettings(userId);
      const minutes = settings.reminderMinutesBeforeEvent || 30;
      
      const { day: _day, month: _month, year: _year, ...eventData } = session.draft;
      const event = await store.upsertEvent(userId, {
        ...eventData,
        reminderMinutes: minutes,
        createdAt: new Date().toISOString(),
      });
      store.clearSession(userId);

      await notifications.scheduleEventReminder(userId, event);

      await ctx.reply(
        `Событие "${event.title}" создано на ${format(new Date(event.datetime), 'dd MMM HH:mm', {
          locale: ru,
        })}. Напоминание за ${minutes} минут.`,
        { attachments: [MENU_BACK] },
      );
      await showEventsHub(ctx);
      return;
    }
    
    const minutes = Number(text);
    if (Number.isNaN(minutes) || minutes < 0) {
      await ctx.reply('Введите число минут, например 15, или "-" для использования значения по умолчанию.', { attachments: [MENU_BACK] });
      return;
    }

    const { day: _day, month: _month, year: _year, ...eventData } = session.draft;
    const event = await store.upsertEvent(userId, {
      ...eventData,
      reminderMinutes: minutes,
      createdAt: new Date().toISOString(),
    });
    store.clearSession(userId);

    await notifications.scheduleEventReminder(userId, event);

    await ctx.reply(
      `Событие "${event.title}" создано на ${format(new Date(event.datetime), 'dd MMM HH:mm', {
        locale: ru,
      })}.`,
      { attachments: [MENU_BACK] },
    );
    await showEventsHub(ctx);
  }
}

async function handlePomodoroFlow(ctx, session) {
  const userId = getUserId(ctx);
  const text = ctx.message?.body?.text?.trim();
  if (!text) return;

  if (session.step === 'task') {
    const taskId = Number(text);
    const tasks = await store.getTasks(userId);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      await ctx.reply('Такой задачи нет. Введите номер из списка.', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.task = task;
    session.step = 'work';
    await ctx.reply('Сколько минут работать? (по умолчанию 25)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'work') {
    const workMinutes = Number(text) || 25;
    session.draft.workMinutes = workMinutes;
    session.step = 'break';
    await ctx.reply('Перерыв в минутах? (по умолчанию 5)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'break') {
    const breakMinutes = Number(text) || 5;
    session.draft.breakMinutes = breakMinutes;
    session.step = 'cycles';
    await ctx.reply('Сколько циклов? (по умолчанию 4)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'cycles') {
    const cycles = Number(text) || 4;
    const { task, workMinutes, breakMinutes } = session.draft;

    pomodoro.start(userId, ctx, task, { workMinutes, breakMinutes, cycles });
    store.clearSession(userId);
    await ctx.reply(
      `Стартуем помодоро для "${task.title}": ${workMinutes}/${breakMinutes} мин, ${cycles} циклов.`,
      { attachments: [MENU_BACK] },
    );
    await showTimerScreen(ctx);
  }
}

async function handlePomodoroFreeFlow(ctx, session) {
  const userId = getUserId(ctx);
  const text = ctx.message?.body?.text?.trim();
  if (!text) return;

  if (session.step === 'work') {
    const workMinutes = Number(text) || 25;
    session.draft.workMinutes = workMinutes;
    session.step = 'break';
    await ctx.reply('Перерыв в минутах? (по умолчанию 5)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'break') {
    const breakMinutes = Number(text) || 5;
    session.draft.breakMinutes = breakMinutes;
    session.step = 'cycles';
    await ctx.reply('Сколько циклов? (по умолчанию 4)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'cycles') {
    const cycles = Number(text) || 4;
    const { workMinutes, breakMinutes } = session.draft;

    pomodoro.start(userId, ctx, null, { workMinutes, breakMinutes, cycles });
    store.clearSession(userId);
    await ctx.reply(
      `Стартуем свободный помодоро: ${workMinutes}/${breakMinutes} мин, ${cycles} циклов.`,
      { attachments: [MENU_BACK] },
    );
    await showTimerScreen(ctx);
  }
}

async function startWelcomeFlow(ctx) {
  const userId = getUserId(ctx);
  await store.ensureUser(userId);
  store.setSession(userId, { type: 'welcome', step: 'daily_digest', draft: {} });
  
  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback('✅ Да', 'welcome:daily_yes')],
    [Keyboard.button.callback('❌ Нет', 'welcome:daily_no')],
  ]);
  
  await ctx.reply(
    '👋 Привет! Добро пожаловать в бота для продуктивности!\n\n' +
    'Хотите ли вы получать ежедневный дайджест событий и задач?',
    { attachments: [keyboard] }
  );
}

bot.command('start', async (ctx) => {
  const userId = getUserId(ctx);
  const isNew = await store.isNewUser(userId);
  
  if (isNew) {
    await startWelcomeFlow(ctx);
  } else {
    await notifications.ensureDailyJob(userId);
    await ctx.reply(
      'Привет! Я помогу держать задачи, события и фокус в одном месте.',
      { attachments: [MAIN_KEYBOARD] },
    );
  }
});

bot.command('menu', async (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  await showDailyDigest(ctx);
});

bot.command('cancel', (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  ctx.reply('Диалог сброшен.', { attachments: [MAIN_KEYBOARD] });
});

bot.command('stop', async (ctx) => {
  const userId = getUserId(ctx);
  const stopped = pomodoro.stop(userId);
  if (!stopped) {
    await showTimerScreen(ctx);
    return;
  }
  await showTimerScreen(ctx);
});

bot.action('menu:create_task', async (ctx) => await startTaskFlow(ctx));
bot.action('menu:create_event', async (ctx) => await startEventFlow(ctx));
bot.action('menu:settings', async (ctx) => await showSettings(ctx));
bot.action('menu:tasks', async (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  await showTasksHub(ctx);
});
bot.action('menu:events', async (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  await showEventsHub(ctx);
});
bot.action('event:reminder:default', async (ctx) => {
  const userId = getUserId(ctx);
  const session = store.getSession(userId);
  
  if (!session || session.type !== 'event' || session.step !== 'reminder') {
    await ctx.reply('Сессия не найдена. Начните создание события заново.', { attachments: [MENU_BACK] });
    return;
  }
  
  const settings = await store.getSettings(userId);
  const minutes = settings.reminderMinutesBeforeEvent || 30;
  
  const { day: _day, month: _month, year: _year, ...eventData } = session.draft;
  const event = await store.upsertEvent(userId, {
    ...eventData,
    reminderMinutes: minutes,
    createdAt: new Date().toISOString(),
  });
  store.clearSession(userId);

  await notifications.scheduleEventReminder(userId, event);

  await ctx.reply(
    `Событие "${event.title}" создано на ${format(new Date(event.datetime), 'dd MMM HH:mm', {
      locale: ru,
    })}. Напоминание за ${minutes} минут.`,
    { attachments: [MENU_BACK] },
  );
  await showEventsHub(ctx);
});

bot.action('menu:timer', (ctx) => showTimerScreen(ctx));

bot.action('timer:stats', async (ctx) => {
  const userId = getUserId(ctx);
  const stats = await store.getPomodoroStats(userId);
  
  if (!stats || !stats.total.totalSessions) {
    await ctx.reply(
      '🍅 У вас пока нет завершенных Pomodoro сессий.\n\nЗапустите таймер через меню, чтобы начать отслеживать статистику!',
      { attachments: [TIMER_START_KEYBOARD] }
    );
    return;
  }

  try {
    // Генерируем изображение со статистикой
    const imagePath = await generatePomodoroChart(stats.total, null);
    const imageBuffer = await readFile(imagePath);
    
    const { today, week, month, total } = stats;
    
    const message = [
      '🍅 *Ваша статистика Pomodoro*',
      '',
      '📅 *Сегодня:*',
      `• Сессий: ${today.totalSessions}`,
      `• Циклов: ${today.totalCycles}`,
      `• Минут работы: ${today.totalWorkMinutes}`,
      '',
      '📆 *За неделю:*',
      `• Сессий: ${week.totalSessions}`,
      `• Циклов: ${week.totalCycles}`,
      `• Часов работы: ${Math.round((week.totalWorkMinutes / 60) * 10) / 10} ч`,
      '',
      '📆 *За месяц:*',
      `• Сессий: ${month.totalSessions}`,
      `• Циклов: ${month.totalCycles}`,
      `• Часов работы: ${Math.round((month.totalWorkMinutes / 60) * 10) / 10} ч`,
    ].join('\n');

    // Отправляем изображение через bot.api
    await bot.api.sendMessageToUser(Number(userId), message, {
      format: 'markdown',
      attachments: [TIMER_START_KEYBOARD],
      files: [{ name: 'pomodoro_stats.png', data: imageBuffer, mimeType: 'image/png' }]
    });
    
    // Удаляем временный файл
    await cleanupImage(imagePath);
  } catch (error) {
    console.error('Error generating stats chart:', error);
    // Если не удалось сгенерировать изображение, показываем текстовую версию
    const { today, week, month, total } = stats;
    const statsChart = createStatsChart(total);
    
    const message = [
      '🍅 *Ваша статистика Pomodoro*',
      '',
      statsChart,
      '',
      '📅 *Сегодня:*',
      `• Сессий: ${today.totalSessions}`,
      `• Циклов: ${today.totalCycles}`,
      `• Минут работы: ${today.totalWorkMinutes}`,
      '',
      '📆 *За неделю:*',
      `• Сессий: ${week.totalSessions}`,
      `• Циклов: ${week.totalCycles}`,
      `• Часов работы: ${Math.round((week.totalWorkMinutes / 60) * 10) / 10} ч`,
      '',
      '📆 *За месяц:*',
      `• Сессий: ${month.totalSessions}`,
      `• Циклов: ${month.totalCycles}`,
      `• Часов работы: ${Math.round((month.totalWorkMinutes / 60) * 10) / 10} ч`,
    ].join('\n');

    await ctx.reply(message, { 
      format: 'markdown', 
      attachments: [TIMER_START_KEYBOARD] 
    });
  }
});
bot.action('menu:back', async (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  await showDailyDigest(ctx);
});

bot.action('settings:toggle_daily', async (ctx) => {
  const userId = getUserId(ctx);
  const settings = await store.getSettings(userId);
  await store.updateSettings(userId, { dailyDigest: !settings.dailyDigest });
  await notifications.ensureDailyJob(userId);
  await ctx.reply(`Дайджест ${settings.dailyDigest ? 'выключен' : 'включён'}.`, { attachments: [MENU_BACK] });
});

bot.action(/settings:reminder:(\d+)/, async (ctx) => {
  const userId = getUserId(ctx);
  const minutes = Number(ctx.match[1]);
  await store.updateSettings(userId, { reminderMinutesBeforeEvent: minutes });
  await ctx.reply(`Напоминания будут приходить за ${minutes} минут.`, { attachments: [MENU_BACK] });
});

bot.action('settings:digest_time', async (ctx) => {
  const userId = getUserId(ctx);
  const settings = await store.getSettings(userId);
  store.setSession(userId, { type: 'digest_time', step: 'input' });
  await ctx.reply(
    `Введите время отправки дайджеста в формате ЧЧ:ММ (например, 09:00 или 18:30)\n\nТекущее время: ${settings.dailyDigestTime || '09:00'}`,
    { attachments: [MENU_BACK] }
  );
});

bot.action('settings:reminder_time', async (ctx) => {
  const userId = getUserId(ctx);
  const settings = await store.getSettings(userId);
  const currentReminder = settings.reminderMinutesBeforeEvent || 30;
  
  const reminderKeyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback('15 минут', 'settings:reminder_time:15')],
    [Keyboard.button.callback('30 минут', 'settings:reminder_time:30')],
    [Keyboard.button.callback('60 минут', 'settings:reminder_time:60')],
    [Keyboard.button.callback('Другое', 'settings:reminder_time:custom')],
    [Keyboard.button.callback('⬅️ Назад', 'menu:settings')],
  ]);
  
  await ctx.reply(
    `За сколько минут до события вы хотите получать напоминания?\n\n` +
    `Текущее значение: ${currentReminder} минут`,
    { attachments: [reminderKeyboard] }
  );
});

bot.action(/settings:reminder_time:(\d+)/, async (ctx) => {
  const userId = getUserId(ctx);
  const minutes = Number(ctx.match[1]);
  await store.updateSettings(userId, { reminderMinutesBeforeEvent: minutes });
  await ctx.reply(`✅ Напоминания будут приходить за ${minutes} минут до события.`, { attachments: [MENU_BACK] });
  await showSettings(ctx);
});

bot.action('settings:reminder_time:custom', async (ctx) => {
  const userId = getUserId(ctx);
  store.setSession(userId, { type: 'reminder_time_custom', step: 'input' });
  await ctx.reply(
    'Введите количество минут (например, 45, 90, 120):',
    { attachments: [MENU_BACK] }
  );
});

bot.action('settings:timezone', async (ctx) => {
  const userId = getUserId(ctx);
  store.setSession(userId, { type: 'timezone', step: 'input' });
  await ctx.reply('Введите часовой пояс, например Europe/Moscow', { attachments: [MENU_BACK] });
});

bot.action('tasks:complete', async (ctx) => await startCompleteTaskFlow(ctx));
bot.action('tasks:delete', async (ctx) => await startDeleteTaskFlow(ctx));
bot.action('tasks:stats', async (ctx) => await showTaskStats(ctx));
bot.action('events:delete', async (ctx) => await startDeleteEventFlow(ctx));

bot.action('welcome:daily_yes', async (ctx) => {
  const userId = getUserId(ctx);
  const session = store.getSession(userId);
  if (!session || session.type !== 'welcome') return;
  
  session.draft.dailyDigest = true;
  session.step = 'reminder';
  
  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback('15 минут', 'welcome:reminder:15')],
    [Keyboard.button.callback('30 минут', 'welcome:reminder:30')],
    [Keyboard.button.callback('60 минут', 'welcome:reminder:60')],
    [Keyboard.button.callback('Другое', 'welcome:reminder:custom')],
  ]);
  
  await ctx.reply(
    'За сколько минут до события вы хотите получать напоминания?',
    { attachments: [keyboard] }
  );
});

bot.action('welcome:daily_no', async (ctx) => {
  const userId = getUserId(ctx);
  const session = store.getSession(userId);
  if (!session || session.type !== 'welcome') return;
  
  session.draft.dailyDigest = false;
  session.step = 'reminder';
  
  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback('15 минут', 'welcome:reminder:15')],
    [Keyboard.button.callback('30 минут', 'welcome:reminder:30')],
    [Keyboard.button.callback('60 минут', 'welcome:reminder:60')],
    [Keyboard.button.callback('Другое', 'welcome:reminder:custom')],
  ]);
  
  await ctx.reply(
    'За сколько минут до события вы хотите получать напоминания?',
    { attachments: [keyboard] }
  );
});

bot.action(/welcome:reminder:(\d+)/, async (ctx) => {
  const userId = getUserId(ctx);
  const session = store.getSession(userId);
  if (!session || session.type !== 'welcome') return;
  
  const minutes = Number(ctx.match[1]);
  session.draft.reminderMinutes = minutes;
  session.step = 'timezone';
  
  await ctx.reply(
    'Введите ваш часовой пояс (например, Europe/Moscow, Europe/Kaliningrad, Asia/Almaty):\n\n' +
    'Или введите "-" для использования Europe/Moscow по умолчанию.',
    { attachments: [MENU_BACK] }
  );
});

bot.action('welcome:reminder:custom', async (ctx) => {
  const userId = getUserId(ctx);
  const session = store.getSession(userId);
  if (!session || session.type !== 'welcome') return;
  
  session.step = 'reminder_custom';
  await ctx.reply(
    'Введите количество минут (например, 45):',
    { attachments: [MENU_BACK] }
  );
});

bot.action('timer:start_task', async (ctx) => await startPomodoroFlow(ctx, { mode: 'task' }));
bot.action('timer:start_free', async (ctx) => await startPomodoroFlow(ctx, { mode: 'free' }));
bot.action('timer:stop', async (ctx) => {
  const userId = getUserId(ctx);
  const stopped = pomodoro.stop(userId);
  if (!stopped) {
    await showTimerScreen(ctx);
    return;
  }
  await showTimerScreen(ctx);
});

bot.on('message_created', async (ctx) => {
  if (ctx.message?.sender?.is_bot) return;
  const userId = getUserId(ctx);
  if (!userId) return;

  const session = store.getSession(userId);
  if (!session) return;

  if (session.type === 'task') {
    await handleTaskFlow(ctx, session);
    return;
  }
  if (session.type === 'event') {
    await handleEventFlow(ctx, session);
    return;
  }
  if (session.type === 'pomodoro') {
    await handlePomodoroFlow(ctx, session);
    return;
  }
  if (session.type === 'pomodoro_free') {
    await handlePomodoroFreeFlow(ctx, session);
    return;
  }
  if (session.type === 'digest_time') {
    const timeInput = ctx.message?.body?.text?.trim();
    if (!timeInput) return;

    // Проверяем формат времени HH:mm
    const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timePattern.test(timeInput)) {
      await ctx.reply(
        '❌ Неверный формат времени. Используйте формат ЧЧ:ММ (например, 09:00 или 18:30)',
        { attachments: [MENU_BACK] }
      );
      return;
    }

    await store.updateSettings(userId, { dailyDigestTime: timeInput });
    store.clearSession(userId);
    await notifications.ensureDailyJob(userId);
    await ctx.reply(`✅ Время дайджеста обновлено: ${timeInput}`, { attachments: [MENU_BACK] });
    await showSettings(ctx);
    return;
  }

  if (session.type === 'reminder_time_custom') {
    const minutes = parseInt(ctx.message?.body?.text?.trim(), 10);
    if (isNaN(minutes) || minutes < 0) {
      await ctx.reply('❌ Введите положительное число минут (например, 45, 90, 120):', { attachments: [MENU_BACK] });
      return;
    }

    await store.updateSettings(userId, { reminderMinutesBeforeEvent: minutes });
    store.clearSession(userId);
    await ctx.reply(`✅ Напоминания будут приходить за ${minutes} минут до события.`, { attachments: [MENU_BACK] });
    await showSettings(ctx);
    return;
  }

  if (session.type === 'welcome') {
    if (session.step === 'reminder_custom') {
      const minutes = parseInt(ctx.message?.body?.text?.trim(), 10);
      if (isNaN(minutes) || minutes < 0) {
        await ctx.reply('❌ Введите положительное число минут (например, 45):', { attachments: [MENU_BACK] });
        return;
      }
      session.draft.reminderMinutes = minutes;
      session.step = 'timezone';
      await ctx.reply(
        'Введите ваш часовой пояс (например, Europe/Moscow, Europe/Kiev, Asia/Almaty):\n\n' +
        'Или введите "-" для использования Europe/Moscow по умолчанию.',
        { attachments: [MENU_BACK] }
      );
      return;
    }

    if (session.step === 'timezone') {
      const timezoneInput = ctx.message?.body?.text?.trim();
      if (!timezoneInput) return;

      const timezone = timezoneInput === '-' ? 'Europe/Moscow' : timezoneInput;
      
      // Сохраняем все настройки
      await store.updateSettings(userId, {
        dailyDigest: session.draft.dailyDigest ?? true,
        reminderMinutesBeforeEvent: session.draft.reminderMinutes ?? 30,
        timezone: timezone,
      });

      store.clearSession(userId);
      await notifications.ensureDailyJob(userId);
      
      await ctx.reply(
        '✅ Настройки сохранены!\n\n' +
        `📅 Ежедневный дайджест: ${session.draft.dailyDigest ? 'включен' : 'выключен'}\n` +
        `⏰ Напоминания за ${session.draft.reminderMinutes ?? 30} минут\n` +
        `🌍 Часовой пояс: ${timezone}\n\n` +
        'Теперь вы можете использовать все функции бота!',
        { attachments: [MAIN_KEYBOARD] }
      );
      return;
    }
  }

  if (session.type === 'complete_task') {
    const taskId = Number(ctx.message?.body?.text?.trim());
    if (Number.isNaN(taskId)) {
      await ctx.reply('Введите номер задачи числом.', { attachments: [MENU_BACK] });
      return;
    }
    const completed = await store.completeTask(userId, taskId);
    store.clearSession(userId);
    if (!completed) {
      await ctx.reply('Такой задачи нет или она уже завершена. Попробуйте снова через меню.', { attachments: [TASKS_KEYBOARD] });
      return;
    }
    await ctx.reply(`✅ Задача "${completed.title}" завершена!`, { attachments: [TASKS_KEYBOARD] });
    await showTasksHub(ctx);
    return;
  }

  if (session.type === 'delete_task') {
    const taskId = Number(ctx.message?.body?.text?.trim());
    if (Number.isNaN(taskId)) {
      await ctx.reply('Введите номер задачи числом.', { attachments: [MENU_BACK] });
      return;
    }
    const removed = await store.removeTask(userId, taskId);
    store.clearSession(userId);
    if (!removed) {
      await ctx.reply('Такой задачи нет. Попробуйте снова через меню.', { attachments: [TASKS_KEYBOARD] });
      return;
    }
    await ctx.reply(`Задача "${removed.title}" удалена.`, { attachments: [TASKS_KEYBOARD] });
    await showTasksHub(ctx);
    return;
  }
  if (session.type === 'delete_event') {
    const eventId = Number(ctx.message?.body?.text?.trim());
    if (Number.isNaN(eventId)) {
      await ctx.reply('Введите номер события числом.', { attachments: [MENU_BACK] });
      return;
    }
    const removed = await store.removeEvent(userId, eventId);
    store.clearSession(userId);
    if (!removed) {
      await ctx.reply('Такого события нет. Попробуйте снова через меню.', { attachments: [EVENTS_KEYBOARD] });
      return;
    }
    await ctx.reply(`Событие "${removed.title}" удалено.`, { attachments: [EVENTS_KEYBOARD] });
    await showEventsHub(ctx);
  }
});

bot.on('bot_started', async (ctx) => {
  const userId = getUserId(ctx);
  if (!userId) {
    await showDailyDigest(ctx);
    return;
  }
  
  const isNew = await store.isNewUser(userId);
  
  if (isNew) {
    await startWelcomeFlow(ctx);
  } else {
    await notifications.ensureDailyJob(userId);
    await showDailyDigest(ctx);
  }
});

bot.start().then(() => {
  console.log('MAX Efficiency Bot is ready');
  // Запускаем автоматическую очистку завершенных задач
  notifications.startTaskCleanup();
});

