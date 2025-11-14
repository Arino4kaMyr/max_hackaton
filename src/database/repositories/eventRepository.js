import { getPrisma } from '../prisma.js';

export class EventRepository {
  async create(event) {
    const prisma = getPrisma();
    
    return await prisma.event.create({
      data: {
        userId: event.userId,
        title: event.title,
        description: event.description || null,
        datetime: event.datetime || event.startTime,
        reminderMinutes: event.reminderMinutes || null,
      },
    });
  }

  async findById(id) {
    const prisma = getPrisma();
    
    return await prisma.event.findUnique({
      where: { id },
    });
  }

  async findByUserId(userId, startDate, endDate) {
    const prisma = getPrisma();
    
    const where = { userId };
    
    if (startDate) {
      where.datetime = { gte: startDate };
    }
    
    if (endDate) {
      where.datetime = {
        ...where.datetime,
        lte: endDate,
      };
    }
    
    return await prisma.event.findMany({
      where,
      orderBy: { datetime: 'asc' },
    });
  }

  async findByUserIdAndDateRange(userId, startDate, endDate) {
    const prisma = getPrisma();
    
    return await prisma.event.findMany({
      where: {
        userId,
        datetime: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: { datetime: 'asc' },
    });
  }

  async findUpcomingEvents(reminderMinutes) {
    const prisma = getPrisma();
    const now = new Date();
    const reminderTime = new Date(now.getTime() + reminderMinutes * 60 * 1000);
    
    return await prisma.event.findMany({
      where: {
        datetime: {
          gt: now,
          lte: reminderTime,
        },
        reminderMinutes: {
          not: null,
        },
      },
      orderBy: { datetime: 'asc' },
    });
  }

  async delete(id) {
    const prisma = getPrisma();
    
    return await prisma.event.delete({
      where: { id },
    });
  }
}
