/**
 * How the panel judges a reply (ADMIN-03): the game's own words decide, never the fact that a command was sent. `refused` means the game
 * said it did not do it; `accepted` means a line the command's entry names as success; anything else is `unknown`, shown as such.
 */
export type Verdict = 'accepted' | 'refused' | 'unknown';

export interface Judgement {
  verdict: Verdict;
  /** The reply line that decided it, for the owner to read next to the verdict. */
  reason?: string;
}

/**
 * Lines the game prints when it does NOT do what was asked. Each is anchored at the start of the line so a room description or a
 * `stat` page that merely contains one of these words is not read as a refusal. They come from the handlers' own messages in
 * merc-mud (act_wiz.c, ban.c, area_reload.c, interp.c).
 */
export const REFUSAL_PATTERNS: readonly RegExp[] = [
  /^Huh\?$/,
  /^(They|That (player|character)) (aren'?t|isn'?t|is not) (here|playing)\b/i,
  /^They are in limbo/i,
  /^No such (location|option|clan|spec fun)/i,
  /^You can'?t find them/i,
  /^Target not found/i,
  /^Nothing (like that|by that name)/i,
  /^You don'?t see that here/i,
  /^You failed/i,
  /^Not on (NPC|PC)'?s/i,
  /^Not at your level/i,
  /^Limited to your trust/i,
  /^Do it yourself/i,
  /^That will NOT be done/i,
  /^Ho ho ho/i,
  /^Maybe that wasn'?t a good idea/i,
  /^That room (is private right now|isn'?t private)/i,
  /^That character is in a private room/i,
  /^Syntax:/i,
  /^Reload FAILED/i,
  /^Descriptor not found/i,
  /^Site is not banned/i,
  /^You are not powerful enough/i,
  /^That ban was set by a higher power/i,
  /^(Invis|Incog) level must be/i,
  /^Unknown GMCP type/i,
  /^GMCP not sent/i,
  /^You have no descriptor/i,
  /^You must include your name/i,
  /^That's not an acceptable flag/i,
  /^That flag doesn'?t exist/i,
  /^You (need|have) to (specify|ban)/i,
];

/** The game's refusal for a verb it does not know: the account is not trusted for this command. */
const HUH = /^Huh\?$/;

/** Lines that are the prompt, not part of the reply (`<20hp 100m 100mv>`). */
export const PROMPT_LINE = /^<[^<>]*>\s*$/;

/** Refused when any line is `Huh?`; otherwise the first line that is a refusal or a success decides; otherwise unknown. */
export function judge(lines: readonly string[], success: readonly RegExp[]): Judgement {
  const body = lines.map((l) => l.trim()).filter((l) => l !== '' && !PROMPT_LINE.test(l));
  const huh = body.find((l) => HUH.test(l));
  if (huh) return { verdict: 'refused', reason: huh };
  for (const line of body) {
    // a refusal is checked first on each line: a catch-all success pattern must not accept 'They aren't here.'
    if (REFUSAL_PATTERNS.some((p) => p.test(line))) return { verdict: 'refused', reason: line };
    if (success.some((p) => p.test(line))) return { verdict: 'accepted', reason: line };
  }
  return { verdict: 'unknown' };
}
