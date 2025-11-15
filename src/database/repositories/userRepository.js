import { getPrisma } from '../prisma.js';

export class UserRepository {
  async createOrFind(user) {
    const prisma = getPrisma();
    
    const existing = await prisma.user.findUnique({
      where: { maxUserId: user.maxUserId },
    });
    
    if (existing) {
      if (user.chatId && existing.chatId !== user.chatId) {
        return await prisma.user.update({
          where: { id: existing.id },
          data: { chatId: user.chatId },
        });
      }
      return existing;
    }
    
    return await prisma.user.create({
      data: {
        maxUserId: user.maxUserId,
        chatId: user.chatId || null,
        name: user.name || null,
      },
    });
  }

  async updateChatId(userId, chatId) {
    const prisma = getPrisma();
    
    return await prisma.user.update({
      where: { id: userId },
      data: { chatId },
    });
  }

  async findAll() {
    const prisma = getPrisma();
    
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByMaxUserId(maxUserId) {
    const prisma = getPrisma();
    
    return await prisma.user.findUnique({
      where: { maxUserId },
    });
  }

  async findById(id) {
    const prisma = getPrisma();
    
    return await prisma.user.findUnique({
      where: { id },
    });
  }
}
