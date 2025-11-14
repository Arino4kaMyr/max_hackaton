import schedule from 'node-schedule';
import { format, isAfter, subMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';

class NotificationService {
  constructor(bot, store) {
    this.bot = bot;
    this.store = store;
    this.dailyJobs = new Map();
    this.cleanupJob = null;
  }

  async ensureDailyJob(userId) {
    const settings = await this.store.getSettings(userId);
    this.cancelDailyJob(userId);

    if (!settings.dailyDigest) {
      return;
    }

    // Парсим время из формата "HH:mm" (например, "09:00")
    const [hours, minutes] = (settings.dailyDigestTime || '09:00').split(':').map(Number);
    
    // Создаем cron правило: "минуты часы * * *"
    const cronRule = `${minutes} ${hours} * * *`;

    const job = schedule.scheduleJob(
      { rule: cronRule, tz: settings.timezone || 'Europe/Moscow' },
      async () => await this.sendDailySummary(userId),
    );

    this.dailyJobs.set(userId, job);
  }

  cancelDailyJob(userId) {
    const existing = this.dailyJobs.get(userId);
    if (existing) {
      existing.cancel();
      this.dailyJobs.delete(userId);
    }
  }

  async sendDailySummary(userId) {
    const settings = await this.store.getSettings(userId);
    if (!settings.dailyDigest) {
      return;
    }

    const tasks = await this.store.getTasks(userId);
    const events = await this.store.getEvents(userId);

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

    if (!todayTasks.length && !todayEvents.length) {
      await this.bot.api.sendMessageToUser(
        Number(userId),
        `📅 *Дайджест на ${format(now, 'd MMMM yyyy', { locale: ru })}*\n\nНа сегодня нет задач со сроком и событий. Хорошего дня! ✨`,
        { format: 'markdown' }
      );
      return;
    }

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
    ]
      .filter(Boolean)
      .join('\n');

    await this.bot.api.sendMessageToUser(Number(userId), summary, { format: 'markdown' });
  }

  async scheduleEventReminder(userId, event) {
    if (!event.reminderMinutes) {
      return;
    }

    const remindAt = subMinutes(new Date(event.datetime), event.reminderMinutes);
    if (remindAt <= new Date()) {
      return;
    }

    event.reminderJob?.cancel?.();

    event.reminderJob = schedule.scheduleJob(remindAt, async () => {
      await this.bot.api.sendMessageToUser(
        Number(userId),
        `⏰ Напоминание: "${event.title}" начнётся в ${format(new Date(event.datetime), 'HH:mm', {
          locale: ru,
        })}`,
      );
    });
  }

  /**
   * Запускает автоматическую очистку завершенных задач
   * Очистка происходит каждую неделю (в воскресенье в 03:00)
   */
  startTaskCleanup() {
    // Отменяем предыдущую задачу, если есть
    if (this.cleanupJob) {
      this.cleanupJob.cancel();
    }

    // Очистка каждую неделю в воскресенье в 03:00
    // Формат cron: секунда минута час день_месяца месяц день_недели
    // 0 = воскресенье
    this.cleanupJob = schedule.scheduleJob('0 0 3 * * 0', async () => {
      await this.cleanupOldTasks();
    });

    console.log('🧹 Автоматическая очистка завершенных задач запущена (каждое воскресенье в 03:00)');
  }

  /**
   * Удаляет старые завершенные задачи (старше 7 дней)
   */
  async cleanupOldTasks() {
    try {
      const deletedCount = await this.store.cleanupOldCompletedTasks();
      console.log(`🧹 Очистка завершена: удалено ${deletedCount} старых завершенных задач`);
    } catch (error) {
      console.error('❌ Ошибка при очистке завершенных задач:', error);
    }
  }

}

export default NotificationService;

