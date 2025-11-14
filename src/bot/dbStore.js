import { UserRepository } from '../database/repositories/userRepository.js';
import { TaskRepository } from '../database/repositories/taskRepository.js';
import { EventRepository } from '../database/repositories/eventRepository.js';
import { UserSettingsRepository } from '../database/repositories/userSettingsRepository.js';
import { PomodoroRepository } from '../database/repositories/pomodoroRepository.js';
import { getPrisma } from '../database/prisma.js';

class DBStore {
  constructor() {
    this.userRepo = new UserRepository();
    this.taskRepo = new TaskRepository();
    this.eventRepo = new EventRepository();
    this.settingsRepo = new UserSettingsRepository();
    this.pomodoroRepo = new PomodoroRepository();
    
    this.sessions = new Map();
    this.lastMessageIds = new Map();
  }

  async ensureUser(maxUserId, chatId = null) {
    const user = await this.userRepo.createOrFind({
      maxUserId: maxUserId.toString(),
      chatId: chatId?.toString() || null,
    });
    return user;
  }

  async getUserByMaxId(maxUserId) {
    return await this.userRepo.findByMaxUserId(maxUserId.toString());
  }

  async getUser(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return null;
    
    const tasks = await this.getTasks(maxUserId);
    const events = await this.getEvents(maxUserId);
    const settings = await this.getSettings(maxUserId);
    
    return {
      userId: maxUserId,
      tasks,
      events,
      settings,
    };
  }

  async upsertTask(maxUserId, payload) {
    const user = await this.ensureUser(maxUserId);
    
    if (payload.id) {
      return await this.taskRepo.update(payload.id, {
        title: payload.title,
        description: payload.description,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      });
    }
    
    return await this.taskRepo.create({
      userId: user.id,
      title: payload.title,
      description: payload.description,
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
    });
  }

  async getTasks(maxUserId, includeCompleted = true) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return [];
    
    const tasks = await this.taskRepo.findByUserId(user.id, includeCompleted);
    
    return tasks.map((task, index) => ({
      id: index + 1, // Для совместимости с ботом используем порядковый номер
      _dbId: task.id, // Сохраняем реальный ID из БД
      title: task.title,
      description: task.description,
      dueDate: task.dueDate?.toISOString(),
      completed: task.completed || false,
      completedAt: task.completedAt?.toISOString(),
      createdAt: task.createdAt.toISOString(),
    }));
  }

  async completeTask(maxUserId, taskId) {
    const tasks = await this.getTasks(maxUserId);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task || !task._dbId) return null;
    
    const completed = await this.taskRepo.complete(task._dbId);
    if (completed) {
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        completed: true,
        completedAt: completed.completedAt?.toISOString(),
      };
    }
    return null;
  }

  async getTaskStats(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) {
      return {
        total: 0,
        completed: 0,
        active: 0,
        completionRate: 0,
      };
    }
    
    return await this.taskRepo.getStats(user.id);
  }

  /**
   * Удаляет старые завершенные задачи (старше 7 дней)
   * @returns {Promise<number>} - количество удаленных задач
   */
  async cleanupOldCompletedTasks() {
    return await this.taskRepo.deleteOldCompletedTasks(7);
  }

  async removeTask(maxUserId, taskId) {
    const tasks = await this.getTasks(maxUserId);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task || !task._dbId) return null;
    
    const removed = await this.taskRepo.findById(task._dbId);
    if (removed) {
      await this.taskRepo.delete(task._dbId);
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
      };
    }
    return null;
  }

  async upsertEvent(maxUserId, payload) {
    const user = await this.ensureUser(maxUserId);
    
    const newEvent = await this.eventRepo.create({
      userId: user.id,
      title: payload.title,
      description: payload.description,
      datetime: payload.datetime ? new Date(payload.datetime) : new Date(),
      reminderMinutes: payload.reminderMinutes || null,
    });
    
    const events = await this.getEvents(maxUserId);
    return events.find(e => e._dbId === newEvent.id);
  }

  async getEvents(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return [];
    
    const events = await this.eventRepo.findByUserId(user.id);
    
    return events.map((event, index) => ({
      id: index + 1,
      _dbId: event.id,
      title: event.title,
      description: event.description,
      datetime: event.datetime.toISOString(),
      reminderMinutes: event.reminderMinutes,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  async removeEvent(maxUserId, eventId) {
    const events = await this.getEvents(maxUserId);
    const event = events.find(e => e.id === eventId);
    
    if (!event || !event._dbId) return null;
    
    const removed = await this.eventRepo.findById(event._dbId);
    if (removed) {
      await this.eventRepo.delete(event._dbId);
      return {
        id: event.id,
        title: event.title,
        datetime: event.datetime,
        reminderMinutes: event.reminderMinutes,
      };
    }
    return null;
  }

  async getSettings(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) {
      return {
        dailyDigest: true,
        dailyDigestTime: '09:00',
        reminderMinutesBeforeEvent: 30,
        timezone: process.env.TIMEZONE || 'Europe/Moscow',
      };
    }
    
    return await this.settingsRepo.findByUserId(user.id);
  }

  async isNewUser(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return true;
    
    const prisma = getPrisma();
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });
    
    return !settings;
  }

  async updateSettings(maxUserId, updates) {
    const user = await this.ensureUser(maxUserId);
    return await this.settingsRepo.createOrUpdate(user.id, updates);
  }

  setSession(maxUserId, session) {
    this.sessions.set(maxUserId.toString(), session);
  }

  getSession(maxUserId) {
    return this.sessions.get(maxUserId.toString());
  }

  clearSession(maxUserId) {
    this.sessions.delete(maxUserId.toString());
  }

  setLastMessageId(maxUserId, messageId) {
    this.lastMessageIds.set(maxUserId.toString(), messageId);
  }

  getLastMessageId(maxUserId) {
    return this.lastMessageIds.get(maxUserId.toString());
  }

  clearLastMessageId(maxUserId) {
    this.lastMessageIds.delete(maxUserId.toString());
  }

  async createPomodoroSession(maxUserId, sessionData) {
    const user = await this.ensureUser(maxUserId);
    
    return await this.pomodoroRepo.create({
      userId: user.id,
      taskId: sessionData.taskId || null,
      workMinutes: sessionData.workMinutes,
      breakMinutes: sessionData.breakMinutes,
      cycles: sessionData.cycles,
      currentCycle: sessionData.currentCycle || 1,
    });
  }

  async getActivePomodoroSession(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return null;
    
    return await this.pomodoroRepo.findActiveByUserId(user.id);
  }

  async updatePomodoroSession(sessionId, updates) {
    return await this.pomodoroRepo.update(sessionId, updates);
  }

  async completePomodoroSession(sessionId) {
    return await this.pomodoroRepo.complete(sessionId);
  }

  async getPomodoroStats(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return null;

    const [today, week, month, total] = await Promise.all([
      this.pomodoroRepo.getTodayStats(user.id),
      this.pomodoroRepo.getWeekStats(user.id),
      this.pomodoroRepo.getMonthStats(user.id),
      this.pomodoroRepo.getTotalStats(user.id),
    ]);

    return {
      today,
      week,
      month,
      total,
    };
  }

  async getPomodoroTotalStats(maxUserId) {
    const user = await this.getUserByMaxId(maxUserId);
    if (!user) return null;

    return await this.pomodoroRepo.getTotalStats(user.id);
  }

}

const dbStore = new DBStore();
export default dbStore;

