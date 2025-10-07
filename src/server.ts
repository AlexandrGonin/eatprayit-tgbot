import { Bot, webhookCallback } from 'grammy';
import express from 'express';
import { 
  createUser, 
  getUserByTelegramId, 
  getUserByReferralCode, 
  addReferral, 
  getReferralLink,
  activateUser,
  updateUserProfile
} from './database/supabase';

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Bot is running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

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
    
    // Проверяем существующего пользователя
    const existingUser = await getUserByTelegramId(telegramId);
    
    if (existingUser) {
      // ПОЛЬЗОВАТЕЛЬ СУЩЕСТВУЕТ
      
      if (referralCode && !existingUser.is_active) {
        // Пользователь существует но не активен + пришел по ссылке
        return await ctx.reply('❌ Вы уже зарегистрированы, но не активны. Используйте /start без ссылки.');
      }
      
      if (referralCode && existingUser.is_active) {
        // Активный пользователь пришел по ссылке
        return await ctx.reply('❌ Вы уже являетесь активным пользователем и не можете использовать реферальные ссылки.');
      }
      
      if (!existingUser.is_active && !referralCode) {
        // Неактивный пользователь без ссылки
        return await ctx.reply(`👋 С возвращением, ${firstName}!\n\n` +
          `❌ У вас нет доступа к Mini App.\n\n` +
          `🔑 Чтобы получить доступ, используйте реферальную ссылку от друга.\n\n` +
          `📋 Команды:\n/status - Проверить статус\n/help - Помощь`);
      }
      
      // АКТИВНЫЙ ПОЛЬЗОВАТЕЛЬ
      const referralLink = await getReferralLink(telegramId, ctx.me.username);
      
      let welcomeMessage = `👋 С возвращением, ${firstName}!\n\n` +
        `✅ У вас есть доступ к Mini App!\n\n` +
        `💰 Монеты: ${existingUser.coins}\n` +
        `👥 Рефералов: ${existingUser.referral_count}\n\n` +
        `📋 Команды:\n/status - Статус\n/referral - Реферальная ссылка\n/help - Помощь`;

      if (referralLink) {
        welcomeMessage += `\n\n🎯 Реферальная ссылка:\n${referralLink}`;
      }

      await ctx.reply(welcomeMessage);
      
    } else {
      // НОВЫЙ ПОЛЬЗОВАТЕЛЬ
      
      if (!referralCode) {
        // Новый пользователь без ссылки
        return await ctx.reply(`👋 Привет, ${firstName}!\n\n` +
          `❌ Для доступа к Mini App нужна реферальная ссылка.\n\n` +
          `🔑 Попросите ссылку у друга.\n\n` +
          `📋 Команды:\n/help - Помощь`);
      }
      
      // Новый пользователь с реферальной ссылкой
      const referrer = await getUserByReferralCode(referralCode);
      
      if (!referrer || !referrer.is_active) {
        return await ctx.reply('❌ Недействительная реферальная ссылка.');
      }
      
      // Создаем пользователя
      const newUser = await createUser(telegramId, username || null, firstName, lastName || null);
      
      // Активируем пользователя
      await activateUser(telegramId);
      
      // Начисляем монеты рефереру
      await addReferral(referrer.telegram_id);
      
      const welcomeMessage = `🎉 Добро пожаловать, ${firstName}!\n\n` +
        `✅ Теперь у вас есть доступ к Mini App!\n\n` +
        `💰 Ваши монеты: ${newUser.coins}\n` +
        `👥 Вы приглашены пользователем: ${referrer.first_name}\n\n` +
        `📋 Команды:\n/status - Статус\n/referral - Ваша ссылка\n/help - Помощь\n\n` +
        `🎯 Теперь вы можете приглашать друзей!`;

      await ctx.reply(welcomeMessage);
      
      // Уведомляем реферера
      await ctx.api.sendMessage(
        referrer.telegram_id, 
        `🎉 Ваш друг ${firstName} присоединился по вашей ссылке!\n\n` +
        `💰 Вы получили +1 монету!\n` +
        `👥 Всего рефералов: ${referrer.referral_count + 1}`
      );
    }
    
  } catch (error) {
    console.error('Error in /start:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Остальные команды (/status, /referral, /help) аналогично обновляем...

app.post('/webhook', webhookCallback(bot, 'express'));

bot.catch((err) => {
  console.error('Bot error:', err);
});

app.listen(PORT, () => {
  console.log(`🚀 Bot server running on port ${PORT}`);
});

if (process.env.RENDER_EXTERNAL_URL) {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
  bot.api.setWebhook(webhookUrl).then(() => {
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  }).catch(console.error);
}