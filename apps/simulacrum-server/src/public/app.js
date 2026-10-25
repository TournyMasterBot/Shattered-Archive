const statusEl = document.getElementById('status');
const actionEl = document.getElementById('action');

async function whoami() {
  const res = await fetch('/api/whoami', { credentials: 'include' });
  return res.json();
}

async function requestCode() {
  actionEl.innerHTML = '';
  const button = document.createElement('button');
  button.textContent = 'Requesting code…';
  button.disabled = true;
  actionEl.appendChild(button);

  const res = await fetch('/api/access-code', { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    actionEl.innerHTML = '<p class="error">' + (body.error || ('request failed (' + res.status + ')')) + '</p>';
    return;
  }
  const { code, expiresInMs } = await res.json();
  const minutes = Math.round(expiresInMs / 60000);
  actionEl.innerHTML =
    '<p>Your access code (valid ~' + minutes + ' minute' + (minutes === 1 ? '' : 's') + ', single-use):</p>' +
    '<p class="code">' + code + '</p>' +
    '<p class="muted">Connect to simulacrum.shatteredarchive.dev with your MUD client and type this ' +
    'code as the very first line of the session.</p>';
}

whoami().then((who) => {
  if (!who.signedIn) {
    statusEl.textContent = 'Not signed in.';
    actionEl.innerHTML = '<a class="button" href="/sso/start">Sign in with your Shattered Archive account</a>';
    return;
  }
  statusEl.textContent = 'Signed in as ' + who.username + ' (' + who.tier + ' tier).';
  const button = document.createElement('button');
  button.textContent = 'Get access code';
  button.addEventListener('click', requestCode);
  actionEl.appendChild(button);
}).catch(() => {
  statusEl.textContent = 'Could not check sign-in status.';
});
