import { getPrisma } from '../prisma.js';

export class PomodoroRepository {
  async create(session) {
    const prisma = getPrisma();
    
    return await prisma.pomodoroSession.create({
      data: {
        userId: session.userId,
        taskId: session.taskId || null,
        workMinutes: session.workMinutes,
        breakMinutes: session.breakMinutes,
        cycles: session.cycles,
        currentCycle: session.currentCycle || 1,
        isActive: true,
      },
    });
  }

  async findById(id) {
    const prisma = getPrisma();
    
    return await prisma.pomodoroSession.findUnique({
      where: { id },
    });
  }

  async findActiveByUserId(userId) {
    const prisma = getPrisma();
    
    return await prisma.pomodoroSession.findFirst({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async update(id, updates) {
    const prisma = getPrisma();
    
    return await prisma.pomodoroSession.update({
      where: { id },
      data: updates,
    });
  }

  async complete(id) {
    const prisma = getPrisma();
    
    return await prisma.pomodoroSession.update({
      where: { id },
      data: {
        isActive: false,
        completedAt: new Date(),
      },
    });
  }

  async delete(id) {
    const prisma = getPrisma();
    
    return await prisma.pomodoroSession.delete({
      where: { id },
    });
  }

  // ========== Статистика ==========

  /**
   * Получить все завершенные сессии пользователя
   */
  async findCompletedByUserId(userId, limit = null) {
    const prisma = getPrisma();
    
    const query = {
      where: {
        userId,
        isActive: false,
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
    };

    if (limit) {
      query.take = limit;
    }

    return await prisma.pomodoroSession.findMany(query);
  }

  /**
   * Статистика за период
   */
  async getStatsByDateRange(userId, startDate, endDate) {
    const prisma = getPrisma();
    
    const sessions = await prisma.pomodoroSession.findMany({
      where: {
        userId,
        isActive: false,
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    return {
      totalSessions: sessions.length,
      totalCycles: sessions.reduce((sum, s) => sum + s.cycles, 0),
      totalWorkMinutes: sessions.reduce((sum, s) => sum + (s.workMinutes * s.cycles), 0),
      totalBreakMinutes: sessions.reduce((sum, s) => sum + (s.breakMinutes * s.cycles), 0),
      sessions,
    };
  }

  /**
   * Статистика за сегодня
   */
  async getTodayStats(userId) {
    const prisma = getPrisma();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await this.getStatsByDateRange(userId, today, tomorrow);
  }

  /**
   * Статистика за неделю
   */
  async getWeekStats(userId) {
    const prisma = getPrisma();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    const now = new Date();

    return await this.getStatsByDateRange(userId, weekAgo, now);
  }

  /**
   * Статистика за месяц
   */
  async getMonthStats(userId) {
    const prisma = getPrisma();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    monthAgo.setHours(0, 0, 0, 0);
    const now = new Date();

    return await this.getStatsByDateRange(userId, monthAgo, now);
  }

  /**
   * Общая статистика пользователя
   */
  async getTotalStats(userId) {
    const prisma = getPrisma();
    
    const sessions = await prisma.pomodoroSession.findMany({
      where: {
        userId,
        isActive: false,
        completedAt: { not: null },
      },
    });

    return {
      totalSessions: sessions.length,
      totalCycles: sessions.reduce((sum, s) => sum + s.cycles, 0),
      totalWorkMinutes: sessions.reduce((sum, s) => sum + (s.workMinutes * s.cycles), 0),
      totalBreakMinutes: sessions.reduce((sum, s) => sum + (s.breakMinutes * s.cycles), 0),
      totalHours: Math.round((sessions.reduce((sum, s) => sum + (s.workMinutes * s.cycles), 0)) / 60 * 10) / 10,
      averageCyclesPerSession: sessions.length > 0 
        ? Math.round((sessions.reduce((sum, s) => sum + s.cycles, 0) / sessions.length) * 10) / 10
        : 0,
    };
  }
}
