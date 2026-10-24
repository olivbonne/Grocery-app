/* v2.46 (architecture review L17, phase 3): the text parser — one typed entry into count, weight and name, and a pasted
   list into entries with any "Label:" category. Moved byte for byte from js/app.js; pure functions, no imports.
   parseLines is parseInput with the label map passed in: js/app.js keeps parseInput(text), which hands it labelMap(). */
/* Parse one entry token into qty · weight · name. Handles a leading count ("6 ", "6x",
   "6 × "), a trailing count ("chicken x6"), and a leading weight ("500g", "2kg", "500 g").
   Combined forms work too: "6x500g chicken thigh" → qty 6, weight 500g, name "chicken thigh". */
export const WEIGHT_RE = /^(\d+(?:[.,]\d+)?)\s*(kg|g|mg|ml|cl|l|lb|lbs|oz)\b\.?/i;
export function normWeight(num, unit){ unit=unit.toLowerCase(); if(unit==="lbs") unit="lb"; return num.replace(",",".")+unit; }
export function parseEntry(raw){ let s=raw.trim(); let qty=1, weight="";
  let m=s.match(/^(\d+)\s*[x×]\s*(.+)$/i);                    // "6x …" / "6 × …"
  if(m){ qty=parseInt(m[1],10)||1; s=m[2].trim(); }
  else { m=s.match(/^(.+?)\s*[x×]\s*(\d+)$/i);                // "… x6"
    if(m){ qty=parseInt(m[2],10)||1; s=m[1].trim(); }
    else { m=s.match(/^(\d+)\s+(.+)$/);                       // "6 apples" — but not "500 g apples"
      if(m && !WEIGHT_RE.test(s)){ qty=parseInt(m[1],10)||1; s=m[2].trim(); } } }
  m=s.match(WEIGHT_RE);                                       // leading weight "500g …" / "2kg …"
  if(m){ weight=normWeight(m[1],m[2]); s=s.slice(m[0].length).trim(); }
  if(!s) return {qty:1, weight:"", name:raw.trim()};          // weight/qty only, no name → keep raw text
  return {qty, weight, name:s}; }
export function parseLines(text, map){
  const labels=Object.keys(map).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const re=new RegExp('\\s*\\b('+labels+')\\s*:','gi');
  const norm=text.replace(re,(m,l)=>'\n'+l+':');
  const out=[];
  for(const raw of norm.split(/\n/)){ const line=raw.trim(); if(!line) continue;
    let forced=null,rest=line; const c=line.indexOf(":");
    if(c!==-1){ const lab=line.slice(0,c).trim().toLowerCase(); if(map[lab]){ forced=map[lab]; rest=line.slice(c+1);} }
    for(const tok of rest.split(",").map(s=>s.trim()).filter(Boolean)){ const{qty,name,weight}=parseEntry(tok); if(name) out.push({name,qty,weight,cat:forced}); }
  } return out; }
/* v2.62: one Siri shortcut for every list — which list the words name. A list's name said first ("Hardware, nails") or
   last ("nails to Hardware", "clous pour Bricolage") picks that list and is taken out of the words. lists = [{code,name}].
   Returns { code, text } or null when no list is named (or nothing would be left to add). */
export function pickListFromText(text, lists){
  const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^\p{L}\p{N} ]+/gu," ").replace(/\s+/g," ").trim();
  const toks = String(text||"").split(/\s+/).filter(Boolean).map(w=>({ w, n:norm(w) }));
  if(!toks.length || !Array.isArray(lists)) return null;
  const cands = lists.filter(l=>l && l.code).map(l=>({ code:l.code, n:norm(l.name) })).filter(c=>c.n).sort((a,b)=>b.n.length-a.n.length);
  const PREP = ["to","on","in","onto","into","for","a","dans","sur","pour"], ART = ["the","la","le","ma","my"], LIST = ["list","liste"];
  const clean = arr => arr.map(t=>t.w).join(" ").replace(/^[\s,:;.\-–—]+|[\s,:;.\-–—]+$/g,"");
  for(const c of cands){ const N = c.n.split(" ");
    // first: the name, then the rest (an optional "add"/"ajoute" after it)
    let i=0, j=0;
    while(i<toks.length && j<N.length){ if(!toks[i].n){ i++; continue; } if(toks[i].n!==N[j]) break; i++; j++; }
    if(j===N.length){ let rest = toks.slice(i); const f = rest.findIndex(t=>t.n);
      if(f>=0 && ["add","ajoute","ajouter"].includes(rest[f].n)) rest = rest.slice(f+1);
      const out = clean(rest); if(norm(out)) return { code:c.code, text:out }; }
    // last: the rest, an optional "to (the) (list)", then the name
    let e=toks.length-1; j=N.length-1;
    while(e>=0 && !toks[e].n) e--;
    if(e>=0 && LIST.includes(toks[e].n) && !LIST.includes(N[N.length-1])) e--;   // "… to the Hardware list"
    while(e>=0 && j>=0){ if(!toks[e].n){ e--; continue; } if(toks[e].n!==N[j]) break; e--; j--; }
    if(j<0){ let cut=e+1, p=e;
      while(p>=0 && !toks[p].n) p--;
      if(p>=0 && LIST.includes(toks[p].n)) p--;
      if(p>=0 && ART.includes(toks[p].n)) p--;
      if(p>=0 && PREP.includes(toks[p].n)) cut=p;
      const out = clean(toks.slice(0,cut)); if(norm(out)) return { code:c.code, text:out }; }
  }
  return null; }
