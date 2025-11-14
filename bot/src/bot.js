import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { format, parse, isValid } from 'date-fns';
import { ru } from 'date-fns/locale';

import store from './store.js';
import NotificationService from './notifications.js';
import PomodoroManager from './pomodoro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bot = new Bot(process.env.BOT_TOKEN);
const notifications = new NotificationService(bot, store);
const pomodoro = new PomodoroManager(bot);

const MAIN_KEYBOARD = Keyboard.inlineKeyboard([
  [Keyboard.button.callback('📋 Задачи и события', 'menu:tasks')],
  [Keyboard.button.callback('⏱ Помодоро таймер', 'menu:timer')],
]);

const MENU_BACK = Keyboard.inlineKeyboard([[Keyboard.button.callback('⬅️ В меню', 'menu:back')]]);
const TASKS_KEYBOARD = Keyboard.inlineKeyboard([
  [Keyboard.button.callback('📝 Создать задачу', 'menu:create_task')],
  [Keyboard.button.callback('📅 Создать событие', 'menu:create_event')],
  [
    Keyboard.button.callback('🗑 Удалить задачу', 'tasks:delete'),
    Keyboard.button.callback('🗑 Удалить событие', 'events:delete'),
  ],
  [Keyboard.button.callback('⚙️ Настройки', 'menu:settings')],
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
  const duePart = task.dueDate
    ? ` (до ${format(new Date(task.dueDate), 'dd MMM HH:mm', { locale: ru })})`
    : '';
  return `#${task.id} — ${task.title}${duePart}${task.description ? `\n   ${task.description}` : ''}`;
}

function formatEvent(event) {
  return `#${event.id} — ${event.title}\n   ${format(new Date(event.datetime), 'dd MMM HH:mm', { locale: ru })}${event.reminderMinutes ? `, напомнить за ${event.reminderMinutes} мин.` : ''
    }`;
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

async function showMainMenu(ctx, message = 'Что будем делать?') {
  await ctx.reply(message, { attachments: [MAIN_KEYBOARD] });
}

function startTaskFlow(ctx) {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  store.setSession(userId, { type: 'task', step: 'title', draft: {} });
  ctx.reply('Введите название задачи:', { attachments: [MENU_BACK] });
}

function startEventFlow(ctx) {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  store.setSession(userId, { type: 'event', step: 'title', draft: {} });
  ctx.reply('Название события?', { attachments: [MENU_BACK] });
}

function startPomodoroFlow(ctx, { mode }) {
  const userId = getUserId(ctx);

  if (mode === 'free') {
    store.clearSession(userId);
    store.setSession(userId, { type: 'pomodoro_free', step: 'work', draft: {} });
    ctx.reply('Сколько минут работать? (по умолчанию 25)', { attachments: [MENU_BACK] });
    return;
  }

  const tasks = store.getTasks(userId);
  if (!tasks.length) {
    ctx.reply('У вас пока нет задач. Сначала создайте задачу.', { attachments: [MENU_BACK] });
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
  ctx.reply(
    [
      'Выберите задачу для таймера.',
      'Введите номер задачи (например, 3).',
      '',
      lines,
    ].join('\n'),
    { attachments: [MENU_BACK] },
  );
}

function showSettings(ctx) {
  const userId = getUserId(ctx);
  const settings = store.getSettings(userId);

  notifications.ensureDailyJob(userId);

  const keyboard = Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback(
        settings.dailyDigest ? '🔕 Выключить дайджест' : '🔔 Включить дайджест',
        'settings:toggle_daily',
      ),
    ],
    [
      Keyboard.button.callback('15 мин', 'settings:reminder:15'),
      Keyboard.button.callback('30 мин', 'settings:reminder:30'),
      Keyboard.button.callback('60 мин', 'settings:reminder:60'),
    ],
    [Keyboard.button.callback('Сменить часовой пояс', 'settings:timezone')],
    [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
  ]);

  ctx.reply(
    [
      '*Настройки уведомлений*',
      `• Дайджест: ${settings.dailyDigest ? 'включён' : 'выключен'}`,
      `• Напоминание о событиях: за ${settings.reminderMinutesBeforeEvent} мин`,
      `• Часовой пояс: ${settings.timezone}`,
    ].join('\n'),
    { format: 'markdown', attachments: [keyboard] },
  );
}

async function showTasksHub(ctx) {
  const userId = getUserId(ctx);
  const tasks = store.getTasks(userId);
  const events = store.getEvents(userId);

  const tasksBlock = tasks.length
    ? ['*Задачи*', ...tasks.map(formatTask)].join('\n')
    : 'Задач пока нет.';
  const eventsBlock = events.length
    ? ['*События*', ...events.map(formatEvent)].join('\n')
    : 'Событий пока нет.';

  await ctx.reply([tasksBlock, '', eventsBlock].join('\n\n'), {
    format: 'markdown',
    attachments: [TASKS_KEYBOARD],
  });
}

function startDeleteTaskFlow(ctx) {
  const userId = getUserId(ctx);
  const tasks = store.getTasks(userId);
  if (!tasks.length) {
    ctx.reply('Удалять нечего — список задач пуст.', { attachments: [TASKS_KEYBOARD] });
    return;
  }
  store.setSession(userId, { type: 'delete_task', step: 'await_id' });
  ctx.reply(
    [
      'Введите номер задачи, которую нужно удалить.',
      '',
      ...tasks.slice(-10).map(formatTask),
    ].join('\n'),
    { attachments: [MENU_BACK] },
  );
}

function startDeleteEventFlow(ctx) {
  const userId = getUserId(ctx);
  const events = store.getEvents(userId);
  if (!events.length) {
    ctx.reply('Удалять нечего — событий нет.', { attachments: [TASKS_KEYBOARD] });
    return;
  }
  store.setSession(userId, { type: 'delete_event', step: 'await_id' });
  ctx.reply(
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
  const keyboard = session
    ? Keyboard.inlineKeyboard([
      [Keyboard.button.callback('⏹ Остановить таймер', 'timer:stop')],
      [Keyboard.button.callback('⬅️ В меню', 'menu:back')],
    ])
    : TIMER_START_KEYBOARD;

  const message = session
    ? [
      '⌛ *Помодоро запущен*',
      `Режим: ${session.task ? `задача "${session.task.title}"` : 'свободный'}`,
      `Цикл: ${session.currentCycle}/${session.cycles}`,
      `Интервалы: ${session.workMinutes} мин работа / ${session.breakMinutes} мин отдых`,
    ].join('\n')
    : 'Таймер не запущен. Выберите режим запуска.';

  await ctx.reply(message, { format: 'markdown', attachments: [keyboard] });
}

async function handleTaskFlow(ctx, session) {
  const userId = getUserId(ctx);
  const text = ctx.message?.body?.text?.trim();
  if (!text) return;

  if (session.step === 'title') {
    session.draft.title = text;
    session.step = 'description';
    ctx.reply('Добавьте описание (или введите "-"), чтобы пропустить.', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'description') {
    session.draft.description = text === '-' ? '' : text;
    session.step = 'due';
    ctx.reply('Когда срок? Формат: 25.11.2025 18:00', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'due') {
    const dueDate = parseDate(text);
    if (!dueDate) {
      ctx.reply('Не получилось понять дату. Повторите, напр. 25.11.2025 18:00', {
        attachments: [MENU_BACK],
      });
      return;
    }

    const task = store.upsertTask(userId, {
      ...session.draft,
      dueDate: dueDate.toISOString(),
      createdAt: new Date().toISOString(),
    });

    store.clearSession(userId);
    await ctx.reply(
      `Задача "${task.title}" сохранена на ${format(dueDate, 'dd MMM HH:mm', { locale: ru })}.`,
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
    session.step = 'datetime';
    ctx.reply('Когда событие? Формат: 25.11.2025 10:30', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'datetime') {
    const datetime = parseDate(text);
    if (!datetime) {
      ctx.reply('Не понял дату. Пример: 25.11.2025 10:30', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.datetime = datetime.toISOString();
    session.step = 'reminder';
    ctx.reply('За сколько минут напомнить? Например, 30', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'reminder') {
    const minutes = Number(text);
    if (Number.isNaN(minutes) || minutes < 0) {
      ctx.reply('Введите число минут, например 15.', { attachments: [MENU_BACK] });
      return;
    }

    const event = store.upsertEvent(userId, {
      ...session.draft,
      reminderMinutes: minutes,
      createdAt: new Date().toISOString(),
    });
    store.clearSession(userId);

    notifications.scheduleEventReminder(userId, event);

    await ctx.reply(
      `Событие "${event.title}" создано на ${format(new Date(event.datetime), 'dd MMM HH:mm', {
        locale: ru,
      })}.`,
      { attachments: [MENU_BACK] },
    );
    await showTasksHub(ctx);
  }
}

async function handlePomodoroFlow(ctx, session) {
  const userId = getUserId(ctx);
  const text = ctx.message?.body?.text?.trim();
  if (!text) return;

  if (session.step === 'task') {
    const taskId = Number(text);
    const task = store.getTasks(userId).find((item) => item.id === taskId);
    if (!task) {
      ctx.reply('Такой задачи нет. Введите номер из списка.', { attachments: [MENU_BACK] });
      return;
    }
    session.draft.task = task;
    session.step = 'work';
    ctx.reply('Сколько минут работать? (по умолчанию 25)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'work') {
    const workMinutes = Number(text) || 25;
    session.draft.workMinutes = workMinutes;
    session.step = 'break';
    ctx.reply('Перерыв в минутах? (по умолчанию 5)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'break') {
    const breakMinutes = Number(text) || 5;
    session.draft.breakMinutes = breakMinutes;
    session.step = 'cycles';
    ctx.reply('Сколько циклов? (по умолчанию 4)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'cycles') {
    const cycles = Number(text) || 4;
    const { task, workMinutes, breakMinutes } = session.draft;

    pomodoro.start(userId, ctx, task, { workMinutes, breakMinutes, cycles });
    store.clearSession(userId);
    ctx.reply(
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
    ctx.reply('Перерыв в минутах? (по умолчанию 5)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'break') {
    const breakMinutes = Number(text) || 5;
    session.draft.breakMinutes = breakMinutes;
    session.step = 'cycles';
    ctx.reply('Сколько циклов? (по умолчанию 4)', { attachments: [MENU_BACK] });
    return;
  }

  if (session.step === 'cycles') {
    const cycles = Number(text) || 4;
    const { workMinutes, breakMinutes } = session.draft;

    pomodoro.start(userId, ctx, null, { workMinutes, breakMinutes, cycles });
    store.clearSession(userId);
    ctx.reply(
      `Стартуем свободный помодоро: ${workMinutes}/${breakMinutes} мин, ${cycles} циклов.`,
      { attachments: [MENU_BACK] },
    );
    await showTimerScreen(ctx);
  }
}

bot.command('start', async (ctx) => {
  const userId = getUserId(ctx);
  notifications.ensureDailyJob(userId);
  await ctx.reply(
    'Привет! Я помогу держать задачи, события и фокус в одном месте.',
    { attachments: [MAIN_KEYBOARD] },
  );
});

bot.command('menu', (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  showMainMenu(ctx);
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

bot.action('menu:create_task', (ctx) => startTaskFlow(ctx));
bot.action('menu:create_event', (ctx) => startEventFlow(ctx));
bot.action('menu:settings', (ctx) => showSettings(ctx));
bot.action('menu:tasks', async (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  await showTasksHub(ctx);
});
bot.action('menu:timer', (ctx) => showTimerScreen(ctx));
bot.action('menu:back', (ctx) => {
  const userId = getUserId(ctx);
  store.clearSession(userId);
  showMainMenu(ctx, 'Главное меню');
});

bot.action('settings:toggle_daily', (ctx) => {
  const userId = getUserId(ctx);
  const settings = store.getSettings(userId);
  store.updateSettings(userId, { dailyDigest: !settings.dailyDigest });
  notifications.ensureDailyJob(userId);
  ctx.reply(`Дайджест ${settings.dailyDigest ? 'выключен' : 'включён'}.`, { attachments: [MENU_BACK] });
});

bot.action(/settings:reminder:(\d+)/, (ctx) => {
  const userId = getUserId(ctx);
  const minutes = Number(ctx.match[1]);
  store.updateSettings(userId, { reminderMinutesBeforeEvent: minutes });
  ctx.reply(`Напоминания будут приходить за ${minutes} минут.`, { attachments: [MENU_BACK] });
});

bot.action('settings:timezone', (ctx) => {
  const userId = getUserId(ctx);
  store.setSession(userId, { type: 'timezone', step: 'input' });
  ctx.reply('Введите часовой пояс, например Europe/Moscow');
});

bot.action('tasks:delete', (ctx) => startDeleteTaskFlow(ctx));
bot.action('events:delete', (ctx) => startDeleteEventFlow(ctx));

bot.action('timer:start_task', (ctx) => startPomodoroFlow(ctx, { mode: 'task' }));
bot.action('timer:start_free', (ctx) => startPomodoroFlow(ctx, { mode: 'free' }));
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
  if (session.type === 'timezone') {
    const timezone = ctx.message?.body?.text?.trim();
    if (!timezone) return;
    store.updateSettings(userId, { timezone });
    store.clearSession(userId);
    notifications.ensureDailyJob(userId);
    ctx.reply(`Часовой пояс обновлён: ${timezone}`, { attachments: [MENU_BACK] });
    return;
  }
  if (session.type === 'delete_task') {
    const taskId = Number(ctx.message?.body?.text?.trim());
    if (Number.isNaN(taskId)) {
      ctx.reply('Введите номер задачи числом.', { attachments: [MENU_BACK] });
      return;
    }
    const removed = store.removeTask(userId, taskId);
    store.clearSession(userId);
    if (!removed) {
      ctx.reply('Такой задачи нет. Попробуйте снова через меню.', { attachments: [TASKS_KEYBOARD] });
      return;
    }
    await ctx.reply(`Задача "${removed.title}" удалена.`, { attachments: [TASKS_KEYBOARD] });
    await showTasksHub(ctx);
    return;
  }
  if (session.type === 'delete_event') {
    const eventId = Number(ctx.message?.body?.text?.trim());
    if (Number.isNaN(eventId)) {
      ctx.reply('Введите номер события числом.', { attachments: [MENU_BACK] });
      return;
    }
    const removed = store.removeEvent(userId, eventId);
    store.clearSession(userId);
    if (!removed) {
      ctx.reply('Такого события нет. Попробуйте снова через меню.', { attachments: [TASKS_KEYBOARD] });
      return;
    }
    await ctx.reply(`Событие "${removed.title}" удалено.`, { attachments: [TASKS_KEYBOARD] });
    await showTasksHub(ctx);
  }
});

bot.on('bot_started', (ctx) => showMainMenu(ctx, 'Готов к работе!'));

bot.start().then(() => {
  console.log('MAX Efficiency Bot is ready');
});

