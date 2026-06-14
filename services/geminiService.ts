import { Language } from "../translations";

export const getMemberInsight = async (memberData: any, lang: Language): Promise<string> => {
  try {
    const response = await fetch('/api/ai-insight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        member: memberData,
        lang,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.insight || (lang === 'zh' ? "暂无建议" : "No insights available");
  } catch (error) {
    console.error("AI Insight Error:", error);
    return lang === 'zh' ? "无法获取AI建议。" : "Failed to fetch AI insights.";
  }
};
