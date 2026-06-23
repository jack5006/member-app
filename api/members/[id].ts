import { supabase, mapMemberToFrontend, mapMemberToDb } from '../_supabase';

export default async function handler(req: any, res: any) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Member ID is required' });
  }

  // PUT /api/members/[id] - update a member
  if (req.method === 'PUT') {
    try {
      const member = mapMemberToDb({ ...req.body, id });
      const { data, error } = await supabase
        .from('members')
        .update(member)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(mapMemberToFrontend(data));
    } catch (err: any) {
      console.error('Error updating member:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // DELETE /api/members/[id] - delete a member
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(204).end();
    } catch (err: any) {
      console.error('Error deleting member:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
