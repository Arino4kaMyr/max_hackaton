FROM node:18-slim

ENV TZ=Europe/Moscow

RUN apt-get update -y && \
    apt-get install -y \
    openssl \
    build-essential \
    tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma

RUN npx prisma generate

COPY src ./src

COPY scripts/init-db.sh /app/init-db.sh
RUN chmod +x /app/init-db.sh

ENV PORT=3000
EXPOSE 3000

CMD ["/app/init-db.sh"]

