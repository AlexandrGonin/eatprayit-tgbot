import { Bot, webhookCallback } from 'grammy';
import express from 'express';
import { 
  createUser, 
  getUserByTelegramId, 
  getUserByReferralCode, 
  addReferral, 
  getReferralLink,
  activateUser
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
    console.log('🔍 Start command:', { telegramId, referralCode });
    
    // Проверяем существующего пользователя
    const existingUser = await getUserByTelegramId(telegramId);
    
    if (existingUser) {
      console.log('✅ Existing user found:', existingUser);
      
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
      console.log('🆕 New user detected');
      
      if (!referralCode) {
        // Новый пользователь без ссылки
        return await ctx.reply(`👋 Привет, ${firstName}!\n\n` +
          `❌ Для доступа к Mini App нужна реферальная ссылка.\n\n` +
          `🔑 Попросите ссылку у друга.\n\n` +
          `📋 Команды:\n/help - Помощь`);
      }
      
      // Новый пользователь с реферальной ссылкой
      console.log('🔗 Referral code:', referralCode);
      const referrer = await getUserByReferralCode(referralCode);
      console.log('👤 Referrer found:', referrer);
      
      if (!referrer) {
        return await ctx.reply('❌ Недействительная реферальная ссылка. Пользователь не найден.');
      }

      if (!referrer.is_active) {
        return await ctx.reply('❌ Недействительная реферальная ссылка. Пользователь не активен.');
      }
      
      // Создаем пользователя
      const newUser = await createUser(telegramId, username || null, firstName, lastName || null);
      console.log('✅ New user created:', newUser);
      
      // Активируем пользователя
      await activateUser(telegramId);
      console.log('✅ User activated');
      
      // Начисляем монеты рефереру
      await addReferral(referrer.telegram_id);
      console.log('✅ Referral added');
      
      const welcomeMessage = `🎉 Добро пожаловать, ${firstName}!\n\n` +
        `✅ Теперь у вас есть доступ к Mini App!\n\n` +
        `💰 Ваши монеты: ${newUser.coins}\n` +
        `👥 Вы приглашены пользователем: ${referrer.first_name}\n\n` +
        `📋 Команды:\n/status - Статус\n/referral - Ваша ссылка\n/help - Помощь\n\n` +
        `🎯 Теперь вы можете приглашать друзей!`;

      await ctx.reply(welcomeMessage);
      
      // Уведомляем реферера
      try {
        await ctx.api.sendMessage(
          referrer.telegram_id, 
          `🎉 Ваш друг ${firstName} присоединился по вашей ссылке!\n\n` +
          `💰 Вы получили +1 монету!\n` +
          `👥 Всего рефералов: ${referrer.referral_count + 1}`
        );
      } catch (error) {
        console.error('Error notifying referrer:', error);
      }
    }
    
  } catch (error) {
    console.error('💥 Error in /start:', error);
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

    let statusMessage = `📊 Ваш статус:\n\n`;

    if (!user.is_active) {
      statusMessage += `❌ У вас нет доступа к Mini App\n\n` +
        `🔑 Для доступа нужна реферальная ссылка от друга\n\n`;
    } else {
      statusMessage += `✅ У вас есть доступ к Mini App\n\n`;
    }

    statusMessage += `💰 Монеты: ${user.coins}\n` +
      `👥 Рефералов: ${user.referral_count}\n` +
      `🎯 Ваш реферальный код: ${user.referral_code}\n\n`;

    if (user.is_active && user.referral_count > 0) {
      const referralLink = `https://t.me/${ctx.me.username}?start=${user.referral_code}`;
      statusMessage += `🔗 Реферальная ссылка:\n${referralLink}\n\n` +
        `Приглашайте друзей и получайте +1 монету за каждого!`;
    } else if (user.is_active) {
      const referralLink = `https://t.me/${ctx.me.username}?start=${user.referral_code}`;
      statusMessage += `🔗 Реферальная ссылка:\n${referralLink}\n\n` +
        `Пригласите первого друга чтобы получить монеты!`;
    } else {
      statusMessage += `📊 Получите реферальную ссылку для доступа к Mini App!`;
    }

    await ctx.reply(statusMessage);
  } catch (error) {
    console.error('💥 Error in /status:', error);
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
    if (!user.is_active) {
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
    console.error('💥 Error in /referral:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Команда /help
bot.command('help', async (ctx) => {
  try {
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
  } catch (error) {
    console.error('💥 Error in /help:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
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
  console.error('💥 Bot error:', err);
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