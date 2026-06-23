import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { member, lang } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || '';

    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
      return res.status(200).json({
        insight: lang === 'zh'
          ? 'AI 建议功能未配置 API 密钥。'
          : 'AI operational suggestions are not configured.',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt =
      lang === 'zh'
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
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.7 },
    });

    return res.status(200).json({
      insight: response.text || (lang === 'zh' ? '暂无建议' : 'No insights available'),
    });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate AI insight' });
  }
}
