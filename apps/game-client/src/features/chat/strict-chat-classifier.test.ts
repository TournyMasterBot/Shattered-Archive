/**
 * apps/game-client/src/features/chat/strict-chat-classifier.test.ts
 */
import { classifyStrictChatSubtype } from './strict-chat-classifier';

describe('classifyStrictChatSubtype — baseline channels', () => {
  it('classifies say/tell/gtell/yell/whisper', () => {
    expect(classifyStrictChatSubtype("Xenophon says 'hello there'")).toBe('say');
    expect(classifyStrictChatSubtype("Xenophon tells you 'hi'")).toBe('tell');
    expect(classifyStrictChatSubtype("Xenophon tells the group 'moving out'")).toBe('gtell');
    expect(classifyStrictChatSubtype("Xenophon yells 'help!'")).toBe('yell');
    expect(classifyStrictChatSubtype("Xenophon whispers 'psst'")).toBe('whisper');
  });
});

describe('classifyStrictChatSubtype — pray', () => {
  it('classifies your own pray, quoted verbatim from a real capture', () => {
    // dsl-client/AGL/First Person View/2023-11-12_Melchaleve_Malishobeth.txt:592
    expect(classifyStrictChatSubtype("You pray 'hi xeno lol'")).toBe('pray');
  });

  it('classifies someone else praying', () => {
    expect(classifyStrictChatSubtype("Xenophon prays 'thanks for the transport'")).toBe('pray');
  });

  it('does NOT classify the unrelated "pray" skill/emote flavor text as a channel', () => {
    // These are combat/ritual flavor lines, not chat — none of them quote speech.
    expect(classifyStrictChatSubtype('A champion prays for guidance.. and attacks a crusader!')).toBeUndefined();
    expect(classifyStrictChatSubtype('Vasha prays for transportation!')).toBeUndefined();
    expect(classifyStrictChatSubtype('Boof kneels and prays for the blessing of wisdom.')).toBeUndefined();
    expect(
      classifyStrictChatSubtype('Symantha prays quietly as Telthian speaks, "Beneath Your discerning gaze, we kneel in supplication."'),
    ).toBeUndefined();
  });
});

describe('classifyStrictChatSubtype — quoted-message false positives (regression)', () => {
  it('classifies an OOC message that happens to mention "clans" as ooc, not clan', () => {
    // Reported regression: the unanchored ' clans ' check matched inside the
    // quoted message body before the ' OOC: ' check ever ran.
    expect(
      classifyStrictChatSubtype("Patrovio OOC: '13th Tribe, we hung around clans like Crusaders of a New Beginning and the Rattpack'"),
    ).toBe('ooc');
  });

  it('classifies an OOC message that quotes someone else praying as ooc, not pray', () => {
    // Real capture: GameLog-DSL_2023-09-01-Fri.txt:9696 — the outer OOC quote
    // contains a nested "Name prays '...'" fragment as its subject matter.
    expect(
      classifyStrictChatSubtype("(Imm) Xenophon OOC: 'Turbo prays 'that tickled, musta been a bama type fan''"),
    ).toBe('ooc');
  });

  it('classifies a say that quotes a "prays" pattern inside it as say, not pray', () => {
    // Real capture: GameLog-DSL_2023-06-08-Thu.txt:22647 — a regex literal
    // containing the word "prays" was itself the spoken message.
    expect(
      classifyStrictChatSubtype("You say '^The ghost of (?<player_name>[A-Z][A-Za-z']+) prays 'trans me'$'"),
    ).toBe('say');
  });
});
