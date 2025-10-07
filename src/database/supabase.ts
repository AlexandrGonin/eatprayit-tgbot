import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase credentials not found');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
  is_active: boolean;
  coins: number;
  referral_code: string;
  referred_by: number | null;
  referral_count: number;
  bio?: string;
  position?: string;
  links?: {
    telegram?: string;
    linkedin?: string;
    vk?: string;
    instagram?: string;
  };
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createUser(
  telegramId: number,
  username: string | null,
  firstName: string,
  lastName: string | null,
  referredBy: number | null = null
): Promise<User> {
  const referralCode = generateReferralCode();
  
  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      username,
      first_name: firstName,
      last_name: lastName,
      referral_code: referralCode,
      referred_by: referredBy,
      is_active: true,
      coins: 0,
      referral_count: 0
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getUserByReferralCode(referralCode: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('referral_code', referralCode)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function addReferral(referrerId: number, referredId: number): Promise<void> {
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('coins, referral_count')
    .eq('telegram_id', referrerId)
    .single();

  if (fetchError) throw fetchError;

  const { error: referralError } = await supabase
    .from('referrals')
    .insert({
      referrer_id: referrerId,
      referred_id: referredId
    });

  if (referralError) throw referralError;

  const { error: updateError } = await supabase
    .from('users')
    .update({
      coins: (currentUser?.coins || 0) + 1,
      referral_count: (currentUser?.referral_count || 0) + 1
    })
    .eq('telegram_id', referrerId);

  if (updateError) throw updateError;
}

export async function canUserAccessMiniApp(telegramId: number): Promise<boolean> {
  const user = await getUserByTelegramId(telegramId);
  return user !== null && user.is_active;
}

// Функция для получения реферальной ссылки (только для пользователей с рефералами)
export async function getReferralLink(telegramId: number, botUsername: string): Promise<string | null> {
  const user = await getUserByTelegramId(telegramId);
  if (!user || user.referral_count === 0) {
    return null; // Только пользователи с рефералами получают ссылку
  }
  return `https://t.me/${botUsername}?start=${user.referral_code}`;
}