import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase credentials not found');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

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

export interface Event {
  id: number;
  title: string;
  short_description: string;
  description?: string;
  date: string;
  time: string;
  location: string;
  location_coords?: {
    lat: number;
    lng: number;
  } | null;
  event_type?: string;
  created_at: string;
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
  lastName: string | null
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
      is_active: false,
      coins: 0,
      referral_count: 0,
      links: {}
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function activateUser(telegramId: number): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      is_active: true
    })
    .eq('telegram_id', telegramId);

  if (error) throw error;
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

export async function addReferral(referrerId: number): Promise<void> {
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('coins, referral_count')
    .eq('telegram_id', referrerId)
    .single();

  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from('users')
    .update({
      coins: (currentUser?.coins || 0) + 1,
      referral_count: (currentUser?.referral_count || 0) + 1
    })
    .eq('telegram_id', referrerId);

  if (updateError) throw updateError;
}

export async function updateUserProfile(
  telegramId: number, 
  updates: { bio?: string; position?: string; links?: any }
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('telegram_id', telegramId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function canUserAccessMiniApp(telegramId: number): Promise<boolean> {
  const user = await getUserByTelegramId(telegramId);
  return user !== null && user.is_active;
}

export async function getReferralLink(telegramId: number, botUsername: string): Promise<string | null> {
  const user = await getUserByTelegramId(telegramId);
  if (!user || !user.is_active) {
    return null;
  }
  return `https://t.me/${botUsername}?start=${user.referral_code}`;
}