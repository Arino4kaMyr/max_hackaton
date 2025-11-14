/**
 * Генератор изображений для статистики Pomodoro
 * Использует canvas для создания красивых диаграмм
 */

import { createCanvas, registerFont } from 'canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFile, unlink } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Генерирует изображение со статистикой Pomodoro
 * @param {Object} stats - Статистика помодоро
 * @param {Object} session - Текущая активная сессия (опционально)
 * @returns {Promise<string>} - Путь к сгенерированному изображению
 */
export async function generatePomodoroChart(stats, session = null) {
  const width = 800;
  const height = session ? 600 : 500;
  const padding = 40;
  const chartArea = {
    x: padding,
    y: padding,
    width: width - padding * 2,
    height: height - padding * 2,
  };

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Фон
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Заголовок
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🍅 Pomodoro Статистика', width / 2, 50);

  let yOffset = 100;

  // Если есть активная сессия, показываем её
  if (session) {
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Текущая сессия:', padding, yOffset);
    yOffset += 40;

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    const taskTitle = session.task?.title || 'Свободный режим';
    ctx.fillText(`Задача: ${taskTitle}`, padding, yOffset);
    yOffset += 30;

    // Прогресс текущей сессии
    const progress = session.currentCycle / session.cycles;
    const barWidth = chartArea.width;
    const barHeight = 30;
    const barX = padding;
    const barY = yOffset;

    // Фон прогресс-бара
    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Заполненная часть
    ctx.fillStyle = '#4ecdc4';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);

    // Текст прогресса
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Цикл ${session.currentCycle}/${session.cycles} (${Math.round(progress * 100)}%)`,
      width / 2,
      barY + barHeight / 2 + 6
    );

    yOffset += 60;
  }

  if (stats && stats.totalSessions > 0) {
    // Общая статистика
    ctx.fillStyle = '#4ecdc4';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Общая статистика:', padding, yOffset);
    yOffset += 50;

    const statsData = [
      { label: 'Сессий', value: stats.totalSessions, max: 50, color: '#ff6b6b' },
      { label: 'Циклов', value: stats.totalCycles, max: 100, color: '#4ecdc4' },
      { label: 'Часов работы', value: stats.totalHours, max: 50, color: '#ffe66d' },
    ];

    statsData.forEach((item, index) => {
      const barWidth = chartArea.width;
      const barHeight = 40;
      const barX = padding;
      const barY = yOffset + index * 60;

      // Текст метки
      ctx.fillStyle = '#ffffff';
      ctx.font = '18px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${item.label}: ${item.value}`, barX, barY - 5);

      // Фон бара
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Заполненная часть
      const fillWidth = Math.min((item.value / item.max) * barWidth, barWidth);
      ctx.fillStyle = item.color;
      ctx.fillRect(barX, barY, fillWidth, barHeight);

      // Процент
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'right';
      const percentage = Math.min((item.value / item.max) * 100, 100);
      ctx.fillText(
        `${percentage.toFixed(0)}%`,
        barX + barWidth - 10,
        barY + barHeight / 2 + 6
      );
    });

    // Среднее значение
    yOffset += 200;
    ctx.fillStyle = '#ffe66d';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Среднее: ${stats.averageCyclesPerSession} циклов/сессия`,
      width / 2,
      yOffset
    );
  } else {
    // Нет статистики
    ctx.fillStyle = '#888888';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Запустите таймер, чтобы начать отслеживать статистику!', width / 2, height / 2);
  }

  // Создаем папку temp, если её нет
  const tempDir = join(__dirname, '../../temp');
  const fs = await import('fs/promises');
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (error) {
    // Папка уже существует или ошибка создания
  }

  // Сохраняем изображение во временный файл
  const tempPath = join(tempDir, `pomodoro_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await writeFile(tempPath, buffer);

  return tempPath;
}

/**
 * Удаляет временный файл изображения
 * @param {string} filePath - Путь к файлу
 */
export async function cleanupImage(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    // Игнорируем ошибки удаления
    console.warn('Failed to cleanup image:', error.message);
  }
}

