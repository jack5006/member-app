import { supabase, mapMemberToFrontend, mapMemberToDb } from './_supabase';

export default async function handler(req: any, res: any) {
  // GET /api/members - fetch all members
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data ? data.map(mapMemberToFrontend) : []);
    } catch (err: any) {
      console.error('Error fetching members:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // POST /api/members - create a new member
  if (req.method === 'POST') {
    try {
      const member = mapMemberToDb(req.body);
      const { data, error } = await supabase
        .from('members')
        .insert(member)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(mapMemberToFrontend(data));
    } catch (err: any) {
      console.error('Error creating member:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
