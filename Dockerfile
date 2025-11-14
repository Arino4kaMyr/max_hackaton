FROM node:18-slim

# Устанавливаем зависимости для canvas и Prisma
RUN apt-get update -y && \
    apt-get install -y \
    openssl \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем корневой package.json и устанавливаем зависимости (для Prisma)
COPY package.json package-lock.json* ./
RUN npm install

# Копируем Prisma схему
COPY prisma ./prisma

# Генерируем Prisma Client
RUN npx prisma generate

# Копируем репозитории и Prisma клиент
COPY src ./src

# Копируем package.json бота и устанавливаем зависимости
COPY bot/package.json bot/package-lock.json* ./bot/
WORKDIR /app/bot
RUN npm install

# Копируем код бота
WORKDIR /app
COPY bot/src ./bot/src

# Копируем скрипт инициализации
COPY scripts/init-db.sh /app/init-db.sh
RUN chmod +x /app/init-db.sh

ENV PORT=3000
EXPOSE 3000

# Запускаем скрипт инициализации
CMD ["/app/init-db.sh"]

