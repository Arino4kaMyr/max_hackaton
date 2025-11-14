const MINUTE = 60 * 1000;

class PomodoroManager {
  constructor(bot, showTimerScreenCallback, store, timerKeyboard = null) {
    this.bot = bot;
    this.sessions = new Map();
    this.showTimerScreen = showTimerScreenCallback;
    this.store = store;
    this.timerKeyboard = timerKeyboard;
  }

  getSession(userId) {
    return this.sessions.get(userId);
  }

  async start(userId, ctx, task, config) {
    await this.stop(userId, false);

    const taskId = task?._dbId || null;
    const dbSession = await this.store.createPomodoroSession(userId, {
      taskId,
      workMinutes: config.workMinutes || 25,
      breakMinutes: config.breakMinutes || 5,
      cycles: config.cycles || 4,
      currentCycle: 1,
    });

    const session = {
      userId,
      task,
      ctx,
      dbId: dbSession.id,
      workMinutes: config.workMinutes || 25,
      breakMinutes: config.breakMinutes || 5,
      cycles: config.cycles || 4,
      currentCycle: 1,
      timers: [],
      isWorkPhase: true,
    };

    this.sessions.set(userId, session);
    this.runWorkPhase(session);
  }

  runWorkPhase(session) {
    const { workMinutes } = session;
    session.isWorkPhase = true;
    
    if (this.showTimerScreen) {
      this.showTimerScreen(session.ctx).catch(err => {
        console.error('Error updating timer screen:', err);
      });
    }
    
    const timer = setTimeout(() => this.runBreakPhase(session), workMinutes * MINUTE);
    session.timers.push(timer);
  }

  runBreakPhase(session) {
    const { breakMinutes } = session;
    session.isWorkPhase = false;
    
    if (this.showTimerScreen) {
      this.showTimerScreen(session.ctx).catch(err => {
        console.error('Error updating timer screen:', err);
      });
    }
    
    const timer = setTimeout(() => {
      this.finishCycle(session).catch(err => {
        console.error('Error finishing cycle:', err);
      });
    }, breakMinutes * MINUTE);
    session.timers.push(timer);
  }

  async finishCycle(session) {
    const completedCycle = session.currentCycle;
    session.currentCycle += 1;

    if (session.dbId) {
      try {
        await this.store.updatePomodoroSession(session.dbId, {
          currentCycle: session.currentCycle,
        });
      } catch (error) {
        console.error('Error updating pomodoro session:', error);
      }
    }

    if (session.currentCycle > session.cycles) {
      if (session.dbId) {
        try {
          await this.store.completePomodoroSession(session.dbId);
        } catch (error) {
          console.error('Error completing pomodoro session:', error);
        }
      }
      
      const messageOptions = {
        format: 'markdown'
      };
      
      if (this.timerKeyboard) {
        messageOptions.attachments = [this.timerKeyboard];
      }
      
      session.ctx.reply('✅ *Помодоро завершён!*\n\nОтличная работа! Все циклы выполнены.', messageOptions);
      await this.stop(session.userId, false);
      return;
    }

    session.ctx.reply(`✅ *Цикл ${completedCycle} завершён!*\n\nНачинаем цикл ${session.currentCycle}/${session.cycles}.`, {
      format: 'markdown'
    });
    
    if (this.showTimerScreen) {
      this.showTimerScreen(session.ctx).catch(err => {
        console.error('Error updating timer screen:', err);
      });
    }

    this.runWorkPhase(session);
  }

  async stop(userId, notify = true) {
    const session = this.sessions.get(userId);
    if (!session) return false;

    session.timers.forEach(clearTimeout);
    
    if (session.dbId) {
      try {
        await this.store.completePomodoroSession(session.dbId);
      } catch (error) {
        console.error('Error completing pomodoro session on stop:', error);
      }
    }
    
    this.sessions.delete(userId);

    if (notify) {
      session.ctx.reply('⏹️ Помодоро остановлен.');
    }
    return true;
  }
}

export default PomodoroManager;

