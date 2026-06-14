import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

let supabase: any = null;
const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseUrl.startsWith('http') && 
  !supabaseUrl.includes('YOUR_SUPABASE_PROJECT_URL') && 
  supabaseKey && 
  !supabaseKey.includes('YOUR_SUPABASE_SERVICE_ROLE_KEY');

if (isSupabaseConfigured) {
  try {
    // Sanitize URL to remove trailing /rest/v1/ if pasted from Supabase settings page
    let sanitizedUrl = supabaseUrl.trim();
    if (sanitizedUrl.endsWith('/rest/v1/')) {
      sanitizedUrl = sanitizedUrl.substring(0, sanitizedUrl.length - 9);
    } else if (sanitizedUrl.endsWith('/rest/v1')) {
      sanitizedUrl = sanitizedUrl.substring(0, sanitizedUrl.length - 8);
    }
    
    supabase = createClient(sanitizedUrl, supabaseKey.trim());
    console.log('Supabase client initialized successfully with URL:', sanitizedUrl);
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
} else {
  console.warn('WARNING: Supabase URL or Key is not configured correctly in .env.local! Database operations will fail.');
}

// Middleware to ensure Supabase is configured for database requests
app.use('/api', (req, res, next) => {
  if (req.path === '/ai-insight') {
    return next();
  }
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured. Please supply a valid SUPABASE_URL and SUPABASE_KEY in your .env.local file.'
    });
  }
  next();
});

// --- Data Mappings between Database (snake_case) and Frontend (camelCase) ---

function mapMemberToFrontend(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    address: row.address || '',
    balance: Number(row.balance),
    points: Number(row.points),
    tier: row.tier,
    joinDate: row.join_date
  };
}

function mapMemberToDb(member: any) {
  return {
    id: member.id,
    name: member.name,
    phone: member.phone || null,
    address: member.address || null,
    balance: member.balance || 0,
    points: member.points || 0,
    tier: member.tier || 'Standard',
    join_date: member.joinDate
  };
}

function mapTransactionToFrontend(row: any) {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    amount: Number(row.amount),
    points: Number(row.points),
    timestamp: row.timestamp,
    description: row.description || ''
  };
}

function mapTransactionToDb(tx: any) {
  return {
    id: tx.id,
    member_id: tx.memberId,
    type: tx.type,
    amount: tx.amount || 0,
    points: tx.points || 0,
    timestamp: tx.timestamp,
    description: tx.description || null
  };
}

// --- Routes ---

// Get all members
app.get('/api/members', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data ? data.map(mapMemberToFrontend) : []);
  } catch (err: any) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Add a member
app.post('/api/members', async (req, res) => {
  try {
    const member = mapMemberToDb(req.body);
    const { data, error } = await supabase
      .from('members')
      .insert(member)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(mapMemberToFrontend(data));
  } catch (err: any) {
    console.error('Error creating member:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Update a member
app.put('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const member = mapMemberToDb({ ...req.body, id });
    const { data, error } = await supabase
      .from('members')
      .update(member)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(mapMemberToFrontend(data));
  } catch (err: any) {
    console.error('Error updating member:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Delete a member
app.delete('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.sendStatus(204);
  } catch (err: any) {
    console.error('Error deleting member:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Get all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) throw error;
    res.json(data ? data.map(mapTransactionToFrontend) : []);
  } catch (err: any) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Add a transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const tx = mapTransactionToDb(req.body);
    const { data, error } = await supabase
      .from('transactions')
      .insert(tx)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(mapTransactionToFrontend(data));
  } catch (err: any) {
    console.error('Error creating transaction:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Bulk import members (and wipe old data)
app.post('/api/import', async (req, res) => {
  try {
    const { members } = req.body;
    if (!Array.isArray(members)) {
      return res.status(400).json({ error: 'Members must be an array' });
    }

    // Wipe transactions first due to foreign keys, then members
    await supabase.from('transactions').delete().neq('id', '_');
    await supabase.from('members').delete().neq('id', '_');

    if (members.length > 0) {
      const dbMembers = members.map(mapMemberToDb);
      const { error } = await supabase.from('members').insert(dbMembers);
      if (error) throw error;
    }

    res.json({ success: true, count: members.length });
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message || 'Failed to import data' });
  }
});

// Clear all data (members & transactions)
app.post('/api/clear', async (req, res) => {
  try {
    await supabase.from('transactions').delete().neq('id', '_');
    await supabase.from('members').delete().neq('id', '_');
    res.json({ success: true });
  } catch (err: any) {
    console.error('Clear data error:', err);
    res.status(500).json({ error: err.message || 'Failed to clear data' });
  }
});

// Gemini AI suggestion proxy
app.post('/api/ai-insight', async (req, res) => {
  try {
    const { member, lang } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || '';

    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
      return res.json({ insight: lang === 'zh' ? "AI 建议功能未配置 API 密钥。" : "AI operational suggestions are not configured." });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = lang === 'zh'
      ? `分析以下会员数据并提供简短的运营建议（50字以内）：
        姓名: ${member.name}
        等级: ${member.tier}
        余额: ${member.balance}
        积分: ${member.points}
        加入日期: ${member.joinDate}`
      : `Analyze the following member data and provide a short operation suggestion (under 20 words):
        Name: ${member.name}
        Tier: ${member.tier}
        Balance: ${member.balance}
        Points: ${member.points}
        Join Date: ${member.joinDate}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    res.json({ insight: response.text || (lang === 'zh' ? "暂无建议" : "No insights available") });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate AI insight' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
