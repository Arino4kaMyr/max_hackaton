import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function validateEnv() {
  const required = ['BOT_TOKEN'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Ошибка: Отсутствуют обязательные переменные окружения:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📝 Создайте файл .env на основе .env.example:');
    console.error('   cp .env.example .env');
    console.error('   # Затем отредактируйте .env и добавьте необходимые значения\n');
    process.exit(1);
  }

  if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === 'your_bot_token_here') {
    console.error('❌ Ошибка: BOT_TOKEN не настроен!');
    console.error('📝 Укажите реальный токен бота в файле .env\n');
    process.exit(1);
  }
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || 'postgres';
  const dbName = process.env.DB_NAME || 'productivity_bot';
  const dbHost = process.env.DB_HOST || (process.env.DOCKER_ENV ? 'db' : 'localhost');
  const dbPort = process.env.DB_PORT || '5432';

  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=public`;
}

export function loadEnv() {
  validateEnv();
  
  const databaseUrl = getDatabaseUrl();
  
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrl;
  }
  
  return {
    botToken: process.env.BOT_TOKEN,
    databaseUrl: databaseUrl,
    timezone: process.env.TIMEZONE || 'Europe/Moscow',
    port: parseInt(process.env.PORT || '3000', 10),
    encryptionSecretKey: process.env.ENCRYPTION_SECRET_KEY || '',
    nodeEnv: process.env.NODE_ENV || 'production',
    dbUser: process.env.DB_USER || 'postgres',
    dbPassword: process.env.DB_PASSWORD || 'postgres',
    dbName: process.env.DB_NAME || 'productivity_bot',
    dbHost: process.env.DB_HOST || (process.env.DOCKER_ENV ? 'db' : 'localhost'),
    dbPort: parseInt(process.env.DB_PORT || '5432', 10),
  };
}

