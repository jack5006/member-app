import { supabase } from './_supabase';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Delete transactions first (foreign key constraint), then members
    const { error: txError } = await supabase.from('transactions').delete().neq('id', '_');
    if (txError) throw txError;

    const { error: memError } = await supabase.from('members').delete().neq('id', '_');
    if (memError) throw memError;

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Clear data error:', err);
    return res.status(500).json({ error: err.message || 'Failed to clear data' });
  }
}
