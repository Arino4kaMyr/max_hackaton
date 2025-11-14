# 📊 Пример команды для статистики Pomodoro

## Добавление команды `/stats`

Добавьте этот код в `bot/src/bot.js`:

```javascript
bot.command('stats', async (ctx) => {
  const userId = getUserId(ctx);
  
  try {
    const stats = await store.getPomodoroStats(userId);
    
    if (!stats || !stats.total.totalSessions) {
      await ctx.reply(
        '🍅 У вас пока нет завершенных Pomodoro сессий.\n\nЗапустите таймер через меню, чтобы начать отслеживать статистику!',
        { attachments: [MAIN_KEYBOARD] }
      );
      return;
    }

    const { today, week, month, total } = stats;

    const message = [
      '🍅 *Ваша статистика Pomodoro*',
      '',
      '📊 *Общая статистика:*',
      `• Всего сессий: ${total.totalSessions}`,
      `• Всего циклов: ${total.totalCycles}`,
      `• Всего часов работы: ${total.totalHours} ч`,
      `• Среднее циклов на сессию: ${total.averageCyclesPerSession}`,
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

    await ctx.reply(message, { format: 'markdown', attachments: [MAIN_KEYBOARD] });
  } catch (error) {
    console.error('Error getting stats:', error);
    await ctx.reply('❌ Ошибка при получении статистики. Попробуйте позже.');
  }
});
```

## Добавление кнопки в меню

Можно добавить кнопку "📊 Статистика" в главное меню:

```javascript
const MAIN_KEYBOARD = Keyboard.inlineKeyboard([
  [Keyboard.button.callback('📋 Задачи и события', 'menu:tasks')],
  [Keyboard.button.callback('⏱ Помодоро таймер', 'menu:timer')],
  [Keyboard.button.callback('📊 Статистика', 'menu:stats')], // Добавить эту строку
]);

// И обработчик
bot.action('menu:stats', async (ctx) => {
  // Тот же код, что и для команды /stats
});
```

## Важно

⚠️ **Сейчас сессии не сохраняются в БД автоматически!**

Чтобы статистика работала, нужно:

1. **Сохранять сессию при старте** (см. `docs/POMODORO_STATS.md`)
2. **Обновлять currentCycle** при каждом цикле
3. **Сохранять при завершении** сессии

См. подробности в `docs/POMODORO_STATS.md`.

