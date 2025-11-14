FROM node:18-slim

RUN apt-get update -y && \
    apt-get install -y \
    openssl \
    build-essential \
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

