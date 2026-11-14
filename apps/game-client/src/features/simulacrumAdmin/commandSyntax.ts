import type { BulkRule, CommandSyntax, FieldSpec, FormSpec } from './commandSyntaxTypes';

/**
 * Argument shapes of every privileged simulacrum command, written from the handlers (merc-mud/2.4/src, act_wiz.c and
 * the files named per entry). The command list itself is generated (commandTable.generated.ts); commandCatalog.test.ts
 * fails when the two disagree (ADMIN-01). A reply that matches `success` means the game did the thing; the game's
 * refusals are recognised separately (verdict rules, Phase 7).
 */

const character = (id = 'target', label = 'Character', placeholder = 'name'): FieldSpec => ({
  id,
  label,
  type: 'character',
  placeholder,
});
const word = (id: string, label: string, placeholder?: string, optional = false): FieldSpec => ({
  id,
  label,
  type: 'word',
  optional,
  placeholder,
});
const text = (id: string, label: string, placeholder?: string, optional = false): FieldSpec => ({
  id,
  label,
  type: 'text',
  optional,
  placeholder,
});
const vnum = (id: string, label: string, optional = false): FieldSpec => ({ id, label, type: 'vnum', optional });
const num = (id: string, label: string, min: number, max: number, optional = false): FieldSpec => ({
  id,
  label,
  type: 'number',
  min,
  max,
  optional,
});
const choice = (id: string, label: string, choices: readonly string[], optional = false): FieldSpec => ({
  id,
  label,
  type: 'choice',
  choices,
  optional,
});
const form = (id: string, label: string, rest: Omit<FormSpec, 'id' | 'label'>): FormSpec => ({
  id,
  label,
  ...rest,
});
const none = (label: string, success?: readonly RegExp[]): FormSpec[] => [form('run', label, { fields: [], success })];
const allScope = (field: string, scope: string, values: readonly string[] = ['all']): BulkRule => ({
  field,
  kind: 'value',
  values,
  scope,
});

/** The five toggle commands whose reply names what changed. */
const restriction = (what: string, setText: RegExp, summary: string): CommandSyntax => ({
  group: 'players',
  destructive: true,
  summary,
  forms: [form('run', what, { fields: [character()], category: 'restrict', success: [setText] })],
});

export const COMMAND_SYNTAX: Readonly<Record<string, CommandSyntax>> = {
  admin: {
    group: 'inspection',
    summary: 'Sends one GMCP package to yourself or a player so you can see what the client receives (merc-mud act_wiz.c do_admin).',
    forms: [
      form('test-gmcp', 'Test GMCP package', {
        literal: ['test', 'gmcp'],
        fields: [
          choice('type', 'Package', ['login', 'char', 'room', 'tick', 'affects']),
          word('who', 'Who (all or a player)', 'all or name', true),
        ],
        success: [/GMCP test packet sent/i],
      }),
    ],
  },
  advance: {
    group: 'players',
    destructive: true,
    summary: 'Sets a player to a level, raising or lowering them (act_wiz.c do_advance). Limited to your own trust.',
    forms: [
      form('run', 'Advance', {
        fields: [character(), num('level', 'Level', 1, 60)],
        category: 'advanced',
        success: [/Raising a player's level|Lowering a player's level/i],
      }),
    ],
  },
  allow: {
    group: 'server',
    summary: 'Removes a site from the ban list (ban.c do_allow).',
    forms: [form('run', 'Allow site', { fields: [word('site', 'Site', 'host or prefix')], success: [/unbanned|removed|lifted|allow/i] })],
  },
  areload: {
    group: 'server',
    destructive: true,
    summary: 'Hot-reloads one area file in place; on any error the world is untouched (area_reload.c do_areload).',
    forms: [
      form('run', 'Reload area', {
        fields: [{ id: 'file', label: 'Area file', type: 'areaFile', placeholder: 'midgaard.are' }],
        success: [/^Reloaded \S+ in place/],
      }),
    ],
  },
  at: {
    group: 'world',
    summary: 'Runs a command as if you stood in another room, then returns you (act_wiz.c do_at). The room is a vnum, a character or an object.',
    forms: [form('run', 'Run at', { fields: [word('where', 'Room (vnum or name)', '3001'), text('command', 'Command', 'look')], success: [/./] })],
  },
  ban: {
    group: 'server',
    destructive: true,
    summary: 'Bans a site; `*` before or after the site matches prefixes and suffixes. With no site it lists the bans (ban.c ban_site).',
    forms: [
      form('list', 'List bans', { fields: [], safe: true, success: [/Banned sites|No sites banned/i] }),
      form('add', 'Ban a site', {
        fields: [word('site', 'Site', 'host or *.example'), choice('type', 'Type', ['all', 'newbies', 'permit'], true)],
        bulk: [{ field: 'site', kind: 'wildcard', scope: 'every connection whose site matches the wildcard' }],
        success: [/added to the ban list|banned/i],
      }),
    ],
  },
  clone: {
    group: 'world',
    summary: 'Duplicates an object or mobile in the room (act_wiz.c do_clone).',
    forms: [
      form('object', 'Clone an object', { literal: ['object'], fields: [word('name', 'Object')], success: [/You clone/i] }),
      form('mobile', 'Clone a mobile', { literal: ['mobile'], fields: [word('name', 'Mobile')], success: [/You clone/i] }),
    ],
  },
  copyover: {
    group: 'server',
    destructive: true,
    summary: 'Reboots the world from disk while keeping everyone connected. Without `confirm` the game only explains (copyover.c do_copyover).',
    forms: [
      form('info', 'What copyover does', { fields: [], safe: true, success: [/Type 'copyover confirm'/i] }),
      form('run', 'Copyover now', {
        literal: ['confirm'],
        fields: [],
        confirm: true,
        confirmText: 'Every connected player sees a pause while the world reloads from disk.',
      }),
    ],
  },
  deny: {
    group: 'players',
    destructive: true,
    summary: 'Denies a player access to the game and disconnects them; used again it does not undo (act_wiz.c do_deny).',
    forms: [form('run', 'Deny', { fields: [character()], category: 'punish', success: [/^OK\./] })],
  },
  disconnect: {
    group: 'players',
    destructive: true,
    summary: 'Drops a connection by character name or descriptor number (act_wiz.c do_disconnect).',
    forms: [form('run', 'Disconnect', { fields: [word('target', 'Character or descriptor number', 'name or 12')], success: [/^Ok\./i] })],
  },
  dump: {
    group: 'server',
    destructive: true,
    summary: 'Writes memory and index counts to files on the server (db.c do_dump). The game leaves it out of wizhelp.',
    forms: none('Dump to files'),
  },
  echo: {
    group: 'communication',
    summary: 'Sends a line to everyone in your room with lower trust, prefixed `local>` (act_wiz.c do_recho).',
    forms: [form('run', 'Room echo', { fields: [text('message', 'Message')], success: [/local>/] })],
  },
  flag: {
    group: 'players',
    destructive: true,
    summary: 'Adds, removes, sets or toggles flag words on a character or mobile (flags.c do_flag). Prefix a flag with + (add), - (remove) or = (set).',
    forms: ['char', 'mob'].map((kind) =>
      form(kind, `Flags on a ${kind === 'char' ? 'character' : 'mobile'}`, {
        literal: [kind],
        fields: [
          character('name', kind === 'char' ? 'Character' : 'Mobile'),
          choice('field', 'Field', ['plr', 'comm', 'act', 'aff', 'immunity', 'resist', 'vuln', 'form', 'parts']),
          { id: 'flags', label: 'Flags', type: 'flags', placeholder: '+flag -flag' },
        ],
        category: 'advanced',
        success: [/./],
      }),
    ),
  },
  force: {
    group: 'players',
    destructive: true,
    summary: 'Makes players or mobiles run a command. `all`, `players` and `gods` need a high trust (act_wiz.c do_force).',
    forms: [
      form('run', 'Force', {
        fields: [word('target', 'Target (name, all, players, gods)', 'name'), text('command', 'Command', 'look')],
        bulk: [allScope('target', 'every player of lower trust', ['all', 'players', 'gods'])],
        category: 'advanced',
        success: [/Aye aye, right away!|^Ok\./i],
      }),
    ],
  },
  freeze: {
    group: 'players',
    destructive: true,
    summary: 'Toggles a player frozen: they cannot do anything until you freeze them again (act_wiz.c do_freeze).',
    forms: [form('run', 'Freeze or thaw', { fields: [character()], category: 'punish', success: [/FREEZE (set|removed)/] })],
  },
  gecho: {
    group: 'communication',
    summary: 'Sends a line to every player, prefixed `global>` (act_wiz.c do_echo).',
    forms: [
      form('run', 'Global echo', {
        fields: [text('message', 'Message')],
        confirm: true,
        confirmText: 'Every connected player of lower trust sees this line.',
        success: [/global>/],
      }),
    ],
  },
  gmcp: {
    group: 'settings',
    summary: 'Turns GMCP sending for your own connection on, off or toggles it (act_wiz.c do_gmcp).',
    forms: [form('run', 'GMCP sending', { fields: [choice('mode', 'Mode', ['on', 'off', 'toggle'], true)], success: [/GMCP sending: (ON|OFF)/] })],
  },
  goto: {
    group: 'world',
    summary: 'Moves you to a room by vnum, or to a character or object (act_wiz.c do_goto).',
    forms: [form('run', 'Go to', { fields: [word('where', 'Room (vnum or name)', '3001')], success: [/./] })],
  },
  guild: {
    group: 'players',
    destructive: true,
    summary: 'Puts a player in a clan, or `none` to clear it (act_wiz.c do_guild).',
    forms: [
      form('run', 'Set clan', {
        fields: [character(), word('clan', 'Clan name or none', 'none')],
        category: 'advanced',
        success: [/They are now/],
      }),
    ],
  },
  holylight: {
    group: 'settings',
    summary: 'Toggles seeing everything, dark rooms and hidden things included (act_wiz.c do_holylight).',
    forms: none('Toggle holylight', [/Holy light mode (on|off)/i]),
  },
  immtalk: {
    group: 'communication',
    summary: 'Talks on the immortal channel; with no text it switches the channel on or off (act_comm.c do_immtalk).',
    forms: [form('run', 'Immortal talk', { fields: [text('message', 'Message', undefined, true)], success: [/Immortal channel is now|: /] })],
  },
  imotd: {
    group: 'inspection',
    summary: 'Shows the immortal message of the day (act_info.c do_imotd).',
    forms: none('Show imotd', [/./]),
  },
  incognito: {
    group: 'settings',
    summary: 'Hides you from players below a level; with no level it toggles (act_wiz.c do_incognito).',
    forms: [form('run', 'Incognito', { fields: [num('level', 'Level (2 to your trust)', 2, 60, true)], success: [/You cloak your presence|no longer cloaked/i] })],
  },
  load: {
    group: 'world',
    summary: 'Creates a mobile or an object in your room from its vnum (act_wiz.c do_load).',
    forms: [
      form('mob', 'Load a mobile', { literal: ['mob'], fields: [vnum('vnum', 'Mobile vnum')], success: [/./] }),
      form('obj', 'Load an object', { literal: ['obj'], fields: [vnum('vnum', 'Object vnum'), num('level', 'Level', 0, 60)], success: [/./] }),
    ],
  },
  log: {
    group: 'server',
    summary: 'Toggles logging of everything a player types, or of all players (act_wiz.c do_log).',
    forms: [
      form('run', 'Log a player or all', {
        fields: [word('target', 'Character or all', 'name or all')],
        bulk: [allScope('target', 'every player on the server')],
        success: [/LOG (set|removed)|Log ALL (on|off)/i],
      }),
    ],
  },
  memory: {
    group: 'server',
    summary: 'Shows how many records the server holds in memory (db.c do_memory).',
    forms: none('Show memory', [/./]),
  },
  mwhere: {
    group: 'inspection',
    summary: 'Lists where a mobile or player is; with no name it lists connected characters (act_wiz.c do_mwhere).',
    forms: [form('run', 'Find a mobile or player', { fields: [text('name', 'Name', undefined, true)], success: [/\[\s*\d+\]|\d+\)/] })],
  },
  newlock: {
    group: 'server',
    destructive: true,
    summary: 'Toggles keeping new characters from being created (act_wiz.c do_newlock).',
    forms: none('Toggle newlock', [/New characters have been locked out|Newlock removed/i]),
  },
  nochannels: restriction('Toggle nochannels', /NOCHANNELS (set|removed)/, 'Toggles a player\'s channels off or on (act_wiz.c do_nochannels).'),
  noemote: restriction('Toggle noemote', /NOEMOTE (set|removed)/, 'Toggles a player\'s emotes off or on (act_wiz.c do_noemote).'),
  noshout: restriction('Toggle noshout', /NOSHOUT (set|removed)/, 'Toggles a player\'s shouting off or on (act_wiz.c do_noshout).'),
  notell: restriction('Toggle notell', /NOTELL (set|removed)/, 'Toggles a player\'s tells off or on (act_wiz.c do_notell).'),
  owhere: {
    group: 'inspection',
    summary: 'Lists where an object is in the world (act_wiz.c do_owhere).',
    forms: [form('run', 'Find an object', { fields: [word('name', 'Object keyword')], success: [/\[\s*\d+\]|\d+\)/] })],
  },
  pardon: {
    group: 'players',
    destructive: true,
    summary: 'Removes a player\'s killer or thief flag (act_wiz.c do_pardon).',
    forms: [
      form('run', 'Pardon', {
        fields: [character(), choice('flag', 'Flag', ['killer', 'thief'])],
        category: 'restore',
        success: [/(Killer|Thief) flag removed/],
      }),
    ],
  },
  peace: {
    group: 'world',
    summary: 'Stops every fight in your room (act_wiz.c do_peace).',
    forms: none('Make peace', [/^Ok\./i]),
  },
  pecho: {
    group: 'communication',
    summary: 'Sends a private line to one player, prefixed `personal>` (act_wiz.c do_pecho).',
    forms: [form('run', 'Personal echo', { fields: [character(), text('message', 'Message')], category: 'advanced', success: [/personal>/] })],
  },
  penalty: {
    group: 'inspection',
    summary: 'The penalty note board: list, read and catch up (note.c parse_note). Writing a note takes several commands and is left to the game.',
    forms: [
      form('list', 'List notes', { literal: ['list'], fields: [], success: [/./] }),
      form('read', 'Read a note', { literal: ['read'], fields: [num('number', 'Note number', 1, 100000, true)], success: [/./] }),
      form('catchup', 'Mark all read', { literal: ['catchup'], fields: [], success: [/./] }),
    ],
  },
  permban: {
    group: 'server',
    destructive: true,
    summary: 'Bans a site permanently across reboots; `*` matches prefixes and suffixes (ban.c ban_site).',
    forms: [
      form('add', 'Permanently ban a site', {
        fields: [word('site', 'Site', 'host or *.example'), choice('type', 'Type', ['all', 'newbies', 'permit'], true)],
        bulk: [{ field: 'site', kind: 'wildcard', scope: 'every connection whose site matches the wildcard' }],
        success: [/added to the ban list|banned/i],
      }),
    ],
  },
  poofin: {
    group: 'settings',
    summary: 'Sets the line players see when you arrive; it must contain your name (act_wiz.c do_bamfin).',
    forms: [form('run', 'Set poofin', { fields: [text('message', 'Line with your name', undefined, true)], success: [/./] })],
  },
  poofout: {
    group: 'settings',
    summary: 'Sets the line players see when you leave; it must contain your name (act_wiz.c do_bamfout).',
    forms: [form('run', 'Set poofout', { fields: [text('message', 'Line with your name', undefined, true)], success: [/./] })],
  },
  prefix: {
    group: 'settings',
    summary: 'Sets text put before everything you type; with no text it clears it (act_wiz.c do_prefix).',
    forms: [form('run', 'Set prefix', { fields: [text('prefix', 'Prefix', undefined, true)], success: [/Prefix (set|changed|removed)/] })],
  },
  protect: {
    group: 'players',
    destructive: true,
    summary: 'Toggles a player\'s immunity to being snooped (act_wiz.c do_protect).',
    forms: [
      form('run', 'Toggle snoop protection', {
        fields: [character()],
        category: 'restrict',
        success: [/./],
      }),
    ],
  },
  purge: {
    group: 'world',
    destructive: true,
    summary: 'With no target it removes every mobile and object in your room; with a name it removes that mobile or disconnects that player (act_wiz.c do_purge).',
    forms: [
      form('room', 'Purge this room', {
        fields: [],
        confirm: true,
        confirmText: 'Every mobile and object in your current room is removed.',
        success: [/^Ok\./i],
      }),
      form('target', 'Purge a target', { fields: [character('target', 'Mobile or player')], category: 'punish', success: [/^Ok\./i] }),
    ],
  },
  qpoints: {
    group: 'players',
    destructive: true,
    summary: 'Sets or adds to a player\'s quest points (act_wiz.c do_qpoints).',
    forms: [
      form('run', 'Quest points', {
        fields: [character(), choice('mode', 'Mode', ['set', 'add']), num('amount', 'Amount', -1000000, 1000000)],
        category: 'advanced',
        success: [/./],
      }),
    ],
  },
  reboot: {
    group: 'server',
    destructive: true,
    summary: 'Reboots the game; spell the whole word, `reboo` is refused by the game (act_wiz.c do_reboot).',
    forms: [form('run', 'Reboot now', { fields: [], confirm: true, confirmText: 'The game restarts and everyone is disconnected.' })],
  },
  restore: {
    group: 'players',
    summary: 'Restores a character, your room or everyone (act_wiz.c do_restore).',
    forms: [
      form('target', 'Restore a character', { fields: [character()], category: 'restore', success: [/^Ok\./i] }),
      form('room', 'Restore this room', { literal: ['room'], fields: [], success: [/Room restored/i] }),
      form('all', 'Restore everyone', {
        literal: ['all'],
        fields: [],
        confirm: true,
        confirmText: 'Every active player is restored.',
        success: [/All active players restored/i],
      }),
    ],
  },
  return: {
    group: 'players',
    summary: 'Returns you to your own body after a switch (act_wiz.c do_return).',
    forms: none('Return', [/You return to your original body/i]),
  },
  set: {
    group: 'players',
    destructive: true,
    summary: 'Sets a field on a character, object, room or skill (act_wiz.c do_set and the m/o/r/sset handlers).',
    forms: [
      form('char', 'Set a character field', {
        literal: ['char'],
        fields: [
          character('name', 'Character or mobile'),
          choice('field', 'Field', [
            'str', 'int', 'wis', 'dex', 'con', 'sex', 'class', 'level', 'race', 'group', 'gold', 'silver', 'hp', 'mana', 'move',
            'practice', 'align', 'train', 'thirst', 'hunger', 'drunk', 'full',
          ]),
          text('value', 'Value'),
        ],
        category: 'advanced',
        success: [/./],
      }),
      form('skill', 'Set a skill', {
        literal: ['skill'],
        fields: [character('name', 'Character'), text('skill', 'Skill or spell (then value; "all" works)', 'fireball 100')],
        success: [/./],
      }),
      form('obj', 'Set an object field', {
        literal: ['obj'],
        fields: [
          word('name', 'Object'),
          choice('field', 'Field', ['v0', 'v1', 'v2', 'v3', 'v4', 'extra', 'wear', 'level', 'weight', 'cost', 'timer']),
          text('value', 'Value'),
        ],
        success: [/./],
      }),
      form('room', 'Set a room field', {
        literal: ['room'],
        fields: [word('where', 'Room (vnum)'), choice('field', 'Field', ['flags', 'sector']), text('value', 'Value')],
        success: [/./],
      }),
    ],
  },
  shutdown: {
    group: 'server',
    destructive: true,
    summary: 'Shuts the game down; spell the whole word, `shutdow` is refused by the game (act_wiz.c do_shutdown).',
    forms: [form('run', 'Shut down now', { fields: [], confirm: true, confirmText: 'The game stops and everyone is disconnected until it is started again.' })],
  },
  slay: {
    group: 'players',
    destructive: true,
    summary: 'Kills a character standing in your room (fight.c do_slay).',
    forms: [form('run', 'Slay', { fields: [character()], category: 'punish', success: [/./] })],
  },
  smote: {
    group: 'communication',
    summary: 'An emote that must contain your name and rewrites other names to "you" (act_wiz.c do_smote).',
    forms: [form('run', 'Emote', { fields: [text('message', 'Emote with your name')], success: [/./] })],
  },
  snoop: {
    group: 'players',
    summary: 'Watches everything a player sees; `snoop` on yourself cancels (act_wiz.c do_snoop).',
    forms: [form('run', 'Snoop', { fields: [character()], category: 'inspect', success: [/^Ok\./i, /Cancelling all snoops/i] })],
  },
  sockets: {
    group: 'inspection',
    summary: 'Lists connections with their descriptor, host and state; an optional name filters (act_wiz.c do_sockets).',
    forms: [form('run', 'List sockets', { fields: [word('name', 'Name filter', undefined, true)], success: [/\[\s*\d+\s+\w+/] })],
  },
  stat: {
    group: 'inspection',
    summary: 'Shows everything the game knows about a character, mobile, object or room (act_wiz.c do_stat).',
    forms: [
      form('char', 'Stat a character', { fields: [character()], category: 'inspect', success: [/Name:|Vnum:|Level:/i] }),
      form('mob', 'Stat a mobile', { literal: ['mob'], fields: [word('name', 'Mobile')], success: [/Name:|Vnum:|Level:/i] }),
      form('obj', 'Stat an object', { literal: ['obj'], fields: [word('name', 'Object')], success: [/Name\(s\)|Vnum:|Level:/i] }),
      form('room', 'Stat a room', { literal: ['room'], fields: [vnum('vnum', 'Room vnum')], success: [/Vnum:|Name:/i] }),
    ],
  },
  string: {
    group: 'players',
    destructive: true,
    summary: 'Changes a name, description or title on a character, mobile or object (act_wiz.c do_string).',
    forms: [
      form('char', 'String a character', {
        literal: ['char'],
        fields: [
          character('name', 'Character or mobile'),
          choice('field', 'Field', ['name', 'short', 'long', 'desc', 'title', 'spec']),
          text('value', 'Text'),
        ],
        category: 'advanced',
        success: [/./],
      }),
      form('obj', 'String an object', {
        literal: ['obj'],
        fields: [word('name', 'Object'), choice('field', 'Field', ['name', 'short', 'long']), text('value', 'Text')],
        success: [/./],
      }),
    ],
  },
  switch: {
    group: 'players',
    summary: 'Takes over a mobile (act_wiz.c do_switch); `return` gets you back.',
    forms: [form('run', 'Switch into', { fields: [character('target', 'Mobile')], category: 'move', success: [/^Ok\./i] })],
  },
  transfer: {
    group: 'players',
    summary: 'Moves a player to a room, or to you when no room is given; `all` brings every player (act_wiz.c do_transfer). `teleport` is the same command.',
    forms: [
      form('run', 'Transfer', {
        fields: [word('target', 'Character or all', 'name', false), word('where', 'Destination (vnum or name)', 'your room', true)],
        bulk: [allScope('target', 'every player on the server')],
        category: 'move',
        success: [/^Ok\./i],
      }),
    ],
  },
  trust: {
    group: 'players',
    destructive: true,
    summary: 'Sets the trust level of a player, which decides which commands they may run (act_wiz.c do_trust).',
    forms: [
      form('run', 'Trust', { fields: [character(), num('level', 'Trust', 0, 60)], category: 'advanced', success: [/./] }),
    ],
  },
  violate: {
    group: 'world',
    summary: 'Like goto, but for private rooms (act_wiz.c do_violate).',
    forms: [form('run', 'Violate', { fields: [word('where', 'Private room (vnum)', '3001')], success: [/./] })],
  },
  vnum: {
    group: 'world',
    summary: 'Finds vnums by name for objects, mobiles or skills (act_wiz.c do_vnum).',
    forms: [
      form('obj', 'Find an object vnum', { literal: ['obj'], fields: [text('name', 'Name')], success: [/\[\s*\d+\]|\d+/] }),
      form('mob', 'Find a mobile vnum', { literal: ['mob'], fields: [text('name', 'Name')], success: [/\[\s*\d+\]|\d+/] }),
      form('skill', 'Find a skill', { literal: ['skill'], fields: [text('name', 'Skill or spell')], success: [/\[\s*\d+\]|\d+/] }),
    ],
  },
  wizhelp: {
    group: 'inspection',
    summary: 'Lists the immortal commands your trust can run (interp.c do_wizhelp). The Commands tab uses it to dim the others.',
    forms: none('List my commands', [/\S/]),
  },
  wizinvis: {
    group: 'settings',
    summary: 'Hides you from everyone below a level; with no level it toggles (act_wiz.c do_invis). `invis` is the same command.',
    forms: [form('run', 'Wizinvis', { fields: [num('level', 'Level (2 to your trust)', 2, 60, true)], success: [/slowly vanish|fade back into existence/i] })],
  },
  wizlock: {
    group: 'server',
    destructive: true,
    summary: 'Toggles keeping every mortal out of the game (act_wiz.c do_wizlock).',
    forms: none('Toggle wizlock', [/Game (wizlocked|un-wizlocked)/i]),
  },
  wiznet: {
    group: 'settings',
    summary: 'Chooses which immortal notices you see (act_wiz.c do_wiznet).',
    forms: [
      form('toggle', 'Switch wiznet on or off', { fields: [], success: [/Welcome to Wiznet|Signing off of Wiznet/i] }),
      form('status', 'Show my wiznet status', { literal: ['status'], fields: [], success: [/Wiznet status/i] }),
      form('show', 'List wiznet options', { literal: ['show'], fields: [], success: [/Wiznet options available/i] }),
      form('option', 'Toggle one option', { fields: [word('option', 'Option', 'logins')], success: [/You will (no longer )?(now )?see/i] }),
    ],
  },
  zecho: {
    group: 'communication',
    summary: 'Sends a line to everyone in your area with lower trust, prefixed `zone>` (act_wiz.c do_zecho).',
    forms: [form('run', 'Zone echo', { fields: [text('message', 'Message')], success: [/zone>/] })],
  },
};
