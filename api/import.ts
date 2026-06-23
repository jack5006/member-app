import { supabase, mapMemberToDb } from './_supabase';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { members } = req.body;

    if (!Array.isArray(members)) {
      return res.status(400).json({ error: 'Members must be an array' });
    }

    // Wipe transactions first (due to foreign key constraint), then members
    await supabase.from('transactions').delete().neq('id', '_');
    await supabase.from('members').delete().neq('id', '_');

    if (members.length > 0) {
      const dbMembers = members.map(mapMemberToDb);
      const { error } = await supabase.from('members').insert(dbMembers);
      if (error) throw error;
    }

    return res.status(200).json({ success: true, count: members.length });
  } catch (err: any) {
    console.error('Import error:', err);
    return res.status(500).json({ error: err.message || 'Failed to import data' });
  }
}
