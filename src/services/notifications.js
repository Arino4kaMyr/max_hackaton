import schedule from 'node-schedule';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

class NotificationService {
  constructor(bot, store) {
    this.bot = bot;
    this.store = store;
    this.dailyJobs = new Map();
    this.cleanupJob = null;
    this.reminderCheckInterval = null;
  }

  async ensureDailyJob(userId) {
    const settings = await this.store.getSettings(userId);
    this.cancelDailyJob(userId);

    if (!settings.dailyDigest) {
      return;
    }

    const [hours, minutes] = (settings.dailyDigestTime || '09:00').split(':').map(Number);
    
    const cronRule = `${minutes} ${hours} * * *`;

    const job = schedule.scheduleJob(
      { rule: cronRule, tz: 'Europe/Moscow' },
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

    const tasks = await this.store.getTasks(userId, false);
    const events = await this.store.getEvents(userId);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const allTasks = tasks.filter((task) => {
      return task.dueDate && !task.completed;
    });

    const todayEvents = events.filter((event) => {
      const eventDate = new Date(event.datetime);
      return eventDate >= today && eventDate < tomorrow;
    }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    const taskLines = allTasks.length > 0
      ? allTasks.map((task) => {
          const due = new Date(task.dueDate);
          const isOverdue = due < now;
          const overdueMarker = isOverdue ? ' ⚠️ *ПРОСРОЧЕНО*' : '';
          let dateStr;
          if (isOverdue) {
            dateStr = format(due, 'd MMM yyyy HH:mm', { locale: ru });
          } else if (due >= today && due < tomorrow) {
            dateStr = format(due, 'HH:mm', { locale: ru });
          } else {
            dateStr = format(due, 'd MMM HH:mm', { locale: ru });
          }
          return `• ${task.title} — до ${dateStr}${overdueMarker}`;
        })
      : [];

    const eventLines = todayEvents.length > 0
      ? todayEvents.map(
          (event) => `• ${format(new Date(event.datetime), 'HH:mm', { locale: ru })} — ${event.title}${event.description ? `\n  ${event.description}` : ''}`,
        )
      : [];

    const summary = [
      `📅 *Дайджест на ${format(now, 'd MMMM yyyy', { locale: ru })}*`,
      '',
      taskLines.length > 0 ? `📋 *Задачи (${allTasks.length}):*\n${taskLines.join('\n')}` : null,
      eventLines.length > 0 ? `\n📆 *События на сегодня (${todayEvents.length}):*\n${eventLines.join('\n')}` : null,
      (!allTasks.length && !todayEvents.length) ? 'На сегодня нет задач со сроком и событий. Хорошего дня! ✨' : null,
    ]
      .filter(Boolean)
      .join('\n');

    await this.bot.api.sendMessageToUser(Number(userId), summary, { format: 'markdown' });
  }


  async shouldStartChecker() {
    try {
      const { getPrisma } = await import('../database/prisma.js');
      const prisma = getPrisma();
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const count = await prisma.event.count({
        where: {
          datetime: {
            gte: today,
            lt: tomorrow,
          },
          reminderMinutes: {
            not: null,
          },
        },
      });
      
      return count > 0;
    } catch (error) {
      console.error('❌ Ошибка при проверке событий:', error);
      return false;
    }
  }

  startReminderChecker() {
    if (this.reminderCheckInterval) {
      return;
    }

    console.log('🔄 Запуск периодической проверки напоминаний (каждую минуту)');
    
    const sentReminders = new Set();
    
    const checkReminders = async () => {
      try {
        const { getPrisma } = await import('../database/prisma.js');
        const prisma = getPrisma();
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const events = await prisma.event.findMany({
          where: {
            datetime: {
              gte: today,
              lt: tomorrow,
            },
            reminderMinutes: {
              not: null,
            },
          },
          include: {
            user: true,
          },
        });

        let remindersSent = 0;
        
        if (events.length > 0) {
          console.log(`🔍 [${format(now, 'yyyy-MM-dd HH:mm:ss')}] Проверка ${events.length} событий на сегодня для напоминаний`);
        }
        
        for (const event of events) {
          const eventDatetime = new Date(event.datetime);
          const timeDiffMs = eventDatetime.getTime() - now.getTime();
          const timeDiffMinutes = Math.round(timeDiffMs / (60 * 1000));
          
          const reminderTimeMs = event.reminderMinutes * 60 * 1000;
          const shouldSendReminder = timeDiffMs > 0 && timeDiffMs <= reminderTimeMs + 60000;
          
          console.log(`🔍 Событие "${event.title}": время события ${format(eventDatetime, 'yyyy-MM-dd HH:mm:ss')}, осталось ${timeDiffMinutes} мин, напоминание за ${event.reminderMinutes} мин, timeDiffMs=${timeDiffMs}, reminderTimeMs=${reminderTimeMs}, условие=${shouldSendReminder}`);
          console.log(`   Текущее время сервера: ${format(now, 'yyyy-MM-dd HH:mm:ss')}`);
          console.log(`   Время события: ${format(eventDatetime, 'yyyy-MM-dd HH:mm:ss')}`);
          
          if (shouldSendReminder) {
            const reminderKey = `${event.user.maxUserId}_${event.id}_${eventDatetime.getTime()}`;
            
            console.log(`📌 Проверка ключа напоминания: ${reminderKey}, уже отправлено: ${sentReminders.has(reminderKey)}`);
            
            if (!sentReminders.has(reminderKey)) {
              sentReminders.add(reminderKey);
              remindersSent++;
              
              console.log(`⏰ [${format(now, 'yyyy-MM-dd HH:mm:ss')}] Отправка напоминания о событии "${event.title}" (событие в ${format(eventDatetime, 'yyyy-MM-dd HH:mm:ss')}, осталось ${timeDiffMinutes} мин, напоминание за ${event.reminderMinutes} мин)`);
              
              try {
                await this.bot.api.sendMessageToUser(
                  Number(event.user.maxUserId),
                  `⏰ Напоминание: "${event.title}" начнётся в ${format(eventDatetime, 'HH:mm', {
                    locale: ru,
                  })}`,
                );
                console.log(`✅ [${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}] Напоминание о событии "${event.title}" отправлено пользователю ${event.user.maxUserId}`);
              } catch (error) {
                console.error(`❌ [${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}] Ошибка при отправке напоминания о событии "${event.title}":`, error);
                console.error('Stack trace:', error.stack);
                sentReminders.delete(reminderKey);
              }
            } else {
              console.log(`⚠️ Напоминание для события "${event.title}" уже было отправлено ранее`);
            }
          } else {
            if (timeDiffMs <= 0) {
              console.log(`⏭️ Событие "${event.title}" уже прошло (timeDiffMs=${timeDiffMs})`);
            } else {
              console.log(`⏭️ Для события "${event.title}" еще не время напоминания (осталось ${timeDiffMinutes} мин, нужно <= ${event.reminderMinutes + 1} мин)`);
            }
          }
        }
        
        if (remindersSent > 0) {
          console.log(`📊 [${now.toISOString()}] Отправлено ${remindersSent} напоминаний`);
        }
        
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        for (const key of sentReminders) {
          const parts = key.split('_');
          const eventTime = parseInt(parts[parts.length - 1]);
          if (eventTime < oneDayAgo.getTime()) {
            sentReminders.delete(key);
          }
        }
      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Ошибка при проверке напоминаний:`, error);
        console.error('Stack trace:', error.stack);
      }
    };

    checkReminders();
    this.reminderCheckInterval = setInterval(checkReminders, 60000);
    
    console.log('✅ Периодическая проверка напоминаний запущена');
  }

  async ensureReminderChecker() {
    if (this.reminderCheckInterval) {
      return;
    }

    const hasEvents = await this.shouldStartChecker();
    if (hasEvents) {
      console.log('📅 Найдены события с напоминаниями на сегодня, запускаем проверку');
      this.startReminderChecker();
    } else {
      console.log('📭 Событий с напоминаниями на сегодня не найдено, проверка не запущена');
    }
  }

  startTaskCleanup() {
    if (this.cleanupJob) {
      this.cleanupJob.cancel();
    }

    this.cleanupJob = schedule.scheduleJob('0 0 3 * * 0', async () => {
      await this.cleanupOldTasks();
    });

    console.log('🧹 Автоматическая очистка завершенных задач запущена (каждое воскресенье в 03:00)');
  }

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


