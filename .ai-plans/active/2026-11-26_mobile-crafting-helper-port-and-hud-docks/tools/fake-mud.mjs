// A stand-in game for emulator checks of the mobile app: loopback telnet with GMCP, a placeholder character, and the
// system lines the Crafting Helper waits for. It has no accounts and asks for no password.
//
//   node fake-mud.mjs [--port 4501] [--delay 0] [--log <file>]
//   adb -s emulator-5554 reverse tcp:4501 tcp:4501        then connect the app to localhost:4501
//
// Every command received is logged with a timestamp. Commands of its own (typed in the app):
//   standin drop     close the connection from the server side
//   standin login    send the login data again
//   standin quit     stop this server (the connection is closed first)
import fs from 'node:fs';
import net from 'node:net';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', '4501'));
const DELAY = Number(arg('delay', '0'));
const LOG = arg('log', '');

const IAC = 255;
const SB = 250;
const SE = 240;
const WILL = 251;
const GA = 249;
const GMCP = 201;

const RANKS = ['Spellcrafter', 'Weaponsmith (Sharp)', 'Weaponsmith (Blunt)', 'Armorcrafter', 'Tailor'];
const LOGIN_DELAY = 1000;

const log = (text) => {
  const line = `${new Date().toISOString()} ${text}`;
  console.log(line);
  if (LOG) fs.appendFileSync(LOG, `${line}\n`);
};

const gmcp = (socket, module, data) =>
  socket.write(Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${module} ${JSON.stringify(data)}`, 'latin1'), Buffer.from([IAC, SE])]));

const prompt = (socket) => socket.write(Buffer.concat([Buffer.from('<100hp 100m 100mv> ', 'latin1'), Buffer.from([IAC, GA])]));

const say = (socket, ...lines) => {
  if (socket.destroyed) return;
  socket.write(`${lines.join('\n\r')}\n\r`, 'latin1');
  prompt(socket);
};

const login = (socket) => {
  gmcp(socket, 'login_data', { name: 'Testchar', level: 10 });
  gmcp(socket, 'char_data', { hp: 100, max_hp: 100, mana: 100, max_mana: 100, move: 100, max_move: 100, is_fighting: false });
  gmcp(socket, 'room_data', { room: 'The Stand-in Workshop', sector: 'inside', exits: ['north', 'south'] });
};

/** The reply to one command, as the lines the plugin matches. */
function reply(command) {
  const [verb] = command.toLowerCase().split(' ');
  if (verb === 'eq') {
    return ['You are using:', '<wielded>            a practice sword', '<worn as shield>     a practice shield', '<sheathed>           a practice dagger'];
  }
  if (verb === 'score') return RANKS.map((rank) => `Craftskill: 100  Craft Rank: ${rank}`);
  const item = /'([^']+)'/.exec(command)?.[1] ?? 'thing';
  if (verb === 'get') return [`You get a ${item} from the mystic vault.`];
  if (verb === 'put') return [`You put a ${item} in the mystic vault.`];
  if (verb === 'lore') return ['Size: tiny   Condition: good (100%)'];
  if (['spellcraft', 'sharpweapon', 'bluntweapon', 'armorcraft', 'tailor', 'craft'].includes(verb)) return ['You were successful.'];
  return ['Ok.'];
}

const server = net.createServer((socket) => {
  log('connected');
  let buffer = '';
  socket.setEncoding('latin1');
  socket.write(Buffer.from([IAC, WILL, GMCP]));
  say(socket, 'Stand-in game. No password is asked.');
  const loginTimer = setTimeout(() => login(socket), LOGIN_DELAY);

  socket.on('data', (chunk) => {
    // drop telnet negotiation and keepalive bytes, keep the typed text
    const text = chunk.replace(/\xff\xfa[\s\S]*?\xff\xf0/g, '').replace(/\xff[\xfb-\xfe][\s\S]/g, '').replace(/\xff[\s\S]/g, '');
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const command of lines.map((l) => l.trim()).filter(Boolean)) {
      log(`received: ${command}`);
      if (command === 'standin drop') socket.destroy();
      else if (command === 'standin login') login(socket);
      else if (command === 'standin quit') {
        socket.destroy();
        server.close(() => process.exit(0));
      } else setTimeout(() => say(socket, ...reply(command)), DELAY);
    }
  });
  socket.on('error', (err) => log(`socket error: ${err.code ?? err.message}`));
  socket.on('close', () => {
    clearTimeout(loginTimer);
    log('closed');
  });
});

server.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT}, reply delay ${DELAY} ms`));
