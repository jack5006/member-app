import { supabase, mapTransactionToFrontend, mapTransactionToDb } from './_supabase';

export default async function handler(req: any, res: any) {
  // GET /api/transactions - fetch all transactions
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data ? data.map(mapTransactionToFrontend) : []);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // POST /api/transactions - create a new transaction
  if (req.method === 'POST') {
    try {
      const tx = mapTransactionToDb(req.body);
      const { data, error } = await supabase
        .from('transactions')
        .insert(tx)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(mapTransactionToFrontend(data));
    } catch (err: any) {
      console.error('Error creating transaction:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
