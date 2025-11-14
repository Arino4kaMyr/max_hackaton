const DEFAULT_SETTINGS = {
  dailyDigest: true,
  reminderMinutesBeforeEvent: 30,
  timezone: process.env.TIMEZONE || 'Europe/Moscow',
};

class MemoryStore {
  constructor() {
    this.users = new Map();
  }

  ensureUser(userId) {
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        tasks: [],
        events: [],
        settings: { ...DEFAULT_SETTINGS },
        session: null,
        counters: { task: 1, event: 1 },
      });
    }
    return this.users.get(userId);
  }

  getUser(userId) {
    return this.ensureUser(userId);
  }

  upsertTask(userId, payload) {
    const user = this.ensureUser(userId);
    const task = { id: user.counters.task++, ...payload };
    user.tasks.push(task);
    return task;
  }

  upsertEvent(userId, payload) {
    const user = this.ensureUser(userId);
    const event = { id: user.counters.event++, ...payload };
    user.events.push(event);
    return event;
  }

  setSession(userId, session) {
    const user = this.ensureUser(userId);
    user.session = session;
    return user.session;
  }

  getSession(userId) {
    const user = this.ensureUser(userId);
    return user.session;
  }

  clearSession(userId) {
    const user = this.ensureUser(userId);
    user.session = null;
  }

  getSettings(userId) {
    const user = this.ensureUser(userId);
    return user.settings;
  }

  updateSettings(userId, nextSettings) {
    const user = this.ensureUser(userId);
    user.settings = { ...user.settings, ...nextSettings };
    return user.settings;
  }

  getTasks(userId) {
    return this.ensureUser(userId).tasks;
  }

  getEvents(userId) {
    return this.ensureUser(userId).events;
  }

  removeTask(userId, taskId) {
    const user = this.ensureUser(userId);
    const index = user.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) {
      return null;
    }
    const [removed] = user.tasks.splice(index, 1);
    return removed;
  }

  removeEvent(userId, eventId) {
    const user = this.ensureUser(userId);
    const index = user.events.findIndex((event) => event.id === eventId);
    if (index === -1) {
      return null;
    }
    const [removed] = user.events.splice(index, 1);
    return removed;
  }

  getAllUsers() {
    return Array.from(this.users.entries()).map(([userId, data]) => ({
      userId,
      ...data,
    }));
  }
}

const store = new MemoryStore();

export default store;

