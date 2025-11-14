import schedule from 'node-schedule';
import { format, isAfter, subMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';

class NotificationService {
  constructor(bot, store) {
    this.bot = bot;
    this.store = store;
    this.dailyJobs = new Map();
  }

  ensureDailyJob(userId) {
    const settings = this.store.getSettings(userId);
    this.cancelDailyJob(userId);

    if (!settings.dailyDigest) {
      return;
    }

    const job = schedule.scheduleJob(
      { rule: '0 9 * * *', tz: settings.timezone || 'Europe/Moscow' },
      () => this.sendDailySummary(userId),
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
    const { tasks, events, settings } = this.store.getUser(userId);
    if (!settings.dailyDigest) {
      return;
    }

    const now = new Date();
    const todayTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      return due.getDate() === now.getDate() && due.getMonth() === now.getMonth();
    });

    const upcomingEvents = events
      .filter((event) => isAfter(new Date(event.datetime), now))
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
      .slice(0, 3);

    if (!todayTasks.length && !upcomingEvents.length) {
      await this.bot.api.sendMessageToUser(
        Number(userId),
        'На сегодня нет задач со сроком и ближайших событий. Хорошего дня!',
      );
      return;
    }

    const taskLines = todayTasks.map(
      (task) => `• ${task.title} — до ${format(new Date(task.dueDate), 'HH:mm', { locale: ru })}`,
    );

    const eventLines = upcomingEvents.map(
      (event) =>
        `• ${event.title} — ${format(new Date(event.datetime), 'dd MMM HH:mm', { locale: ru })}`,
    );

    const summary = [
      '📋 *Ежедневный дайджест*',
      taskLines.length ? `Задачи на сегодня:\n${taskLines.join('\n')}` : null,
      eventLines.length ? `Ближайшие события:\n${eventLines.join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    await this.bot.api.sendMessageToUser(Number(userId), summary, { format: 'markdown' });
  }

  scheduleEventReminder(userId, event) {
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
}

export default NotificationService;

