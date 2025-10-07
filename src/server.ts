import { Bot, webhookCallback } from 'grammy';
import express from 'express';
import { 
  createUser, 
  getUserByTelegramId, 
  getUserByReferralCode, 
  addReferral, 
  getReferralLink 
} from './database/supabase';

// Инициализация Express
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Bot is running', 
    timestamp: new Date().toISOString(),
    service: 'Telegram Bot Webhook'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Команда /start
bot.command('start', async (ctx) => {
  try {
    console.log('Received /start command from:', ctx.from?.id);
    
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
      console.log('Referral code detected:', referralCode);
      const referrer = await getUserByReferralCode(referralCode);
      if (referrer && referrer.telegram_id !== telegramId) {
        referredBy = referrer.telegram_id;
      }
    }

    const existingUser = await getUserByTelegramId(telegramId);
    
    if (existingUser) {
      // Проверяем, пришел ли пользователь по реферальной ссылке
      if (!existingUser.referred_by && !referralCode) {
        // Пользователь существует, но не пришел по реферальной ссылке
        const welcomeMessage = `👋 С возвращением, ${firstName}!\n\n` +
          `❌ У вас еще нет доступа к Mini App.\n\n` +
          `🔑 Чтобы получить доступ, попросите реферальную ссылку у друга или администратора.\n\n` +
          `📋 Доступные команды:\n` +
          `/status - Проверить статус\n` +
          `/help - Помощь`;

        return await ctx.reply(welcomeMessage);
      }

      const referralLink = `https://t.me/${ctx.me.username}?start=${existingUser.referral_code}`;
      
      let welcomeMessage = `👋 С возвращением, ${firstName}!\n\n` +
        `✅ У вас есть доступ к Mini App!\n\n` +
        `💰 Ваши монеты: ${existingUser.coins}\n` +
        `👥 Ваши рефералы: ${existingUser.referral_count}\n\n` +
        `🎯 Ваша реферальная ссылка:\n${referralLink}\n\n` +
        `Отправляй друзьям и получай +1 монету!\n\n` +
        `📋 Доступные команды:\n` +
        `/start - Главное меню\n` +
        `/status - Ваш статус и монеты\n` +
        `/referral - Получить реферальную ссылку\n` +
        `/help - Помощь и инструкция`;

      await ctx.reply(welcomeMessage);
      
      if (referredBy && !existingUser.referred_by) {
        await addReferral(referredBy, telegramId);
        await ctx.reply('🎉 Вы присоединились по реферальной ссылке! Друг получил +1 монету.');
      }
    } else {
      // Новый пользователь
      if (!referralCode) {
        // Новый пользователь без реферальной ссылки
        const welcomeMessage = `👋 Привет, ${firstName}!\n\n` +
          `❌ Для доступа к Mini App нужна реферальная ссылка.\n\n` +
          `🔑 Попросите ссылку у друга или администратора.\n\n` +
          `📋 Доступные команды:\n` +
          `/help - Помощь и инструкция`;

        return await ctx.reply(welcomeMessage);
      }

      // Создаем нового пользователя с реферальной ссылкой
      const newUser = await createUser(telegramId, username || null, firstName, lastName || null, referredBy);
      const referralLink = `https://t.me/${ctx.me.username}?start=${newUser.referral_code}`;
      
      let welcomeMessage = `🎉 Добро пожаловать, ${firstName}!\n\n` +
        `✅ Теперь у вас есть доступ к Mini App!\n\n` +
        `💰 Ваши монеты: ${newUser.coins}\n` +
        `🎯 Ваша реферальная ссылка:\n${referralLink}\n\n` +
        `Отправляй друзьям и получай +1 монету!\n\n` +
        `📋 Доступные команды:\n` +
        `/start - Главное меню\n` +
        `/status - Ваш статус и монеты\n` +
        `/referral - Получить реферальную ссылку\n` +
        `/help - Помощь и инструкция`;

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
      return await ctx.reply('❌ Сначала используйте /start для регистрации.');
    }

    const referralLink = `https://t.me/${ctx.me.username}?start=${user.referral_code}`;
    
    let statusMessage = `📊 Ваш статус:\n\n`;

    if (!user.referred_by) {
      statusMessage += `❌ У вас нет доступа к Mini App\n\n` +
        `🔑 Для доступа нужна реферальная ссылка от друга\n\n`;
    } else {
      statusMessage += `✅ У вас есть доступ к Mini App\n\n`;
    }

    statusMessage += `💰 Монеты: ${user.coins}\n` +
      `👥 Рефералов: ${user.referral_count}\n` +
      `🎯 Ваш реферальный код: ${user.referral_code}\n\n`;

    if (user.referral_count > 0) {
      statusMessage += `🔗 Реферальная ссылка:\n${referralLink}\n\n` +
        `Приглашайте друзей и получайте +1 монету за каждого!`;
    } else {
      statusMessage += `📊 Пригласите первого друга чтобы получить реферальную ссылку!`;
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
      return await ctx.reply('❌ Сначала используйте /start для регистрации.');
    }

    // Проверяем есть ли доступ к Mini App
    if (!user.referred_by) {
      return await ctx.reply('❌ У вас нет доступа к Mini App.\n\nДля получения реферальной ссылки сначала получите доступ через реферальную ссылку друга.');
    }

    // ВСЕГДА показываем реферальную ссылку, если есть доступ
    const referralLink = `https://t.me/${ctx.me.username}?start=${user.referral_code}`;
    
    const referralMessage = `🎯 Ваша реферальная ссылка:\n\n${referralLink}\n\n` +
      `Приглашайте друзей и получайте +1 монету за каждого!\n\n` +
      `💰 Ваши текущие монеты: ${user.coins}\n` +
      `👥 Приглашено друзей: ${user.referral_count}\n\n` +
      `Ваши друзья получат доступ к Mini App после регистрации по вашей ссылке!`;
    
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

/start - Главное меню и информация
/status - Показать ваш статус и монеты
/referral - Получить реферальную ссылку
/help - Показать это сообщение

🎯 Как это работает:
1. Получите реферальную ссылку от друга
2. Используйте /start с этой ссылкой для доступа к Mini App
3. После получения доступа используйте /referral чтобы получить свою ссылку
4. Приглашайте друзей и получайте +1 монету за каждого

📱 Mini App доступен только пользователям с реферальной ссылкой!
  `;
  
  await ctx.reply(helpMessage);
});

// Обработка текстовых сообщений
bot.on('message', async (ctx) => {
  if (ctx.message.text && !ctx.message.text.startsWith('/')) {
    await ctx.reply('Используйте /help для просмотра доступных команд.');
  }
});

// Webhook endpoint
app.post('/webhook', webhookCallback(bot, 'express'));

// Обработка ошибок
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Bot server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

// Если используем webhooks, нужно установить их
if (process.env.RENDER_EXTERNAL_URL) {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
  bot.api.setWebhook(webhookUrl).then(() => {
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  }).catch(console.error);
}