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
      },
      create: {
        userId,
        dailyDigest: settings.dailyDigest ?? true,
        dailyDigestTime: settings.dailyDigestTime || '09:00',
        reminderMinutesBeforeEvent: settings.reminderMinutesBeforeEvent ?? 30,
        timezone: settings.timezone || 'Europe/Moscow',
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

