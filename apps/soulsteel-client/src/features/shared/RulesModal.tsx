import type { ReactNode } from 'react';

interface RulesModalProps {
  onClose: () => void;
}

/**
 * The rules, reachable from both the Landing page and the Room toolbar.
 *
 * Every sentence below is the VERBATIM text of
 * C:/Projects/DSL/Books/.../Umbral-Cloak-and-Soulsteel-Dagger.txt (including its own typos —
 * "excercise", "aide" — and the trailing comma on Daytime step 2) with only its `{X` color
 * markup stripped and structural markdown (numbered lists, `*ALL*` emphasis) converted to real
 * HTML elements. Do not reword this content — only styling/structure may change here. Colors
 * are carried over from that markup's own resolved hex (Herald in brown, the Umbraseer in
 * violet, the Dark Knights/Darkshield in steel, the Cultist Assassin in blood red,
 * "night"/"day"/"vote" in their own accents — see index.css's `--ss-rule-*` tokens), applied
 * once per concept rather than reproducing the source's per-letter span mechanics.
 */
export default function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div className="ss-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ss-dialog ss-rules-dialog"
        role="dialog"
        aria-label="Rules"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ss-dialog-header">
          <h2>Rules</h2>
          <button type="button" onClick={onClose} aria-label="Close rules">
            ✕
          </button>
        </div>

        <div className="ss-rules-content">
          <header className="ss-rules-title">
            <p className="ss-rules-title-main">The Umbral Cloak and the Soulsteel Dagger</p>
            <p className="ss-rules-title-sub">Instructions</p>
          </header>

          <RulesDivider />

          <section>
            <h3 className="ss-rules-h1">The Game</h3>
            <p>
              A social deduction excercise where <Term cls="darkknight">Dark Knights</Term> must identify{' '}
              <Term cls="assassin">Cultist Assassins</Term> who are attempting to kill them.
            </p>
          </section>

          <RulesDivider />

          <section>
            <h3 className="ss-rules-h1">The Rules</h3>

            <h4 className="ss-rules-h2">Game Phases</h4>

            <h5 className="ss-rules-h3 ss-rules-day">Daytime</h5>
            <ol>
              <li>Players try to establish who the assassins are, assassins try to deflect blame to others.</li>
              <li>
                After a period of discussion the <Term cls="herald">Herald</Term> will indicate that it is time for
                a <Term cls="vote">vote</Term>,
              </li>
              <li>
                A <Term cls="vote">vote</Term> is held to identify the assassin(s), should majority (50% + 1) be
                reached, they are executed.
              </li>
              <li>
                The <Term cls="night">night</Term> falls.
              </li>
            </ol>
            <p>
              From the second day onward the <Term cls="herald">Herald</Term> will reveal the outcome of the{' '}
              <Term cls="night">night</Term>.
            </p>

            <h5 className="ss-rules-h3 ss-rules-night">Nighttime</h5>
            <ol>
              <li>
                Hidden actions occur during the <Term cls="night">night</Term>. Special roles utilize their
                abilities and assassins set their marks. Once all actions are set, the next{' '}
                <Term cls="day">day</Term> begins.
              </li>
              <li>
                Assassins will reach a consensus on who to target, following the instructions of the{' '}
                <Term cls="herald">Herald</Term>.
              </li>
              <li>
                All discussion will be withheld during the <Term cls="night">night</Term>. Only those who may take
                special action, speaking directly to the <Term cls="herald">Herald</Term> may make any sound.
              </li>
              <li>The dead do not speak. Nor do they reveal their role. The game continues.</li>
            </ol>

            <h4 className="ss-rules-h2">Game Modifiers</h4>
            <p>
              Disciples may add or modify roles as they see fit, e.g. a pilferer on the side of the{' '}
              <Term cls="darkknight">Dark Knights</Term> could steal another player&rsquo;s role. A cultist minion
              could be on the side of the assassins, they would know who the assassins are and try to aide them -
              without the assassins actually knowing who they are.
            </p>
            <p>
              Modifiers work best for particularly small or large games, to provide more interesting dynamics that
              are not otherwise possible. Ensuring that both sides get unique roles will help contribute to
              engagement and intrigue. Disciples are not penalized if they do not add or modify roles.
            </p>
          </section>

          <RulesDivider />

          <section>
            <h3 className="ss-rules-h1">The Roles</h3>

            <RoleEntry cls="herald" name="Herald">
              Moderator who controls the flow of the game, distributes roles, shares information with players
              should they have a special role. Coordinates assassination handling.
            </RoleEntry>

            <RoleEntry cls="umbraseer" name="Umbraseer">
              Once per <Term cls="night">night</Term> the Umbraseer can see beyond the veil and reveal whether a
              specific player is an assassin. The Umbraseer counts as a <Term cls="darkknight">Dark Knight</Term>.
            </RoleEntry>

            <RoleEntry cls="darkshield" name="Darkshield">
              Once per <Term cls="night">night</Term> the Darkshield may choose any player to protect from
              assassination. The Darkshield counts as a <Term cls="darkknight">Dark Knight</Term>.
            </RoleEntry>

            <RoleEntry cls="darkknight" name="Dark Knights">
              Dark Knights have no special powers during the <Term cls="night">night</Term>, but they do
              participate in discussions and votes during the <Term cls="day">day</Term> to help identify and
              execute the assassins.
            </RoleEntry>

            <RoleEntry cls="assassin" name="Cultist Assassin">
              Once per <Term cls="night">night</Term> the assassin will inform the <Term cls="herald">Herald</Term>{' '}
              of who their target is, resulting in a murder come the <Term cls="day">day</Term> if the player was
              not protected.
            </RoleEntry>
          </section>

          <RulesDivider />

          <section>
            <h3 className="ss-rules-h1">Win Conditions</h3>
            <dl className="ss-rules-win-list">
              <dt className="ss-rules-darkknight">Dark Knight victory</dt>
              <dd>
                Eliminate all <Term cls="assassin">Assassins</Term>
              </dd>
              <dt className="ss-rules-assassin">Cultist Assassin victory</dt>
              <dd>
                The number of <Term cls="darkknight">Dark Knights</Term> must be less than or equal to the number
                of <Term cls="assassin">Assassins</Term>.
              </dd>
            </dl>
          </section>

          <RulesDivider />

          <section>
            <h3 className="ss-rules-h1">Recommendations</h3>

            <h4 className="ss-rules-h2">4-5 players</h4>
            <p>
              <Term cls="herald">Herald</Term>, <Term cls="umbraseer">Umbraseer</Term>,{' '}
              <Term cls="darkshield">Darkshield</Term>, <Term cls="assassin">Assassin</Term>,{' '}
              <Term cls="darkknight">Dark Knights</Term>
            </p>

            <h4 className="ss-rules-h2">6-8 players</h4>
            <p>
              <Term cls="herald">Herald</Term>, <Term cls="umbraseer">Umbraseer</Term>,{' '}
              <Term cls="darkshield">Darkshield</Term>, 2 <Term cls="assassin">Assassins</Term>,{' '}
              <Term cls="darkknight">Dark Knights</Term>
            </p>

            <h4 className="ss-rules-h2">More...</h4>
            <ol>
              <li>
                Continue adding one assassin for every 3-4 additional <Term cls="darkknight">Dark Knights</Term>
              </li>
              <li>Consider adding additional roles as the participants increase</li>
              <li>
                Don&rsquo;t block a murder first <Term cls="night">night</Term> in very small games, or add a twist
                for the first <Term cls="night">night</Term> e.g. Add obscuring effect to shield, the Umbraseer is
                unable to ascertain if the player is an assassin. The player is shielded from{' '}
                <strong>ALL</strong> special effects.
              </li>
              <li>
                Timer: 3 minutes <Term cls="night">night</Term>, 5 minutes discussion, 3 minutes{' '}
                <Term cls="vote">vote</Term>. Consider scaling with size.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function RulesDivider() {
  return (
    <div className="ss-rules-divider" aria-hidden="true">
      <span className="ss-rules-divider-glyph">🗡</span>
    </div>
  );
}

function RoleEntry({ cls, name, children }: { cls: string; name: string; children: ReactNode }) {
  return (
    <div className="ss-rules-role">
      <h4 className={`ss-rules-role-name ss-rules-${cls}`}>{name}</h4>
      <p>{children}</p>
    </div>
  );
}

function Term({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`ss-rules-${cls}`}>{children}</span>;
}
