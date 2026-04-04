// apps/game-client/src/components/ScriptingHelpModal.tsx
import React from 'react';
import styles from '../styles/ScriptingHelpModal.module.scss';

interface ScriptingHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SectionId =
  | 'welcome'
  | 'getting-started'
  | 'triggers'
  | 'aliases'
  | 'timers'
  | 'variables'
  | 'examples'
  | 'plugins'
  | 'pnp';

interface NavSection {
  id: SectionId;
  label: string;
}

const NAV_SECTIONS: NavSection[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'aliases', label: 'Aliases' },
  { id: 'timers', label: 'Timers' },
  { id: 'variables', label: 'Variables' },
  { id: 'examples', label: 'Practical Examples' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'pnp', label: 'DSL PNP Reference' },
];

const ScriptingHelpModal: React.FC<ScriptingHelpModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = React.useState<SectionId>('welcome');
  const contentRef = React.useRef<HTMLDivElement>(null);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    const el = contentRef.current?.querySelector(`[data-section="${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToAnchor = (anchorId: string) => {
    setActiveSection('plugins');
    const el = contentRef.current?.querySelector(`#${anchorId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const content = contentRef.current;
    if (!content) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.getAttribute('data-section') as SectionId);
          }
        }
      },
      { root: content, threshold: 0.25 }
    );

    const sections = content.querySelectorAll('[data-section]');
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Scripting Help</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Sidebar nav */}
          <nav className={styles.sidebar}>
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
                onClick={() => scrollToSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Scrollable content */}
          <div className={styles.content} ref={contentRef}>

            {/* ── WELCOME ─────────────────────────────────────── */}
            <section data-section="welcome" className={styles.section}>
              <h3 className={styles.sectionHeading}>Welcome to Scripting</h3>

              <p className={styles.intro}>
                You don't need to be a programmer to start scripting — you just need to know what
                you want the game to <em>do for you</em>. This guide will walk you through
                everything step by step, in plain language.
              </p>

              <div className={styles.callout}>
                <strong>What is scripting?</strong>
                <p>
                  Scripting lets you tell the game client: <em>"When THIS happens, do THAT."</em>
                  For example: "When I see the message that I'm hungry, automatically eat some food."
                  Or: "Every five seconds, send the command <code>look</code>."
                </p>
              </div>

              <p>
                There are two main systems for automating your game experience:
              </p>

              <ul className={styles.list}>
                <li>
                  <strong>Scripts (Script Sandbox)</strong> — Small pieces of code you write yourself.
                  Great for personal automation like eating, drinking, reacting to events, or
                  sending sequences of commands.
                </li>
                <li>
                  <strong>Plugins</strong> — Ready-made automation tools that someone has already
                  packaged up for you. Just enable them and configure them. The built-in{' '}
                  <em>Roller</em> plugin is an example — it automatically handles stat rolling for
                  you.
                </li>
              </ul>

              <p>
                Start with the <strong>Getting Started</strong> section to find the Script Sandbox,
                then read about <strong>Triggers</strong>, <strong>Aliases</strong>, and{' '}
                <strong>Timers</strong> to understand the building blocks.
              </p>
            </section>

            {/* ── GETTING STARTED ─────────────────────────────── */}
            <section data-section="getting-started" className={styles.section}>
              <h3 className={styles.sectionHeading}>Getting Started</h3>

              <h4 className={styles.subHeading}>Opening the Script Sandbox</h4>
              <p>
                Go to <strong>Game → Script Sandbox</strong> in the menu bar at the top of the
                window. This is your scripting workshop.
              </p>

              <h4 className={styles.subHeading}>The Script Sandbox tabs</h4>
              <p>The sandbox has several tabs:</p>
              <ul className={styles.list}>
                <li>
                  <strong>Triggers</strong> — Scripts that fire when the game sends a matching line
                  of text.
                </li>
                <li>
                  <strong>Aliases</strong> — Scripts that fire when <em>you</em> type a matching
                  command.
                </li>
                <li>
                  <strong>Timers</strong> — Scripts that run on a schedule (every N seconds).
                </li>
                <li>
                  <strong>Globals</strong> — A shared "library" of reusable functions you can call
                  from your other scripts.
                </li>
                <li>
                  <strong>Variables</strong> — Named text values you can read inside scripts, like{' '}
                  <code>TARGET=orc guard</code>.
                </li>
              </ul>

              <h4 className={styles.subHeading}>Choosing a scripting language</h4>
              <p>
                Each script has a language picker. You can choose from{' '}
                <strong>JavaScript</strong>, <strong>TypeScript</strong>, <strong>Lua</strong>,{' '}
                <strong>Python</strong>, or <strong>Plain Text</strong>.
              </p>
              <div className={styles.callout}>
                <strong>Recommendation for beginners:</strong> Start with{' '}
                <strong>JavaScript</strong>. It's the most commonly used language for scripting in
                this client, and the examples in this guide are written in JavaScript.
              </div>
              <p>
                <strong>Plain Text</strong> is the simplest option — just type one game command per
                line. No code required! But it can't react to game events.
              </p>
            </section>

            {/* ── TRIGGERS ────────────────────────────────────── */}
            <section data-section="triggers" className={styles.section}>
              <h3 className={styles.sectionHeading}>Triggers</h3>

              <p>
                A <strong>trigger</strong> watches every line of text that comes from the game. When
                a line matches your trigger, the script runs.
              </p>

              <div className={styles.callout}>
                <strong>Think of it like this:</strong> Triggers are like setting a "watch" on the
                game output. "Watch for the word <em>hungry</em> — when you see it, eat some food."
              </div>

              <h4 className={styles.subHeading}>Setting up a trigger</h4>
              <ol className={styles.list}>
                <li>Open <strong>Game → Script Sandbox → Triggers</strong></li>
                <li>Click <strong>Add Trigger</strong></li>
                <li>Give it a name (e.g. "Auto Eat")</li>
                <li>
                  Set the <strong>Match Text</strong> to a phrase that appears in the game when you
                  are hungry (e.g. <code>You are hungry</code>)
                </li>
                <li>Choose <strong>JavaScript</strong> as the language</li>
                <li>Write the script in the code box</li>
              </ol>

              <h4 className={styles.subHeading}>Simple trigger example: auto-eat</h4>
              <pre className={styles.code}>{`// Trigger: Match Text = "You are hungry"
// This script runs every time the game tells you that you're hungry.

sendCommand("eat bread");`}</pre>

              <h4 className={styles.subHeading}>What the API gives you in a trigger</h4>
              <p>Inside a trigger script, you have access to:</p>
              <ul className={styles.list}>
                <li>
                  <code>sendCommand("...")</code> — Sends a command to the game, as if you typed it.
                </li>
                <li>
                  <code>writeTerminal("...")</code> — Writes a message in your terminal window (only
                  you see it, it doesn't go to the game).
                </li>
                <li>
                  <code>log(...)</code> — Writes to the script log for debugging.
                </li>
                <li>
                  <code>event.name</code> — The name of the event that fired the trigger.
                </li>
                <li>
                  <code>event.payload</code> — Data attached to the event (varies by event type).
                </li>
              </ul>

              <h4 className={styles.subHeading}>Game events you can trigger on</h4>
              <p>
                Besides matching raw text, triggers can listen for specific <em>game events</em>.
                Set the <strong>Event Name</strong> field to one of these:
              </p>
              <div className={styles.table}>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>shatteredarchive:raw-data</span>
                  <span>Every line of text from the game (default)</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>game:tick</span>
                  <span>Server tick event from the game</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>game:char-data</span>
                  <span>Your character's stats were updated</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>game:room-data</span>
                  <span>You entered a new room</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>event:creature-death</span>
                  <span>A creature died (you'll see "is DEAD!!")</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>event:damage</span>
                  <span>Damage was dealt in combat</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>event:level-up</span>
                  <span>Your character gained a level</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>event:disarm</span>
                  <span>Your weapon was disarmed</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>event:flee:success</span>
                  <span>You successfully fled combat</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>game:affects-trueup</span>
                  <span>Your full list of active spells/affects</span>
                </div>
              </div>

              <h4 className={styles.subHeading}>Omitting matched lines from output</h4>
              <p>
                If you check <strong>"Omit from output"</strong>, the matching line will be hidden
                from the terminal. Use this to suppress spam lines or replace them with your own
                colored output.
              </p>

              <h4 className={styles.subHeading}>DSL color codes</h4>
              <p>
                Use <code>writeTerminal()</code> with color codes to make your messages stand out:
              </p>
              <pre className={styles.code}>{`// Color codes: {r=red {g=green {y=yellow {b=blue
//               {m=magenta {c=cyan {w=white
//               {R {G {Y {B {M {C {W = bright versions
//               {x = reset to normal

writeTerminal("{GYou look healthy!{x\\n");
writeTerminal("{RWarning: low health!{x\\n");`}</pre>
            </section>

            {/* ── ALIASES ─────────────────────────────────────── */}
            <section data-section="aliases" className={styles.section}>
              <h3 className={styles.sectionHeading}>Aliases</h3>

              <p>
                An <strong>alias</strong> is a shortcut command. When you type a matching command
                into the game input box, the script runs instead of sending the command directly to
                the game.
              </p>

              <div className={styles.callout}>
                <strong>Think of it like this:</strong> Aliases let you type short commands that
                expand into many actions. Type <code>ks</code> and it automatically kills, loots,
                and stands up.
              </div>

              <h4 className={styles.subHeading}>Simple alias example: attack sequence</h4>
              <pre className={styles.code}>{`// Alias name: "ks"
// When you type "ks", this script runs.

const target = getNamedVar("TARGET") || "rat";
sendCommand("kill " + target);`}</pre>

              <h4 className={styles.subHeading}>Aliases with parameters</h4>
              <p>
                You can capture words from your command using <code>{`{varname}`}</code> in the
                alias name:
              </p>
              <pre className={styles.code}>{`// Alias name: "attack {target}"
// You type: attack orc guard
// The word "orc guard" is captured as the variable TARGET

sendCommand("kill " + TARGET);`}</pre>

              <div className={styles.callout}>
                <strong>How variable capture works:</strong> Words you type after the alias name are
                captured into variables. If your alias is <code>attack {`{who}`}</code> and you
                type <code>attack orc</code>, then <code>who</code> holds the value{' '}
                <code>orc</code> inside your script.
              </div>

              <h4 className={styles.subHeading}>Chaining multiple commands</h4>
              <pre className={styles.code}>{`// Alias name: "loot"
// Loots the corpse and stands up

sendCommand("get all corpse");
sendCommand("stand");`}</pre>
            </section>

            {/* ── TIMERS ──────────────────────────────────────── */}
            <section data-section="timers" className={styles.section}>
              <h3 className={styles.sectionHeading}>Timers</h3>

              <p>
                A <strong>timer</strong> runs your script on a repeating schedule — every N
                seconds — regardless of what's happening in the game.
              </p>

              <div className={styles.callout}>
                <strong>Think of it like this:</strong> Timers are like a kitchen timer that goes
                off every few minutes. "Every 30 seconds, check if I need to drink water."
              </div>

              <h4 className={styles.subHeading}>Setting up a timer</h4>
              <ol className={styles.list}>
                <li>Open <strong>Game → Script Sandbox → Timers</strong></li>
                <li>Click <strong>Add Timer</strong></li>
                <li>Set the <strong>Interval</strong> in milliseconds (1000 = 1 second)</li>
                <li>Write your script</li>
              </ol>

              <h4 className={styles.subHeading}>Timer example: periodic check</h4>
              <pre className={styles.code}>{`// Timer: runs every 30000ms (30 seconds)
// Sends the "score" command to update your stats.

sendCommand("score");`}</pre>

              <h4 className={styles.subHeading}>Timer with state: cooldown tracking</h4>
              <pre className={styles.code}>{`// Timer: runs every 5000ms (5 seconds)
// Only heals if the "healing" cooldown has expired.

const lastHeal = getGlobalVar("lastHealTime") || 0;
const now = Date.now();

if (now - lastHeal > 60000) {   // At least 60 seconds since last heal
  sendCommand("cast 'heal'");
  setGlobalVar("lastHealTime", now);
}`}</pre>

              <div className={styles.callout}>
                <strong>Tip:</strong> Timers are great for passive checks (are my affects still up?
                do I need food or water?), while triggers are better for reacting to specific game
                messages.
              </div>
            </section>

            {/* ── VARIABLES ───────────────────────────────────── */}
            <section data-section="variables" className={styles.section}>
              <h3 className={styles.sectionHeading}>Variables</h3>

              <p>
                Variables let you store and share information between your scripts. There are two
                types.
              </p>

              <h4 className={styles.subHeading}>Named Variables (Variables tab)</h4>
              <p>
                Named variables are simple text values you set in the <strong>Variables tab</strong>{' '}
                of the Script Sandbox. Think of them as global settings for your scripts.
              </p>
              <pre className={styles.code}>{`// In the Variables tab, you set:
//   TARGET = orc guard
//   WEAPON = sword

// Then in any script:
const target = getNamedVar("TARGET");  // Returns "orc guard"
const weapon = getNamedVar("WEAPON");  // Returns "sword"

sendCommand("kill " + target);`}</pre>
              <div className={styles.callout}>
                <strong>Note:</strong> Named variable names are case-sensitive. <code>TARGET</code>{' '}
                and <code>target</code> are different variables.
              </div>

              <h4 className={styles.subHeading}>Global Variables (persistent storage)</h4>
              <p>
                Global variables are saved automatically between sessions. Use them to remember
                things across logins, like counters, last targets, or configuration choices.
              </p>
              <pre className={styles.code}>{`// Store a value
setGlobalVar("killCount", 42);

// Read it back (even after relogging)
const kills = getGlobalVar("killCount");
writeTerminal("Total kills: " + kills + "\\n");

// Delete it
deleteGlobalVar("killCount");`}</pre>

              <div className={styles.callout}>
                <strong>When to use which:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                  <li>
                    <strong>Named Variables</strong> — Things you want to easily set and change,
                    like your current target or preferred weapon.
                  </li>
                  <li>
                    <strong>Global Variables</strong> — Things your scripts need to remember on
                    their own, like counters, timestamps, or whether a task is running.
                  </li>
                </ul>
              </div>
            </section>

            {/* ── PRACTICAL EXAMPLES ──────────────────────────── */}
            <section data-section="examples" className={styles.section}>
              <h3 className={styles.sectionHeading}>Practical Examples</h3>

              <p>
                Here are complete, copy-paste-ready scripts for common tasks. Each one includes a
                plain-English description of what it does.
              </p>

              <h4 className={styles.subHeading}>Auto-eat when hungry</h4>
              <p>
                This trigger watches for the game telling you that you're hungry and automatically
                eats food.
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Match text:   "You are hungry"
// Language:     JavaScript

sendCommand("eat bread");`}</pre>

              <h4 className={styles.subHeading}>Auto-drink when thirsty</h4>
              <pre className={styles.code}>{`// Script type: Trigger
// Match text:   "You are thirsty"
// Language:     JavaScript

sendCommand("drink water");`}</pre>

              <h4 className={styles.subHeading}>Auto-stand when knocked down</h4>
              <p>
                This trigger fires when the game tells you that you've been knocked down, and
                automatically sends the stand command.
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Match text:   "knocking you senseless"
// Language:     JavaScript

sendCommand("stand");`}</pre>

              <h4 className={styles.subHeading}>Re-wield weapon after disarm</h4>
              <p>
                This trigger uses the <code>event:disarm</code> event. When your weapon is knocked
                from your hands, it automatically picks it up and wields it again.
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Event name:   event:disarm
// Language:     JavaScript

// event.payload contains the name of the item that was disarmed
const item = event.payload;

if (item) {
  sendCommand("get " + item);
  sendCommand("wield " + item);
} else {
  writeTerminal("{Ydisarm trigger: unknown item, check manually{x\\n");
}`}</pre>

              <h4 className={styles.subHeading}>Play a sound when someone tells you</h4>
              <p>
                This trigger plays a bell chime in your browser whenever someone sends you a{' '}
                <code>tell</code> message, so you never miss one.
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Event name:   shatteredarchive:raw-data
// Match text:   "tells you"
// Language:     JavaScript

// Play a simple three-note chime using the Web Audio API
(async () => {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
    gain.connect(ctx.destination);

    const notes = [880, 988, 1046];
    let t = ctx.currentTime;
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.15);
      t += 0.15;
    }
  } catch (e) {
    log("Bell failed:", e);
  }
})();`}</pre>

              <h4 className={styles.subHeading}>Color-coded damage display</h4>
              <p>
                This trigger listens for the <code>event:damage</code> event and rewrites damage
                lines with colors based on how serious the hit is.
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Event name:   event:damage
// Check:        "Don't require match text" (fires on all damage)
// Check:        "Omit from output" (hide the raw line, show colored version)
// Language:     JavaScript

const p = event?.payload ?? {};
const key = String(p.key ?? "");
const amount = p.amount;
const rawLine = String(p.rawText ?? p.line ?? "").replace(/\\r?\\n$/, "");

// Pick a color based on damage severity
let color = "{x";
if (key === "miss" || key === "misses") {
  color = "{y";           // yellow = miss
} else if (["OBLITERATES","ANNIHILATES","ERADICATES"].includes(key)) {
  color = "{R";           // bright red = devastating
} else if (["DISEMBOWELS","DISMEMBERS","MASSACRES"].includes(key)) {
  color = "{Y";           // bright yellow = heavy
} else {
  color = "{g";           // green = normal hit
}

writeTerminal(rawLine + " {B({x " + color + amount + "{x {B){x\\n");`}</pre>

              <h4 className={styles.subHeading}>Potion brewing shortcut</h4>
              <p>
                This pair of scripts saves your brew commands and replays them. Set the brew command
                once, then use a short alias to start brewing.
              </p>
              <pre className={styles.code}>{`// Alias 1: "setbrew {potion} {brewCommand}"
// Example:   setbrew health 2xherb stir 'red mushroom'
// Language:  JavaScript

const key = "brew-stir-" + potion;
setGlobalVar(key, brewCommand);
writeTerminal("{gSet " + key + " to {B" + brewCommand + "{x\\n");`}</pre>
              <pre className={styles.code}>{`// Alias 2: "brew {potion}"
// Example:   brew health
// Language:  JavaScript

const key = "brew-stir-" + potion;
const cmd = getGlobalVar(key);

if (cmd) {
  sendCommand(cmd);
} else {
  writeTerminal("{RNo brew command set for " + potion + ". Use setbrew first.{x\\n");
}`}</pre>
            </section>

            {/* ── PLUGINS ─────────────────────────────────────── */}
            <section data-section="plugins" className={styles.section}>
              <h3 className={styles.sectionHeading}>Plugins</h3>

              <p>
                Plugins are pre-built automation tools. Unlike scripts, you don't need to write any
                code — just enable the plugin and fill in the settings.
              </p>

              <h4 className={styles.subHeading}>Managing plugins</h4>
              <p>
                Go to <strong>Plugins → Manage Plugins…</strong> in the menu bar. You'll see a list
                of available plugins. Click <strong>Install</strong> to add one, then toggle it on.
                Installed plugins that are toggled off appear dimmed — they won't run until enabled.
              </p>

              {/* ── Plugin index ── */}
              <div className={styles.pluginIndex}>
                {[
                  { id: 'plugin-roller',     label: 'Roller' },
                  { id: 'plugin-standup',    label: 'Auto Standup' },
                  { id: 'plugin-respell',    label: 'Auto Respell' },
                  { id: 'plugin-rewield',    label: 'Auto Re-wield' },
                  { id: 'plugin-brew',       label: 'Brew Helper' },
                  { id: 'plugin-colorkit',   label: 'Color Kit' },
                  { id: 'plugin-enchant',    label: 'Enchant Helper' },
                  { id: 'plugin-gourd',      label: 'Gourd Helper' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={styles.pluginIndexLink}
                    onClick={() => scrollToAnchor(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Roller ── */}
              <h4 id="plugin-roller" className={styles.pluginHeading}>Roller</h4>
              <p>
                Automates character stat rolling at creation. Set minimum thresholds for each stat
                and the plugin will keep rejecting rolls until all your targets are met.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>Click <strong>Configure</strong> to set your stat minimums</li>
                <li>Start rolling in-game — the plugin handles the rest</li>
              </ul>

              {/* ── Auto Standup ── */}
              <h4 id="plugin-standup" className={styles.pluginHeading}>Auto Standup</h4>
              <p>
                Automatically issues a stand command whenever the server sends text matching one of
                your configured knockdown phrases. Replaces manual trigger scripts.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  Click <strong>Configure</strong> — add one knockdown phrase per line (lines
                  starting with <code>#</code> are comments)
                </li>
                <li>
                  Set <em>Stand command</em> to whatever command stands your character up (default:{' '}
                  <code>~st</code>)
                </li>
                <li>Matching is case-insensitive</li>
              </ul>
              <pre className={styles.code}>{`# Trigger phrases — one per line:
knocking you senseless
You fall to the ground
You are stunned
You are knocked down
You lose your balance and fall
You slip and fall`}</pre>

              {/* ── Auto Respell ── */}
              <h4 id="plugin-respell" className={styles.pluginHeading}>Auto Respell</h4>
              <p>
                Watches for affects dropping (via GMCP <code>game:affect-removed</code> and periodic
                full-list refreshes) and automatically re-casts any spell or skill you have listed.
                Replaces DSL_PNP_Affects.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  Add one spell per line: <code>affect name | cast command</code>
                </li>
                <li>
                  Omit <code>| cast command</code> to default to <code>cast '&lt;affect name&gt;'</code>
                </li>
                <li>
                  <em>Recast delay (ms)</em> — pause before recasting to avoid flooding (default 500 ms)
                </li>
                <li>A shared cooldown prevents double-casting when multiple sources detect the same drop</li>
              </ul>
              <pre className={styles.code}>{`# affect name | cast command
# Omit command to default to: cast '<affect name>'
sanctuary
bless | cast 'bless' self
armor | cast 'armor' self
haste | cast 'haste'`}</pre>

              {/* ── Auto Re-wield ── */}
              <h4 id="plugin-rewield" className={styles.pluginHeading}>Auto Re-wield</h4>
              <p>
                When the server fires a <code>event:disarm</code> event, automatically retrieves
                and re-wields your weapon using your configured alias. Supports a{' '}
                <em>nodrop</em> flag for weapons that don't hit the floor.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  Add one weapon per line: <code>full item name | alias</code> or{' '}
                  <code>full item name | alias | nodrop</code>
                </li>
                <li>
                  Without <code>nodrop</code>: sends <code>~get alias</code> then{' '}
                  <code>wield alias</code>
                </li>
                <li>
                  With <code>nodrop</code>: sends <code>~wield alias</code> only (item stayed on you)
                </li>
              </ul>
              <pre className={styles.code}>{`# full item name | alias | nodrop (nodrop optional)
the Magius Staff | magius
the Darkstaff | darkstaff
the icy staff of the Seven Seas | sea
a scorched staff covered in charred runes | hoopak | nodrop
a grand arcanium glaive | glaive`}</pre>

              {/* ── Brew Helper ── */}
              <h4 id="plugin-brew" className={styles.pluginHeading}>Brew Helper</h4>
              <p>
                Automates potion brewing with a letter-map shorthand and named recipes. Type{' '}
                <code>brew &lt;name&gt;</code> to execute a recipe — the plugin fetches each
                ingredient from your storage container and puts it in the cauldron.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  <em>Letter map</em>: one mapping per line — <code>LETTER = item name</code>
                </li>
                <li>
                  <em>Recipes</em>: one recipe per line — <code>name = token token …</code>.
                  Tokens: single letter, <code>'quoted item'</code>, or quantity prefix like{' '}
                  <code>2xS</code> / <code>3x'ill shard'</code>
                </li>
                <li>
                  <em>Storage container</em>: where ingredients are fetched from (default:{' '}
                  <code>shelf</code>)
                </li>
              </ul>
              <pre className={styles.code}>{`# Letter map
C = cologne
S = ill shard
K = continual light

# Recipes
health = 2xS C P V
light  = 2x'ill shard' K`}</pre>
              <div className={styles.table}>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>brew &lt;name&gt;</code></span>
                  <span>Execute a recipe — fetches all ingredients and puts them in the cauldron</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>showbrews</code></span>
                  <span>List all saved recipes</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>showletters</code></span>
                  <span>List all letter-to-item mappings</span>
                </div>
              </div>

              {/* ── Color Kit ── */}
              <h4 id="plugin-colorkit" className={styles.pluginHeading}>Color Kit</h4>
              <p>
                Colorizes matched lines in the terminal without requiring any trigger scripts. Each
                rule suppresses the original line and re-prints it in your chosen color.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  Add one rule per line: <code>match text | color [| event]</code>
                </li>
                <li>
                  <em>color</em> is a single DSL code letter — <code>r</code> dark red,{' '}
                  <code>R</code> bright red, <code>y</code> yellow, <code>g</code> green,{' '}
                  <code>B</code> bright blue, <code>p</code> pink, <code>o</code> orange, etc.
                </li>
                <li>
                  <em>event</em> is optional — defaults to <code>shatteredarchive:raw-data</code>.
                  Use <code>event:line</code> if needed.
                </li>
                <li>
                  After changing rules, click <strong>Sync colors</strong> in the Configure panel
                  to apply the new suppression list without toggling the plugin
                </li>
                <li>First matching rule wins — rules are checked top to bottom</li>
              </ul>
              <pre className={styles.code}>{`# match text | color | event (event optional)
DISARMS you and sends your weapon flying! | r
The white aura around your body fades | r
You feel yourself slowing down. | y
looks very ill. | B
is surrounded by a pink outline. | B
muscles stop responding | p`}</pre>

              {/* ── Enchant Helper ── */}
              <h4 id="plugin-enchant" className={styles.pluginHeading}>Enchant Helper</h4>
              <p>
                Automates the enchanting loop. Tracks the current enchant level of your active item,
                watches for server responses, and can automatically continue casting until a target
                level is reached. Handles fades (resets level) and explosions (marks item destroyed).
                Replaces DSL_PNP_Enchant.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  <em>Items to enchant</em>: one item per line — <code>item name | weapon or armor</code>
                </li>
                <li>
                  <em>Container</em>: bag or container to get items from (e.g. <code>bag</code>)
                </li>
                <li>
                  <em>Storage</em>: where to put finished items before fetching the next (optional)
                </li>
                <li>
                  <em>Auto-enchant target level</em>: keep casting until this level (0–3). Set to{' '}
                  <code>0</code> to cast once per command
                </li>
              </ul>
              <pre className={styles.code}>{`# Items to enchant — item name | weapon or armor
fancy sword | weapon
dragon helm | armor`}</pre>
              <p>Commands available in the command bar once the plugin is enabled:</p>
              <div className={styles.table}>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant start [name]</code></span>
                  <span>Set active item and begin enchanting. Name optional if only one item is configured.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant stop</code></span>
                  <span>Halt the auto-enchant loop.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant get [name]</code></span>
                  <span>Put current item in storage, fetch the named (or active) item from container.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant restore</code></span>
                  <span>Cast restore on the active item.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant disenchant</code></span>
                  <span>Cast disenchant on the active item.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant identify</code></span>
                  <span>Cast identify on the active item.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant reset</code></span>
                  <span>Reset the tracked enchant level to 0.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant set &lt;n&gt;</code></span>
                  <span>Manually override the tracked level (useful after an identify).</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>enchant show</code></span>
                  <span>Print current item, level, and auto-enchant status to the terminal.</span>
                </div>
              </div>
              <div className={styles.callout}>
                <strong>Level tracking:</strong> Weapon levels display as{' '}
                <code>+1/+1</code>, <code>+2/+2</code>, <code>+3/+3</code>. Armor levels display
                as <code>-1</code>, <code>-2</code>, <code>-3</code>. Max useful level is 3 for
                both types. If the item explodes, it is marked <strong>DESTROYED</strong> and
                auto-enchanting halts.
              </div>

              {/* ── Gourd Helper ── */}
              <h4 id="plugin-gourd" className={styles.pluginHeading}>Gourd Helper</h4>
              <p>
                Tracks your potion gourd inventory. Automatically learns gourds from{' '}
                <code>lore</code> output, removes them when they evaporate or are used, and lets
                you quaff, apply, toss, or drop them by spell name or list number. When enabled,
                a <strong>Gourds</strong> tab appears next to the Affects Summary in the right
                panel. Replaces DSL_PNP_Gourd.
              </p>
              <ul className={styles.list}>
                <li>Enable from <strong>Plugins → Manage Plugins</strong></li>
                <li>
                  The <strong>Gourds</strong> tab in the right sidebar shows your full list with
                  numbers and spell contents
                </li>
                <li>
                  Type <code>scan gourds</code> after logging in to lore all gourds in your
                  inventory and build the list from scratch
                </li>
                <li>
                  Gourds are removed automatically when they evaporate or you quaff/apply/toss/drop
                  them through the plugin aliases
                </li>
              </ul>
              <p>Commands available in the command bar once the plugin is enabled:</p>
              <div className={styles.table}>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>scan gourds</code></span>
                  <span>Clears the list and lores every gourd in your inventory to rebuild it.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>remove gourd &lt;n&gt;</code></span>
                  <span>Manually remove gourd number <em>n</em> from the list.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>gq &lt;spell or #&gt;</code></span>
                  <span>Quaff a gourd by spell name or list number. Removes it from the list.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>gd &lt;spell or #&gt;</code></span>
                  <span>Drop a gourd by spell name or list number. Removes it from the list.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>toss &lt;spell or #&gt;</code></span>
                  <span>Toss a gourd. Resolves to the indexed item name. Falls through if not a tracked gourd.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}><code>apply &lt;spell or #&gt; [target]</code></span>
                  <span>Apply a gourd. Resolves to the indexed item name. Falls through if not a tracked gourd.</span>
                </div>
              </div>
              <div className={styles.callout}>
                <strong>How references work:</strong> You can refer to gourds by spell name (e.g.{' '}
                <code>gq sanctuary</code>) or by their list number (e.g. <code>gq 3</code>). When
                you have multiple gourds of the same type, each gets a unique index prefix —{' '}
                <code>1.healing</code>, <code>2.healing</code>, etc. — so the mud knows exactly
                which one to use.
              </div>
              <pre className={styles.code}>{`scan gourds          — lore all gourds, build list
gq sanctuary         — quaff the gourd containing sanctuary
gq 2                 — quaff gourd #2 from the list
apply 'fire shield'  — apply a gourd with fire shield
toss cone            — toss a gourd containing cone of cold
remove gourd 4       — remove entry 4 manually`}</pre>

              {/* ── Scripts vs Plugins ── */}
              <h4 className={styles.subHeading}>Scripts vs plugins</h4>
              <div className={styles.table}>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>Scripts</span>
                  <span>You write the code. Flexible, personal. Lives in the Script Sandbox.</span>
                </div>
                <div className={styles.tableRow}>
                  <span className={styles.tableKey}>Plugins</span>
                  <span>Pre-packaged tools. Configure and enable. Found in Plugins → Manage Plugins.</span>
                </div>
              </div>
            </section>

            {/* ── DSL PNP REFERENCE ───────────────────────────── */}
            <section data-section="pnp" className={styles.section}>
              <h3 className={styles.sectionHeading}>DSL PNP Reference</h3>

              <p>
                <strong>DSL PNP</strong> (also written "dslpnp") is a community scripting pack that
                was originally written for <em>Mudlet</em>, another MUD client. Many DSL players
                have used PNP for years to automate common game tasks.
              </p>
              <p>
                If you're coming from a Mudlet/PNP background, this section maps the PNP modules
                you already know to equivalent features in the Shattered Archive client.
              </p>

              <div className={styles.callout}>
                <strong>Good news:</strong> Many of the most popular PNP features are already
                available here as built-in plugins — Roller, Auto Standup, Auto Respell, Auto
                Re-wield, Brew Helper, Color Kit, Enchant Helper, and Gourd Helper. Others are
                easy to re-create as scripts in a few lines of code.
              </div>

              <h4 className={styles.subHeading}>PNP Module Overview</h4>
              <p>Here's every major PNP module and what it does, mapped to the Shattered Archive client:</p>

              <div className={styles.pnpTable}>
                <div className={styles.pnpHeader}>
                  <span>PNP Module</span>
                  <span>What it does</span>
                  <span>Equivalent here</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Roller</span>
                  <span>Auto-accepts/rejects stat rolls at character creation based on targets</span>
                  <span className={styles.pnpBuiltin}>Built-in Roller Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Character.standup</span>
                  <span>Automatically stands up when knocked down</span>
                  <span className={styles.pnpBuiltin}>Built-in Auto Standup Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Character.spellup</span>
                  <span>Automatically blesses or fireproofs all your worn equipment one piece at a time</span>
                  <span>Scripting TODO — plugin conversion planned</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Character.disarm</span>
                  <span>When your weapon is disarmed, automatically retrieves and re-wields it</span>
                  <span className={styles.pnpBuiltin}>Built-in Auto Re-wield Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Character.equipment</span>
                  <span>Tracks what you have equipped in each slot</span>
                  <span>Built-in Equipment panel (Game → Equipment)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Affects</span>
                  <span>Tracks your active spells/affects and can re-cast them when they drop</span>
                  <span className={styles.pnpBuiltin}>Built-in Auto Respell Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Battle</span>
                  <span>Combat automation: tracks enemy HP, flees when low, uses healing</span>
                  <span>
                    Trigger on <code>game:char-data</code> for HP monitoring; trigger on{' '}
                    <code>event:damage</code> for combat events
                  </span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Speedwalk</span>
                  <span>Records and plays back movement paths (walk a route automatically)</span>
                  <span>Scripting TODO — plugin conversion planned</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Gourd</span>
                  <span>Tracks potion gourd inventory; quaff/apply/toss by spell name or number</span>
                  <span className={styles.pnpBuiltin}>Built-in Gourd Helper Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL Brew Scripts</span>
                  <span>Letter-map shortcuts and named recipes for potion brewing (get/put from storage → cauldron)</span>
                  <span className={styles.pnpBuiltin}>Built-in Brew Helper Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Ticktimer</span>
                  <span>Tracks MUD ticks (the regular heartbeat of the game world)</span>
                  <span>Trigger on <code>game:tick</code></span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Highlighter</span>
                  <span>Highlights keywords in different colors (mob names, tells, etc.)</span>
                  <span>
                    Trigger with <strong>Omit from output</strong> + custom{' '}
                    <code>writeTerminal()</code> with DSL color codes
                  </span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Enchant</span>
                  <span>Automates the enchanting process on equipment</span>
                  <span className={styles.pnpBuiltin}>Built-in Enchant Helper Plugin (Plugins → Manage)</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_Moons</span>
                  <span>Tracks moon phases (relevant to druid-type abilities)</span>
                  <span>Trigger on <code>game:room-data</code> to parse moon information</span>
                </div>

                <div className={styles.pnpRow}>
                  <span className={styles.pnpName}>DSL_PNP_People</span>
                  <span>Tracks who is online and in your area</span>
                  <span>Trigger on <code>shatteredarchive:raw-data</code> matching "who" output</span>
                </div>
              </div>

              <h4 className={styles.subHeading}>Affects / Buff Tracking Example</h4>
              <p>
                The PNP Affects module is one of the most popular. Here's the simplest version —
                detecting when a specific affect drops and re-casting it:
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Event name:   game:affect-removed
// Language:     JavaScript
// This fires when any affect is removed from your character.

const affectName = String(event?.payload ?? "");

// Re-cast sanctuary if it drops
if (affectName.toLowerCase().includes("sanctuary")) {
  writeTerminal("{Ysanctuary dropped, recasting...{x\\n");
  sendCommand("cast 'sanctuary'");
}`}</pre>

              <h4 className={styles.subHeading}>Auto-flee on low HP example</h4>
              <p>
                PNP Battle handles this automatically. Here's a simple trigger version:
              </p>
              <pre className={styles.code}>{`// Script type: Trigger
// Event name:   game:char-data
// Language:     JavaScript
// Fires whenever the server updates your character stats (HP, etc.)

const data = event?.payload ?? {};
const hp = data.hp;
const maxHp = data.maxHp;

if (hp && maxHp && (hp / maxHp) < 0.20) {
  // Below 20% HP — flee!
  writeTerminal("{RLow HP! Fleeing!{x\\n");
  sendCommand("flee");
}`}</pre>

              <h4 className={styles.subHeading}>Key differences from Mudlet PNP</h4>
              <ul className={styles.list}>
                <li>
                  PNP was built for Mudlet (a desktop app). This client runs in the browser, so some
                  Mudlet-specific features (file I/O, window overlays, gauges) aren't directly
                  available.
                </li>
                <li>
                  PNP modules depend on each other heavily (e.g. Spellup requires the Equipment
                  module). Here, each script or plugin is independent.
                </li>
                <li>
                  PNP uses Lua. Scripts here can be JavaScript, TypeScript, Lua, or Python. Lua
                  scripts work slightly differently (see <strong>Game → Script Sandbox → Lua</strong>{' '}
                  tab for Lua-specific syntax).
                </li>
                <li>
                  The event names are different. PNP uses <code>raiseEvent("onKnockdown")</code>;
                  this client uses <code>event:disarm</code>, <code>game:char-data</code>, etc.
                </li>
              </ul>

              <div className={styles.callout}>
                <strong>Planned:</strong> Plugin conversions of DSL_PNP_Character.spellup,
                DSL_PNP_Speedwalk, and DSL_PNP_Enchant are on the roadmap. When available,
                they'll appear in <strong>Plugins → Manage Plugins</strong>.
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptingHelpModal;
