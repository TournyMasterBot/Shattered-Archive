/**
 * The trainer's answer to one suggestion, as Claude writes it to `answer.json` and the pilot applies it in the game client like a person.
 *
 *   { "id": "<suggestion id>", "action": "approve" }
 *   { "id": "...", "action": "correct", "command": "consider goblin", "why": "act_info.c do_consider: consider before fighting" }
 *   { "id": "...", "action": "reject",  "why": "fight.c do_flee: ..." }
 *   { "id": "...", "action": "wait" }      look again later (the situation is not clear yet)
 *   { "action": "stop" }                   end the session
 *
 * The source of truth is the merc-mud source code, so a correction or a rejection must say WHERE in it the rule comes from: a `why` that
 * names a source file (`act_info.c`, `merc.h`, `fight.c do_flee`). A why without one is refused and nothing is sent to the game.
 */

/** The longest why the Copilot window takes (apps/game-client features/copilot/review.ts WHY_MAX). */
export const WHY_MAX = 280;
export const COMMAND_MAX = 200;
export const ACTIONS = ['approve', 'correct', 'reject', 'wait', 'stop'];

/** A reference to the game's source: `fight.c`, `act_info.c do_consider`, `merc.h`, `db.c fix_exits`. */
export const SOURCE_REFERENCE = /\b[a-z][a-z0-9_]*\.(c|h)\b/i;
// eslint-disable-next-line no-control-regex -- the point of the check: a command with a control character could be two commands
const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateAnswer(input, pendingId) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, problem: 'the answer must be a JSON object' };
  const { action } = input;
  if (!ACTIONS.includes(action)) return { ok: false, problem: `action must be one of ${ACTIONS.join(', ')}` };
  if (action === 'stop') return { ok: true, answer: { action } };
  if (typeof input.id !== 'string' || input.id === '') return { ok: false, problem: 'id is required' };
  if (input.id !== pendingId) return { ok: false, problem: 'the answer is for another suggestion than the one pending' };
  if (action === 'approve' || action === 'wait') return { ok: true, answer: { action, id: input.id } };

  const why = typeof input.why === 'string' ? input.why.replace(/\s+/g, ' ').trim() : '';
  if (why === '') return { ok: false, problem: `${action} needs a why` };
  if (why.length > WHY_MAX) return { ok: false, problem: `the why is over ${WHY_MAX} characters` };
  if (!SOURCE_REFERENCE.test(why)) return { ok: false, problem: 'the why must cite the merc-mud source (a file such as act_info.c or fight.c)' };
  if (action === 'reject') return { ok: true, answer: { action, id: input.id, why } };

  const command = typeof input.command === 'string' ? input.command.trim() : '';
  if (command === '') return { ok: false, problem: 'correct needs the command to send instead' };
  if (command.length > COMMAND_MAX) return { ok: false, problem: `the command is over ${COMMAND_MAX} characters` };
  if (CONTROL.test(command) || command.includes(';')) return { ok: false, problem: 'the command may hold no line break, control character or semicolon' };
  return { ok: true, answer: { action, id: input.id, command, why } };
}
