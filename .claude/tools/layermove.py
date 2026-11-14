#!/usr/bin/env python3
"""v3.09: move a range of app.css's @layer app rules that repeat classes to win (.pill.pill.pill, html body …) into
@layer tiles, each selector wrapped in :where() (all weigh zero, so the later rule wins), in an order that keeps every
winner of the old weights after the rules it beat.

  python3 .claude/tools/layermove.py FIRST LAST          dry run: what would move, the ordering it needs, and the rules
                                                          left in @layer app that beat a moved rule today (they would
                                                          lose after the move — keep those moved rules in app, or move both)
  python3 .claude/tools/layermove.py FIRST LAST apply    do it (FIRST/LAST: 1-based lines of app.css, on rule boundaries)

"Can these two rules meet one element" is a heuristic (the last compound's classes, the .zoomer modes, data-cu-ls), so
this is the plan, not the proof: the proof is .claude/tools/cssdiff.js — snap before, snap after, zero differences — plus
a canary. The @layer tiles block is created the first time; a later run appends to it is NOT supported yet (it would make
a second block): merge by hand, keeping the order. Rules with !important are never moved (an !important in a later layer
loses to one in an earlier layer).
"""
import re, sys, itertools, heapq
SRC = 'app.css'
LO, HI = int(sys.argv[1]), int(sys.argv[2])     # 1-based inclusive line range to scan
APPLY = len(sys.argv) > 3 and sys.argv[3] == 'apply'
lines = open(SRC).read().split('\n')
text = '\n'.join(lines[LO-1:HI])
# tokenise the range into comments, rules and whitespace
items = []; i = 0; n = len(text)
while i < n:
    if text.startswith('/*', i):
        j = text.index('*/', i) + 2; items.append(['c', text[i:j]]); i = j; continue
    if text[i] in ' \n\t':
        j = i
        while j < n and text[j] in ' \n\t': j += 1
        items.append(['w', text[i:j]]); i = j; continue
    j = text.index('{', i); depth = 0; k = j
    while True:
        if text[k] == '{': depth += 1
        elif text[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    items.append(['r', text[i:k+1]]); i = k + 1
def split_top(s, sep=','):
    out, d, cur = [], 0, ''
    for ch in s:
        if ch == '(': d += 1
        if ch == ')': d -= 1
        if ch == sep and d == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur); return [x.strip() for x in out]
def spec(sel):
    a = b = c = 0; s = sel; i = 0
    while i < len(s):
        ch = s[i]
        if ch == ':' :
            m = re.match(r':(is|has|not|where)\(', s[i:])
            if m:
                k = i + len(m.group(0)); d = 1; j = k
                while d:
                    if s[j] == '(': d += 1
                    elif s[j] == ')': d -= 1
                    j += 1
                inner = s[k:j-1]
                if m.group(1) != 'where':
                    best = max((spec(x) for x in split_top(inner)), default=(0,0,0))
                    a += best[0]; b += best[1]; c += best[2]
                i = j; continue
            if s[i:i+2] == '::':
                m = re.match(r'::[\w-]+', s[i:]); c += 1; i += len(m.group(0)); continue
            m = re.match(r':[\w-]+(\([^)]*\))?', s[i:]); b += 1; i += len(m.group(0)); continue
        if ch == '#': m = re.match(r'#[\w-]+', s[i:]); a += 1; i += len(m.group(0)); continue
        if ch == '.': m = re.match(r'\.[\w-]+', s[i:]); b += 1; i += len(m.group(0)); continue
        if ch == '[': j = s.index(']', i); b += 1; i = j + 1; continue
        if re.match(r'[a-zA-Z]', ch): m = re.match(r'[a-zA-Z][\w-]*', s[i:]); c += 1; i += len(m.group(0)); continue
        i += 1
    return (a, b, c)
HACK = re.compile(r'(^|[\s,])html(\[|:not\(|\s)[^{]*?\bbody\b|\bbody \.|(\.pill(?![-\w])){2,}|(\.zoomer(?![-\w])){2,}')
def plain(sel):
    s = re.sub(r'\bhtml body ', '', sel)
    s = re.sub(r'\b(html(?:\[[^\]]*\]|:not\(\[[^\]]*\]\))+) body ', r'\1 ', s)
    s = re.sub(r'(?:\.pill(?![-\w])){2,}', '.pill', s)
    s = re.sub(r'(?:\.zoomer(?![-\w])){2,}', '.zoomer', s)
    return s
def tokenize(text):
    items = []; i = 0; n = len(text)
    while i < n:
        if text.startswith('/*', i): j = text.index('*/', i) + 2; items.append(['c', text[i:j]]); i = j; continue
        if text[i] in ' \n\t':
            j = i
            while j < n and text[j] in ' \n\t': j += 1
            items.append(['w', text[i:j]]); i = j; continue
        j = text.find('{', i); sc = text.find(';', i)
        if j < 0 or (0 <= sc < j): j2 = (sc if sc >= 0 else n - 1) + 1; items.append(['s', text[i:j2]]); i = j2; continue
        d = 0; k = j
        while True:
            if text[k] == '{': d += 1
            elif text[k] == '}':
                d -= 1
                if d == 0: break
            k += 1
        items.append(['r', text[i:k+1]]); i = k + 1
    return items
def props_of(body): return set(p.split(':')[0].strip() for p in body.rstrip('}').split(';') if ':' in p and not p.strip().startswith('/*'))
def zclasses(sel):
    m = re.findall(r'\.zoomer((?:\.[\w-]+|:not\(\.[\w-]+\))*)', sel)
    return m
EXCL = [({'linelist'}, {'gridmode','largevar'}), ({'largevar'}, {'gridmode','linelist'}), ({'gridmode'}, {'linelist','largevar'})]
def feats(sel):
    f = set()
    for cls in zclasses(sel):
        for c in re.findall(r'(?<!not\()\.([\w-]+)', cls): f.add('z:' + c)
        for c in re.findall(r':not\(\.([\w-]+)\)', cls): f.add('z!' + c)
    if re.search(r'grid5|grid6', sel) and ':is(.grid' in sel: pass
    for g in re.findall(r'\.zoomer:is\(([^)]*)\)', sel): f.add('zg:' + g)
    if 'html:not([data-cu-ls])' in sel: f.add('!ls')
    elif 'html[data-cu-ls]' in sel: f.add('ls')
    return f
GRIDN = lambda f: {c[2:] for c in f if c.startswith('z:grid') and c[6:].isdigit()} | {x.strip()[1:] for c in f if c.startswith('zg:') for x in c[3:].split(',')}
def subject(sel):
    d = 0; cut = 0
    for k, ch in enumerate(sel):
        if ch == '(': d += 1
        elif ch == ')': d -= 1
        elif d == 0 and ch in ' >+~': cut = k + 1
    comp = sel[cut:]
    flat = re.sub(r':(has|not|where)\((?:[^()]|\([^()]*\))*\)', '', comp)
    return set(re.findall(r'\.([\w-]+)', flat)), bool(re.search(r'#[\w-]', flat))
def samesubject(a, b):
    (ca, ia), (cb, ib) = subject(a), subject(b)
    if ia or ib: return False if (ia != ib) else True
    pa = re.findall(r'\[class\*="?([\w-]+)"?\]', a); pb = re.findall(r'\[class\*="?([\w-]+)"?\]', b)
    if pa and cb and not any(c.startswith(x) for x in pa for c in cb): return False
    if pb and ca and not any(c.startswith(x) for x in pb for c in ca): return False
    if not ca or not cb: return True
    return bool(ca & cb)
def exclusive(a, b):
    if not samesubject(a, b): return True
    fa, fb = feats(a), feats(b)
    if ('ls' in fa and '!ls' in fb) or ('!ls' in fa and 'ls' in fb): return True
    za = {c[2:] for c in fa if c.startswith('z:')}; zb = {c[2:] for c in fb if c.startswith('z:')}
    na = {c[2:] for c in fa if c.startswith('z!')}; nb = {c[2:] for c in fb if c.startswith('z!')}
    if za & nb or zb & na: return True
    for x, ys in EXCL:
        if x <= za and ys & zb: return True
        if x <= zb and ys & za: return True
    ga, gb = GRIDN(fa), GRIDN(fb)
    if ga and gb and not (ga & gb): return True
    if ('linelist' in za or 'largevar' in za) and gb: return True
    if ('linelist' in zb or 'largevar' in zb) and ga: return True
    return False
# --- the range to move
items = tokenize(text)
rules = []
for idx, it in enumerate(items):
    if it[0] != 'r': continue
    sel, body = it[1].split('{', 1)
    mv = bool(HACK.search(sel)) and '!important' not in body and 'data-tilelines="sq"' not in sel and not (body.strip().startswith('line-height:1.2;') and ':is(.pnote, .pill-meta)' in sel)
    rules.append(dict(idx=idx, sel=sel, body=body, mv=mv, props=props_of(body), sels=split_top(sel.strip())))
moved = [r for r in rules if r['mv']]
# --- intra-layer: loser before winner, for pairs that share a property and can meet
N = len(moved); after = {i: set() for i in range(N)}; indeg = [0]*N; need = 0
for p, q in itertools.combinations(range(N), 2):
    A, B = moved[p], moved[q]
    if not (A['props'] & B['props']): continue
    for sa in A['sels']:
        for sb in B['sels']:
            if exclusive(sa, sb): continue
            if (spec(sa), p) > (spec(sb), q):   # A (earlier) wins: B must come before A
                if p not in after[q]: after[q].add(p); indeg[p] += 1; need += 1
            else:                                # B (later) wins: A must stay before B
                if q not in after[p]: after[p].add(q); indeg[q] += 1
order = []; h = [i for i in range(N) if indeg[i] == 0]; heapq.heapify(h)
while h:
    i = heapq.heappop(h); order.append(i)
    for j in sorted(after[i]):
        indeg[j] -= 1
        if indeg[j] == 0: heapq.heappush(h, j)
assert len(order) == N, 'cycle'
print(f'{len(rules)} rules in range, {N} move; {need} ordering constraints; displaced:', sum(1 for k, i in enumerate(order) if k != i))
# --- the rest of the app layer: a kept rule that beats a moved rule today would lose after the move
full = open(SRC).read(); a0 = full.index('@layer app {') + len('@layer app {'); a1 = full.index('}   /* end @layer app */')
def flat(text, cond=''):
    for it in tokenize(text):
        if it[0] != 'r': continue
        sel, body = it[1].split('{', 1)
        if sel.strip().startswith('@'):
            yield from flat(body[:-1], sel.strip()); continue
        yield (sel.strip(), body, cond)
allrules = list(flat(full[a0:a1]))
movedset = {(r['sel'].strip(), r['body']) for r in moved}
pos = {}; 
for k, (s, b, c) in enumerate(allrules): pos.setdefault((s, b), k)
threats = 0
for (s, b, c) in allrules:
    if (s, b) in movedset or '!important' in b: continue
    pr = props_of(b)
    for r in moved:
        com = pr & r['props']
        if not com: continue
        for ks in split_top(s):
            for ms in r['sels']:
                if exclusive(ks, ms): continue
                if (spec(ks), pos[(s, b)]) > (spec(ms), pos[(r['sel'].strip(), r['body'])]):
                    threats += 1
                    if threats <= 60: print('APP-WINS', sorted(com), c, '\n   kept ', ks[:150], spec(ks), '\n   moved', ms[:150], spec(ms))
print('kept app rules that beat a moved rule today:', threats)
print('order changes (rule moved after later ones):')
for k, i in enumerate(order):
    pass
inv = {i: k for k, i in enumerate(order)}
for i in range(N):
    for j in range(i+1, N):
        if inv[i] > inv[j]: print('  ', moved[i]['sel'].strip()[:110], '\n     now after', moved[j]['sel'].strip()[:110]); break
if APPLY:
    def plainw(sel):
        return ':where(' + ', '.join(plain(s) for s in split_top(sel.strip())) + ')'
    # a comment travels with the first rule after it that moves; it stays too when a rule after it stays
    trail = {}   # a comment on the same line as the rule before it belongs to that rule
    for idx, it in enumerate(items):
        if it[0] == 'c' and idx >= 2 and items[idx-1][0] == 'w' and '\n' not in items[idx-1][1] and items[idx-2][0] == 'r': trail[idx] = idx - 2
    trail_of = {r: c for c, r in trail.items()}
    items = [(['x', it[1]] if (i in trail) else it) for i, it in enumerate(items)]
    comment_for = {}; cur = []; keepc = set(); firstmv = {}
    for idx, it in enumerate(items):
        if it[0] == 'c': cur = [idx]
        elif it[0] == 'r':
            if cur:
                r = next(r for r in rules if r['idx'] == idx)
                if r['mv']: comment_for.setdefault(idx, []).extend(cur)
                else: keepc.update(cur)
                cur_done = cur; cur = []
                last_c = cur_done
            else:
                r = next(r for r in rules if r['idx'] == idx)
                if not r['mv'] and 'last_c' in dir(): keepc.update(last_c)
    mvc = {c for v in comment_for.values() for c in v}
    keep = []
    for idx, it in enumerate(items):
        if it[0] == 'r' and any(r['idx'] == idx and r['mv'] for r in rules): continue
        if it[0] == 'x':
            if not any(r['idx'] == trail[idx] and r['mv'] for r in rules): keep.append(it[1])
            continue
        if it[0] == 'c' and idx in mvc and idx not in keepc: continue
        keep.append(it[1])
    keep_txt = re.sub(r'\n\s*\n+', '\n', ''.join(keep)).strip('\n')
    tiles = []
    for i in order:
        r = moved[i]
        for c in comment_for.get(r['idx'], []): tiles.append(items[c][1])
        tiles.append(plainw(r['sel']) + ' {' + r['body'] + (('   ' + items[trail_of[r['idx']]][1]) if r['idx'] in trail_of else ''))
    lines2 = lines[:LO-1] + [keep_txt] + lines[HI:]
    out = '\n'.join(lines2)
    marker = '}   /* end @layer app */'
    head = ('/* v3.09: the count and unit, the badge places and the one-line row. Moved here from @layer app, where they repeated\n'
            '   classes (.pill.pill.pill, html body …) to out-weigh the rules before them; a later layer wins without that. Every\n'
            '   selector here is wrapped in :where(), so they all weigh the same and THE LATER RULE WINS — the rules are in the order\n'
            '   that keeps each winner of the old weights after the rules it beat. A new rule here goes after what it must beat;\n'
            '   never add a class or !important to win (an !important here would LOSE to one in @layer app). */\n')
    out = out.replace(marker, marker + '\n' + head + '@layer tiles {\n' + '\n'.join(tiles) + '\n}   /* end @layer tiles */', 1)
    assert out.count('@layer app, blocks;') == 1
    out = out.replace('@layer app, blocks;', '@layer app, tiles, blocks;', 1)
    open(SRC, 'w').write(out); print('applied')
