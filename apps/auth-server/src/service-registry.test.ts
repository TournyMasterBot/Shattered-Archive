import { parseServiceRegistry, collectPublicKeys } from './service-registry.js';
import { generateServiceKeypair } from './crypto-primitives.js';

describe('parseServiceRegistry', () => {
  it('parses services and their redirect URIs', () => {
    const result = parseServiceRegistry(
      JSON.stringify({
        'shattered-web': { redirectUris: ['https://site/user/sso/callback', 'https://site/user/game-sso/callback'] },
        'mud-builder-server': { redirectUris: [] },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.empty).toBe(false);
    expect(result.services).toHaveLength(2);
    expect(result.services[0]).toEqual({
      serviceName: 'shattered-web',
      redirectUris: ['https://site/user/sso/callback', 'https://site/user/game-sso/callback'],
    });
  });

  it('treats unset and {} as EMPTY rather than as "deregister everything"', () => {
    for (const raw of [undefined, '', '   ', '{}']) {
      const result = parseServiceRegistry(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.empty).toBe(true);
      expect(result.services).toEqual([]);
    }
  });

  it('fails the WHOLE parse on any malformed entry — never partially', () => {
    // Reconciliation prunes, so a half-understood registry must not be acted on.
    const cases: [string, RegExp][] = [
      ['not json', /not valid JSON/],
      ['[]', /must be a JSON object/],
      ['"a string"', /must be a JSON object/],
      [JSON.stringify({ svc: [] }), /must be an object/],
      [JSON.stringify({ svc: { redirectUris: 'nope' } }), /must be an array/],
      [JSON.stringify({ svc: { redirectUris: [''] } }), /non-empty strings/],
      [JSON.stringify({ svc: { redirectUris: ['/relative'] } }), /not an absolute URL/],
      [JSON.stringify({ svc: { redirectUris: ['ftp://x/y'] } }), /must be http/],
      [JSON.stringify({ svc: { redirectUris: ['https://x/y#frag'] } }), /must not carry a fragment/],
      [JSON.stringify({ '': { redirectUris: [] } }), /empty service name/],
    ];
    for (const [raw, expected] of cases) {
      const result = parseServiceRegistry(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(expected);
    }
  });

  it('collapses duplicate redirect URIs', () => {
    const result = parseServiceRegistry(JSON.stringify({ svc: { redirectUris: ['https://x/y', 'https://x/y'] } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.services[0].redirectUris).toEqual(['https://x/y']);
  });
});

describe('collectPublicKeys', () => {
  it('maps <service>.pub to a service and canonicalises the key', () => {
    const { publicKeyPem } = generateServiceKeypair();
    const { byService, warnings } = collectPublicKeys([{ fileName: 'shattered-web.pub', content: publicKeyPem }]);
    expect(warnings).toEqual([]);
    expect(byService.get('shattered-web')).toHaveLength(1);
  });

  it('treats <service>@<label>.pub as the SAME service, so a rotation window is expressible as data', () => {
    const a = generateServiceKeypair().publicKeyPem;
    const b = generateServiceKeypair().publicKeyPem;
    const { byService } = collectPublicKeys([
      { fileName: 'shattered-web.pub', content: a },
      { fileName: 'shattered-web@2026-08.pub', content: b },
    ]);
    expect(byService.get('shattered-web')).toHaveLength(2);
  });

  it('canonicalises away formatting differences so the same key is never seen as two', () => {
    // A key written by another runtime may differ in line endings / trailing newline.
    const { publicKeyPem } = generateServiceKeypair();
    const crlf = publicKeyPem.replace(/\n/g, '\r\n');
    const { byService } = collectPublicKeys([
      { fileName: 'svc.pub', content: publicKeyPem },
      { fileName: 'svc@copy.pub', content: crlf },
    ]);
    expect(byService.get('svc')).toHaveLength(1);
  });

  it('skips unusable files with a warning rather than failing the pass', () => {
    // These files are written by ANOTHER container; a read landing mid-write must
    // degrade to "not yet", not to a failed boot.
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    const { byService, warnings } = collectPublicKeys([
      { fileName: 'good.pub', content: publicKeyPem },
      { fileName: 'truncated.pub', content: '-----BEGIN PUBLIC KEY-----\nabc' },
      { fileName: 'private-by-mistake.pub', content: privateKeyPem },
      { fileName: 'notes.txt', content: 'ignored, not a .pub' },
    ]);
    expect(byService.get('good')).toHaveLength(1);
    expect(byService.has('truncated')).toBe(false);
    expect(byService.has('private-by-mistake')).toBe(false);
    expect(byService.has('notes')).toBe(false);
    expect(warnings).toHaveLength(2);
  });
});
