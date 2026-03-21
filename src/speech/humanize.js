/**
 * Convert raw ATIS text into natural spoken aviation English.
 * Uses OpenRouter gpt-4o-mini - cheap as chips (~$0.0001 per call).
 * Only called when ATIS letter changes, so ~26 calls/airport/day max.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are converting raw NAV CANADA ATIS text into natural spoken aviation English for a phone ATIS service.

Rules:
- Read it exactly like a real ATIS broadcast - clear, professional, measured pace
- Expand all abbreviations: KT → knots, VIS → visibility, CIG → ceiling, BKN → broken, OVC → overcast, SCT → scattered, FEW → few, SM → statute miles, RWY → runway, LDG → landing, DEP → departure, APCH → approach, RNAV → R-NAV, ILS → I-L-S, NDB → N-D-B, TEMP → temperature, DEW → dewpoint, A → altimeter
- Convert cloud heights: BKN020 → broken ceiling at 2 thousand feet, OVC005 → overcast ceiling at 500 feet
- Convert winds: 18005KT → wind one-eight-zero at 5 knots, 27015G25KT → wind two-seven-zero at 15 gusting 25 knots, VRB03KT → winds variable at 3 knots
- Altimeter: A3021 → altimeter 30 point 21
- Time: 1520Z → 15 20 zulu
- ATIS letter: spell it phonetically (B → Bravo, O → Oscar, etc.)
- Start with: "[Airport name] arrival ATIS information [phonetic letter], [time] zulu."
- End with: "Advise [ICAO] on initial contact you have information [phonetic letter]."
- Do NOT include the runway table or disclaimer text - just the weather broadcast
- Output plain text only, no markdown`;

async function humanizeAtis(rawAtis, airportName) {
  if (!OPENAI_API_KEY) {
    return basicCleanup(rawAtis, airportName);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Airport: ${airportName}\nRaw ATIS: ${rawAtis}` },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.error(`[Humanize] OpenAI error: ${res.status}`);
      return basicCleanup(rawAtis, airportName);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return basicCleanup(rawAtis, airportName);

    console.log(`[Humanize] ${airportName}: LLM conversion successful`);
    return text;
  } catch (err) {
    console.error(`[Humanize] Failed: ${err.message}`);
    return basicCleanup(rawAtis, airportName);
  }
}

/**
 * Regex-based fallback if OpenRouter is unavailable.
 */
function basicCleanup(raw, airportName) {
  // Strip runway table and disclaimer
  const cleaned = raw
    .replace(/\nRunway[\s\S]*/i, '')
    .replace(/The information on this web site[\s\S]*/i, '')
    .trim();

  return cleaned
    .replace(/\bKT\b/g, ' knots')
    .replace(/\bSM\b/g, ' statute miles')
    .replace(/\bVIS\b/g, 'visibility')
    .replace(/\bCIG\b/g, 'ceiling')
    .replace(/\bBKN(\d{3})/g, (_, h) => `broken ceiling at ${parseInt(h) * 100} feet`)
    .replace(/\bOVC(\d{3})/g, (_, h) => `overcast ceiling at ${parseInt(h) * 100} feet`)
    .replace(/\bSCT(\d{3})/g, (_, h) => `scattered at ${parseInt(h) * 100} feet`)
    .replace(/\bFEW(\d{3})/g, (_, h) => `few clouds at ${parseInt(h) * 100} feet`)
    .replace(/\bFEW\b/g, 'few clouds')
    .replace(/\bRWY\b/g, 'runway')
    .replace(/\bLDG\b/g, 'landing')
    .replace(/\bDEP\b/g, 'departure')
    .replace(/\bAPCH\b/g, 'approach')
    .replace(/\bINFORM\b/g, 'advise')
    .replace(/\bA(\d{2})(\d{2})\b/g, 'altimeter $1 point $2')
    .replace(/(\d{3})(\d{2,3})knots/g, 'wind $1 at $2 knots')
    .replace(/\bVRB(\d+)knots/g, 'winds variable at $1 knots');
}

module.exports = { humanizeAtis };
