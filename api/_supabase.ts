import { createClient } from '@supabase/supabase-js';

// Sanitize URL: remove trailing /rest/v1/ if present
const rawUrl = process.env.SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').trim();
const supabaseKey = (process.env.SUPABASE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL or SUPABASE_KEY is not set in environment variables!');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- Data Mappings: Database (snake_case) <-> Frontend (camelCase) ---

export function mapMemberToFrontend(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    address: row.address || '',
    balance: Number(row.balance),
    points: Number(row.points),
    tier: row.tier,
    joinDate: row.join_date,
  };
}

export function mapMemberToDb(member: any) {
  return {
    id: member.id,
    name: member.name,
    phone: member.phone || null,
    address: member.address || null,
    balance: member.balance || 0,
    points: member.points || 0,
    tier: member.tier || 'Standard',
    join_date: member.joinDate,
  };
}

export function mapTransactionToFrontend(row: any) {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    amount: Number(row.amount),
    points: Number(row.points),
    timestamp: row.timestamp,
    description: row.description || '',
  };
}

export function mapTransactionToDb(tx: any) {
  return {
    id: tx.id,
    member_id: tx.memberId,
    type: tx.type,
    amount: tx.amount || 0,
    points: tx.points || 0,
    timestamp: tx.timestamp,
    description: tx.description || null,
  };
}
