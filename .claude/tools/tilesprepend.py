#!/usr/bin/env python3
"""v3.21: move a range of @layer app rules to the START of the existing @layer tiles block (layermove.py creates the block,
it cannot add to it). Each selector is wrapped in :where() and stripped of its weighting ("html body ", repeated classes) —
inside :where() they weigh nothing, so the match set is what counts and it is unchanged. They go FIRST in tiles: today every
tiles rule already beats every app rule (a later layer wins), so a moved rule must stay beaten by them — first in the layer
keeps that. Run layermove.py FIRST LAST (dry run) before, for the app rules a moved rule would start beating, and prove
the move with cssdiff.js (zero differences) plus a canary.

  python3 .claude/tools/tilesprepend.py FIRST LAST     1-based lines of app.css, on rule boundaries
"""
import re, sys
SRC = 'app.css'
lo, hi = int(sys.argv[1]), int(sys.argv[2])
lines = open(SRC).read().split('\n')
chunk = '\n'.join(lines[lo-1:hi])
def simplify(sel):
    sel = sel.strip()
    sel = re.sub(r'(^|(?<=[\s,(]))html body ', '', sel)
    prev = None
    while prev != sel:
        prev = sel; sel = re.sub(r'\.([\w-]+)(?:\.\1)+(?![\w-])', r'.\1', sel)
    return sel
def split_top(s):
    out, d, cur = [], 0, ''
    for ch in s:
        if ch in '([': d += 1
        elif ch in ')]': d -= 1
        if ch == ',' and d == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur); return [x.strip() for x in out if x.strip()]
out = []; i = 0; n = len(chunk)
while i < n:
    if chunk.startswith('/*', i):
        j = chunk.index('*/', i) + 2; out.append(chunk[i:j]); i = j; continue
    if chunk[i] in ' \n\t':
        j = i
        while j < n and chunk[j] in ' \n\t': j += 1
        out.append('\n' if '\n' in chunk[i:j] else ' '); i = j; continue
    j = chunk.index('{', i); k = j; depth = 0
    while True:
        if chunk[k] == '{': depth += 1
        elif chunk[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    sel, body = chunk[i:j], chunk[j:k+1]
    assert '!important' not in body, 'an !important rule cannot move: ' + sel
    assert not sel.strip().startswith('@'), 'an at-rule in range: ' + sel
    out.append(':where(' + ', '.join(simplify(s) for s in split_top(sel)) + ') ' + body.strip()); i = k + 1
moved = ''.join(out).strip('\n')
t = lines.index('@layer tiles {')
new = lines[:lo-1] + lines[hi:]
t -= (hi - lo + 1) if t > hi else 0
new = new[:t+1] + moved.split('\n') + new[t+1:]
open(SRC, 'w').write('\n'.join(new))
print(f'moved lines {lo}-{hi} to the start of @layer tiles')
