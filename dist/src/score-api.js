export const SCORE_ENDPOINT = 'https://ai-club-arcade-1t3z.vercel.app/api/scores';

export function buildScorePayload(playerName, score) {
  const normalizedName = String(playerName ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
  if (!normalizedName) throw new TypeError('Player name is required.');
  if (!Number.isFinite(score) || score < 0) throw new TypeError('Score must be a non-negative number.');
  return {
    playerName: normalizedName,
    score: Math.floor(score),
  };
}

export async function submitScore({ playerName, score }, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(SCORE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildScorePayload(playerName, score)),
  });
  if (!response.ok) {
    const details = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`Score submission failed (${response.status})${details ? `: ${details}` : ''}`);
  }
  if (typeof response.json !== 'function') return null;
  try { return await response.json(); } catch { return null; }
}
