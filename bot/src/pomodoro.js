const MINUTE = 60 * 1000;

class PomodoroManager {
  constructor(bot) {
    this.bot = bot;
    this.sessions = new Map();
  }

  getSession(userId) {
    return this.sessions.get(userId);
  }

  start(userId, ctx, task, config) {
    this.stop(userId, false);

    const session = {
      userId,
      task,
      ctx,
      workMinutes: config.workMinutes || 25,
      breakMinutes: config.breakMinutes || 5,
      cycles: config.cycles || 4,
      currentCycle: 1,
      timers: [],
    };

    this.sessions.set(userId, session);
    this.runWorkPhase(session);
  }

  runWorkPhase(session) {
    const { ctx, task, currentCycle, cycles, workMinutes } = session;
    const taskTitle = task?.title ? `"${task.title}"` : 'без задачи';
    ctx.reply(`🔥 Цикл ${currentCycle}/${cycles}. Работаем ${taskTitle} ${workMinutes} мин.`);

    const timer = setTimeout(() => this.runBreakPhase(session), workMinutes * MINUTE);
    session.timers.push(timer);
  }

  runBreakPhase(session) {
    const { ctx, breakMinutes, currentCycle, cycles } = session;
    ctx.reply(`☕ Перерыв ${breakMinutes} мин.`);

    const timer = setTimeout(() => this.finishCycle(session), breakMinutes * MINUTE);
    session.timers.push(timer);
  }

  finishCycle(session) {
    session.currentCycle += 1;

    if (session.currentCycle > session.cycles) {
      session.ctx.reply('✅ Помодоро завершён! Отличная работа.');
      this.stop(session.userId, false);
      return;
    }

    this.runWorkPhase(session);
  }

  stop(userId, notify = true) {
    const session = this.sessions.get(userId);
    if (!session) return false;

    session.timers.forEach(clearTimeout);
    this.sessions.delete(userId);

    if (notify) {
      session.ctx.reply('⏹️ Помодоро остановлен.');
    }
    return true;
  }
}

export default PomodoroManager;

