/* Market List — is the released app really live? (v3.07, plan item D1)

   node .claude/tools/live-check.js <origin> [--local] [--wait=<seconds>]

   Run by .github/workflows/live-check.yml after every push to main and once a day. It answers one question: does <origin>
   serve THIS commit's app, whole? It waits (the host needs a minute or two to deploy), then checks:
     1. the page answers, and points at this version's stylesheet and module;
     2. js/app.js says this version; the stylesheet is the layered one; sw.js lists this version;
     3. every file the worker precaches answers (a missing module is a blank app on the next cold start);
     4. (not with --local) the page carries its Content-Security-Policy, the privacy page answers, and an AI function
        called with no sign-in is REFUSED (401/403) — never 200, never a server error.
   It reads nothing about the household: no list, no account, no key. A failure exits 1 with the reason, and GitHub emails
   the repository's owner. --local is for checking the script itself against `python3 -m http.server`. */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2), origin = String(args.find(a => !a.startsWith('--')) || '').replace(/\/$/, '');
const local = args.includes('--local'), wait = +((args.find(a => a.startsWith('--wait=')) || '').split('=')[1] || 360);
if(!/^https?:\/\//.test(origin)){ console.log('usage: live-check.js <origin> [--local] [--wait=<seconds>]'); process.exit(2); }
const ver = (fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').match(/const APP_VERSION = "v([\d.]+)";/) || [])[1];
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const pre = [...(sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || ['', ''])[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
const fails = [], ok = (name, cond, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${(!cond && extra) ? '   ' + extra : ''}`); if(!cond) fails.push(name); };
const get = async (p, opt) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
  try { const r = await fetch(origin + p, Object.assign({ signal:c.signal, redirect:'follow', cache:'no-store' }, opt || {}));
    return { status:r.status, text:await r.text(), headers:r.headers }; }
  catch(e){ return { status:0, text:'', headers:new Headers(), err:String(e && e.message || e).slice(0, 80) }; } finally { clearTimeout(t); } };
(async () => {
  if(!ver || !pre.length){ console.log('FAIL  could not read the version or the precache list from the repository'); process.exit(1); }
  console.log(`Checking ${origin} for v${ver} (waiting up to ${wait}s for the deploy)`);
  const until = Date.now() + wait * 1000; let app = null;
  for(;;){ app = await get(`/js/app.js?v=${ver}&_=${Date.now()}`);
    if(app.status === 200 && app.text.includes(`const APP_VERSION = "v${ver}";`)) break;
    if(Date.now() > until) break; await new Promise(r => setTimeout(r, 15000)); }
  ok(`js/app.js is served and says v${ver}`, app.status === 200 && app.text.includes(`const APP_VERSION = "v${ver}";`), app.status === 200 ? 'served an older version: ' + ((app.text.match(/const APP_VERSION = "(v[\d.]+)"/) || [])[1] || '?') : 'status ' + app.status + (app.err ? ' ' + app.err : ''));
  const page = await get('/?_=' + Date.now());
  ok('the page answers and points at this version\'s stylesheet and module', page.status === 200 && page.text.includes(`/app.css?v=${ver}`) && page.text.includes(`/js/app.js?v=${ver}`) && page.text.includes('id="app"'), 'status ' + page.status);
  const css = await get(`/app.css?v=${ver}`);
  ok('the stylesheet is served and is the layered one', css.status === 200 && css.text.includes('@layer app, blocks;'), 'status ' + css.status);
  const swl = await get('/sw.js?_=' + Date.now());
  ok('sw.js is served and lists this version', swl.status === 200 && swl.text.includes(`/js/app.js?v=${ver}`), 'status ' + swl.status);
  const missing = [];
  for(const u of pre){ const r = await get(u, { method:'GET' }); if(r.status !== 200) missing.push(u + ' → ' + r.status); }
  ok(`all ${pre.length} files the worker precaches answer`, missing.length === 0, missing.slice(0, 5).join(' ; '));
  if(!local){
    const csp = page.headers.get('content-security-policy') || '';
    ok('the page carries its Content-Security-Policy (scripts pinned, objects off)', /script-src 'self' 'sha256-/.test(csp) && /object-src 'none'/.test(csp), csp.slice(0, 80));
    const pv = await get('/privacy.html');
    ok('the privacy page answers', pv.status === 200 && /privacy/i.test(pv.text), 'status ' + pv.status);
    const api = await get('/api/parse', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ text:'live check' }) });
    ok('an AI function called with no sign-in is refused (401 or 403)', api.status === 401 || api.status === 403, 'status ' + api.status + ' ' + api.text.slice(0, 80)); }
  console.log(fails.length ? `\n${fails.length} FAILED — the live site does not match this commit` : '\nThe live site matches this commit');
  process.exit(fails.length ? 1 : 0);
})();
