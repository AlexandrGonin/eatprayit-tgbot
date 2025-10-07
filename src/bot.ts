import { Bot } from 'grammy';
import dotenv from 'dotenv';
import { 
  createUser, 
  getUserByTelegramId, 
  getUserByReferralCode, 
  addReferral, 
  canUserAccessMiniApp,
  getReferralLink 
} from './database/supabase.js'; 
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Команда /start
bot.command('start', async (ctx) => {
  try {
    const telegramId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;
    
    if (!telegramId || !firstName) {
      return await ctx.reply('Не удалось получить данные пользователя.');
    }

    const referralCode = ctx.match;
    let referredBy: number | null = null;

    if (referralCode) {
      const referrer = await getUserByReferralCode(referralCode);
      if (referrer && referrer.telegram_id !== telegramId) {
        referredBy = referrer.telegram_id;
      }
    }

    const existingUser = await getUserByTelegramId(telegramId);
    
    if (existingUser) {
      let welcomeMessage = `👋 С возвращением, ${firstName}!\n\n💰 Ваши монеты: ${existingUser.coins}\n👥 Ваши рефералы: ${existingUser.referral_count}`;

      // Только пользователи с рефералами получают ссылку
      const referralLink = await getReferralLink(telegramId, ctx.me.username);
      if (referralLink) {
        welcomeMessage += `\n\n🎯 Ваша реферальная ссылка:\n${referralLink}\n\nОтправляй друзьям и получай +1 монету!`;
      } else {
        welcomeMessage += `\n\n📊 Пригласи друзей чтобы получить реферальную ссылку!`;
      }

      await ctx.reply(welcomeMessage);
      
      if (referredBy && !existingUser.referred_by) {
        await addReferral(referredBy, telegramId);
        await ctx.reply('🎉 Вы присоединились по реферальной ссылке! Друг получил +1 монету.');
      }
    } else {
      const newUser = await createUser(telegramId, username || null, firstName, lastName || null, referredBy);
      
      let welcomeMessage = `🎉 Добро пожаловать, ${firstName}!\n\nТеперь у вас есть доступ к Mini App!\n\n💰 Ваши монеты: ${newUser.coins}\n📊 Пригласи друзей чтобы получить реферальную ссылку!`;

      if (referredBy) {
        await addReferral(referredBy, telegramId);
        welcomeMessage += '\n\n🎉 Вы присоединились по реферальной ссылке! Друг получил +1 монету.';
      }

      await ctx.reply(welcomeMessage);
    }
  } catch (error) {
    console.error('Error in /start:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Команда /status
bot.command('status', async (ctx) => {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      return await ctx.reply('Сначала используйте /start');
    }

    let statusMessage = `📊 Ваш статус:\n\n💰 Монеты: ${user.coins}\n👥 Рефералов: ${user.referral_count}`;

    // Только пользователи с рефералами получают ссылку
    const referralLink = await getReferralLink(telegramId, ctx.me.username);
    if (referralLink) {
      statusMessage += `\n\n🎯 Ваша реферальная ссылка:\n${referralLink}`;
      statusMessage += `\n\nПриглашайте друзей и получайте +1 монету за каждого!`;
    } else {
      statusMessage += `\n\n📊 Пригласите первого друга чтобы получить реферальную ссылку!`;
    }

    await ctx.reply(statusMessage);
  } catch (error) {
    console.error('Error in /status:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Команда /referral
bot.command('referral', async (ctx) => {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      return await ctx.reply('Сначала используйте /start');
    }

    // Только пользователи с рефералами получают ссылку
    const referralLink = await getReferralLink(telegramId, ctx.me.username);
    if (!referralLink) {
      return await ctx.reply('📊 Пригласите первого друга чтобы получить реферальную ссылку!');
    }

    const referralMessage = `🎯 Ваша реферальная ссылка:\n\n${referralLink}\n\nПриглашайте друзей и получайте +1 монету за каждого!\n\nВаши друзья получат доступ к Mini App после регистрации по вашей ссылке!`;
    
    await ctx.reply(referralMessage);
  } catch (error) {
    console.error('Error in /referral:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Команда /help
bot.command('help', async (ctx) => {
  const helpMessage = `
🤖 Доступные команды:

/start - Начать работу с ботом
/status - Показать ваш статус и монеты
/referral - Получить реферальную ссылку
/help - Показать это сообщение

🎯 Как это работает:
1. Используйте /start для регистрации
2. Пригласите друзей чтобы получить реферальную ссылку
3. За каждого друга получаете +1 монету
4. Ваши друзья получают доступ к Mini App
5. Используйте монеты в приложении!

📱 Mini App доступен после регистрации через бота.
  `;
  
  await ctx.reply(helpMessage);
});

// Обработка текстовых сообщений
bot.on('message', async (ctx) => {
  if (ctx.message.text && !ctx.message.text.startsWith('/')) {
    await ctx.reply('Используйте /help для просмотра доступных команд.');
  }
});

// Обработка ошибок
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Запуск бота
console.log('🤖 Бот запускается...');
bot.start();