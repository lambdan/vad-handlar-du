import { createHash } from "crypto";

export async function md5FromBuffer(buffer: Buffer): Promise<string> {
  const hash = createHash("md5");
  hash.update(buffer);
  return hash.digest("hex");
}

export function colorFromString(s: string): string {
  const colorKeywords: Record<string, number> = {
    red: 0,
    blue: 220,
    green: 120,
    yellow: 50,
    orange: 30,
    purple: 280,
    pink: 320,
    cyan: 180,
    brown: 20,
    coop: 120,
    ica: 0,
    lidl: 220,
  };

  // Convert string to lowercase to match keywords
  const lowerStr = s.toLowerCase();
  for (const [keyword, hue] of Object.entries(colorKeywords)) {
    if (lowerStr.includes(keyword)) {
      // Mix in a bit of the string uniqueness
      let hash = 0;
      for (let i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash);
      }
      const uniqueHue = ((hash % 360) + 360) % 360; // Keep hue within 0-360
      const mixedHue = (hue + uniqueHue) / 2; // Mix the keyword hue with the unique hue
      return `hsl(${mixedHue}, 70%, 50%)`; // Prioritize color keyword if found
    }
  }

  // If no color keyword is found, generate a unique color based on hash
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360; // Keep hue within 0-360
  return `hsl(${hue}, 60%, 65%)`;
}
