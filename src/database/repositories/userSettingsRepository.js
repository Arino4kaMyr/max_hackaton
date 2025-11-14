import { getPrisma } from '../prisma.js';

export class UserSettingsRepository {
  async createOrUpdate(userId, settings) {
    const prisma = getPrisma();
    
    return await prisma.userSettings.upsert({
      where: { userId },
      update: {
        dailyDigest: settings.dailyDigest,
        dailyDigestTime: settings.dailyDigestTime,
        reminderMinutesBeforeEvent: settings.reminderMinutesBeforeEvent,
        timezone: settings.timezone,
        pomodoroWorkMinutes: settings.pomodoroWorkMinutes,
        pomodoroBreakMinutes: settings.pomodoroBreakMinutes,
        pomodoroCycles: settings.pomodoroCycles,
      },
      create: {
        userId,
        dailyDigest: settings.dailyDigest ?? true,
        dailyDigestTime: settings.dailyDigestTime || '09:00',
        reminderMinutesBeforeEvent: settings.reminderMinutesBeforeEvent ?? 30,
        timezone: settings.timezone || 'Europe/Moscow',
        pomodoroWorkMinutes: settings.pomodoroWorkMinutes ?? 25,
        pomodoroBreakMinutes: settings.pomodoroBreakMinutes ?? 5,
        pomodoroCycles: settings.pomodoroCycles ?? 4,
      },
    });
  }

  async findByUserId(userId) {
    const prisma = getPrisma();
    
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });
    
    // Возвращаем дефолтные настройки, если их нет
    if (!settings) {
      return {
        userId,
        dailyDigest: true,
        dailyDigestTime: '09:00',
        reminderMinutesBeforeEvent: 30,
        timezone: process.env.TIMEZONE || 'Europe/Moscow',
        pomodoroWorkMinutes: 25,
        pomodoroBreakMinutes: 5,
        pomodoroCycles: 4,
      };
    }
    
    return settings;
  }

  async update(userId, updates) {
    const prisma = getPrisma();
    
    return await prisma.userSettings.update({
      where: { userId },
      data: updates,
    });
  }
}

