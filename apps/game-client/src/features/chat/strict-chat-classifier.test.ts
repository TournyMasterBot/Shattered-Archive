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

describe('classifyStrictChatSubtype — say voice types', () => {
  // Reported bug: the enumerated checks missed every voice type but "sweetly"
  // and the "in a …" family, so strict mode dropped these lines outright.

  // Every DSL voice type, run through in-game on 2026-09-08 and taken verbatim
  // (ANSI colour + trailing CRLF intact) from that day's server log:
  // DSL/GameLogs/ShatteredArchive/Docker/game-server/2026/09/08/server.log-2026-09-08.jsonl
  const G = '\u001b[0;32m';
  const RST = '\u001b[0m';
  const say = (modifier: string) => `You say${modifier ? ` ${modifier}` : ''} '${G}test${RST}'\r\n`;
  const VOICE_TYPE_CAPTURES: [string, string][] = [
    ['softly', say('softly')],
    ['boomingly', say('boomingly')],
    ['demandingly', say('demandingly')],
    ['growlingly', say('growlingly')],
    ['sweetly', say('sweetly')],
    ['in a squeaky voice', say('in a squeaky voice')],
    ['in a raspy voice', say('in a raspy voice')],
    ['in a low toned manner', say('in a low toned manner')],
    ['in a high pitched voice', say('in a high pitched voice')],
    ['in a deep voice', say('in a deep voice')],
    ['in a stressed voice', say('in a stressed voice')],
    ['in a evil voice', say('in a evil voice')],
    ['in a cheery voice', say('in a cheery voice')],
    ['in a sarcastic tone', say('in a sarcastic tone')],
    ['in a sad tone', say('in a sad tone')],
    ['in a musical tone', say('in a musical tone')],
    ['in a gruff voice', say('in a gruff voice')],
    ['in a breathy voice', say('in a breathy voice')],
    ['in a wheezing voice', say('in a wheezing voice')],
    ['in a mumbling voice', say('in a mumbling voice')],
    ['in a husky voice', say('in a husky voice')],
    ['in a bored voice', say('in a bored voice')],
    ['in a smarmy voice', say('in a smarmy voice')],
    ['(no modifier)', say('')],
  ];

  it.each(VOICE_TYPE_CAPTURES)('classifies "You say %s \'…\'" as say', (_label, raw) => {
    expect(classifyStrictChatSubtype(raw)).toBe('say');
  });

  it('classifies third-person voice-type says as say', () => {
    // Real captures from other sessions (server.log 2026-09-05 / 2026-09-06).
    expect(classifyStrictChatSubtype("Kayla says softly 'hello'")).toBe('say');
    expect(classifyStrictChatSubtype("Zecnys says softly 'hi'")).toBe('say');
    expect(classifyStrictChatSubtype("Ainin says in a evil voice 'begone'")).toBe('say');
  });

  it('classifies voice-type + "(to Name)" / "(Language)" tag combinations as say', () => {
    expect(classifyStrictChatSubtype("Geirhart says in a low toned manner (to Aliera Amarandus) 'Cardinal, if you would.'")).toBe('say');
    expect(classifyStrictChatSubtype("Kayla says softly (to Zecnys) 'careful'")).toBe('say');
    expect(classifyStrictChatSubtype("You say (Elvish) 'mellon'")).toBe('say');
    expect(classifyStrictChatSubtype("You say (to Kayla) 'ready?'")).toBe('say');
  });

  it('still handles the plain, unmodified forms', () => {
    expect(classifyStrictChatSubtype("Xenophon says 'plain'")).toBe('say');
    expect(classifyStrictChatSubtype("You say 'plain'")).toBe('say');
  });

  it('does not let a quoted message containing "says" misclassify another channel as say', () => {
    expect(classifyStrictChatSubtype("Patrovio OOC: 'nobody ever says hi in this clan'")).toBe('ooc');
    expect(classifyStrictChatSubtype("Xenophon tells you 'she says the gate is open'")).toBe('tell');
  });
});

describe('classifyStrictChatSubtype — speaker name contains an apostrophe', () => {
  // Elf/drow names with an internal apostrophe (Qym'ten, Ri'gon Del'nichi,
  // Z'resra) and mob names with "'s" (a gnome philosopher's assistant) are
  // pervasive here. envelope() used to split "Qym'ten says 'hi'" at the NAME
  // ("Qym'"), so every channel line from such a speaker went unclassified and
  // strict mode dropped it. All examples below are real captures from
  // DSL/GameLogs (server.log-*.jsonl and GameLog-DSL_*.txt), ANSI stripped.
  const CASES: [string, string][] = [
    ["Qym'ten says 'Typical'", 'say'],
    ["Brah'men says 'If you need assistance, please look at help train.'", 'say'],
    ["Ri'gon Del'nichi says (to Asthrid Sol'Canta) 'That be a good one for sure.'", 'say'],
    ["A gnome philosopher's assistant says 'Oh! Iamsososorry!'", 'say'],
    ["The king's bodyguard says 'I am sorry this area is off limits to all but the Royal Family.'", 'say'],
    ["Z'Quarus says in a deep voice 'Of course. Do you need plate as well?'", 'say'],
    ["Iler'yx says softly (to You) 'Pleasure.'", 'say'],
    ["Tash'a says softly (Elvish) 'It could take a minute.'", 'say'],
    ["Que'Qui'Quod says in a evil voice 'Enough for what?'", 'say'],
    ["Ri'gon Del'nichi yells 'Ale wench!!'", 'yell'],
    ["Ri'gon Del'nichi tells you 'You are in.'", 'tell'],
    ["Z'resra tells the group 'someone in safe'", 'gtell'],
    ["Klaz'rus gossips 'Lookin fer Finlay'", 'gossip'],
    ["Ghaoshen'ite clan gossips 'Mhmm, I do not know about that.'", 'cgossip'],
    ["Z'resra clans 'Salutations, Duskbinder.'", 'clan'],
    ["Ri'gon Del'nichi OOC: 'Isn't it like 4am for you Chant?'", 'ooc'],
    ["Z'resra OOC Clan: '100k down. Dinner time.'", 'oclan'],
    ["A'wei auctions: 'Any enchanters available for some small work?'", 'auction'],
    ["Z'resra grats '13/32'", 'grats'],
    ["Ar'aa answers 'The good ones cannot'", 'askanswer'],
    ["Z'Quarus whispers 'That was unexpected.'", 'whisper'],
    ["Z'szytheis quests 'Oh, nice. What of?'", 'quest'],
  ];

  it.each(CASES)('%s => %s', (line, expected) => {
    expect(classifyStrictChatSubtype(line)).toBe(expected);
  });

  it('splits on the message-opening quote, not a contraction inside the message', () => {
    // First apostrophe is inside "Isn't"; the envelope boundary is the quote
    // before it. Classifies on ' OOC: ', not on the "clan" mentioned later.
    expect(
      classifyStrictChatSubtype("Z'resra OOC: 'Isn't the clan hall on the second floor?'"),
    ).toBe('ooc');
  });
});

describe('classifyStrictChatSubtype — first-person / speakerless channel forms', () => {
  // Real captures the enumerated checks missed: the self-echo of RADIO, and the
  // KINGDOM channel with no speaker prefix (its reference form makes the
  // "<name> " prefix optional).
  it('classifies your own radio', () => {
    expect(classifyStrictChatSubtype("You radio 'the mud eats alt codes'")).toBe('radio');
  });

  it('classifies a speakerless Kingdom line', () => {
    expect(classifyStrictChatSubtype("Kingdom: 'Thank you, Monsignor.'")).toBe('king');
    expect(classifyStrictChatSubtype("Kingdom: 'Greetings, Sir Burl.'")).toBe('king');
  });
});

describe('classifyStrictChatSubtype — immortal & system channel forms', () => {
  // The immortal channel uses a colon ("(Imm) Name answers: '…'") — routed to
  // the same panes as the player ask/answer + grats channels.
  it('routes the immortal ask/answer channel to askanswer', () => {
    expect(classifyStrictChatSubtype("(Imm) Apotheosis answers: 'You can.'")).toBe('askanswer');
    expect(
      classifyStrictChatSubtype("(An Imm) answers: 'I can't tell you about off-page weapons.'"),
    ).toBe('askanswer');
    expect(
      classifyStrictChatSubtype("(Imm) Xiangzhi ask: 'Sorry, the answer was: The Void'"),
    ).toBe('askanswer');
  });

  it('routes the immortal grats channel to grats', () => {
    expect(classifyStrictChatSubtype("(Imm) Tritoch grats: 'Congrats :)'")).toBe('grats');
  });

  it('routes the Bloodbath System announcer into the bb pane', () => {
    expect(
      classifyStrictChatSubtype("Bloodbath System: 'A new Out for Blood bloodbath is about to begin!  The level range is 1-51!'"),
    ).toBe('bb');
    // nested 'bbjoin' quote must not throw off the envelope split
    expect(
      classifyStrictChatSubtype("Bloodbath System: 'Type 'bbjoin' to join!  You will have 4 ticks to join.'"),
    ).toBe('bb');
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
