import { getPrisma } from '../prisma.js';

export class TaskRepository {
  async create(task) {
    const prisma = getPrisma();
    
    return await prisma.task.create({
      data: {
        userId: task.userId,
        title: task.title,
        description: task.description || null,
        dueDate: task.dueDate || null,
      },
    });
  }

  async findById(id) {
    const prisma = getPrisma();
    
    return await prisma.task.findUnique({
      where: { id },
    });
  }

  async findByUserId(userId, includeCompleted = true) {
    const prisma = getPrisma();
    
    const where = { userId };
    if (!includeCompleted) {
      where.completed = false;
    }
    
    return await prisma.task.findMany({
      where,
      orderBy: [
        { completed: 'asc' }, // Сначала незавершенные
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async getStats(userId) {
    const prisma = getPrisma();
    
    const total = await prisma.task.count({
      where: { userId },
    });
    
    const completed = await prisma.task.count({
      where: { userId, completed: true },
    });
    
    const active = total - completed;
    
    return {
      total,
      completed,
      active,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  async update(id, updates) {
    const prisma = getPrisma();
    
    // Убираем поля, которых нет в схеме
    const { deadline, ...validUpdates } = updates;
    if (deadline) validUpdates.dueDate = deadline;
    
    // Если задача завершается, устанавливаем completedAt
    if (validUpdates.completed === true && !validUpdates.completedAt) {
      validUpdates.completedAt = new Date();
    } else if (validUpdates.completed === false) {
      validUpdates.completedAt = null;
    }
    
    return await prisma.task.update({
      where: { id },
      data: validUpdates,
    });
  }

  async complete(id) {
    const prisma = getPrisma();
    
    return await prisma.task.update({
      where: { id },
      data: {
        completed: true,
        completedAt: new Date(),
      },
    });
  }

  async uncomplete(id) {
    const prisma = getPrisma();
    
    return await prisma.task.update({
      where: { id },
      data: {
        completed: false,
        completedAt: null,
      },
    });
  }

  async delete(id) {
    const prisma = getPrisma();
    
    return await prisma.task.delete({
      where: { id },
    });
  }

  /**
   * Удаляет завершенные задачи старше указанного количества дней
   * @param {number} daysOld - количество дней (по умолчанию 7)
   * @returns {Promise<number>} - количество удаленных задач
   */
  async deleteOldCompletedTasks(daysOld = 7) {
    const prisma = getPrisma();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await prisma.task.deleteMany({
      where: {
        completed: true,
        completedAt: {
          lt: cutoffDate,
        },
      },
    });
    
    return result.count;
  }
}
