import { env } from './env.js';

export type WebSearchResult = {
  title: string;
  snippet: string;
  url: string;
};

export async function searchWebDuckDuckGo(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) return [];
    const html = await response.text();

    const results: WebSearchResult[] = [];
    const regex = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null && results.length < 5) {
      const url = match[1] ?? '';
      const rawTitle = match[2] ?? '';
      const rawSnippet = match[3] ?? '';

      const cleanTitle = rawTitle.replace(/<[^>]+>/g, '').trim();
      const cleanSnippet = rawSnippet.replace(/<[^>]+>/g, '').trim();

      if (cleanTitle && cleanSnippet) {
        results.push({ title: cleanTitle, snippet: cleanSnippet, url });
      }
    }

    return results;
  } catch (error) {
    console.error('Web search error:', error);
    return [];
  }
}

export async function runWebSearchSubAgent(query: string, signal?: AbortSignal): Promise<{ summary: string; sources: WebSearchResult[] }> {
  const sources = await searchWebDuckDuckGo(query, signal);

  if (sources.length === 0) {
    return {
      summary: `I searched the web for "${query}", but no live web results were retrieved. Please consult medical references or retry.`,
      sources: [],
    };
  }

  // Use Gemini AI Sub-Agent to synthesize the web results into a concise clinical summary for the doctor
  if (env.GEMINI_API_KEY && env.GEMINI_MODEL) {
    try {
      const prompt = `You are a medical & scientific research sub-agent for Friday.
Summarize the following live web search results for the doctor in 2-3 clear, accurate sentences. Do not make up facts outside the provided sources.

Query: "${query}"

Live Web Sources:
${sources.map((s, idx) => `[${idx + 1}] ${s.title}: ${s.snippet}`).join('\n')}
`;

      const url = `${env.GEMINI_BASE_URL.replace(/\/$/, '')}/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });

      if (res.ok) {
        const body = (await res.json()) as any;
        const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { summary: text.trim(), sources };
        }
      }
    } catch {
      // Fallback
    }
  }

  const fallbackSummary = `Web search results for "${query}":\n` + sources.map(s => `• ${s.title}: ${s.snippet}`).join('\n');
  return { summary: fallbackSummary, sources };
}
