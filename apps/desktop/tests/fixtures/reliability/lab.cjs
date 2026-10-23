// Disposable local app for opt-in background Cua Driver acceptance. No user profile or accounts.
const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { writeFileSync } = require('node:fs');

if (process.env.SIA_RELIABILITY_REAL_CUA !== '1' || !process.env.SIA_LAB_READY_FILE)
  throw new Error('The background task lab requires explicit opt-in and an isolated profile.');
app.setPath('userData', process.env.SIA_LAB_USER_DATA);
app.setName('Background Task Lab');
app.commandLine.appendSwitch('force-renderer-accessibility');
app.commandLine.appendSwitch('disable-background-timer-throttling');
let definition = {
  start: '/',
  pages: { '/': { title: 'Sia Task Lab', text: 'Ready.', links: {} } },
};
let writes = [];
let visits = [];
let current = '/';
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let window;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__control') {
    if (req.headers['x-sia-lab'] !== process.env.SIA_LAB_TOKEN) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      definition = JSON.parse(body);
      writes = [];
      visits = [];
      current = definition.start;
      await window.loadURL(`http://127.0.0.1:${server.address().port}${current}`);
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ current, writes, visits, pid: process.pid }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/__action') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const values = Object.fromEntries(new URLSearchParams(body));
    const page = definition.pages[current];
    const button = page.buttons?.[values.__button];
    if (!button) {
      res.writeHead(400).end();
      return;
    }
    delete values.__button;
    if (button.write) writes.push({ id: button.write, values });
    res.writeHead(303, { Location: button.goto || current });
    res.end();
    return;
  }
  const page = definition.pages[url.pathname];
  if (!page) {
    res.writeHead(404).end('No such fixture page.');
    return;
  }
  current = url.pathname;
  visits.push(current);
  const links = Object.entries(page.links || {})
    .map(([label, path]) => `<a href="${escape(path)}">${escape(label)}</a>`)
    .join(' ');
  const fields = Object.entries(page.fields || {})
    .map(
      ([label, value]) =>
        `<label>${escape(label)}${label === 'Body' ? `<textarea name="${escape(label)}">${escape(value)}</textarea>` : `<input name="${escape(label)}" value="${escape(value)}">`}</label>`,
    )
    .join('');
  const buttons = Object.keys(page.buttons || {})
    .map(
      (label) => `<button name="__button" value="${escape(label)}">${escape(label)}</button>`,
    )
    .join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    `<!doctype html><html><head><title>${escape(page.title)}</title><style>body{font:17px system-ui;padding:32px;background:#fafcfb;color:#142820}a,button{display:inline-block;margin:8px;padding:8px}label{display:block;margin:12px}input{font:inherit;display:block;width:400px;padding:8px}pre{white-space:pre-wrap;line-height:1.5;max-width:800px}</style></head><body><h1>${escape(page.title)}</h1><nav>${links}</nav><pre>${escape(page.text)}</pre><form method="post" action="/__action">${fields}${buttons}</form><h2>Saved changes</h2><pre>${escape(JSON.stringify(writes))}</pre></body></html>`,
  );
});
app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  window = new BrowserWindow({
    width: 1050,
    height: 760,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  window.showInactive();
  window.webContents.focus();
  writeFileSync(
    process.env.SIA_LAB_READY_FILE,
    JSON.stringify({ pid: process.pid, port: server.address().port }),
  );
});
app.on('window-all-closed', () => {
  server.close();
  app.quit();
});
