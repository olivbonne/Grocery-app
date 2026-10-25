/* Market List — the app. v2.19: moved out of index.html byte for byte (the reference data and the drawings moved to
   ./data/). Loaded by index.html as /js/app.js?v=<version>. Every ?v= in index.html, in this file's imports and in
   sw.js's PRECACHE is the version number and changes with it (node .claude/tools/bump.js N.NN), so a phone never
   pairs a new page with an old file. */
/* v2.15: the Firebase SDK lives in the repo (vendor/firebasejs/, see its README), so the service worker can keep
   it on the phone with the page and the app opens without signal. It used to come from www.gstatic.com. */
import { initializeApp } from "/vendor/firebasejs/10.12.2/firebase-app.js";
import * as FS from "/vendor/firebasejs/10.12.2/firebase-firestore.js";   /* v2.55: a namespace import, passed to js/store.js */
import { storeInit, storeReady, ref, listen, put, has, col, listenAll, putMany, canSplit } from "./store.js?v=2.76";   /* v2.55 (architecture review S8/S10): the database, one door */
import { DEFAULT_CATS, MEAT_SUBS, DICT, WALL_TINTS, TINT_BAND, AISLES_DAND, AISLES_RICH, STORES, DEFAULT_CAT_IMG, MEAT_DEFAULT_SUBS, EMOJI_LIB, CATS13, TYPE_CAT13, OLD_CAT13, NOTE_HINTS } from "./data/catalog.js?v=2.76";
import { DRAWN, CATMARK, DRAW_EXACT, DRAW_HINTS } from "./data/drawings.js?v=2.76";
import { CHAINS, membNorm, periodOf, chainOfStore, discountSeen, stockUp, stockTotal } from "./tenpct.js?v=2.76";
import { compareStores, worthIt } from "./compare.js?v=2.76";
import { shareChain, sharedKey, sharedMedian, sharedRecords } from "./shared.js?v=2.76";   /* v2.47: shared shelf prices (opt-in) */
import { SPEND_MAX, monthKey, prevMonth, spendEntry, spendLog, spendFromPrices, spendMonths, spendMonth } from "./spend.js?v=2.76";
import { parseAisleLine, mapAisles, mapRank, aisleTypeOf } from "./aisles.js?v=2.76";
import { code128SVG, reconcile, nameScore, cardBrand } from "./till.js?v=2.76";
import { pickFile, hasGeolocation, getPosition, wakeLockSupported, requestWakeLock, hasShare, canShare, share, hasClipboard, copyText, vibrate, barcodeSupported, detectBarcodes, speechRecognitionCtor, isAppleMobile, isNativeApp, takeOutsideText, onOutsideText } from "./platform.js?v=2.76";   /* v2.43 (architecture review A3): the phone's features, one door */
import { UNIT_TABLE, parseNum, roundAmt, NEUTRAL_UNITS, scaleAmt, mergeAmt } from "./amounts.js?v=2.76";   /* v2.43 (architecture review L17) */
import { parseEntry, parseLines, pickListFromText } from "./parse.js?v=2.76";   /* v2.46 (architecture review L17, phase 3): the text parser */
import { itemSig, stampItems, pruneTomb, mergeItems, itemsSig } from "./merge.js?v=2.76";   /* v2.51 (architecture review S8): items merged one by one */
import { tr, trf, LANGS, langOf } from "./i18n.js?v=2.76";   /* v2.45 (architecture review S17): the app in French as well as English */

/* Firebase config is set at the very top of index.html (window.FIREBASE_CONFIG) — v2.19: not this file, since the app moved here. */
const firebaseConfig = window.FIREBASE_CONFIG || { apiKey:"REPLACE_ME" };
const APP_VERSION = "v2.76";
window.__mlVersion = APP_VERSION;   // v2.15: for the crash reporter at the top of the file, which runs before this module
window.__mlPageName = ()=>{ try{ return ["plan","shop","settings"][curPageIdx()]||""; }catch(e){ return ""; } };
const APP_BUILD_DATE = (()=>{ try{ const d=new Date(document.lastModified); if(isNaN(d.getTime())) return "";
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}catch(e){ return ""; } })();

/* v1.94: recipes are written in whatever the writer's kitchen uses. This converts what is SHOWN,
   never what is stored — so turning the setting off puts every amount back exactly as the recipe
   gave it, and nothing is lost in a round trip. Anything it cannot parse ("a pinch", "2 cloves")
   passes straight through: a guess would be worse than leaving it alone. */
/* v2.43 (architecture review L17): UNIT_TABLE, parseNum, roundAmt, NEUTRAL_UNITS, scaleAmt and mergeAmt live in js/amounts.js */
function unitsMode(){ try{ const v=localStorage.getItem("ml_units"); return (v==="metric"||v==="imperial") ? v : "off"; }catch(e){ return "off"; } }
/* v2.01: meal slots on a day — default ON. ml_mealslots is in APP_EXCLUDE_BOOT and APP_EXCLUDE. */
function mealSlotsOn(){ try{ return localStorage.getItem("ml_mealslots")!=="0"; }catch(e){ return true; } }
/* v2.05: "Your recipes" folded or open, and sorted A–Z or by course — per device. Both keys are in
   APP_EXCLUDE_BOOT and APP_EXCLUDE (preferences, not a look). */
function recOpen(){ try{ return localStorage.getItem("ml_recopen")!=="0"; }catch(e){ return true; } }
function setRecOpen(on){ try{ localStorage.setItem("ml_recopen", on?"1":"0"); }catch(e){} }
function recSort(){ try{ return localStorage.getItem("ml_recsort")==="course" ? "course" : "az"; }catch(e){ return "az"; } }
function setRecSort(v){ try{ localStorage.setItem("ml_recsort", v==="course"?"course":"az"); }catch(e){} }
function setMealSlots(on){ try{ localStorage.setItem("ml_mealslots", on?"1":"0"); }catch(e){} render(); }
function setUnitsMode(m){ try{ localStorage.setItem("ml_units", m); }catch(e){} render(); }
function showAmt(w){
  const s=String(w||"").trim(); if(!s) return s;
  const mode=unitsMode(); if(mode==="off") return s;
  const m=s.match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*([a-zA-Z]{1,12})\.?$/);
  if(!m) return s;
  const n=parseNum(m[1]); const u=UNIT_TABLE[m[2].toLowerCase()];
  if(n===null || !u) return s;
  if(NEUTRAL_UNITS.test(m[2])) return s;             // v1.97: spoons are left exactly as written
  const isMetric=!!u.metric;
  if(mode==="metric" && isMetric) return s;         // already the way they want it
  if(mode==="imperial" && !isMetric) return s;
  if(u.g!==undefined){
    const g=n*u.g;
    if(mode==="metric") return g>=1000 ? roundAmt(g/1000)+" kg" : roundAmt(g)+" g";
    const oz=g/28.3495; return oz>=16 ? roundAmt(oz/16)+" lb" : roundAmt(oz)+" oz";
  }
  const ml=n*u.ml;
  if(mode==="metric") return ml>=1000 ? roundAmt(ml/1000)+" l" : roundAmt(ml)+" ml";
  if(ml>=473.176){ const p=roundAmt(ml/473.176); return p+(p==="1"?" pint":" pints"); }
  return roundAmt(ml/29.5735)+" fl oz";
}

/* v1.63 item 3: a slot can be marked as the look the app STARTS in. It is applied here, at the very
   top of the module, because every appearance global below is read once from localStorage on the way
   down — writing the keys first means the boot path builds the saved look with no reload and no
   flash. `ml_appstart` unset (the default) leaves everything exactly as it was.
   The regex is duplicated deliberately: APP_EXCLUDE is declared far below with the rest of the slot
   machinery and would be in its temporal dead zone up here. Keep the two in step. */
/* v2.00: ml_optcoll joins the list. Which Settings sections you have folded is not a LOOK — and
   since v2.00 gives five of them a folded default, a slot that wiped the key would silently re-fold
   them under someone who had opened them, with no way to tell why. Found by a suite that applies a
   slot and then reaches for a colour control. */
/* v2.71: was this phone fresh when the app opened — no look of its own yet? Read here, before boot writes ml_theme (it always
   does, ≈ line 680) or the slot migration writes ml_appmig163. Both absent = never opened here before (or after "Forget this
   phone" / a reinstall), so the account's settings may be applied silently. var: read by acctSync at any time. */
/* A first launch reloads once on its own (the v1.63 slot migration) before sign-in, so the answer is kept for the session. */
var _prefsFresh = (()=>{ try{ if(sessionStorage.getItem("ml_prefsfresh") === "1") return true;
  const f = !localStorage.getItem("ml_theme") && !localStorage.getItem("ml_appmig163"); if(f) sessionStorage.setItem("ml_prefsfresh", "1"); return f; }catch(e){ return false; } })();
const APP_EXCLUDE_BOOT = /^(ml_cache_|ml_collapse_|ml_hist_|ml_ai|ml_predict|ml_purch|ml_store|ml_atstore|ml_merge_|ml_lists$|ml_lastlist$|ml_lastview[23]?$|ml_me$|ml_shop$|ml_kbh$|ml_app|ml_numdef$|ml_units$|ml_optcoll$|ml_mealslots$|ml_recopen$|ml_recsort$|ml_ingsort$|ml_rcptday$|ml_rptday$|ml_crashday$|ml_installhint$|ml_snap_|ml_wakelock$|ml_rcptnudge$|ml_rcptask$|ml_tenhide$|ml_cmphide$|ml_sayshop$|ml_lookseen$|ml_aisleday$|ml_cards$|ml_lastcart$|ml_cardnudge$|ml_cardask$|ml_stucklog$|ml_cardview$|ml_signinemail$|ml_lang$|ml_sharepx$|ml_onb$|ml_gonelists$|ml_micdenied$|ml_nosmall$|ml_lastoutside$|ml_siriSmart$|ml_prefsseen$|ml_nocard$|ml_jk_)/;
(function applyStartSlot(){
  try{
    /* v1.63 item 3: "when the user starts", not "on every load". Applying a look reloads the page to
       rebuild the globals from storage (see applyStoredAppearance), so without this guard tapping
       Use — or the one-time migration — was undone by the start slot on the way back in, and the
       slot buttons appeared to do nothing at all. sessionStorage is per launch: a reload inside the
       session skips this, a fresh launch of the app does not. */
    if(sessionStorage.getItem("ml_started")==="1") return;
    sessionStorage.setItem("ml_started","1");
    const si=localStorage.getItem("ml_appstart"); if(si===null) return;
    const a=JSON.parse(localStorage.getItem("ml_appslots")||"null");
    const o=Array.isArray(a) ? a[+si] : null; if(!o || typeof o!=="object") return;
    const kill=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
      if(k && k.indexOf("ml_")===0 && !APP_EXCLUDE_BOOT.test(k)) kill.push(k); }
    kill.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
    Object.keys(o).forEach(k=>{ if(k!=="__preset" && !APP_EXCLUDE_BOOT.test(k)){ try{ localStorage.setItem(k, o[k]); }catch(e){} } });
    localStorage.setItem("ml_appsel", String(+si));
  }catch(e){}
})();

const MEAT_ORDER = ["beef","lamb","chicken","seafood","other"];
function meatSub(name){ const n=name.toLowerCase(); for(const s of MEAT_SUBS){ if(s.words.some(w=>n.includes(w))) return s.id; } return "other"; }

/* A16 remember the full entry (category AND subcategory), not just the category,
   so re-typing a cleared item puts it back exactly where it lived before */
/* v2.33: the category a new item gets on a list that uses the thirteen. What the app knows (the dictionary, the AI readers,
   receipts, restock history) speaks the nine; this puts it in the thirteen — by the item's aisle type first, so bread lands
   in Bakery and ham in Deli rather than all in "Fresh". On a list with the nine, or for a category the list has, it changes
   nothing. Only ever used as an item is ADDED — a stored category is never rewritten (the v2.17 rule). */
function newCat(cat, name){ const cs=catList(); if(!cs.some(c=>c.id==="pantry")) return cat;
  const have=new Set(cs.map(c=>c.id)), t=aisleTypeOf(name||""), m=TYPE_CAT13[t];
  /* where the shop shelves it beats what it is: ham is at the deli, frozen chicken in Frozen — so an aisle type that
     names one of the thirteen's own (not shared with the nine) wins over a shared category like Meat */
  if(m && have.has(m) && !DEFAULT_CATS.some(c=>c.id===m)) return m;
  if(cat && cat!=="others" && cat!=="fruit" && cat!=="vegetable" && have.has(cat)) return cat;
  if(t==="produce") return (cat==="fruit" || cat==="vegetable") ? cat : "vegetable";
  if(cat==="fruit" || cat==="vegetable") return cat;
  if(m && have.has(m)) return m;
  const o=OLD_CAT13[cat]; if(o && have.has(o)) return o;
  return (cat && have.has(cat)) ? cat : (have.has("others") ? "others" : cat); }
function knownEntry(name){ const n=(name||"").toLowerCase().trim(); if(!n) return null;
  return state.items.find(i=>i.name.toLowerCase()===n) || state.buyAgain.find(e=>e.name.toLowerCase()===n) || null; }
function guessCat(name){ const n=(name||"").toLowerCase(); let best=null, bestLen=0;
  for(const[c,w] of Object.entries(DICT)) for(const x of w){ if(x.length>bestLen && n.includes(x)){ best=c; bestLen=x.length; } }
  return best; }

/* v2.46 (architecture review L17, phase 3): WEIGHT_RE, normWeight, parseEntry and parseLines live in js/parse.js */

const uid = () => Math.random().toString(36).slice(2,9)+Date.now().toString(36);
/* v2.25 R25: a list's code is its only key — anyone with it can open the list — so a new one is 128 random bits from the
   cryptographic generator (25 characters of base 36), not 8 characters of Math.random(). Older codes keep working. */
function newListCode(){
  try{ const b = new Uint8Array(16); crypto.getRandomValues(b); let n = 0n; for(const x of b) n = (n << 8n) | BigInt(x); return n.toString(36).padStart(25, "0"); }
  catch(e){ return (uid() + uid()).replace(/[^a-z0-9]/g, "").slice(0, 25); } }

/* ---- list code: from URL, else remembered on this device, else new ---- */
const params = new URLSearchParams(location.search);
const LS_LASTLIST = "ml_lastlist";
/* v2.56 item 2: an iPhone home-screen app always starts at the address it was installed from, which carries
   ?list=<the list it was installed on> — so it always opened that list. The address only wins now when it is a
   share link (it carries a join key), or when this phone does not know the list yet; otherwise the list used last
   opens. A list removed on this phone (ml_gonelists, item 6) is never brought back by the start address. */
const _bootUrlList = params.get("list"), _bootLast = localStorage.getItem(LS_LASTLIST);
const _bootKnown = (()=>{ try{ const a=JSON.parse(localStorage.getItem("ml_lists")||"[]"); return Array.isArray(a) ? a.map(x=>x && x.code).filter(Boolean) : []; }catch(e){ return []; } })();
const _bootGone = (()=>{ try{ const o=JSON.parse(localStorage.getItem("ml_gonelists")||"{}"); return (o && typeof o==="object") ? o : {}; }catch(e){ return {}; } })();
/* v2.62: one Siri shortcut for every list (?add= with no list). _bootOutside: the list named in the words, and the words with
   that name taken off ({from, text, code}); _outsideNoList: this browser knows no list, so a shortcut's words are not put on
   a brand-new empty one. var: boot-order rule. */
var _bootOutside = null, _outsideNoList = false;
let listCode = (()=>{
  if(params.has("add") && !_bootUrlList){
    let known = []; try{ const a=JSON.parse(localStorage.getItem("ml_lists")||"[]"); if(Array.isArray(a)) known = a.filter(x=>x && x.code && !_bootGone[x.code]); }catch(e){}
    if(known.length > 1){ const p = pickListFromText(params.get("add")||"", known);
      if(p){ _bootOutside = { from:(params.get("add")||"").trim(), text:p.text, code:p.code }; return p.code; } }
    if(known.length === 0) _outsideNoList = true;
  }
  if(_bootUrlList && (params.has("k") || params.has("add"))){   // a share link (or v2.62 a per-list Siri link): always honoured, and it un-gones the list
    if(_bootGone[_bootUrlList]){ try{ delete _bootGone[_bootUrlList]; localStorage.setItem("ml_gonelists", JSON.stringify(_bootGone)); }catch(e){} }
    return _bootUrlList; }
  const lastOK = _bootLast && _bootKnown.includes(_bootLast) && !_bootGone[_bootLast];
  if(_bootUrlList && _bootGone[_bootUrlList])
    return lastOK ? _bootLast : (_bootKnown.find(c=>!_bootGone[c]) || newListCode());
  if(_bootUrlList && _bootKnown.includes(_bootUrlList) && lastOK && _bootLast!==_bootUrlList) return _bootLast;
  return _bootUrlList || _bootLast || newListCode();
})();
/* v2.33: the list being made on this phone right now, the one place the thirteen categories start (an existing list keeps
   its own — the household's choice). The very first list, made at first launch, is one. var: boot-order rule.
   v2.56: still "no list given and none remembered" (a brand-new phone). */
var _freshList = (!_bootUrlList && !_bootLast) ? listCode : "";
localStorage.setItem(LS_LASTLIST, listCode);
/* v2.44 (members by account): a share link may carry the list's join key (k) — keep it on this phone, never in the address bar */
if(params.get("k")){ try{ localStorage.setItem("ml_jk_"+listCode, params.get("k").slice(0,64)); }catch(e){} }
if(params.get("list") !== listCode || params.has("k")){ params.set("list", listCode); params.delete("k");
  history.replaceState(null,"",location.pathname+"?"+params.toString()); }

let LS = { me:"ml_me", collapse:"ml_collapse_"+listCode, cache:"ml_cache_"+listCode };
// Per-list learning stores (AI shop order + restock cadence) live under a list-suffixed key.
// One-time migration: the first list to load after this upgrade inherits any legacy global
// data, then the global key is dropped so other lists start their own learning.
function lkey(base){ return base + "_" + listCode; }
function loadLearn(base){ const k=lkey(base); let v=localStorage.getItem(k);
  if(v==null){ const g=localStorage.getItem(base); if(g!=null){ localStorage.setItem(k,g); localStorage.removeItem(base); v=g; } }
  try{ return JSON.parse(v||"null") || {}; }catch(e){ return {}; } }
let me = localStorage.getItem(LS.me) || null;
let collapse = JSON.parse(localStorage.getItem(LS.collapse) || '{"cats":[],"ba":false}');
collapse.checked = false;   // v2.10: the cart always opens folded; a tap unfolds it for the session
let densities = {}; try{ densities = JSON.parse(localStorage.getItem("ml_densities")||"null") || {}; }catch(e){ densities={}; }
const _legacyDensity = parseFloat(localStorage.getItem("ml_density")||"1") || 1;
function dens(){ const v=densities[optMode()]; return (typeof v==="number" && v) ? v : _legacyDensity; }
function setDensity(d){ const nd=Math.min(1.3,Math.max(0.7,Math.round(d*10)/10)); densities[optMode()]=nd; localStorage.setItem("ml_densities", JSON.stringify(densities)); render(); }
let styles = {}; try{ styles = JSON.parse(localStorage.getItem("ml_styles")||"null") || {}; }catch(e){ styles={}; }
function styl(){ return styles[optMode()] || (shopMode ? "normal" : "compact"); }
function setStyle(s){ styles[optMode()]=s; localStorage.setItem("ml_styles", JSON.stringify(styles)); render(); }
/* v1.42 items 5 & 8 — the palettes. "auto" means "whatever the theme says", which is how every
   existing install behaves, so it stays the default and nothing changes until the user picks. */
/* v1.51: --on-accent used to be hard-forced to white, which was safe only while every accent in the
   palette was a dark hue. White and yellow are not, so the readable colour is now chosen from the
   accent's own luminance (Rec. 601 weights — the eye is far more sensitive to green than to blue). */
function onAccent(hex){ const h=String(hex||"").replace("#","");
  if(h.length!==6) return "#fff";
  const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b) > 150 ? "#000000" : "#FFFFFF"; }
/* the two HSL conversions. Nothing else in the file works in HSL. */
function rgbToHsl(r,g,b){ r/=255; g/=255; b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn;
  let h=0, s=0;
  if(d){ s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
    h = mx===r ? ((g-b)/d + (g<b?6:0)) : mx===g ? ((b-r)/d + 2) : ((r-g)/d + 4);
    h/=6; }
  return [h,s,l]; }
function hslToHex(h,s,l){
  const p2=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,"0");
  if(!s){ const v=l*255; return "#"+p2(v)+p2(v)+p2(v); }
  const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f=t=>{ t=(t+1)%1;
    return t<1/6 ? p+(q-p)*6*t : t<1/2 ? q : t<2/3 ? p+(q-p)*(2/3-t)*6 : p; };
  return "#"+p2(f(h+1/3)*255)+p2(f(h)*255)+p2(f(h-1/3)*255); }
/* v1.72: one step of white (dir +1) or black (dir −1) mixed into a colour. Done in HSL so the hue is
   untouched and only the lightness moves — that is what "a tint" and "a shade" of a colour mean, and
   it is the axis the native overlay makes hardest to walk. 8% a step: fine enough to land on a
   particular shade, coarse enough that a few taps cross the range. */
function shadeHex(hex, dir){
  const h=String(hex||"").replace("#","");
  if(h.length!==6) return null;
  const [hh,s,l]=rgbToHsl(parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16));
  const nl=Math.max(0, Math.min(1, l + dir*0.08));
  return hslToHex(hh, s, nl);
}
/* v1.58 item 2: a neutral and a warm neutral — the two the palette was missing. Both dark
   enough for white text, so onAccent() still resolves sensibly. */
const ACCENTS = { white:"#FFFFFF", black:"#000000", red:"#C62828", orange:"#E2502C", yellow:"#D9A404",
                  green:"#2F9E44", blue:"#1E6FD9", purple:"#7B4FBF", pink:"#D6478A",
                  grey:"#7B838C", sand:"#C2A878" };
const TEXTCOLS = { white:"#FFFFFF", black:"#000000", red:"#C62828", orange:"#E2502C", yellow:"#D9A404",
                   green:"#2F9E44", blue:"#1E6FD9", purple:"#7B4FBF", pink:"#D6478A",
                   grey:"#7B838C", sand:"#C2A878" };
const setLS=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
/* v1.57 item 2: "Text colour applies to" is retired — Selected/Unselected tile text and Category text
   are their own pickers now. Carry the old scoped choice into whichever picker inherited it, then
   hand the global Text colour back to Auto so it does not repaint everything at once. Runs before the
   `let`s below so this session reads the migrated values rather than waiting for a reload. */
(function(){ const sc=localStorage.getItem("ml_textscope"); if(!sc || sc==="all") return;
  const tc=localStorage.getItem("ml_textcol");
  if(tc && tc!=="auto" && TEXTCOLS[tc]){
    if(sc==="tile"){ if(!localStorage.getItem("ml_tiletext")) setLS("ml_tiletext", tc);
                     if(!localStorage.getItem("ml_utiletext")) setLS("ml_utiletext", tc); }
    else if(sc==="cat"){ if(!localStorage.getItem("ml_cattext")) setLS("ml_cattext", tc); }
    setLS("ml_textcol","auto");
  }
  try{ localStorage.removeItem("ml_textscope"); }catch(e){} })();
/* v1.57 item 2: the global "Calm colours" switch is gone; drop any stored value once. */
try{ localStorage.removeItem("ml_calmcol"); }catch(e){}
let accent   = localStorage.getItem("ml_accent")  || "auto";
let textCol  = localStorage.getItem("ml_textcol") || "auto";
/* v1.68: `quiet` applies the value and repaints the tokens but skips the re-render. It exists for the
   custom colour pickers: a re-render rebuilds app.innerHTML, which destroys the <input type="color">
   the platform's colour overlay is anchored to — so on a phone the overlay was dismissed the instant
   you moved the colour. Live drag is quiet; the full render happens once, when the picker closes. */
function setAccent(v, quiet){ accent=v; localStorage.setItem("ml_accent",v); applyTheme(); if(!quiet) render(); }
function setTextCol(v, quiet){ textCol=v; localStorage.setItem("ml_textcol",v); applyTheme(); if(!quiet) render(); }
/* v1.75 item 1: Calm is gone, and with it the one thing a row could do on Auto. Calm was a pastel
   FILTER — a colour it could only soften, never take toward black — and on Auto it was the only
   control a row had at all. A signed lightness level does both jobs and does them on every row: the
   value is a step count, not a colour, so it can sit on a row whose colour the theme or the category
   decides and still mean something. A saved Calm becomes +2 (two steps lighter) — the nearest thing
   the new vocabulary has to a pastel, and the closest an old look can be carried forward. */
const SHADE_KEYS = { accent:"ml_accentshade", text:"ml_textcolshade", cat:"ml_cattextshade",
                     tiletext:"ml_tiletextshade", tilebg:"ml_tilebgshade", tilebrd:"ml_tilebrdshade",
                     utiletext:"ml_utiletextshade", utilebg:"ml_utilebgshade", utilebrd:"ml_utilebrdshade",
                     /* v1.76 items 1 & 2: the seven new rows join the same machinery — a row without a
                        step level would be the only one in Settings that could do nothing on Auto. */
                     topbar:"ml_topbarshade", navbar:"ml_navbarshade",
                     cathdbg:"ml_cathdbgshade", cathdbrd:"ml_cathdbrdshade",
                     reghdtext:"ml_reghdtextshade", reghdbg:"ml_reghdbgshade", reghdbrd:"ml_reghdbrdshade",
                     /* v1.78: the search bar is the third overlay tile, so it joins on the same terms. */
                     srchbar:"ml_srchbarshade",
                     /* v2.13: the tiles ON the bars — the top banner's name, count and store, and the bottom
                        bar's selected tab — get their own colour, on the same terms. */
                     toptile:"ml_toptileshade", navsel:"ml_navselshade",
                     /* v2.63 item D: the Edit item pills, on the same terms as the unselected tiles */
                     epilltext:"ml_epilltextshade", epillbg:"ml_epillbgshade", epillbrd:"ml_epillbrdshade" };
/* v2.69: every sliding sheet gets its own look — the sheet's background and text, and its pills' three colours and
   shape. One table builds them all. The Edit item sheet's pill trio and shape stay the v2.63 keys (aliases), so a
   setting someone already made keeps applying; everything else is ml_lk_<sheet>_<prop> (+ "shade"). */
const SHEET_LOOKS = ["edit","smart","add","card","other"];
const SHEET_PROPS = ["bg","text","ptext","pbg","pbrd"];
const LK_ALIAS = { ptext:"epilltext", pbg:"epillbg", pbrd:"epillbrd" };
const LK_NUMALIAS = { rad:"erad", gapx:"egap", gapy:"egapy" };
function lkId(sh,p){ return (sh==="edit" && LK_ALIAS[p]) || ("lk_"+sh+"_"+p); }     // the SHADE_KEYS name of the row
function lkAttr(sh,p){ return (sh==="edit" && LK_ALIAS[p]) ? "opt-"+LK_ALIAS[p] : "opt-lk-"+sh+"-"+p; }
function lkNumKey(sh,g){ return sh==="edit" ? LK_NUMALIAS[g] : "lk_"+sh+"_"+g; }
SHEET_LOOKS.forEach(sh=>SHEET_PROPS.forEach(p=>{ const id=lkId(sh,p); if(!SHADE_KEYS[id]) SHADE_KEYS[id]="ml_"+id+"shade"; }));
const SHADE_MAX = 5;
(function(){ const OLD = { accent:"ml_accentcalm", text:"ml_textcolcalm", cat:"ml_cattextcalm",
    tiletext:"ml_tiletextcalm", tilebg:"ml_tilebgcalm", tilebrd:"ml_tilebrdcalm",
    utiletext:"ml_utiletextcalm", utilebg:"ml_utilebgcalm", utilebrd:"ml_utilebrdcalm" };
  const sel=localStorage.getItem("ml_selcalm"), un=localStorage.getItem("ml_unselcalm");
  const wasCalm=k=> localStorage.getItem(OLD[k])==="1"
    || (sel==="1" && ["tiletext","tilebg","tilebrd"].includes(k) && localStorage.getItem(OLD[k])===null)
    || (un==="1"  && ["utiletext","utilebg","utilebrd"].includes(k) && localStorage.getItem(OLD[k])===null);
  Object.keys(SHADE_KEYS).forEach(k=>{ if(localStorage.getItem(SHADE_KEYS[k])===null && wasCalm(k)) setLS(SHADE_KEYS[k],"2"); });
  try{ Object.keys(OLD).forEach(k=>localStorage.removeItem(OLD[k]));
       localStorage.removeItem("ml_selcalm"); localStorage.removeItem("ml_unselcalm"); }catch(e){}
})();
let shadeOn={}; Object.keys(SHADE_KEYS).forEach(k=>{
  shadeOn[k]=Math.max(-SHADE_MAX, Math.min(SHADE_MAX, parseInt(localStorage.getItem(SHADE_KEYS[k])||"0",10)||0)); });
function setShade(k,d){ if(!SHADE_KEYS[k]) return;
  shadeOn[k]=Math.max(-SHADE_MAX, Math.min(SHADE_MAX, (shadeOn[k]||0)+d));
  setLS(SHADE_KEYS[k], String(shadeOn[k])); applyTheme(); render(); }
/* one HSL move rather than N clamped calls to shadeHex, so stepping down and back up returns exactly
   where it started. Non-hex input comes back unchanged — several callers pass a var() fallback. */
function shadeBy(hex, n){
  if(!n) return hex;
  const h=String(hex||"").replace("#","");
  if(h.length!==6) return hex;
  const [hh,s,l]=rgbToHsl(parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16));
  return hslToHex(hh, s, Math.max(0, Math.min(1, l + n*0.08)));
}
function autoShade(k, hex){ return shadeBy(hex, shadeOn[k]||0); }
function accentHex(){ return pickHex(accent); }
function textColHex(){ return pickHex(textCol, TEXTCOLS); }
/* v1.57 item 2: tiles have two states and each gets its own three colours. Selected = on the list;
   unselected = a regular that is not. Each of the six carries its own Darker/Lighter step (v1.75);
   the shared per-state switch this comment used to describe is gone. */
let tileBg   = localStorage.getItem("ml_tilebg")   || "auto";
let tileBrd  = localStorage.getItem("ml_tilebrd")  || "auto";
let tileTxt  = localStorage.getItem("ml_tiletext") || "auto";
let uTileBg  = localStorage.getItem("ml_utilebg")   || "auto";
let uTileBrd = localStorage.getItem("ml_utilebrd")  || "auto";
let uTileTxt = localStorage.getItem("ml_utiletext") || "auto";
let ePillTxt = localStorage.getItem("ml_epilltext") || "auto";   // v2.63 item D: the Edit item pills
let ePillBg  = localStorage.getItem("ml_epillbg")   || "auto";
let ePillBrd = localStorage.getItem("ml_epillbrd")  || "auto";
let catTxt   = localStorage.getItem("ml_cattext")   || "auto";
function setTileBg(v, quiet){ tileBg=v; setLS("ml_tilebg",v); applyTheme(); if(!quiet) render(); }
function setTileBrd(v, quiet){ tileBrd=v; setLS("ml_tilebrd",v); applyTheme(); if(!quiet) render(); }
function setTileTxt(v, quiet){ tileTxt=v; setLS("ml_tiletext",v); applyTheme(); if(!quiet) render(); }
function setUTileBg(v, quiet){ uTileBg=v; setLS("ml_utilebg",v); applyTheme(); if(!quiet) render(); }
function setUTileBrd(v, quiet){ uTileBrd=v; setLS("ml_utilebrd",v); applyTheme(); if(!quiet) render(); }
function setUTileTxt(v, quiet){ uTileTxt=v; setLS("ml_utiletext",v); applyTheme(); if(!quiet) render(); }
function setEPillTxt(v, quiet){ ePillTxt=v; setLS("ml_epilltext",v); applyTheme(); if(!quiet) render(); }
function setEPillBg(v, quiet){ ePillBg=v; setLS("ml_epillbg",v); applyTheme(); if(!quiet) render(); }
function setEPillBrd(v, quiet){ ePillBrd=v; setLS("ml_epillbrd",v); applyTheme(); if(!quiet) render(); }
/* v2.69: the sheet looks' values. The edit sheet's pill trio reads and writes the v2.63 variables above. */
/* v2.74: a sheet's layout — rows (first level), chcols (its choices, second level), names ("0" = off). "" = today's look.
   A LOOK, so not in APP_EXCLUDE. var: applyTheme() reads it at boot. */
var LK_LAYOUT = ["rows","chcols","names"];
function lkLay(sh,k){ return localStorage.getItem("ml_lk_"+sh+"_"+k)||""; }
function setLkLay(sh,k,v){ if(v) localStorage.setItem("ml_lk_"+sh+"_"+k, v); else localStorage.removeItem("ml_lk_"+sh+"_"+k); applyTheme(); render(); }
var lookSheet = "edit";   // which sheet the look page is showing — memory only, not stored
const lkVals = {};
SHEET_LOOKS.forEach(sh=>SHEET_PROPS.forEach(p=>{ if(!(sh==="edit" && LK_ALIAS[p])) lkVals[lkId(sh,p)] = localStorage.getItem("ml_"+lkId(sh,p)) || "auto"; }));
function lkGet(sh,p){
  if(sh==="edit" && LK_ALIAS[p]) return p==="ptext" ? ePillTxt : p==="pbg" ? ePillBg : ePillBrd;
  return lkVals[lkId(sh,p)] || "auto"; }
function setLk(sh,p,v,quiet){
  if(sh==="edit" && LK_ALIAS[p]) return (p==="ptext" ? setEPillTxt : p==="pbg" ? setEPillBg : setEPillBrd)(v, quiet);
  lkVals[lkId(sh,p)]=v; setLS("ml_"+lkId(sh,p), v); applyTheme(); if(!quiet) render(); }
function setCatTxt(v, quiet){ catTxt=v; setLS("ml_cattext",v); applyTheme(); if(!quiet) render(); }
/* v1.76 item 1: the two bars are the only surfaces the user cannot reach — every other colour in the
   app is settable and these two were fixed glass. Untouched they stay exactly that: the colour is
   Auto and the transparency is 100, and in that state nothing is written, so the glass recipe from
   v1.12 is what paints. Touch either one and the bar becomes your colour at your transparency —
   which is the only rule that can be stated in one sentence, and the only one where an untouched
   install is byte-for-byte unchanged. */
let topBar  = localStorage.getItem("ml_topbar") || "auto";
let navBar  = localStorage.getItem("ml_navbar") || "auto";
/* v1.78: the search bar is the third overlay tile, so it gets what the other two got in v1.76 — the
   same Auto/100 default, the same "nothing is written until you touch it" rule, the same alpha-in-the-
   colour rather than an opacity that would fade the text inside it. */
let srchBar = localStorage.getItem("ml_srchbar") || "auto";
/* v2.13: the household asked to colour the overlays on the bars — the tiles behind the list name, "N to buy"
   and the store, and the bottom bar's selected tab. Auto and untouched writes nothing: the theme's --chip
   still paints them, so an install that never opens these rows is unchanged. */
let topTile = localStorage.getItem("ml_toptile") || "auto";
let navSel  = localStorage.getItem("ml_navsel")  || "auto";
function setTopTile(v, quiet){ topTile=v; setLS("ml_toptile",v); applyTheme(); if(!quiet) render(); }
function setNavSel(v, quiet){ navSel=v; setLS("ml_navsel",v); applyTheme(); if(!quiet) render(); }
function setSrchBar(v, quiet){ srchBar=v; setLS("ml_srchbar",v); applyTheme(); if(!quiet) render(); }
/* v1.88: the search bar could be nudged with "Across" but never actually reach an edge — the wrap holds
   a 14px inset on both sides, and a 2px-per-tap stepper is the wrong instrument for crossing a screen.
   Alignment is one tap; Across still fine-tunes from wherever it lands. */
const SRCH_ALIGN = { left:"Left", center:"Centre", right:"Right" };
const _srchAlign0 = (typeof localStorage!=="undefined") ? localStorage.getItem("ml_srchalign") : null;
let srchAlignV = SRCH_ALIGN[_srchAlign0] ? _srchAlign0 : "center";
function srchAlign(){ return srchAlignV; }
function setSrchAlign(v){ srchAlignV = SRCH_ALIGN[v] ? v : "center"; setLS("ml_srchalign", srchAlignV); applyTheme(); render(); }
/* v1.80: tiles of your own. The three bars became settable tiles in v1.78; this is the same idea with
   the list opened up — a label, an optional emoji, and one thing it does. Everything about where it
   sits and what it looks like is stored ON the tile, because unlike the three built-ins these come and
   go and there is no fixed table that could hold a row per tile.
   Device-local, like every other appearance setting: these describe how YOUR phone looks, not what is
   on the list, so they never go near the synced state. */
const TILE_ACTS = {
  add:      "Open add",
  lists:    "Open the list switcher",
  plan:     "Go to Plan",
  shop:     "Go to Shop",
  settings: "Go to Settings",
  finish:   "Finish shopping",
  cat:      "Jump to a category"
};
function userTiles(){ try{ const a=JSON.parse(localStorage.getItem("ml_tiles")||"[]");
  return Array.isArray(a) ? a.filter(t=>t && typeof t==="object" && t.id) : []; }catch(e){ return []; } }
function writeTiles(a){ try{ localStorage.setItem("ml_tiles", JSON.stringify(a)); }catch(e){} }
/* a new tile lands bottom-right, above the nav, where a thumb already is — visible the moment it is
   made rather than needing to be found. */
function addUserTile(){
  const t={ id:"t"+Date.now().toString(36), label:"Shortcut", emoji:"", act:"add", cat:"",
            x:0, y:0, w:0, h:0, r:0, col:"auto", alpha:100, shade:0 };
  writeTiles(userTiles().concat([t])); render();
}
function patchTile(id, k, v){ const a=userTiles(); const t=a.find(x=>x.id===id); if(!t) return;
  t[k]=v; writeTiles(a); applyTheme(); render(); }
/* the numbers move in the same steps the built-in tiles use, and are clamped the same way, so the two
   kinds of tile cannot drift apart in feel. */
const TILE_NUM = { x:{min:-160,max:160,step:4,label:"Across"}, y:{min:-320,max:80,step:4,label:"Down"},
                   w:{min:0,max:640,step:10,label:"Width"},   h:{min:0,max:60,step:2,label:"Height"},
                   r:{min:0,max:40,step:2,label:"Corner"} };
function bumpTile(id, k, d){ const o=TILE_NUM[k]; if(!o) return;
  const a=userTiles(); const t=a.find(x=>x.id===id); if(!t) return;
  t[k]=Math.max(o.min, Math.min(o.max, (parseInt(t[k],10)||0) + d*o.step));
  writeTiles(a); render(); }
function bumpTileAlpha(id, d){ const a=userTiles(); const t=a.find(x=>x.id===id); if(!t) return;
  t.alpha=Math.max(0, Math.min(100, (parseInt(t.alpha,10)||100) + d*5)); writeTiles(a); render(); }
function bumpTileShade(id, d){ const a=userTiles(); const t=a.find(x=>x.id===id); if(!t) return;
  t.shade=Math.max(-SHADE_MAX, Math.min(SHADE_MAX, (parseInt(t.shade,10)||0) + d)); writeTiles(a); render(); }
function deleteTile(id){ writeTiles(userTiles().filter(t=>t.id!==id)); render(); }
/* v1.80: the tiles float over whatever page you are on, which is the point of them — a shortcut you
   placed for your thumb should not disappear because you changed page. They hide with the add sheet
   exactly as the search pill does (syncAddChrome), so nothing floats over an open sheet. */
function userTilesHTML(){
  const ts=userTiles(); if(!ts.length) return "";
  return `<div class="utiles" id="utiles">` + ts.map(t=>{
    const bg = (t.col==="auto" && (t.alpha|0)===100) ? "" : (()=>{
      const base = shadeBy(pickHex(t.col) || paperHex(), parseInt(t.shade,10)||0);
      const a = (t.alpha===undefined?100:t.alpha);
      const rgba = hexA(base, a);
      return rgba ? `background:${rgba};color:${a>=60?onAccent(base):"var(--text)"};` : "";
    })();
    const geo = `transform:translate(${parseInt(t.x,10)||0}px, ${parseInt(t.y,10)||0}px);`
      + ((parseInt(t.w,10)||0) ? `width:${parseInt(t.w,10)}px;` : "")
      + ((parseInt(t.h,10)||0) ? `padding-top:calc(12px + ${parseInt(t.h,10)}px);padding-bottom:calc(12px + ${parseInt(t.h,10)}px);` : "")
      + ((parseInt(t.r,10)||0) ? `border-radius:${parseInt(t.r,10)}px;` : "");
    return `<button class="utile" data-utile="${esc(t.id)}" style="${geo}${bg}">`
      + (t.emoji ? `<span class="utile-em" aria-hidden="true">${esc(t.emoji)}</span>` : "")
      + `<span class="utile-lb">${esc(t.label||"")}</span></button>`;
  }).join("") + `</div>`;
}
/* v1.80: one place decides what a tile does, so a shortcut behaves the same whichever page it is
   tapped from. An action whose target has gone (a deleted category) does nothing rather than throwing
   — the tile stays, because the category may come back and a tile that vanished would be worse. */
function wireUserTiles(){
  document.querySelectorAll("[data-utile]").forEach(b=>b.onclick=()=>{
    const t=userTiles().find(x=>x.id===b.dataset.utile); if(!t) return;
    switch(t.act){
      /* v1.87: the Lists page this tile pointed at is gone and the switcher is what replaced it, so a
         tile already made on someone's phone keeps working and opens the nearest true thing. */
      case "lists":    listsOpen=true; render(); break;
      case "plan":     gotoPage(0); break;
      case "shop":     gotoPage(1); break;
      case "settings": settingsFrom=curPageIdx(); gotoPage(2); break;
      case "finish":   if(state.items.some(i=>i.checked)){ finishOpen=true; render(); } else { gotoPage(1); } break;
      case "cat":      { const c=t.cat ? catList().find(x=>x.id===t.cat) : null; if(!c) return;
                         if(curPageIdx()!==1){ gotoPage(1); }
                         catEntry=c.id; render();
                         const el=document.querySelector(`[data-add="${c.id}"]`);
                         if(el) el.scrollIntoView({block:"center", behavior:"smooth"});
                         break; }
      default:         openAdd(); break;
    }
  });
}
/* v1.78: three tiles is one too many for a two-way ternary, so the storage key comes from a map. */
const BARA_KEY = { top:"ml_topbara", nav:"ml_navbara", srch:"ml_srchbara" };
function barAlpha(k){ const key=BARA_KEY[k]; if(!key) return 100;
  const v=parseInt(localStorage.getItem(key),10);
  return (isFinite(v) && v>=0 && v<=100) ? v : 100; }
function setTopBar(v, quiet){ topBar=v; setLS("ml_topbar",v); applyTheme(); if(!quiet) render(); }
function setNavBar(v, quiet){ navBar=v; setLS("ml_navbar",v); applyTheme(); if(!quiet) render(); }
function bumpBarAlpha(k,d){ const key=BARA_KEY[k]; if(!key) return;
  const v=Math.max(0, Math.min(100, barAlpha(k) + d*5));
  setLS(key, String(v)); applyTheme(); render(); }
/* the composed background, or null when the bar has been left alone. `hexA` turns the resolved hex
   into rgba so the transparency is part of the colour rather than an opacity on the element — an
   element opacity would fade the buttons sitting on the bar along with it. */
function hexA(hex, a){ const h=String(hex||"").replace("#","");
  if(h.length!==6) return null;
  return `rgba(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}, ${(a/100).toFixed(3)})`; }
/* v1.78: `srch` joins on the same terms — one map from tile to its picker and its shade key, so a
   fourth tile later is a line here rather than another branch. */
function barSel(kind){ return kind==="top" ? topBar : kind==="nav" ? navBar : srchBar; }
function barShadeKey(kind){ return kind==="top" ? "topbar" : kind==="nav" ? "navbar" : "srchbar"; }
function barBg(kind){
  const sel = barSel(kind);
  const a = barAlpha(kind);
  if(sel==="auto" && a===100) return null;                 // untouched: the glass recipe still paints
  const base = autoShade(barShadeKey(kind), pickHex(sel) || paperHex());
  return hexA(base, a);
}
/* v1.76 item 2: the category heading, treated as the one-line tile it already looks like. Its TEXT
   has been settable since v1.57 (`ml_cattext`); what it never had was the surface under that text.
   The heading in Regulars gets its own three, deliberately separate: it heads a different kind of
   thing — what you are not buying — and someone who wants the two to look different has no other way
   to say so. */
let catHdBg  = localStorage.getItem("ml_cathdbg")  || "auto";
let catHdBrd = localStorage.getItem("ml_cathdbrd") || "auto";
let regHdTxt = localStorage.getItem("ml_reghdtext")|| "auto";
let regHdBg  = localStorage.getItem("ml_reghdbg")  || "auto";
let regHdBrd = localStorage.getItem("ml_reghdbrd") || "auto";
function setCatHdBg(v, quiet){ catHdBg=v; setLS("ml_cathdbg",v); applyTheme(); if(!quiet) render(); }
function setCatHdBrd(v, quiet){ catHdBrd=v; setLS("ml_cathdbrd",v); applyTheme(); if(!quiet) render(); }
function setRegHdTxt(v, quiet){ regHdTxt=v; setLS("ml_reghdtext",v); applyTheme(); if(!quiet) render(); }
function setRegHdBg(v, quiet){ regHdBg=v; setLS("ml_reghdbg",v); applyTheme(); if(!quiet) render(); }
function setRegHdBrd(v, quiet){ regHdBrd=v; setLS("ml_reghdbrd",v); applyTheme(); if(!quiet) render(); }
function catHdBgHex(){  return pickHex(catHdBg); }
function catHdBrdHex(){ return pickHex(catHdBrd); }
function regHdTxtHex(){ return pickHex(regHdTxt, TEXTCOLS); }
function regHdBgHex(){  return pickHex(regHdBg); }
function regHdBrdHex(){ return pickHex(regHdBrd); }
/* one place that answers "what colour is actually painted", so applyTheme and the swatch previews in
   Settings can never disagree about it. */
/* v1.56 item 1: "page" is not a fixed colour — it is whatever the current theme paints the page,
   so it is read back from the token rather than stored as a hex. That also means it follows a theme
   change for free. */
function paperHex(){ try{ const v=getComputedStyle(document.body).getPropertyValue("--paper").trim(); return v||null; }catch(e){ return null; } }
/* v1.75 item 1: read the THEME's own value for a token, with our inline override lifted first —
   reading it while the override is in place would shade the already-shaded value and drift a little
   further every time applyTheme ran. */
function themeToken(name){
  try{
    const els=[document.documentElement.style, document.body.style];
    const saved=els.map(s=>s.getPropertyValue(name));
    els.forEach(s=>s.removeProperty(name));
    const v=getComputedStyle(document.body).getPropertyValue(name).trim();
    els.forEach((s,i)=>{ if(saved[i]) s.setProperty(name, saved[i]); });
    return v||null;
  }catch(e){ return null; }
}
function autoToken(k, name){
  if(!shadeOn[k]) return null;
  const base=themeToken(name);
  if(!base || base.charAt(0)!=="#") return null;
  const out=shadeBy(base, shadeOn[k]);
  return out===base ? null : out;
}
/* v1.57 item 2: one resolver for every picker: "page" is the theme's own paper colour (read back, so
   it follows a theme change) and a palette key is a hex.
   v1.65 item 2: the palette is a parameter now. The five text/accent pickers each looked their key up
   directly and so could not have understood "page" — which is why only Background and Border offered
   that swatch. One resolver, every picker. */
function pickHex(key, pal){
  if(key==="page") return paperHex();
  /* v1.67 item 2: a stored value may be a literal hex — the custom colour picker writes one. */
  if(typeof key==="string" && key.charAt(0)==="#") return key;
  const c=(pal||ACCENTS)[key]; if(!c) return null;
  return c; }
function tileBgHex(){  return pickHex(tileBg); }
function tileBrdHex(){ return pickHex(tileBrd); }
function tileTxtHex(){ return pickHex(tileTxt, TEXTCOLS); }
function uTileBgHex(){  return pickHex(uTileBg); }
function uTileBrdHex(){ return pickHex(uTileBrd); }
function uTileTxtHex(){ return pickHex(uTileTxt, TEXTCOLS); }
function ePillTxtHex(){ return pickHex(ePillTxt, TEXTCOLS); }
function ePillBgHex(){  return pickHex(ePillBg); }
function ePillBrdHex(){ return pickHex(ePillBrd); }
function lkHex(sh,p){ return pickHex(lkGet(sh,p), (p==="text"||p==="ptext") ? TEXTCOLS : undefined); }   // v2.69
function catTxtHex(){ return pickHex(catTxt, TEXTCOLS); }
/* v1.54 item 1: the geometry settings. One table so the stepper UI, the clamping and the CSS
   variable stay in one place instead of eight near-identical globals. Defaults are exactly the
   values the stylesheet used before this version, so an untouched install looks unchanged. */
const NUMOPT = {
  /* v1.55 item 2: the two gaps alone may go negative (overlapping hairlines) and move a pixel at a
     time — they are the only settings where a single pixel is visible. */
  gapx: { ls:"ml_gapx",    vr:"--tilegapx", def:8,  min:-4, max:28,  step:1, label:"Across" },
  gapy: { ls:"ml_gapy",    vr:"--tilegapy", def:8,  min:-4, max:28,  step:1, label:"Down" },
    /* v1.58 item 2: short enough for the shared caption column. */
  rad:  { ls:"ml_tilerad", vr:"--tilerad",  def:12, min:0,  max:28,  step:2, label:"Corner" },
  padl: { ls:"ml_padl",    vr:"--padl",     def:14, min:0,  max:40,  step:2, label:"Left" },
  padr: { ls:"ml_padr",    vr:"--padr",     def:14, min:0,  max:40,  step:2, label:"Right" },
  padt: { ls:"ml_padt",    vr:"--padt",     def:6,  min:0,  max:40,  step:2, label:"Top" },
  /* the bottom is the odd one out: it has no CSS variable, because syncZoomHeight() owns
     padding-bottom outright (it measures the floating nav, the in-cart bar and the search pill and
     reserves exactly that much). This number is the breathing room ON TOP of that clearance — 24px
     is what the code reserved unconditionally before it was settable — so even 0 still clears the
     chrome and the last row of tiles can never end up underneath it. */
  padb: { ls:"ml_padb",                     def:24, min:0,  max:120, step:4, label:"Bottom" },
  /* v1.76 item 1: the bars' own breathing room. These ADD to the padding each bar already has rather
     than replacing it, so zero is exactly today's chrome and an untouched install does not move —
     replacing it would have meant picking a new baseline for everyone who never asked for one. */
  barT: { ls:"ml_barpadt", vr:"--barpadt", def:0, min:0, max:30, step:2, label:"Height" },
  barB: { ls:"ml_barpadb", vr:"--barpadb", def:0, min:0, max:30, step:2, label:"Height" },
  /* v1.78: where the three overlay tiles sit and how big they are. There is no Height here for the two
     bars because they already have one — a bar's height IS its padding, which is what barT/barB are, so
     each simply appears inside its own tile's grid rather than being restated under a second name.
     Across/Down are transforms, so zero is genuinely "where it is now" and nothing is written until it
     is moved. Width and Roundness carry `off:0`: 0px is a real value for both, and the thing they
     actually need to express is "leave it alone" — auto width, and the shape the stylesheet already
     gives the tile — which no number can say, so zero is spent on it. Anyone who truly wants square
     corners can set 2 and will not be able to tell the difference. topy starts at -40 so the top bar
     can be pulled up under the status bar; navy/srchy end at +40 for the same reason at the bottom. */
  topx:  { ls:"ml_topx",  vr:"--topx",  def:0,  min:-60, max:60,  step:2, label:"Across" },
  topy:  { ls:"ml_topy",  vr:"--topy",  def:0,  min:-40, max:120, step:2, label:"Down" },
  topw:  { ls:"ml_topw",  vr:"--topw",  def:0,  min:0,   max:640, step:10, off:0, label:"Width" },
  topr:  { ls:"ml_topr",  vr:"--topr",  def:0,  min:0,   max:40,  step:2, off:0, label:"Corner" },
  navx:  { ls:"ml_navx",  vr:"--navx",  def:0,  min:-60, max:60,  step:2, label:"Across" },
  navy:  { ls:"ml_navy",  vr:"--navy",  def:0,  min:-120,max:40,  step:2, label:"Down" },
  navw:  { ls:"ml_navw",  vr:"--navw",  def:0,  min:0,   max:640, step:10, off:0, label:"Width" },
  navr:  { ls:"ml_navr",  vr:"--navr",  def:0,  min:0,   max:40,  step:2, off:0, label:"Corner" },
  srchx: { ls:"ml_srchx", vr:"--srchx", def:0,  min:-60, max:60,  step:2, label:"Across" },
  srchy: { ls:"ml_srchy", vr:"--srchy", def:0,  min:-120,max:40,  step:2, label:"Down" },
  srchw: { ls:"ml_srchw", vr:"--srchw", def:0,  min:0,   max:640, step:10, off:0, label:"Width" },
  srchh: { ls:"ml_srchh", vr:"--srchh", def:0,  min:0,   max:40,  step:2, label:"Height" },
  srchr: { ls:"ml_srchr", vr:"--srchr", def:0,  min:0,   max:40,  step:2, off:0, label:"Corner" },
  /* v2.63 item D: the Edit item pills. erad's `off` is its default, so an untouched install writes nothing and
     the stylesheet's 999px (fully round) stands. */
  erad:  { ls:"ml_eprad", vr:"--epillrad", def:20, min:0,  max:28,  step:2, off:20, label:"Corner" },
  /* v2.68: the gap is two numbers, like the tiles' — Across (column-gap, the same key and var as before) and Down
     (row-gap of the chip rows and the space between the editor's rows). Both are a LOOK, so an appearance slot carries them. */
  egap:  { ls:"ml_epgap", vr:"--epillgap", def:6,  min:0,  max:16,  step:1, label:"Across" },
  egapy: { ls:"ml_epgapy", vr:"--epillgapy", def:6, min:0,  max:24,  step:1, label:"Down" }
};
/* v2.69: each other sheet's pill shape. Every one has `off` at its default, so an untouched install writes nothing and the
   stylesheet's own radius and gaps stand. (The edit sheet's are erad/egap/egapy above.) */
SHEET_LOOKS.filter(sh=>sh!=="edit").forEach(sh=>{
  NUMOPT["lk_"+sh+"_rad"]  = { ls:"ml_lk_"+sh+"_rad",  vr:"--lk-"+sh+"-rad",  def:20, min:0, max:28, step:2, off:20, label:"Corner" };
  NUMOPT["lk_"+sh+"_gapx"] = { ls:"ml_lk_"+sh+"_gapx", vr:"--lk-"+sh+"-gapx", def:6,  min:0, max:16, step:1, off:6,  label:"Across" };
  NUMOPT["lk_"+sh+"_gapy"] = { ls:"ml_lk_"+sh+"_gapy", vr:"--lk-"+sh+"-gapy", def:6,  min:0, max:24, step:1, off:6,  label:"Down" }; });
/* v2.70: every sheet's Transparency — how opaque its background is, 0–100 %. A plain number (unit ""), off at 100, so an
   untouched sheet writes nothing; applyTheme() also marks <html data-lka-<sheet>> so the colour-mix applies only when set. */
SHEET_LOOKS.forEach(sh=>{
  NUMOPT["lk_"+sh+"_alpha"] = { ls:"ml_lk_"+sh+"_alpha", vr:"--lk-"+sh+"-alpha", def:100, min:0, max:100, step:5, off:100, unit:"", label:"Transparency" }; });
/* v2.74: the gap between an editor's rows, Across and Down — only for the sheets with rows (edit, smart); off at the default */
["edit","smart"].forEach(sh=>{
  NUMOPT["lk_"+sh+"_rgapx"] = { ls:"ml_lk_"+sh+"_rgapx", vr:"--lk-"+sh+"-rgapx", def:8,  min:0, max:32, step:2, off:8,  label:"Across" };
  NUMOPT["lk_"+sh+"_rgapy"] = { ls:"ml_lk_"+sh+"_rgapy", vr:"--lk-"+sh+"-rgapy", def:10, min:0, max:32, step:2, off:10, label:"Down" }; });
/* v1.55 item 2: two levels of default. NUMOPT[].def is the FACTORY value — what the stylesheet used
   before any of this was settable, and the thing to fall back to when an experiment goes wrong.
   `ml_numdef` is the user's own baseline, saved from whatever is on screen; once it exists, clearing
   a value returns to THAT rather than to the factory. Stored as one blob because it is one decision
   ("this is how I like my spacing"), not seven. */
function numDefs(){ try{ const o=JSON.parse(localStorage.getItem("ml_numdef")||"null"); return (o && typeof o==="object") ? o : null; }catch(e){ return null; } }
function hasNumDefs(){ return !!numDefs(); }
function saveNumDefs(){ const o={}; Object.keys(NUMOPT).forEach(k=>o[k]=numVal(k));
  try{ localStorage.setItem("ml_numdef", JSON.stringify(o)); }catch(e){}
  render(); }
function clearNumDefs(){ try{ localStorage.removeItem("ml_numdef"); }catch(e){} }
function numVal(k){ const o=NUMOPT[k]; if(!o) return 0;
  const inRange=v=>(isFinite(v) && v>=o.min && v<=o.max);
  const v=parseInt(localStorage.getItem(o.ls),10);
  if(inRange(v)) return v;
  const d=numDefs(); if(d){ const dv=parseInt(d[k],10); if(inRange(dv)) return dv; }
  return o.def; }
function bumpNum(k,d){ const o=NUMOPT[k]; if(!o) return;
  const v=Math.max(o.min, Math.min(o.max, numVal(k)+d*o.step));
  try{ localStorage.setItem(o.ls, String(v)); }catch(e){}
  applyTheme(); render(); }
function resetNums(){ Object.keys(NUMOPT).forEach(k=>{ try{ localStorage.removeItem(NUMOPT[k].ls); }catch(e){} });
  applyTheme(); render(); }
/* v1.55 item 2: the factory reset drops the user's own baseline too, otherwise "factory" would still
   land on their saved numbers — which is precisely the state they are trying to escape. */
function factoryNums(){ clearNumDefs(); resetNums(); }
const THEMES = {
  light:    { dark:false, tc:"#F6F2E7" },
  dark:     { dark:true,  tc:"#141C18" }
};
let theme = localStorage.getItem("ml_theme") || ((typeof window!=="undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark");
/* v1.42 item 6: the theme list is now just light / ink / noir / dark. Calm was a light theme whose
   whole point was pastel category colours — that is exactly what the new "Calm colours" option does,
   so a Calm user becomes light + calm colours and keeps their look. Mono was a dark theme. */
if(theme==="calm"){ theme="light"; localStorage.setItem("ml_theme","light"); }
else if(theme==="mono"){ theme="dark"; localStorage.setItem("ml_theme","dark"); }
if(theme==="market") theme="light"; else if(theme==="midnight") theme="dark";   // v1.28 removed themes migrate
/* v2.63 item A: Ink and Noir are gone from Settings — Ink becomes Light, Noir becomes Dark. Every
   stored look (slots, member looks) is applied through storage + reload, so it lands here too. */
function normTheme(v){ return v==="ink" ? "light" : v==="noir" ? "dark" : v; }
if(theme==="ink" || theme==="noir"){ theme=normTheme(theme); try{ localStorage.setItem("ml_theme", theme); }catch(e){} }
/* v1.52: the five tinted themes from v1.51 became WALLPAPERS instead — same colours, but as a
   backdrop under the Light palette rather than a whole token set. Anyone already on one keeps their
   colour: the theme falls back to Light and the matching wallpaper is switched on for them. */
if(["red","blue","yellow","pink","grey"].includes(theme)){
  try{ if(!localStorage.getItem("ml_wall")) localStorage.setItem("ml_wall", "wall-"+theme); }catch(e){}
  theme="light"; try{ localStorage.setItem("ml_theme","light"); }catch(e){}
}
if(!THEMES[theme]) theme = "light";
try{ localStorage.setItem("ml_theme", theme); }catch(e){}
function applyTheme(){ _cardHexMemo=null; const t = THEMES[theme] || THEMES.light;
  document.documentElement.setAttribute("data-theme", theme); document.body.setAttribute("data-theme", theme);
  document.body.classList.toggle("dark", t.dark); document.documentElement.classList.toggle("dark", t.dark);
  const tc=document.getElementById("themeColor"); if(tc) tc.content = t.tc;
  document.body.classList.toggle("haswall", !!(typeof wall!=="undefined" && wall));
  /* v1.71: a flat custom colour skips the paper wash — see body.flatwall::after. */
  document.body.classList.toggle("flatwall", isCustomWall(typeof wall!=="undefined" ? wall : ""));
  const _wp = (typeof wallPos!=="undefined" && wallPos==="top") ? "top" : "bottom";
  /* v1.42 items 5/7/8 — user colour overrides, written as inline custom properties on <html> so they
     beat the theme's own token block. "auto" removes the override and falls back to the theme.
     Every accent in the palette is dark enough for white text, so --on-accent is forced white
     whenever one is active — otherwise Noir's black-on-accent rule would make it unreadable. */
  /* Write to <html> AND <body>: every theme block targets `html[data-theme=…], body[data-theme=…]`,
     so a body-level declaration re-defines the token for everything inside <body>. An inline
     override on <html> alone loses to it — the accent silently did nothing on dark/ink/noir. */
  const els=[document.documentElement.style, document.body.style];
  const ac=accentHex() || autoToken("accent","--accent");
  const tx=textColHex() || autoToken("text","--text");
  els.forEach(rs=>{
    if(ac){ rs.setProperty("--accent", ac); rs.setProperty("--on-accent", onAccent(ac)); }
    else  { rs.removeProperty("--accent"); rs.removeProperty("--on-accent"); }
    rs.removeProperty("--text");
    if(tx) rs.setProperty("--text", tx);
    /* v1.54 item 1: geometry is always written (a number always has a value); the two surface
       colours are written only when the user picked one, so "auto" falls back to the theme token
       through the var() fallback in the stylesheet. */
    /* v1.78: a number whose value equals its `off` is not written at all, so the stylesheet's own
       value stands. Width and roundness need this — 0px is a real value for both, and "auto" cannot be
       expressed as a number, so the escape has to be a value the var simply never takes. */
    Object.keys(NUMOPT).forEach(k=>{ const o=NUMOPT[k]; if(!o.vr) return;
      if(o.off!==undefined && numVal(k)===o.off) rs.removeProperty(o.vr);
      else rs.setProperty(o.vr, numVal(k)+(o.unit!==undefined ? o.unit : "px")); });   // v2.70: unit "" for a plain number
    /* v1.57 item 2: six tile tokens plus the category one. Each is written only when its picker has a
       colour, so "auto" falls through to the CSS fallback and the theme keeps deciding. */
    const T={ "--tilebg":tileBgHex(), "--tilebrd":tileBrdHex(), "--tiletext":tileTxtHex(),
              "--utilebg":uTileBgHex(), "--utilebrd":uTileBrdHex(), "--utiletext":uTileTxtHex(),
              "--epillbg":ePillBgHex(), "--epillbrd":ePillBrdHex(), "--epilltext":ePillTxtHex(),   // v2.63 item D
              "--cattext":catTxtHex(),
              /* v1.76 item 2: the heading's own surface, and the Regulars heading's separate three. */
              "--cathdbg":catHdBgHex(), "--cathdbrd":catHdBrdHex(),
              "--reghdtext":regHdTxtHex(), "--reghdbg":regHdBgHex(), "--reghdbrd":regHdBrdHex() };
    Object.keys(T).forEach(k=>{ if(T[k]) rs.setProperty(k, T[k]); else rs.removeProperty(k); });
    /* A chosen tile background can be black or white, so the tile text has to follow it unless the
       user has picked one. Same for the unselected state. */
    if(T["--tilebg"] && !T["--tiletext"]) rs.setProperty("--tiletext", onAccent(T["--tilebg"]));
    if(T["--utilebg"] && !T["--utiletext"]) rs.setProperty("--utiletext", onAccent(T["--utilebg"]));
    if(T["--epillbg"] && !T["--epilltext"]) rs.setProperty("--epilltext", onAccent(T["--epillbg"]));   // v2.63 item D
    /* v2.69: every sheet's look, --lk-<sheet>-<prop>; written only when chosen. A chosen background with no chosen text
       gets the text that reads on it — for the sheet and for its pills. (Shape: the NUMOPT loop above.) */
    SHEET_LOOKS.forEach(sh=>{ const L={}; SHEET_PROPS.forEach(p=>L[p]=lkHex(sh,p));
      if(L.pbg && !L.ptext) L.ptext=onAccent(L.pbg);
      if(L.bg && !L.text) L.text=onAccent(L.bg);
      SHEET_PROPS.forEach(p=>{ const v="--lk-"+sh+"-"+p; if(L[p]) rs.setProperty(v, L[p]); else rs.removeProperty(v); });
      /* the edit sheet's shape is erad/egap/egapy (--epill*); it is mirrored as --lk-edit-* so the Edit item panel
         inside the add sheet (.addedit, data-look="edit") can take it back from the add sheet's own tokens */
      if(sh==="edit") Object.keys(LK_NUMALIAS).forEach(g=>{ const k=LK_NUMALIAS[g], o=NUMOPT[k], v="--lk-edit-"+g;
        if(o.off!==undefined && numVal(k)===o.off) rs.removeProperty(v); else rs.setProperty(v, numVal(k)+"px"); }); });
    /* v2.70: the attribute that switches a sheet's Transparency on — only when it is not 100 */
    SHEET_LOOKS.forEach(sh=>{ const k="lk_"+sh+"_alpha"; document.documentElement.toggleAttribute("data-lka-"+sh, numVal(k)!==NUMOPT[k].off); });
    /* v2.74: each sheet's layout — written only when set, so an untouched install matches no new rule */
    SHEET_LOOKS.forEach(sh=>LK_LAYOUT.forEach(k=>{ const v=lkLay(sh,k), a="data-lk-"+sh+"-"+k;
      if(v) document.documentElement.setAttribute(a, v); else document.documentElement.removeAttribute(a); }));
    /* v2.74: the row gap is set (either number) — so the Default layout takes it only then */
    ["edit","smart"].forEach(sh=>document.documentElement.toggleAttribute("data-lk-"+sh+"-rgap",
      ["rgapx","rgapy"].some(g=>{ const k="lk_"+sh+"_"+g; return numVal(k)!==NUMOPT[k].off; })));
    /* v1.76 item 2: the same rule for the two headings — a chosen heading background must not leave
       its label unreadable, but a chosen label colour always wins, so this only fills in the gap. */
    if(T["--cathdbg"] && !T["--cattext"]) rs.setProperty("--cattext", onAccent(T["--cathdbg"]));
    if(T["--reghdbg"] && !T["--reghdtext"]) rs.setProperty("--reghdtext", onAccent(T["--reghdbg"]));
    /* v1.76 item 2: the WIDTH is published, not just the colour — a 1.5px transparent border would
       still take 3px of height on a heading that has never had one, which is exactly the kind of
       silent shift an untouched install must not get. Same for the padding. */
    rs.setProperty("--reghdbw", T["--reghdbrd"] ? "1.5px" : "0px");
    rs.setProperty("--reghdpad", (T["--reghdbg"] || T["--reghdbrd"]) ? "7px 11px" : "0px");
    /* v1.76 item 1: written only when the bar has been touched, so an untouched install falls through
       to the glass recipe exactly as before. A chosen bar also publishes the text colour that reads
       on it — a dark bar on a light theme would otherwise keep the theme's dark labels and go blank
       (the same lesson as the tile fill in v1.65). Below 60% the bar is mostly page, so the page's own
       text is still the right answer and nothing is published. */
    /* v1.78: the search bar is written on exactly the same terms as the two bars above it. */
    /* v1.78: a tile wider than the box it is anchored in cannot be centred by `margin:auto` — the
       browser gives up on the over-constrained equation and pins it to the left edge. So when a width
       IS set the tile stops being anchored to both edges and is hung from the centre instead, which is
       the only way it can run past both sides evenly. Unset, neither var exists and the stylesheet's
       own left/right stand. */
    [["topw","--topleft","--topright"],["navw","--navleft","--navright"],["srchw","--srchleft","--srchright"]]
      .forEach(([k,lv,rv])=>{
        /* v1.88: when the search bar is aligned to an edge, the alignment owns --srchleft/--srchright —
           centre-anchoring a width on top of that would fight it. */
        if(k==="srchw" && srchAlign()!=="center") return;
        const w=numVal(k);
        if(w>0){ rs.setProperty(lv, "calc(50% - "+(w/2)+"px)"); rs.setProperty(rv, "auto"); }
        else { rs.removeProperty(lv); rs.removeProperty(rv); } });
    /* v1.88: an edge means the edge — the wrap's 14px inset goes with the alignment, or "flush left"
       would still be 14px short of it. Centre leaves every one of these unset, so an install that has
       not touched this is unchanged to the pixel. */
    const _sa = srchAlign();
    if(_sa==="left"){ rs.setProperty("--srchleft","0px"); rs.setProperty("--srchright","auto"); rs.setProperty("--srchpad","0px"); }
    else if(_sa==="right"){ rs.setProperty("--srchleft","auto"); rs.setProperty("--srchright","0px"); rs.setProperty("--srchpad","0px"); }
    else { rs.removeProperty("--srchpad"); }
    const TB=barBg("top"), NB=barBg("nav"), SB=barBg("srch");
    if(TB){ rs.setProperty("--topbar-bg", TB); } else { rs.removeProperty("--topbar-bg"); }
    if(NB){ rs.setProperty("--navbar-bg", NB); } else { rs.removeProperty("--navbar-bg"); }
    if(SB){ rs.setProperty("--srchbar-bg", SB); } else { rs.removeProperty("--srchbar-bg"); }
    const tOn = (TB && barAlpha("top")>=60) ? onAccent(autoShade("topbar", pickHex(topBar)||paperHex())) : null;
    const nOn = (NB && barAlpha("nav")>=60) ? onAccent(autoShade("navbar", pickHex(navBar)||paperHex())) : null;
    const sOn = (SB && barAlpha("srch")>=60) ? onAccent(autoShade("srchbar", pickHex(srchBar)||paperHex())) : null;
    if(tOn){ rs.setProperty("--topbar-text", tOn); } else { rs.removeProperty("--topbar-text"); }
    if(nOn){ rs.setProperty("--navbar-text", nOn); } else { rs.removeProperty("--navbar-text"); }
    if(sOn){ rs.setProperty("--srchbar-text", sOn); } else { rs.removeProperty("--srchbar-text"); }
    /* v2.13: the bar tiles. The text on them follows the colour, as the bars' own text does. */
    [["toptile",topTile,"--toptile"],["navsel",navSel,"--navsel"]].forEach(([k,sel,v])=>{
      if(sel==="auto" && !(shadeOn[k]||0)){ rs.removeProperty(v+"-bg"); rs.removeProperty(v+"-text"); return; }
      const hex=autoShade(k, pickHex(sel) || themeToken("--chip") || "#EDE7D6");
      rs.setProperty(v+"-bg", hex); const on=onAccent(hex); if(on) rs.setProperty(v+"-text", on); else rs.removeProperty(v+"-text"); });
  });
  /* v1.54 item 1: the qty and weight are painted from the CATEGORY colour by an inline style, which
     no stylesheet rule can outrank without !important — and a category red on a chosen blue tile is
     barely readable. Publish the fact that a background was picked on <html> (the same trick
     applyFill uses for the same reason) so one late rule can hand the meta the tile's own text
     colour. Nothing changes while Tile background is Auto. */
  try{ if(tileBgHex()) document.documentElement.setAttribute("data-tilebg","1");
       else document.documentElement.removeAttribute("data-tilebg"); }catch(e){}
  /* v1.52: a tinted wallpaper is a gradient, not a file — and it has no top/bottom variant. */
  /* v1.54 item 1: two layers now, so the `background:` shorthand can no longer carry the position
     and size — a multi-layer shorthand would apply them to the last layer only and leave the photo
     tiling at its natural size. The ::before rule uses longhands instead. */
  document.body.style.setProperty("--wall", wallLayers((typeof wall!=="undefined" && wall) || "", _wp));
  document.body.style.setProperty("--wall-blend",
    /* v1.56 item 1: `luminosity` alone applies to the background-COLOUR too, so the gradient was
       blending with .wallbtn's grey chip and every colour wallpaper came out the same beige. Only
       the photo layer should blend; the gradient paints normally underneath it. The value is shared
       with the Settings swatches, so it must mean the same thing in both places. */
    (typeof wall!=="undefined" && wall && isTintWall(wall)) ? "luminosity, normal" : "normal");
  if(typeof fill!=="undefined") applyFill();
  applyIcoSize(); applyLineW(); }
function setTheme(v){ v = normTheme(v); if(!THEMES[v]) return; theme = v; localStorage.setItem("ml_theme", theme); applyTheme(); render(); }
function toggleTheme(){ setTheme(theme==="dark" ? "light" : "dark"); }   // kept for back-compat
/* v1.41 item 2: three looks now — full (solid category colour), accent (transparent + coloured left
   bar) and empty (no coloured bar at all). The old "empty" WAS the accent look, so migrate stored
   values across; otherwise everyone silently loses their left bar. */
let fill = (()=>{ const v=localStorage.getItem("ml_fill");
  const migrated = localStorage.getItem("ml_fill_v141")==="1";
  if(v===null){ localStorage.setItem("ml_fill_v141","1"); return "accent"; }
  if(v==="empty" && !migrated){ localStorage.setItem("ml_fill","accent"); localStorage.setItem("ml_fill_v141","1"); return "accent"; }
  localStorage.setItem("ml_fill_v141","1");
  return v; })();
function fillMode(){ return fill; }
/* v1.50 item 3: several rules repaint border-left-color with !important (the Ink/Noir flatteners,
   .pill.done, .shop .pill.done), so an inline "no bar please" style from Empty could never win. The
   mode is published on <html> instead, and one late CSS rule enforces it at equal weight. */
function applyFill(){ try{ document.documentElement.setAttribute("data-fill", fill); }catch(e){} }
function setFill(m){ fill=m; localStorage.setItem("ml_fill", m); applyFill(); render(); }
/* v2.07: how big a tile's icon is drawn — S (today's size), M, L, XL. A LOOK, like tile roundness, so
   appearance slots carry it and it is deliberately NOT in APP_EXCLUDE. Published on <html> like
   data-fill; the stylesheet does the rest. No const here: applyTheme() runs this at boot. */
function icoSize(){ try{ const v=localStorage.getItem("ml_icosize"); return /^(s|m|l|xl)$/.test(v||"") ? v : "s"; }catch(e){ return "s"; } }
function applyIcoSize(){ try{ document.documentElement.setAttribute("data-icosize", icoSize()); }catch(e){} }
function setIcoSize(v){ try{ localStorage.setItem("ml_icosize", /^(s|m|l|xl)$/.test(v||"") ? v : "s"); }catch(e){} applyIcoSize(); render(); }
/* v2.08: how heavy the drawn lines are — fine, thin, regular (the v2.04 weight) or bold. A LOOK, like the
   icon size, so it is deliberately NOT in APP_EXCLUDE. */
function lineW(){ try{ const v=localStorage.getItem("ml_linew"); return /^(fine|thin|regular|bold)$/.test(v||"") ? v : "regular"; }catch(e){ return "regular"; } }
function applyLineW(){ try{ document.documentElement.setAttribute("data-linew", lineW()); }catch(e){} }
function setLineW(v){ try{ localStorage.setItem("ml_linew", /^(fine|thin|regular|bold)$/.test(v||"") ? v : "regular"); }catch(e){} applyLineW(); render(); }
// v1.23 wallpaper — "" (none, default) or wall-1..wall-4, applied as a fixed full-screen backdrop via applyTheme()
let wall = localStorage.getItem("ml_wall") || "";
/* v1.67 item 2: the red wallpaper is retired. Custom colours exist now, so rather than dropping
   anyone who was using it onto None, it becomes the same colour as a custom value — its own middle
   gradient stop, which is the colour the wallpaper actually read as. */
if(wall==="wall-red"){ wall="#EFA994"; try{ localStorage.setItem("ml_wall", wall); }catch(e){} }
/* v1.71: a custom colour is painted FLAT and exact — no ramp, no photo band, no wash. Measured, the
   old path turned #000000 into a #525252→#000000→#3d3d3d ramp with a photograph blended over it and
   a third of the paper colour washed on top, so the one thing a colour picker promises — that you get
   the colour you picked — was the one thing it did not do. `--wall` feeds `background-image`, which
   cannot take a bare colour, so a two-stop gradient of the same colour is the flat fill.
   The five shipped tints are photographs and keep their ramp, band and wash: the softening is what
   makes text readable over a picture, and none of it applies to a flat colour you chose deliberately. */
function isCustomWall(v){ return typeof v==="string" && v.charAt(0)==="#"; }
function isTintWall(v){ return !!WALL_TINTS[v]; }   // the shipped colour tints, which carry a photo band
function wallBand(v){ return TINT_BAND[v] || v; }
function wallLayers(v, pos){
  if(!v) return "none";
  if(isCustomWall(v)) return `linear-gradient(${v}, ${v})`;
  return WALL_TINTS[v] ? `url('img/${wallBand(v)}-${pos}.jpg'), ${WALL_TINTS[v]}` : `url('img/${v}-${pos}.jpg')`;
}
let wallPos = localStorage.getItem("ml_wallpos") || "bottom";   // v1.24 food band at "top" or "bottom" of the wallpaper
function setWall(v, quiet){ wall = v; localStorage.setItem("ml_wall", v); applyTheme(); if(!quiet) render(); }
function setWallPos(v){ wallPos = v; localStorage.setItem("ml_wallpos", v); applyTheme(); render(); }
// ---- Location / at-store detection ----
let useLoc = localStorage.getItem("ml_useloc"); useLoc = (useLoc===null ? true : useLoc==="1");
let storeSel = localStorage.getItem("ml_store") || "auto";      // "auto" | store id
let storeLocs = {}; try{ storeLocs = JSON.parse(localStorage.getItem("ml_storelocs")||"{}")||{}; }catch(e){ storeLocs={}; }
let locState = { checked:false, busy:false, ts:0, err:0, nearId:null, dist:Infinity };
const LOC_RADIUS_M = 250;  // within this many metres of a store's coords counts as being "at" it
function distM(a,b){ const R=6371000, toR=x=>x*Math.PI/180;
  const dLat=toR(b.lat-a.lat), dLng=toR(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s))); }
/* A16 Home is a real, rememberable place: it can save a GPS location and be auto-detected,
   but it has no aisles — being at Home always sorts by category. */
const HOME_STORE = { id:"home", name:"Home" };
/* v2.46: a store's name as shown — the built-in home store says "Home" in the app's language; every other name is the household's own */
function storeName(s){ return (s && s.id==="home" && s.name==="Home") ? t("Home") : ((s && s.name) || ""); }
function storeOverride(id){ return (state.storeMeta||{})[id] || {}; }   // {name?, hidden?} for built-in stores
function storeById(id){ if(id==="home") return HOME_STORE;
  const s = STORES.find(x=>x.id===id) || (state.stores||[]).find(x=>x.id===id); if(!s) return null;
  const ov=storeOverride(id); return ov.name ? {...s, name:ov.name} : s; }
function isCustomStore(id){ return (state.stores||[]).some(s=>s.id===id); }
function isRealStore(id){ return STORES.some(s=>s.id===id) || isCustomStore(id); }   // a pickable store (not auto/home/other)
function storeCoord(s){ if(!s) return null; if(storeLocs[s.id]) return storeLocs[s.id]; return (s.lat!=null)?{lat:s.lat,lng:s.lng}:null; }
// Which store's layout is in effect (manual pick wins, else GPS-detected, else none).
function activeStore(){ if(storeSel!=="auto") return storeById(storeSel); if(useLoc && locState.nearId) return storeById(locState.nearId); return null; }
function activeAisles(){ const s=activeStore(); return (s&&s.aisles) || AISLES_DAND; }
// Should Location sort show STORE aisle order right now?
function locActive(){ if(storeSel==="home"||storeSel==="other") return false; if(storeSel!=="auto") return true; if(!useLoc) return false; return !!(locState.checked && locState.nearId && locState.nearId!=="home"); }
function ensureLocCheck(){
  if(storeSel!=="auto" || !useLoc) return;            // GPS only needed for auto-detect
  const now=Date.now();
  if(locState.busy) return;
  if(locState.checked && now-locState.ts < 120000) return;   // cache 2 min
  if(!hasGeolocation()){ locState={checked:true,nearId:null,busy:false,ts:now,err:0}; return; }
  locState.busy=true;
  getPosition({ enableHighAccuracy:false, maximumAge:60000, timeout:8000 }).then(
    pos=>{ const here={lat:pos.coords.latitude,lng:pos.coords.longitude};
      let best=null,bd=Infinity; for(const s of [HOME_STORE,...STORES,...(state.stores||[])].filter(x=>!storeOverride(x.id).hidden)){ const c=storeCoord(s); if(!c) continue; const d=distM(here,c); if(d<bd){ bd=d; best=s; } }
      locState={checked:true, nearId:(best&&bd<=LOC_RADIUS_M)?best.id:null, busy:false, ts:Date.now(), err:0, dist:bd};
      /* a fix that lands during start-up waits for the first render, or that render wipes the Undo toast */
      if(!_booted){ _pendingFinish=locState.nearId; render(); return; }
      if(autoFinishAt(locState.nearId)) return;
      render(); },
    err=>{ locState={checked:true, nearId:null, busy:false, ts:Date.now(), err:(err&&err.code)||1}; render(); });
}
/* v2.10: the cart finishes itself. When location confirms you are at a saved store that is NOT the one
   the cart was filled at, that trip is over: the ticked items are saved to Regulars exactly as Finish
   does, with the same Undo. Only a positive match counts. No fix, home, or an unknown store never finish
   anything, and neither does a cart whose items were ticked with no store known. A web app cannot watch
   location in the background, so this happens the next time the app is opened or checks location. */
let _booted=false, _pendingFinish=null;   // v2.10: see ensureLocCheck and the last lines of the module
function autoFinishAt(nearId){
  if(!nearId || !isRealStore(nearId)) return false;
  const ck=state.items.filter(i=>i.checked); if(!ck.length) return false;
  const last=ck.reduce((a,i)=>((i.checkedAt||0)>(a.checkedAt||0)?i:a), ck[0]);
  const from=last.checkedStore||""; if(!from || from===nearId) return false;
  const name=(storeById(from)||{}).name||"your last shop";
  sweep(`Finished your ${name} shop · ${ck.length} saved to Regulars`); return true; }
/* v2.48 first-time use (Do later L1; docs/onboarding-proposal.md). Four moments, each asked once per phone
   (ml_onb) and never twice in one visit (_onbLater, "Not now"):
   1. Your shops — the first time in Shop, before anyone set up shops on this list: untick, add, then location.
   2. How it works — the tip, once there are items and no Regulars yet.
   3. Pin this shop (a) when ticking at a picked shop with no location, or Which shop is this (b) when
      auto-detect found nothing — the answer pins it and back-fills the last three hours of ticks.
   6. Aisle map — the second day at a shop with no map, while there.
   1 and 2 are for a NEW phone only (onb.fresh, set when it first gives its name, or by the Settings reset), so a
   household already using the app is not lectured. ONE card at a time: onbCardHTML returns the first that applies, and the list shows it only when the
   look / install / card / receipt cards are all quiet. visits only counts days for moment 6 — a tick is
   not a purchase, nothing else is learned from it. */
var _onbLater = {};        // session-only "Not now": "shops", "which", "pin:"+id, "map:"+id
var _onbShopsOpen = false; // the shops card stays up once shown, though touching a chip fills storeMeta
function onbGet(){ try{ const o=JSON.parse(localStorage.getItem("ml_onb")||"{}"); return (o && typeof o==="object") ? o : {}; }catch(e){ return {}; } }
function onbSet(fn){ try{ const o=onbGet(); fn(o); localStorage.setItem("ml_onb", JSON.stringify(o)); }catch(e){} }
function onbVisit(id){ const d=dayKey(new Date()); onbSet(o=>{ o.visits=o.visits||{}; const a=(o.visits[id]||[]).filter(x=>x!==d); a.push(d); o.visits[id]=a.slice(-3); }); }
function onbCard(id, title, body, btns){ return `<div class="installcard" id="${id}" role="note"><div class="ic-t">${title}</div>${body}<div class="ic-btns">${btns}</div></div>`; }
function onbCardHTML(){
  const onb=onbGet(), items=state.items||[];
  if(shopMode && onb.fresh && !onb.shops && !_onbLater.shops && (_onbShopsOpen || (!(state.stores||[]).length && !Object.keys(state.storeMeta||{}).length))){
    _onbShopsOpen=true;
    const chips=[...STORES.filter(s=>!storeOverride(s.id).removed).map(s=>s.id), ...(state.stores||[]).map(s=>s.id)]
      .map(id=>`<button data-onb-store="${esc(id)}" class="storechip ${storeOverride(id).hidden?'':'on'}">${esc(storeName(storeById(id))||"")}</button>`).join("");
    return onbCard("onbShops", t("Where do you usually shop?"),
      `<div class="ic-b">${t("Untick the ones you never use, or add yours. The list then walks the shop you're in.")}</div><div class="storegrid">${chips}</div>`+
      `<div class="onbadd"><input id="onbShopName" placeholder="${t("Add another shop")}" style="flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:14px;font-weight:600" /><button class="optaction" id="onbShopAdd">${t("Add")}</button></div>`+
      (useLoc ? `<div class="ic-b">${t("Location is asked next, so the list knows which shop you're in.")}</div>` : ""),
      `<button class="newlist" id="onbShopsDone">${t("Done")}</button><button class="optaction" id="onbShopsSkip">${t("Skip")}</button>`);
  }
  if(shopMode && isRealStore(storeSel) && !storeCoord(storeById(storeSel)) && items.some(i=>i.checked && i.checkedStore===storeSel)
     && (onb.pin||{})[storeSel]!=="never" && !_onbLater["pin:"+storeSel]){
    return onbCard("onbPin", tf("Are you at {x}?", { x:esc(storeName(storeById(storeSel))||"") }),
      `<div class="ic-b">${t("Pin it here and the list finds this shop by itself next time.")}</div>`,
      `<button class="newlist" id="onbPinGo">${t("Pin it")}</button><button class="optaction" id="onbPinLater">${t("Not now")}</button><button class="optaction" id="onbPinNever">${t("Never for this shop")}</button>`);
  }
  const fresh3h=i=>i.checked && !i.checkedStore && (Date.now()-(i.checkedAt||0))<3*3600000;
  if(shopMode && storeSel==="auto" && useLoc && onb.which!=="never" && !_onbLater.which && items.some(fresh3h)) ensureLocCheck();   // nothing else looks while no tick has a shop
  if(shopMode && storeSel==="auto" && useLoc && locState.checked && !locState.busy && !locState.err && !locState.nearId
     && items.some(fresh3h) && onb.which!=="never" && !_onbLater.which){
    const vis=[...STORES.map(s=>s.id), ...(state.stores||[]).map(s=>s.id)].filter(id=>isRealStore(id) && !storeOverride(id).hidden && !storeOverride(id).removed && storeById(id));
    if(vis.length) return onbCard("onbWhich", t("Which shop are you in?"),
      `<div class="ic-b">${t("Tap it and the list will know this shop next time.")}</div><div class="storegrid">${vis.map(id=>`<button data-onb-here="${esc(id)}" class="storechip">${esc(storeName(storeById(id))||"")}</button>`).join("")}</div>`,
      `<button class="optaction" id="onbWhichLater">${t("Not now")}</button><button class="optaction" id="onbWhichNever">${t("Don't ask again")}</button>`);
  }
  const st=shopMode ? activeStore() : null;
  if(st && isRealStore(st.id) && !(state.aislemap&&state.aislemap[st.id]&&(state.aislemap[st.id].aisles||[]).length) && !amOpen
     && (onb.map||{})[st.id]!=="never" && !_onbLater["map:"+st.id]){
    const days=new Set((onb.visits||{})[st.id]||[]);
    if(days.size>=2 && days.has(dayKey(new Date()))) return onbCard("onbMap", tf("Want the list in {x}'s aisle order?", { x:esc(storeName(st)||"") }),
      `<div class="ic-b">${t("Walk it once and photograph the aisle signs — next time the list follows the shop.")}</div>`,
      `<button class="newlist" id="onbMapGo" data-onb-map="${esc(st.id)}">${t("Start")}</button><button class="optaction" id="onbMapLater">${t("Later")}</button><button class="optaction" id="onbMapNever">${t("Never for this shop")}</button>`);
  }
  if(onb.fresh && !onb.tip && items.length>0 && !(state.buyAgain||[]).length){
    return onbCard("onbTip", t("How it works"),
      `<div class="ic-b">${t("Tick things off in the shop. When you're done, Save to Regulars — next time they're one tap away.")}</div>`,
      `<button class="newlist" id="onbTipOk">${t("Got it")}</button>`);
  }
  return "";
}
function onbWire(){
  const q=s=>app.querySelector(s), on=(s,f)=>{ const b=q(s); if(b) b.onclick=f; };
  app.querySelectorAll("[data-onb-store]").forEach(b=>b.onclick=()=>{ const id=b.dataset.onbStore; state.storeMeta=state.storeMeta||{};
    if(storeOverride(id).hidden){ if(state.storeMeta[id]) delete state.storeMeta[id].hidden; }
    else state.storeMeta[id]=Object.assign({}, state.storeMeta[id], {hidden:true});
    save(); render(); });
  on("#onbShopAdd", ()=>{ const inp=q("#onbShopName"); const name=((inp&&inp.value)||"").trim(); if(!name) return;
    state.stores=state.stores||[]; state.stores.push({ id:"c"+uid().slice(0,6), name, aisles:[] }); save(); render(); });
  on("#onbShopsDone", ()=>{ onbSet(o=>{ o.shops="done"; }); _onbShopsOpen=false; if(useLoc) ensureLocCheck(); render(); });
  on("#onbShopsSkip", ()=>{ onbSet(o=>{ o.shops="skip"; }); _onbShopsOpen=false; render(); });
  on("#onbPinGo", ()=>pinStoreHere(storeSel));
  on("#onbPinLater", ()=>{ _onbLater["pin:"+storeSel]=1; render(); });
  on("#onbPinNever", ()=>{ const id=storeSel; onbSet(o=>{ o.pin=o.pin||{}; o.pin[id]="never"; }); render(); });
  app.querySelectorAll("[data-onb-here]").forEach(b=>b.onclick=()=>{ const id=b.dataset.onbHere;
    const backfill=()=>{ for(const it of (state.items||[])){ if(it.checked && !it.checkedStore && (Date.now()-(it.checkedAt||0))<3*3600000){ it.checkedStore=id; markDirty(it.id); } } save(); };
    if(!hasGeolocation()){ backfill(); showToast(t("Location not available here")); render(); return; }
    pinStoreHere(id, backfill); });
  on("#onbWhichLater", ()=>{ _onbLater.which=1; render(); });
  on("#onbWhichNever", ()=>{ onbSet(o=>{ o.which="never"; }); render(); });
  const mg=q("#onbMapGo"); const mid=mg ? mg.dataset.onbMap : "";
  on("#onbMapGo", ()=>{ amOpen=mid; amDraft=null; amRead=null; render(); });
  on("#onbMapLater", ()=>{ _onbLater["map:"+mid]=1; render(); });
  on("#onbMapNever", ()=>{ onbSet(o=>{ o.map=o.map||{}; o.map[mid]="never"; }); render(); });
  on("#onbTipOk", ()=>{ onbSet(o=>{ o.tip=1; }); render(); });
}
function setStoreHere(){
  if(storeSel==="auto"){ showToast("Pick a store first, then Set store here"); return; }
  if(!hasGeolocation()){ showToast("Location not available here"); return; }
  pinStoreHere(storeSel);
}
function pinStoreHere(id, onDone){   // v2.48 setStoreHere's body for any store (the onboarding pin cards use it too)
  showToast("Getting location…");
  getPosition({ enableHighAccuracy:true, maximumAge:0, timeout:10000 }).then(
    pos=>{ const here={lat:pos.coords.latitude,lng:pos.coords.longitude};
      // v1.28 a confirmed location takes over its spot: clear the saved GPS of any OTHER place within
      // ~120 m so auto-detect stops flip-flopping. Labels stay (only the stored coordinate is removed),
      // so those places can be re-pinned to their own real location later.
      let cleared=0; for(const k in storeLocs){ if(k===id) continue; const c=storeLocs[k]; if(c && distM(here,c)<=120){ delete storeLocs[k]; cleared++; } }
      storeLocs[id]=here; localStorage.setItem("ml_storelocs", JSON.stringify(storeLocs));
      locState={ checked:false, busy:false, ts:0, err:0, nearId:null, dist:Infinity };   // force a fresh detection against the deduped set
      showToast(cleared ? tf("Saved {x} ✓", { x:storeName(storeById(id))||t("store") }) + " · " + (cleared>1 ? tf("cleared {n} duplicates", { n:cleared }) : tf("cleared {n} duplicate", { n:cleared })) : tf("Saved {x} ✓", { x:storeName(storeById(id))||t("store") }));
      onDone && onDone(); render(); },
    err=>{ showToast("Couldn’t get location — check permissions"); });
}
function storeLabel(){
  if(storeSel==="home") return t("Home · sorted by category");
  if(storeSel==="other") return t("Other store · sorted by category");
  if(storeSel!=="auto"){ const s=storeById(storeSel); return s ? (storeName(s)+" · "+t("selected")) : t("Others"); }
  if(!useLoc) return t("Others · location off");
  if(locState.busy || !locState.checked) return t("Checking location…");
  if(locState.err) return t("Others · location unavailable");
  const s=locState.nearId?storeById(locState.nearId):null;
  return s ? (storeName(s)+(s.aisles?"":" · "+t("sorted by category"))) : t("Others · not at a saved store");
}
// Known stores. Coords are best-estimate centres; refine on-site with “Set … location here”.
const MARKET_CATS = ["meat","vegetable","fruit","fresh","dairy","deli","bakery"];   // v2.33: + the thirteen's fresh counters   // Dandenong market only stocks these
// At a market store, only meat & seafood, vegetable, fruit and fresh are shown.
function storeShows(it){ const st=activeStore(); return (st&&st.market) ? MARKET_CATS.includes(it.cat) : true; }
/* v2.27 a shop with its own aisle map (state.aislemap) is walked in the map's order: an item goes to the first aisle whose
   sign names its aisle type (js/aisles.js), and what the map cannot place comes after, in the usual order. A market keeps
   its own short order. */
var _shopMapMemo = null;   // var: render() reads it at boot
function shopMap(id){ const m = id && state.aislemap && state.aislemap[id];
  if(!m || !Array.isArray(m.aisles) || !m.aisles.length) return null;
  if(_shopMapMemo && _shopMapMemo.src === m) return _shopMapMemo.mapped;
  const mapped = mapAisles(m.aisles); _shopMapMemo = { src:m, mapped }; return mapped; }
function aisleRank(it){ const st = activeStore(), am = (st && !st.market) ? shopMap(st.id) : null;
  if(am){ const i = mapRank(am, it.name, it.cat); return i >= 0 ? 200 + i : 1000 + aisleRankBase(it); }
  return aisleRankBase(it); }
function aisleRankBase(it){ const c=it.cat;
  const st=activeStore();
  if(st && st.market){ const i=MARKET_CATS.indexOf(c); return i<0 ? 900 : (i+1); }  // meat→1 veg→2 fruit→3 fresh→4
  if(c==="meat") return 1;        // meat & seafood pinned to the very top
  if(c==="vegetable") return 2;
  if(c==="fruit") return 3;
  if(c==="alcohol" || c==="liquor") return 99;    // last (v2.33: liquor in the thirteen)
  if(c==="asian") return 98;      // 2nd from last
  if(c==="health") return 97;     // 3rd from last
  const n=(it.name||"").toLowerCase();
  for(const a of activeAisles()){ if(a.words.some(w=>n.includes(w))) return a.r; }
  const cf={fresh:23,bulk:17,others:90, bakery:5,deli:21,dairy:23,pantry:17,snacks:40,frozen:60,household:80}[c];   // v2.33 the thirteen's
  return cf!=null?cf:75;
}
function byAisle(a,b){ const ra=aisleRank(a),rb=aisleRank(b); if(ra!==rb) return ra-rb; return bySortKey(a,b); }

/* A19 AI shop order — learns the order you actually check categories at each
   store and reorders future trips. Starts identical to Location (aisleRank
   baseline) and diverges as data accumulates. Purely local; no LLM call. */
let aiOrder = loadLearn("ml_aiorder");
let _aiTripCats = [];   // distinct categories checked so far this shopping trip, in order
/* A25 item-level AI — learns the order you check individual ITEMS (not just
   categories) at each store, so the walk reorders item-by-item. Frozen per trip
   at shop-entry (aiResetTrip) so it can't reshuffle mid-shop; applies next trip. */
let _aiTripItems = [];
let aiItems = loadLearn("ml_aiitems");
let aiItemsApplied = loadLearn("ml_aiitemsapplied");
function aiItemKey(name,cat){ return (name||"").toLowerCase().trim()+"|"+cat; }
function aiStoreKey(){ const s=activeStore(); if(s&&s.id) return s.id; return storeSel||"default"; }
function aiSortOK(){ if(storeSel==="home"||storeSel==="other") return false; const s=activeStore(); return !(s && s.id==="home"); }   // no AI at Home (incl. auto-detected) or "Other" — category default there
function aiResetTrip(){ _aiTripCats = []; _aiTripItems = [];
  const key = aiStoreKey();                                              // freeze the learned item order for this trip
  aiItemsApplied[key] = Object.assign({}, aiItems[key]||{});
  try{ localStorage.setItem(lkey("ml_aiitemsapplied"), JSON.stringify(aiItemsApplied)); }catch(e){}
}
function aiRecordCheck(cat, name){
  if(!aiSortOK()) return;                                                // skip at Home/Other
  const key = aiStoreKey(); const A = 0.35;                              // EMA weight — adapts but resists one-off noise
  const ik = name ? aiItemKey(name,cat) : null;                         // item-level (primary signal)
  if(ik && !_aiTripItems.includes(ik)){ const r=_aiTripItems.length; _aiTripItems.push(ik);
    const im = aiItems[key] || (aiItems[key] = {});
    im[ik] = (im[ik]==null) ? r : im[ik]*(1-A) + r*A;
    try{ localStorage.setItem(lkey("ml_aiitems"), JSON.stringify(aiItems)); }catch(e){} }
  if(cat && !_aiTripCats.includes(cat)){ const r=_aiTripCats.length; _aiTripCats.push(cat);   // category-level (diagnostic + cold-start)
    const store = aiOrder[key] || (aiOrder[key] = {});
    store[cat] = (store[cat]==null) ? r : store[cat]*(1-A) + r*A;
    try{ localStorage.setItem(lkey("ml_aiorder"), JSON.stringify(aiOrder)); }catch(e){} }
}
// B7: display ranks against the ACCEPTED order (aiApplied), never the live EMA —
// so the list can't silently reshuffle mid-shop while learning keeps updating aiOrder.
let aiApplied = loadLearn("ml_aiapplied");
let aiDismiss = loadLearn("ml_aidismiss");
function aiItemPos(it){ const ap=aiItemsApplied[aiStoreKey()]; if(!ap) return null; const v=ap[aiItemKey(it.name,it.cat)]; return (v==null)?null:v; }
function aiRank(it){
  const ap = aiItemsApplied[aiStoreKey()];
  if(!ap || !Object.keys(ap).length){ const s = activeStore(); return (s && shopMap(s.id)) ? aisleRank(it) : catIndexOf(it.cat); }   // reset/cold → the shop's aisle map if it has one (v2.27), else CATEGORY order, until it learns
  const p = aiItemPos(it); if(p!=null) return p;                        // learned ITEM position (item-level order)
  const catPos = Object.keys(ap).filter(k=>k.slice(k.lastIndexOf("|")+1)===it.cat).map(k=>ap[k]);
  if(catPos.length) return catPos.reduce((a,b)=>a+b,0)/catPos.length + 0.5;   // unseen item → near its learned category-mates
  return 900 + catIndexOf(it.cat);                                      // brand-new category → after learned ones, in category order
}
function byAI(a,b){ const ra=aiRank(a),rb=aiRank(b); if(ra!==rb) return ra-rb; return bySortKey(a,b); }
function aiSeenCount(){ return Object.keys(aiOrder[aiStoreKey()]||{}).length; }
function aiSeq(map,key){ const s=map[key]||{}; return Object.keys(s).sort((a,b)=>s[a]-s[b]); }   // categories in learned/accepted order
// B7: is there a freshly-learned order that reorders the current list vs what's shown, and not yet dismissed?
function aiProposal(){
  const key=aiStoreKey();
  if(Object.keys(aiOrder[key]||{}).length < 2) return null;                         // need enough signal
  const onList=[...new Set(state.items.filter(i=>!i.checked).map(i=>i.cat))];
  const prop=aiSeq(aiOrder,key).filter(c=>onList.includes(c));
  if(prop.length < 2) return null;                                                  // fewer than 2 learned cats on the list
  const curL=onList.slice().sort((a,b)=>aiRank({cat:a,name:""})-aiRank({cat:b,name:""})).filter(c=>prop.includes(c));
  const propKey=prop.join(">");
  if(propKey===curL.join(">")) return null;                                         // already in the learned order → nothing to propose
  if(aiDismiss[key]===propKey) return null;                                         // this exact proposal was dismissed
  return { key, propKey };
}
function aiResetStore(){ const key=aiStoreKey();
  delete aiOrder[key]; delete aiApplied[key]; delete aiDismiss[key]; delete aiItems[key]; delete aiItemsApplied[key]; _aiTripCats=[]; _aiTripItems=[];
  try{ localStorage.setItem(lkey("ml_aiorder"),JSON.stringify(aiOrder)); localStorage.setItem(lkey("ml_aiapplied"),JSON.stringify(aiApplied)); localStorage.setItem(lkey("ml_aidismiss"),JSON.stringify(aiDismiss)); localStorage.setItem(lkey("ml_aiitems"),JSON.stringify(aiItems)); localStorage.setItem(lkey("ml_aiitemsapplied"),JSON.stringify(aiItemsApplied)); }catch(e){}
  showToast("AI reset — category order until it relearns"); render(); }   // stay in AI sort; cold AI = category order
function aiApplyProposal(){
  const key=aiStoreKey();
  aiApplied[key]=Object.assign({}, aiOrder[key]);                                   // snapshot the learned order as accepted
  delete aiDismiss[key];
  try{ localStorage.setItem(lkey("ml_aiapplied"), JSON.stringify(aiApplied)); localStorage.setItem(lkey("ml_aidismiss"), JSON.stringify(aiDismiss)); }catch(e){}
  render();
}
function aiDismissProposal(){
  const p=aiProposal(); if(p){ aiDismiss[p.key]=p.propKey; try{ localStorage.setItem(lkey("ml_aidismiss"), JSON.stringify(aiDismiss)); }catch(e){} }
  render();
}
/* v2.16: the learned shop order travels with the list. When a shop is finished (Save to Regulars, or the cart
   finishing itself), this phone writes its learned order for that store into the list — state.aisle[store] =
   { items, cats, ts }. Every phone adopts a store's entry when it is newer than the last one it took, merging
   it over what it learned itself; it takes effect from the next trip. */
function aiAdopt(){ try{
  const A=(state && state.aisle) || {}; let seen={};
  try{ seen=JSON.parse(localStorage.getItem(lkey("ml_aiseen"))||"{}")||{}; }catch(e){}
  let changed=false;
  Object.keys(A).forEach(k=>{ const r=A[k]; if(!r || typeof r!=="object" || !(+r.ts>(+seen[k]||0))) return;
    if(r.items && typeof r.items==="object") aiItems[k]=Object.assign({}, aiItems[k]||{}, r.items);
    if(r.cats && typeof r.cats==="object") aiOrder[k]=Object.assign({}, aiOrder[k]||{}, r.cats);
    seen[k]=+r.ts; changed=true; });
  if(changed){ try{ localStorage.setItem(lkey("ml_aiitems"),JSON.stringify(aiItems)); localStorage.setItem(lkey("ml_aiorder"),JSON.stringify(aiOrder));
    localStorage.setItem(lkey("ml_aiseen"),JSON.stringify(seen)); }catch(e){} }
}catch(e){} }
function aiPublish(){ try{
  if(!aiSortOK()) return; const k=aiStoreKey(); if(!k || k==="default") return;
  const items=aiItems[k]||{}, cats=aiOrder[k]||{}; if(!Object.keys(items).length && !Object.keys(cats).length) return;
  const ts=Date.now();
  state.aisle=Object.assign({}, state.aisle||{}, { [k]:{ items:Object.assign({}, items), cats:Object.assign({}, cats), ts } });
  try{ const seen=JSON.parse(localStorage.getItem(lkey("ml_aiseen"))||"{}")||{}; seen[k]=ts; localStorage.setItem(lkey("ml_aiseen"),JSON.stringify(seen)); }catch(e){}
}catch(e){} }

/* B4 predictive replenishment — on-device. Logs a purchase whenever items are
   swept (bought), estimates each item's typical interval, and on the user's
   chosen cadence proposes restocking items that are due. Adds only on tap;
   global on/off; explainable; nothing leaves the device. */
const DAY_MS = 86400000;
let purch = loadLearn("ml_purch");
let predictCfg = { on:true, freq:"weekly", day:1 };                 // day: 0=Sun..6=Sat (JS getDay); default Mon
try{ const p=JSON.parse(localStorage.getItem("ml_predict")||"null"); if(p&&typeof p==="object") predictCfg=Object.assign(predictCfg,p); }catch(e){}
let predictSeen = loadLearn("ml_predict_seen");
let predictWhyOpen = false;
function savePredictCfg(){ try{ localStorage.setItem("ml_predict", JSON.stringify(predictCfg)); }catch(e){} }
function savePredictSeen(){ try{ localStorage.setItem(lkey("ml_predict_seen"), JSON.stringify(predictSeen)); }catch(e){} }
let _predReset = 0; try{ _predReset = +localStorage.getItem("ml_predict_reset")||0; }catch(e){}
function applyPredictReset(ts){                                     // wipe learned restock cadence (shared history + local mirror)
  purch={}; predictSeen={};
  state.purch = purch;                                             // clear the shared copy too
  try{ localStorage.setItem(lkey("ml_purch"),"{}"); savePredictSeen(); localStorage.setItem("ml_predict_reset", String(ts)); }catch(e){}
  _predReset = ts;
}
function resetPredictions(){                                        // reset on this device only
  applyPredictReset(Date.now());
  showToast("Predictions reset — restock suggestions cleared"); render();
}
function resetPredictionsServer(){                                  // reset across the whole household via the synced epoch
  const ts=Date.now(); applyPredictReset(ts); state.predictReset=ts; save();
  showToast("Predictions reset for all devices"); render();
}
function recordPurchase(items){
  const now=Date.now();
  if(!state.purch || typeof state.purch!=="object") state.purch={};
  purch = state.purch;                                               // record into the shared history (sweep()'s save() syncs it)
  for(const it of items){ const nm=(it.name||"").trim(); if(!nm) continue; const key=nm.toLowerCase()+"|"+it.cat;
    const rec = purch[key] || (purch[key]={name:nm,cat:it.cat,qty:it.qty||1,weight:it.weight||"",sub:it.sub||"",ts:[]});
    rec.name=nm; rec.cat=it.cat; if(it.qty) rec.qty=it.qty; if(it.weight!=null) rec.weight=it.weight; if(it.sub!=null) rec.sub=it.sub;
    if(!rec.ts.length || now-rec.ts[rec.ts.length-1] > 6*3600000) rec.ts.push(now);   // ignore same-day re-sweeps
    rec.ts = rec.ts.slice(-8);
  }
}
function _median(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function cadenceOf(rec){ const ts=(rec&&rec.ts)||[]; if(ts.length<2) return 0; const g=[]; for(let i=1;i<ts.length;i++) g.push(ts[i]-ts[i-1]); return _median(g); }
/* v2.01: the pantry, from evidence rather than data entry. The household already records every shop
   (purch); if something was bought recently relative to how often it is bought — well inside its
   usual cycle, or in the last three days — it is probably still in the cupboard. Matched by NAME
   only: a recipe's "olive oil" and the list's "Olive oil" in another category are the same bottle. */
function probablyHave(name){
  const n=String(name||"").trim().toLowerCase(); if(!n) return null;
  let best=null, last=0;
  for(const key in purch){ const rec=purch[key];
    if(!rec || String(rec.name||"").trim().toLowerCase()!==n) continue;
    const t=Math.max(0, ...((rec.ts||[]).filter(x=>isFinite(x))));
    if(t>last){ last=t; best=rec; } }
  if(!best) return null;                                   // never bought: unknown means buy it
  const elapsed=Date.now()-last, cad=cadenceOf(best);
  if((cad && elapsed<cad*0.6) || elapsed<3*DAY_MS) return { days:Math.max(0, Math.floor(elapsed/DAY_MS)) };
  return null;
}
/* v2.01: a review row the pantry says is probably had starts unticked and says why. */
function markHave(row){ const h=probablyHave(row.name); if(h){ row.sel=false; row.have=true; row.haveDays=h.days; } return row; }
function predictPeriod(d){ d=d||new Date();
  if(predictCfg.freq==="monthly") return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  const t=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const days=Math.floor(t.getTime()/DAY_MS);
  return "W"+Math.floor((days+3)/7);                                 // Monday-aligned week bucket
}
function predictStarted(d){ d=d||new Date();
  if(predictCfg.freq==="monthly") return true;                       // any day in the month
  const idx=(d.getDay()+6)%7, chosen=((predictCfg.day+6)%7);         // Mon=0..Sun=6
  return idx>=chosen;                                                // on/after the chosen weekday, same week
}
function predictDue(){
  const now=Date.now(), out=[], period=predictPeriod();
  const dz=(predictSeen[period]&&predictSeen[period].dismissed)||[];
  for(const key in purch){ const rec=purch[key]; const cad=cadenceOf(rec); if(!cad) continue;
    const days=cad/DAY_MS; if(days<1.5 || days>75) continue;         // ignore implausible cadences
    const last=rec.ts[rec.ts.length-1], elapsed=now-last;
    if(elapsed < cad*0.85) continue;                                 // not due yet
    if(dz.includes(key)) continue;                                   // dismissed this period
    if(state.items.some(i=>!i.checked && (i.name||"").toLowerCase()===rec.name.toLowerCase() && i.cat===rec.cat)) continue;   // already on list
    out.push({ key, name:rec.name, cat:rec.cat, qty:rec.qty||1, weight:rec.weight||"", sub:rec.sub||"", cadenceDays:Math.max(1,Math.round(days)), last, over:elapsed/cad });
  }
  out.sort((a,b)=>b.over-a.over);
  return out.slice(0,6);
}
function predictActive(){
  if(!predictCfg.on || !predictStarted()) return null;
  const period=predictPeriod();
  if(predictSeen[period] && predictSeen[period].hidden) return null; // whole batch dismissed this period
  const due=predictDue(); return due.length ? due : null;
}
function predictAdd(key){ const rec=purch[key]; if(!rec) return;
  if(!state.items.some(i=>!i.checked && (i.name||"").toLowerCase()===rec.name.toLowerCase() && i.cat===rec.cat)){
    state.items.push({id:uid(),name:rec.name,qty:rec.qty||1,cat:newCat(rec.cat, rec.name),weight:rec.weight||"",sub:rec.sub||"",checked:false,by:me}); playPlan(true); }
  save(); predictDismiss(key);
}
function predictDismiss(key){ const period=predictPeriod();
  const s=predictSeen[period]||(predictSeen[period]={dismissed:[],hidden:false});
  if(!s.dismissed.includes(key)) s.dismissed.push(key); savePredictSeen(); renderKeepingAdd();
}
function predictHideAll(){ const period=predictPeriod();
  const s=predictSeen[period]||(predictSeen[period]={dismissed:[],hidden:false}); s.hidden=true; savePredictSeen(); render();
}
function predictCardHTML(){
  const due=predictActive(); if(!due) return "";
  const chips=due.map(d=>`<div class="predchip">
      <button class="predchip-add" data-pred-add="${esc(d.key)}"><span class="predchip-plus">+</span>${esc(cap(d.name))}<span class="predchip-cad">~${d.cadenceDays}d</span></button>
      <button class="predchip-x" data-pred-rm="${esc(d.key)}" aria-label="Dismiss">×</button>
    </div>`).join("");
  return `<div class="predict">
    <div class="predict-top"><span class="predict-ttl">${RESTOCK_SVG(15)} Time to restock?</span><button class="predict-why" data-pred-why>${predictWhyOpen?'Hide':'Why?'}</button></div>
    ${predictWhyOpen?`<div class="predict-whytxt">Based on how often you've bought these before — estimated on your device, nothing leaves your phone. Adds only when you tap. Change the schedule or turn this off in <b>Settings › Predictions</b>.</div>`:""}
    <div class="predict-list">${chips}</div>
    <button class="predict-hide" data-pred-hide>Not now</button>
  </div>`;
}

/* B5 de-duplication & merge — on-device (no AI). Clusters look-alike items by a
   token-subset rule (one name refines another, e.g. "milk" ⊆ "whole milk"), so
   variants merge but distinct products ("chicken breast" vs "turkey breast")
   don't. Proposes only; the merge is reversible via the standard Undo. */
let mergeX = {}; try{ mergeX = JSON.parse(localStorage.getItem("ml_merge_x")||"null") || {}; }catch(e){ mergeX={}; }
function singular(w){ if(w.length<=3) return w;
  if(w.endsWith("ss")||w.endsWith("us")) return w;                       // glass, hummus — not plurals
  if(w.endsWith("ies")&&w.length>4) return w.slice(0,-3)+"y";            // berries→berry
  if(w.endsWith("es")&&/(ch|sh|s|x|z)es$/.test(w)) return w.slice(0,-2); // boxes→box, dishes→dish
  if(w.endsWith("s")) return w.slice(0,-1);                              // chips→chip
  return w; }
function mergeTokens(name){ return (name||"").toLowerCase().replace(/[^a-z0-9%\s]/g," ").split(/\s+/).filter(Boolean).map(singular); }
function _subsetMerge(a,b){ const sa=new Set(a), sb=new Set(b);
  return [...sa].every(t=>sb.has(t)) || [...sb].every(t=>sa.has(t)); }   // one token set ⊆ the other
function mergeClusters(){
  const byCat={};
  for(const it of state.items){ if(it.checked) continue; const tok=mergeTokens(it.name); if(!tok.length) continue;
    (byCat[it.cat]||(byCat[it.cat]=[])).push({it, tok}); }
  const out=[];
  for(const cat in byCat){ const arr=byCat[cat], n=arr.length; if(n<2) continue;
    const parent=arr.map((_,i)=>i);
    const find=x=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){ if(_subsetMerge(arr[i].tok,arr[j].tok)) parent[find(i)]=find(j); }
    const cl={};
    for(let i=0;i<n;i++){ const r=find(i); (cl[r]||(cl[r]=[])).push(arr[i]); }
    for(const r in cl){ const members=cl[r]; if(members.length<2) continue;
      const its=members.map(m=>m.it);
      const sig=its.map(i=>i.name.toLowerCase()).sort().join("|");
      if(mergeX[sig]) continue;
      const canon=members.slice().sort((a,b)=> a.tok.length-b.tok.length || a.it.name.length-b.it.name.length)[0].it;
      out.push({ sig, cat, canon:canon.name, items:its });
    }
  }
  return out;
}
function mergeCluster(sig){
  const cl=mergeClusters().find(c=>c.sig===sig); if(!cl) return;
  const prev=snapState();
  let qty=0, weight="", sub="";
  for(const it of cl.items){ qty += (it.qty||1); if(!weight && it.weight) weight=it.weight; if(!sub && it.sub) sub=it.sub; }
  const keepId=cl.items[0].id, ids=new Set(cl.items.map(i=>i.id));
  state.items = state.items.filter(i=>!ids.has(i.id));
  state.items.push({ id:keepId, name:cap(cl.canon), qty:Math.min(999,qty||1), cat:cl.cat, weight, sub, checked:false, by:me });
  markDirty(keepId); save(); render();
  showUndo(prev, tf("Merged into {x}", { x:cap(cl.canon) }));
}
function mergeDismiss(sig){ mergeX[sig]=1; try{ localStorage.setItem("ml_merge_x", JSON.stringify(mergeX)); }catch(e){} render(); }
function mergeHideAll(){ for(const c of mergeClusters()) mergeX[c.sig]=1; try{ localStorage.setItem("ml_merge_x", JSON.stringify(mergeX)); }catch(e){} render(); }
function mergeCardHTML(){
  const cls=mergeClusters(); if(!cls.length) return "";
  const rows=cls.slice(0,2).map(c=>`<div class="mergerow">
      <div class="mergerow-txt"><span class="mergerow-names">${esc(c.items.map(i=>cap(i.name)).join(", "))}</span><span class="mergerow-into">→ ${esc(cap(c.canon))}</span></div>
      <div class="mergerow-btns"><button class="merge-go" data-merge-go="${esc(c.sig)}">Merge</button><button class="merge-x" data-merge-x="${esc(c.sig)}" aria-label="Keep separate">×</button></div>
    </div>`).join("");
  return `<div class="predict mergecard">
    <div class="predict-top"><span class="predict-ttl">🔀 Possible duplicates</span><button class="predict-why" data-merge-hide>Not now</button></div>
    <div class="mergelist">${rows}</div>
  </div>`;
}
/* v2.45 the language. English by default; French is chosen in Settings › Appearance. var: renders read it at boot */
var appLang = (()=>{ try{ const v=localStorage.getItem("ml_lang"); return LANGS.some(l=>l.code===v) ? v : "en"; }catch(e){ return "en"; } })();   // v2.55 any language in LANGS
try{ document.documentElement.lang = appLang; }catch(e){}
function t(s){ return tr(appLang, s); }
function tf(s, v){ return trf(appLang, s, v); }
/* v2.45 a category's name as shown: a built-in name in the language chosen, a name the household typed as typed.
   Display only — the stored label is never changed. */
function catLabel(c){ if(!c) return ""; const l=c.label||"";
  if(DEFAULT_CATS.some(d=>d.id===c.id && d.label===l) || CATS13.some(d=>d.id===c.id && d.label===l) || (!c.id && l==="Buy again")) return t(l);
  return l; }
function dateLoc(){ return langOf(appLang).locale; }   // v2.55 from LANGS (English: undefined, the phone's own)
applyTheme();
let shopMode = localStorage.getItem("ml_shop")==="1";   // v1.09 restore the shopper's lens on relaunch
function setShop(on){ if(shopMode===on) return; shopMode=on; if(shopMode) aiResetTrip(); localStorage.setItem("ml_shop", shopMode?"1":"0"); collapse.ba = !shopMode && collapse.ba; }
function toggleShop(){ setShop(!shopMode); render(); }
/* v1.87: the "lists" mode key is retired with the page — settings stored under it are simply unused. */
function optMode(){ return shopMode ? "shop" : "plan"; }
let _prevPlanned=null, _prevChecked=null;
let _cartPending = 0;   // items mid-flight to the cart — counted in the badge only once the flyer lands (bumpCart)
function cartCount(){ return Math.max(0, state.items.filter(i=>i.checked).length - _cartPending); }
/* v2.16: keep the screen awake while the cart has something in it, so the phone does not dim and lock mid-aisle
   (Settings › Sound › Keep screen on, on unless switched off). The browser drops the lock whenever the app is
   hidden; it is asked for again when the app comes back. Refused or unsupported: nothing happens. */
let _wl=null, _wlAsking=false;
function wakePref(){ try{ return localStorage.getItem("ml_wakelock")!=="0"; }catch(e){ return true; } }
function wakeWanted(){ try{ return wakePref() && configured && !!me && !optOpen && view!=="plan" && cartCount()>0 && document.visibilityState==="visible"; }catch(e){ return false; } }
function syncWakeLock(){ try{
  const want=wakeWanted();
  if(want && !_wl && !_wlAsking && wakeLockSupported()){ _wlAsking=true;
    requestWakeLock().then(l=>{ _wlAsking=false; _wl=l; l.addEventListener("release", ()=>{ if(_wl===l) _wl=null; });
      if(!wakeWanted()){ _wl=null; l.release().catch(()=>{}); } }).catch(()=>{ _wlAsking=false; }); }
  else if(!want && _wl){ const l=_wl; _wl=null; l.release().catch(()=>{}); }
}catch(e){} }
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") syncWakeLock(); });
/* v2.11: the count is drawn INSIDE the cart's SVG at the household's own coordinates (x 57.24, baseline 42,
   35 units; "+" at 77,29 in 20 units) — an HTML label positioned by percentages over the icon landed in a
   different place on the phone than in the drawing, because font metrics differ between devices. */
/* v2.12: past 99 the "99" stays exactly where any count sits — 35 units, centred on x 57.24 — and a bigger
   raised "+" (26 units) follows it (the household chose option A, with the 99 centred). v2.11 pinned the +
   at (77,29), which landed on the second 9. "99" and "+" are one text chunk (the + has only dy), centred at
   57.24 + half the +'s advance: in Outfit 800, "99" at 35 is 40.53 wide and "+" at 26 is 14.86, so the
   chunk centre is 57.24 + 7.43 = 64.67 and the 99 spans 36.97–77.51. The + reaches past the drawing's
   right edge (x 90), so the nav cart's svg shows overflow. */
function cartNumHTML(n){ return n>99 ? '<tspan x="64.67" y="42">99<tspan class="cartplus" dy="-12">+</tspan></tspan>' : String(n); }
function cartBadgeHTML(iconHTML){
  return `<span class="cartwrap" id="cartWrap">${iconHTML.replace('</svg>', `<text class="cartnum" id="cartNum" x="57.24" y="42" text-anchor="middle">${cartNumHTML(cartCount())}</text></svg>`)}</span>`;
}
// A23 bottom-nav stats flanking the cart: "N to buy" (left) and "N in cart" (right)
function navStatHTML(){
  const planned = state.items.filter(i=>!i.checked).length;
  const changed = _prevPlanned!==null && _prevPlanned!==planned;
  _prevPlanned = planned;
  return `<div class="navstat"><span class="navstat-n${changed?' justpop':''}">${planned}</span><span class="navstat-l">${t("to buy")}</span></div>`;
}
function navCartStatHTML(){
  const inCart = state.items.filter(i=>i.checked).length;
  const changed = _prevChecked!==null && _prevChecked!==inCart;
  _prevChecked = inCart;
  return `<div class="navstat navstat-cart"><span class="navstat-n${changed?' justpop':''}">${inCart}</span><span class="navstat-l">${t("in cart")}</span></div>`;
}
// A22 shared glyphs + bottom-nav builder (Lists left · "N left" | divider | Cart, grouped right)
const CART_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.6"/><circle cx="18" cy="21" r="1.6"/><path d="M2.5 3h2l2.2 12.4a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21.5 7H6"/></svg>';
// A27 bottom-nav cart: the app cart with an OPEN top (no top rail) and scaled up, so the
// in-cart count sits inside the open basket with even spacing and fits double-digit numbers (matches the reference art)
/* v2.10: the household's own cart drawing (100×90), drawn in currentColor so it follows the theme and the
   active tab. Its paths are untouched; the viewBox is cropped to the drawing (10 10 80 72) so the cart
   fills the icon instead of its margins. The count sits in the open basket between the walls (.cartnum). */
const CART_NAV_SVG = '<svg width="29" height="26" viewBox="10 10 80 72" aria-hidden="true"><path d="M14 14 H24 L35.47 60 H79 L85.48 34" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="41.23" cy="76" r="6" fill="currentColor"/><circle cx="73.23" cy="76" r="6" fill="currentColor"/></svg>';
// v1.81 the switcher's chevron. Drawn, not typed: U+2304 is not in the self-hosted Outfit subset, so
// the character renders as blank — and there is no web font to fall back to in an offline PWA.
const CHEV_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>';
const CHEV_BIG_SVG = CHEV_SVG.replace('width="11" height="11"', 'width="17" height="17"');   // v2.12 the title's chevron, bigger
const GEAR_SVG = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const CAL_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
/* v2.12: the bar's Plan and Settings marks are drawn the same size as the cart — 26px tall, their viewBoxes
   cropped to the drawing so the mark (not its margin) fills the box — so all three labels sit on one line. */
/* v2.14: one line weight across the bar. Each mark is drawn in its own units, so the same kind of stroke-width
   attribute renders at different widths: the cart 6 × 26/72 = 2.17px, the calendar 1.9 × 26/20 = 2.47px (the
   household: "plan looks thicker") and the gear 1.8 × 26/27 = 1.73px. NAV_LINE_PX is the cart's; the other two
   are given the attribute that renders at exactly it. (Settings › Line weight is for the item drawings only.) */
const NAV_LINE_PX = 6 * 26 / 72;
const CAL_NAV_SVG = CAL_SVG.replace('width="20" height="20" viewBox="0 0 24 24"', 'class="navico" width="26" height="26" viewBox="2 2 20 20"')
  .replace('stroke-width="1.9"', `stroke-width="${(NAV_LINE_PX * 20 / 26).toFixed(4)}"`);
/* v2.13: the gear's viewBox is the whole 24-unit canvas plus a margin — v2.12 cropped it to 21.8 units and
   the stroke at the teeth was cut off, and the gear read bigger than the cart and the calendar. */
const GEAR_NAV_SVG = GEAR_SVG.replace('width="21" height="21" viewBox="0 0 24 24"', 'class="navico" width="26" height="26" viewBox="-1.5 -1.5 27 27"')
  .replace('stroke-width="1.8"', `stroke-width="${(NAV_LINE_PX * 27 / 26).toFixed(4)}"`);
/* v1.82: ⋯ is not in the self-hosted Outfit subset and would render as nothing, so the three dots are drawn. */
function bottomNav(o){
  // v1.16 three tabs: Lists · Shop (middle, cart) · Settings (right). Adding is the floating "+ Add" pill.
  // v1.87 three tabs again: the Lists page is gone (the title's switcher replaced it) — Plan · Shop · Settings.
  return `<nav class="bottomnav" id="bottomnav">
    <button class="navbtn ${o.planActive?'active':''}" id="${o.planId}">${CAL_NAV_SVG}<span>${t("Plan")}</span></button>
    <button class="navbtn ${o.cartActive?'active':''}" id="${o.cartId}">${cartBadgeHTML(CART_NAV_SVG)}<span>${t("Shop")}</span></button>
    <button class="navbtn ${o.setActive?'active':''}" id="${o.setId}">${GEAR_NAV_SVG}<span>${t("Settings")}</span></button>
  </nav>`;
}
// A22 fly a live clone of the just-checked tile along a smooth downward arc into the cart
let _flyLast = 0;
function flyItemToCart(srcEl, it){
  try{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const cartEl = document.querySelector("#cartWrap") || document.querySelector("#cartNav,#cartNavL");
    if(!srcEl || !cartEl) return false;
    const s = srcEl.getBoundingClientRect(), c = cartEl.getBoundingClientRect();
    const clone = srcEl.cloneNode(true);
    clone.classList.add("tilefly");
    clone.removeAttribute("id");
    clone.style.left = s.left+"px"; clone.style.top = s.top+"px";
    clone.style.width = s.width+"px"; clone.style.height = s.height+"px";
    const P0 = { x:s.left+s.width/2, y:s.top+s.height/2 };
    const P2 = { x:c.left+c.width/2, y:c.top+c.height/2 };
    // stagger rapid taps so they queue one-after-another (~90ms apart)
    const now = performance.now();
    const at = Math.max(now, _flyLast + 90);
    _flyLast = at;
    setTimeout(()=>launchTileFlyer(clone, P0, P2), at-now);
    return true;
  }catch(e){ return false; }
}
function launchTileFlyer(clone, P0, P2){
  document.body.appendChild(clone);
  // control point stays between the tile and the cart — a gentle sideways bow, never rising above the start
  const dx=P2.x-P0.x, dy=P2.y-P0.y;
  const P1 = { x:P2.x + Math.max(30, Math.abs(dx)*0.22), y:P0.y + dy*0.28 };   // bow out to the right, then sweep into the cart
  const N = 20, frames = [];
  for(let k=0;k<=N;k++){ const t=k/N, mt=1-t;
    const x = mt*mt*P0.x + 2*mt*t*P1.x + t*t*P2.x;
    const y = mt*mt*P0.y + 2*mt*t*P1.y + t*t*P2.y;
    const sc = 1 - 0.72*t;                      // full tile → ~0.28 as it drops into the cart
    const op = t>0.8 ? Math.max(0,(1-t)/0.2) : 1;
    frames.push({ transform:`translate(${(x-P0.x).toFixed(1)}px,${(y-P0.y).toFixed(1)}px) scale(${sc.toFixed(3)})`, opacity:op });
  }
  const anim = clone.animate(frames, { duration:728, easing:"cubic-bezier(.4,0,.2,1)" });  // 30% slower
  let fired = false;
  const done = ()=>{ if(fired) return; fired = true; clone.remove(); bumpCart(); };
  anim.onfinish = done; anim.oncancel = done;
  setTimeout(done, 940);   // safety net if WAAPI events don't fire
}
function bumpCart(){
  if(_cartPending>0) _cartPending--;                    // this flyer has landed — now count it in the badge
  const cart = document.querySelector("#cartWrap");
  const cnum = cart && cart.querySelector(".cartnum");
  if(cnum){ cnum.innerHTML = cartNumHTML(cartCount());
    cnum.classList.remove("pop"); void cnum.offsetWidth; cnum.classList.add("pop"); setTimeout(()=>cnum.classList.remove("pop"), 1000); }
  if(cart){ cart.classList.remove("cartpop"); void cart.offsetWidth; cart.classList.add("cartpop"); setTimeout(()=>cart.classList.remove("cartpop"), 1000); }
  if(cart) sparkleCart(cart);
  playCartSound();
  document.querySelectorAll(".sb-incart").forEach(el=>{
    el.classList.remove("cartpulse"); void el.offsetWidth; el.classList.add("cartpulse");
    setTimeout(()=>el.classList.remove("cartpulse"), 460);
  });
}
function sparkleCart(cart){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const n = 6;
  const r = cart.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  for(let i=0;i<n;i++){
    const a = (Math.PI*2*i)/n + (Math.random()-0.5)*0.6;
    const dist = 16 + Math.random()*16;
    const s = document.createElement("span");
    s.className = "spark"; s.textContent = "✧";
    s.style.color = "#F2F6EE";
    s.style.left = cx+"px"; s.style.top = cy+"px";
    s.style.fontSize = (12*(0.72 + Math.random()*0.56)).toFixed(0)+"px";
    s.style.setProperty("--dx", (Math.cos(a)*dist).toFixed(1)+"px");
    s.style.setProperty("--dy", (Math.sin(a)*dist).toFixed(1)+"px");
    document.body.appendChild(s);
    setTimeout(()=>s.remove(), 700);
  }
}
function playCartSound(){
  try{
    if(!window.__cartActx) window.__cartActx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = window.__cartActx;
    if(ctx.state==="suspended") ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(1180, t+0.09);
    const vol = (60/100)*0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.22);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t+0.24);
  }catch(e){}
}
let sorts = {}; try{ sorts = JSON.parse(localStorage.getItem("ml_sorts")||"null") || {}; }catch(e){ sorts={}; }
const _legacySort = localStorage.getItem("ml_sort")||"cat";
function sortModeFor(){ const v=sorts[optMode()]||_legacySort; return v==="auto"?"cat":v; }
function setSort(m){ sorts[optMode()]=m; localStorage.setItem("ml_sorts", JSON.stringify(sorts)); render(); }
let displays = {}; try{ displays = JSON.parse(localStorage.getItem("ml_displays")||"null") || {}; }catch(e){ displays={}; }
/* v1.43 item 4: "List" is gone as a separate mode — a 1-column Large tile renders identically
   (see lineList()), so fold any stored "list" choice into large·1 rather than stranding it. */
(function(){ let ch=false;
  Object.keys(displays).forEach(k=>{ if(displays[k]==="list"){ displays[k]="large"; ch=true; } });
  /* ml_largecols is a SEPARATE global preference (default 3). Forcing it to 1 unconditionally is the
     point: anyone who had ever nudged the Large column count would otherwise have their List silently
     become a 3- or 4-column grid. They were not using Large, so its remembered count is the thing to lose. */
  if(ch){ localStorage.setItem("ml_displays", JSON.stringify(displays));
    localStorage.setItem("ml_largecols","1"); } })();
/* v2.58: one tile system — Small tiles are gone. Once per phone (ml_nosmall), the column count the Shop page showed
   is kept: a small-tile phone carries its small column count into ml_largecols, then every non-large display becomes large. */
(function(){ try{ if(localStorage.getItem("ml_nosmall")==="1") return;
  const L=["large","grid3","grid4","grid5"], wasSmall=!L.includes(displays.shop);
  if(wasSmall){ const v=parseInt(localStorage.getItem("ml_smallcols")||"0",10); localStorage.setItem("ml_largecols", String((v>=0&&v<=6)?v:0)); }
  ["shop","plan"].forEach(k=>{ if(!(k in displays)) displays[k]=undefined; });
  Object.keys(displays).forEach(k=>{ if(!L.includes(displays[k])) displays[k]="large"; });
  localStorage.setItem("ml_displays", JSON.stringify(displays)); localStorage.setItem("ml_nosmall","1"); }catch(e){} })();
// v1.27 display model: List / Large Tile (2–6 cols) / Small Tile flow + independent Category / Subcategory toggles
function dispBase(){ const d=displays[optMode()];
  if(d==="list") return "list";
  return "large"; }                                   // v2.58: Small tiles are gone — everything else is large
function largeCols(){ const d=displays[optMode()];
  if(d==="grid3") return 3; if(d==="grid4") return 4; if(d==="grid5") return 5;
  const v=parseInt(localStorage.getItem("ml_largecols")||"0",10);
  return (v>=0&&v<=6)?v:0; }   // v1.39: 0 = variable width (tiles size to the word), 1..6 = fixed columns
function displayFor(){ return catOn ? "cat" : "flat"; }
function lineList(){ return dispBase()==="list" || (dispBase()==="large" && largeCols()===1); }   // v1.43 item 4: large·1 renders as the old List
/* v1.43 item 4: large·1 must NOT also emit `gridmode grid1` — the list layout and the 1-column grid
   would fight over the same rows. 0 → no gridmode class → natural flow (variable width). */
function gridCols(){ return (dispBase()==="large" && largeCols()>1) ? largeCols() : 0; }
let _co=localStorage.getItem("ml_caton"); let catOn = _co===null ? true : _co==="1";
let _so=localStorage.getItem("ml_subon"); let subOn = _so===null ? false : _so==="1";
function setCatOn(v){ catOn=!!v; localStorage.setItem("ml_caton", catOn?"1":"0"); render(); }
function setSubOn(v){ subOn=!!v; localStorage.setItem("ml_subon", subOn?"1":"0"); render(); }
function setDispBase(b){ displays[optMode()]=b; localStorage.setItem("ml_displays", JSON.stringify(displays)); render(); }
function setLargeCols(n){ localStorage.setItem("ml_largecols", String(n)); displays[optMode()]="large"; localStorage.setItem("ml_displays", JSON.stringify(displays)); render(); }
// v1.16 two independent icon switches — category icons (emoji AND images) and item emojis.
let _emojiCat = localStorage.getItem("ml_emoji_cat");
let _emojiItem = localStorage.getItem("ml_emoji_item");
(function(){ const old=localStorage.getItem("ml_emoji"); if(old!==null){ if(_emojiCat===null) _emojiCat=old; if(_emojiItem===null) _emojiItem=old; } })();   // migrate the old single toggle
function catEmojiOn(){ return _emojiCat===null ? true : _emojiCat==="1"; }
function itemEmojiOn(){ return _emojiItem===null ? true : _emojiItem==="1"; }
function setCatEmoji(on){ _emojiCat = on?"1":"0"; localStorage.setItem("ml_emoji_cat", _emojiCat); render(); }
function setItemEmoji(on){ _emojiItem = on?"1":"0"; localStorage.setItem("ml_emoji_item", _emojiItem); render(); }
// Smart add (AI ✨) on/off — global; ON keeps the ✨ button by the add box, OFF hides it.
let _smart = localStorage.getItem("ml_smart");
function smartOn(){ return _smart===null ? true : _smart==="1"; }
function setSmart(on){ _smart = on?"1":"0"; localStorage.setItem("ml_smart", _smart); render(); }
let optOpen=false, listsOpen=false, fabMoveOpen=false, settingsFrom=1;   // settingsFrom: page the Settings tab was opened from (for the ‹ back slide); 1 = Shop as of v1.87's renumber
// v1.10 bottom-first add sheet
let addOpen=false, addTab="reg", _addScrollY=0;
/* v1.44 item 5: focusing the search bar makes iOS scroll the page underneath to reveal the input, so
   the shop list is somewhere else when the sheet closes. position:fixed on <body> freezes it; the
   saved offset is restored on close. The fixed chrome still resolves against the viewport (body is
   not transformed), so nothing else moves. */
let _lockY=0, _locked=false;
/* v1.48: the offset has to be CAPTURED before the sheet's own render runs and APPLIED after it.
   pinAddSheet() calls window.scrollTo(0,0) to undo iOS's visual-viewport scroll, and since v1.47
   moved the lock to after the render, the lock was reading a scroll position that had already been
   zeroed — so closing the sheet dumped you at the top of the list instead of where you were. */
function lockPageScroll(y){ if(_locked) return; _locked=true;
  _lockY = (typeof y==="number") ? y : (window.scrollY||window.pageYOffset||0);
  const b=document.body.style; b.position="fixed"; b.top=(-_lockY)+"px"; b.left="0"; b.right="0"; b.width="100%"; }
/* v1.48: clearing the styles and RESTORING the scroll are two separate steps. Scrolling here would
   land while the document is still the collapsed one the fixed <body> left behind — the browser
   clamps to whatever fits, which is why the page came back at the top. Return the offset and let the
   caller apply it after its render has put the full-height page back. */
function unlockPageScroll(){ if(!_locked) return 0; _locked=false;
  const b=document.body.style; b.position=""; b.top=""; b.left=""; b.right=""; b.width="";
  return _lockY; }
/* v2.29: a page lock or a keyboard offset that outlived its sheet left the floating "+" halfway up the screen and the page
   unable to scroll until another page was opened (the household's screenshot). Undo both whenever nothing should hold
   them: no add sheet open or closing, no field with the keyboard up. Runs on a touch and after every render. */
function healStuck(){ let moved = false;
  if(_locked && !addOpen && !_addClosing){ const y = unlockPageScroll(); window.scrollTo(0, y); moved = true; }
  const ae = document.activeElement, typing = !!(ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA"));
  if(kbOffset > 0 && !typing && !addOpen){ kbActive = false; kbOffset = 0; applyKb(); moved = true; }
  if(moved){ uiTrail("heal"); syncZoomHeight(); } fabCheck("check"); }
if(typeof document !== "undefined") document.addEventListener("touchstart", () => { try{ healStuck(); }catch(e){} }, { passive:true, capture:true });
/* v2.32 (the household's item 12): the "+" still sat halfway up the page now and then. Its height above the bottom bar is
   set when the page is measured (syncZoomHeight); measured while the keyboard or a sheet had moved things, and not measured
   again after, it stays up there until another page is opened — which is what fixed it. So: the page is measured again
   when the keyboard closes and when the visible area changes size, a check puts the "+" back if it is out of place, and
   each time that happens it is written down with what led up to it (ml_stucklog, on this phone: Settings › Help › Screen
   log, and Report a problem can send it). */
var _uiTrail = [];   // the last few things that happened to the screen. var: boot-order rule
function uiTrail(e){ try{ _uiTrail.push((Math.round(performance.now()/100)/10) + "s " + e); if(_uiTrail.length > 12) _uiTrail.shift(); }catch(x){} }
function stuckLog(){ try{ const a=JSON.parse(localStorage.getItem("ml_stucklog")||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function fabCheck(src){ const fw=document.getElementById("shopAddFabWrap"), bb=document.getElementById("bottomnav");
  if(!fw || !bb || addOpen || fw.style.display==="none") return;
  const ae=document.activeElement; if(ae && (ae.tagName==="INPUT" || ae.tagName==="TEXTAREA")) return;   // the keyboard may be up
  const f=fw.getBoundingClientRect(), b=bb.getBoundingClientRect();
  if(!f.height || !b.height || b.top >= window.innerHeight) return;
  const gap=Math.round(b.top - f.bottom);
  if(gap <= 40) return;   // where it belongs: about 12px above the bar
  const vv=window.visualViewport;
  const entry={ t:Date.now(), v:APP_VERSION, src, gap, fab:Math.round(f.bottom), bar:Math.round(b.top), ih:window.innerHeight,
    vvh:vv?Math.round(vv.height):0, vvt:vv?Math.round(vv.offsetTop):0, sy:Math.round(window.scrollY), kb:Math.round(kbOffset||0),
    lock:!!_locked, page:["plan","shop","settings"][curPageIdx()]||"", trail:_uiTrail.slice(-8) };
  try{ const a=stuckLog(); a.unshift(entry); localStorage.setItem("ml_stucklog", JSON.stringify(a.slice(0,10))); }catch(e){}
  uiTrail("fab put back ("+gap+"px)"); syncZoomHeight(); }
/* v2.59 (the household's screen log): after the keyboard closes, an iPhone can leave the bars that are pinned to the screen
   where the keyboard pushed them — fabCheck put the "+" back, but the bottom bar stayed up, and on a page with no "+"
   (Settings) nothing was checked at all. A one-pixel scroll and back makes iOS place pinned bars again; it never jumps the
   page. Logged like the "+" so the Screen log shows it. */
function barCheck(src){ const bb=document.getElementById("bottomnav"); if(!bb) return;
  const ae=document.activeElement; if(ae && (ae.tagName==="INPUT" || ae.tagName==="TEXTAREA")) return;   // the keyboard may be up
  const vv=window.visualViewport, b=bb.getBoundingClientRect(); if(!b.height) return;
  const off = vv ? Math.round(vv.offsetTop) : 0, high = Math.round(window.innerHeight - b.bottom);
  if(off <= 0 && high <= 120) return;   // where it belongs: about 44px above the foot of the screen
  const y = window.scrollY; try{ window.scrollTo(window.scrollX, y + 1); window.scrollTo(window.scrollX, y); }catch(e){}
  try{ const a=stuckLog(); a.unshift({ t:Date.now(), v:APP_VERSION, src:"bar "+src, gap:high, bar:Math.round(b.top), ih:window.innerHeight,
    vvh:vv?Math.round(vv.height):0, vvt:off, sy:Math.round(y), page:["plan","shop","settings"][curPageIdx()]||"", trail:_uiTrail.slice(-8) });
    localStorage.setItem("ml_stucklog", JSON.stringify(a.slice(0,10))); }catch(e){}
  uiTrail("bar put back ("+high+"px)"); }
if(typeof document !== "undefined"){
  document.addEventListener("focusin", e=>{ const t=e.target; uiTrail("focus "+((t&&t.tagName)||"")+((t&&t.id)?"#"+t.id:"")); });
  document.addEventListener("focusout", e=>{ const t=e.target; uiTrail("blur "+((t&&t.tagName)||"")+((t&&t.id)?"#"+t.id:""));
    setTimeout(()=>{ try{ syncZoomHeight(); fabCheck("blur"); barCheck("blur"); }catch(x){} }, 400); });   // the keyboard has closed: measure again
  if(window.visualViewport){ let _vvT=0; window.visualViewport.addEventListener("resize", ()=>{ clearTimeout(_vvT);
    _vvT=setTimeout(()=>{ try{ uiTrail("view "+Math.round(window.visualViewport.height)); fabCheck("resize"); barCheck("resize"); }catch(x){} }, 300); }); } }
/* v1.44 item 5: everything added while the sheet is open is provisional. The return key keeps it;
   Cancel (button, scrim tap, swipe-down) takes it all back off the list. Only ids CREATED during this
   session are tracked, so an item that was already on the list before you opened the sheet is never
   removed by a cancel.
   Tradeoff: addEntries/addFromRegular call save(), so a staged item does sync to the household
   briefly and a cancel syncs the removal. Deferring save() would be a state-schema change. */
let addStaged=[];
var addFromCat = null;   // v2.37 the category of the Regulars "+" tile the add sheet was opened from. var: read at boot
function stageAdds(fn){
  const before=new Set(state.items.map(i=>i.id));
  fn();
  state.items.forEach(i=>{ if(!before.has(i.id) && !addStaged.includes(i.id)) addStaged.push(i.id); });
}
// v1.32 inline edit-item panel shown above the search bar after picking an item.
// addEditPrefix (v1.35) is the fixed text before this pick's contribution, so the search
// bar can be re-synced to "Name qty× weight, " on every live edit without re-parsing.
let addEditId=null, addEditPrefix="", addLastQuery="";
var _aeOrig=null;   // v2.65: {id,name,cat} of the item the add-sheet panel opened on
let wOpen=null;   // item id whose weight choices are expanded
/* v1.66 item 2: which slot a save is waiting on. "Save to" sits one row under "Use" and overwrites a
   saved look outright, so it asks first rather than acting on the tap. */
let appSaveAsk=null;
/* v1.68: a native colour overlay is anchored to its <input>, so ANY re-render dismisses it — not just
   the picker's own. While one is open, a render from somewhere else (a Firestore echo, a toast
   expiring) is skipped. Both the picker's `change` and its `blur` clear the flag and render once, so
   this cannot get stuck: whichever fires first ends the deferral. */
let _colorPicking=false;
/* v1.68: belt and braces. `change` and `blur` both clear the flag, but if a platform ever fired
   neither, renders would stay deferred for good and the whole app would look frozen. Any tap anywhere
   means the overlay is no longer up, so it releases the deferral and repaints once. Capture phase, so
   it runs before the tapped control's own handler decides whether to render. */
document.addEventListener("pointerdown", (e)=>{
  /* a tap inside the sample is the Done button's business — everything else means the overlay is gone */
  if(_colorPicking && !(e.target && e.target.closest && e.target.closest("#colorpeek"))) endColorPick();
}, true);
/* v1.69: a live sample of the real thing, pinned to the top of the screen while a colour picker is
   open. The platform's colour overlay covers the bottom of the display and the Settings page itself
   only shows swatches, so there was nothing on screen that answered "what does this colour DO".
   Every colour in it comes from a CSS custom property, never an inline style: v1.68 deliberately
   skips the re-render while you drag, so a sample built from markup would sit frozen while the rest
   of the page repainted. Tokens repaint on their own — the sample follows for free.
   It is mounted outside #app because a render rebuilds app.innerHTML and would throw it away. */
let _peekEl=null;
function colorPeek(on){
  if(on && !_peekEl){
    _peekEl=document.createElement("div");
    _peekEl.id="colorpeek"; _peekEl.setAttribute("aria-hidden","true");
    _peekEl.innerHTML =
      `<div class="cpk-cat"><span class="cpk-dot"></span><span class="cpk-name">Meat</span><span class="cpk-num">1/3</span>`
      + `<button type="button" class="cpk-done" id="cpkDone">Done</button></div>`
      + `<div class="cpk-row">`
      + `<span class="cpk-tile cpk-sel">🥩 Steak <i class="cpk-meta">2× 500g</i></span>`
      + `<span class="cpk-tile cpk-uns">🧀 Cheese <i class="cpk-meta">1×</i></span>`
      + `</div>`;
    document.body.appendChild(_peekEl);
    /* v1.70: wired once, here, because the sample lives outside #app and wireOptions never sees it. */
    const dn=_peekEl.querySelector("#cpkDone");
    if(dn) dn.onclick=()=>endColorPick();
  }
  document.body.classList.toggle("peek", !!on);
}
/* v1.70: the one way a pick ends — whether the overlay was dismissed, tapped away from, or finished
   with Done. Applying a colour never comes through here; only leaving the picker does. Guarded so the
   several routes that can all fire for one dismissal rebuild the page once, not three times. */
function endColorPick(){
  if(!_colorPicking) return;
  _colorPicking=false; colorPeek(false); render();
}
// v1.11 done-shopping dialog
let finishOpen=false;
// A18 ✨ Smart add (planning-mode AI parse → preview → confirm)
let smartOpen=false, smartLoading=false, smartError="", smartItems=[], smartEdit=null;
var smartWOpen=null, smartCOpen=null;   // v2.67: the review editor's open Measure / Category row (an index)
// B3 recipe → list (text-first): pours extracted ingredients into the shared Smart-add preview
let smartServings=null;
let smartTitle="";
let view="detail", listActOpen=false, listActCode=null, newListOpen=false, newListDraft="", diagOpen=false, diagPredExpand=new Set(), diagPredSort="az";
// v1.21 restore the last page the user was on across app restarts (item 5). optOpen is declared above; view/optOpen are ignored until onboarding completes.
/* v1.87: page indexes moved a second time when the Lists page went, so the key is versioned again —
   a stored 0 used to mean Lists and now means Plan, which is exactly the kind of silent wrong-page
   landing this avoids. An absent key lands on the shop, which is where a first launch belongs. */
(()=>{ try{ const lv=localStorage.getItem("ml_lastview3");
  if(lv==="0") view="plan"; else if(lv==="2") optOpen=true; else view="detail"; }catch(e){} })();
function listCount(code){ try{ const s = (code===listCode) ? state : JSON.parse(localStorage.getItem("ml_cache_"+code)||"null"); return (s&&s.items)? s.items.filter(i=>!i.checked).length : 0; }catch(e){ return 0; } }
function listStats(code){ try{ const s=(code===listCode)?state:JSON.parse(localStorage.getItem("ml_cache_"+code)||"null"); const items=(s&&s.items)||[]; const total=items.length, done=items.filter(i=>i.checked).length; return {total, done, pct: total?Math.round(done/total*100):0}; }catch(e){ return {total:0,done:0,pct:0}; } }
function listURL(code){ let k=""; try{ k=localStorage.getItem("ml_jk_"+code)||""; }catch(e){}   // v2.44: the join key rides along when this phone knows it
  return location.origin + location.pathname + "?list=" + code + (k ? "&k=" + encodeURIComponent(k) : ""); }
function renameListCode(code){ const a=getLists(); const l=a.find(x=>x.code===code); const name=prompt("Rename this list:", (l&&l.name)||"Groceries"); if(name===null) return;
  const nm=(name||"").trim()||"Groceries"; rememberList(code, nm);
  if(code===listCode){ state.name=nm; save(); } listActOpen=false; render(); }
function shareListCode(code){ const url=listURL(code); listActOpen=false;
  if(hasShare()){ share({title:"Market List", text:"Join our shared grocery list", url}).catch(()=>{}); render(); }
  else if(hasClipboard()){ copyText(url); showToast("Link copied"); }
  else { showToast("Copy from the address bar"); } }
function copyListCode(code){ const url=listURL(code); listActOpen=false;
  if(hasClipboard()){ copyText(url); showToast("Link copied"); } else { showToast("Copy from the address bar"); } }
function duplicateListCode(code){
  let src; try{ src = (code===listCode) ? state : JSON.parse(localStorage.getItem("ml_cache_"+code)||"null"); }catch(e){ src=null; }
  listActOpen=false;
  if(!src || !src.items){ showToast("Open this list once before duplicating"); render(); return; }
  const base=(getLists().find(x=>x.code===code)||{}).name || src.name || "List";
  const newCode=newListCode(), newName=base+" copy";
  const dup={
    items:(src.items||[]).map(i=>({...i, id:uid(), checked:false, checkedBy:null})),
    buyAgain:(src.buyAgain||[]).map(b=>({...b})),
    stores:(src.stores||[]).map(s=>({...s})),
    storeMeta:src.storeMeta?{...src.storeMeta}:{},
    members:(me?[me]:[]),
    categories:src.categories?JSON.parse(JSON.stringify(src.categories)):null,
    name:newName,
    baMeta:src.baMeta?{...src.baMeta}:{label:"Buy again",emoji:"↩",img:"",pos:99}
  };
  rememberList(newCode, newName);
  switchList(newCode);
  state=dup; resetItemSigs(); ensureCats(); save(); render();
  showToast(tf("Duplicated as “{x}”", { x:newName }));
}
function delListUndo(code){ const a=getLists(); const i=a.findIndex(x=>x.code===code); if(i<0){ listActOpen=false; render(); return; }
  const removed=a[i]; a.splice(i,1); saveLists(a); listActOpen=false;
  goneMark(code); acctWrite({ gone:{ [code]:Date.now() } });   // v2.56 item 6: stays removed
  /* v2.32 (item 4): removing the list that was open left its name at the top with nothing behind it. The first list left
     opens instead (Undo brings the removed one back and opens it again); with none left, the app starts afresh. */
  const wasOpen = code===listCode;
  if(wasOpen){ if(a.length) switchList(a[0].code); else { localStorage.removeItem(LS_LASTLIST); location.href=location.pathname; return; } }
  toast="“"+(removed.name||"List")+"” removed"; toastAction={ label:"Undo", fn:()=>{ const b=getLists(); b.splice(Math.min(i,b.length),0,removed); saveLists(b);
    goneClear(code); acctWrite({ lists:{ [code]:{ name:removed.name||"Groceries", ts:Date.now() } } });   // v2.56 item 6: a later ts re-adds it
    toast=null; toastAction=null; clearTimeout(_toastT); if(wasOpen) switchList(removed.code); else render(); } };
  render(); clearTimeout(_toastT); _toastT=setTimeout(()=>{ toast=null; toastAction=null; render(); }, 5000); }
/* v1.51 — per-list history. Deliberately NOT part of `state`: the synced document's schema is fixed,
   and an append-only log shared between phones would need its own merge rules in save()/subscribe()
   (two shoppers adding at once must not clobber each other's entries). Keeping it in localStorage
   means it is honest about what it is — what happened to this list on this device — and it cannot
   affect sync. Newest first, capped so a long-running list cannot fill the quota. */
const HIST_CAP = 400;
const HIST_LABEL = { add:"added", rm:"removed", buy:"bought", regadd:"saved to Regulars",
                     regrm:"removed from Regulars", del:"deleted" };
function histKey(code){ return "ml_hist_" + code; }
function histRead(code){ try{ const a=JSON.parse(localStorage.getItem(histKey(code))||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function histLog(action, name, code){
  if(!name) return;
  const c = code || listCode;
  try{
    const a = histRead(c);
    a.unshift({ t:Date.now(), a:action, n:String(name).slice(0,60), by:(typeof me!=="undefined"&&me)?me:"" });
    localStorage.setItem(histKey(c), JSON.stringify(a.slice(0,HIST_CAP)));
  }catch(e){}
}
function histClear(code){ try{ localStorage.removeItem(histKey(code)); }catch(e){} }
function getLists(){ try{ return JSON.parse(localStorage.getItem("ml_lists")||"[]"); }catch(e){ return []; } }
function saveLists(a){ localStorage.setItem("ml_lists", JSON.stringify(a)); }
/* v2.13: the Sandbox was created as "🧪 Sandbox" until now; the household asked for the test tube to go.
   Renames a list still carrying that exact name, wherever the list is loaded from (cache or sync). */
function dropTube(){ if(!/^🧪\s*Sandbox$/u.test(String(state && state.name || ""))) return false;
  state.name="Sandbox"; try{ rememberList(listCode, "Sandbox"); }catch(e){} return true; }
/* v2.56 item 6: a list removed on this phone stays removed — the home-screen address (?list=) and the account sync
   would otherwise bring it back. ml_gonelists: code → when it was removed (ms). Opening or joining it on purpose clears it. */
function goneGet(){ try{ const o=JSON.parse(localStorage.getItem("ml_gonelists")||"{}"); return (o && typeof o==="object" && !Array.isArray(o)) ? o : {}; }catch(e){ return {}; } }
function goneMark(code){ const o=goneGet(); o[code]=Date.now(); try{ localStorage.setItem("ml_gonelists", JSON.stringify(o)); }catch(e){} }
function goneClear(code){ const o=goneGet(); if(!(code in o)) return; delete o[code]; try{ localStorage.setItem("ml_gonelists", JSON.stringify(o)); }catch(e){} }
function rememberList(code,name){ goneClear(code); const a=getLists(); const i=a.findIndex(x=>x.code===code);
  if(i>=0){ if(name && a[i].name!==name){ a[i].name=name; saveLists(a); if(!_acctQuiet) acctWrite({ lists:{ [code]:{ name, ts:Date.now() } } }); } }   // v2.40: the account keeps the name
  else { a.push({code, name:name||"Groceries"}); saveLists(a); if(!_acctQuiet) acctWrite({ lists:{ [code]:{ name:name||"Groceries", ts:Date.now() } } }); } }   // v2.40: and the new list
function newListPrompt(){ listsOpen=false; newListOpen=true; newListDraft=""; render(); }
function newListSheet(){ return `<div class="sheet-bg kbpin" id="newListBg"><div class="sheet" id="newListSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${t("New list")}</div>
    <div style="display:flex;gap:8px;align-items:stretch">
      <input id="newListName" placeholder="${t("List name")}" value="${esc(newListDraft)}" autocomplete="off" style="flex:1;min-width:0;height:48px;padding:0 14px;border-radius:14px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:16px" />
      <button id="newListCreate" style="flex:none;padding:0 18px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${t("Create")}</button>
    </div></div></div>`; }
function createNewListFromSheet(){ const nm=(newListDraft||"").trim()||"Untitled list"; const code=newListCode();
  rememberList(code, nm); newListOpen=false; newListDraft=""; _freshList=code; switchList(code); view="detail"; shopMode=false; save(); render(); }
// Re-load the per-list learning stores after listCode changes, so the AI shop order and
// restock cadence (and the diagnostics that show them) reflect the now-active list.
function reloadLearn(){
  aiOrder=loadLearn("ml_aiorder"); aiItems=loadLearn("ml_aiitems"); aiItemsApplied=loadLearn("ml_aiitemsapplied");
  aiApplied=loadLearn("ml_aiapplied"); aiDismiss=loadLearn("ml_aidismiss");
  purch=loadLearn("ml_purch"); predictSeen=loadLearn("ml_predict_seen");
  _aiTripCats=[]; _aiTripItems=[];
}
/* v1.91: the page you were on survives the switch. `view="detail"` below was unconditional, so
   picking another list from the switcher on the Plan page dropped you onto Shop — the switcher is
   reachable from both pages since v1.87, so it has to leave you where it found you. Captured before
   the early return, so the "same list" path is covered too. */
function switchList(code){ const wasPlan = (view==="plan"); listsOpen=false; if(code===listCode){ render(); return; }
  listCode=code; localStorage.setItem(LS_LASTLIST, code);
  LS = { me:"ml_me", collapse:"ml_collapse_"+code, cache:"ml_cache_"+code };
  reloadLearn();
  try{ collapse = JSON.parse(localStorage.getItem(LS.collapse) || '{"cats":[],"ba":false}'); }catch(e){ collapse={cats:[],ba:false}; }
  collapse.checked = false;   // v2.10: the cart always opens folded; a tap unfolds it for the session
  state = { items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:[], categories:null, name:(getLists().find(l=>l.code===code)||{}).name||"", baMeta:{label:"Buy again",emoji:"↩",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]}, prices:{}, aisle:{}, memb:{}, shopping:{}, templates:[], spend:[], looks:{}, aislemap:{}, itemTomb:{}, parts:[], clr:{}, mv:0 };
  try{ const c=JSON.parse(localStorage.getItem(LS.cache) || "null"); if(c){ state=c; dropTube(); aiAdopt(); } }catch(e){}
  resetItemSigs();
  if(!state.purch || typeof state.purch!=="object") state.purch={};
  state.purch = purchMerge(state.purch, purch);   // fold any legacy per-device history into the shared copy
  purch = state.purch;
  ensureCats(); editing=null; quickEdit=null; view = wasPlan ? "plan" : "detail"; shopMode=false;
  if(typeof history!=="undefined" && history.replaceState){ try{ history.replaceState(null, "", location.pathname+"?list="+code); }catch(e){} }
  subscribe(); render(); }
function renameList(){ const name=prompt("Rename this list:", state.name||"Groceries"); if(name===null) return;
  state.name=(name||"").trim()||"Groceries"; rememberList(listCode, state.name); save(); render(); }
function moveList(code,dir){ const a=getLists(); const i=a.findIndex(x=>x.code===code); const j=i+dir;
  if(i<0||j<0||j>=a.length) return; const t=a[i]; a[i]=a[j]; a[j]=t; saveLists(a); render(); }
function delList(code){ const a=getLists(); const l=a.find(x=>x.code===code);
  if(!confirm(`Remove "${(l&&l.name)||'this list'}" from your lists?\n\nThe list itself isn't deleted — you can re-add it later with its share link.`)) return;
  const b=a.filter(x=>x.code!==code); saveLists(b);
  goneMark(code); acctWrite({ gone:{ [code]:Date.now() } });   // v2.56 item 6: stays removed
  if(code===listCode){ if(b.length){ switchList(b[0].code); } else { localStorage.removeItem(LS_LASTLIST); location.href=location.pathname; } }
  else { render(); } }
let soundOn = localStorage.getItem("ml_sound")==="1";
let __ac=null;
function playTick(up){ if(!soundOn) return;
  try { __ac = __ac || new (window.AudioContext||window.webkitAudioContext)(); if(__ac.state==="suspended") __ac.resume();
    const o=__ac.createOscillator(), g=__ac.createGain(); o.type="triangle"; o.frequency.value = up===false ? 392 : 880;
    g.gain.setValueAtTime(0.0001,__ac.currentTime); g.gain.exponentialRampToValueAtTime(0.18,__ac.currentTime+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001,__ac.currentTime+0.12);
    o.connect(g); g.connect(__ac.destination); o.start(); o.stop(__ac.currentTime+0.13);
  } catch(e){} }
function toggleSound(){ soundOn=!soundOn; localStorage.setItem("ml_sound", soundOn?"1":"0"); render(); }
function playPlan(add){ if(!soundOn) return;
  try { __ac = __ac || new (window.AudioContext||window.webkitAudioContext)(); if(__ac.state==="suspended") __ac.resume();
    const o=__ac.createOscillator(), g=__ac.createGain(), t=__ac.currentTime; o.type="triangle";
    if(add){ o.frequency.setValueAtTime(587,t); o.frequency.exponentialRampToValueAtTime(988,t+0.11); }   // adding: rising
    else { o.frequency.setValueAtTime(523,t); o.frequency.exponentialRampToValueAtTime(294,t+0.13); }      // buy again: falling
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.16,t+0.006);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
    o.connect(g); g.connect(__ac.destination); o.start(); o.stop(t+0.17);
  } catch(e){} }
let lastPop=null;

let state = { items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:[], categories:null, name:"", baMeta:{label:"Buy again",emoji:"↩",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]}, prices:{}, aisle:{}, memb:{}, shopping:{}, templates:[], spend:[], looks:{}, aislemap:{}, itemTomb:{}, parts:[], clr:{}, mv:0 };
rememberList(listCode);
try { const c = JSON.parse(localStorage.getItem(LS.cache) || "null"); if(c){ state = c; dropTube(); aiAdopt(); } } catch(e){}
resetItemSigs();
if(!state.purch || typeof state.purch!=="object") state.purch={};
state.purch = purchMerge(state.purch, purch);   // fold any legacy per-device history into the shared copy
purch = state.purch;
if(shopMode && !(state.items||[]).length){ shopMode=false; }   // nothing to shop — open on Plan
let toast=null, toastAction=null, undoSnap=null, _toastT=null, catEntry=null, editing=null, configured=false;
let editCatOpen=false, editSubOpen=false;   // v1.26 collapsible Category / Subcategory sections in the edit sheet
var editNoteOpen=false, _editFoldKey="", _aeFoldKey="";   // v2.57 item 9: the Note section; which edit was last shown folded. var: boot-order rule
/* v2.57 item 9a: an edit always opens folded — when the edit shown is not the one shown last, every section closes */
function editFold(key){ if(key!==_editFoldKey){ _editFoldKey=key; editCatOpen=editSubOpen=editWhereOpen=editNoteOpen=false; } }
function aeFold(key){ if(key!==_aeFoldKey){ _aeFoldKey=key; editCatOpen=editSubOpen=editWhereOpen=editNoteOpen=false; } }
/* v2.57 item 9d: note suggestions — notes used before for this name (items and Regulars), then NOTE_HINTS for its stem */
function noteParts(n){ return String(n||"").split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean); }
function noteSuggest(name){ const nm=String(name||"").trim().toLowerCase(); if(!nm) return [];
  const seen=new Set(), out=[];
  const add=x=>{ const k=x.toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(x); } };
  const used=[]; [...(state.items||[]), ...(state.buyAgain||[])].forEach(i=>{ if(i && String(i.name||"").trim().toLowerCase()===nm) noteParts(i.note).forEach(x=>used.push(x)); });
  used.forEach(add);   // v2.68: every part learned from this name's Regulars and items, first
  const stem=Object.keys(NOTE_HINTS).sort((a,b)=>b.length-a.length).find(k=>new RegExp("(^|[^a-z])"+k+"(e?s)?($|[^a-z])").test(nm));
  if(stem) NOTE_HINTS[stem].forEach(add);
  return out.slice(0,12); }
function noteToggle(note, chip){ const ps=noteParts(note), i=ps.findIndex(x=>x.toLowerCase()===chip.toLowerCase());
  if(i>=0) ps.splice(i,1); else ps.push(chip); return ps.join(", ").slice(0,140); }
/* the Note section, shared by both editors: attr names the data attributes each one wires.
   v2.68 (the household): the parts of the note that are suggestions show as SELECTED chips, always visible, under the field;
   the field holds only the rest (free text). The stored note = the selected parts, in order, then the free text. */
function noteSecHTML(note, name, a){
  /* v2.70 (the household): one wrapping line of tiles — every part of the note is a chosen tile (tap to remove, ×), then a
     small pencil entry; typed text becomes tiles at a comma, Enter or leaving the field. Unchosen suggestions show below
     while the entry has focus. The stored note = the chosen tiles in order, plus anything still in the entry. */
  const sg=noteSuggest(name), sgL=sg.map(x=>x.toLowerCase());
  const parts=noteParts(note), selL=parts.map(x=>x.toLowerCase());
  const chip=(x,on)=>noteChipHTML(a.chip, x, on, sgL.includes(x.toLowerCase()));
  return `<div class="ednotewrap" data-chipattr="${a.chip}"><div class="editsec edrow ednote"><span class="editsec-l">${t("Note")}</span><div class="edchips ednotesel">${parts.map(x=>chip(x,true)).join("")}<span class="ednotefree">${PENCIL_SVG(14)}<input ${a.input} class="edval ednotein" value="" maxlength="140" placeholder="${t("Add note")}" aria-label="${t("Note")}"></span></div></div>
      ${sg.length ? `<div class="edchips ednotechips">${sg.filter(x=>!selL.includes(x.toLowerCase())).map(x=>chip(x,false)).join("")}</div>` : ""}</div>`; }
function noteChipHTML(attr, x, on, isSg){ return `<button class="catchip${on?' on':''}${isSg?' ednote-sg':''}" ${attr}="${esc(x)}" aria-pressed="${on}">${esc(x)}<span class="ednotex" aria-hidden="true">×</span></button>`; }
function noteChipVal(c){ return c.getAttribute(c.closest(".ednotewrap").dataset.chipattr)||""; }
/* v2.68: the note as the editor shows it — the chosen tiles, in order, then the entry's text not yet made a tile */
function noteFromWrap(w){ if(!w) return "";
  const sel=[...w.querySelectorAll(".ednotesel .catchip")].map(noteChipVal);
  const inp=w.querySelector(".ednotein");
  return [...sel, ...noteParts(inp ? inp.value : "")].join(", ").slice(0,140); }
/* v2.65: a note chip toggles in place — no re-render, so the field keeps focus and the keyboard stays up.
   v2.70: a chosen tile is removed (a suggestion goes back below); a suggestion becomes a chosen tile before the entry */
function noteChipTap(b){ const w=b.closest(".ednotewrap"); if(!w) return "";
  const on=!b.classList.contains("on");
  if(!on && !b.classList.contains("ednote-sg")){ b.remove(); return noteFromWrap(w); }
  b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  const dst=w.querySelector(on ? ".ednotesel" : ".ednotechips");
  if(dst){ if(on) dst.insertBefore(b, dst.querySelector(".ednotefree")); else dst.insertBefore(b, dst.firstChild); }
  return noteFromWrap(w); }
/* v2.70: the entry's text becomes tiles — split on commas; a part matching a suggestion selects it, one already chosen is
   skipped. keep: text after the last comma stays in the entry (typing a comma). wire(b) attaches a new tile's tap. */
function noteCommit(inp, wire, keep){ const w=inp.closest(".ednotewrap"); if(!w) return "";
  let txt=inp.value, rest="";
  if(keep){ const k=txt.lastIndexOf(","); if(k<0) return noteFromWrap(w); rest=txt.slice(k+1); txt=txt.slice(0,k); }
  const sel=w.querySelector(".ednotesel"), free=w.querySelector(".ednotefree"), attr=w.dataset.chipattr;
  noteParts(txt).forEach(x=>{ const xl=x.toLowerCase();
    if([...sel.querySelectorAll(".catchip")].some(c=>noteChipVal(c).toLowerCase()===xl)) return;
    const sg=[...w.querySelectorAll(".ednotechips .catchip")].find(c=>noteChipVal(c).toLowerCase()===xl);
    if(sg){ noteChipTap(sg); return; }
    const tmp=document.createElement("div"); tmp.innerHTML=noteChipHTML(attr, x, true, false);
    const b=tmp.firstChild; sel.insertBefore(b, free); if(wire) wire(b); });
  inp.value=rest.replace(/^\s+/,"");
  return noteFromWrap(w); }
var editWhereOpen=false, elseOpen=false;   // v2.22 the edit sheet's "Where to buy" section; the Shop page's "For other shops". var: renders read them at boot
/* v2.22 R17 where to buy it. "Away" is the shop you are at — a real saved store, not Home or an unknown place — and an
   item for ANOTHER shop is not "here". At home nothing is away, so everything is here. */
function awayStoreId(){ const s=activeStore(); return (s && s.id && isRealStore(s.id)) ? s.id : ""; }
/* v2.35 (the household's item 2): an item can be for several shops — `where` holds their ids joined by commas, so every
   place that copies an item keeps them without a change of shape */
function whereIds(i){ return String((i && i.where) || "").split(",").map(s=>s.trim()).filter(Boolean); }
function whereNames(ids){ return ids.map(w=>(storeById(w)||{}).name).filter(Boolean); }
function listHere(i){ const a=awayStoreId(), w=whereIds(i); return !a || !w.length || w.includes(a); }
/* v2.22 R16/R17 the tile's second line: which shop it is for (unless you are there) and its note */
function noteLine(i){ const a=awayStoreId(), w=whereIds(i), names=(a && w.includes(a)) ? [] : whereNames(w);
  return [names.join(" or "), String(i.note||"").trim()].filter(Boolean).join(" · "); }
/* the same, for text that leaves the app (share, export) */
function noteSuffix(i){ const names=whereNames(whereIds(i)), n=String(i.note||"").trim();
  return (names.length ? " ("+names.join(" or ")+")" : "") + (n ? " — "+n : ""); }
/* v2.23 R19 who is shopping now. Opt-in, per phone (ml_sayshop): while you tick things off at a real shop, the list says
   so — the shop's name and when, nothing else — and finishing the shop takes it away. The others see it for 90 minutes. */
const SHOPPING_MS = 90*60*1000;
function sayShopOn(){ try{ return localStorage.getItem("ml_sayshop")==="1"; }catch(e){ return false; } }
function shoppingMark(){ const a=awayStoreId(); if(!sayShopOn() || !a || !me) return;
  const st=storeById(a), now=Date.now(), s={};
  for(const [k,v] of Object.entries(state.shopping||{})) if(v && now-(+v.at||0) < SHOPPING_MS) s[k]=v;   // old ones are dropped as we go
  s[me]={ store:(st&&st.name)||"a shop", at:now }; state.shopping=s; }
function shoppingClear(){ if(state.shopping && me && state.shopping[me]){ const s=Object.assign({}, state.shopping); delete s[me]; state.shopping=s; } }
function shoppingHTML(){ const s=state.shopping||{}, now=Date.now();
  const who=Object.keys(s).filter(m=>m!==me && s[m] && now-(+s[m].at||0) < SHOPPING_MS);
  if(!who.length) return "";
  return `<div class="shopnow" role="status">${who.map(m=>{ const mins=Math.max(1, Math.round((now-s[m].at)/60000));
    return `<span>${esc(m)} is shopping at ${esc(String(s[m].store||"a shop"))} · ${mins<60?`${mins} min`:`${Math.floor(mins/60)} h ${mins%60} min`} ago</span>`; }).join("")}</div>`; }
/* v2.23 R21 lists for occasions. What is still to buy, saved under a name, dropped into the list another time — an item
   already on the list gets the larger quantity instead of a second tile. */
var occSheet = null;   // null | { mode:"save", name:"" } | { mode:"add" }. var: render() reads it at boot
function occSave(name){ const nm=String(name||"").trim().slice(0,40); if(!nm) return;
  const items=state.items.filter(i=>!i.checked).slice(0,150).map(i=>({ name:i.name, cat:i.cat, qty:i.qty||1, weight:i.weight||"", note:i.note||"", where:i.where||"" }));
  if(!items.length){ showToast("Nothing to save — the list is empty"); return; }
  const t=(Array.isArray(state.templates)?state.templates:[]).filter(x=>String(x.name||"").toLowerCase()!==nm.toLowerCase());
  t.unshift({ id:uid(), name:nm, at:Date.now(), items }); state.templates=t.slice(0,30);
  occSheet=null; save(); render(); showToast(tf("Saved “{x}”", { x:nm }) + " · " + (items.length===1 ? tf("{n} item", { n:1 }) : tf("{n} items", { n:items.length }))); }
function occAdd(id){ const t=(state.templates||[]).find(x=>x.id===id); if(!t) return; let n=0; const prev=snapState();   // a whole occasion at once, so it can be undone
  for(const x of t.items){ const ex=state.items.find(i=>!i.checked && String(i.name||"").toLowerCase()===String(x.name).toLowerCase());
    if(ex){ ex.qty=Math.max(+ex.qty||1, +x.qty||1); markDirty(ex.id); }
    else { state.items.push({ id:uid(), name:x.name, qty:x.qty||1, cat:newCat(x.cat, x.name), weight:x.weight||"", sub:"", note:x.note||"", where:x.where||"", checked:false, by:me }); n++; } }
  occSheet=null; save(); render(); showUndo(prev, tf("Added {n} from “{x}”", { n, x:t.name }) + (n<t.items.length ? " · " + tf("{n} already on the list", { n:t.items.length-n }) : "")); }
function occDelete(id){ const prev=snapState(); const t=(state.templates||[]).find(x=>x.id===id); if(!t) return;
  state.templates=(state.templates||[]).filter(x=>x.id!==id); save(); render(); showUndo(prev, tf("“{x}” deleted", { x:t.name })); }   // the toast is escaped where it is drawn
function occSheetHTML(){ const o=occSheet; if(!o) return ""; const ts=Array.isArray(state.templates)?state.templates:[];
  const body = o.mode==="save"
    ? `<div class="hint" style="text-align:left;margin:0 0 10px">${(n=>n===1?tf("What is still to buy ({n} item), saved under a name — a BBQ, camping, Christmas — to drop into the list another time.",{ n }):tf("What is still to buy ({n} items), saved under a name — a BBQ, camping, Christmas — to drop into the list another time.",{ n }))(state.items.filter(i=>!i.checked).length)}</div>
       <input id="occName" value="${esc(o.name||"")}" maxlength="40" placeholder="${t("Name it — “BBQ”")}" aria-label="${t("Occasion name")}" style="width:100%;box-sizing:border-box;height:46px;padding:0 12px;border-radius:12px;border:none;outline:none;background:var(--chip);color:var(--text);font-size:16px" />
       <div class="ppedbtns"><button class="newlist" id="occSaveGo">${t("Save")}</button><button class="optaction" id="occClose" style="margin-top:0">${t("Cancel")}</button></div>`
    : `<div class="hint" style="text-align:left;margin:0 0 10px">${t("An occasion is a set of things you buy together — a BBQ, camping, Christmas. Save one from the list once; next time, Add puts all of it back on the list in one tap.")}</div>` + (ts.length ? `<div class="occrows">${ts.map(o=>`<div class="occrow"><span class="occ-n">${esc(o.name)}<span class="occ-s">${o.items.length===1 ? t("1 item") : tf("{n} items", { n:o.items.length })}</span></span>
         <button class="storechip" data-occadd="${esc(o.id)}">${t("Add")}</button><button class="storechip" data-occdel="${esc(o.id)}" aria-label="${esc(tf("Delete {name}", { name:o.name }))}">${BIN_SVG(14)}</button></div>`).join("")}</div>`
       : `<div class="hint" style="text-align:left;margin:0">${t("None saved yet.")}</div>`)
      + `<button class="optaction" id="occToSave">${SAVE_SVG(16)} ${t("Save what's on the list now as an occasion")}</button>
         <div style="display:flex;gap:8px;margin-top:12px"><button class="optaction" id="occClose" style="margin-top:0">${t("Close")}</button></div>`;
  return `<div class="sheet-bg kbpin" id="occBg"><div class="sheet" id="occSheet" role="dialog" aria-labelledby="occTitle">
    <div class="disp" id="occTitle" style="font-weight:800;font-size:17px;margin-bottom:6px">${o.mode==="save"?t("Save as an occasion"):t("Add an occasion")}</div>${body}</div></div>`; }
function wireOcc(){
  const sv=app.querySelector("#optOccSave"); if(sv) sv.onclick=()=>{ occSheet={mode:"save", name:""}; render(); };
  const ad=app.querySelector("#optOccAdd"); if(ad) ad.onclick=()=>{ occSheet={mode:"add"}; render(); };
  const nm=app.querySelector("#occName"); if(nm){ nm.oninput=e=>{ if(occSheet) occSheet.name=e.target.value; }; nm.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); occSave(nm.value); } }; }
  const go=app.querySelector("#occSaveGo"); if(go) go.onclick=()=>occSave((app.querySelector("#occName")||{}).value);
  app.querySelectorAll("[data-occadd]").forEach(b=>b.onclick=()=>occAdd(b.dataset.occadd));
  app.querySelectorAll("[data-occdel]").forEach(b=>b.onclick=()=>occDelete(b.dataset.occdel));
  const ts2=app.querySelector("#occToSave"); if(ts2) ts2.onclick=()=>{ occSheet={mode:"save", name:""}; render(); };   // v2.32
  const c=app.querySelector("#occClose"); if(c) c.onclick=()=>{ occSheet=null; render(); };
  const bg=app.querySelector("#occBg"); if(bg) bg.onclick=e=>{ if(e.target===bg){ occSheet=null; render(); } };
}
let draftMain="", draftCatText="", pendingSubFocus=null, quickEdit=null;

const ALL_PICS = ["milk.png","cross.png","ramen.png","hammer.png"];
function pictureChoices(catId){ const def = DEFAULT_CAT_IMG[catId] || ALL_PICS[0];
  return [def, ...ALL_PICS.filter(p=>p!==def)]; }
function ensureCats(){
  if(!Array.isArray(state.categories) || !state.categories.length){
    state.categories = (_freshList && _freshList===listCode ? CATS13 : DEFAULT_CATS).map(c=>({id:c.id,label:c.label,color:c.color,emoji:c.emoji,   // v2.33: a new list starts with the thirteen
      subs: c.id==="meat" ? MEAT_DEFAULT_SUBS.map(s=>({...s})) : [] }));
  }
  const DEF_IMG = DEFAULT_CAT_IMG;
  state.categories.forEach(c=>{
    if(!Array.isArray(c.subs)){ c.subs = c.id==="meat" ? MEAT_DEFAULT_SUBS.map(s=>({...s})) : []; }
    if(c.img===undefined && DEF_IMG[c.id]){ c.img = DEF_IMG[c.id]; }   // seed default picture icons
  });
}
function catList(){ ensureCats(); return state.categories; }
function CAT(id){ return catList().find(c=>c.id===id) || DEFAULT_CATS.find(c=>c.id===id) || CATS13.find(c=>c.id===id) || DEFAULT_CATS[DEFAULT_CATS.length-1]; }
/* v2.17: the category an item is SHOWN under. An item whose category is gone (another phone removed it while this
   one added to it, or older data) shows under Others — or the last category, if Others itself was removed —
   instead of vanishing from the list while still counted in "N to buy". Display only: the stored category is left
   alone, so nothing is rewritten while the categories may still be arriving. var, not let: boot-order rule. */
var _catShownMemo = null;
function catShown(id){ const cs=(Array.isArray(state.categories) && state.categories.length) ? state.categories : catList();   // catList() re-checks every category per call; this runs per item per category
  if(!_catShownMemo || _catShownMemo.cs!==cs || _catShownMemo.n!==cs.length)
    _catShownMemo={ cs, n:cs.length, ids:new Set(cs.map(c=>c.id)), fb:((cs.find(c=>c.id==="others")||cs[cs.length-1])||{}).id };
  return _catShownMemo.ids.has(id) ? id : _catShownMemo.fb; }
const DARK_VARIANTS = { "ramen.png":"ramen-dark.png" };
function catIcon(cat, s){ s=s||16;
  if(!catEmojiOn()) return "";                               // v1.16 hide category icons entirely when off — emoji AND images (fresh/asian)
  if(iconStyle()==="drawn" && cat && CAT_IDS.has(cat.id)) return `<span class="cdraw" style="color:${autoShade("cat", cat.color)};width:${s+2}px;height:${s+2}px">${catMarkSVG(cat.id)}</span>`;
  if(cat && cat.img){
    return `<img class="cicon" src="${esc(dispImg(cat.img))}" style="width:${s}px;height:${s}px" alt="" />`; }
  return `<span style="font-size:${(s-1)}px;line-height:1">${(cat&&cat.emoji)||"🛒"}</span>`; }
const ICON_PRESETS = [
  {img:"milk.png"},{img:"cross.png"},{img:"ramen.png"},{img:"hammer.png"},
];
function presetHTML(cur){
  const imgs = ICON_PRESETS.map(p=>`<button class="iconopt ${cur===p.img?'sel':''}" data-icon="${p.img}"><img src="${esc(dispImg(p.img))}" alt=""/></button>`).join("");
  return imgs;
}
function emojiGridHTML(cur, filter){
  const f=(filter||"").toLowerCase().trim();
  const list = f ? EMOJI_LIB.filter(x=>x.k.includes(f)||x.e===f) : EMOJI_LIB;
  return list.map(x=>`<button class="iconopt ${cur===x.e?'sel':''}" data-emoji="${x.e}">${x.e}</button>`).join("");
}
function iconPickerHTML(){
  const curImg = editing.img||""; const curEmoji = editing.img?"":(editing.emoji||"");
  return `<div style="margin-top:14px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Icon</div>
    <div class="icongrid" id="presetRow">${presetHTML(curImg)}
      <button class="iconopt" id="uploadOpt" title="Upload">⬆️</button>
    </div>
    <input id="iconSearch" placeholder="Search emoji (milk, tool, wine…)" style="width:100%;margin-top:8px;padding:9px 12px;border-radius:12px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:14px" />
    <div class="icongrid" id="emojiGrid">${emojiGridHTML(curEmoji,"")}</div>
    <input id="iconFile" type="file" accept="image/*" style="display:none" />`;
}
/* an item's subcategory within its category: explicit item.sub if valid, else keyword guess for meat, else null */
function effectiveSub(item, cat){
  if(!cat || !cat.subs || !cat.subs.length) return null;
  if(item.sub && cat.subs.some(s=>s.id===item.sub)) return item.sub;
  if(cat.id==="meat"){ const g=meatSub(item.name); return cat.subs.some(s=>s.id===g) ? g : null; }
  return null;
}

/* dynamic label→id map so renamed categories still parse on paste */
function labelMap(){ const m={}; DEFAULT_CATS.forEach(c=>m[c.label.toLowerCase()]=c.id); CATS13.forEach(c=>m[c.label.toLowerCase()]=c.id);
  catList().forEach(c=>m[c.label.toLowerCase()]=c.id);
  Object.assign(m,{veg:"vegetable",vegetables:"vegetable",veggies:"vegetable",fruits:"fruit"}); return m; }
function parseInput(text){ return parseLines(text, labelMap()); }   // v2.46: the parser is js/parse.js

/* ---- Firebase ---- */
/* v2.49 (architecture review S9): the list document carries the shape's version. A phone running an older app that sees a
   NEWER version stops writing (it would overwrite fields it does not know) and asks to be updated. The next data-shape
   change (v2.51, items saved one by one) raises it.
   v2.51: version 2 — items carry `ts` and removals `itemTomb`; a v2.49/v2.50 phone seeing v2 stops writing and asks to update.
   v2.58: version 3 — the items live in items/{id} (the list record names it in `parts`); a phone on v2.49–v2.57 seeing 3 stops
   writing ("Update now"). Lists not yet split keep being written as v:2 — so save() writes `v: splitOn() ? 3 : 2`, never LIST_V blindly.
   v2.75: version 4 — Regulars, prices and spending live in records too (regulars/{rid}, prices/{pid}, spend/{sid}, named in
   `parts`); a phone on v2.58–v2.74 seeing 4 stops writing ("Update now"), so none of them writes Regulars into the record's
   old array, which nobody reads any more. save() writes 4 once any of the three has moved, else 3 (split) or 2. */
const LIST_V = 4;
function splitOn(){ return (state.parts||[]).includes("items") && canSplit(); }
/* v2.75 (S8 step 3): the parts that move after the items, and whether one has moved on this list */
const MOVED_PARTS = ["regulars", "prices", "spend"];
function partOn(n){ return (state.parts||[]).includes(n) && canSplit(); }
/* v2.75: a record id from a key — the same on every phone. Firestore forbids "/" and very long ids */
function docId(s){ const e = encodeURIComponent(String(s)); if(e.length <= 300) return e;
  let h = 0x811c9dc5; const str = String(s); for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return e.slice(0, 200) + "~" + h.toString(36); }
/* v2.75: the parts' listeners' state, like the items' (var: boot-order rule). _remoteParts[n]: id → signature of what the server
   holds; _partsSeen[n]: a first server snapshot came; _frozenParts[n]: the list record's old array(s), kept as written (the backup) */
var unsubParts = {}, _remoteParts = {}, _partsSeen = {}, _frozenParts = {}, _partPend = {}, _migratingParts = "";
/* v2.58 (S8 step 2): the items listener's state. var: boot-order rule. _remoteItems: id → {sig, ts} or {gone} of what the server
   holds (the last items snapshot); _frozenItems/_frozenTomb: the list record's old items array, kept as written (the backup) */
var _itemsSeen=false, unsubItems=null, _remoteItems=new Map(), _frozenItems=null, _frozenTomb=null, _lastDocSig="", _migrating="", itemsPend=false, docPend=false;
/* v2.51 (S8): each item is merged on its own. _itemSigs holds what every item was at this phone's last merge; save() stamps
   (ts) the items that changed since and tombstones the ones that went, and subscribe() merges the server's items with ours,
   the newer copy winning. The rules live in js/merge.js. */
var _itemSigs = _itemSigs || new Map(), _itemSigsFor = _itemSigsFor || "";   // var + keep: resetItemSigs() already ran at boot, above this line — re-initialising here would drop that
function resetItemSigs(){ _itemSigs = new Map((state.items||[]).filter(i=>i && i.id!=null).map(i=>[String(i.id), itemSig(i)])); _itemSigsFor = listCode; }
var _newerData = false;   // var: render reads it at boot
let db=null, listRef=null, applyingRemote=false, unsub=null;
let netOnline = (typeof navigator!=="undefined" && "onLine" in navigator) ? navigator.onLine : true;
let syncing=false, fromCache=false;
var saveDiag = { last:0, max:0 }, _pendSince = 0;   // v2.57: how long the last save waited (Settings › Help › Connection check)
let dirtyIds = new Set();   // items changed locally, not yet confirmed by server
function markDirty(id){ if(id) dirtyIds.add(id); }
function subscribe(){
  if(unsub){ try{ unsub(); }catch(e){} unsub=null; }
  if(unsubItems){ try{ unsubItems(); }catch(e){} unsubItems=null; }
  Object.values(unsubParts).forEach(f => { try{ f(); }catch(e){} }); unsubParts = {};   // v2.75
  _remoteItems=new Map(); _frozenItems=null; _frozenTomb=null; _lastDocSig=""; docPend=false; itemsPend=false; _itemsSeen=false;
  _remoteParts = {}; _partsSeen = {}; _frozenParts = {}; _partPend = {};
  if(!db) return;
  listRef = ref("lists", listCode);
  unsub = listen(listRef, snap => {
    docPend = snap.metadata.hasPendingWrites; setSyncing();
    fromCache = snap.metadata.fromCache;
    if(snap.exists() && !snap.metadata.hasPendingWrites){ const d = snap.data();
      _newerData = (+d.v||0) > LIST_V;
      if(_newerData){ render(); return; }   // v2.49 S9: a newer app's data — leave state alone, show the update card
      /* v2.58: a split list — the items listener owns state.items/itemTomb; the record's old array is kept frozen (the backup) */
      const split = Array.isArray(d.parts) && d.parts.includes("items") && canSplit();
      if(split){ _frozenItems = d.items||[]; _frozenTomb = d.itemTomb||{}; }
      /* v2.75: a moved part — its listener owns it in state; the record's old array is kept frozen (the backup) */
      const moved = n => split && d.parts.includes(n);
      if(moved("regulars")) _frozenParts.regulars = { buyAgain:d.buyAgain||[], baTomb:d.baTomb||{} };
      if(moved("prices")) _frozenParts.prices = d.prices||{};
      if(moved("spend")) _frozenParts.spend = Array.isArray(d.spend) ? d.spend : [];
      const mg = moved("regulars") ? { list:state.buyAgain||[], tomb:state.baTomb||{} } : baMerge(d.buyAgain||[], d.baTomb||{}, state.buyAgain||[], state.baTomb||{});   // A24 conflict-free Buy-again
      const mgPurch = purchMerge(d.purch||{}, purch||{});                                        // B4 shared restock history (union merge)
      /* v2.09: prices rides along like plan does. This line rebuilds state from a fixed shape, so a field it does not name is wiped by the next snapshot (CLAUDE.md, the fixed-shape trap). */
      const rv = +d.v || 0;
      /* v2.51: item by item. A list written by merging phones (v2+), on a phone that has merged it before (mv 2+): an item only
         this phone has was added before the other phone saw it — keep it. Otherwise only this phone's own unsent change is kept:
         an older app may have removed it without a tombstone. */
      const trust = rv >= 2 && (+state.mv || 0) >= 2;
      const mi = split ? { items:state.items||[], tomb:state.itemTomb||{} } : mergeItems(d.items||[], d.itemTomb||{}, state.items||[], state.itemTomb||{}, id => trust || dirtyIds.has(id));
      state = { items:mi.items, itemTomb:mi.tomb, mv:rv, parts: Array.isArray(d.parts) ? d.parts : [], clr:(d.clr && typeof d.clr==="object") ? d.clr : {}, buyAgain:mg.list, baTomb:mg.tomb, stores:d.stores||[], storeMeta:d.storeMeta||{}, members:d.members||[], categories:d.categories||null, name:d.name||"", baMeta:d.baMeta||{label:"Buy again",emoji:"↩",img:"",pos:99}, predictReset:d.predictReset||0, purch:mgPurch, plan: d.plan || {days:{},recipes:[]}, prices: moved("prices") ? (state.prices||{}) : (d.prices||{}), aisle: d.aisle||{}, memb: d.memb||{}, shopping: d.shopping||{}, templates: Array.isArray(d.templates)?d.templates:[], spend: moved("spend") ? (Array.isArray(state.spend)?state.spend:[]) : (Array.isArray(d.spend)?d.spend:[]), looks: (d.looks && typeof d.looks==="object") ? d.looks : {}, aislemap: (d.aislemap && typeof d.aislemap==="object") ? d.aislemap : {} };
      resetItemSigs();
      /* v2.75: another phone cleared prices / spending (state.clr): drop what this phone still holds from before it */
      if(partOn("prices")) partMerge("prices", []); if(partOn("spend")) partMerge("spend", []);
      purch = state.purch;                                                                        // keep the working ref pointed at the shared copy
      if(!state.name){ const ln=(getLists().find(l=>l.code===listCode)||{}).name; if(ln){ state.name=ln; save(); } }
      if(dropTube()) save(); aiAdopt();
      if(state.name) rememberList(listCode, state.name);
      if((state.predictReset||0) > _predReset) applyPredictReset(state.predictReset);   // household-wide predictions reset propagated via the synced epoch
      // converge: if our merged view holds Buy-again / restock history the server was missing, write it back once
      if((!moved("regulars") && baSig(mg.list, mg.tomb) !== baSig(d.buyAgain||[], d.baTomb||{})) || purchSig(state.purch||{}) !== purchSig(d.purch||{}) || (!split && itemsSig(mi.items, mi.tomb) !== itemsSig(d.items||[], d.itemTomb||{}))) save();
      if(split){ startItems(); MOVED_PARTS.forEach(n => { if(moved(n)) startPart(n); }); maybeMigrateParts(d, snap); } else maybeMigrate(d, snap); }
    else if(snap.exists() && snap.metadata.hasPendingWrites){ /* keep local optimistic state */ }
    if(!syncing && !fromCache) dirtyIds.clear();   // v2.51: after the merge, which reads it
    ensureCats();
    try { localStorage.setItem(LS.cache, JSON.stringify(state)); } catch(e){}
    applyingRemote = true; renderKeepingAdd(); applyingRemote = false;   // v1.45: never tear down a focused search bar mid-add
  }, err => {
    /* v2.44 (members by account): refused — maybe not on this list yet; accessCheck() tries to join (and re-subscribes).
       Expected now, so not logged as an error (the crash reporter would send it) */
    if(/permission/i.test(String((err && (err.code||err.message)) || ""))){ listDenied = true; lockedNow(); _accessFor = ""; accessCheck(); return; }
    console.error(err);
    showToast("⚠︎ Can't read database — publish Firestore rules"); }, { includeMetadataChanges:true });
  listDenied = false;
}
/* v2.58: "Saving…" while either listener has a write outstanding; v2.57's timing runs on the combined flag */
function setSyncing(){ const pend = docPend || itemsPend || Object.values(_partPend).some(Boolean);   // v2.75: and the parts' listeners
  if(pend && !syncing) _pendSince = Date.now();
  else if(!pend && syncing && _pendSince){ const w = Date.now() - _pendSince - _hiddenMs(_pendSince);   // v2.59: time locked or in the background does not count
    saveDiag.last = Math.max(0, w); saveDiag.max = Math.max(saveDiag.max, saveDiag.last); }
  syncing = pend; }
/* v2.59: how long the app was hidden (phone locked, another app) since a moment — the save timer leaves it out */
var _hidSince = 0, _hidSpans = [];
function _hiddenMs(from){ let ms = 0; for(const [a,b] of _hidSpans){ if(b > from) ms += b - Math.max(a, from); }
  if(_hidSince) ms += Date.now() - Math.max(_hidSince, from); return ms; }
if(typeof document !== "undefined") document.addEventListener("visibilitychange", ()=>{
  if(document.hidden){ _hidSince = Date.now(); }
  else if(_hidSince){ _hidSpans.push([_hidSince, Date.now()]); _hidSpans = _hidSpans.slice(-20); _hidSince = 0; } });
/* v2.58 (S8 step 2): a split list's items, lists/{code}/items/{id}, one record each; a removal is the record {id, gone} */
function startItems(){
  if(unsubItems || !canSplit()) return;
  const c = col("lists", listCode, "items");
  unsubItems = listenAll(c, snap => {
    itemsPend = snap.metadata.hasPendingWrites; setSyncing();
    const remote=[], remoteTomb={}; _remoteItems = new Map();
    snap.docs.forEach(doc => { const x = doc.data() || {};
      if(x.gone){ remoteTomb[doc.id] = +x.gone; _remoteItems.set(doc.id, { gone:+x.gone }); }
      else { remote.push(x); _remoteItems.set(doc.id, { sig:itemSig(x), ts:+x.ts||0 }); } });
    if(!snap.metadata.hasPendingWrites){ _itemsSeen = true;
      /* in a split list every phone is v3-aware and an item is never deleted without a tombstone, so an item only this
         phone has is an unsent add — keep it */
      const mi = mergeItems(remote, remoteTomb, state.items||[], state.itemTomb||{}, () => true);
      state.items = mi.items; state.itemTomb = mi.tomb; resetItemSigs();
      const differs = mi.items.some(it => { const r = _remoteItems.get(String(it.id)); return !r || r.gone || r.sig !== _isig(it) || r.ts !== (+it.ts||0); })
        || Object.keys(mi.tomb||{}).some(id => { const r = _remoteItems.get(id); return !r || !r.gone; });
      if(differs) save(); }
    if(!itemsPend && !snap.metadata.fromCache) dirtyIds.clear();
    ensureCats();
    try { localStorage.setItem(LS.cache, JSON.stringify(state)); } catch(e){}
    applyingRemote = true; renderKeepingAdd(); applyingRemote = false;
  }, err => { console.error(err); }, { includeMetadataChanges:true });
}
/* v2.58 (S8 step 2): move a v2 list's items into records of their own, once per list per launch. Why this order is safe:
   each copy is keyed by the item's id, so repeating it (a second phone, a retry) writes the same records again; `parts`
   is written LAST, only after the whole batch landed, so until then every phone still reads the one record; the old items
   array stays in the list record, frozen, as the backup until step 4; and v:3 makes v2.49–v2.57 phones read-only, so none
   of them can write items into the old array that nobody reads any more. A refused batch (rules not yet published) leaves
   the list exactly as it was; it is tried again at the next opening. */
function maybeMigrate(d, snap){
  if(!canSplit() || _newerData || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
  if((+d.v||0) !== 2 || (Array.isArray(d.parts) && d.parts.includes("items")) || _migrating === listCode) return;
  if(!configured || !listRef) return;   // the same test save() uses before it writes
  _migrating = listCode;
  forceSnapshot();
  const code = listCode;
  const writes = (state.items||[]).filter(it => okItemId(String(it && it.id))).map(it => ({ ref: ref("lists",code,"items",String(it.id)), data:Object.assign({}, it, { id:String(it.id) }) }))
    .concat(Object.entries(state.itemTomb||{}).filter(([id]) => okItemId(id)).map(([id,t]) => ({ ref: ref("lists",code,"items",id), data:{ id, gone:+t } })));
  putMany(writes).then(() => { if(listCode !== code) return;
    state.parts = Array.from(new Set([...(state.parts||[]), "items"]));
    _frozenItems = state.items.map(i => Object.assign({}, i)); _frozenTomb = Object.assign({}, state.itemTomb||{});
    _lastDocSig = ""; startItems(); return save(); })
  .catch(e => { console.warn("[split] not moved yet", e && (e.code||e.message)); _migrating = ""; });
}
/* v2.75 (S8 step 3): Regulars, prices and spending as records of their own — lists/{code}/regulars/{rid} (one Regular + k, its
   baKey; a removal {k, gone}), prices/{pid} ({k, recs}) and spend/{sid} (one entry as is). Records are never deleted. */
function _psig(o){ return JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v)) ? Object.keys(v).sort().reduce((a, x) => { a[x] = v[x]; return a; }, {}) : v); }
function _pclean(o){ return JSON.parse(JSON.stringify(o)); }   // no undefined in a record (Firestore refuses it)
/* every record a part holds in this phone's state: [id, data] */
function partRecords(n){
  if(n === "regulars") return (state.buyAgain||[]).map(e => { const k = baKey(e); return [docId(k), _pclean(Object.assign({}, e, { k }))]; })
    .concat(Object.entries(state.baTomb||{}).map(([k, t]) => [docId(k), { k, gone:+t }]));
  if(n === "prices") return Object.entries(state.prices||{}).filter(([k, r]) => k && Array.isArray(r)).map(([k, r]) => [docId(k), { k, recs:_pclean(r) }]);
  if(n === "spend") return (Array.isArray(state.spend) ? state.spend : []).filter(e => e && e.t).map(e => [docId(String(e.t)), _pclean(e)]);
  return []; }
/* the writes a part needs: every record whose signature differs from what the server holds (all of them when `all`) */
function partWrites(n, code, all){ const r = _remoteParts[n] || new Map(), seen = new Set(), out = [];
  partRecords(n).forEach(([id, data]) => { if(!id || seen.has(id)) return; seen.add(id);
    if(all || r.get(id) !== _psig(data)) out.push({ ref: ref("lists", code, n, id), data }); });
  return out; }
/* the server's records merged with this phone's state */
function partMerge(n, recs){
  if(n === "regulars"){ const list = [], tomb = {};
    recs.forEach(x => { if(!x || typeof x.k !== "string") return;
      if(x.gone) tomb[x.k] = Math.max(tomb[x.k]||0, +x.gone); else { const e = Object.assign({}, x); delete e.k; list.push(e); } });
    const mg = baMerge(list, tomb, state.buyAgain||[], state.baTomb||{}); state.buyAgain = mg.list; state.baTomb = mg.tomb; return; }
  if(n === "prices"){ const P = {}, mine = (state.prices && typeof state.prices === "object") ? state.prices : {};
    recs.forEach(x => { if(x && typeof x.k === "string" && Array.isArray(x.recs)) P[x.k] = x.recs; });
    const out = {};
    const clr = +((state.clr||{}).prices) || 0;   // v2.75: "forget every price" / "empty the list" — records from before it stay on the server, unread
    new Set([...Object.keys(P), ...Object.keys(mine)]).forEach(k => { const m = new Map();
      /* the same receipt line read twice is one record (priceRecord's rule: date, shop and price), the newest kept */
      [...(P[k]||[]), ...(Array.isArray(mine[k]) ? mine[k] : [])].forEach(r => { if(!r || (+r.t||0) <= clr) return; const key = [r.d, r.sn, Math.round((+r.p||0)*100)].join("|"); const o = m.get(key); if(!o || (+r.t||0) > (+o.t||0)) m.set(key, r); });
      const a = [...m.values()].sort((a, b) => (a.t||0) - (b.t||0)).slice(-PRICE_PER_ITEM); if(a.length) out[k] = a; });
    state.prices = out; return; }
  if(n === "spend"){ const m = new Map(), clr = +((state.clr||{}).spend) || 0;
    [...recs, ...(Array.isArray(state.spend) ? state.spend : [])].forEach(e => { if(e && e.t && +e.t > clr) m.set(e.t, e); });
    state.spend = [...m.values()].sort((a, b) => (a.t||0) - (b.t||0)).slice(-SPEND_MAX); } }   // the cap is for what this phone holds; the records stay
function startPart(n){
  if(unsubParts[n] || !canSplit()) return;
  const code = listCode, c = col("lists", code, n);
  unsubParts[n] = listenAll(c, snap => {
    _partPend[n] = snap.metadata.hasPendingWrites; setSyncing();
    const m = new Map(), recs = [];
    snap.docs.forEach(doc => { const x = doc.data() || {}; m.set(doc.id, _psig(x)); recs.push(x); });
    _remoteParts[n] = m;
    if(!snap.metadata.hasPendingWrites){ _partsSeen[n] = true;
      partMerge(n, recs);
      if(partWrites(n, code).length) save(); }   // this phone holds something the server lacks
    try { localStorage.setItem(LS.cache, JSON.stringify(state)); } catch(e){}
    applyingRemote = true; renderKeepingAdd(); applyingRemote = false;
  }, err => { console.error(err); }, { includeMetadataChanges:true });
}
/* v2.75 (S8 step 3): move a split (v3) list's Regulars, prices and spending into records, the same way and for the same
   reasons as maybeMigrate: a backup first, the records in one batch, and only after it landed `parts` and v:4. A refused
   batch leaves the list as it was; it is tried again at the next opening. A list with none of the three yet is left as v3
   (nothing to move; moved at a later opening once it has some). */
function maybeMigrateParts(d, snap){
  if(!canSplit() || _newerData || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
  if((+d.v||0) !== 3 || !Array.isArray(d.parts) || !d.parts.includes("items") || _migratingParts === listCode) return;
  if(!configured || !listRef) return;
  const todo = MOVED_PARTS.filter(n => !d.parts.includes(n)); if(!todo.length) return;
  const code = listCode, writes = [].concat(...todo.map(n => partWrites(n, code, true)));
  if(!writes.length) return;
  _migratingParts = code;
  forceSnapshot();
  putMany(writes).then(() => { if(listCode !== code) return;
    state.parts = Array.from(new Set([...(state.parts||[]), ...todo]));
    if(todo.includes("regulars")) _frozenParts.regulars = { buyAgain:(state.buyAgain||[]).map(e => Object.assign({}, e)), baTomb:Object.assign({}, state.baTomb||{}) };
    if(todo.includes("prices")) _frozenParts.prices = JSON.parse(JSON.stringify(state.prices||{}));
    if(todo.includes("spend")) _frozenParts.spend = (Array.isArray(state.spend) ? state.spend : []).map(e => Object.assign({}, e));
    _lastDocSig = ""; todo.forEach(startPart); return save(); })
  .catch(e => { console.warn("[split] parts not moved yet", e && (e.code||e.message)); _migratingParts = ""; });
}
/* the signature as the record holds it: its id is always a string (a local id may be a number) */
function _isig(it){ return itemSig(Object.assign({}, it, { id:String(it.id) })); }
function okItemId(id){ return !!id && id.length <= 64 && !id.includes("/"); }
/* v2.44 (architecture review A2, members by account): who may open a list is kept beside it in access/{code}
   (firebase/firestore.rules). Until the owner publishes those rules every write here is refused — shrugged off quietly. */
var _accessFor = "", accessInfo = null, accessDenied = "", listDenied = false, accessBusy = null;
/* locked out = the list read AND the join were both refused; they finish in either order, so both call this */
var _lockToast = "";
function lockedNow(){ if(!(accessDenied===listCode && listDenied)) return;
  if(_lockToast!==listCode){ _lockToast=listCode; showToast(ACCESS_LOCKED); } render(); }
/* …and it stays on screen: a toast is gone in under two seconds, too soon for "this list is closed to you" */
function newerDataHTML(){ return _newerData ? `<div class="installcard" id="newerNote" role="alert"><div class="ic-t">${t("This list was saved by a newer version of the app")}</div><div class="ic-b">${t("Your changes stay on this phone until it updates. Close the app completely and open it again.")}</div><div class="ic-btns"><button class="newlist" id="newerReload">${t("Update now")}</button></div></div>` : ""; }   // v2.49 S9
function lockedHTML(){ if(!(accessDenied===listCode && listDenied && _auth && _auth.currentUser)) return "";
  return `<div class="installcard" id="lockNote" role="alert"><div class="ic-t">${t("This list is closed to this phone")}</div><div class="ic-b">${esc(t(ACCESS_LOCKED))}</div></div>`; }
const ACCESS_LOCKED = "You're not on this list any more, or its link has changed. Ask someone on it for a new link.";
function newKey(){ try{ const b=new Uint8Array(16); crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }   // 22 chars, base64url
  catch(e){ return (uid()+uid()+uid()).replace(/[^a-z0-9]/g,"").slice(0,32); } }
function accessRef(){ return db ? ref("access", listCode) : null; }
function isPermErr(e){ return /permission/i.test(String((e && (e.code||e.message)) || "")); }
function accessCheck(){ const u=_auth && _auth.currentUser, ref=accessRef(); if(!u || !ref) return;
  const code=listCode, uid=u.uid, key=code+"|"+uid; if(_accessFor===key) return; _accessFor=key;
  let off=null, done=false;
  const stop=()=>{ done=true; try{ if(off) off(); }catch(e){} };
  const join=()=>{ let k=""; try{ k=localStorage.getItem("ml_jk_"+code)||""; }catch(e){}
    const part={ acl:{[uid]:true}, names:{[uid]:me||""} }; if(k) part.joinProof={[uid]:k};
    Promise.resolve().then(()=>put(ref, part, true)).then(()=>{ if(code!==listCode) return;
        accessDenied=""; _accessFor=""; accessCheck(); subscribe(); })
      .catch(e=>{ if(code!==listCode || !isPermErr(e)) return; accessDenied=code; lockedNow(); }); };
  const got=(s)=>{ if(done) return; stop(); if(code!==listCode) return;
    if(!s || !s.exists || !s.exists()){
      const jk=newKey();
      Promise.resolve().then(()=>put(ref, { acl:{[uid]:true}, names:{[uid]:me||""}, joinKey:jk, openUntil:Date.now()+30*864e5 }))
        .then(()=>{ try{ localStorage.setItem("ml_jk_"+code, jk); }catch(e){} _accessFor=""; accessCheck(); }).catch(()=>{});
      return; }
    const d=s.data()||{};
    if(d.acl && d.acl[uid]===true){ accessDenied="";
      if(d.joinKey){ try{ localStorage.setItem("ml_jk_"+code, d.joinKey); }catch(e){} }
      accessInfo={ names:d.names||{}, acl:d.acl||{}, openUntil:d.openUntil||0, joinKey:d.joinKey||"" };
      if(me && (d.names||{})[uid]!==me) put(ref, { names:{[uid]:me} }, true).catch(()=>{});
      render(); return; }
    accessInfo=null; join(); };
  try{ off=listen(ref, got, err=>{ if(done) return; stop(); if(code!==listCode) return; if(isPermErr(err)) join(); }); }catch(e){ return; }
  setTimeout(()=>{ if(!done) stop(); }, 15000); }
/* every change from Settings › People: a busy line, then the result or a plain message */
function accessWrite(part, okMsg){ const ref=accessRef(); if(!ref || accessBusy && accessBusy.busy) return;
  accessBusy={ busy:true }; render();
  const t=new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")), 15000));
  Promise.race([Promise.resolve().then(()=>put(ref, part, true)), t]).then(()=>{
      if(part.joinKey){ try{ localStorage.setItem("ml_jk_"+listCode, part.joinKey); }catch(e){} }
      accessBusy=null; if(okMsg) showToast(okMsg); _accessFor=""; accessCheck(); render(); })
    .catch(e=>{ accessBusy={ err: isPermErr(e) ? "Couldn't change that — the new database rules may not be published yet."
        : (e && e.message==="timeout") ? "No answer from the database — check the signal and try again." : "Couldn't change that — try again." }; render(); }); }
function accessHTML(){
  const locked = accessDenied===listCode && listDenied && _auth && _auth.currentUser;
  if(locked) return `<div class="opthint" role="alert">${esc(t(ACCESS_LOCKED))}</div>`;
  const u=_auth && _auth.currentUser; if(!accessInfo || !u) return "";
  const a=accessInfo, my=u.uid, now=Date.now();
  const ppl=Object.keys(a.names||{}).filter(id=>(a.acl||{})[id]===true);
  const st = accessBusy && accessBusy.busy ? `<div class="rcbusy" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${t("Saving…")}</div>`
    : accessBusy && accessBusy.err ? `<div class="rpterr" role="alert">${esc(t(accessBusy.err))}</div>` : "";
  return `<div id="accessBox" class="optrow optnl" style="flex-direction:column;align-items:stretch;gap:6px">
    <div class="snapnote">${t("Phones that can open this list:")}</div>
    ${ppl.map(id=>{ const nm=(a.names||{})[id]||"Someone";
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(nm==="Someone"&&!(a.names||{})[id]?t(nm):nm)}${id===my?` <span class="ucur">${t("you")}</span>`:""}</span>${id===my?"":`<button class="optaction" style="width:auto;margin:0;padding:4px 10px" data-access-rm="${esc(id)}" data-access-nm="${esc(nm)}">${t("Remove")}</button>`}</div>`; }).join("")}
    ${(a.openUntil||0)>now ? `<div class="snapnote">${tf("Until {d}, anyone with the list's code can still join (so the household's phones move over).", { d:esc(new Date(a.openUntil).toLocaleDateString(dateLoc())) })}</div><button class="optaction" id="accessClose" style="margin-top:2px">${t("Close now")}</button>`
      : `<div class="snapnote">${t("Only people with the current link can join.")}</div>`}
    <button class="optaction" id="accessNewKey" style="margin-top:2px">${t("New link")}</button>
    ${st}</div>`; }
/* v2.39 (architecture review A1): a quiet sign-in. Each phone gets an anonymous Firebase account — no name, no email — so
   the server can tell one phone from another and, later, the list can know its people by account. Loaded on its own, after
   the list, so it never slows the start; until the owner turns on Anonymous sign-in in Firebase it fails quietly and
   everything works as before (authNote() says why, in Settings › Your data). */
var _auth = null, _authErr = "";   // var: Settings reads them at any time
/* v2.50 App Check (architecture review S3): proves a request comes from this app, not a script holding the public web config.
   v2.52: ON, with Google's Fraud Defense (formerly reCAPTCHA Enterprise — the classic reCAPTCHA is no longer offered for new
   keys). APPCHECK_SITE_KEY is its site key — public, like the web config; the owner created it and
   registers it in Firebase › App Check). Switched on, Firestore and Auth attach its token by themselves and apiFetch sends
   it to the server (X-Firebase-AppCheck), which checks it when APP_CHECK is "log" or "require" (lib/guard.js). reCAPTCHA
   is Google's script, loaded from google.com only then — privacy.html says so. */
const APPCHECK_SITE_KEY = "6LcX4vwtAAAAACbmrxOgibD3Gv8wOrIrUc-icGU9";   // v2.52, Fraud Defense
var _appCheck = null, _appCheckMod = null;
function appCheckKey(){ try{ if(navigator.webdriver) return String(window.__appCheckKey || ""); }catch(e){} return APPCHECK_SITE_KEY; }   // under automation only a test's own key: no suite ever loads Google's real script
/* v2.54: returns when App Check is in place (or at most 2.5 s, or at once without a key), so the database and sign-in are
   started AFTER it — v2.52 started them alongside, and the first requests of every launch went out unverified (seen in
   Firebase › App Check: 6 of 39 in an hour), which enforcement would have refused. */
function startAppCheck(app){ const key = appCheckKey(); if(!key || _appCheck) return Promise.resolve();
  const ready = import("/vendor/firebasejs/10.12.2/firebase-app-check.js").then(m => { _appCheckMod = m;
    _appCheck = m.initializeAppCheck(app, { provider: new m.ReCaptchaEnterpriseProvider(key), isTokenAutoRefreshEnabled: true });
    try{ if(typeof m.onTokenChanged==="function") m.onTokenChanged(_appCheck, ()=>{ acDiag.ok++; acDiag.code=""; }, e=>{ acDiag.fail++; acDiag.code=acCode(String((e&&e.code)||"error").slice(0,60)) || "error"; }); }catch(e){}   // v2.57: the database's own failures too
  })
  .catch(() => {});   // offline or blocked: the app works on; the server decides what an unchecked call gets
  return Promise.race([ready, new Promise(r => setTimeout(r, 10000))]); }   // v2.56: 10 s (was 2.5) — on a slow line reCAPTCHA took longer and 4% went unverified; the list shows from the phone's copy meanwhile   // offline or blocked: the app works on; the server decides what an unchecked call gets
/* v2.57: why the security check fails, shown in Settings › Help (Connection check) and sent as x-appcheck-err — a short code, never a token. var: boot-order rule */
var acDiag = { ok:0, fail:0, code:"", ms:0, at:0 };
function acCode(v){ return String(v||"").replace(/[^A-Za-z0-9\/_.: -]/g,"").slice(0,60); }
async function appCheckToken(){ if(!_appCheck || !_appCheckMod) return "";
  const t0 = Date.now(); let timedOut = false;
  try{ const r = await Promise.race([_appCheckMod.getToken(_appCheck, false), new Promise(res => setTimeout(() => { timedOut = true; res(null); }, 8000))]);   // v2.56: 8 s (was 3)
    if(r && r.token){ acDiag.ms = Date.now() - t0; acDiag.ok++; acDiag.at = Date.now(); acDiag.code = ""; return r.token; }
    acDiag.fail++; acDiag.code = acCode(timedOut ? "timeout" : "error"); return ""; }
  catch(e){ acDiag.fail++; acDiag.code = acCode((e && e.code) || (timedOut ? "timeout" : "error")) || "error"; return ""; } }
var _authM = null;   // v2.40 (sign-in by email): the auth module, kept for the email-link calls
function authStart(fbApp){ import("/vendor/firebasejs/10.12.2/firebase-auth.js").then(m=>{
    if(!m || typeof m.initializeAuth!=="function") return;   // the test stub has no auth
    const a = m.initializeAuth(fbApp, { persistence:[m.indexedDBLocalPersistence, m.browserLocalPersistence] });   // no popup/redirect helpers: nothing loads from other sites
    _auth = a; _authM = m;
    /* v2.40: opened from the sign-in email's link — finish signing in, then take the link out of the address bar */
    try{ if(typeof m.isSignInWithEmailLink==="function" && m.isSignInWithEmailLink(a, location.href)){ const url=location.href;
      try{ const u=new URL(url); ["apiKey","oobCode","mode","lang","continueUrl","signin"].forEach(k=>u.searchParams.delete(k)); history.replaceState(null,"",u.pathname+(u.search||"")+u.hash); }catch(e){}
      /* the phone's quiet account is read back from storage a moment after start: wait for it, so the link UPGRADES it
         instead of making a second account (authStateReady; a stub without it finishes at once) */
      Promise.resolve(typeof a.authStateReady==="function" ? a.authStateReady() : null).catch(()=>{}).then(()=>acctComplete(url)); } }catch(e){}
    m.onAuthStateChanged(a, u=>{ if(u){ _authErr=""; if(!u.isAnonymous) acctSync();
        if(listDenied) subscribe();   // v2.44: the first read may have run before the quiet sign-in finished
        accessCheck(); return; }
      if(navigator.onLine===false) return;
      m.signInAnonymously(a).catch(e=>{ _authErr = String((e && (e.code || e.message)) || "failed").slice(0,80); }); });
    window.addEventListener("online", ()=>{ if(_auth && !_auth.currentUser) m.signInAnonymously(_auth).catch(()=>{}); });
  }).catch(()=>{ _authErr="sdk"; }); }
/* v2.50: a call made in the first seconds after opening waits (up to 4 s) for the quiet sign-in, so it is not refused once the
   server requires a sign-in (API_AUTH=require) — offline or with sign-in failing, it goes without and the server decides */
async function apiToken(){ try{ let u = _auth && _auth.currentUser;
    for(let i=0; !u && _auth && i<20 && !_authErr && navigator.onLine!==false; i++){ await new Promise(r=>setTimeout(r, 200)); u = _auth && _auth.currentUser; }
    if(!u) return "";
    return await Promise.race([u.getIdToken(), new Promise(r=>setTimeout(()=>r(""), 3000))]) || ""; }catch(e){ return ""; } }
const API_ORIGIN = "https://grocery-app-2-sage.vercel.app";   // v2.49 S13: inside the iPhone/Android app the page is not on the website, so /api/… needs the full address
function apiUrl(u){ return (isNativeApp() && /^\/api\//.test(u)) ? API_ORIGIN + u : u; }
/* every call to the app's own server goes through here, so it carries the phone's sign-in when there is one */
async function apiFetch(url, opts){ const o = Object.assign({}, opts || {}); const [t, ac] = await Promise.all([apiToken(), appCheckToken()]);
  if(t) o.headers = Object.assign({}, o.headers || {}, { authorization:"Bearer " + t });
  if(ac) o.headers = Object.assign({}, o.headers || {}, { "x-firebase-appcheck": ac });
  else if(acDiag.code) o.headers = Object.assign({}, o.headers || {}, { "x-appcheck-err": acDiag.code });   // v2.57: a code, never a token
  return fetch(apiUrl(url), o); }
/* v2.57 item 2: Settings › Help › Connection check — the security check's state and how long saves wait */
function connDiagHTML(){
  const ac = acDiag.code ? tf("Security check: not working ({code})", { code:esc(acDiag.code) })
    : acDiag.ok ? tf("Security check: working ({s} s)", { s:(acDiag.ms/1000).toFixed(1) })
    : t("Security check: not started");
  const sv = saveDiag.last ? "<br>" + tf("Last save took {a} s (longest {b} s)", { a:(saveDiag.last/1000).toFixed(1), b:(saveDiag.max/1000).toFixed(1) }) : "";
  return ac + sv; }
function authNote(){ if(_auth && _auth.currentUser) return "This phone is signed in quietly (an anonymous account — no name, no email).";
  if(/operation-not-allowed|admin-restricted/.test(_authErr)) return "This phone isn't signed in: Anonymous sign-in isn't turned on in Firebase yet.";
  if(!configured) return "";
  return _authErr ? `This phone isn't signed in yet (${_authErr}).` : "This phone isn't signed in yet."; }
/* v2.40 (sign-in by email): "Add your email" upgrades the phone's quiet account to an email account — the same account, so
   nothing on the phone changes — and the phone's lists are remembered in users/{uid} (codes and names only), so a new
   phone signed in with the same email gets them back. Lists are still opened by their code: the account only remembers
   which codes are yours. Every wait shows that it started and ends in a result or a plain message. */
var acct = null;   // { busy, step } | { sent:email } | { err } | { ok } — the Settings block's state. var: render reads it at any time
var _acctNote = "";   // why the account could not be saved (rules not yet published), shown under the block
function acctEmail(){ const u=_auth && _auth.currentUser; return (u && !u.isAnonymous && u.email) || ""; }
function acctErr(e){ const c=String((e && e.code) || "");
  return c==="auth/invalid-email" ? "That email doesn't look right."
    : c==="auth/too-many-requests" ? "Too many tries from this phone. Wait a few minutes and try again."
    : /unauthorized-continue-uri|unauthorized-domain/.test(c) ? "This web address isn't on Firebase's list of allowed sign-in addresses (Authentication › Settings › Authorized domains)."
    : /operation-not-allowed|admin-restricted/.test(c) ? "Sign-in by email isn't turned on in Firebase yet."
    : /invalid-action-code|expired-action-code/.test(c) ? "That link has expired or was already used. Send a new one."
    : (navigator.onLine===false || c==="auth/network-request-failed") ? "No connection. Try again when you're online."
    : c==="auth/weak-password" ? "Use at least 6 characters (6 digits is fine)."
    : /invalid-credential|wrong-password|user-not-found|invalid-login/.test(c) ? "That password doesn't match this email. Try again, or reset it below."
    : c==="auth/user-disabled" ? "This account has been switched off."
    : c==="timeout" ? "That took too long. Try again."
    : "Couldn't do that. Try again."; }
function acctWait(p){ return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej({ code:"timeout" }), 20000))]); }   // every wait ends
/* v2.41 (the household: "it is not common to have to copy the link"): an email and a password, all inside the app. A web app
   on iPhone cannot be opened by a link, so the email link landed in Safari and had to be copied back; a password needs no
   link at all. Firebase asks for at least 6 characters — a 4-digit code (10,000 guesses) would guard every list too weakly.
   A new email UPGRADES the phone's quiet account (the same account); an email that already has one signs in to it. The
   email link stays as the other way in, and is what an App Store app would open directly (Do later). */
function acctPassword(email, pw){ email=String(email||"").trim(); pw=String(pw||"");
  if(!_authM || !_auth || typeof _authM.signInWithEmailAndPassword!=="function"){ acct={ err:"Sign-in isn't ready on this phone yet. Try again in a moment.", email }; render(); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ acct={ err:"That email doesn't look right.", email }; render(); return; }
  if(pw.length < 6){ acct={ err:"Use at least 6 characters (6 digits is fine).", email }; render(); return; }
  acct={ busy:true, step:"Signing in…", email }; render();
  (async()=>{ try{ const u=_auth.currentUser;
      if(u && u.isAnonymous && typeof _authM.linkWithCredential==="function"){
        try{ await acctWait(_authM.linkWithCredential(u, _authM.EmailAuthProvider.credential(email, pw))); }
        catch(e){ if(!/email-already-in-use|credential-already-in-use/.test(String(e && e.code))) throw e;
          await acctWait(_authM.signInWithEmailAndPassword(_auth, email, pw)); } }   // this email already has an account (another phone): sign in to it
      else await acctWait(_authM.signInWithEmailAndPassword(_auth, email, pw));
      acct={ ok:true }; _acctSyncedUid=""; acctSync(); render(); }
    catch(e){ acct={ err:acctErr(e), email, forgot:/invalid-credential|wrong-password|user-not-found|invalid-login/.test(String(e && e.code)) }; render(); } })(); }
/* v2.43 (the household's item a): an account made from the email link has no password; set one (or change it) here */
function acctSetPassword(pw){ pw=String(pw||""); const u=_auth && _auth.currentUser;
  if(!u || u.isAnonymous || !_authM || typeof _authM.updatePassword!=="function"){ acct={ err:"Sign in first." }; render(); return; }
  if(pw.length < 6){ acct={ err:"Use at least 6 characters (6 digits is fine)." }; render(); return; }
  acct={ busy:true, step:"Saving the password…" }; render();
  acctWait(_authM.updatePassword(u, pw))
    .then(()=>{ acct={ pwSet:true }; render(); })
    .catch(e=>{ acct={ err: /requires-recent-login/.test(String(e && e.code)) ? "For safety, Firebase wants a fresh sign-in first: sign out, sign in again (email link or password), then save the password."
      : acctErr(e) }; render(); }); }
function acctForgot(email){ email=String(email||"").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ acct={ err:"Type your email above first.", email }; render(); return; }
  if(!_authM || !_auth || typeof _authM.sendPasswordResetEmail!=="function") return;
  acct={ busy:true, step:"Sending a reset email…", email }; render();
  acctWait(_authM.sendPasswordResetEmail(_auth, email))
    .then(()=>{ acct={ email, reset:true }; render(); })
    .catch(e=>{ acct={ err:acctErr(e), email }; render(); }); }
function acctSend(email){ email=String(email||"").trim(); if(!_authM || !_auth || typeof _authM.sendSignInLinkToEmail!=="function"){ acct={ err:"Sign-in isn't ready on this phone yet. Try again in a moment." }; render(); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ acct={ err:"That email doesn't look right." }; render(); return; }
  acct={ busy:true, step:"Sending the sign-in link…" }; render();
  acctWait(_authM.sendSignInLinkToEmail(_auth, email, { url: location.origin + "/?signin=1", handleCodeInApp:true }))
    .then(()=>{ try{ localStorage.setItem("ml_signinemail", email); }catch(e){} acct={ sent:email }; render(); })
    .catch(e=>{ acct={ err:acctErr(e) }; render(); }); }
async function acctComplete(url){ if(!_authM || !_auth) return;
  const sent=(acct && acct.sent) || "";   // kept through the wait and any error, so the paste box stays
  let email=""; try{ email=localStorage.getItem("ml_signinemail")||""; }catch(e){}
  if(!email && sent) email=sent;
  if(!email) email=(prompt("Which email did you send the link to?")||"").trim();   // the link was opened where the email was not typed (on iPhone: Safari, not the Home Screen app)
  if(!email){ acct={ sent, err:"Type the email the link was sent to, then paste the link again." }; render(); return; }
  acct={ busy:true, step:"Signing in…" }; render();
  try{ const u=_auth.currentUser;
    if(u && u.isAnonymous && typeof _authM.linkWithCredential==="function"){
      try{ await acctWait(_authM.linkWithCredential(u, _authM.EmailAuthProvider.credentialWithLink(email, url))); }
      catch(e){ if(!/credential-already-in-use|email-already-in-use|provider-already-linked/.test(String(e && e.code))) throw e;
        await acctWait(_authM.signInWithEmailLink(_auth, email, url)); } }   // this email already has an account (another phone): sign in to it; this phone's lists are added to it below
    else await acctWait(_authM.signInWithEmailLink(_auth, email, url));
    try{ localStorage.removeItem("ml_signinemail"); }catch(e){}
    acct={ ok:true }; _acctSyncedUid=""; acctSync(); render(); }
  catch(e){ acct={ sent, err:acctErr(e) }; render(); } }
function acctSignOut(){ if(!_authM || !_auth) return; if(!confirm("Sign out on this phone? Its lists stay on it; your account keeps them too.")) return;
  _authM.signOut(_auth).catch(()=>{}).then(()=>{ acct=null; _acctSyncedUid=""; render(); }); }   // onAuthStateChanged then signs the phone in quietly again
/* v2.46 (the household's item A; an App Store rule, S16): the account can be deleted from inside the app. In order: this
   account comes off every list this phone knows (its access entry set to false, its name cleared), its saved lists are
   emptied, then Firebase deletes the account itself. The lists stay — on this phone and for everyone on them — and the
   phone carries on quietly signed in, rejoining them with the keys it keeps. An empty users/{uid} record is left behind
   (no codes, no names): deleting records needs an import the test stubs do not have — a shortcut, logged in Do later. */
async function acctDelete(){ const u=_auth && _auth.currentUser;
  if(!u || u.isAnonymous || !_authM || typeof _authM.deleteUser!=="function") return;
  if(!confirm(t("Delete your account? Your email and password are removed, and your account forgets which lists are yours. The lists themselves stay, on this phone and for everyone on them."))) return;
  acct={ busy:true, step:t("Deleting your account…") }; render();
  try{
    for(const l of getLists()){ try{ await acctWait(put(ref("access",l.code), { acl:{[u.uid]:false}, names:{[u.uid]:""} }, true)); }catch(e){} }
    try{ await acctWait(put(ref("users",u.uid), { lists:{}, gone:{}, updated:Date.now() })); }catch(e){}
    await acctWait(_authM.deleteUser(u));
    acct={ deleted:true }; _acctSyncedUid=""; _accessFor=""; render(); }
  catch(e){ acct={ err: /requires-recent-login/.test(String(e && e.code)) ? t("For safety, Firebase wants a fresh sign-in first: sign out, sign in again, then delete the account.") : acctErr(e) }; render(); } }
var _acctSyncedUid = "";
function acctRef(){ const u=_auth && _auth.currentUser; return (u && !u.isAnonymous && db) ? ref("users", u.uid) : null; }
/* merge both ways: lists the account has and this phone does not are added here; lists this phone has are added to the
   account. A list left on purpose (Leave this list) is marked gone with its time, so it does not come back. */
function acctSync(){ const ref=acctRef(); if(!ref) return; const uid=_auth.currentUser.uid; if(_acctSyncedUid===uid) return; _acctSyncedUid=uid;
  let off=null, done=false;
  const finish=(data)=>{ if(done) return; done=true; try{ if(off) off(); }catch(e){}
    const have=(data && data.lists) || {}, gone=(data && data.gone) || {}; let added=0;
    for(const [code, v] of Object.entries(have)){ if(!/^[A-Za-z0-9_-]{1,64}$/.test(code)) continue;
      if(gone[code] && gone[code] >= ((v && v.ts) || 0)) continue;
      { const lg=goneGet()[code]; if(lg && lg >= ((v && v.ts) || 0)) continue; }   // v2.56 item 6: removed on this phone
      if(!getLists().some(x=>x.code===code)){ _acctQuiet=true; try{ rememberList(code, String((v && v.name) || "Groceries").slice(0,60)); }finally{ _acctQuiet=false; } added++; } }
    const push={}; for(const l of getLists()) if(!have[l.code]) push[l.code]={ name:String(l.name||"").slice(0,60), ts:Date.now() };
    if(Object.keys(push).length) acctWrite({ lists:push });
    if(added){ showToast(added===1 ? "1 list came back from your account" : `${added} lists came back from your account`); render(); }
    prefsFromAccount(data, uid); };
  try{ off=listen(ref, s=>finish(s && s.exists && s.exists() ? s.data() : null), err=>{ done=true; acctDenied(err); }); }catch(e){ acctDenied(e); }
  setTimeout(()=>{ if(!done){ done=true; try{ if(off) off(); }catch(e){} } }, 15000); }
var _acctQuiet = false;   // true while lists come back FROM the account, so they are not written straight back
function acctWrite(part){ const ref=acctRef(); if(!ref) return; part.updated=Date.now();
  Promise.resolve().then(()=>put(ref, part, true)).then(()=>{ _acctNote=""; }).catch(acctDenied); }
/* v2.71 settings remembered by the account. Signed in with an email (never anonymous), the phone keeps a copy of its
   settings in users/{uid}.prefs = { at, json } (json: the keys as one string): the look (lookKeys, v2.26) plus PREF_KEYS — never list data. Written 4 s
   after a change (prefsSchedule, armed by every render; never during boot, never before acctSync has read the record, and
   only when the snapshot differs from the last one sent or read). Read back in acctSync: a fresh phone (_prefsFresh) takes
   them silently and reloads once; any other phone is offered them on the Shop page when they are newer than ml_prefsseen.
   Two phones: the newest settings win only when the person accepts the card — a phone never overwrites its own look
   unasked, and its next change is what the account then keeps. A fresh phone takes them silently. */
const PREF_KEYS = ["ml_lang","ml_units","ml_numdef","ml_smart","ml_siriSmart","ml_wakelock","ml_sayshop","ml_optcoll"];
var _prefsSig = null, _prefsUid = "", _prefsT = null, _prefsOffer = null;   // var: render reads them at any time
function prefsKeys(){ const out = lookKeys();
  for(const k of PREF_KEYS){ let v = null; try{ v = localStorage.getItem(k); }catch(e){} if(v !== null) out[k] = String(v); }
  let n = Object.values(out).reduce((a, v) => a + v.length, 0);
  for(const k of Object.keys(out).sort((a, b) => out[b].length - out[a].length)){ if(n <= 30000) break; n -= out[k].length; delete out[k]; }   // the largest go first
  return out; }
function prefsSig(o){ const s = {}; for(const k of Object.keys(o || {}).sort()) s[k] = o[k]; return JSON.stringify(s); }
function prefsSeen(){ try{ return +localStorage.getItem("ml_prefsseen") || 0; }catch(e){ return 0; } }
function prefsSeenSet(at){ try{ localStorage.setItem("ml_prefsseen", String(at)); }catch(e){} }
function prefsSchedule(){ if(_prefsT) clearTimeout(_prefsT);
  _prefsT = setTimeout(()=>{ _prefsT = null;
    if(!_booted || !acctEmail() || _prefsSig === null) return;   // not during boot; signed out or anonymous: nothing is written
    const u = _auth && _auth.currentUser; if(!u || u.uid !== _prefsUid) return;   // only after acctSync has read THIS account
    const keys = prefsKeys(), sig = prefsSig(keys); if(sig === _prefsSig) return;
    const at = Date.now(); _prefsSig = sig; prefsSeenSet(at); acctWrite({ prefs:{ at, json: JSON.stringify(keys) } }); }, 4000); }   // one string, not a map: acctWrite merges, and a merged map would keep keys this phone has since reset
function prefsApply(keys){ const look = {};
  for(const [k, v] of Object.entries(keys || {})){ if(typeof k !== "string" || k.indexOf("ml_") !== 0) continue;
    if(PREF_KEYS.includes(k)){ try{ localStorage.setItem(k, String(v)); }catch(e){} }
    else if(!APP_EXCLUDE.test(k)) look[k] = String(v); }
  applyStoredAppearance(look); }   // reloads
function prefsFromAccount(data, uid){ _prefsUid = uid; _prefsOffer = null;
  const P = data && data.prefs, at = (P && +P.at) || 0;
  let keys = null; try{ const o = P && typeof P.json === "string" ? JSON.parse(P.json) : null; if(o && typeof o === "object" && !Array.isArray(o)) keys = o; }catch(e){}
  if(!keys){ _prefsSig = ""; prefsSchedule(); return; }   // the account has none yet: this phone's are sent
  _prefsSig = prefsSig(prefsKeys());   // from now on only a real change is sent
  if(at <= prefsSeen()) return;
  if(prefsSig(keys) === _prefsSig){ prefsSeenSet(at); return; }   // this phone already has them
  /* a fresh phone: apply silently and reload ONCE. ml_prefsseen is set first and a session flag guards the reload, so it
     cannot loop (after the reload at <= ml_prefsseen, and ml_theme exists so the phone is no longer fresh). */
  let reloaded = false; try{ reloaded = sessionStorage.getItem("ml_prefsreload") === "1"; }catch(e){}
  if(_prefsFresh && !reloaded){ _prefsFresh = false; prefsSeenSet(at); try{ sessionStorage.setItem("ml_prefsreload", "1"); }catch(e){} prefsApply(keys); return; }
  _prefsOffer = { at, keys }; render(); }
function prefsCardHTML(){ const P = _prefsOffer; if(!P || P.at <= prefsSeen() || !acctEmail()) return "";
  const when = new Date(+P.at).toLocaleDateString(dateLoc(), { day:"numeric", month:"short" });
  return `<div class="installcard lookcard" id="prefsCard" role="note">
    <div class="ic-t">${t("Your settings from your account")}</div>
    <div class="ic-b">${tf("Saved on {x}: look, language and preferences. Use them on this phone?", { x:esc(when) })}</div>
    <div class="ic-btns"><button class="newlist" id="prefsUse">${t("Use them")}</button><button class="optaction" id="prefsNo">${t("Not now")}</button></div>
  </div>`; }
function acctDenied(e){ if(/permission/i.test(String((e && (e.code||e.message)) || ""))) { _acctNote="Your lists can't be saved to your account yet: the app's owner still has to publish the new database rules."; render(); } }
function acctHTML(){ if(!configured) return "";
  const em=acctEmail(), a=acct||{};
  const status = a.busy ? `<div class="rcbusy" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${esc(t(a.step||"Working…"))}</div>`
    : a.err ? `<div class="rpterr" role="alert">${esc(t(a.err))}</div>` : "";
  if(em) return `<div class="acctbox" id="acctBox"><div class="accthd">${t("Your account")}</div>
    <div class="acctline">${tf("Signed in as <b>{e}</b>. Your lists are saved to your account: sign in with this email on another phone to get them back.", { e:esc(em) })}</div>
    ${a.ok ? `<div class="acctline" role="status">${t("Signed in. This phone's lists are now saved to your account.")}</div>` : ""}
    ${_acctNote ? `<div class="acctline acctwarn">${esc(t(_acctNote))}</div>` : ""}
    ${a.pwSet ? `<div class="acctline" role="status">${t("Password saved. Sign in with it on any phone.")}</div>` : ""}
    <div class="acctline" style="margin-top:8px">${t("Set a password, or change it, so another phone can sign in without an email link:")}</div>
    <input id="acctNewPw" class="cefield acctfield" type="password" autocomplete="new-password" placeholder="${t("New password — at least 6 characters")}" />
    <button class="optaction" id="acctSetPw" style="margin-top:8px" ${a.busy?"disabled":""}>${t("Save password")}</button>
    ${status}
    <button class="optaction" id="acctOut" style="margin-top:8px">${t("Sign out on this phone")}</button>
    <button class="acctlink" id="acctDel">${t("Delete my account")}</button></div>`;
  return `<div class="acctbox" id="acctBox"><div class="accthd">${t("Your account")}</div>
    <div class="acctline">${esc(t(authNote()))}</div>
    <div class="acctline">${t("Add your email and a password so a new phone gets your lists back: sign in there with the same two.")}</div>
    <input id="acctEmail" class="cefield acctfield" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(a.email||a.sent||"")}" />
    <input id="acctPw" class="cefield acctfield" type="password" autocomplete="current-password" placeholder="${t("Password — at least 6 characters")}" />
    <button class="newlist" id="acctGo" style="margin-top:8px" ${a.busy?"disabled":""}>${t("Continue")}</button>
    ${a.sent ? "" : status}
    ${a.deleted ? `<div class="acctline" role="status">${t("Your account is deleted. This phone carries on quietly signed in, with its lists.")}</div>` : ""}
    ${a.reset ? `<div class="acctline" role="status">${tf("If <b>{e}</b> has an account, an email to set a new password is on its way. It opens in your browser; set the password there, then sign in here.", { e:esc(a.email) })}</div>` : ""}
    ${a.forgot ? `<button class="acctlink" id="acctForgot">${t("Forgot your password?")}</button>` : ""}
    <button class="acctlink" id="acctSend" ${a.busy?"disabled":""}>${t("Or email me a sign-in link instead")}</button>
    ${a.sent ? `<div class="acctline" role="status">${tf("Link sent to <b>{e}</b>. Open it on this phone. On iPhone, if it opens in Safari instead of the app, copy the link and paste it here:", { e:esc(a.sent) })}</div>
    <div class="acctrow"><input id="acctPaste" class="cefield" inputmode="url" autocomplete="off" placeholder="${t("Paste the link from the email")}" /><button class="optaction" id="acctUse" style="margin-top:0">${t("Sign in")}</button></div>` : ""}
    ${a.sent ? status : ""}</div>`; }
try {
  if(firebaseConfig.apiKey !== "REPLACE_ME"){
    const app = initializeApp(firebaseConfig);
    /* v2.54: App Check first, then the database and sign-in (see startAppCheck). Until then the app runs on its local copy:
       a change made meanwhile is kept, stamped, and merged in by the first snapshot (v2.51). */
    configured = true;   // the screens ask this at once; save() waits for listRef, which subscribe() sets
    startAppCheck(app).then(() => { try {
      /* v2.59: ONE tab manager that owns its own writes. With the multi-tab manager only the "primary" copy of the app sends,
         and the others queue; on an iPhone a copy that iOS froze in the background can hold that role, and saves waited for
         it (the household's Connection check showed one waiting 54 minutes). A home-screen app has one window, so it takes
         ownership; a second browser tab, rare, falls back to working without the offline cache. */
      const tm = typeof FS.persistentSingleTabManager === "function" ? FS.persistentSingleTabManager({ forceOwnership:true }) : FS.persistentMultipleTabManager();
      try { db = FS.initializeFirestore(app, { localCache: FS.persistentLocalCache({ tabManager: tm }) }); }
      catch(e){ db = FS.getFirestore(app); }   // fallback if persistence unavailable
      storeInit(FS, db);
      subscribe();
      authStart(app);
    } catch(e){ console.error(e); } });
  }
} catch(e){ console.error(e); }
/* v2.15: the service worker (sw.js) keeps the app, its fonts, its icons and the Firebase SDK on the phone, so it
   opens with no signal once iOS has closed it. Not under test automation unless a suite asks for it (ml_swtest):
   Playwright 1.56 cannot stub a worker's own requests, so a worker there would load the real Firebase SDK. */
try{ if("serviceWorker" in navigator && !isNativeApp() && (!navigator.webdriver || localStorage.getItem("ml_swtest")==="1")){
  const regSW=()=>{ navigator.serviceWorker.register("/sw.js").catch(()=>{}); };
  if(document.readyState==="complete") regSW(); else window.addEventListener("load", regSW); } }catch(e){}
/* v2.15: ask the browser to keep this app's data. Safari can clear a website's stored data after weeks without
   use; installed home-screen apps are exempt, and this asks for the same treatment where it is offered. */
try{ if(navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p=>{ if(!p && navigator.storage.persist) return navigator.storage.persist(); }).catch(()=>{}); }catch(e){}
/* v2.15: one backup of the list a day, the last 7, on this phone (Settings › Other). Taken a few seconds after
   start-up, so the household's newest copy has arrived, and whenever the app goes to the background. */
setTimeout(()=>maybeSnapshot(), 5000);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") maybeSnapshot(); });
if(typeof window!=="undefined"){
  window.addEventListener("online",  ()=>{ netOnline=true;  render(); });
  window.addEventListener("offline", ()=>{ netOnline=false; render(); });
  if(window.visualViewport){
    const vv=window.visualViewport;
    // v1.36 item 3: the keyboard's height is innerHeight - vv.height. The old formula also subtracted
    // vv.offsetTop (how far iOS has scrolled the visual viewport), which UNDER-reported the keyboard
    // exactly when iOS had scrolled — so the sheet never got lifted far enough and its top stayed off-screen.
    const onVV=()=>{ kbOffset = kbActive ? Math.max(0, window.innerHeight - vv.height) : 0; applyKb(); };
    vv.addEventListener("resize", onVV); vv.addEventListener("scroll", onVV);
    document.addEventListener("focusin", e=>{ const t=e.target; if(t && (t.tagName==="TEXTAREA" || t.tagName==="INPUT")){ kbActive=true; onVV();
      // v1.38: iOS settles the keyboard/viewport over a few frames — re-pin across that window so the
      // sheet lands correctly however long the animation takes (a single scrollTo was too weak).
      [60,160,320,500].forEach(ms=>setTimeout(onVV, ms)); } });
    document.addEventListener("focusout", (e)=>{ kbActive=false; kbOffset=0; applyKb();
      /* v1.47: the accessory bar's ✓ blurs the field instead of firing Enter, so the sheet used to sit
         there with no keyboard — a stub of the focus area stuck to the bottom of the screen. Treat it
         as the same "done" gesture the return key is. Deferred a frame because focus moving BETWEEN
         controls inside the sheet (the name field, a chip) also fires focusout, and only a blur that
         lands outside the sheet means the user is finished. */
      if(!addOpen) return;
      /* v1.50: not while the open is still staging, and not before the sheet has ever had focus —
         see `_addFocused`. Otherwise the blur caused by hiding the floating pill reads as "done". */
      if(_addPhase2 || !_addFocused) return;
      /* v1.56 item 2: `relatedTarget` already says where focus is going. When it lands outside the
         sheet — which is exactly what iOS's accessory-bar ✓ does, blurring to nothing — there is
         nothing to disambiguate and nothing to wait for, so the close starts on the next frame
         instead of 120ms later. That 120ms was the whole reason this exit looked different from
         Cancel: the keyboard's own retraction is roughly 250ms, so by the time the sheet began to
         move it had already gone. It now starts while the keyboard is still on its way down.
         The deferral is kept for the ambiguous case (focus moving between controls in the sheet),
         where it is still the only way to tell the two apart. */
      const sheet0=document.getElementById("addSheet");
      const rt=e && e.relatedTarget;
      const goingOutside = !rt || !(sheet0 && sheet0.contains(rt));
      const finish=()=>{
        if(!addOpen) return;
        const sheet=document.getElementById("addSheet"); if(!sheet) return;
        const a=document.activeElement;
        if(a && a!==document.body && sheet.contains(a)) return;   // moved to another control in the sheet
        commitAddSheet();
      };
      if(goingOutside) requestAnimationFrame(finish); else setTimeout(finish, 120);
    });
  }
  document.addEventListener("click", (e)=>{
    if(quickEdit && !e.target.closest(".qpanel") && !e.target.closest("[data-qmore]")){ quickEdit=null; render(); }
  });
}

let __saveWarned = 0;
async function save(){
  if(_itemSigsFor !== listCode) resetItemSigs();   // v2.51 S8: stamp what changed since the last merge, tombstone what went
  state.itemTomb = state.itemTomb || {};
  stampItems(state.items || [], _itemSigs, state.itemTomb, Date.now());
  state.itemTomb = pruneTomb(state.itemTomb, Date.now());
  try { localStorage.setItem(LS.cache, JSON.stringify(state)); } catch(e){}
  if(!configured || !listRef) return;   // v2.54: !listRef — the database starts after App Check (a change made before is merged in by the first snapshot)
  if(_newerData) return;   // never write over a newer app's data
  syncing = true;
  if(splitOn()){   // v2.58: only the items that changed, and the list record only when it changed (a tick is ONE small write)
    try {
      const code = listCode, writes = [];
      /* until the first items snapshot this phone does not know what the server holds — it would re-send every item. A change
         made meanwhile is stamped (ts) and written by the merge that snapshot runs. */
      if(_itemsSeen) (state.items||[]).forEach(it => { const id = String(it && it.id); if(!okItemId(id)) return;
        const r = _remoteItems.get(id);
        if(!r || r.gone || r.sig !== _isig(it) || r.ts !== (+it.ts||0)) writes.push({ ref: ref("lists", code, "items", id), data: Object.assign({}, it, { id }) }); });
      if(_itemsSeen) Object.entries(state.itemTomb||{}).forEach(([id,t]) => { if(!okItemId(id)) return; const r = _remoteItems.get(id);
        if(!(r && r.gone)) writes.push({ ref: ref("lists", code, "items", id), data: { id, gone:t } }); });
      /* v2.75: each moved part, after its first snapshot — only the records that differ from the server's */
      MOVED_PARTS.forEach(n => { if(partOn(n) && _partsSeen[n]) writes.push(...partWrites(n, code)); });
      if(writes.length) await putMany(writes);
      if(_frozenItems !== null){   // no list snapshot yet: items only
        const anyMoved = MOVED_PARTS.some(partOn), fz = _frozenParts;
        const doc = Object.assign(listDoc(state), { items:_frozenItems||[], itemTomb:_frozenTomb||{}, shopping:state.shopping||{}, parts:state.parts, v: anyMoved ? 4 : 3 });
        /* v2.75: a moved part's arrays stay as they were when it moved (the record stops growing) */
        if(partOn("regulars") && fz.regulars){ doc.buyAgain = fz.regulars.buyAgain; doc.baTomb = fz.regulars.baTomb; }
        if(partOn("prices") && fz.prices) doc.prices = fz.prices;
        if(partOn("spend") && fz.spend) doc.spend = fz.spend;
        const sig = JSON.stringify(Object.assign({}, doc, { items:0, itemTomb:0 }, partOn("regulars") ? { buyAgain:0, baTomb:0 } : {}, partOn("prices") ? { prices:0 } : {}, partOn("spend") ? { spend:0 } : {}));
        if(sig !== _lastDocSig){ await put(listRef, doc); _lastDocSig = sig; } } }
    catch(e){ console.error(e);
      if(Date.now()-__saveWarned > 5000){ __saveWarned = Date.now(); showToast("⚠︎ Not syncing — check Firestore rules"); } }
    return; }
  try { await put(listRef, Object.assign(listDoc(state), { shopping: state.shopping||{}, itemTomb: state.itemTomb||{}, v: 2 })); }   // v2.49: only the fields the app knows (the rules refuse others)
  catch(e){ console.error(e);
    if(Date.now()-__saveWarned > 5000){ __saveWarned = Date.now(); showToast("⚠︎ Not syncing — check Firestore rules"); } }
}
function showToast(msg){
  msg=t(msg);   // v2.45 a fixed message has its French in js/i18n.js; one built with values stays English
  toast=msg; toastAction=null;
  /* v1.46: a full render() would tear the focused search bar out of the document and drop the
     keyboard mid-add (reported for "Buy again"). While the sheet owns the screen, put the toast
     straight into the DOM instead — no re-render, so focus is never disturbed. */
  const as=document.getElementById("addSheet");
  if(addOpen && as){
    let t=document.getElementById("toast");
    if(!t || t.parentNode!==as){ t=document.createElement("div"); t.className="toast"; t.id="toast"; as.appendChild(t); }
    t.innerHTML=`<span>${esc(msg)}</span>`;
    /* .toast is position:fixed with left:50%/transform:translate(-50%,0) and a keyframe animation
       that also translates -50%. .addsheet.vvpin is position:fixed, so position:absolute anchors
       here to the sheet — but the centering has to be fully cancelled: the animation would beat the
       inline transform, hence animation:none, and width:fit-content keeps the pill shape now that
       left:0/right:0 would otherwise stretch it edge to edge. */
    t.style.position="absolute"; t.style.left="0"; t.style.right="0"; t.style.bottom="auto";
    t.style.top="14px"; t.style.margin="0 auto"; t.style.transform="none"; t.style.zIndex="60";
    t.style.animation="none"; t.style.width="fit-content"; t.style.maxWidth="calc(100% - 28px)";
    clearTimeout(_toastT);
    _toastT=setTimeout(()=>{ toast=null; const e=document.getElementById("toast"); if(e && e.parentNode) e.parentNode.removeChild(e); },1700);
    return;
  }
  render(); clearTimeout(_toastT); _toastT=setTimeout(()=>{ toast=null; render(); },1700);
}
function snapState(){ return JSON.parse(JSON.stringify(state)); }
function syncChip(){
  if(!configured) return "";
  /* v1.43 item 3: a permanent "Synced" badge is noise — it says nothing 99% of the time, and the
     header's left slot now carries the store instead. Only render when there is news to give. */
  let cls="", label="";
  if(!netOnline){ cls="off"; label="Offline · saved"; }
  else if(syncing){ cls="sav"; label="Saving…"; }
  else return "";
  return `<span class="syncchip ${cls}"><span class="dotind"></span>${label}</span>`;
}
/* v1.43 item 3: the store you are standing in is the header's most useful fact — show it top-left
   next to the list name. `activeStore()` already resolves the manual pick or the geofence match. */
function locChip(){ const s=activeStore(); if(!s || !s.name) return "";
  return `<span class="locchip">${s.id==="home"?HOME_SVG(14):PIN_SVG(14)} ${esc(storeName(s))}</span>`; }
function showUndo(prev, msg){
  undoSnap = prev; toast = msg;
  toastAction = { label:"Undo", fn:()=>{ if(undoSnap){ state = undoSnap; undoSnap=null; } toast=null; toastAction=null; clearTimeout(_toastT); save(); render(); } };
  render(); clearTimeout(_toastT);
  _toastT = setTimeout(()=>{ toast=null; toastAction=null; undoSnap=null; render(); }, 5000);
}

/* ---- actions ---- */
function addEntries(text, override){
  if(!override && addOpen && addFromCat) override = addFromCat;   // v2.37: typed in the sheet opened from a category's "+" tile — it goes in that category
  const parsed = parseInput(text); if(!parsed.length) return;
  for(const e of parsed){
    const cat = override || e.cat;
    const ex = state.items.find(i=>!i.checked && i.name.toLowerCase()===e.name.toLowerCase() && !noteKey(i.note));   // v2.70: never fold a plain name into one with a note
    if(ex){ if(e.qty>1) ex.qty=(ex.qty||1)+e.qty; if(e.weight) ex.weight=e.weight; markDirty(ex.id); continue; }
    const nid=uid();
    const known = knownEntry(e.name);
    const wt = e.weight || (known&&known.weight) || "";
    if(cat){ state.items.push({id:nid,name:e.name,qty:e.qty,cat:override ? cat : newCat(cat, e.name),sub:(known&&known.cat===cat&&known.sub)||"",weight:wt,checked:false,by:me}); histLog("add", e.name); }
    else { const g=(known&&known.cat)||guessCat(e.name); state.items.push({id:nid,name:e.name,qty:e.qty,cat:newCat(g||"others", e.name),sub:(known&&known.sub)||"",weight:wt,checked:false,by:me}); histLog("add", e.name); }
    markDirty(nid);
  }
  save(); renderKeepingAdd();
}
/* v2.72: when the first tick makes the cart bar appear, the list drops and a quick second tap at the same spot lands
   on the cart's head and unfolds it. The head ignores a tap while the bar is still sliding in (its .drop animation,
   ≈0.3 s) — only then does the list move; a tap on a cart already there is always taken. Tied to the animation, not a
   clock, so a slow phone (or test runner) that draws late is not penalised. var: read before any tick. */
var _lastTickAt = 0, _cartDropping = false;
function toggleItem(id){ _lastTickAt = Date.now(); const it=state.items.find(i=>i.id===id); if(it){
  if(!it.checked){ lastPop=id; playTick(true); vibrate(8); setTimeout(()=>{ if(lastPop===id) lastPop=null; },350); }
  else { playTick(false); vibrate(5); }
  it.checked=!it.checked; if(it.checked){ it.checkedBy=me; it.checkedAt=Date.now(); it.checkedStore = (()=>{ const s=activeStore(); return (s && isRealStore(s.id)) ? s.id : ""; })(); if(it.checkedStore) onbVisit(it.checkedStore); shoppingMark(); /* v2.23 R19 — v2.29: the AI order learns at the finish (sweep), not here */ } markDirty(id); save(); render(); } }
/* A24 shared Buy-again is conflict-free across devices. Each entry carries a `ts`
   (last-touched) and deletions are recorded as tombstones in `state.baTomb`
   ({key: ts}). On every server snapshot we LWW-merge remote+local instead of
   letting the whole-doc write clobber the other person's additions — so items
   checked off on one phone can't silently vanish from another. Cap 250. */
const BA_CAP = 500;
/* v2.68 (the household): a Regular is its name, category AND note — "Chili · large, red" and "Chili · small, green" are two.
   noteKey makes the parts' order and case not matter. A Regular with no note keeps exactly the pre-v2.68 key, so stored
   tombstones (baTomb) and every Regular already saved stay valid. */
function noteKey(n){ return String(n||"").toLowerCase().split(",").map(x=>x.trim()).filter(Boolean).sort().join(","); }
function baKey(e){ const nk=noteKey(e.note); return (e.name||"").toLowerCase()+"|"+e.cat+(nk?"|"+nk:""); }
function baForget(name,cat,note){ (state.baTomb||(state.baTomb={}))[baKey({name,cat,note})] = Date.now(); }
function regFind(name,cat,note){ const k=baKey({name,cat,note}); return state.buyAgain.find(x=>baKey(x)===k); }
function regDrop(name,cat,note){ const k=baKey({name,cat,note}); state.buyAgain=state.buyAgain.filter(x=>baKey(x)!==k); }
/* an unticked list item that is this Regular: same name, category and note */
function itemIsReg(i,name,cat,note){ return !i.checked && (i.name||"").toLowerCase()===String(name||"").toLowerCase() && i.cat===cat && noteKey(i.note)===noteKey(note); }
function baMerge(listA, tombA, listB, tombB){
  const tomb = Object.assign({}, tombA||{});
  for(const k in (tombB||{})) tomb[k] = Math.max(tomb[k]||0, tombB[k]);
  const best = {};
  for(const e of (listA||[]).concat(listB||[])){ const k=baKey(e), ts=e.ts||0;
    if(!best[k] || ts >= (best[k].ts||0)) best[k] = Object.assign({}, e, {ts}); }
  const out = [];
  for(const k in best){ const e=best[k]; if((tomb[k]||0) > (e.ts||0)) continue; out.push(e); }
  out.sort((x,y)=>(y.ts||0)-(x.ts||0));
  for(const k in tomb){ if(best[k] && (tomb[k]||0) <= (best[k].ts||0)) delete tomb[k]; }   // re-added after delete → drop stale tombstone
  const cutoff = Date.now() - 120*864e5;                                                    // prune tombstones older than 120 days
  for(const k in tomb){ if(tomb[k] < cutoff) delete tomb[k]; }
  return { list: out.slice(0,BA_CAP), tomb };
}
function baSig(list, tomb){
  return (list||[]).map(e=>baKey(e)+"@"+(e.ts||0)).sort().join(";")+"#"+Object.keys(tomb||{}).sort().map(k=>k+"@"+tomb[k]).join(";");
}
function purchMerge(A, B){                                          // B4 conflict-free union of two purchase-history maps
  const out={}, keys=new Set([...Object.keys(A||{}), ...Object.keys(B||{})]);
  for(const k of keys){ const a=(A||{})[k], b=(B||{})[k];
    const all=[...((a&&a.ts)||[]), ...((b&&b.ts)||[])].sort((x,y)=>x-y), ts=[];
    for(const t of all){ if(!ts.length || t-ts[ts.length-1] > 6*3600000) ts.push(t); }   // collapse same-trip re-sweeps (<6h) across devices
    const aLast=(a&&a.ts&&a.ts.length)?a.ts[a.ts.length-1]:0, bLast=(b&&b.ts&&b.ts.length)?b.ts[b.ts.length-1]:0;
    const m = (b && bLast>=aLast) ? b : (a||b);                     // newer record wins for the cosmetic fields
    out[k]={ name:m.name, cat:m.cat, qty:m.qty||1, weight:m.weight||"", sub:m.sub||"", ts:ts.slice(-8) };
  }
  return out;
}
function purchSig(p){ return Object.keys(p||{}).sort().map(k=>k+"@"+((p[k].ts||[]).join(","))).join(";"); }
/* v2.09: price memory — what the household paid, per item, per store, per date, from receipts it chose
   to read. It lives in the list's own document (state.prices), so it is shared with the people on the
   list and nobody else. { key: [{ p, s, sn, d, q, w, t }] }, oldest first: p price in dollars, s store
   id ("" if not a saved store), sn store name, d YYYY-MM-DD, q qty, w weight, t when recorded. At most 8
   per item and 600 items, so the list document stays far under Firestore's 1 MiB limit.
   v2.72: also n the noteKey of the item's note (omitted when empty), u the unit price and per "kg" | "l" | "each"
   (what u is for). Records from before v2.72 have none of the three and are read as before. 12 per item now, since
   several notes (cubes, steak) share one name's bucket. */
const PRICE_PER_ITEM = 12, PRICE_ITEMS = 600;
function priceWord(w){ return (w.length>3 && /s$/.test(w) && !/ss$/.test(w)) ? (/ies$/.test(w) ? w.slice(0,-3)+"y" : w.slice(0,-1)) : w; }
function priceKey(name){ return String(name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(Boolean).map(priceWord).join(" "); }
function priceLastT(a){ return (a && a.length) ? (a[a.length-1].t||0) : 0; }
function priceRecord(name, rec){ const k=priceKey(name); if(!k) return;
  if(!state.prices || typeof state.prices!=="object") state.prices={};
  /* the same receipt read twice is one record, not two */
  const a=(state.prices[k]||[]).filter(x=>!(x.d===rec.d && x.sn===rec.sn && Math.abs((+x.p||0)-rec.p)<0.005));
  a.push(rec); state.prices[k]=a.slice(-PRICE_PER_ITEM);
  const ks=Object.keys(state.prices);
  if(ks.length>PRICE_ITEMS && !partOn("prices")){   // v2.75: the cap kept ONE record small; as records of their own, no key is evicted
    ks.sort((x,y)=>priceLastT(state.prices[x])-priceLastT(state.prices[y])); ks.slice(0, ks.length-PRICE_ITEMS).forEach(x=>{ delete state.prices[x]; }); } }
/* whole-word containment either way: the receipt's "free range egg" answers for the list's "egg" */
function priceWordsIn(a, b){ return (" "+b+" ").indexOf(" "+a+" ")>=0; }
function priceLookup(name){ const P=state.prices||{}, k=priceKey(name); if(!k) return null; if(P[k] && P[k].length) return P[k];
  let best=null; for(const key in P){ if(!(P[key]||[]).length) continue;
    if((k.length>=3 && priceWordsIn(k,key)) || (key.length>=3 && priceWordsIn(key,k))){ if(!best || priceLastT(P[key])>priceLastT(best)) best=P[key]; } }
  return best; }
function priceMoney(p){ return "$"+(Math.round((+p||0)*100)/100).toFixed(2); }
/* v2.72: a weight as written ("3.180 kg", "500g", "2 L") → { per:"kg"|"l", amt } in kilos or litres, else null */
function priceAmt(w){ const m=String(w||"").toLowerCase().replace(",",".").match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/); if(!m) return null;
  const v=parseFloat(m[1]); if(!(v>0)) return null;
  return (m[2]==="kg"||m[2]==="g") ? { per:"kg", amt:m[2]==="g"?v/1000:v } : { per:"l", amt:m[2]==="ml"?v/1000:v }; }
/* v2.72: the best record for an item { name, note }: same note first, else one with no note (any note when the item has
   none); within that, the newest at store sid, else the newest anywhere. An item WITH a note whose every record has a
   different note gets null — a cubes estimate from a steak price is worse than none. */
function priceFor(item, sid){ const a=priceLookup(item && item.name); if(!a || !a.length) return null;
  const nk=noteKey(item.note);
  const pick=f=>{ let r=null; for(let k=a.length-1;k>=0;k--){ if(f(a[k]) && sid && a[k].s===sid){ r=a[k]; break; } }
    if(!r) for(let k=a.length-1;k>=0;k--){ if(f(a[k])){ r=a[k]; break; } } return r; };
  if(!nk) return pick(()=>true);
  return pick(x=>x.n===nk) || pick(x=>!x.n) || null; }
/* v2.72: what a record says it cost — "$32.99/kg", "$2.50 each", or the line total for old records */
function priceUnitTxt(r){ if((r.per==="kg"||r.per==="l") && +r.u>0) return priceMoney(r.u)+(r.per==="kg"?"/kg":"/L");
  if(r.per==="each" && (+r.q||1)>1 && +r.u>0) return tf("{x} each", { x:priceMoney(r.u) });
  return priceMoney(r.p); }
/* v2.17: what the cart is likely to cost, from the prices this household has read off its receipts. Each item uses
   its newest price at the store you are in (else its newest anywhere), as a unit price times the quantity on the
   list. Items with no price are left out and counted, so the total never pretends to be complete. */
function cartEstimate(){ const s=activeStore(), sid=(s && s.id) || "";
  let total=0, priced=0, n=0;
  for(const i of state.items){ if(!i.checked) continue; n++;
    const r=priceFor(i, sid); if(!r) continue;
    /* v2.72: a price per kilo / litre times the item's weight ("800g" → 0.8, 3 × "200g" → 0.6); with no readable
       weight, what that purchase cost, once. Per item (and old records with no per): unit × qty, as before. */
    if((r.per==="kg"||r.per==="l") && +r.u>0){ const w=priceAmt(i.weight);
      if(w && w.per===r.per){ total+=(+r.u)*w.amt*Math.max(1, +i.qty||1); priced++; }
      else if(+r.p>0){ total+=+r.p; priced++; }
      continue; }
    const unit=(+r.p||0)/Math.max(1, +r.q||1); if(!(unit>0)) continue;
    total+=unit*Math.max(1, +i.qty||1); priced++; }
  return { total:Math.round(total*100)/100, priced, n }; }
function priceDay(d){ try{ return new Date(d+"T00:00:00").toLocaleDateString(dateLoc(),{day:"numeric",month:"short"}); }catch(e){ return d||""; } }
/* "Last paid $5.50 at Coles Dandenong · 2 Oct", plus the latest at up to two other stores. */
function priceLine(name, o){ const a=priceLookup(name); if(!a || !a.length) return "";
  /* v2.72: o.note picks the last record the way priceFor does; a per-kilo record shows its unit price */
  const last=priceFor({ name, note:(o && o.note)||"" }, ""); if(!last) return "";
  /* v2.70: compact — one muted line for the Edit item title row: the last price and its shop */
  if(o && o.compact){ const l=last; return `<span class="pricemem pricemem-c">${priceUnitTxt(l)}${l.sn?` · ${esc(l.sn)}`:""}</span>`; }
  const seen={}, others=[]; seen[last.sn||""]=1;
  for(let i=a.length-2;i>=0 && others.length<2;i--){ const x=a[i]; if(seen[x.sn||""]) continue; seen[x.sn||""]=1; others.push(x); }
  return `<div class="pricemem">Last paid <b>${priceUnitTxt(last)}</b>${last.sn?` at ${esc(last.sn)}`:""} · ${esc(priceDay(last.d))}${others.map(x=>`<span class="pricemem-o">${priceMoney(x.p)}${x.sn?` at ${esc(x.sn)}`:""} · ${esc(priceDay(x.d))}</span>`).join("")}</div>`; }
/* a receipt line ticks off the list item it names — same whole-word rule, unchecked items only */
function rcMatchItem(name, used){ const k=priceKey(name); if(!k) return null;
  return state.items.find(i=>!i.checked && !(used && used.has(i.id)) && (()=>{ const ik=priceKey(i.name); return ik && (ik===k || (ik.length>=3 && priceWordsIn(ik,k)) || (k.length>=3 && priceWordsIn(k,ik))); })()) || null; }
function moveToBuyAgain(entries){
  state.baTomb = state.baTomb || {};
  for(const e of entries){ const k=baKey(e);
    const old=state.buyAgain.find(x=>baKey(x)===k);   // v2.56: a Regular keeps its place (pos) when it is saved again
    state.buyAgain = state.buyAgain.filter(x=>baKey(x)!==k);
    delete state.baTomb[k];
    const ne={name:e.name,cat:e.cat,qty:e.qty||1,weight:e.weight||"",sub:e.sub||"",note:e.note||"",where:e.where||"",ts:Date.now()};
    if(regTags(old).length) ne.tags=regTags(old);   // v2.76: the Regular's own flags stay; the trip's flags do not become the Regular's
    if(old && typeof old.pos==="number") ne.pos=old.pos;
    state.buyAgain.unshift(ne); }
  state.buyAgain = state.buyAgain.slice(0,BA_CAP);
}
function sweep(msg){ const checked=state.items.filter(i=>i.checked); if(!checked.length) return;
  const prev=snapState();
  /* v2.29: a tick is not a purchase until the shop is finished — a wrong tap, untapped or not, no longer teaches the
     shop order. The order is learned here, from what is still ticked, in the order it was ticked. */
  if(shopMode) checked.slice().sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).forEach(i=>aiRecordCheck(i.cat, i.name));
  lastCartSet(checked);   // v2.31: what was ticked, in tick order, for the receipt read afterwards to be matched against
  recordPurchase(checked.map(i=>({name:i.name,cat:i.cat,qty:i.qty||1,weight:i.weight||"",sub:i.sub||""})));   // B4 log purchase cadence
  moveToBuyAgain(checked.map(i=>({name:i.name,cat:i.cat,qty:i.qty||1,weight:i.weight||"",sub:i.sub||"",note:i.note||"",where:i.where||""})));
  for(const i of checked){ histLog("buy", i.name); histLog("regadd", i.name); }
  state.items = state.items.filter(i=>!i.checked);
  cardNudgeSet();   // v2.32 (item 13): the card, or an offer to add one, at the top of the page — above "Got the receipt?"
  aiPublish(); rcptNudgeSet(); shoppingClear(); save(); render(); showUndo(prev, msg || (checked.length+" saved to Regulars")); }   // v2.10: msg from autoFinishAt
/* v1.10 add-sheet variant of restore(): copies the regular onto the list but KEEPS it in
   Buy-again, so the sheet row stays put and flips to ✓ (second tap bumps quantity). */
function addFromRegular(name,cat,note){ playPlan(true);
  const entry = regFind(name,cat,note) || {name,cat,qty:1,note:note||""};
  const ex = state.items.find(i=>itemIsReg(i,name,cat,note));
  if(!ex){ state.items.push({id:uid(),name:entry.name,qty:entry.qty||1,cat:entry.cat,weight:entry.weight||"",sub:entry.sub||"",note:entry.note||"",where:entry.where||"",tags:regTags(entry),checked:false,by:me}); histLog("add", entry.name); }
  save(); renderKeepingAdd();
}
function restore(name,cat,note){ playPlan(true);
  const entry = regFind(name,cat,note) || {name,cat,qty:1,note:note||""};
  const ex = state.items.find(i=>itemIsReg(i,name,cat,note));
  if(!ex){ state.items.push({id:uid(),name:entry.name,qty:entry.qty||1,cat:entry.cat,weight:entry.weight||"",sub:entry.sub||"",note:entry.note||"",where:entry.where||"",tags:regTags(entry),checked:false,by:me}); histLog("add", entry.name); }
  histLog("regrm", entry.name);
  regDrop(name,cat,note);
  save(); render();
}

/* item edit */
function saveEdit(){ if(!editing||!editing.name.trim()) return;
  applyEdit(); editing=null; save(); render(); }
function applyEdit(){   // v2.65: saveEdit's field updates, without closing (saveEverywhere uses it too)
  const it=state.items.find(i=>i.id===editing.id);
  if(it){ if(it.cat!==editing.cat) delete it.pos;   // v2.57 item 10a: a dragged place belongs to its category
    it.name=editing.name.trim(); it.qty=Math.max(1,editing.qty||1); it.cat=editing.cat; it.sub=editing.sub||null; it.starred=!!editing.starred; it.weight=editing.weight||""; it.tags=Array.isArray(editing.tags)?editing.tags:[]; it.note=String(editing.note||"").trim().slice(0,140); it.where=editing.where||""; } }
/* v2.65 (the household): one Save. An item on the list is saved there AND as a Regular; a Regular is saved as a Regular
   AND, when it is on the list (an unticked item of the same name and category), on the list too. */
function regularFrom(e, orig){ const nm=String(e.name||"").trim(); if(!nm) return false;
  state.baTomb = state.baTomb || {};
  const o=orig||e, oldK=baKey({ name:String(o.name||"").trim(), cat:o.cat, note:o.note }), newK=baKey({ name:nm, cat:e.cat, note:e.note });   // v2.68: the note is part of the key
  let idx=state.buyAgain.findIndex(x=>baKey(x)===oldK); const byOrig=idx>=0;
  if(idx<0) idx=state.buyAgain.findIndex(x=>baKey(x)===newK);
  const old = idx>=0 ? state.buyAgain[idx] : null;
  if(byOrig && oldK!==newK) baForget(o.name, o.cat, o.note);   // renamed, moved or re-noted → forget the old key (a Regular already at the new key is merged: the filter below drops it, the newer fields win)
  state.buyAgain = state.buyAgain.filter(x=>x!==old && baKey(x)!==newK);
  delete state.baTomb[newK];
  const ne={ name:nm, cat:e.cat, qty:Math.max(1,e.qty||1), weight:e.weight||"", sub:e.sub||"", note:String(e.note||"").trim().slice(0,140), where:e.where||"", ts:Date.now() };
  if(old && old.cat===e.cat && typeof old.pos==="number") ne.pos=old.pos;   // v2.56: a Regular keeps its place in the same category
  if(regTags(old).length) ne.tags=regTags(old);   // v2.76: the Regular keeps its own flags (a list item's flags are for this trip)
  if(old) state.buyAgain.splice(Math.min(idx, state.buyAgain.length), 0, ne); else state.buyAgain.unshift(ne);
  state.buyAgain = state.buyAgain.slice(0,BA_CAP);
  if(!old) histLog("regadd", nm);
  return true; }
function saveEverywhere(){ if(!editing) return;
  if(editing.kind==="item"){ if(!(editing.name||"").trim()) return;
    const it=state.items.find(i=>i.id===editing.id); const orig = it ? { name:it.name, cat:it.cat, note:it.note||"" } : null;   // before applyEdit changes it
    applyEdit();
    regularFrom({ name:editing.name, cat:editing.cat, qty:editing.qty, weight:editing.weight, sub:editing.sub, note:editing.note, where:editing.where }, orig);
    editing=null; save(); render(); showToast(tf("Saved — also in Regulars")); return; }
  const nm=(editing.name||"").trim(); if(!nm) return;
  const li=state.items.find(i=>itemIsReg(i, editing.origName, editing.origCat, editing.origNote));   // v2.68: and the same note
  if(li){ if(li.cat!==editing.cat) delete li.pos;
    li.name=nm; li.qty=Math.max(1,editing.qty||1); li.cat=editing.cat; li.weight=editing.weight||"";
    if(editing.note!==undefined) li.note=String(editing.note||"").trim().slice(0,140);
    if(editing.where!==undefined) li.where=editing.where||"";
    markDirty(li.id); }
  saveBA(); }
function removeEditing(){ moveToBuyAgain([{name:editing.name,cat:editing.cat,qty:editing.qty||1,weight:editing.weight||"",sub:editing.sub||"",note:editing.note||"",where:editing.where||""}]);
  histLog("rm", editing.name); histLog("regadd", editing.name);
  state.items = state.items.filter(i=>i.id!==editing.id); editing=null; save(); render(); }
function deleteItemEditing(){ const prev=snapState(); const nm=editing.name; const ct=editing.cat; const _it0=state.items.find(i=>i.id===editing.id); const nt=_it0?(_it0.note||""):(editing.note||"");
  state.items = state.items.filter(i=>i.id!==editing.id);
  baForget(nm, ct, nt); regDrop(nm, ct, nt);   // v1.37 item 6: Delete also drops it from Regulars ("Buy again" is the keep-it button)
  histLog("del", nm); histLog("regrm", nm);
  editing=null; save(); render(); showUndo(prev, esc(nm)+" deleted"); }

/* buy-again edit */
/* v2.76 (the household): a Regular keeps its own Urgent / If on sale (tags), set in its Edit item and carried onto the list
   each time it is added. Only these two flags travel; a list item's own flags never change its Regular. */
function regTags(e){ return (e && Array.isArray(e.tags)) ? e.tags.filter(k=>k==="urgent"||k==="discount") : []; }
function saveBA(){ const nm=(editing.name||"").trim(); if(!nm) return; const cat=editing.cat; const qty=Math.max(1,editing.qty||1);
  state.baTomb = state.baTomb || {};
  const _old=regFind(editing.origName, editing.origCat, editing.origNote);   // v2.56: keep its pos in the same category
  const _nt=String(editing.note!==undefined ? editing.note : ((_old && _old.note) || "")).trim().slice(0,140);
  const newK=baKey({name:nm,cat,note:_nt}), oldK=baKey({name:editing.origName,cat:editing.origCat,note:editing.origNote});   // v2.68: the note is part of the key
  state.buyAgain = state.buyAgain.filter(x=>x!==_old && baKey(x)!==newK);   // v2.68: a Regular already at the new key is merged into this one (newer fields)
  if(oldK!==newK) baForget(editing.origName, editing.origCat, editing.origNote);   // renamed or re-noted → forget the old key
  delete state.baTomb[newK];
  { const ne={name:nm,cat,qty,weight:editing.weight||"",sub:editing.sub||"",ts:Date.now()};
    if(_nt) ne.note=_nt;   // v2.57 item 9d: the Note section edits a Regular's note too
    { const w = editing.where!==undefined ? editing.where : ((_old && _old.where) || ""); if(w) ne.where=w; }   // v2.56: the fixed-shape trap; v2.76: Where to buy is edited here too
    { const tg = regTags(editing.tags!==undefined ? editing : _old); if(tg.length) ne.tags=tg; }   // v2.76: the Regular's own flags
    if(_old && _old.cat===cat && typeof _old.pos==="number") ne.pos=_old.pos;
    state.buyAgain.unshift(ne); }
  editing=null; save(); render(); }
function removeBAfromSheet(){ baForget(editing.origName, editing.origCat, editing.origNote);
  regDrop(editing.origName, editing.origCat, editing.origNote);
  editing=null; save(); render(); }
function restoreEditingToList(){ const nm=(editing.name||"").trim()||editing.origName; const cat=editing.cat; const qty=Math.max(1,editing.qty||1);
  regDrop(editing.origName, editing.origCat, editing.origNote);
  const ex=state.items.find(i=>!i.checked && i.name.toLowerCase()===nm.toLowerCase() && i.cat===cat);
  if(!ex) state.items.push({id:uid(),name:nm,qty,cat,weight:editing.weight||"",sub:editing.sub||"",checked:false,by:me});
  editing=null; save(); render(); }

/* category edit */
function moveCat(id, ni){ const cs=catList(); const i=cs.findIndex(c=>c.id===id);
  if(i<0||ni<0||ni>=cs.length) return; const [c]=cs.splice(i,1); cs.splice(ni,0,c); save(); render(); }
function saveCatEdit(){ const c=catList().find(x=>x.id===editing.id);
  if(c){ const nm=(editing.label||"").trim(); if(nm) c.label=nm; if(editing.color) c.color=editing.color;
    const em=(editing.emoji||"").trim(); if(em){ c.emoji=em; c.img=""; } else { c.img=editing.img||""; } }
  editing=null; save(); render(); }
function saveCatEditQuiet(){ const c=catList().find(x=>x.id===editing.id);
  if(c){ const nm=(editing.label||"").trim(); if(nm) c.label=nm; if(editing.color) c.color=editing.color;
    const em=(editing.emoji||"").trim(); if(em){ c.emoji=em; c.img=""; } else { c.img=editing.img||""; } } }
function moveSub(catId, subId, dir){ const c=catList().find(x=>x.id===catId); if(!c||!c.subs) return;
  const i=c.subs.findIndex(s=>s.id===subId); const ni=i+dir; if(i<0||ni<0||ni>=c.subs.length) return;
  const [s]=c.subs.splice(i,1); c.subs.splice(ni,0,s); save(); render(); }
function removeCat(id){ const cs=catList(); if(cs.length<=1){ showToast("Keep at least one category"); return; }
  const target = (id!=="others" && CAT("others")) ? "others" : cs.find(c=>c.id!==id).id;
  if(!confirm('Remove this category? Its items move to "'+CAT(target).label+'".')) return;
  const prev=snapState(); const nm=CAT(id)?CAT(id).label:"Category";
  state.items.forEach(it=>{ if(it.cat===id){ it.cat=target; it.sub=null; } });
  state.buyAgain.forEach(e=>{ if(e.cat===id) e.cat=target; });
  state.categories = cs.filter(c=>c.id!==id);
  editing=null; save(); render(); showUndo(prev, esc(nm)+" removed"); }
const NEW_CAT_COLORS=["#B5402B","#C98A06","#3E7C3A","#2E6FA3","#6B5CA5","#2E8C7F","#C73B5B","#8A5A2B","#5B6770","#7A6A3A","#4A6FA5"];
const PALETTE=["#B5402B","#E05A2B","#C98A06","#E0A800","#3E7C3A","#5BA84F","#2E8C7F","#2E6FA3","#4A6FA5","#6B5CA5","#9C3E8C","#C73B5B","#8A5A2B","#5B6770","#3A3A3A"];
function addCategory(){ editing={ kind:"newcat", label:"", emoji:"🛒", img:"", subs:[], iconManual:false, color: NEW_CAT_COLORS[catList().length % NEW_CAT_COLORS.length] }; render(); }
function createCategoryFromSheet(){ const name=(editing.label||"").trim(); if(!name){ showToast("Name the category"); return; }
  const cs=catList(); const color=editing.color || NEW_CAT_COLORS[cs.length % NEW_CAT_COLORS.length];
  cs.push({ id:uid(), label:name, color, emoji:(editing.img?"":(editing.emoji||"🛒")), img:editing.img||"", subs:[], custom:true });
  editing=null; save(); render(); }
// Inline category/subcategory creation shared by the item editor and smart-add. Returns the new id.
function makeCategory(name){ const nm=(name||"").trim(); if(!nm) return null; const cs=catList(); const id=uid();
  cs.push({ id, label:nm, color:NEW_CAT_COLORS[cs.length % NEW_CAT_COLORS.length], emoji:"🛒", img:"", subs:[], custom:true }); save(); return id; }
function makeSub(catId, name){ const nm=(name||"").trim(); if(!nm) return null; const c=catList().find(x=>x.id===catId); if(!c) return null;
  if(!Array.isArray(c.subs)) c.subs=[]; const id=uid(); c.subs.push({ id, label:nm }); save(); return id; }
const PIC_TAGS = { "milk.png":"milk dairy fresh egg cheese", "cross.png":"health medicine pharmacy supplement vitamin", "ramen.png":"asian noodle ramen rice", "hammer.png":"hardware tool hammer diy" };
function relevantIcons(ed){ const lab=(ed.label||"").toLowerCase().trim();
  const match=k=> lab && k.split(" ").some(w=>w===lab||lab.includes(w)||w.includes(lab));
  const out=[];
  ALL_PICS.forEach(src=>{ if(match(PIC_TAGS[src]||"")) out.push({img:src}); });
  EMOJI_LIB.forEach(x=>{ if(match(x.k)) out.push({e:x.e}); });
  return out;
}
// Built-in icon files live in img/; category .img values are stored bare (e.g. "milk.png")
// in synced/cached state, so resolve the folder only at render time. Custom uploads (data:),
// absolute URLs, and already-pathed values pass through untouched.
function assetURL(src){ return (!src || /^(data:|https?:|\/|img\/)/.test(src)) ? src : "img/"+src; }
function dispImg(src){ if(theme==="dark" && DARK_VARIANTS[src]) src=DARK_VARIANTS[src]; return assetURL(src); }
function editColor(){ if(editing.color) return editing.color;
  if(editing.kind==="cat"){ const c=CAT(editing.id); if(c&&c.color) return c.color; }
  return "#6B5CA5"; }
function iconEditorHTML(){ const col=editColor();
  return `<button class="iconbox" id="iconBox" style="background:${col};border-color:${col}">${editing.img?`<img src="${esc(dispImg(editing.img))}"/>`:`<span style="font-size:22px">${esc(editing.emoji||"🛒")}</span>`}</button>`;
}
function autoIcon(){ if(!editing || editing.iconManual) return;
  const best = relevantIcons(editing)[0];
  if(best){ if(best.img){ editing.img=best.img; editing.emoji=""; } else { editing.emoji=best.e; editing.img=""; } }
  const ib=app.querySelector("#iconBox");
  if(ib){ const col=editColor(); ib.style.background=col; ib.style.borderColor=col;
    ib.innerHTML = editing.img ? `<img src="${esc(dispImg(editing.img))}"/>` : `<span style="font-size:22px">${esc(editing.emoji||"🛒")}</span>`; } }
function cellHTML(s, col){ const sel = s.img ? editing.img===s.img : (!editing.img&&editing.emoji===s.e);
  const bc = sel?'#fff':col;
  return s.img
    ? `<button class="picopt ${sel?'sel':''}" data-pic="${esc(s.img)}" style="background:${col};border-color:${bc}"><img src="${esc(dispImg(s.img))}"/></button>`
    : `<button class="picopt ${sel?'sel':''}" data-emo="${s.e}" style="background:${col};border-color:${bc};color:#fff">${s.e}</button>`;
}
/* Row appears only when the icon is tapped. The left part is a horizontally scrollable
   window (~6 cells) through EVERY keyword-relevant picture/emoji, current selection first.
   😀 (native emoji keyboard) and ⬇ (upload) stay fixed on the right. */
function iconStripHTML(){ if(!editing.pickOpen) return ""; const col=editColor();
  const cur = editing.img ? {img:editing.img} : (editing.emoji ? {e:editing.emoji} : null);
  const rel = relevantIcons(editing).filter(x=> cur ? (x.img? x.img!==cur.img : x.e!==cur.e) : true);
  const ordered = [...(cur?[cur]:[]), ...rel];
  const cells = ordered.map(s=>cellHTML(s,col)).join("");
  const dl = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M6 11l6 6 6-6M4 21h16"/></svg>`;
  const palette = editing.colorOpen ? `<div class="palette" id="palette">
      ${PALETTE.map(c=>`<button class="swatch ${col.toLowerCase()===c.toLowerCase()?'sel':''}" data-color="${c}" style="background:${c}"></button>`).join("")}
      <label class="swatch customsw"><input type="color" id="catColor" value="${col}"/></label>
    </div>` : "";
  return `<div class="pickrow">
    <div class="picscroll" id="picStrip">${cells}</div>
    <button class="picopt picfix colorbtn ${editing.colorOpen?'on':''}" id="colorBtn" aria-label="Background colour" style="--cc:${col}"></button>
    <button class="picopt picfix uploadbtn" data-act="upload" aria-label="Upload from photos or files">${dl}</button>
  </div>${palette}`;
}
function bindStrip(){
  app.querySelectorAll("#picStrip [data-pic]").forEach(b=>b.onclick=()=>{ editing.img=b.dataset.pic; editing.emoji=""; editing.iconManual=true; render(); });
  app.querySelectorAll("#picStrip [data-emo]").forEach(b=>b.onclick=()=>{ editing.emoji=b.dataset.emo; editing.img=""; editing.iconManual=true; render(); });
  const cb=app.querySelector("#colorBtn"); if(cb) cb.onclick=()=>{ editing.colorOpen=!editing.colorOpen; render(); };
  app.querySelectorAll("#palette [data-color]").forEach(b=>b.onclick=()=>{ editing.color=b.dataset.color; editing.colorOpen=false; render(); });
  const ci=app.querySelector("#catColor"); if(ci){ ci.oninput=()=>{ editing.color=ci.value; render(); }; ci.onchange=()=>{ editing.color=ci.value; render(); }; }
  const f=app.querySelector("#iconFile"), ud=app.querySelector('[data-act="upload"]');
  if(ud&&f) ud.onclick=()=>f.click();
}
function refreshStrip(){ const wrap=app.querySelector("#stripWrap"); if(wrap){ wrap.innerHTML=iconStripHTML(); bindStrip(); } }
function wireIconEditor(){
  bindStrip();
  const ib=app.querySelector("#iconBox"), ek=app.querySelector("#emojiKbd");
  if(ib) ib.onclick=()=>{ editing.pickOpen=!editing.pickOpen; render(); };
  if(ek) ek.oninput=e=>{ const chars=[...(e.target.value||"")]; const ch=chars[chars.length-1];
    if(ch){ editing.emoji=ch; editing.img=""; editing.iconManual=true; } e.target.value=""; render(); };
  const f=app.querySelector("#iconFile");
  if(f) f.onchange=()=>{ const file=f.files&&f.files[0]; if(!file) return; const r=new FileReader();
    r.onload=()=>{ const im=new Image(); im.onload=()=>{ const cv=document.createElement("canvas"); cv.width=cv.height=64;
      const ctx=cv.getContext("2d"); const sc=Math.min(64/im.width,64/im.height); const w=im.width*sc,h=im.height*sc;
      ctx.clearRect(0,0,64,64); ctx.drawImage(im,(64-w)/2,(64-h)/2,w,h);
      editing.img=cv.toDataURL("image/png"); editing.emoji=""; editing.iconManual=true; render(); };
      im.src=r.result; };
    r.readAsDataURL(file); };
}
function addSub(catId){ const c=catList().find(x=>x.id===catId); if(!c) return; if(!Array.isArray(c.subs)) c.subs=[];
  const id=uid(); c.subs.push({ id, label:"" }); pendingSubFocus=id; save(); render(); }
function removeSub(catId, subId){ const c=catList().find(x=>x.id===catId); if(!c||!c.subs) return;
  c.subs=c.subs.filter(s=>s.id!==subId);
  state.items.forEach(it=>{ if(it.cat===catId && it.sub===subId) it.sub=null; });
  save(); render(); }

function join(name){ const c=name.trim(); if(!c) return;
  if(!state.members.includes(c)){ if(state.members.length>=4) return; state.members.push(c); }
  if(!localStorage.getItem(LS.me)) onbSet(o=>{ o.fresh=1; });   // v2.48 a phone giving its name for the first time is new: moments 1 and 2 are for it
  me=c; localStorage.setItem(LS.me,c); view="detail"; shopMode=false; save(); render(); takePendingOutside(); }   // first stop after joining: the list (planning) page
function toggleCat(id){ collapse.cats = collapse.cats.includes(id) ? collapse.cats.filter(x=>x!==id) : [...collapse.cats,id];
  localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); }
function toggleBA(){ collapse.ba=!collapse.ba; localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); }
function copyLink(){ const url=listURL(listCode);   // v2.44: listURL, so the link carries the join key
  if(hasShare()){ share({title:"Market List", text:"Join our shared grocery list", url}).catch(()=>{}); }
  else if(hasClipboard()){ copyText(url); showToast("Link copied"); }
  else { showToast("Copy this URL from the address bar"); } }
/* v2.25 R26 your data. Leave: your name off this list's people, then this phone forgets the list (its cache, learning,
   history and backups); the others keep it. Empty: what is in the list goes for everyone — Regulars by tombstone and the
   purchase history by the household-wide reset, so another phone's copy cannot merge them back; its name, people,
   categories and stores stay. This phone's daily backups can still bring it back. Forget: everything this phone keeps —
   every ml_ key, the database's offline copy, the app's stored files — then a fresh start. Shared lists are not touched. */
function forgetListHere(code){ const sfx = "_" + code;
  try{ for(const k of Object.keys(localStorage)) if(k.startsWith("ml_") && k.endsWith(sfx)) localStorage.removeItem(k); }catch(e){}
  saveLists(getLists().filter(x => x.code !== code)); }
function saveSoon(ms){ return Promise.race([Promise.resolve().then(() => save()).catch(() => {}), new Promise(r => setTimeout(r, ms || 2500))]); }   // a save that offline never confirms must not hold up leaving
async function leaveList(){ if(!me) return;
  if(!confirm(`Leave “${state.name || "this list"}”? Your name comes off it and this phone forgets it. The others keep the list.`)) return;
  state.members = (state.members || []).filter(m => m !== me); shoppingClear();
  await saveSoon(2500);
  _forgetting = true; const gone = listCode; forgetListHere(gone);
  acctWrite({ gone:{ [gone]:Date.now() } });   // v2.40: left on purpose, so the account does not bring it back
  try{ localStorage.removeItem(LS_LASTLIST); }catch(e){}
  const next = getLists()[0];
  location.href = next ? "/?list=" + encodeURIComponent(next.code) : "/"; }
function emptyList(){
  if(!confirm(`Empty “${state.name || "this list"}” for everyone? Items, Regulars, the plan, prices, spending, occasions and what the app has learned all go. The name, people, categories and stores stay.`)) return;
  if(!confirm("Sure? Everyone on the list loses it. Only this phone's daily backups could bring it back.")) return;
  const now = Date.now();
  state.baTomb = state.baTomb || {}; (state.buyAgain || []).forEach(e => { state.baTomb[baKey(e)] = now; }); state.buyAgain = [];
  state.items = []; state.plan = { days:{}, recipes:[] }; state.prices = {}; state.spend = []; state.clr = Object.assign({}, state.clr, { prices:now, spend:now });   /* v2.75: moved prices/spending are records — every phone drops the ones from before now. clr is written only once set, so an app on the old rules (which refuse a field they do not know) keeps saving until it is used */ state.templates = []; state.memb = {}; state.shopping = {}; state.aisle = {};
  applyPredictReset(now); state.predictReset = now;
  save(); render(); showToast("The list is empty"); }
async function forgetPhone(){
  if(!confirm("Forget everything on this phone? Every list, your name, your settings and the backups kept here go. The shared lists stay for the people on them — open a share link to come back.")) return;
  _forgetting = true;
  try{ if(_authM && _auth && _auth.currentUser && !_auth.currentUser.isAnonymous) _authM.signOut(_auth); }catch(e){}   // v2.40: signed out, but the account keeps its lists (none marked gone)
  try{ for(const k of Object.keys(localStorage)) if(k.startsWith("ml_")) localStorage.removeItem(k); }catch(e){}
  try{ sessionStorage.clear(); }catch(e){}
  try{ if(window.caches) for(const k of await caches.keys()) await caches.delete(k); }catch(e){}
  try{ if(window.indexedDB && indexedDB.databases) for(const d of await indexedDB.databases()) if(d && d.name) indexedDB.deleteDatabase(d.name); }catch(e){}
  setTimeout(() => { location.href = "/"; }, 400); }
/* v2.02: export what is saved in the current list as plain text, grouped by category. Weights are the
   stored text because the file is a record, not a display. */
function buildExportText(){
  const d=new Date().toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
  const cats=catList(); const known=new Set(cats.map(c=>c.id));
  const items=(state.items||[]).filter(i=>i&&String(i.name||"").trim());
  const ba=(state.buyAgain||[]).filter(i=>i&&String(i.name||"").trim());
  const line=i=>"  - "+((i.qty>1)?`${i.qty}× `:"")+(i.weight?i.weight+" ":"")+cap(i.name)+noteSuffix(i);
  const byName=(a,b)=>String(a.name).localeCompare(String(b.name),undefined,{sensitivity:"base"});
  const section=(title,list)=>{
    if(!list.length) return null;
    const groups=[];
    cats.forEach(c=>{ const g=list.filter(i=>i.cat===c.id); if(g.length) groups.push(c.label+"\n"+g.sort(byName).map(line).join("\n")); });
    const other=list.filter(i=>!known.has(i.cat)); if(other.length) groups.push("Other\n"+other.sort(byName).map(line).join("\n"));
    return `${title} (${list.length})\n\n`+groups.join("\n\n"); };
  const secs=[section("TO BUY",items.filter(i=>!i.checked)),section("IN THE CART",items.filter(i=>i.checked)),section("REGULARS",ba)].filter(Boolean);
  return `${state.name || "Market List"} — exported ${d}\n\n`+(secs.length?secs.join("\n\n"):"Nothing saved yet.")+"\n"; }
/* Share-with-a-file comes first because an iPhone home-screen app has no download folder. */
async function exportListText(){
  const txt=buildExportText(); const now=new Date(); const p=n=>String(n).padStart(2,"0");
  const base=String(state.name||"list").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"list";
  const fn=`${base}-${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}.txt`;
  try{ const f=new File([txt], fn, {type:"text/plain"});
    if(canShare({files:[f]})){ await share({files:[f], title:fn}); return; } }
  catch(e){ if(e && e.name==="AbortError") return; }
  try{ const url=URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"}));
    const a=document.createElement("a"); a.href=url; a.download=fn; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000); showToast(tf("Saved {x}", { x:fn })); }
  catch(e){ if(hasClipboard()){ try{ await copyText(txt); showToast("Copied the list as text"); }catch(_){ showToast("Could not export on this device"); } }
    else showToast("Could not export on this device"); } }
/* v2.15: backups. A list is one shared document, and Undo covers one action, not a bad afternoon. "Back up" writes
   the list to a file (JSON, so it can come back); the app also keeps one copy a day for a week on this phone.
   Restoring replaces the items, the plan, the prices and the stores for everyone on the list, and adds the
   backup's Regulars back. It never removes a Regular: Regulars merge across phones (baMerge), so a removal here
   would be undone by the next phone that syncs. Undo is offered straight after. The list code is never written
   into a backup — it is the key to the list. */
const SNAP_KEEP = 7;
function listDoc(s){ return Object.assign((s.clr && typeof s.clr==="object" && Object.keys(s.clr).length) ? { clr:s.clr } : {}, { items:s.items||[], buyAgain:s.buyAgain||[], baTomb:s.baTomb||{}, stores:s.stores||[], storeMeta:s.storeMeta||{},
  members:s.members||[], categories:s.categories===undefined?null:s.categories, name:s.name||"", baMeta:s.baMeta||null, predictReset:s.predictReset||0,
  purch:s.purch||{}, plan:s.plan||{days:{},recipes:[]}, prices:s.prices||{}, aisle:s.aisle||{}, memb:s.memb||{}, templates:Array.isArray(s.templates)?s.templates:[], spend:Array.isArray(s.spend)?s.spend:[], looks:(s.looks && typeof s.looks==="object") ? s.looks : {}, aislemap:(s.aislemap && typeof s.aislemap==="object") ? s.aislemap : {} }); }   // v2.23: occasions are kept; who is shopping is presence, not data — never backed up
function snapKey(code){ return "ml_snap_"+code; }
function snapList(code){ try{ const a=JSON.parse(localStorage.getItem(snapKey(code))||"[]"); return Array.isArray(a)?a.filter(x=>x && x.list && x.at):[]; }catch(e){ return []; } }
var _forgetting = false;   // v2.25: set by Leave and Forget — the page going hidden as it navigates away must not write a backup of what was just forgotten. var: boot-order rule
function maybeSnapshot(){ if(_forgetting) return; try{
  if(!state || !listCode) return;
  const has=(state.items||[]).length || (state.buyAgain||[]).length || ((state.plan&&state.plan.recipes)||[]).length;
  if(!has) return;
  const today=dayKey(new Date()), a=snapList(listCode);
  if(a[0] && a[0].day===today) return;
  let next=[{ day:today, at:Date.now(), v:APP_VERSION, list:JSON.parse(JSON.stringify(listDoc(state))) }, ...a].slice(0, SNAP_KEEP);
  for(;;){ try{ localStorage.setItem(snapKey(listCode), JSON.stringify(next)); break; }
    catch(e){ if(next.length<=1) break; next=next.slice(0,-1); } }   // over the storage quota: drop the oldest until it fits
}catch(e){} }
/* v2.57 item 4: move this list to the thirteen categories, asked for by the household, per list, from Settings › Lists & sharing.
   This is the ONE deliberate exception to "nothing stored is ever re-categorised" (v2.33): the person asks for it, for this list,
   and a backup is written first (even if one was taken today). Categories the household made stay, before Others. */
/* a backup written now, even if one was taken today (v2.57 switchToCats13, v2.58 maybeMigrate) */
function forceSnapshot(){
  try{ let next=[{ day:dayKey(new Date()), at:Date.now(), v:APP_VERSION, list:JSON.parse(JSON.stringify(listDoc(state))) }, ...snapList(listCode)].slice(0, SNAP_KEEP);
    for(;;){ try{ localStorage.setItem(snapKey(listCode), JSON.stringify(next)); break; }
      catch(e){ if(next.length<=1) break; next=next.slice(0,-1); } } }catch(e){} }
function switchToCats13(){
  if(!state || !listCode) return;
  forceSnapshot();
  const old = Array.isArray(state.categories) ? state.categories : [];
  const custom = old.filter(c=>!DEFAULT_CATS.some(d=>d.id===c.id) && !CATS13.some(d=>d.id===c.id));
  const oldMeat = old.find(c=>c.id==="meat");
  const fresh = CATS13.map(c=>({id:c.id,label:c.label,color:c.color,emoji:c.emoji,
    subs: c.id==="meat" ? ((oldMeat && Array.isArray(oldMeat.subs) && oldMeat.subs.length) ? oldMeat.subs.map(s=>({...s})) : MEAT_DEFAULT_SUBS.map(s=>({...s}))) : [] }));
  const oi = fresh.findIndex(c=>c.id==="others");
  if(oi>=0) fresh.splice(oi, 0, ...custom); else fresh.push(...custom);
  state.categories = fresh;
  const now = Date.now(), nine = new Set(DEFAULT_CATS.map(d=>d.id));
  (state.items||[]).forEach(i=>{ if(i && nine.has(i.cat)){ const c=newCat(i.cat, i.name); if(c!==i.cat){ i.cat=c; i.ts=now; markDirty(i.id); } } });
  (state.buyAgain||[]).forEach(b=>{ if(b && nine.has(b.cat)){ const c=newCat(b.cat, b.name); if(c!==b.cat){ b.cat=c; b.ts=now; } } });
  ensureCats(); save(); render();
  showToast(t("This list now uses the new categories"));
}
function backupFileName(){ const now=new Date(), p=n=>String(n).padStart(2,"0");
  const base=String(state.name||"list").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"list";
  return `${base}-backup-${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}.json`; }
async function backupToFile(){
  const txt=JSON.stringify({ app:"Market List", kind:"list-backup", format:1, appVersion:APP_VERSION, savedAt:new Date().toISOString(), list:listDoc(state) });
  const fn=backupFileName();
  try{ const f=new File([txt], fn, {type:"application/json"});
    if(canShare({files:[f]})){ await share({files:[f], title:fn}); return; } }
  catch(e){ if(e && e.name==="AbortError") return; }
  try{ const url=URL.createObjectURL(new Blob([txt],{type:"application/json"}));
    const a=document.createElement("a"); a.href=url; a.download=fn; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000); showToast(tf("Saved {x}", { x:fn })); }
  catch(e){ showToast("Could not save a backup on this device"); } }
/* the picker is attached to the page before it opens: iOS skips "change" on a detached file input (v2.11) */
function restorePick(){ pickFile({ accept:".json,application/json,text/plain" }).then(file=>{ if(!file) return;
    file.text().then(txt=>{ let d=null; try{ d=JSON.parse(txt); }catch(e){}
      if(!d || d.kind!=="list-backup" || !d.list || typeof d.list!=="object"){ showToast("That file isn't a Market List backup"); return; }
      const when=d.savedAt ? new Date(d.savedAt) : null;
      rst={ list:d.list, label:(when && !isNaN(when.getTime())) ? tf("The backup file from {x}", { x:when.toLocaleDateString(dateLoc(),{weekday:"long",day:"numeric",month:"long"}) }) : t("The backup file") }; render(); })
    .catch(()=>showToast("Couldn't read that file")); }); }
function restoreList(list, label){
  const prev=JSON.parse(JSON.stringify(state));
  const P=(list.plan && typeof list.plan==="object") ? list.plan : null;
  state.items = Array.isArray(list.items) ? list.items : [];
  if(P) state.plan = { days:P.days||{}, recipes:P.recipes||[], saved:Array.isArray(P.saved)?P.saved:[] };
  if(list.prices && typeof list.prices==="object") state.prices = list.prices; if(list.memb && typeof list.memb==="object") state.memb = list.memb; if(Array.isArray(list.templates)) state.templates = list.templates; if(Array.isArray(list.spend)) state.spend = list.spend; if(list.looks && typeof list.looks==="object") state.looks = list.looks; if(list.aislemap && typeof list.aislemap==="object") state.aislemap = list.aislemap;
  if(Array.isArray(list.stores)) state.stores = list.stores;
  if(list.storeMeta && typeof list.storeMeta==="object") state.storeMeta = list.storeMeta;
  if(list.categories!==undefined) state.categories = list.categories;
  const have=new Set((state.buyAgain||[]).map(b=>String(b&&b.name||"").toLowerCase()));
  state.buyAgain = state.buyAgain || [];
  (Array.isArray(list.buyAgain)?list.buyAgain:[]).forEach(b=>{ const k=String(b&&b.name||"").toLowerCase();
    if(k && !have.has(k)){ have.add(k); state.buyAgain.push(Object.assign({}, b, { ts:Date.now() })); } });
  save(); showUndo(prev, tf("Restored from {x}", { x:label.charAt(0).toLowerCase()+label.slice(1) })); }
/* v2.30 (item 13): say when backups happen. maybeSnapshot runs when the app goes to the background (visibilitychange → hidden), at most once a day, and keeps the last SNAP_KEEP. */
const SNAP_WHEN = "The app keeps one a day — taken the first time you leave the app each day — for the last seven days, on this phone only.";
function snapsHTML(){ const a=snapList(listCode);
  if(!a.length) return `<div class="snapnote">${t("Backups on this phone: none yet.")} ${t(SNAP_WHEN)}</div>`;
  return `<div class="snaphd">${t("Backups on this phone")}</div>` + a.map((s,i)=>{ const L=s.list||{}, n=(L.items||[]).length, m=(L.buyAgain||[]).length;
    const d=new Date(s.at).toLocaleDateString(dateLoc(),{weekday:"short",day:"numeric",month:"short"});
    return `<div class="snaprow"><span>${esc(d)} · ${n===1?tf("{n} item",{ n }):tf("{n} items",{ n })} · ${m===1?tf("{n} regular",{ n:m }):tf("{n} regulars",{ n:m })}</span><button class="storechip" data-snaprestore="${i}">${t("Restore")}</button></div>`; }).join("")
    + `<div class="snapnote">${t(SNAP_WHEN)} ${t("The newest was taken")} ${esc(new Date(a[0].at).toLocaleString(dateLoc(),{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}))}.</div>`; }
function rstSheet(){ const L=rst.list||{}, n=(L.items||[]).length, m=(L.buyAgain||[]).length, r=((L.plan&&L.plan.recipes)||[]).length;
  return `<div class="sheet-bg kbpin" id="rstBg"><div class="sheet" id="rstSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Restore this list?")}</div>
    <div class="rcnote">${esc(rst.label)}: ${n===1?tf("{n} item",{ n }):tf("{n} items",{ n })}, ${m===1?tf("{n} regular",{ n:m }):tf("{n} regulars",{ n:m })}, ${r===1?tf("{n} recipe",{ n:r }):tf("{n} recipes",{ n:r })}.</div>
    <div class="rcnote">${t("This replaces the list's items, plan and prices for everyone on it. Regulars in the backup are added back; none are removed. You can undo straight after.")}</div>
    <div class="ppedbtns"><button class="optaction" id="rstCancel">${t("Cancel")}</button><button class="newlist" id="rstGo">${t("Restore")}</button></div>
  </div></div>`; }
function wireRstSheet(){ if(!rst) return;
  const close=()=>{ rst=null; render(); };
  const bg=app.querySelector("#rstBg"); if(bg) bg.onclick=e=>{ if(e.target===bg) close(); };
  const c=app.querySelector("#rstCancel"); if(c) c.onclick=close;
  const g=app.querySelector("#rstGo"); if(g) g.onclick=()=>{ const L=rst.list, label=rst.label; rst=null; restoreList(L, label); }; }
/* v2.15: put the app on the Home Screen. In Safari it is a website: it does not open full screen, the service
   worker is all that stands between it and no signal, and Safari can clear its data after weeks without use.
   Installed, none of that applies. iPhone Safari has no install prompt, so a one-time card says how; where the
   browser offers a prompt (Android, desktop Chrome) the card's button opens it. Hidden for good once dismissed. */
let _bip=null;
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); _bip=e; try{ render(); }catch(_){} });
function isIOSDevice(){ const ua=navigator.userAgent||""; return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints>1); }
function installHintOn(){ try{ if(localStorage.getItem("ml_installhint")==="1") return false; }catch(e){ return false; }
  const standalone = navigator.standalone===true || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  if(standalone) return false;
  return !!_bip || (isIOSDevice() && navigator.standalone===false); }
function installCardHTML(){ if(!installHintOn()) return "";
  const ios=!_bip;
  return `<div class="installcard" id="installCard" role="note">
    <div class="ic-t">${t("Put Market List on your Home Screen")}</div>
    <div class="ic-b">${ios ? tf("Tap {s} <b>Share</b>, then <b>Add to Home Screen</b>.", { s:SHARE_SVG(15) }) : t("Install it as an app.")} ${t("It opens full screen, works without signal and keeps your settings.")}</div>
    <div class="ic-btns">${ios ? "" : `<button class="newlist" id="installGo">${t("Install")}</button>`}<button class="optaction" id="installDone">${ios ? t("Got it") : t("Not now")}</button></div>
  </div>`; }
function installDismiss(){ try{ localStorage.setItem("ml_installhint","1"); }catch(e){} render(); }
/* v2.10: the list to another app, from the Shop page — what is still to buy, grouped by category, as
   plain text the other app can show (Notes, WhatsApp, Messages). The full export stays in Settings. */
function buildShareText(){ const cats=catList(), known=new Set(cats.map(c=>c.id));
  const items=(state.items||[]).filter(i=>i && !i.checked && String(i.name||"").trim());
  const line=i=>"• "+((i.qty>1)?`${i.qty}× `:"")+(i.weight?i.weight+" ":"")+cap(i.name)+noteSuffix(i);
  const groups=[]; cats.forEach(c=>{ const g=items.filter(i=>i.cat===c.id); if(g.length) groups.push(c.label+"\n"+g.map(line).join("\n")); });
  const other=items.filter(i=>!known.has(i.cat)); if(other.length) groups.push("Other\n"+other.map(line).join("\n"));
  return `${state.name||"Shopping list"} — ${items.length} to buy\n\n`+(groups.length?groups.join("\n\n"):"Nothing to buy.")+"\n"; }
async function shareListText(){ const text=buildShareText();
  try{ if(hasShare()){ await share({ title: state.name||"Shopping list", text }); return; } }
  catch(e){ if(e && e.name==="AbortError") return; }
  try{ if(hasClipboard()){ await copyText(text); showToast("Copied the list — paste it into any app"); return; } }catch(e){}
  showToast("Could not share on this device"); }

/* ---- voice input (Web Speech API) ---- */
let recog=null, listening=false, micFinal="";
function setMicUI(on){ const b=document.getElementById("micBtn"); if(b) b.style.backgroundImage = on ? "url('img/mic-on.png')" : "";
  const f=micField(); if(f) f.style.color = on ? "var(--accent)" : ""; }
function micField(){ return document.getElementById("mainInput"); }
function grow(el){ if(!el) return; el.style.height="auto";
  /* v1.40 item 1: the +4px breathing room is what pushed the sheet's search bar to 55px when it must
     match the shop page's 47px pill. The search bar has its own padding already, so size it to the
     content exactly; every other growable field keeps the fudge. */
  const pad = (el.id==="mainInput") ? 0 : 4;
  el.style.height=Math.min(el.scrollHeight+pad,180)+"px";
  /* v1.40 item 1: syncZoomHeight() is a whole-page geometry pass — it re-measures the nav, the bars
     and re-pins the add sheet. Running it on every keystroke while the add sheet is open is what made
     typing and scrolling feel jerky and nudged the sheet around. The sheet pins itself; skip it. */
  if(addOpen && el.id==="mainInput") return;
  syncZoomHeight(); }
/* v1.10 bottom-first add sheet — Regulars (due-soon restock + Buy-again) and a built-in
   catalog, one-tap add, live-filtered by whatever is typed. Replaces the old top add bar. */
const SEARCH_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
/* v1.58 item 1: the three item flags get drawn marks instead of emoji. Emoji are still the app's
   visual language for CATEGORIES and items — these are status marks, which is a different job: they
   have to read at 13px next to a name, sit on a coloured tile, and take the tile's own text colour.
   `currentColor` is the whole point; an emoji cannot do any of that. Inline, so nothing is fetched. */
const FLAG_STAR_SVG = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>`;
/* a tag with a % in it — "only if it is on offer" */
/* v1.59 item 1: the % now fills the tag rather than hiding in a corner of it. The first version kept
   the tag's own detail — the little punch hole, a thin outline, a small % beside it — and at the size
   this actually renders (about 13px on a tile) all of that collapses into a grey smudge. The tag is
   only there to say "price"; the % is the information, so it gets the height. */
/* v1.61 item 1: the tag lies flat instead of standing on its 45° corner. Diagonally, the widest
   straight run inside the outline is the diagonal itself, so the % had to sit ON it and shrink to
   fit between the two edges. Horizontal, the body is a clear ~11×8 box and the % gets all of it —
   which is the whole reason the mark exists. The point and its hole move to the left so the % has
   the wide end to itself. */
/* v1.62 item 1: the % is now the same height as the text it sits beside. In a 24-square viewBox the
   symbol could only ever be a fraction of the icon's height; the box is 28×20 instead, with the %
   spanning 12 of those 20 units, so at 1.25em of icon the symbol lands at ~0.75em — a digit's
   height. The tag is sized around the symbol rather than the other way round. */
const FLAG_TAG_SVG = `<svg viewBox="0 0 28 20" height="1em" width="1.4em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M25.6 2.4H11.2c-.44 0-.86.17-1.17.47l-6.6 6.4a1.05 1.05 0 000 1.46l6.6 6.4c.31.3.73.47 1.17.47h14.4A1.4 1.4 0 0027 16.2V3.8a1.4 1.4 0 00-1.4-1.4z"/><circle cx="7.9" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M13.6 15.4l8-10.8" stroke-width="1.8"/><circle cx="15.3" cy="6.9" r="2.1"/><circle cx="19.9" cy="13.1" r="2.1"/></svg>`;
/* the plainest clock that still reads as one: a ring and two hands, no ticks, no bezel */
const FLAG_CLOCK_SVG = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.3 2"/></svg>`;
const FLAG_ICON = { urgent:FLAG_STAR_SVG, discount:FLAG_TAG_SVG, convenient:FLAG_CLOCK_SVG };
/* v2.00 item 5: the same rule v1.58 set above, applied to the interface chrome this time — "emoji are
   still the app's visual language for CATEGORIES and items — these are status marks, which is a
   different job". A link, a globe, a clipboard and a broom are not content; they are buttons, and as
   emoji they rendered in cyan, blue and solid black, the only saturated non-brand colour anywhere on
   a forest-ink/sage/burnt-orange screen. Drawn marks take `currentColor`, so they are whatever the
   button they sit in is. Inline, so nothing is fetched. Category and food emoji are untouched.
   v2.04: at the household's request, categories and items are drawn too (Settings › Icon style); emoji remain the fallback and the opt-out. */
const ICO = (d,sz) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const LINK_SVG   = sz => ICO('<path d="M10 13.5a4 4 0 006 .5l2.5-2.5a4.2 4.2 0 00-6-6L11 7"/><path d="M14 10.5a4 4 0 00-6-.5L5.5 12.5a4.2 4.2 0 006 6L13 17"/>', sz);
const CAMERA_SVG = sz => ICO('<path d="M3 8.5h3.2l1.6-2.4h8.4l1.6 2.4H21v11H3z"/><circle cx="12" cy="13.6" r="3.4"/>', sz);
const PASTE_SVG  = sz => ICO('<path d="M9 4.5H7a2 2 0 00-2 2V19a2 2 0 002 2h10a2 2 0 002-2V6.5a2 2 0 00-2-2h-2"/><rect x="9" y="2.8" width="6" height="3.6" rx="1.2"/>', sz);
const GLOBE_SVG  = sz => ICO('<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><path d="M12 3.4a13 13 0 010 17.2a13 13 0 010-17.2z"/>', sz);
const HOME_SVG    = sz => ICO('<path d="M4 11.5L12 4l8 7.5"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5.5h4V20"/>', sz);
const PIN_SVG     = sz => ICO('<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0113 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>', sz);
const RESTOCK_SVG = sz => ICO('<path d="M19.5 8.5A8 8 0 005.2 7.4"/><path d="M5 3.8v3.9h3.9"/><path d="M4.5 15.5a8 8 0 0014.3 1.1"/><path d="M19 20.2v-3.9h-3.9"/>', sz);
const FLASK_SVG   = sz => ICO('<path d="M9.5 3.5h5"/><path d="M10.5 3.5v5.2L5.3 18a1.8 1.8 0 001.6 2.5h10.2a1.8 1.8 0 001.6-2.5l-5.2-9.3V3.5"/><path d="M7.6 14.5h8.8"/>', sz);
/* v2.70: the Edit item sheet's Delete and the note entry — line-drawn in currentColor, stroke 1.8 */
const TRASH_SVG   = sz => ICO('<path d="M4 6.5h16"/><path d="M9.5 6.5V4.5h5v2"/><path d="M6.2 6.5l.9 13a1.6 1.6 0 001.6 1.5h6.6a1.6 1.6 0 001.6-1.5l.9-13"/><path d="M10 10.5v6.5M14 10.5v6.5"/>', sz).replace('stroke-width="2.2"','stroke-width="1.8"');
const PENCIL_SVG  = sz => ICO('<path d="M4 20l1-4.2L15.6 5.2a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.2 19 4 20z"/><path d="M13.8 7l3.2 3.2"/>', sz).replace('stroke-width="2.2"','stroke-width="1.8"');
const BIN_SVG     = sz => ICO('<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.2h5v2.3"/><path d="M6.5 6.5l1 13.3h9l1-13.3"/><path d="M10.2 10v6.6M13.8 10v6.6"/>', sz);
/* v2.13: Report a problem — a speech bubble with an exclamation mark, for the top banner's right-hand button */
const REPORT_SVG  = sz => ICO('<path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3.5v-3.5H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><path d="M12 8.2v3.8"/><path d="M12 15h.01"/>', sz);
/* v2.56: a microphone, a picture, and the empty basket (the Others category's drawn mark, shown large) */
/* v2.67: the iOS keyboard's dictation key, so the dictation sheet points at the very mark the person must tap */
const KBD_MIC_SVG = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text)"><path d="M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3.5"/><path d="M8.5 20.5h7"/></svg>`;
const MIC_SVG     = sz => ICO('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0"/><path d="M12 17.5V21"/>', sz);
const IMAGE_SVG   = sz => ICO('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.7"/><path d="M20.5 15.5l-5-5-9 9"/>', sz);
/* v2.57: the household picked option B for the empty list — the supermarket hand basket (two handles, slots), drawn in the
   item drawings' style: back lines, a front shape filled with --illbg, detail lines. Only the empty list uses it. */
const BASKET_SVG  = `<svg class="emptybasket" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20Q12.5 9 19.5 9.5M37 20Q35.5 9 28.5 9.5M19 9.5h10"/><path d="M6.5 20h35l-3.8 18.6a2.5 2.5 0 0 1-2.5 2H12.8a2.5 2.5 0 0 1-2.5-2z"/><path d="M15 26v8.5M20 26v9M25 26v9M30 26v9M35 26v8.5M6.5 20h35"/></svg>`;
const MENU_SVG    = sz => ICO('<circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/>', sz);   // v2.30 the Shop page's menu
const CARD_SVG    = sz => ICO('<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="M3 9.5h18"/><path d="M6.5 14.5h4"/>', sz);   // v2.31 a membership card
const SHARE_SVG   = sz => ICO('<path d="M12 3.5v11"/><path d="M8 7.2l4-3.7 4 3.7"/><path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2"/>', sz);
const NOTE_SVG   = sz => ICO('<circle cx="8" cy="17.5" r="3"/><path d="M11 17.5V4.6l8-1.6v11"/><circle cx="16" cy="14" r="3"/>', sz);
const SAVE_SVG   = sz => ICO('<path d="M12 3.6v10.2"/><path d="M8 10l4 4 4-4"/><path d="M4.5 16v3.4h15V16"/>', sz);
const BROOM_SVG  = sz => ICO('<circle cx="12" cy="12" r="8.6"/><path d="M9 9l6 6M15 9l-6 6"/>', sz);
const DICT_HIDE = new Set(["strawberr","blueberr","raspberr","berry","brocollini","choysum","chili","yogurt"]);   // matching stems / dupes, not for display
/* v1.12 per-item emoji — first keyword match wins (multi-word/specific terms first), else the
   item's category emoji. Pure lookup, offline. */
const EMOJI_HINTS = [
  ["paper towel","🧻"],["kitchen towel","🧻"],["toilet","🧻"],["ice cream","🍦"],["bok choy","🥬"],["spring onion","🧅"],["peanut butter","🥜"],
  ["chicken","🍗"],["beef","🥩"],["steak","🥩"],["lamb","🥩"],["pork","🥓"],["bacon","🥓"],["sausage","🌭"],["ham","🥓"],["turkey","🍗"],["duck","🍗"],
  ["salmon","🐟"],["tuna","🐟"],["fish","🐟"],["prawn","🦐"],["shrimp","🦐"],["crab","🦀"],["squid","🦑"],["lobster","🦞"],
  ["milk","🥛"],["egg","🥚"],["cheese","🧀"],["butter","🧈"],["yoghurt","🥛"],["yogurt","🥛"],["cream","🥛"],["bread","🍞"],["croissant","🥐"],["bagel","🥯"],["baguette","🥖"],
  ["banana","🍌"],["apple","🍎"],["orange","🍊"],["lemon","🍋"],["lime","🍋"],["grape","🍇"],["strawberr","🍓"],["berr","🫐"],["mango","🥭"],["melon","🍈"],["watermelon","🍉"],
  ["peach","🍑"],["pear","🍐"],["pineapple","🍍"],["kiwi","🥝"],["cherry","🍒"],["coconut","🥥"],["avocado","🥑"],
  ["tomato","🍅"],["carrot","🥕"],["potato","🥔"],["onion","🧅"],["garlic","🧄"],["broccoli","🥦"],["broccolini","🥦"],["corn","🌽"],["mushroom","🍄"],
  ["capsicum","🫑"],["chilli","🌶️"],["cucumber","🥒"],["zucchini","🥒"],["eggplant","🍆"],["lettuce","🥬"],["spinach","🥬"],["cabbage","🥬"],["kale","🥬"],["ginger","🫚"],
  ["rice","🍚"],["pasta","🍝"],["spaghetti","🍝"],["noodle","🍜"],["ramen","🍜"],["udon","🍜"],["tofu","🍥"],["kimchi","🥬"],["seaweed","🌿"],["nori","🌿"],
  ["coffee","☕"],["tea","🍵"],["beer","🍺"],["wine","🍷"],["juice","🧃"],["water","💧"],
  ["chocolate","🍫"],["cookie","🍪"],["biscuit","🍪"],["honey","🍯"],["salt","🧂"],["sugar","🧂"],["flour","🌾"],["oats","🌾"],["cereal","🥣"],["oil","🫒"],["popcorn","🍿"],["pizza","🍕"],
  ["soap","🧼"],["shampoo","🧴"],["conditioner","🧴"],["detergent","🧴"],["sponge","🧽"],["toothpaste","🪥"],["toothbrush","🪥"],["vitamin","💊"],["medicine","💊"],["panadol","💊"],["sunscreen","🧴"],["battery","🔋"],["tissue","🤧"]
];
/* v2.04: which icons the app draws. "drawn" (default) = line drawings; "emoji" = the old emoji. A LOOK,
   like ml_emoji_cat / ml_emoji_item, so it is deliberately NOT in APP_EXCLUDE — an appearance slot carries it. */
function iconStyle(){ try{ return localStorage.getItem("ml_icons")==="emoji" ? "emoji" : "drawn"; }catch(e){ return "drawn"; } }
function setIconStyle(v){ try{ localStorage.setItem("ml_icons", v==="emoji"?"emoji":"drawn"); }catch(e){} render(); }
const CAT_IDS = new Set(["meat","fruit","vegetable","fresh","bulk","health","asian","alcohol","others","bakery","deli","dairy","pantry","snacks","frozen","household","liquor"]);   // v2.33 + the thirteen's
/* v2.34 (the household's item 4): "nail" and "nails" are one thing, so one drawing. A name is looked up as written, then
   in its singular and plural forms — exact names first for every form, then the hints — so a plural never falls through to
   a hint the singular does not meet ("nails" once matched the screw hint while "nail" matched nothing). */
function drawForms(n){ const out=[n], w=n.split(" "), last=w.pop()||"", pre=w.length ? w.join(" ")+" " : "";
  const sing = /ies$/.test(last) ? last.slice(0,-3)+"y" : /(ch|sh|ss|x|z)es$/.test(last) ? last.slice(0,-2) : /oes$/.test(last) ? last.slice(0,-2) : (/s$/.test(last) && !/ss$/.test(last)) ? last.slice(0,-1) : "";
  if(sing && sing.length>2) out.push(pre+sing);
  if(!/s$/.test(last)) out.push(pre+last+"s", pre+last+"es");
  return out; }
function drawKey(name){ const n=String(name||"").trim().toLowerCase(); if(!n) return null;
  const fs=drawForms(n);
  for(const f of fs) if(DRAW_EXACT[f]) return DRAW_EXACT[f];
  for(const f of fs) for(const [k,v] of DRAW_HINTS){ if(f.includes(k)) return v; }
  return null; }
function illSVG(key){ const d=DRAWN[key]; if(!d) return "";
  return `<svg class="ill" viewBox="0 0 48 48" aria-hidden="true"><path class="ib" d="${d.back}"/><path class="if" d="${d.front}"/><path class="id" d="${d.detail}"/></svg>`; }
function catMarkSVG(id){ return CATMARK[id] ? `<svg class="cmark" viewBox="0 0 24 24" aria-hidden="true"><path d="${CATMARK[id]}"/></svg>` : ""; }
/* For DISPLAY only — returns markup. Anything that STORES an icon (a plan entry's emoji) keeps calling
   itemEmoji(), so no SVG ever reaches the database. */
function itemIcon(name, cat){
  if(!itemEmojiOn()) return "";
  if(iconStyle()==="drawn"){ const k=drawKey(name); if(k) return illSVG(k);
    /* v2.56 item 7: text the app cannot place at all (no drawing, no category from the dictionary) gets the drawn basket;
       a name with no drawing but a known category keeps that category's mark, so tofu still shows Asian */
    const c=CAT(cat); if(c && c.id!=="others" && !CAT_IDS.has(c.id)) return itemEmoji(name, cat);   // a household-made category keeps its emoji (v2.04)
    const kc = (c && c.id!=="others") ? c.id : guessCat(name);
    return (kc && kc!=="others" && CATMARK[kc]) ? catMarkSVG(kc) : catMarkSVG("others"); }
  return itemEmoji(name, cat); }
function itemEmoji(name, cat){ if(!itemEmojiOn()) return "";
  const n=(name||"").toLowerCase();
  for(const [k,e] of EMOJI_HINTS){ if(n.includes(k)) return e; }
  const c=CAT(cat); return (c && c.emoji && !c.img) ? c.emoji : ""; }
function addFrag(){ const v=draftMain||""; const i=Math.max(v.lastIndexOf(","), v.lastIndexOf("\n")); return v.slice(i+1).trim(); }
// v1.31 item 2: gather search matches (due → regulars → catalogue), deduped, for literal shop-pill rendering.
function addMatches(f){
  const onList=(name,cat)=> state.items.find(i=>!i.checked && i.name.toLowerCase()===String(name).toLowerCase() && (cat==null||i.cat===cat));
  const out=[], seen=new Set();
  const push=(m)=>{ const k=baKey(m); if(seen.has(k)) return; seen.add(k); out.push(m); };   // v2.68: a Regular's note is part of its key
  predictDue().filter(d=>!f || d.name.toLowerCase().includes(f)).forEach(d=>{ const it=onList(d.name,d.cat);
    push({name:d.name, cat:d.cat, qty:it?(it.qty||1):(d.qty||1), weight:it?(it.weight||""):"", onId:it&&it.id, predKey:it?null:d.key}); });
  state.buyAgain.filter(e=>!f || e.name.toLowerCase().includes(f)).forEach(e=>{ const it=state.items.find(i=>itemIsReg(i,e.name,e.cat,e.note));   // v2.68: and the same note
    push({name:e.name, cat:e.cat, note:e.note||"", qty:it?(it.qty||1):(e.qty||1), weight:it?(it.weight||""):(e.weight||""), onId:it&&it.id, ba:!it}); });
  for(const c of catList()){ const words=DICT[c.id]; if(!words) continue;
    for(const w of [...new Set(words)]){ if(DICT_HIDE.has(w) || (f && !w.includes(f))) continue; const it=onList(w,c.id);
      push({name:w, cat:c.id, qty:it?(it.qty||1):1, weight:it?(it.weight||""):"", onId:it&&it.id, dict:!it}); } }
  return out;
}
// v1.34 item 4: render a match as the app's literal shop pill, following Tile appearance
// (Full/Empty) exactly like a real unchecked list item — no special "selected" override;
// the picked item's persistence is shown via the Item Details panel, not the pill itself.
function addPillHTML(m){
  const cat=CAT(m.cat)||{color:"var(--muted2)"};
  const on=!!m.onId;
  const full=fillMode()==='full';
  const style = full ? fullStyle(cat.color, !!on) : (fillMode()==="empty" ? `border-left:1.5px solid var(--line)` : `border-left:4px solid ${catEdge(cat.color, !!on)}`);
  const qcol = metaCol(cat.color, !!on, full); const qtxt = (full) ? qcol : readableOn(qcol, tileGroundHex(!!on));
  const meta=[(m.qty>1?m.qty+"×":""), m.weight].filter(Boolean).join(" ");
  const metaS = meta?`<span class="pill-meta"><span class="qty" style="color:${qtxt}">${esc(meta)}</span></span>`:"";
  const em=itemIcon(m.name,m.cat); const emS=em?`<span class="pemoji" aria-hidden="true" style="color:${qcol}">${em}</span>`:"";
  const attr = on ? `data-add-inc="${m.onId}"` : (m.predKey?`data-add-pred="${esc(m.predKey)}"` : m.ba?`data-add-ba="${esc(m.name)}|${m.cat}" data-reg-note="${esc(m.note||"")}"` : `data-add-dict="${esc(m.name)}|${m.cat}"`);
  return `<button class="pill" ${attr} style="${style}">${emS}${esc(cap(m.name))}${metaS}</button>`;
}
// v1.34 item 4: nothing typed → nothing shown (no browsing). Typing shows matches as a
// single horizontally-scrolling row of the app's literal item pills — same look as the real
// list (tile appearance / style / icons / text size), no category grouping.
function addSheetRows(){
  // v1.36 item 9: while the edit panel is open the live fragment is empty (the bar shows the picked
  // item), so fall back to the query that produced these results — the pills stay put until Done.
  const frag = addEditId ? addLastQuery : addFrag();
  const f = frag.toLowerCase();
  const dashed = `class="pill addstart" style="border:1.5px dashed var(--accent);color:var(--accent);background:transparent"`;
  const smartT = smartOn() ? `<button ${dashed} data-add-smart aria-label="${t("Smart add")}">✨ ${t("Smart add")}</button>` : "";
  /* v2.56 item 7: with nothing typed, the ways in — Smart add, a photo of a list (camera or the phone's photos).
     v2.57 items 5 and 7: Paste is gone, and the three fit on one line (short labels, descriptive aria-labels) */
  if(!frag) return addEditId ? "" : `<div class="shop addwrap"><div class="pills addgrid addstartrow">${smartT}`
    + `<button ${dashed} data-add-photo="camera" aria-label="${t("Take a photo of your list")}">${CAMERA_SVG(18)} ${t("Camera")}</button>`
    + `<button ${dashed} data-add-photo="gallery" aria-label="${t("Choose a photo of your list")}">${IMAGE_SVG(18)} ${t("Photos")}</button></div></div>`;
  const segs=(draftMain||"").split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
  const p=parseEntry(frag);
  const lbl= segs.length>1 ? tf("Add {n} items", { n:segs.length }) : tf("Add “{x}”", { x:(p.qty>1?p.qty+"× ":"")+(p.weight?esc(showAmt(p.weight))+" ":"")+esc(cap(p.name)) });
  // the "Add …" pill is a commit action for what's typed — meaningless while the edit panel owns the bar
  /* v2.56 item 7: the tile shows the drawing the item would get (the empty basket when its name matches none), and Smart add
     sits right after it */
  const tIc = segs.length>1 ? "" : itemIcon(p.name, guessCat(p.name)||"others");
  const typed = addEditId ? "" : `<button class="pill" data-add-typed style="border:1.5px dashed var(--accent);color:var(--accent);background:transparent">${tIc?`<span class="pemoji" aria-hidden="true">${tIc}</span>`:""}${esc(lbl)}</button>${smartT}`;
  /* v1.66 item 1: a bounded list. `addMatches` walks the whole dictionary, so a one-letter query
     returned everything — fine when the results were one clipped row, but they wrap now and the
     panel would have to scroll through hundreds of them to reach the search bar. */
  const ms=addMatches(f).slice(0, 36);
  const cells = typed + ms.map(addPillHTML).join("");
  /* v1.43 item 4: `largeCols()>1`, not `>0` — large·1 is now the list layout, and emitting
     `gridmode grid1` here turned the single horizontally-scrolling result strip into a one-column
     grid. The list look wants the base shop-pill sizing, exactly as the old "list" mode did. */
  return `<div class="shop addwrap"><div class="zoomer ${styl()}${(dispBase()==='large'&&largeCols()===0)?' largevar':''}${(dispBase()==='large'&&largeCols()>1)?(' gridmode grid'+largeCols()):''}" style="transform:scale(${dens()});transform-origin:top left;width:calc(100% / ${dens()})"><div class="pills addgrid">${cells}</div></div></div>`;   /* v2.42: .pills, so the results take the list's own grid and tile sizes */
}
function addBodyHTML(){
  /* v1.47: once an item is picked, its Edit panel is the whole point of the sheet — the leftover
     result pills under it were clutter (and pushed the panel up out of reach). Show one or the
     other, never both. */
  if(addEditId) return addEditPanel();
  _aeFoldKey="";   // v2.57 item 9a: the panel is closed — the next one opens folded, even for the same item
  return addSheetRows();
}
function addSheet(){
  return `<div class="sheet-bg" id="addBg"><div class="addsheet-under" id="addUnder" aria-hidden="true"></div><div class="sheet addsheet" id="addSheet" data-look="add">
    <div class="addsheet-grab" id="addGrab" aria-hidden="true"><span class="grabbar"></span></div>
    <div class="addsheet-body" id="addSheetBody">${addBodyHTML()}</div>
    <div class="addsheet-foot">
      <div class="addsheet-barrow">
        <div class="searchbar">
          <span class="searchbar-ic" aria-hidden="true">${SEARCH_SVG}</span>
          <div class="inwrap"><textarea id="mainInput" rows="1" enterkeyhint="done" placeholder="${addEditId?t('Next item…'):t('Add item…')}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"></textarea><button class="clearbtn" id="mainClear" aria-label="Clear">×</button></div>
        </div>
        <button class="addsheet-donebtn" id="addDone" aria-label="${t("Cancel and return to the shop page")}">${t("Cancel")}</button>
      </div>
    </div>
  </div></div>`;
}
function addKeepScroll(fn){ const sb=document.getElementById("addSheetBody"); _addScrollY=sb?sb.scrollTop:0; fn();
  const s2=document.getElementById("addSheetBody"); if(s2) s2.scrollTop=_addScrollY; }
/* v1.44 item 5: a qty/weight tap re-renders the body, which used to reset the panel's scroll to the
   top and blur the search bar — the panel jumped and the keyboard dropped. Keep both: restore the
   scroll offset, and re-focus the bar only if it held focus before the write. */
/* v1.47: the body it rebuilds contains the Edit panel's name field, so restoring focus only to
   #mainInput meant typing in the name (or any save() echo arriving mid-edit) destroyed the focused
   element and iOS dropped the keyboard. Remember which field had focus and where the caret was, and
   put both back. */
let _refreshingAddBody=false;
function refreshAddBody(){ const sb=document.getElementById("addSheetBody"); if(!sb) return;
  /* v1.47: re-entrancy guard. Rewriting the body REMOVES the focused name field, which fires its own
     blur handler, which calls straight back in here — and that nested call captures activeElement as
     <body> and so restores focus to nothing, undoing the restore the outer call had just done. That
     is why typing a letter in the name still dropped the keyboard. */
  if(_refreshingAddBody) return;
  _refreshingAddBody=true;
  try{
  const keepY=sb.scrollTop;
  const a=document.activeElement;
  let sel=null;
  const key = (a && a.id==="mainInput") ? "#mainInput"
            : (a && a.dataset && a.dataset.aeName) ? `[data-ae-name="${a.dataset.aeName}"]`
            : null;
  if(key){ try{ sel=[a.selectionStart, a.selectionEnd]; }catch(e){ sel=null; } }
  sb.innerHTML=addBodyHTML(); wireAddRows(); wireAddEdit();
  const s2=document.getElementById("addSheetBody"); if(s2) s2.scrollTop=keepY;
  const inp=document.getElementById("mainInput"); if(inp) inp.placeholder = addEditId?t("Next item…"):t("Add item…");
  if(key){
    const el=document.querySelector(key);
    if(el){ el.focus();
      const end=(el.value||"").length;
      const s0 = sel ? Math.min(sel[0], end) : end, s1 = sel ? Math.min(sel[1], end) : end;
      try{ el.setSelectionRange(s0,s1); }catch(e){} }
  }
  } finally { _refreshingAddBody=false; } }
/* v1.45: THE reason picking an item closed the keyboard. A full render() rebuilds app.innerHTML,
   which removes the focused #mainInput from the document — and iOS dismisses the keyboard the
   instant that happens, which also un-pins the sheet to full height. While the add sheet owns the
   screen the page behind it is not even visible, so refresh only the sheet body: #mainInput lives
   in .addsheet-foot, outside #addSheetBody, so it is never touched and focus survives.
   Two separate call paths were doing it — the add itself (addEntries/addFromRegular/predictDismiss)
   and the Firestore snapshot that echoes our own write back. The second one is why this reproduced
   on a real phone but never in the headless tests, where Firebase is stubbed out. */
function renderKeepingAdd(){
  if(addOpen && document.getElementById("addSheet")){ refreshAddBody(); return; }
  render();
}
function removeFromList(id){ const it=state.items.find(i=>i.id===id); if(!it) return; playPlan(false);   // v1.14 add-sheet "unselect"
  state.items=state.items.filter(i=>i.id!==id); save(); renderKeepingAdd(); }
function editItemById(id){ const it=state.items.find(i=>i.id===id); if(!it) return;                     // open the full edit menu (as on the shopping page)
  /* v1.44 item 5: leaving the sheet for the full edit menu is not a Cancel — keep what was added, and
     go through the shared teardown so the body scroll lock is released. */
  if(addOpen) commitAddSheet(); else addOpen=false;
  quickEdit=null; editing={kind:"item", ...it}; render(); }
// v1.32/v1.34/v1.35: after picking a result, show its full edit-item details inline above the
// search bar (keyboard stays up). The bar mirrors "Name qty× weight, " and re-syncs on every
// live edit (syncAddEditInput) so typing after it continues the next fragment.
function openAddEdit(id){ const it=state.items.find(i=>i.id===id); if(!it) return;
  addLastQuery = addEditId ? addLastQuery : addFrag();   // v1.36 item 9: keep the pills that produced this pick
  addEditId=id;
  const v=draftMain||""; const i=Math.max(v.lastIndexOf(","), v.lastIndexOf("\n"));
  addEditPrefix = i>=0 ? v.slice(0,i+1)+" " : "";
  syncAddEditInput(it);
  refreshAddBody();
  const sb=document.getElementById("addSheetBody"); if(sb) sb.scrollTop=0;   // v1.35 item 1: always open on the top of the panel
  const mi=document.getElementById("mainInput"); if(mi) mi.focus(); }
// v1.35 item 6: mirror the item's current name/qty/weight in the search bar as it's edited live.
function syncAddEditInput(it){
  const meta=[(it.qty>1?it.qty+"×":""), it.weight].filter(Boolean).join(" ");
  draftMain = addEditPrefix + cap(it.name) + (meta?" "+meta:"") + ", ";
  const mi=document.getElementById("mainInput"); if(mi){ mi.value=draftMain; grow(mi); }
}
function findItem(name,cat){ return state.items.find(i=>!i.checked && i.name.toLowerCase()===String(name).toLowerCase() && i.cat===cat); }
/* v1.14 add-sheet rows: quick tap = select/unselect (add ⇄ remove); long press = edit menu.
   Replaces the old "second tap increments qty". */
function wireAddRows(){
  /* v1.63 item 1 / v1.66 item 1: these pills sit inside a scrolling area — the panel's own vertical
     scroll now that the results wrap (v1.66) rather than the old horizontal strip — so cancelling
     `pointerdown` would freeze that scroll. Focus is held by cancelling `mousedown` instead, and a
     press that travels is abandoned so a scroll across the results never adds an item. Long-press
     still opens the item's panel. */
  const press=(b, shortFn, longIdFn, refocus)=>{
    let sx=0, sy=0, moved=false;
    b.oncontextmenu=e=>e.preventDefault();
    b.onmousedown=e=>e.preventDefault();
    b.onpointerdown=e=>{ sx=e.clientX; sy=e.clientY; moved=false; pressStart(); };
    b.onpointermove=e=>{ if(!moved && (Math.abs(e.clientX-sx)>10 || Math.abs(e.clientY-sy)>10)){ moved=true; pressCancel(); } };
    b.onpointerleave=pressCancel; b.onpointercancel=pressCancel;
    b.onpointerup=()=>{ pressCancel();
      if(moved){ moved=false; return; }
      /* v1.40 item 1: a long press on a search result now opens the SAME inline "Edit item" panel a
         tap does. It used to jump to the full-screen edit sheet, which closed the keyboard. */
      if(longFired){ const id = longIdFn && longIdFn(); if(id) openAddEdit(id); return; }
      addKeepScroll(shortFn);
      const m=document.getElementById("mainInput"); if(m) m.focus();
    };
  };
  document.querySelectorAll("[data-add-typed]").forEach(b=>press(b,
    ()=>{ const t=(draftMain||"").trim(); if(t){ draftMain=""; playPlan(true); const before=new Set(state.items.map(i=>i.id));
      stageAdds(()=>addEntries(t,null));
      /* v2.29: a new name opens its details, the way a Regular does — one new item; several typed at once stay as they are */
      const fresh=state.items.filter(i=>!before.has(i.id)); if(fresh.length===1) openAddEdit(fresh[0].id); } }, null, true));
  /* v2.56 item 7: Smart add, photo and paste tiles (the ✨ beside the search bar is gone) */
  document.querySelectorAll("[data-add-smart]").forEach(b=>{ b.onmousedown=e=>e.preventDefault();
    b.onclick=()=>{ const m=document.getElementById("mainInput");
      if(!m || !m.value.trim()){ if(m) m.focus(); showToast("Type or paste a list, then tap Smart add"); return; }
      smartAdd(); }; });
  document.querySelectorAll("[data-add-photo]").forEach(b=>{ b.onclick=()=>smartPhoto(b.dataset.addPhoto==="camera"); });
  document.querySelectorAll("[data-add-ba]").forEach(b=>{ const p=b.dataset.addBa.split("|"), cat=p.pop(), name=p.join("|"), note=b.dataset.regNote||"";
    /* v2.42 added a Regular picked here without its panel; v2.43 (the household): picked from "+ Add items", its Edit item panel
       opens straight away, as for any other pick. (A tap under "Add from your regulars" still just adds it.) */
    const fnd=()=>state.items.find(i=>itemIsReg(i,name,cat,note));   // v2.68: the item of this Regular's note
    const go=()=>{ stageAdds(()=>addFromRegular(name,cat,note)); const it=fnd(); if(it) openAddEdit(it.id); };
    press(b, go, ()=>{ stageAdds(()=>addFromRegular(name,cat,note)); const it=fnd(); return it&&it.id; }); });
  document.querySelectorAll("[data-add-dict]").forEach(b=>{ const p=b.dataset.addDict.split("|"), cat=p.pop(), name=p.join("|");
    const go=()=>{ playPlan(true); stageAdds(()=>addEntries(name,cat)); const it=findItem(name,cat); if(it) openAddEdit(it.id); };
    press(b, go, ()=>{ playPlan(true); stageAdds(()=>addEntries(name,cat)); const it=findItem(name,cat); return it&&it.id; }); });
  document.querySelectorAll("[data-add-inc]").forEach(b=>{ const id=b.dataset.addInc;
    press(b, ()=>openAddEdit(id), ()=>id); });   // v1.32 on-list result: tap opens its details, long-press full edit
  document.querySelectorAll("[data-add-pred]").forEach(b=>{ const k=b.dataset.addPred;
    const go=()=>{ stageAdds(()=>predictAdd(k)); const rec=purch[k]; const it=rec&&findItem(rec.name,rec.cat); if(it) openAddEdit(it.id); };
    press(b, go, ()=>{ const rec=purch[k]; if(!rec) return null; stageAdds(()=>predictAdd(k)); const it=findItem(rec.name,rec.cat); return it&&it.id; }); });
}
// v1.32 the inline "Item Details" panel (shown above the search bar after a pick). Edits mutate the
// real item and refresh only the results body, so the keyboard stays up for the next item.
// v1.35 item 4: the SAME content as the long-press "Edit item" sheet (star, qty, weight, name,
// flags, Category, Subcategory) — but wired for live inline editing (data-ae-*): every change
// mutates the real item immediately, no separate Save step, keyboard/search bar never close.
/* v1.62 item 5: one weight control for both editors. `id` scopes the popover to its item so two
   panels can never fight over one open flag. */
/* v1.63 item 1: a control that lives inside a SCROLLING box cannot cancel `pointerdown` — that is
   the event whose default IS the pan, which is why neither the weight popover nor the results strip
   could be dragged. Focus (and so the keyboard) is held by cancelling `mousedown` instead, the event
   that actually moves focus, and the tap is abandoned if the finger travels, so a scroll never
   commits a choice. */
function tapNoScroll(el, fn){
  let sx=0, sy=0, moved=false;
  el.onmousedown=e=>e.preventDefault();
  el.onpointerdown=e=>{ sx=e.clientX; sy=e.clientY; moved=false; };
  el.onpointermove=e=>{ if(Math.abs(e.clientX-sx)>10 || Math.abs(e.clientY-sy)>10) moved=true; };
  el.onclick=e=>{ if(moved){ moved=false; return; } fn(e); };
}
/* v1.63 item 1: NOT a bug — recorded here so it is not "fixed" again. The strip is drawn inside a
   `transform:scale(dens())` zoomer, which looks like it should leave the scroll extent behind. It does
   not: a scroll container's scrollable overflow region is measured from its descendants' TRANSFORMED
   boxes, so the extent already tracks Text size (measured 1407px at 100% and 1688px at 120% for the
   same content). The strip was unreachable because the pills cancelled `pointerdown`, and nothing else.
   A margin correction here would only have added dead space. */
/* v1.64 item 1: the popover is gone. `.wpop` was position:absolute inside `#addSheetBody`, and an
   overflow container clips its absolutely-positioned descendants — so the list was cut off at the
   panel's edge (measured: clipped mid-way through `100g`) with the remainder hidden behind the search
   bar, and no amount of flipping it upward could help. The choices are part of the panel's flow now,
   exactly like the Category and Subcategory chips directly below them: the button expands a wrapping
   grid, the body scrolls to it, and nothing can be clipped by anything. */
const WEIGHTS = ["","cup","tsp","Tbsp"];   // v2.76: the packs, grams, kilos and litres are counters (wCounters)   // v2.76: the 100g…10kg chips became the g / kg / L counters below
/* v2.76: three counters under the Unit chips — g by 100 (100–2000), kg by 0.5 (0.5–20), L by 0.5 (0.5–10) */
const WCOUNT = { pack:{ step:2, min:2, max:12 }, g:{ step:100, min:100, max:2000 }, kg:{ step:0.5, min:0.5, max:20 }, L:{ step:0.5, min:0.5, max:10 } };
function wParse(w){ const m=String(w||"").trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|pack)$/i); if(!m) return null;
  const u=m[2].toLowerCase(); return { n:parseFloat(m[1].replace(",",".")), u: u==="l" ? "L" : u }; }
function wFmt(n, u){ return String(+n.toFixed(1)).replace(/\.0$/,"") + (u==="pack" ? " pack" : u); }   // v2.76: "6 pack", as the old chips wrote it
function wStep(cur, u, dir){ const c=WCOUNT[u], p=wParse(cur), n=(p&&p.u===u) ? p.n : null;
  if(n==null) return dir>0 ? wFmt(c.min,u) : (cur||"");
  if(dir<0 && n<=c.min) return "";
  const v=Math.min(c.max, Math.max(c.min, Math.round((n+dir*c.step)/c.step)*c.step)); return wFmt(v,u); }
function wCounters(attr, key, cur){ const p=wParse(cur);
  return Object.keys(WCOUNT).map(u=>{ const on=p&&p.u===u;
    return `<div class="wcount"><span class="editsec-l">${u==="pack"?t("Pack"):u}</span><span class="eqty"><button ${attr}="${key}|${u}|-1" aria-label="${t("Less")}">−</button><span class="wcount-v">${on?esc(wFmt(p.n,u)):"—"}</span><button ${attr}="${key}|${u}|+1" aria-label="${t("More")}">+</button></span></div>`; }).join(""); }
/* v2.76: an opened row's choices are shown to their end — the sheet scrolls just enough, the page behind does not */
function edShowEnd(root, row){ const c=root && root.querySelector(`.edcell[data-row="${row}"][data-open="1"]`);
  const last=c && c.querySelector(".wgrid > :last-child, .edchips > :last-child"); if(last) last.scrollIntoView({ block:"nearest" }); }
function weightChips(id, cur){
  if(wOpen!==id) return "";
  return `<div class="wgrid" role="listbox">${WEIGHTS.map(w=>`<button role="option" class="catchip${(cur||"")===w?' on':''}" data-w-set="${id}|${esc(w)}">${w?esc(w):t("Unit")}</button>`).join("")}${wCounters("data-wstep", id, cur)}</div>`;
}
function addEditPanel(){
  const it=state.items.find(i=>i.id===addEditId);
  if(!it){ addEditId=null; return addSheetRows(); }
  if(!_aeOrig || _aeOrig.id!==it.id) _aeOrig={ id:it.id, name:it.name, cat:it.cat };   // v2.65: the key it had when the panel opened, for regularFrom
  aeFold("ae|" + it.id);   // v2.57 item 9a
  const cat=CAT(it.cat)||null;
  const flags=[{k:"urgent",label:t("Urgent")},{k:"discount",label:t("If on sale")}];   // v2.63: no "If convenient" button (the tag itself stays)
  const catChips = catList().map(c=>`<button class="catchip" data-ae-cat="${it.id}|${c.id}" style="${it.cat===c.id?`background:${c.color};border-color:${c.color};color:#fff`:''}">${catIcon(c,15)} ${esc(catLabel(c))}</button>`).join("");
  return `<div class="addedit" data-look="edit">
    ${/* v1.46 item 2: tighter heading + 40px controls — the panel has to share the screen with the
          keyboard, so every row it saves is a row you don't have to scroll to. */""}
    ${/* v2.63 item D: the title IS the name field; then flags, Quantity, Measure, Note, Category (no Subcategory) */""}
    ${/* v2.71: the Note moves up to right below the title; "Measure" is now "Unit" */""}
    <input class="edtitle" data-ae-name="${it.id}" value="${esc(it.name)}" aria-label="${t("Item name")}" />
    <div class="edrows">${/* v2.74: the rows in cells, as in Edit item */""}
    <div class="edcell" data-row="note">${noteSecHTML(it.note||"", it.name, { input:`data-ae-note="${it.id}"`, chip:"data-ae-notechip" })}</div>
    <div class="edcell" data-row="qty"><div class="editsec edrow"><span class="editsec-l">${t("Quantity")}</span><span class="eqty"><button data-ae-minus="${it.id}" aria-label="${t("Less")}">−</button><span>${it.qty||1}</span><button data-ae-plus="${it.id}" aria-label="${t("More")}">+</button></span></div></div>
    <div class="edcell" data-row="unit"${wOpen===it.id?' data-open="1"':''}><button class="editsec" data-w-open="${it.id}" aria-expanded="${wOpen===it.id}" aria-label="${t("Unit")}"><span class="editsec-l">${t("Unit")}</span><span class="editsec-v"><span class="edval">${esc(it.weight||t("Unit"))} <span class="editsec-ch">${wOpen===it.id?'▾':'▸'}</span></span></span></button>
    ${weightChips(it.id, it.weight)}</div>
    ${/* v1.59 item 3: the weight is the same wheel the shop-page Edit item uses, in the same place —
          between the quantity and the name. It was a scrolling chip strip on its own row here, which
          is a second way to do one thing and cost a row of a panel that already shares the screen
          with the keyboard. */""}
    <div class="edcell" data-row="cat"${editCatOpen?' data-open="1"':''}><button class="editsec" data-ae-sechead="cat" aria-label="${t("Category")}"><span class="editsec-l">${t("Category")}</span><span class="editsec-v"><span class="edval">${cat?`${catIcon(cat,14)} ${esc(catLabel(cat))}`:'—'} <span class="editsec-ch">${editCatOpen?'▾':'▸'}</span></span></span></button>
    ${editCatOpen ? `<div class="edchips">${catChips}<button class="catchip" data-ae-addcat="${it.id}" style="border-style:dashed;font-weight:800">${t("＋ New")}</button></div>` : ""}</div>
    </div>
    ${/* v2.70: the flags sit just above the buttons, as in Edit item */""}
    <div class="addedit-flags edchips edflags">${flags.map(f=>{ const on=(it.tags||[]).includes(f.k); return `<button class="flagchip${on?' on':''}" data-ae-flag="${it.id}|${f.k}"><span aria-hidden="true">${FLAG_ICON[f.k]}</span>${f.label}</button>`; }).join("")}</div>
    <div class="addedit-actions">
      <button class="addedit-remove" data-ae-remove="${it.id}">${TRASH_SVG(16)}${t("Delete")}</button>
      <button class="addedit-done" id="addEditDone">${t("Save")}</button>
    </div>
  </div>`;
}
function wireAddEdit(){
  const cur=()=>state.items.find(i=>i.id===addEditId);
  const touch=it=>{ markDirty(it.id); save(); syncAddEditInput(it); };   // v1.35 item 5/6: persist + re-sync the search bar, keyboard/bar untouched
  document.querySelectorAll("[data-ae-minus]").forEach(b=>b.onpointerdown=e=>e.preventDefault());
  document.querySelectorAll("[data-ae-minus]").forEach(b=>b.onclick=()=>{ const it=cur(); if(it){ it.qty=Math.max(1,(it.qty||1)-1); touch(it); refreshAddBody(); } });
  document.querySelectorAll("[data-ae-plus]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const it=cur(); if(it){ it.qty=(it.qty||1)+1; touch(it); refreshAddBody(); } }; });
  /* v1.62 item 5: preventDefault on pointerdown everywhere in this control — that is the whole point.
     A tap that never moves focus never dismisses the keyboard. */
  document.querySelectorAll("#addSheetBody [data-w-open]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ const id=b.dataset.wOpen; wOpen = (wOpen===id) ? null : id; refreshAddBody();
      /* v1.64 item 1: the grid is taller than the row it replaced, so bring it into view rather than
         leaving it under the fold of a sheet that is sized to its content. scrollIntoView on a plain
         div moves no focus, so the keyboard is unaffected. */
      edShowEnd(document.querySelector("#addSheetBody"), "unit"); }; });
  /* v2.76: the g / kg / L counters — the Unit row stays open */
  document.querySelectorAll("#addSheetBody [data-wstep]").forEach(b=>tapNoScroll(b, ()=>{
    const [id,u,d]=b.dataset.wstep.split("|"); const it=state.items.find(x=>x.id===id);
    if(it){ it.weight=wStep(it.weight,u,+d); touch(it); refreshAddBody(); }
    const mi=document.getElementById("mainInput"); if(mi) mi.focus();
  }));
  document.querySelectorAll("#addSheetBody [data-w-set]").forEach(b=>tapNoScroll(b, ()=>{
    const [id,w]=b.dataset.wSet.split("|"); const it=state.items.find(x=>x.id===id);
    if(it){ it.weight=w||""; wOpen=null; touch(it); refreshAddBody(); }
    /* belt and braces: if the platform moved focus anyway, put it straight back inside the same
       gesture, which is the only place iOS will re-raise the keyboard without a flicker. */
    const mi=document.getElementById("mainInput"); if(mi) mi.focus();
  }));
  document.querySelectorAll("[data-ae-flag]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const [id,k]=b.dataset.aeFlag.split("|"); const it=state.items.find(i=>i.id===id); if(it){ const t=Array.isArray(it.tags)?it.tags.slice():[]; const i=t.indexOf(k); if(i<0)t.push(k); else t.splice(i,1); it.tags=t;
      /* v1.62 item 2: "get this now" and "only if you happen to pass it" are opposite instructions —
         an item cannot be both. Selecting one clears the other rather than refusing the tap, so the
         control never feels stuck. */
      if(k==="urgent") it.tags = it.tags.filter(t=>t!=="convenient");
      else if(k==="convenient") it.tags = it.tags.filter(t=>t!=="urgent");
      /* v1.58 item 1: Urgent and the old ★ were two controls for one idea. The chip is now the only
         one, and it keeps `starred` in step so the existing "urgent floats to the top" sort and any
         item saved by an older build both keep working. */
      it.starred = (it.tags||[]).includes("urgent");
      touch(it); refreshAddBody(); } }; });
  document.querySelectorAll("[data-ae-name]").forEach(inp=>{   // no refreshAddBody() per keystroke — would blur the input mid-typing
    inp.oninput=()=>{ const it=state.items.find(i=>i.id===inp.dataset.aeName); if(it){ it.name=inp.value; touch(it); } };
    /* v1.47: only refresh when the field is still in the document — a blur fired BY its removal is
       just the rebuild we are already inside of, never a real "user left the field". */
    inp.onblur=()=>{ if(inp.isConnected) refreshAddBody(); }; });
  /* v1.44 item 5: without the preventDefault the section header steals focus from #mainInput and the
     keyboard drops mid-edit — every sibling control already guards against this. */
  document.querySelectorAll("[data-ae-sechead]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ if(b.dataset.aeSechead==='cat') editCatOpen=!editCatOpen; refreshAddBody(); edShowEnd(document.querySelector("#addSheetBody"), "cat"); }; });
  /* v2.57 item 9d: the Note section — its header, the field (saved as typed, like the name) and the suggestion chips */
  document.querySelectorAll("[data-ae-note]").forEach(inp=>{
    /* v2.70: typed text becomes tiles at a comma, Enter or leaving the field — in place, no re-render while typing */
    const it0=()=>state.items.find(i=>i.id===inp.dataset.aeNote);
    const setN=n=>{ const it=it0(); if(it){ it.note=n; touch(it); } };
    inp.oninput=()=>{ setN(inp.value.indexOf(",")>=0 ? noteCommit(inp, aeChip, true) : noteFromWrap(inp.closest(".ednotewrap"))); };   // v2.68: selected chips + the free text
    inp.onkeydown=e=>{ if(e.key===","||e.key==="Enter"){ e.preventDefault(); setN(noteCommit(inp, aeChip)); } };
    inp.onblur=()=>{ if(!inp.isConnected) return; setN(noteCommit(inp, aeChip)); refreshAddBody(); }; });
  function aeChip(b){ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const it=cur(); if(it){ it.note=noteChipTap(b); touch(it); } }; }
  document.querySelectorAll("[data-ae-notechip]").forEach(aeChip);
  document.querySelectorAll("[data-ae-cat]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const [id,cid]=b.dataset.aeCat.split("|"); const it=state.items.find(i=>i.id===id); if(it){ it.cat=cid; it.sub=null; touch(it); refreshAddBody(); } }; });
  document.querySelectorAll("[data-ae-sub]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const p=b.dataset.aeSub.split("|"), id=p[0], sub=p[1]||null; const it=state.items.find(i=>i.id===id); if(it){ it.sub=sub; touch(it); refreshAddBody(); } }; });
  /* v1.47: prompt() blurs the page and focus never comes back on its own, so the keyboard stayed
     down after adding a category. Guard the pointerdown like every sibling control, and hand focus
     back to the search bar once the body has been rebuilt. */
  document.querySelectorAll("[data-ae-addcat]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const it=state.items.find(i=>i.id===b.dataset.aeAddcat); if(!it) return; const nm=prompt(t("New category name:"),""); if(nm&&nm.trim()){ const cid=makeCategory(nm); if(cid){ it.cat=cid; it.sub=null; touch(it); refreshAddBody(); const mi=document.getElementById("mainInput"); if(mi) mi.focus(); } } }; });
  document.querySelectorAll("[data-ae-addsub]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const it=state.items.find(i=>i.id===b.dataset.aeAddsub); if(!it) return; const nm=prompt(t("New subcategory name:"),""); if(nm&&nm.trim()){ const sid=makeSub(it.cat,nm); if(sid){ it.sub=sid; touch(it); refreshAddBody(); const mi=document.getElementById("mainInput"); if(mi) mi.focus(); } } }; });
  document.querySelectorAll("[data-ae-remove]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ const id=b.dataset.aeRemove; const it=state.items.find(i=>i.id===id);
    if(it){ baForget(it.name, it.cat, it.note); regDrop(it.name, it.cat, it.note); }   // v1.37 item 6 · v2.68: only the Regular of its note
    state.items=state.items.filter(i=>i.id!==id); addEditId=null; save(); refreshAddBody(); const mi=document.getElementById("mainInput"); if(mi) mi.focus(); }; });
  // v1.36 item 2: Done finishes the whole add flow and returns to the shop page — it no longer
  // just dismisses the panel back to another search view that needs a second Done.
  // v1.38 item 3: Save closes the panel but STAYS in the add flow — the keyboard never drops and the
  // caret lands after the trailing comma so the next item can be typed straight away.
  const dn=document.querySelector("#addEditDone"); if(dn){ dn.onpointerdown=e=>e.preventDefault(); dn.onclick=()=>{
    { const it=cur(); if(it){ regularFrom(it, (_aeOrig && _aeOrig.id===it.id) ? _aeOrig : it); save(); showToast(tf("Saved — also in Regulars")); } _aeOrig=null; }   // v2.65: one Save — the list and the Regulars
    addEditId=null; addLastQuery="";
    const mi=document.getElementById("mainInput");
    if(mi){ mi.value=draftMain; grow(mi); mi.focus(); const end=(draftMain||"").length; try{ mi.setSelectionRange(end,end); }catch(e){} }
    refreshAddBody();
    const m2=document.getElementById("mainInput"); if(m2){ m2.focus(); const end=(draftMain||"").length; try{ m2.setSelectionRange(end,end); }catch(e){} }
  }; }
}
// v1.35 item 2: drag the grab handle down to dismiss the add sheet (same feel as a native sheet).
function wireAddSheetDrag(){
  const grab=document.getElementById("addGrab"); const sheet=document.getElementById("addSheet");
  if(!grab || !sheet) return;
  let startY=0, dy=0, dragging=false;
  /* v1.55 item 1: dragging the handle must not blur the field either — same reason as the Cancel button. */
  grab.onpointerdown=e=>{ e.preventDefault(); dragging=true; startY=e.clientY; dy=0; sheet.style.transition="none"; try{ grab.setPointerCapture(e.pointerId); }catch(err){} };
  grab.onpointermove=e=>{ if(!dragging) return; dy=Math.max(0, e.clientY-startY); sheet.style.transform=`translateY(${dy}px)`; };
  const end=()=>{ if(!dragging) return; dragging=false; sheet.style.transition="transform .22s ease";
    if(dy>90){ closeAddSheet(); }   // v1.44 item 5: a swipe-down is a Cancel, same as the button
    else { sheet.style.transform="translateY(0)"; setTimeout(()=>{ if(sheet){ sheet.style.transition=""; sheet.style.transform=""; } },220); }
    dy=0; };
  grab.onpointerup=end; grab.onpointercancel=end;
}
// v1.36: one exit path for the add flow — always lands back on the shop page with nothing left over.
/* v1.44 item 5: two ways out, and they mean opposite things. commitAddSheet() keeps what you added;
   closeAddSheet() is Cancel and takes it back off. Everything else about the teardown is shared. */
function commitAddSheet(){
  /* v2.37 (the household's item 4): opened from a Regulars "+" tile, what was added is kept as a Regular too */
  if(addFromCat){ const kept=state.items.filter(i=>addStaged.includes(i.id));
    if(kept.length){ moveToBuyAgain(kept.map(i=>({ name:i.name, cat:i.cat, qty:i.qty, weight:i.weight, sub:i.sub, note:i.note, where:i.where }))); kept.forEach(i=>histLog("regadd", i.name)); save(); } }
  addStaged=[]; addFromCat=null; endAddSheet(); }
function closeAddSheet(){
  addFromCat=null;   // v2.37
  if(addStaged.length){
    const drop=new Set(addStaged);
    state.items = state.items.filter(i=>!drop.has(i.id));
    addStaged=[];
    save();
  }
  endAddSheet();
}
/* v1.54 item 3: the teardown proper — unlock, repaint, re-measure. Split out of endAddSheet so the
   staged close can run it at the right moment (stage 3, under the scrim) rather than up front. */
function finishAddTeardown(){
  /* v1.40 item 1: the keyboard state and the pin cache belong to the sheet. Leaving kbOffset set meant
     the shop page's floating search pill stayed positioned for a keyboard that is no longer there. */
  kbActive=false; kbOffset=0; _pinLast=""; _botFloor=0;
  const restoreY = unlockPageScroll();
  /* v1.46: removing position:fixed from <body> does not reflow synchronously, so the very next
     syncZoomHeight() measured #bottomnav at its collapsed-layout position — navH came out 0 and the
     floating search pill was placed UNDERNEATH the nav. Force the reflow, then re-measure. */
  void document.body.offsetHeight;
  render();
  syncAddChrome();
  if(restoreY>0) window.scrollTo(0,restoreY);
  applyKb(); syncZoomHeight();
  requestAnimationFrame(()=>{ if(restoreY>0) window.scrollTo(0,restoreY); syncZoomHeight(); });
  setTimeout(syncZoomHeight, 350);
}
/* v1.54 item 3: closing is the opening reversed, stage for stage. openAdd() dims the page and raises
   the keyboard first and only then deploys the sheet; so the close rolls the sheet down first, THEN
   hands the keyboard back, THEN returns the background to the shop page's own colour, and the page
   itself is the last thing to reappear. Doing all four at once is what made a dismissal read as the
   screen simply blinking. */
function endAddSheet(){
  if(_addClosing) return;
  addOpen=false; addEditId=null; addEditPrefix=""; addLastQuery=""; draftMain=""; addStaged=[]; wOpen=null;   // v1.62 item 5: the open weight control is sheet state — it closes with the sheet
  /* v1.50: closing inside the staging window must not let phase 2 fire into a dismissed sheet. */
  if(_addPhase2){ clearTimeout(_addPhase2); _addPhase2=null; }
  _addFocused=false;
  const as=document.getElementById("addSheet"), bg=document.getElementById("addBg");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce || !as || !bg){ finishAddTeardown(); unmountAddSheet(); return; }
  _addClosing=true;
  /* v1.55 item 1: #addUnder is paper-coloured and sized to the keyboard strip — the moment the
     keyboard is gone it is a bright band, and on the accessory-bar ✓ path iOS has already taken the
     keyboard away before we hear about it. Hiding it for the close makes all three exits identical:
     the scrim (which overdraws the whole screen) is what shows under the travelling sheet, whenever
     the keyboard actually happens to leave. */
  const und=document.getElementById("addUnder"); if(und) und.style.display="none";
  /* stage 1 — the sheet travels alone. _botFloor is deliberately still held: the reserved keyboard
     strip is the space it is rolling down through, and releasing it here would re-pin the sheet
     upward mid-travel. */
  void as.offsetHeight;
  as.classList.remove("deploy"); as.classList.add("retract");
  /* Every stage below re-checks the flag before it acts, and openAdd() clears it. A close is ~1.4s
     of scheduled work holding references to a node that a reopen inside that window has already
     replaced: without this, stage 2 would blur the NEW sheet's input (which the accessory-bar
     handler then reads as "done" and closes it) and stage 4 would unmount the new sheet outright. */
  setTimeout(()=>{
    if(!_addClosing) return;
    /* stage 2 — now the keyboard may go. Blurring earlier would have iOS retract it under the sheet
       while the sheet is still up there, which is the jump this whole sequence exists to remove. */
    const a=document.activeElement; if(a && a.blur) a.blur();
    kbActive=false; kbOffset=0; applyKb();
    setTimeout(()=>{
      if(!_addClosing) return;
      /* stage 3 — the background goes back to the shop page's colour, and the page is rebuilt while
         the scrim still covers it, so stage 4 is a reveal rather than a repaint. */
      bg.style.transition="opacity .42s ease"; bg.style.opacity="0";
      finishAddTeardown();
      setTimeout(()=>{ if(!_addClosing) return;
        _addClosing=false; unmountAddSheet(); applyKb(); syncZoomHeight(); }, 420);
    }, 300);
  }, 720);
}
/* v1.49: the sheet lives in <body>, not inside #app. render() rebuilds app.innerHTML wholesale, and
   for one frame that leaves the page empty — what shows through is the page background, which is
   white on Ink and near-black on Dark. That frame IS the reported flash. Keeping the sheet outside
   #app means opening it never re-renders the page at all, and closing can re-render underneath the
   sheet while it still covers the screen. */
function mountAddSheet(){
  if(document.getElementById("addBg")) return;
  const host=document.createElement("div");
  host.innerHTML = addSheet();
  const node=host.firstElementChild;
  if(!node) return;
  document.body.appendChild(node);
  /* v1.50: mount PARKED — scrim transparent, sheet off the bottom edge, no transition. openAdd()
     then runs the two phases. Inserting a node that animates itself in is exactly what made the open
     unsequenced (page, scrim, sheet and keyboard all moving on the same frame). */
  const as0=document.getElementById("addSheet");
  if(as0) as0.classList.add("parked");
  node.style.opacity="0";
  _pinInstant=true;   // v1.49: first pin after mount is written without a transition (see pinAddSheet)
  syncAddChrome();
  wireAddSheet();
  syncZoomHeight();
}
/* the page's own floating pill would otherwise stay visible under the scrim: the templates hide it
   with `!addOpen`, but we are deliberately not re-rendering them any more. */
function syncAddChrome(){
  const fab=document.getElementById("shopAddFabWrap"); if(fab) fab.style.display = addOpen ? "none" : "";
  const apw=document.getElementById("addPillWrap");    if(apw) apw.style.display = addOpen ? "none" : "";
  /* v1.80: your own tiles are floating chrome like the pill, so they go with it — a shortcut sitting
     on top of an open add sheet would be tappable through the scrim. */
  const ut=document.getElementById("utiles");           if(ut) ut.style.display = addOpen ? "none" : "";
}
function unmountAddSheet(){
  const bg=document.getElementById("addBg"); if(bg && bg.parentNode) bg.parentNode.removeChild(bg);
}
function wireAddSheet(){
  if(!addOpen) return;
  wireAddBar();
  const bg=document.getElementById("addBg"); if(bg) bg.onclick=e=>{ if(e.target===bg) closeAddSheet(); };
  /* v1.55 item 1: the same pointerdown guard #mainClear and #smartBtn already carry. Without it,
     tapping Cancel moves focus off the field, iOS begins retracting the keyboard on the spot, and the
     paper-coloured #addUnder strip flashes up while the sheet is still travelling — the reported
     "white screen immediately". It also made Cancel unreliable: the focusout handler commits 120ms
     after the blur, so a slow tap on Cancel KEPT the staged items instead of dropping them. */
  const dn=document.getElementById("addDone");
  if(dn){ dn.onpointerdown=e=>e.preventDefault(); dn.onclick=()=>closeAddSheet(); }
  wireAddRows();
  wireAddEdit();
  wireAddSheetDrag();
}
// v1.36 item 10: reopening the search bar always starts blank — no leftover text from the last session.
function openAdd(){
  /* v1.54 item 3: tapping Add again inside the ~1.4s close drops the outgoing sheet on the spot;
     mountAddSheet() bails when #addBg still exists, so the reopen would otherwise adopt a node
     mid-retract. */
  if(_addClosing){ _addClosing=false; unmountAddSheet(); }
  addTab="reg"; addOpen=true; addStaged=[]; addFromCat=null; addEditId=null; addEditPrefix=""; addLastQuery=""; draftMain=""; _pinLast="";
  const y0 = window.scrollY||window.pageYOffset||0;   // v1.48: read it here, before anything can scroll the page
  if(curPageIdx()!==1){ gotoPage(1); }   // the add sheet belongs to the shop page, from wherever it was opened
  /* v1.47: lock AFTER the render. position:fixed on <body> collapses the document height, and doing
     that before the re-render painted let the collapsed page flash through as a blank frame.
     v1.49: there is no render here any more — mounting the sheet into <body> is what replaced it. */
  mountAddSheet();
  lockPageScroll(y0);
  /* v1.52 — the open is still staged, but the FOCUS is no longer part of the staging. iOS raises the
     keyboard only for a focus() that runs inside the task of a real user gesture; v1.50 deferred it by
     500ms, which discards that activation, so the caret landed in the field and the keyboard simply
     never came. (The sheet then dropped to the bottom edge 1.4s later — that was the no-keyboard
     safety net below doing its job.) Keyboard timing is not ours to schedule. What we can stage is
     everything else:
       t=0     reserve the keyboard strip, pin the sheet to its final geometry, and focus — the
               keyboard starts rising and the scrim starts fading in, while the sheet stays parked
               off the bottom edge, so the page dims rather than lurches.
       t=300ms the sheet is released and slides up over 1.1s into space already reserved for it.
     Pinning BEFORE the focus is what still stops iOS scrolling the visual viewport to hunt for the
     input: by the time it is focused it already sits above where the keyboard is going to be. */
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bg=document.getElementById("addBg");
  _botFloor = kbGuess();                 // reserve the keyboard strip before anything is measured
  _pinLast=""; _pinInstant=true; pinAddSheet();
  const deployNow=()=>{ const as=document.getElementById("addSheet");
    if(as){ void as.offsetHeight; as.classList.remove("parked"); as.classList.add("deploy"); } };
  if(reduce){
    if(bg) bg.style.opacity="";
    deployNow();
    const mi0=document.getElementById("mainInput"); if(mi0){ mi0.value=""; mi0.focus(); _addFocused=true; }
    return;
  }
  requestAnimationFrame(()=>{ if(bg && addOpen) bg.style.opacity="1"; });   // the background changes first
  /* SYNCHRONOUS — this line must stay in the gesture's own task. Do not wrap it in a timer, a promise
     continuation or an await; every one of those loses the user activation and the keyboard with it. */
  const mi=document.getElementById("mainInput"); if(mi){ mi.value=""; mi.focus(); _addFocused=true; }
  _addPhase2 = setTimeout(()=>{
    _addPhase2=null;
    if(!addOpen) return;
    deployNow();
    /* The floor is a PREDICTION. If no keyboard has actually turned up by the time the slide has
       finished — an iPad with a hardware keyboard, a desktop browser, a focus that was refused —
       give the reserved strip back, or the sheet sits stranded above a band of empty paper. */
    setTimeout(()=>{
      if(!addOpen || !_botFloor) return;
      const vv2 = window.visualViewport;
      if(vv2 && (window.innerHeight - vv2.height) > 120) return;   // the keyboard did arrive
      _botFloor=0; _pinLast=""; pinAddSheet();
    }, 1400);
  }, 300);
}
function startMic(){
  const SR = speechRecognitionCtor();
  if(!SR){ showToast("Voice input isn't supported here — tap the 🎤 on your keyboard instead"); return; }
  const mi = micField(); if(!mi) return;
  micFinal = mi.value ? mi.value.replace(/\s*,?\s*$/,"")+", " : "";
  recog = new SR(); recog.lang = navigator.language || "en-US"; recog.interimResults = true; recog.continuous = false;
  recog.onresult = e => {
    let interim = "";
    for(let i=e.resultIndex; i<e.results.length; i++){ const r=e.results[i]; const tx=(r[0].transcript||"").trim();
      if(r.isFinal){ if(tx) micFinal += tx + ", "; } else { interim += r[0].transcript; } }
    const m=micField(); if(m){ m.value = (micFinal + interim).replace(/,\s*,/g, ", "); grow(m); }
  };
  recog.onerror = ev => {
    if(ev.error==="not-allowed"||ev.error==="service-not-allowed"){ showToast("Allow microphone access to use voice input"); listening=false; }
    else if(ev.error==="no-speech"){ /* keep listening */ }
    else { showToast("Voice error: "+ev.error); }
  };
  recog.onend = () => {
    if(listening){ try{ recog.start(); }catch(e){ listening=false; setMicUI(false); } }
    else { setMicUI(false); const m=micField(); if(m) m.value=m.value.replace(/,\s*$/,""); }
  };
  try { recog.start(); listening=true; setMicUI(true); showToast("Listening… tap 🎤 again to stop"); }
  catch(e){ listening=false; setMicUI(false); showToast("Couldn't start voice input"); }
}
function stopMic(){ listening=false; if(recog){ try{ recog.stop(); }catch(e){} }
  setMicUI(false); const m=micField(); if(m) m.value=m.value.replace(/,\s*$/,""); }
function toggleMic(){ if(listening) stopMic(); else startMic(); }

/* v2.57 item 6: the voice sheet, opened by the empty list's microphone. Recognition must start INSIDE the tap on iOS, so
   openVoice() and the sheet's own mic call voiceListen() synchronously from their click. Results update only the
   transcript (#voiceList, #voiceStatus) — no full render while speaking. The tick adds through Smart add when it is on. */
var voiceOpen=false, voiceText="", voiceInterim="", voiceOn=false, voiceRec=null;
function voicePhrases(){ return (voiceText + (voiceInterim ? (voiceText ? ", " : "") + voiceInterim : ""))
  .split(/,|\s+(?:and|et)\s+/i).map(x=>x.trim()).filter(Boolean); }
function voiceListHTML(){
  const rows = voicePhrases().map(ph=>`<div class="voicerow"><span class="voiceico" aria-hidden="true">${itemIcon(ph, guessCat(ph)||"others")}</span><span>${esc(ph)}</span></div>`).join("");
  return rows + (voiceOn ? `<div class="voicerow voiceskel" aria-hidden="true"><span class="voiceico"></span><span class="voicebar"></span></div>` : ""); }
var voiceWhy = "";   // v2.59 why the phone stopped listening (its own error code)
function voiceStatusText(){ return voiceOn ? t("Listening…") : voiceWhy ? tf("Paused ({why}) — tap the microphone to continue", { why:voiceWhy }) : t("Paused — tap the microphone to continue"); }
function voiceUpdate(){ const l=document.getElementById("voiceList"); if(l) l.innerHTML=voiceListHTML();
  const st=document.getElementById("voiceStatus"); if(st) st.textContent=voiceStatusText();
  const sh=document.querySelector(".voicesheet"); if(sh) sh.classList.toggle("on", voiceOn); }
function voiceListen(){ const SR = speechRecognitionCtor(); if(!SR) return false;
  const r = new SR(); voiceRec = r;
  r.lang = appLang==="fr" ? "fr-FR" : (navigator.language||"en-AU"); r.continuous = true; r.interimResults = true;
  r.onresult = e => { let interim="";
    for(let i=e.resultIndex; i<e.results.length; i++){ const res=e.results[i]; const tx=(res[0].transcript||"").trim();
      if(res.isFinal){ if(tx) voiceText = voiceText ? voiceText + ", " + tx : tx; } else interim += res[0].transcript; }
    voiceInterim = interim.trim(); if(voiceText || voiceInterim) setMicDenied(false); voiceUpdate(); };
  r.onerror = ev => { if(ev.error==="not-allowed" || ev.error==="service-not-allowed"){ voiceStop(); micRefused(); return; }
    if(ev.error && ev.error!=="no-speech" && ev.error!=="aborted") voiceWhy = String(ev.error).slice(0,40); };   // v2.59: the phone's reason, shown when it pauses
  r.onend = () => { if(voiceRec!==r) return;
    if(voiceOpen && voiceOn){ try{ r.start(); }catch(e){ voiceOn=false; voiceUpdate(); } } };
  r.start(); return true; }
function voiceStop(){ voiceOn=false; const r=voiceRec; voiceRec=null;
  if(voiceInterim){ voiceText = voiceText ? voiceText + ", " + voiceInterim : voiceInterim; voiceInterim=""; }
  if(r){ try{ r.stop(); }catch(e){} } voiceUpdate(); }
/* v2.59 (the household): when the phone refuses the microphone, a help card with the steps — a web app cannot open the
   phone's Settings itself (only an App Store app can). The refusal is remembered (ml_micdenied), so the next tap shows the
   steps straight away; "Try again" still asks, inside the tap; the first words heard forget the refusal. */
var micHelpOpen=false, micHelpWhy="";   // var: render reads it at boot
/* v2.64: iOS refuses speech recognition to home-screen web apps, and the household won't send their voice to an AI. The
   keyboard's own 🎤 is Apple's dictation and always works, so on an iPhone the microphone opens a box that is already
   focused (keyboard up) with a hint pointing at that 🎤; return / Done sends the TEXT to Smart add. A store app replaces
   this with Apple's speech recognition (docs/native-app.md). */
var dictOpen=false, _dictCancel=false;
function useDictation(){ return isAppleMobile() && !isNativeApp(); }
function openDictation(){
  micHelpOpen=false; voiceOpen=false; dictOpen=true; _dictCancel=false; render();
  const b=document.getElementById("dictBox"); if(b){ b.focus(); } }   // synchronously, inside the tap: iOS raises the keyboard only then
function dictSheetHTML(){
  return `<div class="sheet-bg kbpin" id="dictBg"><div class="sheet dictsheet" role="dialog" aria-labelledby="dictT">
    <div class="voicehead">
      <span class="dictmark" aria-hidden="true">${KBD_MIC_SVG(34)}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 9v8H9"/></svg></span>
      <div class="voicettl"><div class="voicetitle" id="dictT">${t("Say what you need")}</div></div>
      <button class="voiceclose" id="dictClose" aria-label="${t("Close")}">×</button>
    </div>
    <textarea id="dictBox" class="dictbox" aria-label="${t("Say what you need")}" rows="3" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" placeholder="${t("e.g. “two litres of milk, butter, six eggs…”")}"></textarea>
    <button id="dictGo" style="width:100%;padding:13px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${smartOn() ? t("✨ Add with Smart add") : t("Add")}</button>
  </div></div>`; }
function dictSubmit(){
  if(!dictOpen) return;
  const b=document.getElementById("dictBox"); const text=((b&&b.value)||"").trim(); dictOpen=false; render(); if(!text) return;
  if(smartOn()) smartAddText(text);
  else stageAdds(()=>addEntries(text.replace(/\s+(and|et|then|puis)\s+/gi, ", "), null)); }
function micDenied(){ try{ return localStorage.getItem("ml_micdenied")==="1"; }catch(e){ return false; } }
function setMicDenied(on){ try{ if(on) localStorage.setItem("ml_micdenied","1"); else localStorage.removeItem("ml_micdenied"); }catch(e){} }
function micRefused(){ setMicDenied(true); voiceOpen=false; voiceOn=false; micHelpWhy="denied"; micHelpOpen=true; render(); }
function openVoice(force){
  if(useDictation()){ openDictation(); return; }
  const SR = speechRecognitionCtor();
  if(!SR){ micHelpWhy="nosr"; micHelpOpen=true; render(); return; }
  if(!force && micDenied()){ micHelpWhy="denied"; micHelpOpen=true; render(); return; }
  voiceText=""; voiceInterim=""; voiceWhy="";
  try{ voiceListen(); }catch(e){ micRefused(); return; }
  micHelpOpen=false; voiceOpen=true; voiceOn=true; render(); }
function micHelpHTML(){
  /* v2.61: on an iPhone the steps cannot fix it — iOS refuses speech recognition to home-screen web apps — so the card
     offers what does work there: Siri (v2.60) and the keyboard's own microphone. The steps stay for other phones. */
  if(isAppleMobile() && !isNativeApp()) return `<div class="sheet-bg" id="micHelpBg"><div class="sheet" id="micHelpSheet" role="dialog" aria-labelledby="micHelpT">
    <div class="disp" id="micHelpT" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Speak with Siri instead")}</div>
    <div class="michint">${t("iPhone doesn't let apps on the home screen listen by themselves, whatever the settings. Two ways that work:")}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
      <button id="micSiri" style="padding:13px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${t("Add with Siri")}</button>
      <button id="micKbd" style="padding:13px;border-radius:14px;border:2px solid var(--ink);background:transparent;color:var(--text);font-weight:700;font-size:15px">${t("Use the keyboard's microphone")}</button>
      <button id="micTry" style="padding:8px;border:none;background:transparent;color:var(--muted);font-weight:600;font-size:14px;text-decoration:underline">${t("Try the app's microphone again")}</button>
    </div>
  </div></div>`;
  const steps = [t("Open Settings › Apps › Safari (on older iPhones: Settings › Safari)."),
    t("Under Settings for Websites, tap Microphone and choose Allow."),
    t("In Settings › General › Keyboard, turn on Enable Dictation."),
    t("Close Market List completely (swipe it away), open it again, and tap Try again.")];
  return `<div class="sheet-bg" id="micHelpBg"><div class="sheet" id="micHelpSheet" role="dialog" aria-labelledby="micHelpT">
    <div class="disp" id="micHelpT" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Let the app hear you")}</div>
    <div class="michint">${micHelpWhy==="nosr" ? t("Voice input isn't switched on for this app yet. Check these steps:") : t("Your phone didn't let the app use the microphone. These steps fix it:")}</div>
    <ol class="michelp">${steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
    <div class="michint">${t("On Android: Settings › Apps › Chrome › Permissions › Microphone › Allow.")}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button id="micType" style="padding:13px 14px;border-radius:14px;border:2px solid var(--ink);background:transparent;color:var(--text);font-weight:700;font-size:15px">${t("Type instead")}</button>
      <button id="micTry" style="flex:1;padding:13px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${t("Try again")}</button>
    </div>
  </div></div>`; }
function voiceSheet(){
  return `<div class="sheet-bg" id="voiceBg"><div class="sheet voicesheet${voiceOn?' on':''}" role="dialog" aria-label="${t("Speak now!")}">
    <div class="voicehead">
      <button class="voicemic" id="voiceMic" aria-label="${voiceOn?t("Stop listening"):t("Start listening")}">${MIC_SVG(30)}</button>
      <div class="voicettl"><div class="voicetitle">${t("Speak now!")}</div><div class="voicestatus" id="voiceStatus" role="status">${voiceStatusText()}</div></div>
      <button class="voiceclose" id="voiceClose" aria-label="${t("Close")}">×</button>
    </div>
    <div class="voicehint">${t("e.g. “two litres of milk, butter, six eggs…”")}</div>
    <div class="voicelist" id="voiceList">${voiceListHTML()}</div>
    <div class="voicebottom"><div class="voicewave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <button class="voicedone" id="voiceDone" aria-label="${t("Done")}"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></div>
  </div></div>`; }
function wireVoice(){
  const mbg=app.querySelector("#micHelpBg"); if(mbg) mbg.onclick=e=>{ if(e.target===mbg){ micHelpOpen=false; render(); } };
  const mtr=app.querySelector("#micTry"); if(mtr) mtr.onclick=()=>{ openVoice(true); };   // asks again, inside the tap
  const msi=app.querySelector("#micSiri"); if(msi) msi.onclick=()=>{ micHelpOpen=false; siriOpen=true; render(); };   // v2.61
  const mkb=app.querySelector("#micKbd"); if(mkb) mkb.onclick=()=>{ openDictation(); };   // v2.64
  const dbx=app.querySelector("#dictBox");   // v2.64 the dictation sheet
  if(dbx){ dbx.onkeydown=e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); dictSubmit(); } };
    dbx.onblur=()=>{ setTimeout(()=>{ if(dictOpen && !_dictCancel){ const b=document.getElementById("dictBox"); if(b && b.value.trim()) dictSubmit(); } }, 250); }; }   // the keyboard bar's Done only blurs
  const dgo=app.querySelector("#dictGo"); if(dgo){ dgo.onpointerdown=e=>e.preventDefault(); dgo.onclick=()=>dictSubmit(); }
  const dcl=app.querySelector("#dictClose"); if(dcl){ dcl.onpointerdown=()=>{ _dictCancel=true; }; dcl.onclick=()=>{ dictOpen=false; render(); }; }
  const dbg=app.querySelector("#dictBg"); if(dbg){ dbg.onpointerdown=e=>{ if(e.target===dbg) _dictCancel=true; }; dbg.onclick=e=>{ if(e.target===dbg){ dictOpen=false; render(); } }; }
  const mty=app.querySelector("#micType"); if(mty) mty.onclick=()=>{ micHelpOpen=false; render(); openAdd(); };
  const mic=app.querySelector("#voiceMic");
  if(mic) mic.onclick=()=>{ if(voiceOn){ voiceStop(); mic.setAttribute("aria-label", t("Start listening")); return; }
    try{ if(voiceListen()){ voiceOn=true; voiceUpdate(); mic.setAttribute("aria-label", t("Stop listening")); } }catch(e){ voiceOn=false; voiceUpdate(); } };
  const cl=app.querySelector("#voiceClose"); if(cl) cl.onclick=()=>{ voiceStop(); voiceOpen=false; voiceText=""; voiceInterim=""; render(); };
  const dn=app.querySelector("#voiceDone"); if(dn) dn.onclick=()=>{ voiceStop(); const text=voiceText.trim();   // voiceStop folds what was still interim into voiceText
    voiceOpen=false; voiceText=""; voiceInterim=""; render();
    if(!text) return;
    if(smartOn()) smartAddText(text);
    else stageAdds(()=>addEntries(text, null)); }; }   // addEntries saves and renders

/* v2.56 item 5: dragging a Regular within its category (see regPress). The other tiles are hit-tested by their centres,
   measured once when the drag starts; the tile the dragged one would land before is outlined.
   v2.57 item 10: the same drag for any group of tiles — the tile, the event, the group, the tiles' selector and what to do
   with the new order (the elements, in order) on release. Regulars, items on the Shop page and lists in the lists sheet use it. */
function tileDragStart(b, e, group, sel, onCommit){ if(!group) return null;
  const tiles=[...group.querySelectorAll(sel)]; if(tiles.length<2 || !tiles.includes(b)) return null;
  const others=tiles.filter(x=>x!==b).map(x=>{ const r=x.getBoundingClientRect(); return { el:x, cx:r.left+r.width/2, cy:r.top+r.height/2, h:r.height }; });
  b.classList.add("regdrag"); b.style.touchAction="none";
  try{ b.setPointerCapture(e.pointerId); }catch(_){}
  return { b, others, to:tiles.indexOf(b), onCommit }; }
function tileDragMove(d, e, dx, dy){
  d.b.style.transform=`translate(${dx}px,${dy}px)`;
  const px=e.clientX, py=e.clientY;
  d.to = d.others.filter(r=>(r.cy < py - r.h/2) || (Math.abs(r.cy-py) <= r.h/2 && r.cx < px)).length;
  d.others.forEach((r,i)=>{ r.el.classList.toggle("regdropb", i===d.to); r.el.classList.toggle("regdropa", d.to===d.others.length && i===d.others.length-1); }); }
function tileDragEnd(d, commit){
  d.b.classList.remove("regdrag"); d.b.style.transform=""; d.b.style.touchAction="";
  d.others.forEach(r=>r.el.classList.remove("regdropb","regdropa"));
  if(!commit || !d.onCommit) return;
  const els=d.others.map(r=>r.el); els.splice(d.to, 0, d.b);
  d.onCommit(els); }
function regDragStart(b, e){ return tileDragStart(b, e, b.closest(".pills"), "[data-regk]", els=>{
  const now=Date.now();
  els.forEach((el,i)=>{ const p=el.dataset.regk.split("|"), cat=p.pop(), name=p.join("|");
    const en=regFind(name, cat, el.dataset.regNote||"");   // v2.68: the note is part of a Regular's key
    if(en && en.pos!==i){ en.pos=i; en.ts=now; } });
  save(); render(); }); }
const regDragMove = tileDragMove;
function regDragEnd(d, commit){ tileDragEnd(d, commit); }
/* v2.57 item 10a: an item drags only within a row whose tiles are all unticked items of one category (never in the flat
   AI-order view, where categories mix); release numbers that row's `pos` 0..n-1 */
function itemDragStart(b, e){ const group=b.closest(".pills"); if(!group) return null;
  const ids=[...group.querySelectorAll("[data-pill]")].map(x=>x.dataset.pill);
  const its=ids.map(id=>state.items.find(i=>i.id===id));
  if(its.some(i=>!i || i.checked) || new Set(its.map(i=>catShown(i.cat))).size!==1) return null;
  if(group.querySelector(".urgent-dup")) return null;
  return tileDragStart(b, e, group, "[data-pill]", els=>{ const now=Date.now();
    els.forEach((el,i)=>{ const it=state.items.find(x=>x.id===el.dataset.pill); if(it && it.pos!==i){ it.pos=i; it.ts=now; markDirty(it.id); } });
    save(); render(); }); }

/* ---- press handling (tap vs long-press) ---- */
let pressTimer=null, longFired=false;
function pressStart(){ longFired=false; pressTimer=setTimeout(()=>{ longFired=true; vibrate(10); },450); }
function pressCancel(){ clearTimeout(pressTimer); }

/* ---- rendering ---- */
const app = document.getElementById("app");
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* v1.81: the "N to buy" pill is absolutely centred on the banner (v1.37), and the switcher's chevron
   made the title long enough to run under it — measured: the title ended at x=159.5 and the pill began
   at x=164.4, so the chevron was painted over and simply never appeared. Rather than un-centre the pill
   (it has been dead-centre for forty versions) or drop the back arrow (v1.79 exists because that arrow
   matters), the pill yields only when it has to: it keeps its centre while the title fits beside it,
   and slides right by exactly the overlap when it does not. Runs after every render via syncZoomHeight,
   and re-measures from the stylesheet's own position each time so the nudges cannot accumulate. */
function nudgeHeaderCount(){
  const c=document.querySelector(".topfix .hcount-mid"); if(!c) return;
  c.style.left=""; c.style.transform="";
  const t=document.querySelector(".topfix .title"); const row=c.parentElement; if(!t||!row) return;
  const rr=row.getBoundingClientRect(), tr=t.getBoundingClientRect(), cr=c.getBoundingClientRect();
  const need = (tr.right + 10) - cr.left;
  if(need <= 0) return;
  const maxLeft = Math.max(0, rr.width - cr.width);
  c.style.left = Math.min(maxLeft, cr.left - rr.left + need) + "px";
  c.style.transform = "none";
}
/* v2.10: the zoomer is scaled with a transform, which does not change layout height, so .zoomwrap
   (overflow:hidden) is given the scaled height by hand. That number went stale whenever the content grew
   after it was taken — fonts or images arriving late, a long History, a section opened — and the bottom
   of Settings was clipped where nobody could scroll to it. A ResizeObserver keeps it current. */
/* v2.10: measured to the zoomer's bottom edge, so whatever sits above it inside the wrap (the cart) counts too */
function zoomWrapH(z, zw){ return Math.ceil(Math.max(0, z.getBoundingClientRect().bottom - zw.getBoundingClientRect().top)); }
let _zoomRO=null, _zoomEl=null;
var _cartWasShown=false;   // v2.12 var, not let: render() can run before this line is reached
function watchZoomer(z){ if(!z || typeof ResizeObserver==="undefined" || _zoomEl===z) return;
  if(_zoomRO) _zoomRO.disconnect(); _zoomEl=z;
  _zoomRO=new ResizeObserver(()=>{ if(!z.isConnected) return; const zw=z.parentElement; if(zw) zw.style.height=zoomWrapH(z, zw)+"px"; });
  _zoomRO.observe(z); }
/* v2.10, changed in v2.11: tiles share a height, but a tile with more to say grows only its own row.
   Every tile gets at least the page's usual height (the 90th percentile of natural heights, so one tall
   "Wombok cabbage · 6× heaped cups" cannot set it); each row then takes its own tallest tile. The household:
   "when adding wombok cabbage the height increase for all tile, I only want height to increase for that line". */
/* v2.16: tiles in a row match the row's tallest and are never shorter than the usual tile — without measuring
   every tile on every tap. v2.10–v2.11 did that (equalizeTiles), and it was over half of each redraw (27–41 ms
   for a 60-item list). Now the rows stretch their tiles by themselves (CSS), and the usual height, --tileh, is
   still the 90th percentile of the tiles' natural heights (so one tall "Wombok cabbage · 6× heaped cups" cannot
   set it) — but each tile is measured ONCE, as an unstretched copy in a hidden probe, and remembered by what it
   shows (its words, its marks, in the cart or not) until the layout changes: the layout, icons, theme, line
   weight, fill, tile width or the fonts arriving. A tap that only moves or folds tiles measures nothing.
   (One stand-in probe tile, "Milk 2×", was tried first: in three columns most names take two lines, and the
   categories came out at different heights.) The cart is its own group, as it was in v2.11. */
const _tileSig = {}, _tileNat = {};
function tileKey(p){ return (p.classList.contains("done") ? "d" : "") + "|" + p.querySelectorAll(".pemoji,.pmark,.penddot").length + "|" + p.textContent; }
function syncTileH(){ try{
  const h=document.documentElement;
  [["--tileh", document.getElementById("zoomer"), "#zoomer .pill[data-pill], #zoomer .pill[data-reg-rm], #zoomer .pill[data-reg-add]"],
   ["--tileh-cart", document.querySelector("#checkedbar .zoomer"), "#checkedbar .pill[data-pill]"]].forEach(([v, z, sel])=>{
    if(!z || !z.closest(".shop")) return;
    const tiles=[...document.querySelectorAll(sel)].filter(p=>p.offsetParent!==null);   // not the hidden urgent duplicates
    if(!tiles.length) return;
    const grid=z.classList.contains("gridmode"), full=grid || z.classList.contains("linelist");
    const w=grid ? tiles[0].offsetWidth : tiles[0].parentElement.clientWidth;
    const sig=[z.className, h.getAttribute("data-icosize"), h.getAttribute("data-theme"), h.getAttribute("data-linew"), h.getAttribute("data-tilebg"),
      document.body.className, fillMode(), itemEmojiOn(), iconStyle(), w, document.fonts ? document.fonts.status : ""].join("|");
    if(_tileSig[v]!==sig || _tileNat[v].size>2000){ _tileSig[v]=sig; _tileNat[v]=new Map(); }   // a new layout, or a long day of edits
    const nat=_tileNat[v], keys=tiles.map(tileKey), miss=new Map();
    keys.forEach((k,i)=>{ if(!nat.has(k) && !miss.has(k)) miss.set(k, tiles[i]); });
    if(miss.size){
      // grid tiles are the column's width; free-width tiles take their own width, up to the row's
      const host=document.createElement("div"); host.className="tileprobe"; host.setAttribute("aria-hidden","true");
      host.style.cssText="position:absolute;left:0;top:0;width:"+Math.max(40, w)+"px;visibility:hidden;pointer-events:none;display:flex;flex-direction:column;align-items:"+(full?"stretch":"flex-start");
      miss.forEach(p=>{ const c=p.cloneNode(true); c.classList.remove("justpop"); host.appendChild(c); });
      z.appendChild(host);
      const ks=[...miss.keys()]; [...host.children].forEach((c,i)=>nat.set(ks[i], c.offsetHeight));
      host.remove();
    }
    const hs=keys.map(k=>nat.get(k)).sort((a,b)=>a-b), base=hs[Math.floor(0.9*(hs.length-1))]||0;
    if(base>0 && h.style.getPropertyValue(v)!==base+"px") h.style.setProperty(v, base+"px");
  });
}catch(e){} }
function syncZoomHeight(){ syncTileH(); const z=document.getElementById("zoomer"); const bb=document.getElementById("bottomnav"); const tf=document.getElementById("topfix");
  const zw=z?z.parentElement:null;
  /* v1.78: the BOTTOM edge, not the height. What the content has to clear is where the bar actually
     ends, and --topy moves the bar down the screen without changing how tall it is — measured by height
     alone the content would slide under a bar the user had nudged down. The rect is post-transform, so
     the bottom edge already carries the offset. Clamped at 0 for a bar pulled up off the top. */
  /* v2.12: the cart hangs from the header's bottom edge, and the list starts under the cart */
  const cb=document.getElementById("checkedbar");
  if(zw && tf){ const tb=Math.max(0, tf.getBoundingClientRect().bottom); if(cb) cb.style.top = Math.floor(tb) + "px";
    zw.style.marginTop = Math.ceil(cb ? Math.floor(tb) + cb.offsetHeight : tb) + "px";
    /* v2.29: a card at the top of the list ("Got the receipt?", the 10% shop…) was covered by the Undo message after Save to
       Regulars. The message drops to just below any card that sits where it would. */
    let tt = Math.ceil(cb ? Math.floor(tb) + cb.offsetHeight : tb) + 10;
    document.querySelectorAll(".installcard, .shopnow").forEach(c=>{ const r=c.getBoundingClientRect(); if(r.height && r.top < tt + 70 && r.bottom > tt - 4) tt = Math.max(tt, Math.ceil(r.bottom) + 8); });
    document.documentElement.style.setProperty("--toasttop", tt + "px"); }
  const navH = bb ? Math.max(0, Math.ceil(window.innerHeight - bb.getBoundingClientRect().top)) : 0;   // v1.12 floating nav: stack everything above its top edge
  const qb=document.getElementById("qbanner"); if(qb) qb.style.bottom = Math.ceil(navH) + "px";   // quantity banner sits on top of the nav
  const qbH = qb ? qb.getBoundingClientRect().height : 0;
  /* v1.43 item 1: the search pill used to be pushed up whenever the in-cart bar appeared, so the one
     control you aim at while shopping jumped under your thumb. Invert the stack — the pill is anchored
     just above the nav and never moves; the in-cart bar stacks ABOVE it instead. Hence the fab is
     positioned and measured FIRST, and the checked bar's bottom is derived from it. */
  const fabw=document.getElementById("shopAddFabWrap"); if(fabw) fabw.style.bottom = Math.ceil(navH + 12) + "px";
  const fabH = fabw ? fabw.getBoundingClientRect().height + 12 : 0;   // v1.29 reserve room so the last rows clear the shop search pill
  /* v2.10: the cart is in the page now, under the header — nothing to position, nothing to clear */
  const cbH = 0;
  const apw=document.getElementById("addPillWrap"); if(apw) apw.style.bottom = Math.ceil(navH + 10) + "px";   // floating add pill above the nav
  const apH = apw ? apw.getBoundingClientRect().height + 10 : 0;
  /* v1.80: the strip of your own tiles stacks ABOVE the search pill, positioned the same way every
     other piece of floating chrome is — measured after the pill so the two can never overlap, and its
     height added into the trailing clearance so the last row can still be scrolled clear of it. */
  const utw=document.getElementById("utiles"); if(utw) utw.style.bottom = Math.ceil(navH + fabH + apH + 10) + "px";
  const utH = utw ? utw.getBoundingClientRect().height + 10 : 0;
  /* v1.43 item 2: the toast's CSS bottom is a fixed 92px, which lands it on top of the search pill.
     Once the real heights are known, lift it above everything that floats. CSS keeps the fallback. */
  /* v2.13: messages sit under the top banner now (--toasttop, set above); the old bottom stacking is gone */
  /* v1.54 item 1: the trailing constant was a flat 24px of breathing room under the last row. It is
     the "Bottom" page margin now — everything before it is clearance the floating chrome genuinely
     needs, which is why the setting is added rather than substituted. */
  if(z){ z.style.paddingBottom = Math.ceil((navH + cbH + qbH + apH + fabH + utH)/dens() + numVal("padb")) + "px";
    if(zw) zw.style.height = zoomWrapH(z, zw) + "px";
    watchZoomer(z); }
  nudgeHeaderCount();   // v1.81 keep the centred count clear of the switcher's chevron
  applyKb(); }
/* v1.84: a bottom sheet with a field in it is pinned to the LAYOUT viewport, so the keyboard opens
   straight over it. visualViewport reports what is actually still visible; sitting the sheet on top of
   that strip — and capping its height to it — is all these sheets need. `.sheet-bg.kbpin` opts in, so
   the add sheet's own far more elaborate pinning (pinAddSheet) is untouched. */
var _kbSheetBot = 0;   // v2.29: the sheet's keyboard offset while one of its fields is focused. var: boot-order rule
function pinKbSheet(){
  const vv = (typeof window!=="undefined") ? window.visualViewport : null;
  document.querySelectorAll(".sheet-bg.kbpin > .sheet").forEach(s=>{
    if(!vv){ s.style.transform=""; s.style.maxHeight=""; return; }
    const raw = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
    /* v2.29: while a field in the sheet has focus, iOS's suggestion bar comes and goes with each word — the keyboard
       grows and shrinks by ~45px and the sheet bobbed up and down with it. Hold the higher position for small drops;
       a real close (a big drop, or focus leaving) still lets it down. */
    const inSheet = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest(".sheet-bg.kbpin"));
    const bot = (inSheet && _kbSheetBot > 0 && raw < _kbSheetBot && raw > _kbSheetBot - 90) ? _kbSheetBot : raw;
    _kbSheetBot = inSheet ? bot : 0;
    s.style.transform = bot>1 ? "translateY(-"+bot+"px)" : "";
    s.style.maxHeight = bot>1 ? Math.max(200, Math.round(vv.height - 24))+"px" : "";
  });
}
let kbOffset=0, kbActive=false;
function applyKb(){ const bar=document.getElementById("botbar"); if(bar) bar.style.transform = kbOffset>1 ? `translateY(${-kbOffset}px)` : "";
  const as=document.getElementById("addSheet"); if(as){ as.style.setProperty("--kb", (kbOffset>1?kbOffset:0)+"px"); as.classList.toggle("kbup", kbOffset>1); }
  pinAddSheet(); pinKbSheet(); }
/* v1.38 item 3 — pin the add sheet to the VISUAL viewport.
   Why JS and not CSS: position:fixed is resolved against the LAYOUT viewport. When the keyboard opens,
   iOS scrolls the *visual* viewport to bring the focused input into view; the layout viewport doesn't
   move, so every fixed element (our sheet and its scrim) slides up off the top of the screen — that is
   precisely the reported bug (only the sheet's foot stayed visible, near the top). visualViewport
   .offsetTop reports how far iOS scrolled, so adding it back into an explicit `top` cancels the shift.
   Writing explicit top/height also sidesteps iOS's inconsistent dvh behaviour with the keyboard up. */
let _pinLast="";
/* v1.50: the sheet used to be sized only once a real keyboard had appeared, so the deploy started at
   one size and re-settled at another. The last measured keyboard strip is remembered instead and used
   as a FLOOR while the keyboard is still rising — the box opens at the size it will end at, and the
   keyboard rises into space that was already reserved. */
function kbGuess(){ const v=parseInt(localStorage.getItem("ml_kbh")||"0",10); return (v>=180 && v<=520) ? v : 336; }
let _botFloor=0;
/* v1.49: the burst of re-pins after focusin ([60,160,320,500]) each restarts the .34s transition, so
   the sheet visibly re-settled several times. The FIRST pin after mount is written with the
   transition off, so the sheet starts at the right size instead of animating in from a wrong one. */
let _pinInstant=false;
let _addPhase2=null;   // v1.50: the phase-2 timer, cancelled if the sheet is dismissed inside the 500ms window
/* v1.50: has the sheet ever held focus this session? Opening it hides the floating pill that the tap
   just focused, and hiding a focused element blurs it — which fires the v1.47 accessory-bar focusout
   rule and closed the sheet again ~120ms after it opened. That was invisible while focus moved into
   the sheet synchronously; with the staged open it lands 500ms later, far too late to save it. The
   auto-close is a "you finished typing" gesture, so it may only fire once typing has actually begun. */
let _addFocused=false;
/* v1.54 item 3: the staged close is running. Guards three things: a second endAddSheet() call
   landing in the middle of it (the accessory-bar blur handler fires one), pinAddSheet() re-pinning
   a sheet that is deliberately travelling off-screen, and a reopen racing the teardown. */
let _addClosing=false;
function pinAddSheet(){
  if(_addClosing) return;   // v1.54 item 3: the sheet is on its way out; leave its geometry alone
  const as=document.getElementById("addSheet"); if(!as){ _pinLast=""; return; }
  const bg=document.getElementById("addBg");
  const vv=(typeof window!=="undefined") ? window.visualViewport : null;
  if(!vv){ as.classList.remove("vvpin"); return; }             // no support → CSS fallback above
  /* v1.46: position:fixed on <body> stops the layout scroll, but iOS still scrolls the VISUAL
     viewport to reveal the focused input — that is the background visibly sliding up behind the
     scrim. Snap it back; the sheet is already sized to sit above the keyboard, so nothing is hidden.
     Only fires while offsetTop is non-zero, so it settles in one pass rather than looping. */
  /* v1.50: scrollTo does not update visualViewport.offsetTop synchronously, so everything measured
     below it in the same call was a frame stale — that stale value went onto the scrim's `top` and
     left an undimmed band of bare paper above it. That band IS the reported white flash. Snap back,
     then invalidate the cache and re-pin on the next frame with values that are actually current. */
  if(addOpen && vv.offsetTop > 0){ window.scrollTo(0,0); _pinLast=""; requestAnimationFrame(()=>{ if(addOpen) pinAddSheet(); }); }
  /* v1.50: `_botFloor` is the predicted keyboard strip, held from the moment we focus until a real
     keyboard is measured. Without it the first pins report bot=0 and the sheet deploys to the wrong
     resting place, then jumps when the keyboard lands. */
  const botRaw= Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
  const kbUp  = (window.innerHeight - vv.height) > 120;          // keyboard actually occupying space
  /* v1.50: learn this device's keyboard height so the NEXT open can reserve exactly the right strip.
     The floor is dropped BEFORE `bot` is computed — clearing it afterwards left this very call still
     using the prediction, and since nothing else fires a viewport event the estimate stuck for good. */
  if(kbUp && botRaw>180 && botRaw<520){ try{ localStorage.setItem("ml_kbh", String(botRaw)); }catch(e){} _botFloor=0; }
  const bot   = Math.max(botRaw, _botFloor);
  const gap   = Math.max(20, Math.round(vv.height*0.06));        // sliver of page left visible at the top
  const maxH  = Math.max(180, Math.round(vv.height - gap));
  /* v1.63 item 1: no minimum. v1.47 floored the sheet at 470px so that picking an item would not make
     it grow — the cost was a sheet that is mostly empty paper whenever the content is short, which
     covers the list you are adding to. The sheet is sized by its content now and `#addSheetBody`
     already scrolls once that content passes `maxH`, so expanding Category inside the panel scrolls
     rather than inflating the box. The jump v1.47 was avoiding is the honest consequence of a
     content-sized sheet. */
  const minH = 0;
  /* v1.40 item 1: the visualViewport resize/scroll handlers fire in bursts while scrolling. Re-writing
     identical geometry forces a layout every time, and that churn is what read as jerky scrolling
     and the sheet sliding about. Write only when something actually changed. */
  const key=bot+"|"+maxH+"|"+minH+"|"+kbUp+"|"+Math.round(vv.offsetTop)+"|"+Math.round(vv.height);
  if(key===_pinLast) return;
  _pinLast=key;
  const instant=_pinInstant; _pinInstant=false;
  const prevTrans=as.style.transition;
  if(instant) as.style.transition="none";
  as.classList.add("vvpin");
  /* v1.46: anchor the sheet's BOTTOM to the visual viewport's bottom and let it grow upward to fit
     its content, instead of forcing a near-full-screen height. The fixed height is what produced the
     large empty grey area above the search bar, and the "full height focus area" whenever the
     keyboard went away (blur) while the sheet stayed open. */
  /* v1.49: the box is CONTENT-sized again and sits directly above the keyboard. v1.47 stretched it to
     the screen bottom and padded it back up, which inflated it to nearly the full screen height — a
     paper rectangle that the deploy animation then swept across the display. The strip below is
     covered by #addUnder instead, which does not move. */
  as.style.top       = "auto";
  as.style.bottom    = bot + "px";
  as.style.height    = "auto";
  as.style.maxHeight = maxH + "px";
  as.style.minHeight = "";
  as.style.maxWidth  = "480px";
  const und=document.getElementById("addUnder");
  if(und){ und.style.height = bot + "px"; und.style.display = bot>0 ? "block" : "none"; }
  as.style.setProperty("--parkoff", bot + "px");   // v1.52: how far below the screen edge "parked" has to reach
  /* the content still has to sit above the keyboard — `bot` is exactly the keyboard+accessory height,
     so pad by it instead of moving the box up. With the keyboard down `bot` is 0 and the empty string
     hands the padding back to the CSS `calc(10px + env(safe-area-inset-bottom))`. This inline write is
     the authoritative one — `.addsheet.kbup` (driven by kbActive, which focusout clears) could go
     stale and is left in place only because applyKb still toggles it. */
  as.style.paddingBottom = bot > 0 ? "12px" : "";   // v1.49: the keyboard strip is #addUnder's job now; v2.37 (item 5): 12px of the sheet above the keyboard's bar
  /* v1.50: the scrim is no longer positioned from vv.offsetTop at all. It is a plain fixed layer that
     OVERDRAWS the viewport by 500px in each direction (see `.sheet-bg#addBg` in the CSS), so however
     far iOS scrolls the visual viewport there is never an uncovered strip of bare paper on screen.
     Writing an exact top was the thing that could be — and was — wrong by a stale frame. */
  if(bg){ bg.style.top=""; bg.style.height=""; }
  if(instant){ void as.offsetHeight; as.style.transition = prevTrans; }   // reflow before the transition comes back
}
function render(){
  queueMicrotask(syncWakeLock);   // v2.16 keep-screen-on follows every change of page and cart
  prefsSchedule();   // v2.71: every settings change ends in a render — the one central place; it only arms a 4 s timer
  queueMicrotask(()=>{ try{ healStuck(); }catch(e){} });   // v2.29 (a microtask: after the module has finished loading)
  if(_colorPicking) return;
  ensureCats();
  if(!configured){ renderSetupNotice(); window.__mlRendered=true; return; }
  if(!me){ renderOnboarding(); window.__mlRendered=true; return; }
  try{ localStorage.setItem("ml_lastview3", String(curPageIdx())); }catch(e){}   // v1.21 remember the page across restarts (item 5)
  /* v1.66 item 2: a pending "Replace slot N?" belongs to the Settings page and nothing else. Clearing
     it here rather than at each exit covers every way out — the nav, the back button, the scrim tap,
     switching user — because they all end in a render with optOpen false. */
  if(!optOpen) appSaveAsk=null;
  if(optOpen){ renderSettingsPage(); wireSettingsPage(); window.__mlRendered=true; syncZoomHeight(); syncAddChrome(); return; }
  if(view==="plan"){ renderPlanTab(); wirePlanTab(); window.__mlRendered=true; syncZoomHeight(); syncAddChrome(); return; }
  if(!shopMode) shopMode=true;   // v1.15 Plan and Shop are one page now — the detail page is always the combined, shoppable list
  renderMain(); wire(); window.__mlRendered=true; syncZoomHeight();
  /* v1.49: the sheet is outside #app now, so a render while it is open must re-hide the page's
     floating pill itself — the templates can no longer be trusted to have done it. */
  syncAddChrome();
}

function renderSetupNotice(){
  app.innerHTML = `<div class="onb"><h1>Almost there<span class="dot">.</span></h1>
    <p>This app needs a free Firebase database to sync between phones. Open <b>index.html</b>, paste your Firebase config into the marked block near the top of the script, then redeploy. Full steps are in <b>README.md</b>.</p></div>`;
}

function renderOnboarding(){
  const cont = state.members.length ? `<div style="margin-top:24px">
      <div class="lbl-cap">Continue as</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        ${state.members.map(m=>`<button class="namebtn" data-join="${esc(m)}">${esc(m)}</button>`).join("")}
      </div></div>` : "";
  const add = state.members.length<4 ? `<div style="margin-top:24px">
      <div class="lbl-cap">${state.members.length?"Or join as someone new":"Add your name"} (${state.members.length}/4 spots used)</div>
      <div class="joinrow"><input id="joinName" placeholder="Your name" /><button id="joinBtn">Join</button></div></div>` : "";
  app.innerHTML = `<div class="onb"><h1>Market List<span class="dot">.</span></h1>
    <p>One grocery list for the whole household. Anyone with this link can see and edit it — up to 4 people. Who's shopping?</p>
    ${cont}${add}
    <div class="share">Share link: <button class="sharebtn" id="copyLink">Copy</button></div></div>`;
  app.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>join(b.dataset.join));
  const jb=app.querySelector("#joinBtn"), jn=app.querySelector("#joinName");
  if(jb) jb.onclick=()=>join(jn.value);
  if(jn) jn.onkeydown=e=>{ if(e.key==="Enter") join(jn.value); };
  const cl=app.querySelector("#copyLink"); if(cl) cl.onclick=copyLink;
}

function sortList(list){ return list.slice().sort((a,b)=>{
  if(a.checked!==b.checked) return a.checked?1:-1;
  if(!a.checked){ const pa=typeof a.pos==="number", pb=typeof b.pos==="number";
    if(pa && pb && a.pos!==b.pos) return a.pos-b.pos;   // v2.57 item 10a: the order someone dragged them into
    if(!(pa && pb)){ const sa=a.starred?0:1, sb=b.starred?0:1; if(sa!==sb) return sa-sb;
      if(pa!==pb) return pa?-1:1; } }
  return a.name.localeCompare(b.name); }); }
function catIndexOf(catId){ const i=catList().findIndex(c=>c.id===catId); return i<0?999:i; }
function subIndexOf(it){ const c=CAT(it.cat); if(!c||!c.subs||!c.subs.length) return 0; const s=effectiveSub(it,c); const i=c.subs.findIndex(x=>x.id===s); return i<0?c.subs.length:i; }
function bySortKey(a,b){ const ca=catIndexOf(a.cat), cb=catIndexOf(b.cat); if(ca!==cb) return ca-cb; const sa=subIndexOf(a), sb=subIndexOf(b); if(sa!==sb) return sa-sb; return (a.name||"").localeCompare(b.name||""); }
function subKey(it){ return it.cat + "|" + subIndexOf(it); }
/* v1.60: "Full" tiles wrote the category colour as an INLINE style, and an inline declaration beats
   the custom properties the six tile pickers set — so on Full, every one of Selected/Unselected
   background, border and text silently did nothing. Accent and Empty were fine, which is why this
   went unnoticed: they leave those three properties to CSS.
   A picker is an explicit instruction and has to win; the category colour is the FALLBACK for
   whichever of the three is still on Auto. This RESOLVES each colour and writes it out rather than
   omitting the declaration and hoping a stylesheet rule supplies it — the first attempt did omit,
   and broke the search-result strip, whose tiles carry neither .reg-in nor .reg-out and so matched
   no rule that could fill them back in. Resolving here works wherever a tile is drawn. */
/* v1.75 item 1: the row's step has to mean something when the picker is on AUTO too. On Auto a tile
   takes the CATEGORY colour — which is not a colour any picker chose, and is different for every
   category — so a stored hex could never describe it. A stored LEVEL can: it says "this surface, two
   steps lighter", whether the colour came from the picker or from the category, which is the only
   thing a row can act on there. shadeBy returns non-hex input unchanged, so the var() fallbacks some
   callers pass through here are safe. */
function catFill(catColor, sel){ return autoShade(sel ? "tilebg"  : "utilebg",  catColor); }
function catEdge(catColor, sel){ return autoShade(sel ? "tilebrd" : "utilebrd", catColor); }
function fullStyle(catColor, sel){
  if(sel){
    /* v1.65 item 2: the default text follows the fill instead of always being white. It always was
       white because the fill was always a full-strength category colour; with Calm now producing a
       genuine pastel (L≈0.8), white on it is unreadable. onAccent picks by luminance, so a dark fill
       still gets white and nothing changes for anyone not using Calm. */
    const fill = tileBgHex()||catFill(catColor,true);
    return `background:${fill};border:1.5px solid ${tileBrdHex()||catEdge(catColor,true)};color:${tileTxtHex()||onAccent(fill)};--illbg:${fill};`;
  }
  /* an unselected tile is an OUTLINE in Full — transparent unless a background was picked. */
  return `background:${uTileBgHex()||"transparent"};border:1.5px solid ${uTileBrdHex()||catEdge(catColor,false)};color:${uTileTxtHex()||"var(--muted)"};--illbg:${uTileBgHex()||((typeof wall!=="undefined" && wall) ? "transparent" : "var(--paper)")};`;   // v2.63 item B: see-through over a wallpaper, as app.css body.haswall .pill.reg-out
}
/* v1.67 item 1: one rule for every scrap of text on a tile. A chosen tile-text colour owns the WHOLE
   tile — name, quantity and weight — because a "text colour" that leaves two of the three in the
   category colour is not a text colour. On **Auto** the old split stays, and that is the point of
   Auto: the meta takes the category colour (or, on a Full tile, whatever contrasts with the fill), so
   "2× 500g" reads as a qualifier on the name rather than part of it. */
/* v2.16: an amount printed in its category's colour must still be readable on its tile (4.5:1) — the yellow
   fruit amounts were 2.9:1. The colour moves toward black (toward white on a dark tile) only as far as it has
   to; the icons keep the category's true colour. */
const _readMemo = new Map();
function hexLum(h){ h=String(h).replace("#",""); if(h.length!==6) return null;
  const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; }
function hexMix(h, t, k){ const a=String(h).replace("#",""), b=String(t).replace("#","");
  return "#"+[0,2,4].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-k)+parseInt(b.slice(i,i+2),16)*k).toString(16).padStart(2,"0")).join("").toUpperCase(); }
function readableOn(fg, bg){
  if(typeof fg!=="string" || !/^#[0-9a-fA-F]{6}$/.test(fg) || typeof bg!=="string" || !/^#[0-9a-fA-F]{6}$/.test(bg)) return fg;
  const key=fg+bg; if(_readMemo.has(key)) return _readMemo.get(key);
  const lb=hexLum(bg), toward = lb>0.35 ? "#000000" : "#FFFFFF";
  const cr=x=>{ const la=hexLum(x); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };
  let out=fg; for(let k=0.05; k<=1.0001 && cr(out)<4.5; k+=0.05) out=hexMix(fg, toward, Math.min(1,k));
  _readMemo.set(key,out); return out; }
var _cardHexMemo = null;   // the theme's --card, read once per theme. var, not let: applyTheme() resets it at boot, long before this line runs
function tileGroundHex(sel){ const pick = sel ? tileBgHex() : uTileBgHex(); if(pick && /^#[0-9a-fA-F]{6}$/.test(pick)) return pick;
  if(!_cardHexMemo){ try{ _cardHexMemo=(getComputedStyle(document.body).getPropertyValue("--card")||"").trim().toUpperCase(); }catch(e){} }
  return _cardHexMemo; }
function metaCol(catColor, sel, full){
  const chosen = sel ? tileTxtHex() : uTileTxtHex();
  if(chosen) return chosen;
  if(!full) return autoShade(sel ? "tiletext" : "utiletext", catColor);
  /* an unselected tile in Full is an OUTLINE, not a fill — its text is muted, so its meta is too */
  if(!sel) return "var(--muted)";
  return onAccent(tileBgHex()||catFill(catColor,true));
}
/* v2.34 (the household's item 8): sorting by Location at a shop, each tile shows its aisle number, top right — from the
   shop's own aisle map (the sign's number) or its built-in layout (r = aisle + 10). Counters (meat, produce…) and shops
   with neither show nothing; nor does any other sort. Set by the Shop page before it draws the tiles. */
var _aisleTags = false;   // var: boot-order rule
function aisleNo(it){ const st=activeStore(); if(!st || st.market || st.id==="home") return "";
  const am=shopMap(st.id);
  if(am){ const k=mapRank(am, it.name, it.cat); return (k>=0 && am[k].n) ? String(am[k].n) : ""; }
  if(!st.aisles || !st.naisles) return "";
  const r=aisleRankBase(it); return (r>=11 && r<=10+st.naisles) ? String(r-10) : ""; }
function pillHTML(i, cat){
  // v1.37 item 5: a checked (in-cart) item renders EXACTLY like it does on the shop list — same
  // fill, same category edge, same meta colour. `.pill.done` then greys + strikes it, so it reads
  // as "bought" without collapsing into an anonymous empty tile.
  const checked=i.checked; const full=fillMode()==="full";
  const edge = cat.color;
  const qcol = metaCol(cat.color, true, full); const qtxt = (full) ? qcol : readableOn(qcol, tileGroundHex(true));
  // --edge carries the category colour so `.shop .pill.done` can keep it (the base `.pill.done`
  // rule forces border-left-color to grey with !important, which is what flattened cart tiles).
  const style = `--edge:${catEdge(cat.color, true)};` + (full ? fullStyle(cat.color, true) : (fillMode()==="empty" ? `border-left:1.5px solid var(--line)` : `border-left:4px solid ${catEdge(edge, true)}`));
  const meta = `${(i.qty||1)>1?`<span class="qty" style="color:${qtxt}">${i.qty}×</span>`:""}${i.weight?`<span class="qty" style="color:${qtxt}">${esc(showAmt(i.weight))}</span>`:""}`;
  /* v1.58 item 1: all three flags show on the tile now, not just the star. `starred` OR the urgent
     tag counts — the chip writes both, but an item saved before v1.58 has only `starred`. */
  const tg = Array.isArray(i.tags) ? i.tags : [];
  const urgent = !checked && (i.starred || tg.includes("urgent"));
  const mk = (svg,col,title)=>`<span class="pmark" style="color:${col}" title="${title}">${svg}</span>`;
  /* v1.77 item 1: the flags are one group, not three children. On a large tile the pill is a COLUMN,
     so three separate spans became three stacked lines — an item that is urgent AND discounted took
     two rows of the tile before its own name. Wrapped, they stay a row inside a column tile and are
     unchanged inside a row one. The saving dot goes in with them: it is the same kind of marker. */
  const markInner = `${dirtyIds.has(i.id)?`<span class="penddot" title="Saving…"></span>`:""}`
    + `${urgent?mk(FLAG_STAR_SVG, full?'#fff':'#E8A91D', 'Urgent'):""}`
    + `${(!checked&&tg.includes("discount"))?mk(FLAG_TAG_SVG,'currentColor',t("If on sale")):""}`
    + `${(!checked&&tg.includes("convenient"))?mk(FLAG_CLOCK_SVG,'currentColor','If convenient'):""}`;
  const marks = markInner ? `<span class="pmarks">${markInner}</span>` : "";
  // v1.20 unified row anatomy (shared with regPill): emoji · name, then qty/weight pushed to the right.
  // No check circle — tapping the whole row checks it. Selected/on-list uses the Full/Empty tile look.
  const em = itemIcon(i.name, i.cat);
  const emS = em?`<span class="pemoji" aria-hidden="true" style="color:${qcol}">${em}</span>`:"";
  const nl = noteLine(i);   // v2.22 which shop, and the note
  return `<button class="pill ${checked?'done':''} ${urgent?'urgent-dup':''} ${i.id===lastPop?'justpop':''}${nl?' hasnote':''}" data-pill="${i.id}" style="${style}">`
    +`${(_aisleTags && !checked) ? (()=>{ const a=aisleNo(i); return a ? `<span class="paisle" aria-label="Aisle ${esc(a)}"><i aria-hidden="true">A</i>${esc(a)}</span>` : ""; })() : ""}${emS}${marks}<span class="pname">${esc(cap(tileName(i.name)))}</span>${meta?`<span class="pill-meta">${meta}</span>`:""}${nl?`<span class="pnote">${esc(nl)}</span>`:""}`
    +`</button>`;
}
function pillRow(items, cat){ return `<div class="pills">${items.map(i=>pillHTML(i,cat)).join("")}</div>`; }
function pillsMixed(items){ return `<div class="pills">${items.map(i=>pillHTML(i, CAT(i.cat))).join("")}</div>`; }
function qpanelHTML(i, cat){ const cur=i.weight||"";
  const W=["","100g","200g","300g","400g","500g","600g","700g","800g","900g","1kg","2kg","3kg","4kg","5kg","10kg"];
  return `<div class="qpanel" style="border-left:4px solid ${cat.color}">
    <div class="qstep2"><button data-qm-minus="${i.id}" aria-label="Less">−</button><span>${i.qty||1}</span><button data-qm-plus="${i.id}" aria-label="More">+</button></div>
    <div class="wrowq">${W.map(w=>`<button class="wchipq ${cur===w?'on':''}" data-qm-weight="${i.id}|${w}">${w?(w==="500g"||w==="1kg"?'★'+w:w):t('Unit')}</button>`).join("")}</div>
    <button class="qm-edit" data-qm-edit="${i.id}" aria-label="Full edit">⋯</button>
  </div>`; }

function wireQuickPanel(){
  app.querySelectorAll("[data-qm-minus]").forEach(b=>b.onclick=()=>{ const it=state.items.find(i=>i.id===b.dataset.qmMinus); if(it){ it.qty=Math.max(1,(it.qty||1)-1); markDirty(it.id); save(); render(); } });
  app.querySelectorAll("[data-qm-plus]").forEach(b=>b.onclick=()=>{ const it=state.items.find(i=>i.id===b.dataset.qmPlus); if(it){ it.qty=(it.qty||1)+1; markDirty(it.id); save(); render(); } });
  app.querySelectorAll("[data-qm-weight]").forEach(b=>b.onclick=()=>{ const [id,w]=b.dataset.qmWeight.split("|"); const it=state.items.find(i=>i.id===id); if(it){ it.weight=w; markDirty(it.id); save(); render(); } });
  app.querySelectorAll("[data-qm-edit]").forEach(b=>b.onclick=()=>{ const it=state.items.find(i=>i.id===b.dataset.qmEdit); if(it){ quickEdit=null; editing={kind:"item", ...it}; render(); } });
}
// A26 — calmer category header + per-aisle progress bar, used only by the midnight/market/mono themes.
const CALM_THEMES = new Set(["light","dark"]);   // v1.39 all themes use the calm header
function calmHead(cat, done, total, collapsed, attr, entryOpen){
  const pct = total ? Math.round(done/total*100) : 0;
  // v1.38 item 6: show the category ICON when Category icons is on (every theme uses this header
  // since v1.28, so the icon was never rendered anywhere); fall back to the colour dot when off.
  const ic = catIcon(cat,16);
  /* v1.74 item 3: with no icon, the dot was a second thing saying what the label can say itself —
     so the dot goes and the LABEL takes the category's colour. `var(--cattext, …)` keeps the Category
     text picker winning when one is set; the category colour is only the fallback, exactly as
     everywhere else. With an icon, nothing changes. */
  return `<div class="chead" role="heading" aria-level="2"><button class="lbl catheadchip catcalm" ${attr}="${cat.id}">`
    +(ic ? `<span class="cemoji">${ic}</span>` : "")
    +`<span class="cname"${ic ? "" : ` style="color:var(--cattext, ${autoShade("cat", cat.color)})"`}>${esc(catLabel(cat))}</span>`
    +`<span class="cnum">${done}/${total}${collapsed?' ▸':''}</span></button>`
    +`<button class="plus" data-add="${cat.id}" style="${entryOpen?`background:${cat.color};color:#fff`:''}">${entryOpen?'×':'+'}</button></div>`
    +`<div class="cprog" aria-hidden="true"><i style="width:${pct}%;background:${cat.color}"></i></div>`;
}
/* v1.15 combined page — the "planning" section, shown below the shopping list. Your regulars
   (previously-bought items not currently on the list) as dotted pills, grouped by category and
   COLLAPSED by default; tap one to add it, long-press to edit. Reuses planOutlineChip + the
   .ba-restore wiring. v1.22: one collapsed "Regulars" header (collapse.regAll) reveals all groups. */
/* v1.17 one row per regular — selected (on the list) shows a solid pill; not-selected shows a
   dotted pill. Tap toggles; long-press edits. Sorted A-Z. */
function regPill(entry, cat, it){
  // v1.20 regulars look identical to shopping-list rows: emoji · name, qty/weight on the right.
  // Selected (already on the list) uses the Full/Empty tile look; not-selected keeps the dotted
  // outline (no "+"). No tick on selected — the solid/filled look already reads as "on the list".
  const selected = !!it;
  const q = selected ? (it.qty||1) : (entry.qty||1);
  const w = selected ? (it.weight||"") : (entry.weight||"");
  const full = selected && fillMode()==="full";
  const qcol = metaCol(cat.color, selected, full); const qtxt = (full) ? qcol : readableOn(qcol, tileGroundHex(selected));
  const em = itemIcon(entry.name, cat.id);
  const emS = em?`<span class="pemoji" aria-hidden="true" style="color:${qcol}">${em}</span>`:"";
  const meta = `${q>1?`<span class="qty" style="color:${qtxt}">${q}×</span>`:""}${w?`<span class="qty" style="color:${qtxt}">${esc(w)}</span>`:""}`;
  const metaS = meta?`<span class="pill-meta">${meta}</span>`:"";
  const name = `<span class="pname">${esc(cap(tileName(entry.name)))}</span>`;   // v2.10: own span so it can be clamped and measured
  /* v2.68: a Regular is its name, category AND note — the tile shows its note, as a list item does, and carries it */
  const nl = noteLine(selected ? it : entry);
  const noteS = nl ? `<span class="pnote">${esc(nl)}</span>` : "";
  const nAttr = ` data-reg-note="${esc(entry.note||"")}"`;
  if(selected){
    /* v1.57 item 1: only the category-driven parts stay inline. Fill, line and text now come from
       CSS so that one rule owns all four sides of the border — see .pill.reg-in / .pill.reg-out. */
    const style = full ? fullStyle(cat.color, true)
      : (fillMode()==="empty" ? "" : `border-left:4px solid ${catEdge(cat.color, true)}`);
    return `<button class="pill reg-in" data-reg-rm="${it.id}" data-regk="${esc(entry.name)}|${esc(entry.cat)}"${nAttr} style="${style}">${emS}${name}${metaS}${noteS}</button>`;
  }
  /* v1.57 item 1: the unselected regular used to hard-code its own border, background and text
     inline. The Empty-mode rule repaints border-left-color with !important, which beat the inline
     declaration for that ONE side and left the other three grey — a coloured bar down the left of a
     tile that is not on the list at all. All four sides come from the same token now. */
  const outStyle = fillMode()==="full" ? fullStyle(cat.color, false)
    : fillMode()==="empty" ? ""
    : `border-left:4px solid ${catEdge(cat.color, false)}`;
  return `<button class="pill reg-out" data-reg-add="${esc(entry.name)}|${cat.id}" data-regk="${esc(entry.name)}|${esc(entry.cat)}"${nAttr} style="${outStyle}">${emS}${name}${metaS}${noteS}</button>`;
}
/* v2.56 item 5: Regulars a person has dragged into order carry a numeric `pos` and come first, in that order; the rest
   stay A–Z after them — so nothing moves until someone reorders a category. */
function regSortCmp(a,b){ const pa=typeof a.pos==="number", pb=typeof b.pos==="number";
  if(pa && pb) return (a.pos-b.pos) || a.name.localeCompare(b.name);
  if(pa) return -1; if(pb) return 1; return a.name.localeCompare(b.name); }
function planningSection(){
  // v1.24 the "Regulars" section shows its categories by default; each category is collapsed by default.
  const groups = catList().map(cat=>{
    const regs = state.buyAgain.filter(e=>catShown(e.cat)===cat.id).slice().sort(regSortCmp);   // v2.56: the household's order (pos), then A–Z
    /* v2.34 (the household's item 5): every category is listed, even with no Regulars yet, and ends with a "+" tile that adds
       a Regular straight into it. v2.37 (item 4): it opens the same add sheet as '+ Add items'; what is added there goes on
       the list in this category and is kept as a Regular */
    const addT = `<button class="pill baadd" data-ba-new="${esc(cat.id)}" style="border:1.5px dashed ${cat.color};color:${cat.color}" aria-label="${esc(tf("Add a Regular to {x}", { x:catLabel(cat) }))}"><span class="baplus" aria-hidden="true">+</span></button>`;
    const ccol = !(collapse.regOpen||[]).includes(cat.id);   // v1.24 per-category collapse — collapsed unless the user opened it
    const pills = ccol ? "" : `<div class="pills" style="margin-top:6px">${regs.map(e=>{
      const it = state.items.find(i=>!i.checked && i.name.toLowerCase()===e.name.toLowerCase() && catShown(i.cat)===cat.id && noteKey(i.note)===noteKey(e.note));   // show selected ones too · v2.68: of the same note
      return regPill(e,cat,it); }).join("")}${addT}</div>`;
    return `<div class="regcat"><button class="regcatlbl" data-regc="${cat.id}"><span>${esc(catLabel(cat))}</span><span class="regcnum">${regs.length}${ccol?' ▸':' ▾'}</span></button>${pills}</div>`;
  }).filter(Boolean).join("");
  if(!groups) return "";   // v2.34: never empty now — every category has its row
  const open = collapse.regAll !== false;   // v1.24 shown by default (categories visible)
  return `<div class="plansec"><button class="plansec-h" data-reg-showall aria-expanded="${open}"><span>${t("＋ Add from your regulars")}</span><span class="plansec-count">${state.buyAgain.length}${open?' ▾':' ▸'}</span></button>${open?groups:""}</div>`;
}
/* v1.74 item 1: adding straight into a category suggests what to add. `addMatches` already ranks
   exactly right for this — predicted-due first, then your regulars, then the dictionary — so this is
   that list filtered to the category being added to, which is the question actually being asked
   ("what goes in Fruit?"). Anything already on the list is dropped: this is a list of things to ADD.
   Wrapping chips, never a sideways scroller — see v1.66 for why that shape kept failing. */
function catSuggest(cat){
  const f=(draftCatText||"").trim().toLowerCase();
  const ms=addMatches(f).filter(m=>catShown(m.cat)===cat.id && !m.onId).slice(0,18);
  if(!ms.length) return "";
  return `<div class="catsug">${ms.map(m=>
    `<button class="catsugchip" data-catsug="${esc(m.name)}|${cat.id}" style="border-color:${cat.color}">${esc(cap(m.name))}</button>`
  ).join("")}</div>`;
}
/* v1.74 item 1: wiring the suggestions is its own function because it happens twice — once when the
   page renders, and again every time they are rebuilt as you type. */
function wireCatSuggest(){
  document.querySelectorAll("[data-catsug]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ const p=b.dataset.catsug.split("|"), c=p.pop(), n=p.join("|");
      addEntries(n, c); render();
      const ci=document.querySelector("#catInput"); if(ci){ ci.focus(); grow(ci); } }; });
}
/* v1.74 item 1: the suggestions narrow as you type — and ONLY this block is rebuilt. A render would
   remove the focused textarea, and iOS drops the keyboard the instant that happens (v1.45), which is
   the whole reason the add sheet refreshes its body rather than the page. Same trick, smaller box. */
function refreshCatSuggest(){
  if(!catEntry) return;
  const cat=CAT(catEntry); if(!cat) return;
  const add=document.querySelector(".catadd"); if(!add) return;
  const box=document.querySelector(".catsug");
  const tmp=document.createElement("div"); tmp.innerHTML=catSuggest(cat);
  const next=tmp.firstElementChild;
  if(!next){ if(box) box.remove(); return; }
  if(box) box.replaceWith(next); else add.insertAdjacentElement("afterend", next);
  wireCatSuggest();
}
function renderMain(){
  const open = state.items.filter(i=>!i.checked).length;
  const done = state.items.filter(i=>i.checked).length;

  const anyOpen = catList().some(c=> state.items.some(i=>catShown(i.cat)===c.id) && !collapse.cats.includes(c.id)) || (state.buyAgain.length>0 && collapse.ba);
  const firstCatId = (catList().find(c=>state.items.some(i=>catShown(i.cat)===c.id))||{}).id;

  const buildCatBlocks = (flatWithin)=> catList().map(cat=>{
    const all = sortList(state.items.filter(i=>catShown(i.cat)===cat.id && listHere(i)));
    const list = all.filter(i=>!i.checked);   // checked items live in the Checked section now
    const collapsed = collapse.cats.includes(cat.id);
    const has = list.length>0;
    if(!has && !cat.custom && catEntry!==cat.id) return null;
    let pills = "";
    if(has && !collapsed){
      const unchecked = list;
      if(cat.subs && cat.subs.length && !flatWithin){
        pills = cat.subs.map(s=>{ const its=unchecked.filter(i=>effectiveSub(i,cat)===s.id);
          return its.length ? pillRow(its, cat) : ""; }).join("");
        const none = unchecked.filter(i=>!effectiveSub(i,cat));
        if(none.length) pills += pillRow(none, cat);
      } else {
        pills = unchecked.length ? pillRow(unchecked, cat) : "";
      }
    }
    const catAdd = catEntry===cat.id ? `<div class="catadd">
        <div class="inwrap"><textarea id="catInput" rows="1" placeholder="${esc(tf("Add to {x}", { x:catLabel(cat) }))}" style="border:2px solid ${cat.color}"></textarea><button class="clearbtn" id="catClear" aria-label="Clear">×</button></div>
        <button id="catAddBtn" style="background:${cat.color}">+</button></div>${catSuggest(cat)}` : "";
    const chipText = has ? '#fff' : 'var(--muted2)';
    const chipBg = has ? cat.color : 'transparent';
    const chipBorder = has ? cat.color : 'var(--line)';
    const chead = CALM_THEMES.has(theme)
      ? calmHead(cat, all.filter(i=>i.checked).length, all.length, collapsed, "data-cat", catEntry===cat.id)
      : `<div class="chead" role="heading" aria-level="2">
        <button class="lbl catheadchip" data-cat="${cat.id}" style="background:${chipBg};border:1.5px solid ${chipBorder};color:${chipText}">
          <span class="cemoji">${catIcon(cat,16)}</span>
          <span class="cname" style="color:${chipText}">${esc(catLabel(cat))}</span>
          ${has?`<span class="cnum" style="color:${chipText};opacity:.85">${list.length}${collapsed?' ▸':''}</span>`:""}
        </button>
        <button class="plus" data-add="${cat.id}" style="${catEntry===cat.id?`background:${cat.color};color:#fff`:''}">${catEntry===cat.id?'×':'+'}</button>
      </div>`;
    return `<section class="cat">${chead}${catAdd}${pills}</section>`;
  }).filter(Boolean);

  const checkedItems = state.items.filter(i=>i.checked);
  /* v2.00: closed until asked for. This drawer is a peek at what is already IN the cart, and it was
     opening itself on every visit — a translucent panel over the list you are still shopping, to show
     you things you have finished with. The one row underneath says how many there are, which is the
     part worth having at a glance. `===true` rather than `!==false` flips only the never-touched
     case: anyone who has opened it keeps it open, exactly as before. */
  const checkedOpen = collapse.checked===true;
  /* v2.10: a cart filled at a known store needs to know when you are somewhere else, whatever the sort —
     ensureLocCheck keeps its own two-minute cache, and autoFinishAt does the rest */
  if(state.items.some(i=>i.checked && i.checkedStore)) ensureLocCheck();

  const pct = state.items.length ? Math.round(done/state.items.length*100) : 0;
  const disp = displayFor();
  let sm = (disp==="cat" && (sortModeFor()==="location"||sortModeFor()==="ai")) ? "cat" : sortModeFor();   // Location & AI need flat display
  if(sm==="ai" && !aiSortOK()) sm="location";   // Home/Other: AI unavailable → fall back to Location
  /* v1.64 item 2: with no Urgent section to put them in (v1.63 item 2), ungrouped lists lead with the
     urgent items instead. A STABLE partition — whatever order the chosen sort produced is preserved
     inside each half, so Location still walks the aisles and A-Z is still alphabetical, just with the
     urgent ones brought forward. */
  const isUrgent = i => !!(i.starred || (Array.isArray(i.tags)&&i.tags.includes("urgent")));
  const urgentFirst = list => list.filter(isUrgent).concat(list.filter(i=>!isUrgent(i)));
  _aisleTags = (disp!=="cat" && sm==="location" && locActive());   // v2.34 aisle numbers only while walking a shop by Location
  let bodyBlocks;
  if(disp==="cat"){ bodyBlocks = buildCatBlocks(!subOn); }                              // v1.23 Subcategory toggle controls sub-grouping
  else if(sm==="ai"){ ensureLocCheck(); const unchecked=state.items.filter(i=>!i.checked && listHere(i)).slice().sort(byAI);   // AI = accepted per-store check order
    // A25 item-level order, frozen at trip start (aiResetTrip) — learns per item, applies next trip, never reshuffles mid-shop
    bodyBlocks = [ `<section class="cat">${ unchecked.length ? pillsMixed(urgentFirst(unchecked)) : "" }</section>` ]; }
  else if(sm==="location"){ ensureLocCheck(); const useStore=locActive(); const cmp=useStore?byAisle:bySortKey;
    let unchecked=state.items.filter(i=>!i.checked && listHere(i)); const n0=unchecked.length;
    if(useStore) unchecked=unchecked.filter(storeShows);
    unchecked=unchecked.slice().sort(cmp);
    const hid=n0-unchecked.length;
    const note=(useStore && hid>0) ? `<div class="hint" style="margin:0 0 8px;text-align:left">${esc((activeStore()||{}).name||"Market")} · fresh, meat &amp; produce only · ${hid} other ${hid===1?"item":"items"} hidden</div>` : "";
    bodyBlocks = [ `<section class="cat">${note}${ unchecked.length ? pillsMixed(urgentFirst(unchecked)) : "" }</section>` ]; }
  else if(sm==="alpha"){ const unchecked=state.items.filter(i=>!i.checked && listHere(i)); bodyBlocks = [ `<section class="cat">${ unchecked.length ? pillsMixed(urgentFirst(sortList(unchecked))) : "" }</section>` ]; }
  else { const unchecked=state.items.filter(i=>!i.checked && listHere(i)).slice().sort(bySortKey); bodyBlocks = [ `<section class="cat">${ unchecked.length ? pillsMixed(urgentFirst(unchecked)) : "" }</section>` ]; }
  /* v1.62 item 2: Urgent is a lens over the list, not a category — it has to be at the top whether or
     not "Group by category" is on, and whichever sort is running. So it is rendered from the item
     list directly and the normal blocks are asked to leave those items out, rather than trying to
     teach every one of the five sort branches above about it. */
  /* v1.63 item 2: Urgent is only shown when the list is GROUPED BY CATEGORY. Ungrouped, the list is
     one flat run in a chosen order and a second lens over the top of it reads as a duplicate rather
     than as a section — the flag still shows on the tile either way. */
  const urgentAll = state.items.filter(i=>isUrgent(i) && listHere(i));
  const urgentItems = urgentAll.filter(i=>!i.checked);
  if(disp==="cat" && urgentItems.length){
    /* v1.63 item 2: the same header every other section draws (see calmHead) — same chip, same
       padding, same text size, same count and the same progress bar — so it lines up with the
       categories instead of sitting 9px proud of them. Amber stands in for the category colour. */
    const uCol="#E8A91D";
    const uCollapsed = collapse.cats.includes("__urgent");
    const uPct = urgentAll.length ? Math.round(urgentAll.filter(i=>i.checked).length/urgentAll.length*100) : 0;
    const uHead = `<div class="chead"><button class="lbl catheadchip catcalm urgentchip" data-urgentc="1">`
      + `<span class="cemoji">${FLAG_STAR_SVG}</span><span class="cname">Urgent</span>`
      + `<span class="cnum">${urgentAll.filter(i=>i.checked).length}/${urgentAll.length}${uCollapsed?' ▸':''}</span></button></div>`
      + `<div class="cprog" aria-hidden="true"><i style="width:${uPct}%;background:${uCol}"></i></div>`;
    bodyBlocks = [`<section class="cat urgentsec${uCollapsed?' ucoll':''}">${uHead}${uCollapsed?"":pillsMixed(urgentItems.slice().sort(bySortKey))}</section>`].concat(bodyBlocks);
  }
  /* v2.22 R17: at a shop, what is for another shop folds into one section at the bottom, grouped by that shop */
  const elsewhere = awayStoreId() ? state.items.filter(i=>!i.checked && !listHere(i)) : [];
  if(elsewhere.length){ const groups={}; for(const i of elsewhere) (groups[i.where]=groups[i.where]||[]).push(i);
    const inner = elseOpen ? Object.keys(groups).map(w=>`<div class="elsehd">${esc(whereNames(whereIds({ where:w })).join(" or ")||"Another shop")}</div>${pillsMixed(sortList(groups[w]))}`).join("") : "";
    bodyBlocks.push(`<section class="cat elsewhere"><button class="elsebtn" id="elseToggle" aria-expanded="${elseOpen?'true':'false'}"><span>${t("For other shops")}</span> <span class="cnum">${elsewhere.length}${elseOpen?' ▾':' ▸'}</span></button>${inner}</section>`); }
  const listBody = bodyBlocks.join("");
  const cartDrop = done>0 && !_cartWasShown; _cartWasShown = done>0; if(cartDrop) _cartDropping = true;   // v2.12 slides down only when the first item goes in
  const checkedBar = done>0 ? `<div class="checkedbar shop${cartDrop?' drop':''}" id="checkedbar">
      ${/* v2.00 item 1: one row, not two. The label varies because the row already says "N in cart":
           collapsed there is no space and the count would be said twice, so it is just "Finish";
           open there is room, and the longer wording explains what the tap is about to do. */""}
      <div class="checkedfoot">
        <button class="checkedbarhead" id="checkedHead"><span class="chk-in"><span class="chk-tick">✓</span><span class="chk-txt"><span class="chk-n">${tf("{n} in cart", { n:done })}</span>${(()=>{ const e=cartEstimate(); return e.priced ? `<span class="cartest">${tf("about {x}", { x:priceMoney(e.total) })}${e.priced<e.n?tf(" for {a} of {b}", { a:e.priced, b:e.n }):""}</span>` : ""; })()}</span></span><svg class="cbtri${checkedOpen?' open':''}" width="8" height="9.5" viewBox="0 0 8 9.5" aria-hidden="true"><path d="M1 .6 L7.4 4.75 L1 8.9 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg></button>
        <button id="sweepBtn" class="sweepbtn sweepbanner">${t("Save to Regulars")}</button>
      </div>
      ${checkedOpen?`<div class="checkedscroll"><div class="zoomer ${styl()}${lineList()?' linelist':''}${gridCols()?(' gridmode grid'+gridCols()):''}${(dispBase()==='large'&&largeCols()===0)?' largevar':''}" style="transform:scale(${dens()});transform-origin:top left;width:calc(100% / ${dens()})">${pillsMixed(checkedItems.slice().sort((a,b)=>(b.checkedAt||0)-(a.checkedAt||0)))}</div></div>`:""}
    </div>` : "";
  app.innerHTML = `
    <div class="topfix" id="topfix">
      ${/* v1.65 item 1: the store reads as a qualifier on the COUNT — "12 to buy, at Waitrose" — so it
            sits under it, centred, rather than trailing the list name. v1.62 put it on the title line to
            save a row; it only costs one when a store is actually active, which is the trade taken. */""}
      <header class="hstack">
        <div class="hrow">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap" role="heading" aria-level="1">
            ${/* v1.90: the 52px held for a back arrow goes with the arrow — the title starts where the
                  tiles and category headings start. Settings keeps its own back button. */""}
            <button class="title disp listswitch" id="listSwitch" aria-haspopup="dialog" aria-expanded="${listsOpen?'true':'false'}">${esc(state.name || (getLists().find(l=>l.code===listCode)||{}).name || "Market List")}<span class="lschev" aria-hidden="true">${CHEV_BIG_SVG}</span></button>
          </div>
          ${open>0?`<span class="hcount hcount-mid">${tf("{n} to buy", { n:open })}</span>`:""}
          <div style="display:flex;align-items:center;gap:8px">
            ${syncChip()}<span class="smwrap"><button class="iconbtn hshare" id="shopMenu" aria-label="${t("More")}" aria-haspopup="true" aria-expanded="${shopMenuOpen?"true":"false"}" title="${t("More")}">${MENU_SVG(19)}</button><span class="appver" id="appVer">${esc(APP_VERSION)}</span></span>${/* v2.72 (the household): the version under the ⋯ */""}
          </div>
        </div>
        ${locChip()?`<div class="hloc">${locChip()}</div>`:""}
      </header>
    </div>
    ${checkedBar}
    <div class="wrap ${shopMode?'shop':''}" role="main">
    <div class="zoomwrap"><div class="zoomer ${styl()}${lineList()?' linelist':''}${gridCols()?(' gridmode grid'+gridCols()):''}${(dispBase()==='large'&&largeCols()===0)?' largevar':''}" id="zoomer" style="transform:scale(${dens()});transform-origin:top left;width:calc(100% / ${dens()})">
      ${lockedHTML()}${newerDataHTML()}${shoppingHTML()}${(()=>{ const c=(lookCardHTML()||prefsCardHTML())+installCardHTML()+cardNudgeHTML()+rcptNudgeHTML(); return c || onbCardHTML(); })()}${tenCardHTML()}${cmpCardHTML()}${(state.items.length===0)?`<div class="empty">
          ${/* v2.56 item 4: a drawn empty basket, and two ways to start — say it, or type it */""}
          <div class="empty-basket">${BASKET_SVG}</div>
          <p class="empty-title">${t("Your list is empty")}</p>
          <div class="pills empty-start" style="justify-content:center">
            <button class="pill baadd" id="emptyMic" aria-label="${t("Say what you need")}">${MIC_SVG(26)}</button>
            <button class="pill baadd" id="emptyAdd" aria-label="${t("Add items")}"><span class="baplus" aria-hidden="true">+</span></button>
          </div>
        </div>`:""}
      ${mergeCardHTML()}
      ${listBody}
      ${planningSection()}
    </div></div>
  </div>
  ${!addOpen?`<div class="addpill-wrap" id="shopAddFabWrap"><button class="addpill" id="shopAddFab" aria-label="${t("Add items")}"><span class="addpill-in"><span class="addpill-plus" aria-hidden="true">+</span><span class="addpill-lbl">${t("Add items")}</span></span></button></div>`:""}${/* v1.36 item 4: search bar shows even on an empty list */""}
  ${bottomNav({planId:"planNav",planActive:false,cartId:"cartNav",cartActive:true,setId:"setNav"})}${userTilesHTML()}  ${finishOpen?finishSheet():""}
  ${listsOpen?listsSheet():""}
  ${fabMoveOpen?fabMoveSheet():""}
  ${listActOpen?listActSheet():""}
  ${newListOpen?newListSheet():""}
  ${voiceOpen?voiceSheet():""}${micHelpOpen?micHelpHTML():""}${smartOpen?smartSheet():""}${rcpt?rcptSheet():""}${tenSheet?tenSheetHTML():""}${cmpOpen?cmpSheetHTML():""}${occSheet?occSheetHTML():""}${spendOpen?spendSheetHTML():""}${amOpen?amSheetHTML():""}${shopMenuOpen?shopMenuHTML():""}${priceDiagOpen?priceDiagHTML():""}${cardEdit?cardEditHTML():""}${cardShow?cardShowHTML():""}${stuckOpen?stuckHTML():""}${locDiagOpen?locDiagHTML():""}${rpt?rptSheet():""}${rst?rstSheet():""}${siriOpen?siriSheetHTML():""}${dictOpen?dictSheetHTML():""}${noListOpen?noListSheetHTML():""}
  ${editing?editSheet():(_editFoldKey="")}
  ${toast?`<div class="toast" id="toast"><span>${esc(t(toast))}</span>${toastAction?`<button id="undoBtn" class="undobtn">${esc(t(toastAction.label))}</button>`:""}</div>`:""}`;
}

function listActSheet(){ const a=getLists(); const idx=a.findIndex(x=>x.code===listActCode); const l=a[idx]||{};
  return `<div class="sheet-bg" id="listActBg"><div class="sheet" id="listActSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${esc(l.name||t('List'))}</div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="optaction" id="laUp" style="flex:1;margin:0" ${idx<=0?'disabled style="flex:1;margin:0;opacity:.35"':''}>↑ ${t("Move up")}</button>
      <button class="optaction" id="laDown" style="flex:1;margin:0" ${idx>=a.length-1?'disabled style="flex:1;margin:0;opacity:.35"':''}>↓ ${t("Move down")}</button>
    </div>
    <button class="optaction" id="laRename">${t("Rename")}</button>
    <button class="optaction" id="laShare">${t("Share")}</button>
    <button class="optaction" id="laDup">${t("Duplicate list")}</button>
    <button class="optaction" id="laDelete" style="border-color:#C24A33;color:#C24A33">${t("Delete")}</button>
  </div></div>`;
}
/* v1.81: the switcher's "Create new list" can be tapped from the Shop page now, so the sheet it opens
   — and its wiring — can no longer live only on the Lists page. Same markup, same handlers, two callers. */
function wireNewListSheet(){
  const nlbg=app.querySelector("#newListBg"); if(nlbg) nlbg.onclick=()=>{ newListOpen=false; render(); };
  const nls=app.querySelector("#newListSheet"); if(nls) nls.onclick=e=>e.stopPropagation();
  const nln=app.querySelector("#newListName");
  if(nln){ nln.focus(); try{ nln.setSelectionRange(nln.value.length,nln.value.length); }catch(e){}
    nln.oninput=()=>{ newListDraft=nln.value; };
    nln.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); createNewListFromSheet(); } }; }
  const nlc=app.querySelector("#newListCreate"); if(nlc){ nlc.onpointerdown=e=>e.preventDefault(); nlc.onclick=createNewListFromSheet; }
}
/* v1.82: the switcher opens from the Shop page and the Plan page both, so its wiring lives in one
   function rather than inline in wire(). Same handlers, more than one caller. */
function wireListsSheet(){
  const fmBg=app.querySelector("#fabMoveBg"); if(fmBg) fmBg.onclick=e=>{ if(e.target===fmBg){ fabMoveOpen=false; render(); } };
  app.querySelectorAll("[data-fabalign]").forEach(b=>b.onclick=()=>{ fabMoveOpen=false; setSrchAlign(b.dataset.fabalign); });
  const lsBg=app.querySelector("#listsBg"); if(lsBg) lsBg.onclick=()=>{ listsOpen=false; render(); };
  const lsS=app.querySelector("#listsSheetEl"); if(lsS) lsS.onclick=e=>e.stopPropagation();
  /* v1.83: tap picks the list, press-and-hold opens everything you can do to it.
     v2.57 item 10b: in this sheet a hold then a move drags the row among the lists (release reorders ml_lists); a hold
     without movement does nothing; the ⋯ opens the row's actions inline. The Lists page keeps its own action sheet. */
  app.querySelectorAll("[data-list]").forEach(b=>{ const code=b.dataset.list;
    let down=null, drag=null;
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=e=>{ if(e.target.closest && e.target.closest(".lp-more")) return; pressStart(); down={ x:e.clientX, y:e.clientY }; };
    b.onpointermove=e=>{ if(!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
      if(!drag){ if(!longFired || Math.hypot(dx,dy)<=8) return;
        drag=tileDragStart(b, e, b.closest(".listrows"), ".listpick", els=>{ const order=els.map(x=>x.dataset.list), a=getLists();
          const next=order.map(c=>a.find(x=>x.code===c)).filter(Boolean); a.forEach(x=>{ if(!next.includes(x)) next.push(x); });
          saveLists(next); render(); });
        if(!drag){ down=null; return; } }
      tileDragMove(drag, e, 0, dy); };
    b.onpointerleave=()=>{ if(!drag) pressCancel(); };
    b.onpointercancel=()=>{ pressCancel(); down=null; if(drag){ const d=drag; drag=null; tileDragEnd(d,false); } };
    b.addEventListener("touchmove", e=>{ if(down && longFired) e.preventDefault(); }, { passive:false });
    b.onpointerup=e=>{ pressCancel(); const wasDown=down; down=null;
      if(drag){ const d=drag; drag=null; tileDragEnd(d,true); return; }
      if(e.target.closest && e.target.closest(".lp-more")) return;   // v2.56 the ⋯ has its own tap
      if(!wasDown || longFired) return;   // v2.57: a hold without movement does nothing here
      switchList(code); };
    b.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); switchList(code); } };
  });
  app.querySelectorAll("[data-list-more]").forEach(m=>{   // v2.57 item 10b: the row's ⋯ toggles its inline actions
    m.onpointerdown=e=>e.stopPropagation();
    m.onclick=e=>{ e.stopPropagation(); const c=m.dataset.listMore; listOptsCode = (listOptsCode===c ? null : c); render(); }; });
  app.querySelectorAll("[data-lo-rename]").forEach(x=>x.onclick=()=>listActRename(x.dataset.loRename));
  app.querySelectorAll("[data-lo-share]").forEach(x=>x.onclick=()=>listActShare(x.dataset.loShare));
  app.querySelectorAll("[data-lo-dup]").forEach(x=>x.onclick=()=>listActDup(x.dataset.loDup));
  app.querySelectorAll("[data-lo-delete]").forEach(x=>x.onclick=()=>{ listOptsCode=null; listActDelete(x.dataset.loDelete); });
  wireListActSheet();
  app.querySelectorAll("[data-list-up]").forEach(b=>b.onclick=()=>moveList(b.dataset.listUp,-1));
  app.querySelectorAll("[data-list-down]").forEach(b=>b.onclick=()=>moveList(b.dataset.listDown,1));
  app.querySelectorAll("[data-list-del]").forEach(b=>b.onclick=()=>delList(b.dataset.listDel));
  const nl=app.querySelector("#newList"); if(nl) nl.onclick=newListPrompt;
  wireNewListSheet();
  const rl=app.querySelector("#renameList"); if(rl) rl.onclick=renameList;
}
/* v1.83: the list-action sheet is reachable from the switcher's rows now, not just the Lists page's
   bubbles, so its wiring has to travel with it. Same handlers, two callers. */
function wireListActSheet(){
  const lbg=app.querySelector("#listActBg"); if(lbg) lbg.onclick=()=>{ listActOpen=false; render(); };
  const las=app.querySelector("#listActSheet"); if(las) las.onclick=e=>e.stopPropagation();
  const lar=app.querySelector("#laRename"); if(lar) lar.onclick=()=>listActRename(listActCode);
  const laup=app.querySelector("#laUp"); if(laup) laup.onclick=()=>moveList(listActCode,-1);
  const ladn=app.querySelector("#laDown"); if(ladn) ladn.onclick=()=>moveList(listActCode,1);
  const lash=app.querySelector("#laShare"); if(lash) lash.onclick=()=>listActShare(listActCode);
  const lac=app.querySelector("#laDup"); if(lac) lac.onclick=()=>listActDup(listActCode);
  const lad=app.querySelector("#laDelete"); if(lad) lad.onclick=()=>listActDelete(listActCode);
}
/* v2.57 item 10b: the list actions, by code — the action sheet and the lists sheet's inline panel share them */
function listActRename(code){ return renameListCode(code); }
function listActShare(code){ return shareListCode(code); }
function listActDup(code){ return duplicateListCode(code); }
function listActDelete(code){ return delListUndo(code); }
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
/* v2.10: a size word reads as a qualifier, so it goes after the thing it qualifies on a tile —
   "small can corn kernel" shows as "Can corn kernel small". Display only: the stored name, matching,
   drawings and sorting all keep the real name. */
const SIZE_LEAD = /^((?:extra[ -]large|extra[ -]small|small|big|large|medium|mini|jumbo|xl|xxl)\s+)+/i;
function tileName(n){ const s=String(n||"").trim(); const m=s.match(SIZE_LEAD); if(!m || m[0].length>=s.length) return s;
  return s.slice(m[0].length).trim()+" "+m[0].trim().toLowerCase(); }
function planFilledPill(i, cat){ const checked=i.checked; const full=fillMode()==="full"&&!checked;
  const edge=checked?'var(--done-edge)':cat.color; const qcol = checked ? 'var(--muted2)' : metaCol(cat.color, true, full); const qtxt = (checked||full) ? qcol : readableOn(qcol, tileGroundHex(true));
  /* v1.61 item 2: this tile was missed by v1.60 — it is drawn by its own function and still wrote
     the Full colours inline, so the six pickers had no effect here either. */
  const style=full?fullStyle(cat.color,true):(fillMode()==="empty"?`border-left:1.5px solid var(--line)`:`border-left:4px solid ${catEdge(edge, true)}`);
  const em=itemIcon(i.name,i.cat);
  return `<button class="pill plan-in ${checked?'done':''}" data-plan-rm="${i.id}" style="${style}">${em?`<span class="pemoji" aria-hidden="true" style="color:${qcol}">${em}</span>`:""}${(i.qty||1)>1?`<span class="qty" style="color:${qtxt}">${i.qty}×</span>`:""}${i.weight?`<span class="qty" style="color:${qtxt}">${esc(showAmt(i.weight))} </span>`:""}${esc(cap(i.name))}${checked?' <span style="color:var(--muted2)">✓</span>':''}<span class="qmore ${quickEdit===i.id?'open':''}" data-qmore="${i.id}" aria-label="Quick edit"${full?' style="color:rgba(255,255,255,.92)"':''}>▾</span></button>`; }
/* A18/v1.08 — the quantity + weight editor for the selected plan item, shown as a banner
   fixed above the bottom nav (rather than inline in the list). */
function planQBannerHTML(){
  if(quickEdit==null) return "";
  const it=state.items.find(i=>i.id===quickEdit); if(!it) return "";
  const cat=CAT(it.cat); const cur=it.weight||"";
  const W=["","100g","200g","300g","400g","500g","600g","700g","800g","900g","1kg","2kg","3kg","4kg","5kg","10kg"];
  return `<div class="qbanner" id="qbanner" style="border-top:3px solid ${cat.color}">
    <div class="qbanner-top"><span class="qbanner-name">${(it.qty||1)>1?it.qty+'× ':''}${cur?esc(cur)+' ':''}${esc(cap(it.name))}</span><span style="display:flex;gap:8px;flex:none"><button class="qbanner-rm" id="qbannerRemove">${t("Remove")}</button><button class="qbanner-close" id="qbannerClose">${t("Done")}</button></span></div>
    <div class="qbanner-row">
      <div class="qstep2"><button data-qm-minus="${it.id}" aria-label="${t("Less")}">−</button><span>${it.qty||1}</span><button data-qm-plus="${it.id}" aria-label="${t("More")}">+</button></div>
      <div class="wrowq">${W.map(w=>`<button class="wchipq ${cur===w?'on':''}" data-qm-weight="${it.id}|${w}">${w?(w==="500g"||w==="1kg"?'★'+w:w):t('Unit')}</button>`).join("")}</div>
      <button class="qm-edit" data-qm-edit="${it.id}" aria-label="${t("Full edit")}">⋯</button>
    </div>
  </div>`;
}
function planOutlineChip(e, cat){ return `<button class="pill plan-out ba-restore" data-restore="${esc(e.name)}|${e.cat}" data-reg-note="${esc(e.note||"")}" style="background:transparent;border:1.5px dashed ${cat.color}">${(e.qty||1)>1?`<span class="qty" style="color:${cat.color}">${e.qty}×</span>`:""}${e.weight?`<span class="qty" style="color:${cat.color}">${esc(e.weight)} </span>`:""}${esc(cap(e.name))}<span class="qmore" style="visibility:hidden" aria-hidden="true">▾</span></button>`; }
/* v1.11 done-shopping dialog: one step to finish the trip and bank the bought items */
function finishSheet(){ const n=state.items.filter(i=>i.checked).length;
  return `<div class="sheet-bg" id="finishBg"><div class="sheet" id="finishSheetEl">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Done shopping?")}</div>
    <p style="margin:0 0 14px;font-size:13.5px;color:var(--muted);font-weight:600">${n===1?tf("{n} bought item in the cart. Save it to Regulars for one-tap re-adding next time?",{ n }):tf("{n} bought items in the cart. Save them to Regulars for one-tap re-adding next time?",{ n })}</p>
    <button class="optaction" id="finishRcpt">${CAMERA_SVG(16)} ${t("Read the receipt")}</button>
    <button class="optaction" id="finishSave" style="background:var(--btn);color:var(--btn-text);border-color:var(--btn)">${tf("Save {n} to Regulars &amp; finish",{ n })}</button>
    <button class="optaction" id="finishKeep">${t("Keep on list &amp; finish")}</button>
  </div></div>`; }
/* v1.11 location-triggered prompt: replaces the always-on "At the store?" banner. Shows only
   when GPS says you're at a saved store, dismissable for 2h. Reuses the existing geofence. */
function atStorePrompt(){
  if(!useLoc || shopMode) return "";
  ensureLocCheck();
  const id=locState.nearId; if(!id || !isRealStore(id)) return "";
  const st=storeById(id); if(!st) return "";
  try{ if(Date.now()-(+localStorage.getItem("ml_atstore_x")||0) < 2*3600000) return ""; }catch(e){}
  return `<div class="shopbar" style="margin-top:8px"><span>${PIN_SVG(14)} ${tf("At {x}?",{ x:esc(st.name) })}</span><span style="display:flex;gap:8px"><button id="atstoreGo">${t("Start shopping")}</button><button id="atstoreX" aria-label="${t("Not now")}" style="padding:7px 11px">✕</button></span></div>`;
}
/* ── v1.82 the Plan tab ─────────────────────────────────────────────────────────────
   A week of days, each holding what you mean to eat. It is per-list and it syncs, because
   a meal plan is a household thing in exactly the way the list is — one additive field on
   the state, read defensively so an older document is simply an empty plan.
   DAY_MS is already declared up in the restock-cadence code — one per file. */
/* v1.97: `saved` is carried explicitly. This function rebuilds state.plan from a fixed shape rather
   than merging, so a field it does not name is destroyed by the next write — saved plans would have
   disappeared the first time a meal was added. Any future field has to be added here too. */
function planData(){ const p = (state.plan && typeof state.plan==="object") ? state.plan : null;
  return { days:(p && p.days) || {}, recipes:(p && p.recipes) || [],
           saved:(p && Array.isArray(p.saved)) ? p.saved : [] }; }
function writePlan(next){ state.plan = { days:next.days||{}, recipes:next.recipes||[],
  saved:Array.isArray(next.saved)?next.saved:[] }; save(); }
function dayKey(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function weekStart(off){ const d=new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7) + off*7);   // weeks run Monday to Sunday
  return d; }
function weekLabel(off){
  if(off===0) return t("This week"); if(off===1) return t("Next week"); if(off===-1) return t("Last week");
  const s=weekStart(off), e=new Date(s.getTime()+6*DAY_MS);
  const f=x=>x.toLocaleDateString(dateLoc(),{day:"numeric",month:"short"});
  return f(s)+" – "+f(e); }
function planEntries(k){ return planData().days[k] || []; }
function planAddEntry(k, entry){ const P=planData();
  P.days = Object.assign({}, P.days); P.days[k] = (P.days[k]||[]).concat([entry]); writePlan(P); }
function planRemoveEntry(k, id){ const P=planData();
  P.days = Object.assign({}, P.days);
  P.days[k] = (P.days[k]||[]).filter(e=>e.id!==id);
  if(!P.days[k].length) delete P.days[k];
  writePlan(P); }
function planSaveRecipe(r){ const P=planData();
  P.recipes = P.recipes.filter(x=>x.id!==r.id).concat([r]); writePlan(P); }
/* v1.89: a recipe can be thrown away. Days that had it keep their entry — the chip falls back to the
   name stored on the entry, so a deleted recipe leaves the plan readable instead of blank. */
function planDeleteRecipe(id){
  const P=planData();
  P.recipes = P.recipes.filter(r=>r.id!==id);
  writePlan(P);
}
function recipeById(id){ return planData().recipes.find(r=>r.id===id) || null; }
/* v1.97: ids are minted from the clock, and applying a week writes seven entries in the same
   millisecond. Without a counter they would all share an id, and removing one chip would remove
   every meal in the week — planRemoveEntry filters by id. */
let _peSeq = 0;
function planEntryId(){ return "pe" + Date.now().toString(36) + (_peSeq++).toString(36); }
/* v1.97: a saved week is stored BY WEEKDAY (0 = Monday … 6 = Sunday) so it can be applied to any
   other week. Entries keep only what a plan needs and never the old id — applying mints fresh ones. */
function planWeekKeys(off){ const s=weekStart(off); const out=[];
  for(let i=0;i<7;i++) out.push(dayKey(new Date(s.getTime()+i*DAY_MS)));
  return out; }
function planWeekCount(off){ const P=planData();
  return planWeekKeys(off).reduce((n,k)=>n+((P.days[k]||[]).length),0); }
function planSavedStrip(e){ return { kind:e.kind||"food", name:e.name||"", emoji:e.emoji||"",
  cat:e.cat||"", rid:e.rid||"", slot:e.slot||"", serves:+e.serves||0 }; }   // v2.01: slot/serves survive a saved week
function planSaveWeek(off, name){
  const P=planData(), ks=planWeekKeys(off), days={};
  ks.forEach((k,i)=>{ const es=(P.days[k]||[]).map(planSavedStrip); if(es.length) days[String(i)]=es; });
  const pl={ id:"pl"+Date.now().toString(36), name:String(name||"").trim().slice(0,40), days };
  P.saved = P.saved.concat([pl]).slice(-20);
  writePlan(P);
}
function planDeleteSaved(id){ const P=planData(); P.saved=P.saved.filter(x=>x.id!==id); writePlan(P); }
function planClearWeek(off){ const P=planData(); P.days=Object.assign({},P.days);
  planWeekKeys(off).forEach(k=>{ delete P.days[k]; }); writePlan(P); }
/* Applying REPLACES the week rather than merging — merging silently doubles a plan applied twice. */
function planApplySaved(id, off){
  const P=planData(), pl=P.saved.find(x=>x.id===id); if(!pl) return;
  P.days=Object.assign({},P.days);
  const ks=planWeekKeys(off);
  ks.forEach((k,i)=>{ const es=(pl.days&&pl.days[String(i)])||[];
    if(es.length) P.days[k]=es.map(e=>Object.assign({id:planEntryId()}, planSavedStrip(e)));
    else delete P.days[k]; });
  writePlan(P);
}
/* v1.84: an ingredient carries its category now, so it can go onto the list as the real item rather
   than as loose text. Recipes written before this version hold plain strings — normalise on read. */
/* v1.94: an ingredient is a name, a category and an AMOUNT. It was the first two, so everything the
   recipe reader worked out about how much — "2 pounds", "500 g", 3 of them — was dropped at this
   line and the shopping list got bare names. Older shapes still normalise: a plain string and a
   {name,cat} both come back with no amount, which is exactly what they meant. */
/* v2.01: meal slots. */
const MEAL_SLOTS=[["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"],["snack","Snack"]];
const SLOT_LABEL={breakfast:"Breakfast",lunch:"Lunch",dinner:"Dinner",snack:"Snack"};
const SLOT_ORDER={breakfast:0,lunch:1,dinner:2,snack:3};
function slotPicker(attr, cur){
  return `<div class="slotseg" role="group" aria-label="${t("Meal")}">${MEAL_SLOTS.map(([k,l])=>`<button data-${attr}="${k}" class="${cur===k?'on':''}" aria-pressed="${cur===k?'true':'false'}">${t(l)}</button>`).join("")}</div>`;
}
/* v2.05: recipe courses. recipe.course is optional — readers go through recipeCourse(). */
const COURSES=[["drinks","Drinks"],["entree","Entrée"],["main","Main"],["dessert","Dessert"]];
/* v2.05: a course for recipes saved before there were courses, and the starting choice for a new one —
   read from the name, first match wins, "main" when nothing matches. Only a starting point: the form
   shows it selected and one tap changes it. */
function guessCourse(name){ const n=String(name||"").toLowerCase();
  if(/(^|[^\w-])(drinks?|smoothie|juice|cocktail|mocktail|spritz|lemonade|tea|coffee|latte|milkshake|shake|punch|sangria|margarita|mojito|soda)(?=$|[^\w-])/.test(n)) return "drinks";   // a whole word: "Tea-smoked duck" is not a drink
  if(/(cake|cheesecake|dessert|pudding|ice cream|tart\b|brownie|cookie|biscuit|mousse|crumble|pavlova|tiramisu|custard|sorbet|panna cotta|donut|doughnut|muffin|crepe|pancake)/.test(n)) return "dessert";
  if(/\b(salad|soup|starter|entree|entrée|dip|bruschetta|spring rolls?|dumplings?|gyoza|satay|tapas|antipasto|canap)/.test(n)) return "entree";
  return "main"; }
function recipeCourse(r){ return (r && COURSES.some(c=>c[0]===r.course)) ? r.course : guessCourse(r && r.name); }
function coursePicker(attr, cur){
  return `<div class="slotseg" role="group" aria-label="${t("Course")}">${COURSES.map(([k,l])=>`<button data-${attr}="${k}" class="${cur===k?'on':''}" aria-pressed="${cur===k?'true':'false'}">${t(l)}</button>`).join("")}</div>`;
}
/* v2.07: the recipe sheet lists ingredients as written ("recipe") or grouped by category ("cat"). A
   preference, not a look, so ml_ingsort is in BOTH APP_EXCLUDE_BOOT and APP_EXCLUDE. */
function ingSort(){ try{ return localStorage.getItem("ml_ingsort")==="cat" ? "cat" : "recipe"; }catch(e){ return "recipe"; } }
function setIngSort(v){ try{ localStorage.setItem("ml_ingsort", v==="cat"?"cat":"recipe"); }catch(e){} }
/* v2.07: an ingredient's category for display — its own, else what the app already knows about the
   name, else Others. The same fallback the review sheet uses when it sends a recipe to the list. */
function ingCatId(x){ const allowed=catList().map(c=>c.id), n=planIngNorm(x);
  if(allowed.includes(n.cat)) return n.cat;
  const k=knownEntry(n.name); return (k && allowed.includes(k.cat)) ? k.cat : "others"; }
function planUpdateEntry(k, id, patch){ const P=planData(); P.days=Object.assign({},P.days);
  P.days[k]=(P.days[k]||[]).map(x=>x.id===id?Object.assign({},x,patch):x); writePlan(P); }
function planIngNorm(x){
  if(typeof x==="string") return {name:x, cat:"", qty:1, weight:""};
  const q = Math.max(1, Math.min(99, parseInt((x&&x.qty)||1, 10)||1));
  return { name:(x&&x.name)||"", cat:(x&&x.cat)||"",
           qty:q, weight:String((x&&x.weight)||"").trim().slice(0,24) };
}
function planIngName(x){ return planIngNorm(x).name; }
function planIngCat(x){ const c=planIngNorm(x).cat; return c || null; }
function planIngAmt(x){ const n=planIngNorm(x); return n.weight || (n.qty>1 ? n.qty+"\u00d7" : ""); }
/* v1.94: "2 lb beef" is how a person writes an ingredient, so read the amount off the front of it
   rather than making them type the name and then hunt for a picker. A leading count with no unit is
   a count ("3 onions"); a leading number WITH a unit is a weight ("2 lb beef"). Anything it cannot
   read stays in the name, which is the safe direction — a wrong name is visible, a wrong amount is
   not. */
function planIngFromText(t){
  const s=String(t||"").trim(); if(!s) return null;
  const m=s.match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*([a-zA-Z]{1,12}\.?)?\s+(.+)$/);
  if(m){
    const num=m[1], unit=(m[2]||"").replace(/\.$/,""), rest=m[3].trim();
    if(unit && UNIT_TABLE[unit.toLowerCase()]) return { name:rest, cat:"", qty:1, weight:(num+" "+unit).trim() };
    if(!unit){ const n=parseInt(num,10);
      if(n>=1 && n<=99 && String(n)===num) return { name:rest, cat:"", qty:n, weight:"" }; }
  }
  return { name:s, cat:"", qty:1, weight:"" };
}
let planWeek = 0;        // which week the Plan tab is showing, 0 = this one
let planMenu = null;     // dayKey whose + menu is open
let planWeekOpen = false; // v1.97: the save/clear/apply sheet for the week on screen
let planAdd = null;      // { day, kind:"food"|"recipe", name, ing:[{name,cat}], rid, edit, q, cat, emoji,
                         //   imp:null|"link"|"paste", impVal, impBusy, impErr }  // v1.86 recipe import
let planPick = null;     // { day, id } — the chip whose actions are open
function renderPlanTab(){
  const P = planData(), s = weekStart(planWeek), todayK = dayKey(new Date());
  const hintK = planWeek===0 ? todayK : dayKey(s);   // v2.16 the empty-week hint plans today, or the shown week's Monday
  const days = [];
  for(let i=0;i<7;i++){
    const d = new Date(s.getTime()+i*DAY_MS), k = dayKey(d), es0 = P.days[k]||[];
    /* v2.01: with slots on, a day reads breakfast → snack, unslotted last; off, it is exactly as before. */
    const slotsOn = mealSlotsOn();
    const so = e => (e.slot in SLOT_ORDER) ? SLOT_ORDER[e.slot] : 4;
    const es = slotsOn ? es0.map((e,j)=>[e,j]).sort((a,b)=>(so(a[0])-so(b[0]))||(a[1]-b[1])).map(x=>x[0]) : es0;
    const chips = es.map(e=>{
      const r = e.kind==="recipe" ? recipeById(e.rid) : null;
      const nm = r ? r.name : e.name;                       // a renamed recipe renames every day it is on
      /* v1.84: names picked from the app's items arrive as the dictionary holds them ("milk"), so the
         chip title-cases exactly the way every other item label in the app does. */
      /* v2.04: a meal's OWN drawing when there is one; otherwise the emoji it was saved with. No
         category-mark fallback here — a recipe name ("Pad Thai") has no category, and CAT("") is Others. */
      const dk = (iconStyle()==="drawn" && itemEmojiOn()) ? drawKey(nm) : null;
      const em = dk ? illSVG(dk) : (e.emoji || (e.cat ? itemEmoji(nm, e.cat) : ""));
      return `<button class="pchip${e.kind==='recipe'?' recipe':''}" data-pchip="${esc(k)}|${esc(e.id)}">${(slotsOn && SLOT_LABEL[e.slot])?`<span class="pcslot">${t(SLOT_LABEL[e.slot])}</span>`:""}${em?`<span class="pcem" aria-hidden="true">${em}</span>`:""}<span class="pcname">${esc(cap(nm))}</span></button>`;
    }).join("");
    days.push(`<section class="planday${k===todayK?' today':''}">
      <div class="pdhead">
        <span class="pdwhen"><span class="pdname">${esc(d.toLocaleDateString(dateLoc(),{weekday:"short"}).replace(/\.$/,""))}</span><span class="pddate">${esc(d.toLocaleDateString(dateLoc(),{day:"numeric",month:"short"}))}</span></span>
        ${chips ? `<div class="pdchips">${chips}</div>` : `<span class="pdempty">${t("Nothing planned")}</span>`}
        <button class="pdmore" data-pd="${esc(k)}" aria-haspopup="dialog" aria-label="${tf("Add to {x}", { x:esc(d.toLocaleDateString(dateLoc(),{weekday:"long"})) })}">+</button>
      </div>
    </section>`);
  }
  app.innerHTML = `
    <div class="topfix" id="topfix">
      <header>
        <div style="display:flex;align-items:center;gap:8px" role="heading" aria-level="1"><button class="title disp listswitch" id="listSwitch" aria-haspopup="dialog" aria-expanded="${listsOpen?'true':'false'}">${esc(state.name || (getLists().find(l=>l.code===listCode)||{}).name || "Market List")}<span class="lschev" aria-hidden="true">${CHEV_BIG_SVG}</span></button></div>
        <div style="display:flex;align-items:center;gap:8px">${syncChip()}</div>
      </header>
    </div>
    <div class="wrap" role="main">
    <div class="zoomwrap"><div class="zoomer" id="zoomer">
      <div class="planweek">
        <button class="pwarrow" id="pwPrev" aria-label="${t("Previous week")}">‹</button>
        <button class="pwlbl" id="pwNow">${esc(weekLabel(planWeek))}</button>
        <button class="pwarrow" id="pwNext" aria-label="${t("Next week")}">›</button>
        <button class="pwarrow" id="pwMore" aria-haspopup="dialog" aria-label="${t("Save or clear this week")}">⋯</button>
      </div>
      ${planWeekCount(planWeek) ? "" : `<div class="planhint" role="note"><p>${t("Plan your dinners here, then add every ingredient to the shopping list in one tap.")}</p><button class="newlist" id="pwHint" data-pd="${esc(hintK)}">${planWeek===0 ? t("Plan today") : t("Plan Monday")}</button></div>`}
      ${days.join("")}
      ${planWeekCount(planWeek) ? `<button class="newlist" id="pwToList" style="margin-top:14px">${t("Add this week to the list")}</button>` : ""}
    </div></div>
  </div>
  ${bottomNav({planId:"planNavP",planActive:true,cartId:"cartNavP",cartActive:false,setId:"setNavP"})}${userTilesHTML()}
  ${planMenu?planMenuSheet():""}
  ${planWeekOpen?planWeekSheet():""}
  ${planAdd?planAddSheet():""}
  ${planPick?planPickSheet():""}
  ${smartOpen?smartSheet():""}${rcpt?rcptSheet():""}${tenSheet?tenSheetHTML():""}${cmpOpen?cmpSheetHTML():""}${occSheet?occSheetHTML():""}${spendOpen?spendSheetHTML():""}${amOpen?amSheetHTML():""}${shopMenuOpen?shopMenuHTML():""}${priceDiagOpen?priceDiagHTML():""}${cardEdit?cardEditHTML():""}${cardShow?cardShowHTML():""}${stuckOpen?stuckHTML():""}${locDiagOpen?locDiagHTML():""}${rpt?rptSheet():""}${rst?rstSheet():""}${siriOpen?siriSheetHTML():""}${dictOpen?dictSheetHTML():""}${noListOpen?noListSheetHTML():""}
  ${listsOpen?listsSheet():""}
  ${listActOpen?listActSheet():""}
  ${newListOpen?newListSheet():""}
  ${toast?`<div class="toast" id="toast"><span>${esc(t(toast))}</span>${toastAction?`<button id="undoBtn" class="undobtn">${esc(t(toastAction.label))}</button>`:""}</div>`:""}`;
}
function planMenuSheet(){
  const d = new Date(planMenu+"T00:00:00");
  return `<div class="sheet-bg" id="pmBg"><div class="sheet" id="pmSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${esc(d.toLocaleDateString(dateLoc(),{weekday:"long",day:"numeric",month:"long"}))}</div>
    <button class="optaction" id="pmRecipe">${t("Add recipe")}</button>
    <button class="optaction" id="pmFood">${t("Add food")}</button>
  </div></div>`;
}
/* v1.97: save this week as a reusable plan, clear it, or apply one already saved. The heading names
   the week being acted on — the sheet can be opened on any week, so "Clear this week" must never be
   ambiguous about which. */
function planWeekSheet(){
  const P=planData(), lbl=weekLabel(planWeek), n=planWeekCount(planWeek);
  const saved=P.saved||[];
  return `<div class="sheet-bg" id="pwBg"><div class="sheet" id="pwSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:4px">${esc(lbl)}</div>
    <p class="hint" style="text-align:left;margin:0 0 12px">${n?(n===1?t("1 meal planned."):tf("{n} meals planned.", { n })):t("Nothing planned yet — nothing to save.")}</p>
    <button class="optaction" id="pwSave"${n?"":" disabled"}>${SAVE_SVG(16)} ${t("Save this week")}</button>
    <button class="optaction" id="pwClear"${n?"":" disabled"} style="border-color:#C24A33;color:#C24A33">${BROOM_SVG(16)} ${t("Clear this week")}</button>
    ${saved.length?`<p class="palabel" style="margin-top:14px">${t("Saved plans")}</p>
      <div class="pills">${saved.map(pl=>`<span class="precwrap"><button class="sugchip" data-pwapply="${esc(pl.id)}">${pl.name?esc(pl.name):t("Plan")}</button><button class="precdel" data-pwdel="${esc(pl.id)}" aria-label="${tf("Delete {x}", { x:pl.name?esc(pl.name):t("Plan") })}">×</button></span>`).join("")}</div>`:""}
  </div></div>`;
}
/* v1.84: what you type is matched against the app's own items — the same addMatches() the add sheet
   and the category suggestions use, so a plan entry is a real item with a category and an icon rather
   than loose text. Nothing is shown until you type, which is the rule the add sheet already follows. */
function planDynHTML(){
  if(!planAdd) return "";
  const isR = planAdd.kind==="recipe";
  const q = String(isR ? (planAdd.q||"") : (planAdd.name||"")).trim().toLowerCase();
  const ms = q ? addMatches(q).slice(0,12) : [];
  const sug = ms.length ? `<div class="catsug">${ms.map(m=>{ const c=CAT(m.cat)||{color:"var(--line)"};
      const em=itemIcon(m.name,m.cat);
      return `<button class="catsugchip" data-psug="${esc(m.name)}|${esc(m.cat)}" style="border-color:${c.color}">${em?`<span class="pcem" aria-hidden="true" style="color:${c.color}">${em}</span> `:""}${esc(cap(m.name))}</button>`;
    }).join("")}</div>` : "";
  const chips = (isR && planAdd.ing.length)
    ? `<div class="pdchips" style="margin-top:10px">${planAdd.ing.map((x,i)=>{ const n=planIngNorm(x);
        const em=itemIcon(n.name,n.cat); const amt=showAmt(planIngAmt(x));
        return `<button class="pchip" data-pingrm="${i}">${em?`<span class="pcem" aria-hidden="true">${em}</span>`:""}${amt?`<span class="pcamt">${esc(amt)}</span>`:""}<span class="pcname">${esc(cap(n.name))}</span><span class="pcx" aria-hidden="true">×</span></button>`;
      }).join("")}</div>` : "";
  return sug + chips;
}
function refreshPlanDyn(){ const d=document.querySelector("#paDyn"); if(!d || !planAdd) return;
  d.innerHTML = planDynHTML(); wirePlanDyn(); }
/* Wired separately because #paDyn is rebuilt on its own as you type — a full render would take the
   focused field with it (v1.45). */
function wirePlanDyn(){
  document.querySelectorAll("[data-psug]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ if(!planAdd) return;
      const p=b.dataset.psug.split("|"); const cat=p.pop(); const nm=p.join("|");
      if(planAdd.kind==="recipe"){
        planAdd.ing.push({name:nm, cat}); planAdd.q="";
        const ii=document.querySelector("#paIngIn"); if(ii){ ii.value=""; ii.focus(); }
        refreshPlanDyn();
      } else {
        planAdd.name=nm; planAdd.cat=cat; planAdd.emoji=itemEmoji(nm,cat)||"";
        planCommitAdd();
      } }; });
  document.querySelectorAll("[data-pingrm]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ if(!planAdd) return;
      planAdd.ing.splice(parseInt(b.dataset.pingrm,10),1); refreshPlanDyn(); }; });
}
/* v1.86: a photo from a phone is several megabytes and the request body is capped well below that, so
   the picture is scaled down and re-encoded here before it is ever sent. It also makes the round trip
   quick enough to wait for. */
function planShrinkImage(file, maxPx, quality){
  return new Promise((resolve, reject)=>{
    const fr=new FileReader();
    fr.onerror=()=>reject(new Error("read"));
    fr.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("decode"));
      img.onload=()=>{ try{
        const s=Math.min(1, maxPx/Math.max(img.width, img.height));
        const w=Math.max(1, Math.round(img.width*s)), h=Math.max(1, Math.round(img.height*s));
        const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", quality));
      }catch(e){ reject(e); } };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
/* v2.09: receipt reading. rcpt is null when closed; otherwise
   { busy, err, store:{id,name}, detected, date, total, lines:[{raw,name,qty,weight,price,cat,keep,match}] }. */
let rcpt = null;
/* v2.13: Report a problem. The household asked for a way to send issues and complaints from inside the app.
   It goes to /api/feedback, which files it where the person who builds the app will see it (a GitHub issue
   when configured, otherwise the server log). App details — version, page, layout, screen — are attached
   only when the box is ticked, and never the list itself. Every wait is visible and ends: a spinner while
   sending, a 20s limit, and on failure a message plus a way to share the text instead. */
let rpt = null;   // { kind, text, diag, busy, err, sent }
let rst = null;   // v2.15 the restore confirmation sheet: { list, label }
const RPT_KINDS = { broken:"Something's broken", looks:"Looks wrong", idea:"An idea" };   // v2.32: "A complaint" removed (the household); the server still accepts it from older copies
const RPT_DAY_CAP = 10;
function rptToday(){ const d=dayKey(new Date()); try{ const v=String(localStorage.getItem("ml_rptday")||"").split("|"); return v[0]===d ? (+v[1]||0) : 0; }catch(e){ return 0; } }
function rptCount(){ const d=dayKey(new Date()); try{ localStorage.setItem("ml_rptday", d+"|"+(rptToday()+1)); }catch(e){} }
function rptDiag(){ let th=""; try{ th=document.documentElement.getAttribute("data-theme")||(document.body.classList.contains("dark")?"dark":"light"); }catch(e){}
  return { version:APP_VERSION, page:["plan","shop","settings"][curPageIdx()]||String(curPageIdx()), layout:dispBase()+" "+largeCols()+" cols",
    icons:itemEmojiOn()?(iconStyle()+" "+icoSize()):"off", theme:th, screen:innerWidth+"x"+innerHeight, ua:String(navigator.userAgent||"").slice(0,120) }; }
function rptSheet(){
  const head=`<div class="disp" style="font-weight:800;font-size:17px;margin-bottom:4px">${REPORT_SVG(18)} ${t("Report a problem")}</div>`;
  const wrap=b=>`<div class="sheet-bg kbpin" id="rptBg"><div class="sheet" id="rptSheet">${head}${b}</div></div>`;
  if(rpt.busy) return wrap(`<div class="rcbusy" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${t("Sending…")}</div>`);
  if(rpt.sent) return wrap(`<div role="status" style="padding:6px 2px 16px;color:var(--text);font-weight:600;line-height:1.5">${t("Thanks — it's been sent.")}</div><button class="optaction" id="rptOk">${t("OK")}</button>`);
  return wrap(`<div class="rcnote">${t("Tell us what went wrong, or what you'd change. It goes to the person who builds the app.")}</div>
    <div class="slotseg rptkinds">${Object.keys(RPT_KINDS).map(k=>`<button data-rptkind="${k}" class="${rpt.kind===k?'on':''}">${t(RPT_KINDS[k])}</button>`).join("")}</div>
    <textarea id="rptText" class="rpttext" maxlength="2000" rows="5" placeholder="${t("What happened? What did you expect?")}">${esc(rpt.text||"")}</textarea>
    <div class="rptdiag"><button class="smartcheck ${rpt.diag?"on":""}" id="rptDiag" role="checkbox" aria-checked="${rpt.diag?"true":"false"}" aria-label="${t("Include app details")}">✓</button>
      <span>${t("Include app details — version, screen and layout. Never your list.")}</span></div>
    ${rpt.err?`<div class="rpterr" role="alert">${esc(t(rpt.err))}${rpt.canShare?` <button class="linkbtn" id="rptShare">${t("Share it instead")}</button>`:""}</div>`:""}
    <div class="ppedbtns"><button class="optaction" id="rptCancel">${t("Cancel")}</button><button class="newlist" id="rptSend">${t("Send")}</button></div>`); }
function rptSend(){ const text=String(rpt.text||"").trim();
  if(!text){ rpt.err="Write a few words first."; rpt.canShare=false; render(); return; }
  if(rptToday()>=RPT_DAY_CAP){ rpt.err=tf("That's {n} reports today from this phone. Try again tomorrow.", { n:RPT_DAY_CAP }); rpt.canShare=true; render(); return; }
  const body={ kind:rpt.kind, text, diag: rpt.diag ? rptDiag() : {} };
  rpt.busy=true; rpt.err=""; render();
  const ctl=(typeof AbortController!=="undefined") ? new AbortController() : null;
  const timer=setTimeout(()=>{ if(ctl) ctl.abort(); }, 20000);
  apiFetch("/api/feedback", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
    .then(r=>r.json().catch(()=>({})).then(j=>({ ok:r.ok, j })))
    .then(({ok,j})=>{ if(!rpt) return; if(!ok || !j || j.ok!==true) throw new Error("not sent");
      rptCount(); rpt={ sent:true }; render(); })
    .catch(e=>{ if(!rpt) return; rpt.busy=false; rpt.canShare=true;
      rpt.err = (e && e.name==="AbortError") ? "That took too long. Check the connection and try again." : "Couldn't send it. Try again, or share it instead.";
      render(); })
    .finally(()=>clearTimeout(timer)); }
async function rptShare(){ const t=`Market List ${APP_VERSION} — ${RPT_KINDS[rpt.kind]||"Report"}\n\n${String(rpt.text||"").trim()}`;
  try{ if(hasShare()){ await share({ text:t }); return; } }catch(e){ if(e && e.name==="AbortError") return; }
  try{ await copyText(t); showToast("Copied — paste it into a message"); }catch(e){ showToast("Couldn't share on this device"); } }
function wireRptSheet(){ if(!rpt) return;
  const close=()=>{ rpt=null; render(); };
  const bg=app.querySelector("#rptBg"); if(bg) bg.onclick=e=>{ if(e.target===bg && !rpt.busy) close(); };
  ["#rptOk","#rptCancel"].forEach(id=>{ const b=app.querySelector(id); if(b) b.onclick=close; });
  app.querySelectorAll("[data-rptkind]").forEach(b=>b.onclick=()=>{ rpt.kind=b.dataset.rptkind; render(); });
  const ta=app.querySelector("#rptText"); if(ta) ta.oninput=()=>{ rpt.text=ta.value; };   // no re-render while typing
  const dg=app.querySelector("#rptDiag"); if(dg) dg.onclick=()=>{ rpt.diag=!rpt.diag; render(); };
  const sd=app.querySelector("#rptSend"); if(sd) sd.onclick=rptSend;
  const sh=app.querySelector("#rptShare"); if(sh) sh.onclick=rptShare; }
/* free, with a soft daily cap per device — the model call is the one real cost. A count, not a look,
   so ml_rcptday is in BOTH exclusion lists. */
const RCPT_DAY_CAP = 30;   // v2.29: was 10 — a household reading the week's receipts in one go hit it, and the prompt vanished without a word
function rcptToday(){ const d=dayKey(new Date()); try{ const v=String(localStorage.getItem("ml_rcptday")||"").split("|"); return v[0]===d ? (+v[1]||0) : 0; }catch(e){ return 0; } }
function rcptCount(){ const d=dayKey(new Date()); try{ localStorage.setItem("ml_rcptday", d+"|"+(rcptToday()+1)); }catch(e){} }
/* v2.11: the picker is ATTACHED to the page before it opens. iOS Safari does not reliably fire "change" on a
   file input that is not in the document, so the photo was chosen and then nothing happened at all — no
   sheet, no error (the household: "no indication that something is happening or failed"). */
function rcPick(){ pickFile({ accept:"image/*" }).then(file=>{ if(file) rcRead(file); }); }   /* v2.43 (architecture review A3): js/platform.js builds the attached input */
/* v2.09: the saved real stores, in one place — rcStoreFor, the sheet's chips and their wiring all agree. */
function rcSavedStores(){ return [...STORES.filter(s=>!storeOverride(s.id).hidden).map(s=>storeById(s.id)), ...(state.stores||[]).filter(s=>!storeOverride(s.id).hidden)].filter(s=>s && s.name); }
function rcStoreFor(detected){ const n=String(detected||"").toLowerCase().trim();
  const saved=rcSavedStores();
  if(n){ const hit=saved.find(s=>{ const sn=s.name.toLowerCase(); return sn===n || n.indexOf(sn)>=0 || sn.indexOf(n)>=0; }); if(hit) return { id:hit.id, name:hit.name }; }
  const act=activeStore(); if(!n && act && isRealStore(act.id)) return { id:act.id, name:act.name };
  return { id:"", name:String(detected||"").trim() }; }
function rcRead(file){
  if(rcptToday()>=RCPT_DAY_CAP){ rcpt={ err:tf("That's {n} receipts read on this phone today, the most in a day. Keep the receipt — it can be read tomorrow.", { n:RCPT_DAY_CAP }) }; render(); return; }
  /* v2.11: every wait is visible, and every wait ends — either in the review or in a message. The sheet
     opens the moment a photo is chosen and says which step it is on; the request is abandoned after 75s
     (the function itself stops at 60s), so a dead connection can never leave the sheet spinning. */
  rcpt={ busy:true, step:"Preparing the photo…" }; render();
  const ctl=(typeof AbortController!=="undefined") ? new AbortController() : null;
  const timer=setTimeout(()=>{ if(ctl) ctl.abort(); }, 75000);
  planShrinkImage(file, 2000, 0.8)
    .then(img=>{ if(rcpt && rcpt.busy){ rcpt.step="Reading the receipt…"; render(); }
      return apiFetch("/api/receipt", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ image:img }), signal: ctl ? ctl.signal : undefined }); })
    .then(r=>r.json().catch(()=>({})).then(j=>({ ok:r.ok, j })))
    .then(({ok,j})=>{ if(!rcpt) return;
      if(!ok){ const c=j && j.code;
        rcpt={ err: c==="signin" ? "This phone isn't signed in yet. Check your connection and try again."
          : c==="appcheck" ? "The app couldn't prove it's the real app. Close it completely and open it again."
          : c==="not_configured" ? "Receipt reading isn't set up on the server yet."
          : c==="quota" ? "The free reading allowance is used up for today. Try again tomorrow."
          : c==="busy" ? "The reader is busy. Try again in a minute."
          : (c==="bad_image" || c==="too_large") ? "Couldn't use that photo. Try a closer, flatter one."
          : c==="vision_model" ? "Photo reading isn't set up on this account."
          : "Couldn't read that receipt." }; render(); return; }
      rcptCount();
      const allowed=catList().map(c=>c.id), used=new Set();
      const lines=(Array.isArray(j.items)?j.items:[]).map(x=>{ const known=knownEntry(x.name);
        const cat=newCat(allowed.includes(x.category) ? x.category : ((known && known.cat) || "others"), x.name);
        const m=rcMatchItem(x.name, used); if(m) used.add(m.id);
        return { raw:String(x.raw||""), name:String(x.name||""), qty:+x.qty||1, weight:String(x.weight||""), note:String(x.note||"").slice(0,60), unit:+x.unit_price||0, per:String(x.per||""), price:+x.price||0, cat, keep:true, match:m?m.id:null }; });
      if(!lines.length){ rcpt={ err:"Couldn't find any items on that. Is it a receipt?" }; render(); return; }
      rcpt={ store:rcStoreFor(j.store), detected:String(j.store||""), date:(/^\d{4}-\d{2}-\d{2}$/.test(j.date||"") ? j.date : dayKey(new Date())), total:+j.total||0, lines, discounts:Array.isArray(j.discounts)?j.discounts:[], place:String(j.place||"").slice(0,40) };
      rcPair();   // v2.31: pair the lines with the cart, in tick order
      render(); })
    .catch(e=>{ if(rcpt){ rcpt={ err: navigator.onLine===false ? "No connection. Try again when you're online."
        : (e && e.name==="AbortError") ? "That took too long. Try again, or with a closer photo."
        : "Couldn't read that receipt." }; render(); } })
    .finally(()=>clearTimeout(timer)); }
/* v2.72: a line's unit price — per kilo / litre from its weight (the printed one preferred when it agrees), else the
   reader's printed one, else per item: price / qty. */
function rcUnit(L){ const pr=+L.price||0, w=priceAmt(L.weight), rp=String(L.per||""), ru=+L.unit||0;
  if(w){ if(ru>0 && rp===w.per) return { u:Math.round(ru*100)/100, per:rp }; return { u:Math.round(pr/w.amt*100)/100, per:w.per }; }
  if(ru>0 && (rp==="kg"||rp==="l"||rp==="each")) return { u:Math.round(ru*100)/100, per:rp };
  return { u:Math.round(pr/Math.max(1, +L.qty||1)*100)/100, per:"each" }; }
function rcUnitTxt(L){ const x=rcUnit(L); return x.per==="each" ? tf("{x} each", { x:priceMoney(x.u) }) : priceMoney(x.u)+(x.per==="kg"?"/kg":"/L"); }
function rcSave(){ if(!rcpt || !rcpt.lines) return;
  /* v2.72: a shop the receipt names that the list does not have joins the list's shops — unpinned (the receipt may be
     read at home), and without changing which shop is selected */
  if(rcpt.store && rcpt.store.id==="" && String(rcpt.store.name||"").trim()){ const nm=String(rcpt.store.name).trim();
    const hit=rcSavedStores().find(s=>s.name.toLowerCase()===nm.toLowerCase());
    if(hit) rcpt.store.id=hit.id;
    else { const ns={ id:"c"+uid().slice(0,6), name:nm, aisles:[] }; state.stores=[...(state.stores||[]), ns]; rcpt.store.id=ns.id; } }
  const used=new Set(); let n=0, m=0; const at=Date.now();   // v2.49 not "t": that name is the translation function
  for(const L of rcpt.lines){ const nm=String(L.name||"").trim(); if(!L.keep || !nm || !isFinite(L.price)) continue;
    const un=rcUnit(L), rec={ p:Math.round(L.price*100)/100, s:rcpt.store.id||"", sn:rcpt.store.name||"", l:rcpt.place||"", d:rcpt.date, q:L.qty||1, w:L.weight||"", t:at, u:un.u, per:un.per };
    const nk=noteKey(L.note); if(nk) rec.n=nk;
    priceRecord(nm, rec); n++;   // v2.32 l: the shop's suburb, from the receipt. v2.72: n++ was inside this comment, so the toast said 0
    /* the name may have been corrected in the sheet, so match again on what was saved */
    const it=rcMatchItem(nm, used); if(it){ used.add(it.id); it.checked=true; it.checkedBy=me; it.checkedAt=at; it.checkedStore=rcpt.store.id||""; markDirty(it.id); m++; } }
  /* v2.20: a receipt from a member chain that shows the member discount uses up that period's 10% */
  let tenMsg = ""; { const k = chainOfStore((rcpt.store && rcpt.store.name) || rcpt.detected), m = memb();
    if(k && m[k].on && discountSeen(rcpt.discounts, k)){ const p = membMark(m, k, true, new Date(rcpt.date + "T12:00:00")); state.memb = m; tenMsg = " · " + tf("{chain} {pct}% used for {m}", { chain:CHAINS[k].short, pct:m[k].pct, m:monthName(p) }); } }
  /* v2.24 R20: the receipt, for "What we spend" — under the same time its prices were saved with, so the rebuild from the
     price memory never counts it twice */
  { const se = spendEntry({ t:at, d:rcpt.date, s:(rcpt.store && rcpt.store.id) || "", sn:(rcpt.store && rcpt.store.name) || "", total:rcpt.total,
      lines:rcpt.lines.filter(L => L.keep && String(L.name || "").trim() && isFinite(L.price)).map(L => ({ price:+L.price, cat:L.cat })), discounts:rcpt.discounts });
    if(se.tot > 0) state.spend = spendLog(state.spend, se, SPEND_MAX); }
  sharedContribute(rcpt);   // v2.47: after the prices are saved
  rcptNudgeClear(); lastCartClear(); save(); rcpt=null; render(); showToast((n===1 ? tf("Saved 1 price", {}) : tf("Saved {n} prices", { n })) + (m ? " · " + tf("ticked off {n}", { n:m }) : "") + tenMsg); }
/* v2.20 the 10% shop (plan item 3). The logic is js/tenpct.js; this is the app's side: the household's memberships and
   "used" marks live in the list (state.memb, shared by every phone), the Shop card, the stock-up sheet, the receipt hook. */
var tenSheet = null;   // { chain, rows, pct, cap, base } while the stock-up sheet is open. var: render() reads it at boot
function memb(){ return membNorm(state.memb); }
function membSave(m){ state.memb = m; save(); render(); }
function membUsed(chain, d){ const c = memb()[chain], p = periodOf(d || new Date(), c.day); return c.used[p.key] ? p : null; }
function membMark(m, chain, on, d){ const c = m[chain], p = periodOf(d || new Date(), c.day);
  if(on) c.used[p.key] = Date.now(); else delete c.used[p.key];
  const ks = Object.keys(c.used).sort(); while(ks.length > 13) delete c.used[ks.shift()];   // a year of marks is plenty
  return p; }
/* the unit price from the price memory, preferring a record from that chain's stores */
function chainPriceOf(chain){ return name => { const a = priceLookup(name); if(!a || !a.length) return null;
  let r = null; for(let i = a.length - 1; i >= 0; i--){ if(chainOfStore(a[i].sn) === chain){ r = a[i]; break; } }
  if(!r) r = a[a.length - 1];
  const unit = (+r.p || 0) / Math.max(1, +r.q || 1); return unit > 0 ? { unit, sn:r.sn || "" } : null; }; }
function tenModel(chain){ const c = memb()[chain]; return Object.assign({ chain, pct:c.pct, cap:c.cap }, stockUp({ purch:state.purch || {}, priceOf:chainPriceOf(chain), pct:c.pct, cap:c.cap })); }
function tenOpen(chain){ const s = tenModel(chain); tenSheet = { chain, rows:s.rows, pct:s.pct, cap:s.cap, base:s.base }; render(); }
function tenHidden(chain, key){ try{ return (localStorage.getItem("ml_tenhide") || "") === chain + "|" + key; }catch(e){ return false; } }
function tenHide(chain, key){ try{ localStorage.setItem("ml_tenhide", chain + "|" + key); }catch(e){} render(); }
function monthName(p){ return p.start.toLocaleDateString(dateLoc(), { month:"long" }); }
/* The Shop card: a membership that is on, unused this period, not put away for it — in the last seven days of the
   period, or whenever you are at one of that chain's stores. */
function tenCardHTML(){ const m = memb(), st = activeStore(), here = st ? chainOfStore(st.name) : "";
  for(const k of Object.keys(CHAINS)){ const c = m[k]; if(!c.on) continue;
    const p = periodOf(new Date(), c.day); if(c.used[p.key] || tenHidden(k, p.key) || !(p.daysLeft <= 7 || here === k)) continue;
    const s = tenModel(k), sh = CHAINS[k].short;
    const head = here === k && p.daysLeft > 7 ? tf("You're at {x}: your {p}% is unused", { x:esc(sh), p:c.pct }) : (p.daysLeft === 1 ? tf("Your {x} {p}% is unused — {n} day left", { x:esc(sh), p:c.pct, n:p.daysLeft }) : tf("Your {x} {p}% is unused — {n} days left", { x:esc(sh), p:c.pct, n:p.daysLeft }));
    const body = s.total > 0 ? tf("Stock up on about {a} of things you rebuy and save about {b}.", { a:priceMoney(s.total), b:priceMoney(s.saving) }) : tf("Use it on a big shop before it runs out: up to {a} off.", { a:priceMoney(c.cap) });
    return `<div class="installcard tencard" id="tenCard" role="note" data-chain="${k}" data-period="${p.key}">
      <div class="ic-t">${esc(head)}</div><div class="ic-b">${body}</div>
      <div class="ic-btns">${s.rows.length ? `<button class="newlist" id="tenCardList">${t("See the list")}</button>` : ""}<button class="optaction" id="tenCardUsed">${t("Used it")}</button><button class="optaction" id="tenCardHide">${t("Not this month")}</button></div>
    </div>`; }
  return ""; }
function tenSheetHTML(){ const tn = tenSheet; if(!tn) return ""; const c = memb()[tn.chain], p = periodOf(new Date(), c.day), sum = stockTotal(tn.rows, tn.pct, tn.cap), n = tn.rows.filter(r => r.sel).length;
  const row = (r, i) => `<label class="tenrow${r.sel ? "" : " off"}"><input type="checkbox" data-ten-row="${i}" ${r.sel ? "checked" : ""} ${r.priced ? "" : "disabled"}>
    <span class="tr-n">${esc(cap(r.name))}<span class="tr-s">${r.qty}×${r.weight ? " " + esc(r.weight) : ""} · ${r.every === 1 ? tf("every {n} day", { n:r.every }) : tf("every {n} days", { n:r.every })}${r.ask ? " · " + t("keeps if frozen") : ""}</span></span>
    <span class="tr-p">${r.priced ? priceMoney(r.total) : t("no price yet")}</span></label>`;
  return `<div class="sheet-bg" id="tenBg"><div class="sheet" id="tenSheet" role="dialog" aria-labelledby="tenTitle">
    <div class="disp" id="tenTitle" style="font-weight:800;font-size:17px;margin-bottom:4px">${tf("{chain} {pct}% shop", { chain:esc(CHAINS[tn.chain].short), pct:tn.pct })} · ${esc(monthName(p))}</div>
    <div class="hint" style="text-align:left;margin:0 0 10px">${tf("What you rebuy, enough for a month, priced from your receipts. Ticked until the shop earns the whole discount ({x}).", { x:priceMoney(tn.base) })}</div>
    ${tn.rows.length ? `<div class="tenrows">${tn.rows.map(row).join("")}</div>` : `<div class="hint" style="text-align:left">${t("Nothing to suggest yet: this needs things you have bought at least twice, and their prices from a receipt.")}</div>`}
    <div class="tensum" role="status">${tf("{n} ticked", { n })} · ${priceMoney(sum.total)} · ${tf("saves {x}", { x:priceMoney(sum.saving) })}${sum.saving >= tn.cap ? " " + t("(the most it gives)") : ""}</div>
    <div class="ppedbtns" style="margin-top:10px"><button class="newlist" id="tenAdd" ${n ? "" : "disabled"}>${tf("Add {n} to the list", { n })}</button><button class="optaction" id="tenClose" style="margin-top:0">${t("Close")}</button></div>
  </div></div>`; }
function tenAddToList(){ const tn = tenSheet; if(!tn) return; let n = 0;
  for(const r of tn.rows){ if(!r.sel) continue; n++;
    const it = state.items.find(i => !i.checked && String(i.name || "").toLowerCase() === String(r.name).toLowerCase());
    if(it){ it.qty = Math.max(+it.qty || 1, r.qty); markDirty(it.id); }
    else state.items.push({ id:uid(), name:r.name, qty:r.qty, cat:newCat(r.cat, r.name), weight:r.weight || "", sub:"", checked:false, by:me }); }
  tenSheet = null; save(); render(); showToast(tf("Added {n} for the {chain} {pct}% shop", { n, chain:CHAINS[tn.chain].short, pct:tn.pct })); }
function wireTenSheet(){
  app.querySelectorAll("[data-ten-row]").forEach(b => b.onchange = () => { const r = tenSheet && tenSheet.rows[+b.dataset.tenRow]; if(r){ r.sel = b.checked; render(); } });
  const ta = app.querySelector("#tenAdd"); if(ta) ta.onclick = tenAddToList;
  const tc = app.querySelector("#tenClose"); if(tc) tc.onclick = () => { tenSheet = null; render(); };
  const tb = app.querySelector("#tenBg"); if(tb) tb.onclick = e => { if(e.target === tb){ tenSheet = null; render(); } };
  const cl = app.querySelector("#tenCardList"); if(cl) cl.onclick = () => tenOpen(app.querySelector("#tenCard").dataset.chain);
  const cu = app.querySelector("#tenCardUsed"); if(cu) cu.onclick = () => { const m = memb(), k = app.querySelector("#tenCard").dataset.chain; const p = membMark(m, k, true); membSave(m); showToast(tf("{chain} {pct}% marked as used for {m}", { chain:CHAINS[k].short, pct:m[k].pct, m:monthName(p) })); };
  const ch = app.querySelector("#tenCardHide"); if(ch) ch.onclick = () => { const c = app.querySelector("#tenCard"); tenHide(c.dataset.chain, c.dataset.period); };
}
/* v2.21 which store is cheaper for this list (plan item 6) — the logic is js/compare.js. The list is what is still to buy;
   prices are the household's own, from receipts, at most 60 days old. A store's chain with an unused 10% this month
   says what that would take off. */
var cmpOpen = false;   // the comparison sheet. var: render() reads it at boot
/* v2.47 shared shelf prices (opt-in, plan item 5) — the logic is js/shared.js. Households who turn it on pool their unit
   prices at the national chains; "Which store is cheaper" fills its gaps with the median of at least two households. */
function sharePxOn(){ try{ return localStorage.getItem("ml_sharepx")==="1"; }catch(e){ return false; } }
function shareEmailAcct(){ const u=_auth && _auth.currentUser; return !!(u && !u.isAnonymous); }
function sharedContribute(r){ if(!r || !r.lines || !sharePxOn() || !shareEmailAcct() || !db) return;
  const chain=shareChain((r.store && r.store.name) || ""); if(!chain) return;
  const uidN=_auth.currentUser.uid; let n=0;
  for(const L of r.lines){ if(n>=40) break; const nm=String(L.name||"").trim(); if(!L.keep || !nm || !isFinite(L.price)) continue;
    const key=sharedKey(chain, priceKey(nm)); if(!key) continue;
    const p=Math.round((Math.round(L.price*100)/100) / Math.max(1, +L.qty || 1) * 100) / 100; if(!(p>0)) continue; n++;
    try{ put(ref("shared", key), { by:{ [uidN]:{ p, d:Date.now() } } }, true).catch(()=>{}); }catch(e){} } }
var sharedCache = {};   // key → { med, t }. var: cmpModel can run at boot
var _sharedPending = 0, _sharedRenderT = null;
function sharedFetch(keys){ if(!db) return; const now=Date.now(); let started=0;
  for(const k of keys){ if(started>=60) break; const c=sharedCache[k]; if(c && now-c.t < 3600000) continue;
    sharedCache[k]={ med:(c && c.med) || null, t:now }; started++; _sharedPending++;
    let off=null, done=false;
    const finish=(med)=>{ if(done) return; done=true; try{ if(off) off(); }catch(e){} sharedCache[k]={ med, t:Date.now() };
      if(--_sharedPending<=0){ _sharedPending=0; clearTimeout(_sharedRenderT); _sharedRenderT=setTimeout(()=>render(), 50); } };
    try{ off=listen(ref("shared", k), s=>finish(s && s.exists && s.exists() ? sharedMedian((s.data()||{}).by, Date.now()) : null), ()=>finish(null)); }catch(e){ finish(null); }
    setTimeout(()=>finish(null), 15000); } }
function cmpModel(){ const items = state.items.filter(i => !i.checked);
  if(!sharePxOn()) return compareStores({ items, lookup:name => priceLookup(name) || [], maxAgeDays:60, minItems:3 });
  const stores = rcSavedStores(), chains = [...new Set(stores.map(s => shareChain(s.name)).filter(Boolean))], need = [];
  for(const i of items){ const pk = priceKey(i.name); for(const ch of chains){ const k = sharedKey(ch, pk); if(k) need.push(k); } }
  if(need.length) sharedFetch(need);
  return compareStores({ items, maxAgeDays:60, minItems:3, lookup:name => { const own = priceLookup(name) || [], pk = priceKey(name), meds = {};
    for(const ch of chains){ const c = sharedCache[sharedKey(ch, pk)]; if(c && c.med) meds[ch] = c.med; }
    return own.concat(sharedRecords(own, stores, meds)); } }); }
function cmpStoreLine(s, of){ const k = chainOfStore(s.name), m = k ? memb()[k] : null, p = m && m.on ? periodOf(new Date(), m.day) : null;
  const ten = (p && !m.used[p.key]) ? ` · ${tf("{pct}% off with your {chain} shop: about {x}", { pct:m.pct, chain:esc(CHAINS[k].short), x:priceMoney(Math.max(0, s.total - Math.min(m.cap, s.total * m.pct / 100))) })}` : "";
  const st = s.id ? storeById(s.id) : null, here = storeCoord(st), home = storeLocs.home;
  const km = (here && home) ? ` · ${tf("{x} km from home", { x:(distM(home, here) / 1000).toFixed(distM(home, here) < 10000 ? 1 : 0) })}` : "";
  return `<div class="cmprow"><span class="cmp-n">${esc(s.name)}<span class="cmp-s">${tf("{n} of {of} priced", { n:s.n, of })}${s.shared ? tf(" · {n} from other households", { n:s.shared }) : ""}${km}${ten}</span></span><span class="cmp-p">${priceMoney(s.total)}</span></div>`; }
function cmpSheetHTML(){ const c = cmpModel(), b = c.best;
  return `<div class="sheet-bg" id="cmpBg"><div class="sheet" id="cmpSheet" role="dialog" aria-labelledby="cmpTitle">
    <div class="disp" id="cmpTitle" style="font-weight:800;font-size:17px;margin-bottom:4px">${t("Which store is cheaper")}</div>
    <div class="hint" style="text-align:left;margin:0 0 10px">${c.of ? (c.of === 1 ? t("For the 1 thing still to buy, from what you paid in the last 60 days. Stores are compared only on what both have prices for.") : tf("For the {n} things still to buy, from what you paid in the last 60 days. Stores are compared only on what both have prices for.", { n:c.of })) : t("Nothing is on the list to buy yet — add things, and this compares the stores you have receipts from.")}</div>
    ${b ? `<div class="cmpbest">${tf("{a} is about {x} cheaper than {b} on the {n} things both have prices for ({lo} against {hi}).", { a:esc(b.cheaper), x:priceMoney(b.diff), b:esc(b.dearer), n:b.n, lo:priceMoney(b.lo), hi:priceMoney(b.hi) })}</div>` : `<div class="cmpbest">${t("Not enough prices yet to compare two stores on the same things — reading a receipt from each store fills this in.")}</div>`}
    ${c.stores.length ? `<div class="cmprows">${c.stores.map(s => cmpStoreLine(s, c.of)).join("")}</div>` : ""}
    <div style="display:flex;gap:8px;margin-top:12px"><button class="optaction" id="cmpClose" style="margin-top:0">${t("Close")}</button></div>
  </div></div>`; }
function cmpHidden(){ try{ return localStorage.getItem("ml_cmphide") === dayKey(new Date()); }catch(e){ return false; } }
/* The Shop card: before a shop (nothing in the cart yet), when one store is worth it on enough of the list, and not put
   away today. */
function cmpCardHTML(){ if(cmpHidden() || state.items.some(i => i.checked)) return "";
  const c = cmpModel(), b = c.best; if(!worthIt(b)) return "";
  return `<div class="installcard cmpcard" id="cmpCard" role="note">
    <div class="ic-t">${tf("Cheaper at {x}", { x:esc(b.cheaper) })}</div>
    <div class="ic-b">${tf("About {x} less than {b} for {n} of the {of} things on your list, from your receipts.", { x:priceMoney(b.diff), b:esc(b.dearer), n:b.n, of:c.of })}</div>
    <div class="ic-btns"><button class="newlist" id="cmpCardGo">${t("Compare")}</button><button class="optaction" id="cmpCardHide">${t("Not today")}</button></div>
  </div>`; }
function wireCmp(){
  const g = app.querySelector("#cmpCardGo"); if(g) g.onclick = () => { cmpOpen = true; render(); };
  const h = app.querySelector("#cmpCardHide"); if(h) h.onclick = () => { try{ localStorage.setItem("ml_cmphide", dayKey(new Date())); }catch(e){} render(); };
  const o = app.querySelector("#optCompare"); if(o) o.onclick = () => { cmpOpen = true; render(); };
  const c = app.querySelector("#cmpClose"); if(c) c.onclick = () => { cmpOpen = false; render(); };
  const bg = app.querySelector("#cmpBg"); if(bg) bg.onclick = e => { if(e.target === bg){ cmpOpen = false; render(); } };
}
/* v2.24 What we spend (R20) — the logic is js/spend.js. The log lives in the list (state.spend), shared only with the
   people on it, like the prices it comes from. */
var spendOpen = false, spendM = "";   // the sheet, and the month it shows ("" = the latest). var: render() reads them at boot
function spendAll(){ const log = Array.isArray(state.spend) ? state.spend : [];
  return log.concat(spendFromPrices(state.prices, log, k => (knownEntry(k) || {}).cat || guessCat(k) || "others")); }
function spendMonthName(m, year){ const [y, mo] = String(m).split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(dateLoc(), year ? { month:"long", year:"numeric" } : { month:"long" }); }
function spendSheetHTML(){ const all = spendAll(), months = spendMonths(all).slice(0, 12);
  const m = (spendM && months.includes(spendM)) ? spendM : (months[0] || monthKey(dayKey(new Date())));
  const s = spendMonth(all, m), p = spendMonth(all, prevMonth(m)), about = s.est ? t("about") + " " : "";
  const bar = (v, max, col) => `<span class="sp-bar" aria-hidden="true"><span style="width:${max > 0 ? Math.max(3, Math.round(v / max * 100)) : 0}%${col ? `;background:${col}` : ""}"></span></span>`;
  const vs = (s.n && p.n) ? ` · ${tf(s.tot >= p.tot ? "{x} more than {m}" : "{x} less than {m}", { x:priceMoney(Math.abs(s.tot - p.tot)), m:spendMonthName(p.month) })}` : "";
  /* categories as shown: one whose category is gone counts under Others (catShown), merged */
  const cm = {}; for(const x of s.cats){ const id = catShown(x.cat); cm[id] = (cm[id] || 0) + x.tot; }
  const cats = Object.entries(cm).map(([id, tot]) => ({ id, tot:Math.round(tot * 100) / 100 })).sort((a, b) => b.tot - a.tot);
  const body = s.n ? `
    <div class="sptot" role="status"><b>${about}${priceMoney(s.tot)}</b> ${tf("in {m}", { m:esc(spendMonthName(m, true)) })} · ${s.n === 1 ? t("1 receipt") : tf("{n} receipts", { n:s.n })}${vs}</div>
    <div class="elsehd">${t("By store")}</div>
    <div class="sprows">${s.stores.map(x => `<div class="sprow"><span class="sp-n">${esc(x.sn)}<span class="sp-s">${x.n === 1 ? t("1 receipt") : tf("{n} receipts", { n:x.n })}</span></span>${bar(x.tot, s.stores[0].tot)}<span class="sp-p">${priceMoney(x.tot)}</span></div>`).join("")}</div>
    ${cats.length ? `<div class="elsehd">${t("By category")}</div>
    <div class="sprows">${cats.map(x => { const c = CAT(x.id); return `<div class="sprow" data-spcat="${esc(x.id)}"><span class="sp-n"><span class="sp-c">${catIcon(c, 16)}<span>${esc(catLabel(c))}</span></span></span>${bar(x.tot, cats[0].tot, autoShade("cat", c.color))}<span class="sp-p">${priceMoney(x.tot)}</span></div>`; }).join("")}</div>` : ""}
    <div class="hint" style="text-align:left;margin:10px 0 0">${t("What was paid is each receipt's total; the categories add up its lines.")}${s.est ? " " + t("Receipts read before v2.24 are estimated from the price memory.") : ""}</div>`
    : `<div class="hint" style="text-align:left">${months.length ? t("No receipts this month.") : t("Nothing yet. Read a receipt after a shop and what you spend adds up here — by month, by store and by category.")}</div>`;
  return `<div class="sheet-bg" id="spendBg"><div class="sheet" id="spendSheet" role="dialog" aria-labelledby="spendTitle">
    <div class="disp" id="spendTitle" style="font-weight:800;font-size:17px;margin-bottom:8px">${t("What we spend")}</div>
    ${months.length > 1 ? `<div class="spmonths">${months.map(x => `<button class="storechip ${x === m ? "on" : ""}" data-spend-m="${x}" aria-pressed="${x === m}">${esc(spendMonthName(x))}</button>`).join("")}</div>` : ""}
    ${body}
    <div style="display:flex;gap:8px;margin-top:12px"><button class="optaction" id="spendClose" style="margin-top:0">${t("Close")}</button></div>
  </div></div>`; }
function wireSpend(){
  const o = app.querySelector("#optSpend"); if(o) o.onclick = () => { spendOpen = true; spendM = ""; render(); };
  app.querySelectorAll("[data-spend-m]").forEach(b => b.onclick = () => { spendM = b.dataset.spendM; render(); });
  const c = app.querySelector("#spendClose"); if(c) c.onclick = () => { spendOpen = false; render(); };
  const bg = app.querySelector("#spendBg"); if(bg) bg.onclick = e => { if(e.target === bg){ spendOpen = false; render(); } };
}
/* v2.26 your look on your other phones (plan item 7). Explicit, not automatic, so two phones never fight over it: "Send
   this look to my other phones" keeps it in the list under your name (state.looks), and a phone where you are that name
   offers it once on the Shop page. Only the look travels — what an appearance slot holds, never data — and no value over
   2,000 characters, at most 30,000 in all, so the list stays small. ml_lookseen: the newest look this phone has sent,
   used or declined. */
function lookKeys(){ const o = appearanceSnapshot(), out = {}; let n = 0;
  for(const k of Object.keys(o).sort()){ const v = String(o[k]); if(v.length > 2000 || n + v.length > 30000) continue; out[k] = v; n += v.length; }
  return out; }
function lookSeen(){ try{ return +localStorage.getItem("ml_lookseen") || 0; }catch(e){ return 0; } }
function lookSeenSet(at){ try{ localStorage.setItem("ml_lookseen", String(at)); }catch(e){} }
function lookSend(){ if(!me) return; const at = Date.now();
  state.looks = Object.assign({}, state.looks, { [me]:{ at, keys:lookKeys() } }); lookSeenSet(at);
  save(); render(); showToast(t("Sent — your other phones will offer it")); }
function lookOffer(){ const L = me && state.looks && state.looks[me]; if(!L || !L.keys || typeof L.keys !== "object") return null;
  if((+L.at || 0) <= lookSeen()) return null;
  const cur = lookKeys(), a = Object.keys(L.keys), b = Object.keys(cur);
  if(a.length === b.length && a.every(k => cur[k] === L.keys[k])) return null;   // this phone already looks like that
  return L; }
function lookCardHTML(){ const L = lookOffer(); if(!L) return "";
  const when = new Date(+L.at).toLocaleDateString(dateLoc(), { day:"numeric", month:"short" });
  return `<div class="installcard lookcard" id="lookCard" role="note">
    <div class="ic-t">${t("Your look from another phone")}</div>
    <div class="ic-b">${tf("You sent it on {x}: colours, tiles, icons and bars. Use it here too?", { x:esc(when) })}</div>
    <div class="ic-btns"><button class="newlist" id="lookUse">${t("Use it")}</button><button class="optaction" id="lookNo">${t("Not now")}</button></div>
  </div>`; }
function wireLook(){
  const s = app.querySelector("#optLookSend"); if(s) s.onclick = lookSend;
  const u = app.querySelector("#lookUse"); if(u) u.onclick = () => { const L = lookOffer(); if(!L) return; lookSeenSet(L.at); applyStoredAppearance(L.keys); };   // reloads
  const pu = app.querySelector("#prefsUse"); if(pu) pu.onclick = () => { const P = _prefsOffer; if(!P) return; prefsSeenSet(P.at); _prefsOffer = null; prefsApply(P.keys); };   // v2.71, reloads
  const pn = app.querySelector("#prefsNo"); if(pn) pn.onclick = () => { const P = _prefsOffer; prefsSeenSet((P && P.at) || Date.now()); _prefsOffer = null; render(); };
  const n = app.querySelector("#lookNo"); if(n) n.onclick = () => { const L = me && state.looks && state.looks[me]; lookSeenSet((L && +L.at) || Date.now()); render(); };
}
/* v2.27 the aisle map editor: one line per aisle, in walking order, as the sign says it. Kept in the list for everyone. */
var amOpen = "";   // the store whose map is open. var: render() reads it at boot
var amDraft = null;   // v2.28: the box's text while the sheet is open (null = the saved map's); kept across re-renders
function amLines(id){ const m = (state.aislemap || {})[id]; return (m && Array.isArray(m.aisles)) ? m.aisles.map(a => (a.n ? a.n + " " : "") + a.t).join("\n") : ""; }
function amSheetHTML(){ const st = storeById(amOpen) || {}, has = !!((state.aislemap || {})[amOpen]);
  return `<div class="sheet-bg" id="amBg"><div class="sheet" id="amSheet" role="dialog" aria-labelledby="amTitle">
    <div class="disp" id="amTitle" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Aisle map")} · ${esc(st.name || t("this shop"))}</div>
    <div class="hint" style="text-align:left;margin:0 0 10px">${t("One line per aisle, in the order you walk the shop — the number and what the sign says: “5 Pasta, rice &amp; sauces”. The list then follows the shop; Location and AI sort start from it.")}</div>
    <textarea id="amText" class="amtext" rows="10" spellcheck="false" aria-label="${t("Aisles, one per line")}" placeholder="${t("1 Fruit &amp; veg&#10;2 Bread, spreads &amp; cereal&#10;3 Pasta, rice &amp; sauces")}">${esc(amDraft!==null ? amDraft : amLines(amOpen))}</textarea>
    <div class="amread" role="status">${amRead ? (amRead.busy ? `<span class="spin" aria-hidden="true"></span> ${esc(amRead.step)}` : esc(t(amRead.err || amRead.ok || ""))) : ""}</div>
    <button class="optaction" id="amCam" style="margin-top:8px" ${amRead && amRead.busy ? "disabled" : ""}>${CAMERA_SVG(16)} ${t("Read a sign")}</button>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="newlist" id="amSave" style="margin:0">${t("Save")}</button>${has ? `<button class="optaction" id="amClear" style="margin-top:0">${t("Clear")}</button>` : ""}<button class="optaction" id="amClose" style="margin-top:0">${t("Cancel")}</button></div>
  </div></div>`; }
function amSave(text){ const id = amOpen; if(!id) return;
  const aisles = String(text || "").split(/\n+/).map(parseAisleLine).filter(Boolean).slice(0, 60);
  const m = Object.assign({}, state.aislemap || {});
  if(aisles.length) m[id] = { at:Date.now(), by:me || "", aisles }; else delete m[id];
  state.aislemap = m; amOpen = ""; amDraft = null; amRead = null; save(); render();
  if(!aisles.length){ showToast(t("Aisle map cleared")); return; }
  const mapped = mapAisles(aisles), todo = state.items.filter(i => !i.checked), placed = todo.filter(i => mapRank(mapped, i.name, i.cat) >= 0).length;
  showToast((aisles.length === 1 ? t("Saved 1 aisle") : tf("Saved {n} aisles", { n:aisles.length })) + (todo.length ? " · " + tf("places {n} of {of} on the list", { n:placed, of:todo.length }) : "")); }
function wireAisleMap(){
  const o = app.querySelector("#optAisleMap"); if(o) o.onclick = () => { amOpen = storeSel; amDraft = null; amRead = null; render(); const t = app.querySelector("#amText"); if(t) t.focus(); };
  const s = app.querySelector("#amSave"); if(s) s.onclick = () => amSave((app.querySelector("#amText") || {}).value);
  const c = app.querySelector("#amClear"); if(c) c.onclick = () => { if(confirm(t("Clear this shop's aisle map?"))) amSave(""); };
  const x = app.querySelector("#amClose"); if(x) x.onclick = () => { amOpen = ""; amDraft = null; amRead = null; render(); };
  const bg = app.querySelector("#amBg"); if(bg) bg.onclick = e => { if(e.target === bg){ amOpen = ""; amDraft = null; amRead = null; render(); } };
  const cam = app.querySelector("#amCam"); if(cam) cam.onclick = () => { amKeepText(); amRead = null; amPick(); };
  const tx = app.querySelector("#amText"); if(tx) tx.oninput = () => { amDraft = tx.value; };
}
/* v2.30 the Shop page's menu (item 17): what you reach for in the shop — read the receipt, which store is cheaper, what we
   spend, this shop's aisle map, send the list, add an occasion — and Report a problem, which the button used to be. */
var shopMenuOpen = false;   // var: render() reads it at boot
var smStoreAdding = false;   // v2.72: the menu's "＋ New shop" row is showing. var: render() reads it at boot
function shopMenuHTML(){ const st = activeStore(), real = !!(st && st.id && isRealStore(st.id));
  const item = (id, icon, label) => `<button class="smitem" id="${id}" role="menuitem">${icon}<span>${label}</span></button>`;
  return `<div class="smbg" id="smBg"><div class="smenu" id="shopMenuEl" role="menu" aria-label="${t("More")}">
    ${/* v2.72: choose the shop here, as Settings › Shopping › Store does — the menu stays open */""}<div class="smtiles smtext"><span class="smtlabel">${t("Store")}</span><div class="smcols smstores">${[{id:"auto",name:t("Auto-detect")},{id:"home",name:t("Home")},...STORES.filter(s=>!storeOverride(s.id).hidden).map(s=>storeById(s.id)),...(state.stores||[]).filter(s=>!storeOverride(s.id).hidden),{id:"other",name:t("Other")}].filter(Boolean).map(s=>`<button class="colbtn ${storeSel===s.id?'on':''}" data-sm-store="${esc(s.id)}">${esc(s.name)}</button>`).join("")}<button class="colbtn smadd" data-sm-storeadd>${t("＋ New shop")}</button></div>${smStoreAdding?`<div class="smaddrow"><input id="smStoreName" placeholder="${t("Shop name")}" aria-label="${t("Shop name")}" autocomplete="off" /><button class="colbtn" id="smStoreAddGo" style="width:auto;padding:0 12px">${t("Add")}</button></div>`:""}</div>
    <div class="smtiles"><span class="smtlabel">${t("Tiles")}</span><div class="smcols">${[1,2,3,4,5,6].map(n=>`<button class="colbtn ${largeCols()===n?'on':''}" data-sm-cols="${n}">${n}</button>`).join("")}<button class="colbtn ${largeCols()===0?'on':''}" data-sm-cols="0" aria-label="${t("Variable width — tiles size to the word")}">↔</button></div></div>
    ${/* v2.63 item C: Text size, as in Settings — the menu stays open */""}<div class="smtiles smzoom"><span class="smtlabel">${t("Text size")}</span><div class="smcols"><button class="colbtn" data-sm-zoom="-1" aria-label="${t("Smaller text")}">−</button><span class="smzpct">${Math.round(dens()*100)}%</span><button class="colbtn" data-sm-zoom="1" aria-label="${t("Larger text")}">+</button></div></div>
    ${/* v2.68 (the household): Theme, Group by category and Sort, as in Settings — the menu stays open */""}<div class="smtiles smtext"><span class="smtlabel">${t("Theme")}</span><div class="smcols"><button class="colbtn ${theme==='light'?'on':''}" data-sm-theme="light">${t("Light")}</button><button class="colbtn ${theme==='dark'?'on':''}" data-sm-theme="dark">${t("Dark")}</button></div></div>
    <div class="smtiles smtext"><span class="smtlabel">${t("Group by category")}</span><div class="smcols"><button class="colbtn ${catOn?'on':''}" data-sm-caton="1">${t("On")}</button><button class="colbtn ${!catOn?'on':''}" data-sm-caton="0">${t("Off")}</button></div></div>
    ${(()=>{ const cs=(displayFor()==="cat" && (sortModeFor()==="location"||sortModeFor()==="ai")) ? "cat" : sortModeFor();   // as Settings reads it
      const sb=(v,l)=>`<button class="colbtn ${cs===v?'on':''}" data-sm-sort="${v}">${l}</button>`;
      return `<div class="smtiles smtext"><span class="smtlabel">${t("Sort")}</span><div class="smcols">${(displayFor()==="flat" && shopMode && aiSortOK())?sb("ai",t("✨ AI")):""}${displayFor()==="flat"?sb("location",t("Location")):""}${sb("cat",t("Category"))}${sb("alpha",t("A–Z"))}</div></div>`; })()}
    <div class="smsep"></div>
    ${item("smCard", CARD_SVG(18), cardsGet().length ? t("Show my card") : t("Add a membership card"))}
    ${item("smRcpt", CAMERA_SVG(18), t("Read a receipt"))}
    ${item("smCompare", CART_SVG, t("Which store is cheaper"))}
    ${item("smSpend", FLAG_TAG_SVG, t("What we spend"))}
    ${real ? item("smAisle", PIN_SVG(18), tf("Aisle map for {x}", { x:esc(st.name) })) : ""}
    ${item("smSend", SHARE_SVG(18), t("Send what's to buy"))}
    ${item("smOcc", SAVE_SVG(18), t("Occasions — BBQ, camping…"))}
    <div class="smsep"></div>
    ${item("smReport", REPORT_SVG(18), t("Report a problem"))}
  </div></div>`; }
/* v2.30 price diagnostics (item 12): every price the receipts have left in the memory, item by item — store, date,
   amount and quantity — newest first, so a wrong read can be found. Read-only. */
var priceDiagOpen = false, priceDiagQ = "";   // var: render() reads them at boot
function priceDiagHTML(){ const P = state.prices || {}, q = priceDiagQ.trim().toLowerCase();
  const keys = Object.keys(P).filter(k => !q || k.includes(q)).sort((a, b) => priceLastT(P[b]) - priceLastT(P[a]));
  const total = Object.keys(P).length, recs = Object.values(P).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
  const rows = keys.slice(0, 300).map(k => { const a = (P[k] || []).slice().sort((x, y) => (y.t || 0) - (x.t || 0));
    return `<details class="pdrow"><summary><span class="pd-n">${esc(cap(k))}</span><span class="pd-s">${a[0] ? `${priceMoney(a[0].p)} · ${esc(a[0].sn || "—")}` : ""} · ${a.length}</span></summary>
      ${a.map(r => `<div class="pdrec"><span>${esc(r.d || "")}</span><span>${esc(r.sn || "—")}${r.l ? `<small class="pd-l">${esc(r.l)}</small>` : ""}</span><span>${r.q > 1 ? r.q + "× " : ""}${esc(r.w || "")}</span><b>${priceMoney(r.p)}</b>${r.n ? `<small class="pd-note">${esc(r.n)}</small>` : ""}${(r.per && +r.u > 0) ? `<small class="pd-u">${r.per === "each" ? tf("{x} each", { x:priceMoney(r.u) }) : priceMoney(r.u) + (r.per === "kg" ? "/kg" : "/L")}</small>` : ""}</div>`).join("")}</details>`; }).join("");
  return `<div class="sheet-bg kbpin" id="pdBg"><div class="sheet" id="pdSheet" role="dialog" aria-labelledby="pdTitle">
    <div class="disp" id="pdTitle" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Price diagnostics")}</div>
    <div class="hint" style="text-align:left;margin:0 0 10px">${tf("{n} items, {p} prices from receipts, newest first. The memory keeps the last {k} prices of each item, and {max} items.", { n:total, p:recs, k:PRICE_PER_ITEM, max:PRICE_ITEMS })}</div>
    <input id="pdQ" value="${esc(priceDiagQ)}" placeholder="${t("Find an item")}" aria-label="${t("Find an item")}" autocomplete="off" style="width:100%;box-sizing:border-box;height:42px;padding:0 12px;border-radius:12px;border:none;outline:none;background:var(--chip);color:var(--text);font-size:16px" />
    <div class="pdlist">${rows || `<div class="hint" style="text-align:left;margin-top:10px">${total ? t("Nothing matches.") : t("No prices yet. Read a receipt after a shop and they appear here.")}</div>`}</div>
    ${keys.length > 300 ? `<div class="hint" style="text-align:left">${tf("Showing 300 of {n}.", { n:keys.length })}</div>` : ""}
    <div style="display:flex;gap:8px;margin-top:12px"><button class="optaction" id="pdClose" style="margin-top:0">${t("Close")}</button></div>
  </div></div>`; }
function wirePriceDiag(){
  const o = app.querySelector("#optPriceDiag"); if(o) o.onclick = () => { priceDiagOpen = true; priceDiagQ = ""; render(); };
  const q = app.querySelector("#pdQ"); if(q) q.oninput = () => { priceDiagQ = q.value;
    /* filter in place — a render would drop the keyboard (the v2.18 rule for Settings' own search) */
    const t = q.value.trim().toLowerCase(); app.querySelectorAll(".pdrow").forEach(r => { const n = (r.querySelector(".pd-n") || {}).textContent || ""; r.style.display = (!t || n.toLowerCase().includes(t)) ? "" : "none"; }); };
  const c = app.querySelector("#pdClose"); if(c) c.onclick = () => { priceDiagOpen = false; render(); };
  const bg = app.querySelector("#pdBg"); if(bg) bg.onclick = e => { if(e.target === bg){ priceDiagOpen = false; render(); } };
}
function wireShopMenu(){
  const b = app.querySelector("#shopMenu"); if(b) b.onclick = () => { shopMenuOpen = !shopMenuOpen; render(); };
  const close = () => { shopMenuOpen = false; };
  const bg = app.querySelector("#smBg"); if(bg) bg.onclick = e => { if(e.target === bg){ close(); render(); } };
  const on = (id, fn) => { const e = app.querySelector("#" + id); if(e) e.onclick = () => { close(); fn(); }; };
  on("smRcpt", () => { render(); rcPick(); });
  on("smCompare", () => { cmpOpen = true; render(); });
  on("smSpend", () => { spendOpen = true; spendM = ""; render(); });
  on("smAisle", () => { const st = activeStore(); amOpen = st ? st.id : ""; amDraft = null; amRead = null; render(); });
  on("smSend", () => { render(); shareListText(); });
  on("smOcc", () => { occSheet = { mode:"add" }; render(); });
  on("smCard", () => { const c = cardHere().c || cardsGet()[0]; cardShow = c ? { id:c.id } : { add:true }; render(); });   // v2.35: the shop you are at, else the first; none yet → straight to adding one
  on("smReport", () => { rpt = { kind:"broken", text:"", diag:true }; render(); });
  app.querySelectorAll("[data-sm-cols]").forEach(c => c.onclick = () => setLargeCols(+c.dataset.smCols));   // v2.58: the menu stays open, re-drawn with the new choice
  app.querySelectorAll("[data-sm-zoom]").forEach(c => c.onclick = () => setDensity(dens() + 0.1 * (+c.dataset.smZoom)));   // v2.63: as #optZoomMinus/#optZoomPlus; setDensity re-renders, the menu stays open
  /* v2.68: each re-renders with the menu still open (shopMenuOpen is left true) */
  app.querySelectorAll("[data-sm-theme]").forEach(c => c.onclick = () => { if(theme !== c.dataset.smTheme) setTheme(c.dataset.smTheme); });
  app.querySelectorAll("[data-sm-caton]").forEach(c => c.onclick = () => setCatOn(c.dataset.smCaton === "1"));
  app.querySelectorAll("[data-sm-sort]").forEach(c => c.onclick = () => setSort(c.dataset.smSort));
  /* v2.72: the shop, exactly as Settings' data-opt-store; render() leaves shopMenuOpen true */
  const smPick = v => { if(storeSel !== v){ storeSel = v; localStorage.setItem("ml_store", v); locState = {checked:false,busy:false,ts:0,err:0,nearId:null,dist:Infinity}; if(v === "auto") ensureLocCheck(); } render(); };
  app.querySelectorAll("[data-sm-store]").forEach(c => c.onclick = () => smPick(c.dataset.smStore));
  { const box = app.querySelector(".smstores"), on = box && box.querySelector(".on"); if(on) box.scrollTop = Math.max(0, on.offsetTop - box.offsetTop - 4); }   // the chosen shop is in view
  app.querySelectorAll("[data-sm-storeadd]").forEach(c => c.onclick = () => { smStoreAdding = !smStoreAdding; render(); const f = app.querySelector("#smStoreName"); if(f) f.focus(); });
  const sn = app.querySelector("#smStoreName"), sg = app.querySelector("#smStoreAddGo");
  const smAdd = () => { const name = String((sn && sn.value) || "").trim(); if(!name) return;
    const ns = { id:"c"+uid().slice(0,6), name, aisles:[] }; state.stores = [...(state.stores||[]), ns]; smStoreAdding = false; save(); smPick(ns.id); };
  if(sg) sg.onclick = smAdd;
  if(sn) sn.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); smAdd(); } };
}
/* v2.28 map a shop by photographing its signs: "Read a sign" takes a photo, /api/aisle reads the aisle's number and what
   the sign lists, and the line joins the end of the box — walk the shop once, a photo per sign. The wait shows its step
   and always ends (75 s at most), and at most 60 signs a day per phone (ml_aisleday). */
const AISLE_DAY_CAP = 60;
var amRead = null;   // null | { busy:true, step } | { err } | { ok }, under the box. var: render() reads it at boot
function aisleToday(){ try{ const o=JSON.parse(localStorage.getItem("ml_aisleday")||"{}"); return o.d===dayKey(new Date()) ? (+o.n||0) : 0; }catch(e){ return 0; } }
function aisleCount(){ try{ localStorage.setItem("ml_aisleday", JSON.stringify({ d:dayKey(new Date()), n:aisleToday()+1 })); }catch(e){} }
function amPick(){ pickFile({ accept:"image/*", capture:"environment" }).then(file=>{ if(file) amReadSign(file); }); }   // attached to the page, for iOS (js/platform.js)
function amKeepText(){ const t=app.querySelector("#amText"); if(t) amDraft=t.value; }
function amReadSign(file){
  if(aisleToday()>=AISLE_DAY_CAP){ amRead={ err:`That's ${AISLE_DAY_CAP} signs today, the free limit on this phone. Type the rest, or carry on tomorrow.` }; render(); return; }
  amKeepText(); amRead={ busy:true, step:"Preparing the photo…" }; render();
  const ctl=(typeof AbortController!=="undefined") ? new AbortController() : null;
  const timer=setTimeout(()=>{ if(ctl) ctl.abort(); }, 75000);
  planShrinkImage(file, 1400, 0.8)
    .then(img=>{ if(amRead && amRead.busy){ amRead.step="Reading the sign…"; render(); }
      return apiFetch("/api/aisle", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ image:img }), signal: ctl ? ctl.signal : undefined }); })
    .then(r=>r.json().catch(()=>({})).then(j=>({ ok:r.ok, j })))
    .then(({ok,j})=>{ if(ok) aisleCount();   // counted even if the sheet was closed while it read
      if(!amOpen) return;
      if(!ok){ const c=j && j.code;
        amRead={ err: c==="signin" ? "This phone isn't signed in yet. Check your connection and try again."
          : c==="appcheck" ? "The app couldn't prove it's the real app. Close it completely and open it again."
          : c==="not_configured" ? "Reading signs isn't set up on the server yet — type the aisle instead."
          : c==="quota" ? "The free reading allowance is used up for today. Type the aisle, or try tomorrow."
          : c==="busy" ? "The reader is busy. Try again in a minute."
          : (c==="bad_image" || c==="too_large") ? "Couldn't use that photo. Try again, closer to the sign."
          : c==="vision_model" ? "Photo reading isn't set up on this account."
          : "Couldn't read that sign. Try again, or type it." }; render(); return; }
      const items=Array.isArray(j.items) ? j.items.filter(x=>typeof x==="string" && x.trim()) : [];
      if(!items.length){ amRead={ err:"No aisle sign in that photo. Try again, with the sign filling more of it." }; render(); return; }
      const line=((j.aisle ? String(j.aisle)+" " : "") + items.map(x=>x.trim()).join(", ")).slice(0, 80);
      amDraft = (amDraft && amDraft.trim() ? amDraft.replace(/\s+$/,"") + "\n" : "") + line;
      amRead={ ok:`Added “${line}”. Next sign?` }; render(); })
    .catch(e=>{ if(amOpen){ amRead={ err: navigator.onLine===false ? "No connection. Try again when you're online, or type the aisle."
        : (e && e.name==="AbortError") ? "That took too long. Try again, closer to the sign."
        : "Couldn't read that sign. Try again, or type it." }; render(); } })
    .finally(()=>clearTimeout(timer)); }
/* v2.17: the receipt is in your hand at the till, not at the bottom of Settings. After a shop is finished the Shop
   page asks for it for up to three hours ("Got the receipt?"). Off in Settings › Prices; never past the day's free
   receipts; gone once a receipt is read or "Not now" is tapped. The time is kept on the phone (ml_rcptnudge). */
const RCPT_NUDGE_MS = 3*60*60*1000;
function rcptAskOn(){ try{ return localStorage.getItem("ml_rcptask")!=="0"; }catch(e){ return true; } }
function rcptNudgeSet(){ try{ localStorage.setItem("ml_rcptnudge", String(Date.now())); }catch(e){} }
function rcptNudgeClear(){ try{ localStorage.removeItem("ml_rcptnudge"); }catch(e){} }
/* v2.31 (the household's item 6): "match what was in the cart, in the order it was checked, which should be the order on
   the bill". When a shop is finished, what was ticked is kept on this phone (ml_lastcart) in tick order for two days; a
   receipt read afterwards is paired with it line by line (js/till.js) — by name, then by order between the named ones. */
const LASTCART_MS = 2*24*60*60*1000;
function lastCartSet(checked){ try{ localStorage.setItem("ml_lastcart", JSON.stringify({ code:listCode, t:Date.now(),
  items:checked.slice().sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).map(i=>({ name:i.name, cat:i.cat, qty:i.qty||1, weight:i.weight||"", note:i.note||"" })) })); }catch(e){} }
function lastCartClear(){ try{ localStorage.removeItem("ml_lastcart"); }catch(e){} }
/* the cart a receipt is matched against: what is ticked now, if anything is (a receipt read before finishing), else this
   list's last finished shop from the last two days */
function rcCart(){ const now=state.items.filter(i=>i.checked);
  if(now.length) return now.slice().sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).map(i=>({ name:i.name, cat:i.cat, qty:i.qty||1, weight:i.weight||"", note:i.note||"" }));   // v2.72: weight and note tell two beefs apart
  try{ const o=JSON.parse(localStorage.getItem("ml_lastcart")||"null");
    if(o && o.code===listCode && Date.now()-(+o.t||0) < LASTCART_MS && Array.isArray(o.items)) return o.items.filter(x=>x && x.name); }catch(e){}
  return []; }
function rcPair(){ if(!rcpt || !rcpt.lines) return; const cart=rcCart(); rcpt.cart=cart; if(!cart.length) return;
  /* v2.35: the read name or the printed line, word by word. v2.72: when the names agree, the cart item's note counts too —
     "TOPSIDE STEAK" goes to "Beef · Topside steak", not to whichever beef was ticked first */
  const r=reconcile(rcpt.lines, cart, (a, b, L, x)=>{ const base=Math.max(nameScore(a, b), nameScore(L && L.raw, b));
    return (base>0 && x && x.note) ? base + Math.max(nameScore(L && L.raw, x.note), nameScore(L && L.note, x.note)) : base; });
  rcpt.lines.forEach((L,i)=>{ L.read=L.name; L.readNote=L.note||""; L.cart=r.pair[i]; L.how=r.how[i]; if(L.cart!==null){ L.name=cart[L.cart].name; L.note=cart[L.cart].note||""; } }); }
function rcCartSummary(){ const cart=rcpt.cart, took=new Set(rcpt.lines.filter(L=>L.keep && L.cart!==null && L.cart!==undefined).map(L=>L.cart));
  const miss=cart.filter((c,k)=>!took.has(k)), guess=rcpt.lines.filter(L=>L.keep && L.how==="order").length;
  return `<div class="rccartsum" role="status"><b>${tf(cart.length===1?"{a} of {b} ticked item found on the receipt":"{a} of {b} ticked items found on the receipt", { a:cart.length-miss.length, b:cart.length })}</b>${guess?` · ${tf("{n} matched by the order you ticked them — check those", { n:guess })}`:""}
    ${miss.length?`<div class="rcmiss">${t("Ticked but not on the receipt:")} ${miss.map(c=>esc(c.name)).join(", ")}</div>`:""}</div>`; }
/* v2.31 (the household's item 5): membership cards for the till — a name, the shop it is for, its number (drawn as a
   Code 128 barcode, js/till.js) and, if added, a photo of the card. On this phone only (ml_cards): never synced, never sent. */
const CARD_MAX = 6;
var cardEdit = null, cardShow = null;   // the add/edit sheet / the card on screen { id, view }. var: render() reads them at boot
function cardsGet(){ try{ const a=JSON.parse(localStorage.getItem("ml_cards")||"[]"); return Array.isArray(a) ? a.filter(c=>c && c.id && c.name) : []; }catch(e){ return []; } }
function cardsPut(a){ try{ localStorage.setItem("ml_cards", JSON.stringify(a.slice(0, CARD_MAX))); return true; }catch(e){ return false; } }
/* v2.35 (the household's items 5, 6): the card's shop is worked out from its name or number, not asked — "Flybuys" or a
   number starting 6008 is Coles, "Everyday Rewards" is Woolworths. (The 6008 prefix is from the household's own card; other
   prefixes could not be checked from here.) A card whose shop cannot be told never comes up by itself. */
function cardChainOf(name, num){ const n=String(name||"").toLowerCase(), d=String(num||"");
  if(/flybuys|fly buys|coles/.test(n) || /^6008/.test(d)) return "coles";
  if(/everyday|rewards|woolworths|woolies/.test(n)) return "woolworths";
  return ""; }
function cardChain(c){ return (c && (c.chain || cardChainOf(c.name, c.num))) || ""; }
/* v2.56 item 8: a card can be for any shop. First a card the household tied to this shop (`stores`, its ids), then the chain
   as before, then a shared word between the card's name and the shop's ("My Dan's" / "Dan Murphy's Box Hill" → "dan"). */
const CARD_NAME_STOP = new Set(["my","the","card","club","member","members","rewards","plus","australia","store","shop"]);
function cardWords(x){ return String(x||"").toLowerCase().replace(/['’]s\b/g,"").replace(/['’]/g,"").split(/[^a-z0-9]+/)
  .filter(w=>w.length>=3 && !CARD_NAME_STOP.has(w)); }
function cardFor(store){ if(!store) return null; const all=cardsGet();
  const tied=all.find(c=>Array.isArray(c.stores) && c.stores.includes(store.id)); if(tied) return tied;
  const k=chainOfStore(store.name); const byChain = k ? all.find(c=>cardChain(c)===k) : null; if(byChain) return byChain;
  const sw=new Set(cardWords(store.name)); if(!sw.size) return null;
  return all.find(c=>cardWords(c.name).some(w=>sw.has(w))) || null; }
function cardNumFmt(n){ return String(n||"").replace(/\s+/g,"").replace(/(.{4})(?=.)/g,"$1 "); }
/* v2.34 (the household's items 1–3): the card comes down from the TOP of the screen — a phone is scanned by its top end —
   with the barcode first. It opens on the card for the shop you are at (or the one asked for), and a swipe left or right
   moves to the others, for when the location is missing or wrong. Since v2.37 it is marked by a band in the
   programme's colour with its name (cardBrand): the programmes' own logos are trademarks and are not shipped with the app. */
/* v2.35 (the household's items 1, 7): Barcode or Photo is remembered (ml_cardview) — a swipe to the next card keeps it.
   Swiping reaches "Add a card" (v2.37: it is before the first card, the + dot on the left): scan it with the camera (or pick a photo) and the app reads the
   name and number (on the phone when it can read the barcode itself, else the AI reader, api/card.js) for you to check;
   or type it in. */
function cardViewPref(){ try{ return localStorage.getItem("ml_cardview")==="photo" ? "photo" : "code"; }catch(e){ return "code"; } }
function cardShowHTML(){ const all=cardsGet(); let ix=cardShow.add ? all.length : all.findIndex(x=>x.id===cardShow.id); if(ix<0) ix=0;
  const dots = `<div class="carddots" role="tablist" aria-label="${ix<all.length ? tf("Card {a} of {b}", { a:ix+1, b:all.length }) : t("Add a card")}"><button class="carddot carddot-add${ix===all.length?" on":""}" role="tab" aria-selected="${ix===all.length}" data-card-addpanel="1" aria-label="${t("Add a card")}">+</button>${all.map((x,k)=>`<button class="carddot${k===ix?" on":""}" role="tab" aria-selected="${k===ix}" data-card-pick="${esc(x.id)}" aria-label="${esc(x.name)}"></button>`).join("")}</div>`;   /* v2.37 (the household's item 2): the + dot on the left of the first */
  if(ix>=all.length){ const rd=cardRead;
    /* v2.37 (the household's item 1): Type it in shows the name and number in the same drop-down.
       v2.38 (the household's items 2, 3): shorter words — Add card, Choose photo, Type it — no explanations under them, and
       the form opens right below the buttons, without a photo row (the Add card tile above is the camera) */
    const typing = !!(cardEdit && cardEdit.inline);
    return `<div class="sheet-bg sheettop" id="cardBg"><div class="sheet" id="cardSheet" data-look="card" role="dialog" aria-labelledby="cardTitle">
      <div class="cardface cardadd" id="cardSwipe" role="button" tabindex="0" aria-label="${t("Take a photo of the card")}" ${rd&&rd.busy?'aria-disabled="true"':""}><span class="cardadd-plus" aria-hidden="true">+</span><div class="disp" id="cardTitle">${t("Add card")}</div></div>
      ${rd && rd.busy ? `<div class="rcbusy" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${esc(t(rd.step||"Reading the card…"))}</div>` : ""}
      ${rd && rd.err ? `<div class="rpterr" role="alert">${esc(t(rd.err))}</div>` : ""}
      <div class="cardaddbtns"><div class="ppedbtns" style="margin-top:0"><button class="optaction" id="cardPhotoGo" ${rd&&rd.busy?"disabled":""}>${t("Choose photo")}</button><button class="optaction${typing?" on":""}" id="cardTypeGo" aria-expanded="${typing}">${t("Type it")}</button></div></div>
      ${typing ? `<div id="ceSheet" class="cardtype" role="group" aria-label="${t("The card's name and number")}">${cardEditBody()}</div>` : ""}
      ${all.length ? dots : ""}
      ${typing ? "" : `<div style="display:flex;gap:8px;margin-top:10px"><button class="optaction" id="cardClose" style="margin-top:0">${t("Done")}</button></div>`}
    </div></div>`; }
  const c=all[ix];
  const bc=c.num ? code128SVG(c.num, 70) : "", want=cardShow.view || cardViewPref(), view=((want==="photo" && c.photo) || !bc) ? "photo" : "code";
  const br=cardBrand(c.name, cardChain(c));   // v2.37 (the household's item 3): the programme's colour and name above the barcode
  return `<div class="sheet-bg sheettop" id="cardBg"><div class="sheet" id="cardSheet" data-look="card" role="dialog" aria-labelledby="cardTitle">
    <div class="cardface" id="cardSwipe"><div class="cardband" style="background:${br.bg};color:${br.fg}"><span class="cardband-n" id="cardTitle">${esc(c.name)}</span></div>${view==="photo" && c.photo ? `<img src="${esc(c.photo)}" alt="${esc(tf("Photo of the {name} card", { name:c.name }))}" />` : `${bc}<div class="cardnum">${esc(cardNumFmt(c.num))}</div>`}</div>
    ${(bc && c.photo) ? `<div class="cardhead"><div class="seg"><button data-card-view="code" class="${view==="code"?'on':''}">${t("Barcode")}</button><button data-card-view="photo" class="${view==="photo"?'on':''}">${t("Photo")}</button></div></div>` : ""}
    ${dots}
    <div class="hint" style="margin-top:2px">${all.length>1 ? t("Swipe the card for your other cards, or to add one") : t("Swipe the card to add one")}</div>
    <div class="hint" style="margin-top:8px">${t("Turn the brightness up if the scanner struggles.")}${bc && !c.photo ? t(" If it won't scan, add a photo of the card.") : ""}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="optaction" id="cardClose" style="margin-top:0">${t("Done")}</button></div>
  </div></div>`; }
var cardRead = null;   // v2.35 { busy, step } | { err } while a card's photo is read. var: render() reads it at boot
function cardScan(capture){ pickFile({ accept:"image/*", capture:capture?"environment":"" }).then(file=>{ if(file) cardReadPhoto(file); }); }   // attached to the page, for iOS (js/platform.js)
/* the barcode read on the phone itself, where the browser can (BarcodeDetector) — then the photo need not leave the phone */
async function cardBarcodeHere(img){ try{ if(!barcodeSupported()) return "";
  const im=new Image(); im.src=img; await im.decode(); const r=await detectBarcodes(im);
  return ((r||[]).map(x=>String(x.rawValue||"").replace(/[\s-]+/g,"")).find(x=>/^[0-9]{6,24}$/.test(x))) || ""; }catch(e){ return ""; } }
function cardReadPhoto(file){
  cardRead={ busy:true, step:"Preparing the photo…" }; render();
  const ctl=(typeof AbortController!=="undefined") ? new AbortController() : null;
  const timer=setTimeout(()=>{ if(ctl) ctl.abort(); }, 45000);   // every wait ends
  let photo="";
  const done=(name, num)=>{ cardRead=null; cardShow={ add:true };   // v2.37 (item 1): checked in the same drop-down
    cardEdit={ id:"", name:String(name||"") || (/^6008/.test(num) ? "Flybuys" : ""), chain:"", num:String(num||""), photo, fromScan:true, inline:true }; render(); };
  planShrinkImage(file, 1000, 0.85)
    .then(img=>{ photo=img; return cardBarcodeHere(img); })
    .then(here=>{ if(!cardRead) return null;
      if(here){ done("", here); return null; }
      cardRead.step="Reading the card…"; render();
      return apiFetch("/api/card", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ image:photo }), signal: ctl ? ctl.signal : undefined })
        .then(r=>r.json().catch(()=>({})).then(j=>({ ok:r.ok, j }))); })
    .then(res=>{ if(!res || !cardRead) return; const { ok, j }=res;
      if(!ok){ const c=j && j.code;
        cardRead={ err: c==="signin" ? "This phone isn't signed in yet. Check your connection and try again."
          : c==="appcheck" ? "The app couldn't prove it's the real app. Close it completely and open it again."
          : c==="not_configured" ? "Reading cards isn't set up on the server yet — type it in instead."
          : c==="quota" ? "The free reading allowance is used up for today. Type it in, or try tomorrow."
          : c==="busy" ? "The reader is busy. Try again in a minute, or type it in."
          : (c==="bad_image" || c==="too_large") ? "Couldn't use that photo. Try again, closer to the card."
          : c==="vision_model" ? "Photo reading isn't set up on this account — type it in."
          : "Couldn't read that card. Try again, or type it in." }; render(); return; }
      if(!j.number && !j.name){ cardRead={ err:"No card number in that photo. Try again with the barcode and its number filling more of it, or type it in." }; render(); return; }
      done(j.name, j.number); })
    .catch(e=>{ if(cardRead){ cardRead={ err: navigator.onLine===false ? "No connection. Type the number in, or try again when you're online."
        : (e && e.name==="AbortError") ? "That took too long. Try again, or type it in."
        : "Couldn't use that photo. Try another, or type it in." }; render(); } })
    .finally(()=>clearTimeout(timer)); }
/* v2.37 (the household's item 1): the form's body, shown in the card drop-down itself (inline) or in its own sheet */
function cardEditHTML(){ if(cardEdit.inline) return "";
  return `<div class="sheet-bg kbpin" id="ceBg"><div class="sheet" id="ceSheet" role="dialog" aria-labelledby="ceTitle">${cardEditBody()}</div></div>`; }
function cardEditBody(){ const e=cardEdit;
  return `
    ${(e.inline && !e.fromScan) ? "" : `<div class="disp" id="ceTitle" style="font-weight:800;font-size:17px;margin-bottom:6px">${e.id ? t("Edit card") : e.fromScan ? t("Check the card") : t("Add a card")}</div>`}
    ${e.fromScan ? `<div class="hint" style="text-align:left;margin:0 0 6px">${t("Read from the photo — check the name and number, then save.")}</div>` : ""}
    <p class="palabel">${t("Name")}</p>
    <input id="ceName" class="cefield" value="${esc(e.name)}" placeholder="Flybuys" autocomplete="off" />
    <p class="palabel">${t("Card number")}</p>
    <input id="ceNum" class="cefield" value="${esc(e.num)}" inputmode="numeric" placeholder="${t("The number under the barcode")}" autocomplete="off" />
    ${(()=>{ const ws=rcSavedStores(), on=Array.isArray(e.stores)?e.stores:[]; if(!ws.length) return "";   // v2.56 item 8: the shops this card is for
      return `<p class="palabel">${t("Shops")}</p><div style="display:flex;flex-wrap:wrap;gap:6px">${ws.map(s=>`<button class="catchip" data-ce-store="${esc(s.id)}" aria-pressed="${on.includes(s.id)}" style="${on.includes(s.id)?'background:var(--btn);border-color:var(--btn);color:#fff':''}">${esc(s.name)}</button>`).join("")}</div>`; })()}
    ${e.inline ? "" : `<p class="palabel">${t("Photo of the card (if the barcode won't scan)")}</p>
    <div style="display:flex;gap:8px;align-items:center">${e.photo ? `<img class="cethumb" src="${esc(e.photo)}" alt="" />` : ""}<button class="optaction" id="cePhoto" style="margin-top:0">${CAMERA_SVG(16)} ${e.photo ? t("New photo") : t("Add a photo")}</button>${e.photo ? `<button class="optaction" id="ceNoPhoto" style="margin-top:0">${t("Remove")}</button>` : ""}</div>`}
    ${e.busy ? `<div class="rcbusy" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${t("Preparing the photo…")}</div>` : ""}
    ${e.err ? `<div class="rpterr" role="alert">${esc(t(e.err))}</div>` : ""}
    ${e.inline ? "" : `<div class="hint" style="text-align:left">${t("Kept on this phone only — never shared with the list or sent anywhere.")}</div>`}
    <div class="ppedbtns">${(e.id && !e.inline) ? `<button class="optaction" id="ceDel">${t("Delete")}</button>` : `<button class="optaction" id="ceCancel">${t("Cancel")}</button>`}<button class="newlist" id="ceSave">${t("Save")}</button></div>`; }
function cardPick(){ pickFile({ accept:"image/*" }).then(file=>{ if(!file || !cardEdit) return;   // attached to the page, for iOS (js/platform.js)
    cardEdit.busy=true; cardEdit.err=""; render();
    const slow=new Promise((_,rej)=>setTimeout(()=>rej(new Error("slow")), 20000));   // every wait ends
    Promise.race([planShrinkImage(file, 1000, 0.85), slow])
      .then(img=>{ if(!cardEdit) return; cardEdit.busy=false; cardEdit.photo=img; render(); })
      .catch(()=>{ if(!cardEdit) return; cardEdit.busy=false; cardEdit.err="Couldn't use that photo. Try another."; render(); }); }); }
var stuckOpen = false;   // v2.32 the screen log sheet. var: render() reads it at boot
function stuckText(){ return "The + got stuck halfway up the page (" + APP_VERSION + ").\n" + stuckLog().slice(0,4).map(e=>JSON.stringify(e)).join("\n").slice(0,1700); }
function stuckHTML(){ const a=stuckLog();
  return `<div class="sheet-bg" id="stBg"><div class="sheet" id="stSheet" role="dialog" aria-labelledby="stTitle">
    <div class="disp" id="stTitle" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Screen log")}</div>
    <div class="hint" style="text-align:left;margin:0 0 10px">${t("Each time the “+” was found out of place and put back, with what happened just before. Kept on this phone; send it with a report so it can be fixed for good.")}</div>
    <div class="stlist">${a.length ? a.map(e=>`<div class="strow"><b>${esc(new Date(e.t).toLocaleString(dateLoc(),{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}))}</b> · ${esc(e.page||"")} · ${tf("{n}px too high", { n:e.gap })} · ${tf("via {x}", { x:esc(e.src||"") })}<div class="sttrail">${esc((e.trail||[]).join(" → "))}</div></div>`).join("") : `<div class="hint" style="text-align:left">${t("Nothing logged.")}</div>`}</div>
    <div class="ppedbtns"><button class="optaction" id="stClear">${t("Clear")}</button><button class="newlist" id="stSend">${t("Report it")}</button></div>
    <button class="optaction" id="stClose">${t("Close")}</button>
  </div></div>`; }
function wireStuck(){
  const o=app.querySelector("#optStuck"); if(o) o.onclick=()=>{ stuckOpen=true; render(); };
  if(!stuckOpen) return;
  const close=()=>{ stuckOpen=false; render(); };
  const c=app.querySelector("#stClose"); if(c) c.onclick=close;
  const bg=app.querySelector("#stBg"); if(bg) bg.onclick=e=>{ if(e.target===bg) close(); };
  const cl=app.querySelector("#stClear"); if(cl) cl.onclick=()=>{ try{ localStorage.removeItem("ml_stucklog"); }catch(e){} close(); };
  const sd=app.querySelector("#stSend"); if(sd) sd.onclick=()=>{ stuckOpen=false; rpt={ kind:"broken", text:stuckText(), diag:true }; render(); }; }
/* v2.32 (the household's item 13): the card is scanned before paying, so after Save to Regulars it sits at the top of the
   Shop page, above "Got the receipt?", for half an hour or until Done. At a shop with no card saved, the same place
   offers to add one (photo and number), or can be told not to ask again. Times and the "don't ask" are on this phone. */
var CARD_NUDGE_MS = 30*60*1000;   // var: the Shop page reads it, and the first render can come before this line runs
function cardNudgeSet(){ try{ localStorage.setItem("ml_cardnudge", String(Date.now())); }catch(e){} }
function cardNudgeClear(){ try{ localStorage.removeItem("ml_cardnudge"); }catch(e){} }
function cardAskOn(){ try{ return localStorage.getItem("ml_cardask")!=="0"; }catch(e){ return true; } }
/* v2.72: "No card at this shop" — the shops this phone has said have no card (ml_nocard, a JSON array of store ids, at
   most 200). Cards are on this phone, so this is too; it is in BOTH exclusion lists. Linking a card to a shop removes it. */
function noCardGet(){ try{ const a=JSON.parse(localStorage.getItem("ml_nocard")||"[]"); return Array.isArray(a) ? a.filter(x=>typeof x==="string") : []; }catch(e){ return []; } }
function noCardAdd(id){ if(!id) return; const a=noCardGet().filter(x=>x!==id); a.push(id); try{ localStorage.setItem("ml_nocard", JSON.stringify(a.slice(-200))); }catch(e){} }
function noCardDrop(ids){ const a=noCardGet(), b=a.filter(x=>!(ids||[]).includes(x)); if(b.length!==a.length){ try{ localStorage.setItem("ml_nocard", JSON.stringify(b)); }catch(e){} } }
function cardHere(){ const st=activeStore(), real=!!(st && isRealStore(st.id));
  return { st, real, c:real ? cardFor(st) : null }; }   // v2.35 (item 6): only at a real shop, only that shop's card — never at home
function cardNudgeHTML(){ let at=0; try{ at=+localStorage.getItem("ml_cardnudge")||0; }catch(e){}
  if(!(at>0 && Date.now()-at < CARD_NUDGE_MS)) return "";
  const { st, real, c } = cardHere();
  if(c){ const bc=c.num ? code128SVG(c.num, 70) : "", br=cardBrand(c.name, cardChain(c));   // v2.37 (item 3): the same band
    return `<div class="installcard cardnudge" id="cardNudge" role="region" aria-label="${tf("{x} card", { x:esc(c.name) })}">
      <div class="ic-t">${CARD_SVG(18)} ${tf("{x} — scan before you pay", { x:esc(c.name) })}</div>
      <button class="cardface cardface-sm" id="cardNudgeBig" aria-label="${t("Show the card bigger")}"><div class="cardband" style="background:${br.bg};color:${br.fg}"><span class="cardband-n">${esc(c.name)}</span></div>${(!bc && c.photo) ? `<img src="${esc(c.photo)}" alt="${tf("Photo of the {x} card", { x:esc(c.name) })}" />` : `${bc}<div class="cardnum">${esc(cardNumFmt(c.num))}</div>`}</button>
      <div class="ic-btns"><button class="optaction" id="cardNudgeDone">${t("Done")}</button></div></div>`; }
  if(!real || !cardAskOn() || noCardGet().includes(st.id)) return "";
  const mine=cardsGet();
  if(mine.length) return `<div class="installcard cardnudge" id="cardNudge" role="region" aria-label="${t("Membership card")}">
    <div class="ic-t">${CARD_SVG(18)} ${t("Use one of your cards here?")}</div>
    <div class="ic-btns" style="flex-wrap:wrap">${mine.map(c=>`<button class="catchip" data-card-use="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div>
    <div class="ic-btns"><button class="newlist" id="cardNudgeAdd">${t("Add a new card")}</button><button class="optaction" id="cardNudgeNo">${t("Not now")}</button></div>
    <button class="cardnever" id="cardNudgeNone">${t("No card at this shop")}</button></div>`;   // v2.56 item 8
  const k=chainOfStore(st.name), nm=k==="coles" ? t("Flybuys card") : k==="woolworths" ? t("Everyday Rewards card") : t("membership card");
  return `<div class="installcard cardnudge" id="cardNudge" role="region" aria-label="${t("Membership card")}">
    <div class="ic-t">${CARD_SVG(18)} ${tf("Got a {x}?", { x:esc(nm) })}</div>
    <div class="ic-b">${tf("Add it once — a photo and its number — and it shows here after every shop at {x}, ready to scan before you pay. It stays on this phone.", { x:esc(st.name) })}</div>
    <div class="ic-btns"><button class="newlist" id="cardNudgeAdd">${t("Add the card")}</button><button class="optaction" id="cardNudgeNo">${t("Not now")}</button></div>
    <button class="cardnever" id="cardNudgeNone">${t("No card at this shop")}</button>
    <button class="cardnever" id="cardNudgeNever">${t("Never ask, at any shop")}</button></div>`; }
/* v2.34 (the household's item 5): the "+" tile at the end of each category in Regulars. v2.37 (item 4): it opens the same
   add sheet as "+ Add items", and what is added there goes in this category and is kept as a Regular */
function wireBaNew(){
  app.querySelectorAll("[data-ba-new]").forEach(b=>b.onclick=()=>{ openAdd(); addFromCat=b.dataset.baNew;
    const m=document.getElementById("mainInput"); if(m){ m.placeholder=tf("Add to {x}…", { x:catLabel(CAT(addFromCat))||t("Regulars") }); } }); }
/* v2.34 (the household's item 6): Help › Location diagnostics — where the phone thinks it is, and for each shop whether it
   can be detected, which aisle order it walks (its own map, a built-in layout, or none yet) and how much of a route the
   AI has learned there. Read-only. */
var locDiagOpen = false;   // var: render() reads it at boot
function locDiagHTML(){ const nm=id=>esc((storeById(id)||{}).name||id);
  const here = !useLoc ? t("Location is off (Settings › Shopping)") : !locState.checked ? t("Not checked yet") : locState.err ? t("Location unavailable — permission or signal")
    : locState.nearId ? `${tf("At {x}", { x:nm(locState.nearId) })}${isFinite(locState.dist)?` · ${tf("{n} m from its pin", { n:Math.round(locState.dist) })}`:""}` : `${t("Not at a saved shop")}${isFinite(locState.dist)?` · ${tf("nearest is {n} m away", { n:Math.round(locState.dist) })}`:""}`;
  const mode = storeSel==="auto" ? t("Auto-detect") : tf("Chosen by hand: {x}", { x:nm(storeSel) });
  const shops=[...STORES.filter(s=>!storeOverride(s.id).hidden).map(s=>storeById(s.id)), ...(state.stores||[]).filter(s=>!storeOverride(s.id).hidden)].filter(Boolean);
  const rows=shops.map(s=>{ const co=storeCoord(s), m=(state.aislemap||{})[s.id], na=(m && Array.isArray(m.aisles)) ? m.aisles.length : 0, ai=Object.keys((aiItems||{})[s.id]||{}).length;
    const src = na ? `${t("Its own aisle map")} · ${na===1 ? t("1 aisle") : tf("{n} aisles", { n:na })}` : s.market ? t("A market — fresh counters only") : s.aisles ? `${t("Built-in layout")}${s.naisles?` · ${tf("{n} aisles", { n:s.naisles })}`:""}` : t("No aisle order yet — sorted by category");
    return `<details class="pdrow"><summary><span class="pd-n">${esc(s.name)}</span><span class="pd-s">${co?t("can be detected"):t("no location pin")}</span></summary>
      <div class="ldrec">${src}</div>
      <div class="ldrec">${co ? tf("Pinned at {lat}, {lng} — detected within {r} m", { lat:(+co.lat).toFixed(4), lng:(+co.lng).toFixed(4), r:LOC_RADIUS_M }) : t("Pin it with “Set … location here” while you are at the shop.")}</div>
      <div class="ldrec">${t("AI route learned:")} ${ai ? (ai===1 ? t("1 item (AI diagnostics lists them)") : tf("{n} items (AI diagnostics lists them)", { n:ai })) : t("nothing yet")}</div>
      ${na ? `<ol class="ldlist">${m.aisles.map(a=>`<li>${a.n?`<b>${esc(a.n)}</b> `:""}${esc(a.t)}</li>`).join("")}</ol>` : ""}</details>`; }).join("");
  return `<div class="sheet-bg" id="ldBg"><div class="sheet" id="ldSheet" role="dialog" aria-labelledby="ldTitle">
    <div class="disp" id="ldTitle" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Location diagnostics")}</div>
    <div class="ldrec"><b>${t("Now:")}</b> ${here}</div><div class="ldrec"><b>${t("Shop:")}</b> ${mode}</div>
    <div class="pdlist" style="margin-top:8px">${rows || `<div class="hint" style="text-align:left">${t("No shops saved.")}</div>`}</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="optaction" id="ldClose" style="margin-top:0">${t("Close")}</button></div>
  </div></div>`; }
function wireLocDiag(){
  const o=app.querySelector("#optLocDiag"); if(o) o.onclick=()=>{ locDiagOpen=true; ensureLocCheck(); render(); };
  if(!locDiagOpen) return;
  const close=()=>{ locDiagOpen=false; render(); };
  const c=app.querySelector("#ldClose"); if(c) c.onclick=close;
  const bg=app.querySelector("#ldBg"); if(bg) bg.onclick=e=>{ if(e.target===bg) close(); }; }
function wireCards(){
  { const nd=app.querySelector("#cardNudgeDone"), nn=app.querySelector("#cardNudgeNo"), nv=app.querySelector("#cardNudgeNever"), na=app.querySelector("#cardNudgeAdd"), nb=app.querySelector("#cardNudgeBig");
    if(nd) nd.onclick=()=>{ cardNudgeClear(); render(); };
    if(nn) nn.onclick=()=>{ cardNudgeClear(); render(); };
    if(nv) nv.onclick=()=>{ try{ localStorage.setItem("ml_cardask","0"); }catch(e){} cardNudgeClear(); render(); };
    const nz=app.querySelector("#cardNudgeNone"); if(nz) nz.onclick=()=>{ const st=activeStore(); if(st) noCardAdd(st.id); cardNudgeClear(); render(); };   // v2.72
    if(nb) nb.onclick=()=>{ const c=cardHere().c; if(c){ cardShow={ id:c.id }; render(); } };
    if(na) na.onclick=()=>{ const st=activeStore(), k=chainOfStore(st && st.name);
      cardEdit={ id:"", name:k==="coles" ? "Flybuys" : k==="woolworths" ? "Everyday Rewards" : "", chain:k||"", num:"", photo:"" }; render(); };
    app.querySelectorAll("[data-card-use]").forEach(b=>b.onclick=()=>{ const st=activeStore(); if(!st) return;   // v2.56 item 8: this card is for this shop
      const a=cardsGet(), c=a.find(x=>x.id===b.dataset.cardUse); if(!c) return;
      c.stores=[...new Set([...(Array.isArray(c.stores)?c.stores:[]), st.id])];
      if(!cardsPut(a)){ showToast("This phone's storage is full"); return; } noCardDrop([st.id]); render(); });
    app.querySelectorAll("[data-opt-cardask]").forEach(b=>b.onclick=()=>{ try{ localStorage.setItem("ml_cardask", b.dataset.optCardask); }catch(e){} render(); }); }
  const keep=()=>{ const n=app.querySelector("#ceName"), u=app.querySelector("#ceNum"); if(cardEdit){ if(n) cardEdit.name=n.value; if(u) cardEdit.num=u.value; } };
  app.querySelectorAll("[data-card-add]").forEach(b=>b.onclick=()=>{ if(cardsGet().length>=CARD_MAX){ showToast(tf("Up to {n} cards", { n:CARD_MAX })); return; } cardShow={ add:true }; render(); });   // v2.35: the same add panel as the card sheet's
  app.querySelectorAll("[data-card-edit]").forEach(b=>b.onclick=()=>{ const c=cardsGet().find(x=>x.id===b.dataset.cardEdit); if(c){ cardEdit=Object.assign({ photo:"" }, c); render(); } });
  app.querySelectorAll("[data-card-open]").forEach(b=>b.onclick=()=>{ cardShow={ id:b.dataset.cardOpen }; render(); });
  if(cardEdit){
    ["#ceName","#ceNum"].forEach(s=>{ const f=app.querySelector(s); if(f) f.oninput=keep; });   // no re-render while typing
    const ph=app.querySelector("#cePhoto"); if(ph) ph.onclick=()=>{ keep(); cardPick(); };
    app.querySelectorAll("[data-ce-store]").forEach(b=>b.onclick=()=>{ keep(); const id=b.dataset.ceStore, cur=Array.isArray(cardEdit.stores)?cardEdit.stores:[];   // v2.56 item 8
      cardEdit.stores = cur.includes(id) ? cur.filter(x=>x!==id) : [...cur, id]; render(); });
    const np=app.querySelector("#ceNoPhoto"); if(np) np.onclick=()=>{ keep(); cardEdit.photo=""; render(); };
    const close=()=>{ cardEdit=null; render(); };   // v2.37: cardShow is untouched, so an inline Cancel stays on the add panel
    const cc=app.querySelector("#ceCancel"); if(cc) cc.onclick=close;
    const bg=app.querySelector("#ceBg"); if(bg) bg.onclick=e=>{ if(e.target===bg && !cardEdit.busy) close(); };
    const dl=app.querySelector("#ceDel"); if(dl) dl.onclick=()=>{ cardsPut(cardsGet().filter(x=>x.id!==cardEdit.id)); close(); };
    const sv=app.querySelector("#ceSave"); if(sv) sv.onclick=()=>{ keep(); const e=cardEdit, num=String(e.num||"").replace(/\s+/g,"");
      if(!e.name.trim()){ e.err="Give the card a name."; render(); return; }
      if(!num && !e.photo){ e.err="Add the card's number, or a photo of it."; render(); return; }
      if(num && !code128SVG(num)){ e.err="That number has characters a barcode can't carry. Check it, or add a photo instead."; render(); return; }
      const c={ id:e.id || ("c"+Date.now().toString(36)), name:e.name.trim().slice(0,40), chain:cardChainOf(e.name, num) || e.chain || "", num, photo:e.photo||"" };   // v2.35: worked out, not asked
      if(Array.isArray(e.stores) && e.stores.length) c.stores=e.stores.slice();   // v2.56 item 8: the shops it is for
      const a=cardsGet(), i=a.findIndex(x=>x.id===c.id); if(i>=0) a[i]=c; else a.push(c);
      if(!cardsPut(a)){ e.err="This phone's storage is full — try without the photo."; render(); return; }
      if(c.stores) noCardDrop(c.stores);   // v2.72: a card for a shop undoes its "No card at this shop"
      if(e.inline){ cardEdit=null; cardShow={ id:c.id }; render(); return; }   // v2.37 (item 1): show the new card with its band
      close(); }; }
  if(cardShow && !app.querySelector("#cardSheet")) cardShow=null;   // its card was deleted: nothing to show, nothing to come back later
  if(cardShow){
    const close=()=>{ cardShow=null; cardRead=null; if(cardEdit && cardEdit.inline) cardEdit=null; render(); };   // v2.37: an inline form goes with it
    const d=app.querySelector("#cardClose"); if(d) d.onclick=close;
    const bg=app.querySelector("#cardBg"); if(bg) bg.onclick=e=>{ if(e.target===bg) close(); };
    app.querySelectorAll("[data-card-pick]").forEach(b=>b.onclick=()=>{ if(cardEdit && cardEdit.inline) cardEdit=null; cardShow={ id:b.dataset.cardPick }; render(); });
    /* v2.34 a swipe left or right moves between the cards */
    const sw=app.querySelector("#cardSwipe"); if(sw){ let x0=null;
      /* v2.35: the add panel is one more place along; v2.37 (item 2): the add panel is first, before the first card. Barcode/Photo is kept from card to card */
      const go=d=>{ const all=cardsGet(), n=all.length+1; let p=cardShow.add ? 0 : all.findIndex(x=>x.id===cardShow.id)+1; if(p<=0 && !cardShow.add) p=1;
        p=(p+d+n)%n; cardShow = p===0 ? { add:true, view:cardShow.view } : { id:all[p-1].id, view:cardShow.view }; cardRead=null; render(); };
      sw.addEventListener("touchstart", e=>{ x0=e.touches[0].clientX; }, { passive:true });
      sw.addEventListener("touchend", e=>{ if(x0===null) return; const dx=e.changedTouches[0].clientX-x0; x0=null; if(Math.abs(dx)>=50) go(dx<0 ? 1 : -1); }, { passive:true }); }
    app.querySelectorAll("[data-card-view]").forEach(b=>b.onclick=()=>{ cardShow.view=b.dataset.cardView; try{ localStorage.setItem("ml_cardview", b.dataset.cardView); }catch(e){} render(); });
    app.querySelectorAll("[data-card-addpanel]").forEach(b=>b.onclick=()=>{ if(cardEdit && cardEdit.inline) cardEdit=null; cardShow={ add:true, view:cardShow.view }; render(); });
    /* v2.36 (the household's item 2): the "+ Add a card" tile itself takes the photo (the camera); Choose a photo picks one */
    const sg=app.querySelector("#cardSwipe.cardadd"); if(sg){ const go=()=>{ if(!(cardRead && cardRead.busy)) cardScan(true); };
      sg.onclick=go; sg.onkeydown=e=>{ if(e.key==="Enter" || e.key===" "){ e.preventDefault(); go(); } }; }
    const pg=app.querySelector("#cardPhotoGo"); if(pg) pg.onclick=()=>cardScan(false);
    const tg=app.querySelector("#cardTypeGo"); if(tg) tg.onclick=()=>{ if(cardsGet().length>=CARD_MAX){ showToast(tf("Up to {n} cards", { n:CARD_MAX })); return; } cardRead=null;
      cardShow={ add:true, view:cardShow.view }; cardEdit={ id:"", name:"", chain:"", num:"", photo:"", inline:true }; render();   // v2.37 (item 1): in the same drop-down
      const f=app.querySelector("#ceName"); if(f) f.focus(); }; } }   // inside the tap, so iOS raises the keyboard
function rcptNudgeOn(){ if(!rcptAskOn() || rcpt) return false;
  let at=0; try{ at=+localStorage.getItem("ml_rcptnudge")||0; }catch(e){}
  return at>0 && Date.now()-at < RCPT_NUDGE_MS; }   // v2.29: at the day's limit it still shows, and says so
function rcptNudgeHTML(){ if(!rcptNudgeOn()) return "";
  return `<div class="installcard rcnudge" id="rcNudge" role="note">
    <div class="ic-t">${CAMERA_SVG(16)} ${t("Got the receipt?")}</div>
    ${rcptToday() >= RCPT_DAY_CAP
      ? `<div class="ic-b">${tf("That's {n} receipts read on this phone today, the most in a day. Keep this one — it can be read tomorrow.", { n:RCPT_DAY_CAP })}</div>
    <div class="ic-btns"><button class="optaction" id="rcNudgeNo">${t("OK")}</button></div>`
      : `<div class="ic-b">${t("Snap it and the app remembers what you paid at each store.")}</div>
    <div class="ic-btns"><button class="newlist" id="rcNudgeGo">${t("Read receipt")}</button><button class="optaction" id="rcNudgeNo">${t("Not now")}</button></div>`}
  </div>`; }
function rcptSheet(){
  const head=`<div class="disp" style="font-weight:800;font-size:17px;margin-bottom:4px">${CAMERA_SVG(18)} ${t("Receipt")}</div>`;
  if(rcpt.busy) return `<div class="sheet-bg kbpin" id="rcBg"><div class="sheet" id="rcSheet">${head}
    <div class="rcbusy" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span>${esc(t(rcpt.step||"Reading the receipt…"))}</div>
    <div class="rcnote" style="text-align:center">${t("This usually takes 5–20 seconds.")}</div></div></div>`;
  if(rcpt.err || !rcpt.lines) return `<div class="sheet-bg kbpin" id="rcBg"><div class="sheet" id="rcSheet">${head}
    <div style="padding:6px 2px 16px;color:var(--text);font-weight:600;line-height:1.5">${esc(t(rcpt.err||"Couldn't read that receipt."))}</div>
    <button class="optaction" id="rcOk">${t("OK")}</button></div></div>`;
  const keptL=rcpt.lines.filter(L=>L.keep), kept=keptL.length, sumKept=Math.round(keptL.reduce((a,L)=>a+(+L.price||0),0)*100)/100;
  const stores=rcSavedStores();
  const chips=stores.map(s=>`<button data-rcstore="${esc(s.id)}" class="${rcpt.store.id===s.id?'on':''}">${esc(s.name)}</button>`).join("")
    + ((rcpt.detected && rcpt.store.id==="") ? `<button data-rcstore="" class="on">${esc(rcpt.detected)}</button>` : "");
  return `<div class="sheet-bg kbpin" id="rcBg"><div class="sheet" id="rcSheet">
  ${head}
  <div class="rcnote">${t("Check the names. The app remembers each price for this store and ticks off what's on your list.")}</div>
  <p class="palabel">${t("Store")}</p>
  <div class="slotseg rcstores">${chips}</div>
  <div class="rcmeta"><label for="rcDate">${t("Date")}</label><input id="rcDate" type="date" value="${esc(rcpt.date)}" /></div>
  <div class="rcsum"><b>${tf("Total on the receipt: {x}", { x:rcpt.total ? priceMoney(rcpt.total) : t("not read") })}</b><br>${kept===1?tf("{n} item kept",{ n:kept }):tf("{n} items kept",{ n:kept })} · ${priceMoney(sumKept)}${(()=>{ const d=(rcpt.discounts||[]).reduce((a,x)=>a+((+x.amount>0)?+x.amount:0),0); return d>0 ? ` · ${t("discounts")} −${priceMoney(d)}` : ""; })()}${rcpt.total && Math.abs(rcpt.total-sumKept)>0.05 ? ` · ${priceMoney(Math.abs(rcpt.total-sumKept))} ${rcpt.total>sumKept?t("not in the lines read"):t("more than the total")}` : ""}</div>
  ${(rcpt.cart && rcpt.cart.length) ? rcCartSummary() : ""}<div class="rclines">${rcpt.lines.map((L,i)=>`<div class="rcrow${L.keep?"":" off"}">
     <button class="smartcheck ${L.keep?"on":""}" data-rckeep="${i}" role="checkbox" aria-checked="${L.keep?"true":"false"}" aria-label="${esc(tf(L.keep?"Leave out {name}":"Keep {name}", { name:L.name }))}">✓</button>
     <div class="rcmid"><input class="rcname" data-rcname="${i}" value="${esc(L.name)}" aria-label="${tf("Item {n}", { n:i+1 })}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" />
       <span class="rcraw">${esc(L.raw)}${L.note?` · ${esc(L.note)}`:""}${L.qty>1?` · ${L.qty}×`:""}${L.weight?` · ${esc(L.weight)}`:""} · ${esc(rcUnitTxt(L))}${L.match?` · <b>${t("on your list")}</b>`:""}</span>${(rcpt.cart && rcpt.cart.length && L.keep) ? `<select class="rccart${L.how==="order"?" guess":""}" data-rccart="${i}" aria-label="${tf("Which ticked item is line {n}", { n:i+1 })}"><option value="">${t("Not from the cart")}</option>${rcpt.cart.map((c,k)=>`<option value="${k}"${L.cart===k?" selected":""}>${k+1}. ${esc(c.name)}${c.weight?` · ${esc((+c.qty||1)>1?c.qty+"× "+c.weight:c.weight)}`:((+c.qty||1)>1?` · ${+c.qty}×`:"")}${c.note?` · ${esc(c.note)}`:""}</option>`).join("")}</select>${L.how==="order"?`<span class="rcguess">${t("Matched by the order you ticked — check")}</span>`:""}` : ""}</div>
     <span class="rcprice">${priceMoney(L.price)}</span></div>`).join("")}</div>
  <div class="ppedbtns"><button class="optaction" id="rcCancel">${t("Cancel")}</button><button class="newlist" id="rcSaveBtn">${kept===1?tf("Save {n} price",{ n:kept }):tf("Save {n} prices",{ n:kept })}</button></div>
</div></div>`; }
function wireRcptSheet(){
  const close=()=>{ rcpt=null; render(); };
  const bg=app.querySelector("#rcBg"); if(bg) bg.onclick=e=>{ if(e.target===bg) close(); };
  const ok=app.querySelector("#rcOk"); if(ok) ok.onclick=close;
  const cc=app.querySelector("#rcCancel"); if(cc) cc.onclick=close;
  if(!rcpt || !rcpt.lines) return;
  app.querySelectorAll("[data-rcstore]").forEach(b=>{ b.onclick=()=>{ const id=b.dataset.rcstore;
    if(!id){ rcpt.store={ id:"", name:rcpt.detected }; render(); return; }
    const s=rcSavedStores().find(x=>x.id===id); if(s){ rcpt.store={ id:s.id, name:s.name }; render(); } }; });
  const dt=app.querySelector("#rcDate"); if(dt) dt.onchange=()=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(dt.value)) rcpt.date=dt.value; };   // no re-render
  app.querySelectorAll("[data-rckeep]").forEach(b=>{ b.onclick=()=>{ const L=rcpt.lines[+b.dataset.rckeep]; if(L){ L.keep=!L.keep; render(); } }; });
  app.querySelectorAll("[data-rcname]").forEach(inp=>{ inp.oninput=()=>{ const L=rcpt.lines[+inp.dataset.rcname]; if(L) L.name=inp.value; }; });   // no re-render: keep focus while typing (v1.45)
  /* v2.31: choosing which ticked item a line is — one item per line, so a line that had it gives it up */
  app.querySelectorAll("[data-rccart]").forEach(s=>{ s.onchange=()=>{ const L=rcpt.lines[+s.dataset.rccart]; if(!L) return;
    const k=s.value==="" ? null : +s.value;
    /* v2.72: the note follows the pairing too, and the reader's comes back on unpair */
    /* v2.73: an item takes up to its quantity of lines; past that, the line that had it longest gives it up */
    if(k!==null){ const others=rcpt.lines.filter(M=>M!==L && M.cart===k), capK=Math.max(1, Math.floor(+rcpt.cart[k].qty||1));
      others.slice(0, Math.max(0, others.length-capK+1)).forEach(M=>{ M.cart=null; M.how=""; M.name=M.read||M.name; if(M.readNote!==undefined) M.note=M.readNote; }); }
    if(L.readNote===undefined) L.readNote=L.note||"";
    L.cart=k; L.how=k===null ? "" : "you"; L.name=k===null ? (L.read||L.name) : rcpt.cart[k].name; L.note=k===null ? L.readNote : (rcpt.cart[k].note||""); render(); }; });
  const sv=app.querySelector("#rcSaveBtn"); if(sv) sv.onclick=rcSave;
}
/* Every failure the server can name gets a sentence that says what to do about it. A generic
   "couldn't read that" sends someone hunting in the wrong place — the whole reason the endpoint
   returns a code alongside its message. */
function planImpMessage(code){
  switch(code){
    case "signin":         return t("This phone isn't signed in yet. Check your connection and try again.");
    case "appcheck":       return t("The app couldn't prove it's the real app. Close it completely and open it again.");
    case "not_configured": return t("Recipe reading isn't set up yet — add a GEMINI_API_KEY (or GROQ_API_KEY) in Vercel (see docs/ai-setup.md). You can still type ingredients.");
    case "model":          return t("The recipe model is no longer available — set GEMINI_MODEL (or GROQ_MODEL) in Vercel (see docs/ai-setup.md).");
    /* v1.93: a queue and a spent allowance are not "couldn't read that" — one asks you to wait a
       moment, the other until tomorrow, and neither is the input's fault. */
    case "busy":            return t("The model is busy right now — give it a moment and try again.");
    case "quota":           return t("Today's free quota for this model is used up. It resets tomorrow, or set GEMINI_MODEL in Vercel to a model with more headroom (see docs/ai-setup.md).");
    case "vision_model":   return t("Reading photos needs a vision model set up (GROQ_VISION_MODEL — see docs/ai-setup.md). A link or pasted text works now.");
    case "bad_url": case "blocked_url": return t("That link can't be opened. Paste the recipe's web address.");
    case "not_a_page":     return t("That link isn't a web page.");
    case "no_caption":     return t("That TikTok's description doesn't list the ingredients — many put the recipe only in the video. Try pasting the ingredients as text.");
    case "fetch_failed":   return t("Couldn't read that page — some sites block it. Try pasting the recipe text instead.");
    case "bad_image": case "too_large": return t("That photo didn't work — try a closer, clearer shot.");
    case "too_long":       return t("That's a lot of text — paste just the recipe.");
    default:               return t("Couldn't read that — try pasting the recipe text instead.");
  }
}
/* v1.89: finding a recipe without leaving the app. The server answers from a real web search when one
   is configured and from the recipe reader's own knowledge when it is not — and says which, because a
   suggestion and a search result are not the same thing and the app should not pretend otherwise. */
async function planSearch(){
  if(!planAdd || planAdd.impBusy) return;
  const el=document.querySelector("#paImpVal");
  const q=((el && el.value) || planAdd.sq || "").trim();
  if(!q){ planAdd.impErr="Type what you want to cook."; render(); return; }
  planAdd.sq=q; planAdd.impBusy=true; planAdd.impErr=""; planAdd.sres=null; render();
  let res=null, data=null;
  try{ res=await apiFetch("/api/recipe-search",{ method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({q, scope:(planAdd.sscope||"web")}) }); }   // v2.05: the TikTok scope still exists server-side, unused by the app — every result links to TikTok anyway
  catch(e){ res=null; }
  if(!planAdd) return;
  planAdd.impBusy=false;
  if(!res){ planAdd.impErr="Couldn't reach the search. Check your connection."; render(); return; }
  try{ data=await res.json(); }catch(e){ data=null; }
  if(!res.ok){ planAdd.impErr=planSearchMessage(data && data.code); render(); return; }
  const raw=(data && Array.isArray(data.results)) ? data.results : [];
  planAdd.ssrc = (data && data.source==="web") ? "web" : "model";
  planAdd.sres = raw.map(r=>({ title:String((r&&r.title)||"").trim(),
                               url:String((r&&r.url)||"").trim(),
                               site:String((r&&r.site)||"").trim(),
                               note:String((r&&r.note)||"").trim() })).filter(r=>r.title);
  render();
}
function planSearchMessage(code){
  switch(code){
    case "no_results":      return t("Nothing found for that — try a different name.");
    case "search_key":      return t("Web search refused its key (TAVILY_API_KEY / SERPER_API_KEY / SEARCH_API_KEY — see docs/ai-setup.md).");
    /* v1.98: still reachable, but only when nothing at all is set up — no search key and no model,
       so there is nothing to list. (v1.96 used this to refuse TikTok outright; it no longer does.) */
    case "no_video_search": return t("Nothing is set up to search with yet — add a search key or a model key in Vercel (docs/ai-setup.md lists them). You can still paste a TikTok link.");
    case "signin":          return t("This phone isn't signed in yet. Check your connection and try again.");
    case "appcheck":        return t("The app couldn't prove it's the real app. Close it completely and open it again.");
    case "not_configured":  return t("Recipe reading isn't set up yet — add a GEMINI_API_KEY (or GROQ_API_KEY) in Vercel (see docs/ai-setup.md).");
    case "model":           return t("The recipe model is no longer available — set GEMINI_MODEL (or GROQ_MODEL) in Vercel (see docs/ai-setup.md).");
    /* v1.93: same two, said the same way, on the search path. */
    case "busy":            return t("The model is busy right now — give it a moment and try again.");
    case "quota":           return t("Today's free quota for this model is used up. It resets tomorrow, or set GEMINI_MODEL in Vercel to a model with more headroom (see docs/ai-setup.md).");
    case "too_long":        return t("That's a long one — try just the dish name.");
    default:                return t("Couldn't search just now — you can still paste a link or the text.");
  }
}
/* v1.86: link, photo and pasted text all come back as the same thing — a title and a list of
   ingredients — so they all land in the same place: the form, filled in, for you to check before
   anything is added. Nothing is written to a day or to the list here. */
async function planImport(payload){
  if(!planAdd) return;
  planAdd.impBusy=true; planAdd.impErr=""; render();
  let res=null, data=null;
  try{
    res=await apiFetch("/api/recipe", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
  }catch(e){ res=null; }
  if(!planAdd) return;
  if(!res){ planAdd.impBusy=false; planAdd.impErr="Couldn't reach the reader. Check your connection — you can still type ingredients."; render(); return; }
  try{ data=await res.json(); }catch(e){ data=null; }
  if(!res.ok){
    planAdd.impBusy=false;
    planAdd.impErr=planImpMessage(data && data.code);
    render(); return;
  }
  const allowed=catList().map(c=>c.id);
  const items=(data && Array.isArray(data.items)) ? data.items : [];
  const ing=items.map(it=>({ name:String((it&&it.name)||"").trim(),
                             cat:(it && allowed.includes(String(it.category))) ? String(it.category) : "",
                             qty:Math.max(1, Math.min(99, parseInt((it&&it.qty)||1,10)||1)),
                             weight:String((it&&it.weight)||"").trim().slice(0,24) }))
                 .filter(x=>x.name);
  planAdd.impBusy=false;
  if(!ing.length){ planAdd.impErr="No ingredients found in that."; render(); return; }
  planAdd.ing = planAdd.ing.concat(ing);
  if(!(planAdd.name||"").trim() && data && data.title) planAdd.name=String(data.title).slice(0,80);
  if(!planAdd.edit) planAdd.rid="";
  /* v2.01: keep the method, the servings and the source link. Steps only when there are some — an
     import while editing must not wipe the recipe's steps with nothing. */
  if(data && Array.isArray(data.steps) && data.steps.length) planAdd.steps=data.steps.map(x=>String(x)).slice(0,20);
  if(data && Number.isInteger(data.servings) && data.servings>0) planAdd.servings=data.servings;
  if(payload && typeof payload.url==="string" && /^https?:\/\//i.test(payload.url.trim())) planAdd.src=payload.url.trim();
  planAdd.imp=null; planAdd.impVal=""; planAdd.sres=null; planAdd.sq=""; planAdd.impErr="";
  planAdd.step="form";   // v2.03: a successful import moves on to the check-and-add step
  render();
}
function planAddSheet(){
  const isR = planAdd.kind==="recipe";
  const saved = planData().recipes;
  const dayName = new Date(planAdd.day+"T00:00:00").toLocaleDateString(dateLoc(),{weekday:"long"});
  const head = planAdd.edit ? t("Edit recipe") : (isR ? t("Add recipe") : t("Add food"));
  const fieldCSS = "width:100%;height:48px;padding:0 14px;border-radius:14px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:16px;box-sizing:border-box";
  const ingCSS   = "width:100%;height:46px;padding:0 14px;border-radius:14px;border:1.5px solid var(--line);outline:none;background:var(--card);color:var(--text);font-size:16px;box-sizing:border-box";
  /* v2.03: two steps. The one-screen sheet had eleven things on it — four import buttons, a search panel,
     every saved recipe, the meal, the name, servings, ingredients and Add — and focused the name field on
     open, so the keyboard came up over all of it. "choose" picks where the recipe comes from; "form" checks
     it and adds it. Food and edit mode go straight to the form, as before. Nothing is focused on open. */
  const step = (isR && !planAdd.edit) ? (planAdd.step || "choose") : "form";
  const CHEV = pts => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  const title = `<div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${step==="form" && isR && !planAdd.edit ? `<button class="paback" id="paBack" aria-label="${t("Back")}">${CHEV("10,3 5,8 10,13")}</button>` : ""}${esc(head)}${planAdd.edit?"":` · ${esc(dayName)}`}</div>`;
  /* The ways in — shared by the choose step and by edit mode (v1.89: editing offers them too, and an
     import while editing appends to the recipe being edited). */
  const imports = `
      <div class="pimprow">
        <button class="pimp${planAdd.imp==='search'?' on':''}" data-pimp="search">${SEARCH_SVG}<span>${t("Search")}</span></button>
        <button class="pimp${planAdd.imp==='link'?' on':''}" data-pimp="link">${LINK_SVG(16)}<span>${t("Link")}</span></button>
        <button class="pimp" data-pimp="photo">${CAMERA_SVG(16)}<span>${t("Photo")}</span></button>
        <button class="pimp${planAdd.imp==='paste'?' on':''}" data-pimp="paste">${PASTE_SVG(16)}<span>${t("Paste text")}</span></button>
      </div>
      <input id="paPhoto" type="file" accept="image/*" style="display:none" />
      ${planAdd.impBusy ? `<p class="pimpnote">${t("Reading the recipe…")}</p>` : ""}
      ${planAdd.impErr ? `<p class="pimpnote err">${esc(t(planAdd.impErr))}</p>` : ""}
      ${planAdd.imp==='link' ? `<div class="pimppanel">
          <input id="paImpVal" placeholder="${t("Paste a recipe link — a page or a TikTok")}" value="${esc(planAdd.impVal||"")}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="url" style="${ingCSS}" />
          <button class="pimpgo" id="paImpGo"${planAdd.impBusy?" disabled":""}>${t("Read it")}</button>
        </div>` : ""}
      ${planAdd.imp==='search' ? `${/* v1.96: the same search, pointed somewhere else; a tapped result is read through the caption path.
             v1.98: with no search key the TikTok scope offers dish ideas rather than refusing — each one
             carries a 🎵 to TikTok's own search, which is a link, not a lookup. */""}
        <div class="pimppanel">
          <input id="paImpVal" placeholder="${t("What do you want to cook?")}" value="${esc(planAdd.sq||"")}" autocomplete="off" autocapitalize="none" spellcheck="false" style="${ingCSS}" />
          <button class="pimpgo" id="paImpGo"${planAdd.impBusy?" disabled":""}>${t("Find")}</button>
        </div>
        ${Array.isArray(planAdd.sres) ? (planAdd.sres.length ? `
          ${/* v1.98: four honest cases — web results, TikTok results, and suggestions (no key), each
                naming the buttons that are actually there. */""}
          ${/* v2.00 item 3d: one clause each. The long versions named every button mid-sentence and
                wrapped to two lines above the results they were introducing; the buttons carry their own
                labels. The no-key line still has to say these are ideas rather than results — that is the
                honesty, not the length. */""}
          <p class="pimpnote">${planAdd.ssrc==='web' ? t('From the web — tap to read it in, or open it.') : t('No search key — these are ideas, not results. Tap to write one out, or go looking.')}</p>
          ${/* v1.94: the page opens in a new context so the phone\'s in-app browser handles it and Done
                comes back here. The URL is from a search engine, so it is untrusted: only http(s), and
                escaped. An iframe was rejected — recipe sites refuse to be framed. */""}
          <div class="presults">${planAdd.sres.map((r,i)=>{
            /* v1.95: a suggestion has no page of its own, so the open button searches for it instead of
               disappearing. The two cases stay distinct in what they promise: one opens THE page, the
               other goes looking for one.
               v1.98: two doors on every result, and neither needs a search key — these are links a
               finger follows, not fetches the page makes. That is the whole trick: a key is only
               needed to LIST results inside the app, never to send someone to a search. So even
               with nothing configured, a dish name is one tap from real TikTok videos or real
               pages. Each button says where it actually goes: the result's own page/video when it
               has one, a search for it when it does not. */
            const raw = String(r.url||"");
            const isTk = /^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(raw);
            const web  = (/^https?:\/\//i.test(raw) && !isTk) ? raw
                       : "https://duckduckgo.com/?q=" + encodeURIComponent(r.title + " recipe");
            const tok  = isTk ? raw
                       : "https://www.tiktok.com/search?q=" + encodeURIComponent(r.title + " recipe");
            const webL = (/^https?:\/\//i.test(raw) && !isTk) ? tf("Open {x}", { x:r.title }) : tf("Search the web for {x}", { x:r.title });
            const tokL = isTk ? tf("Watch {x} on TikTok", { x:r.title }) : tf("Find {x} on TikTok", { x:r.title });
            return `<div class="preswrap"><button class="presult" data-pres="${i}">
            <span class="pres-t">${esc(r.title)}</span>
            ${r.site?`<span class="pres-s">${esc(r.site)}</span>`:""}
            ${r.note?`<span class="pres-n">${esc(r.note)}</span>`:""}
          </button><a class="presopen" href="${esc(web)}" target="_blank" rel="noopener noreferrer" data-icon="web" aria-label="${esc(webL)}" title="${esc(webL)}">${GLOBE_SVG(17)}</a><a class="presopen" href="${esc(tok)}" target="_blank" rel="noopener noreferrer"${isTk?"":` data-tkq="${esc(r.title + " recipe")}"`} data-icon="tiktok" aria-label="${esc(tokL)}" title="${esc(tokL)}">${NOTE_SVG(17)}</a></div>`;
          }).join("")}</div>` : `<p class="pimpnote">${t("Nothing found for that.")}</p>`) : ""}` : ""}
      ${planAdd.imp==='paste' ? `<div class="pimppanel col">
          <textarea id="paImpVal" rows="5" placeholder="${t("Paste the recipe here — ingredients and all")}" style="width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid var(--line);outline:none;background:var(--card);color:var(--text);font-size:15px;box-sizing:border-box;resize:none">${esc(planAdd.impVal||"")}</textarea>
          <button class="pimpgo wide" id="paImpGo"${planAdd.impBusy?" disabled":""}>${t("Read it")}</button>
        </div>` : ""}
  `;
  if(step==="choose"){
    /* v2.05: "Your recipes" folds away and sorts A–Z (6-row cap kept) or by course (grouped, no cap). */
    const rOpen = recOpen(), rSort = recSort();
    const byName = (a,b)=>String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base"});
    const sorted = saved.slice().sort(byName);
    const shown = planAdd.allRecipes ? sorted : sorted.slice(0,6);
    const recRow = r=>`<div class="precline"><button class="precrow" data-precipe="${esc(r.id)}"><span class="precname">${esc(r.name)}</span>${planAdd.manage?`<span class="precedit">${t("Edit")}</span>`:CHEV("6,3 11,8 6,13")}</button>${planAdd.manage?`<button class="precdel" data-precdel="${esc(r.id)}" aria-label="${tf("Delete {x}", { x:esc(r.name) })}">×</button>`:""}</div>`;
    const recBody = rSort==="course"
      ? COURSES.map(([k,l])=>{ const g=sorted.filter(r=>recipeCourse(r)===k); return g.length ? `<p class="palabel recgroup">${esc(t(l))} · ${g.length}</p><div class="preclist">${g.map(recRow).join("")}</div>` : ""; }).join("")
      : `<div class="preclist">${shown.map(recRow).join("")}</div>
      ${(saved.length>6 && !planAdd.allRecipes) ? `<button class="patext" id="paAllRec" style="margin:-10px 0 12px">${tf("Show all {n} recipes", { n:saved.length })}</button>` : ""}`;
    /* v2.07: the ways in come first. With ten recipes grouped by course, the list pushed Search · Link · Photo · Paste text off the screen, and those are what a new recipe starts from. */
    return `<div class="sheet-bg kbpin" id="paBg"><div class="sheet" id="paSheet">
    ${title}
    ${planAdd.imp ? `<button class="patext" id="paBackChoose">${CHEV("10 4 6 8 10 12")} ${saved.length?t("Back to your recipes"):t("Back")}</button>` : `<p class="palabel">${t("New recipe")}</p>`}
    ${imports}
    ${planAdd.imp ? "" : `<button class="patext" id="paWrite" style="display:block;width:100%;text-align:center;margin-top:10px">${t("Write it yourself")}</button>`}
    ${(!planAdd.imp && saved.length) ? `<div class="palabelrow" style="margin-top:14px"><button id="paRecToggle" aria-expanded="${rOpen?'true':'false'}">${CHEV(rOpen?"4 6 8 10 12 6":"6 4 10 8 6 12")}<span>${t("Your recipes")}</span><span class="reccount">·&nbsp;${saved.length}</span></button>${rOpen?`<button class="patext" id="paManage">${planAdd.manage?t("Done"):t("Edit")}</button>`:""}</div>
      ${rOpen ? `<div class="recsort" role="group" aria-label="${t("Sort recipes")}"><button data-recsort="az" class="${rSort==='az'?'on':''}" aria-pressed="${rSort==='az'?'true':'false'}">A–Z</button><button data-recsort="course" class="${rSort==='course'?'on':''}" aria-pressed="${rSort==='course'?'true':'false'}">${t("Course")}</button></div>
      ${recBody}` : ""}` : ""}
  </div></div>`;
  }
  let srcHost = "";
  if(/^https?:\/\//i.test(planAdd.src||"")){ try{ srcHost = new URL(planAdd.src).hostname.replace(/^www\./,""); }catch(e){} }
  return `<div class="sheet-bg kbpin" id="paBg"><div class="sheet" id="paSheet">
    ${title}
    ${planAdd.edit ? imports : ""}
    ${(isR && srcHost) ? `<p class="pimpnote" style="margin:-6px 0 10px">${tf("From {x}", { x:esc(srcHost) })}</p>` : ""}
    ${mealSlotsOn() ? slotPicker("paslot", planAdd.slot||"") : ""}
    ${isR ? coursePicker("pacourse", planAdd.course || guessCourse(planAdd.name)) : ""}
    <input id="paName" placeholder="${isR?t('Recipe name'):t('What are you eating?')}" value="${esc(planAdd.name||"")}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" style="${fieldCSS}" />
    ${(isR && !planAdd.edit) ? `<div class="servrow" style="margin:12px 0 0"><span class="servlbl">${t("Serves")}</span>
      <div class="qstep2"><button data-paserv="-1" aria-label="${t("Fewer servings")}">−</button><span>${planAdd.serves||planAdd.servings||4}</span><button data-paserv="1" aria-label="${t("More servings")}">+</button></div></div>` : ""}
    ${isR?`<p class="palabel" style="margin-top:14px">${t("Ingredients")}</p>
      <div class="pingrow"><input id="paIngIn" placeholder="${t("Add an ingredient — “2 lb beef”")}" value="${esc(planAdd.q||"")}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" style="${ingCSS}" /><button class="pimpgo" id="paIngAdd" aria-label="${t("Add this ingredient")}">${t("Add")}</button></div>`:""}
    <div id="paDyn">${planDynHTML()}</div>
    <button class="newlist" id="paGo">${planAdd.edit ? t("Save recipe") : tf("Add to {x}", { x:esc(dayName) })}</button>
  </div></div>`;
}
/* v1.89: the same setting Settings has, offered where the button is. */
function fabMoveSheet(){
  return `<div class="sheet-bg" id="fabMoveBg"><div class="sheet" id="fabMoveSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:4px">${t("Where should + sit?")}</div>
    <p class="hint" style="text-align:left;margin:0 0 12px">${t("Also in Settings › Bars and overlays, with size and colour.")}</p>
    <div class="seg segfull">${Object.keys(SRCH_ALIGN).map(k=>
      `<button data-fabalign="${k}" class="${srchAlign()===k?'on':''}">${t(SRCH_ALIGN[k])}</button>`).join("")}</div>
  </div></div>`;
}
function planPickSheet(){
  const es = planEntries(planPick.day), e = es.find(x=>x.id===planPick.id);
  if(!e) return "";
  const r = e.kind==="recipe" ? recipeById(e.rid) : null;
  const n = r ? (r.ing||[]).length : 0;
  /* v2.01: a planned recipe carries its servings, where it came from and its method. Only an http(s)
     source is ever rendered as a link. */
  const src = (r && /^https?:\/\//i.test(String(r.src||""))) ? String(r.src) : "";
  let host = ""; if(src){ try{ host = new URL(src).hostname.replace(/^www\./,""); }catch(err){} }
  const steps = (r && Array.isArray(r.steps)) ? r.steps.filter(x=>String(x||"").trim()) : [];
  const ns = steps.length;
  /* v2.08: the ingredients fold behind their own button, under Method, and there is no Edit here any
     more (the household's call). The order choice stays inside the fold. */
  let ingHTML = "";
  if(r && n){
    const list = (r.ing||[]).map(planIngNorm);
    const li = x=>{ const cid=ingCatId(x), c=CAT(cid)||{}; const em=itemIcon(x.name, cid); const amt=showAmt(planIngAmt(x));
      return `<li class="pping">${em?`<span class="ppingico" aria-hidden="true" style="color:${c.color||"inherit"}">${em}</span>`:""}<span class="ppingname">${esc(cap(x.name))}</span>${amt?`<span class="ppingamt">${esc(amt)}</span>`:""}</li>`; };
    const ids = catList().map(c=>c.id);
    const body = ingSort()==="cat"
        ? catList().map(c=>{ const g=list.filter(x=>ingCatId(x)===c.id); return g.length ? `<p class="palabel recgroup">${esc(catLabel(c))} · ${g.length}</p><ul class="ppings">${g.map(li).join("")}</ul>` : ""; }).join("")
          + (()=>{ const g=list.filter(x=>!ids.includes(ingCatId(x))); return g.length ? `<p class="palabel recgroup">${t("Others")} · ${g.length}</p><ul class="ppings">${g.map(li).join("")}</ul>` : ""; })()
        : `<ul class="ppings">${list.map(li).join("")}</ul>`;
    ingHTML = `<button class="optaction" id="ppIng" aria-expanded="${planPick.ing?'true':'false'}">${t("Ingredients")} · ${n}</button>
      ${planPick.ing ? `<div class="ppingpanel">${n>1 ? `<div class="recsort" role="group" aria-label="${t("Order ingredients")}"><button data-ppingsort="recipe" class="${ingSort()==='recipe'?'on':''}" aria-pressed="${ingSort()==='recipe'?'true':'false'}">${t("Recipe order")}</button><button data-ppingsort="cat" class="${ingSort()==='cat'?'on':''}" aria-pressed="${ingSort()==='cat'?'true':'false'}">${t("Category")}</button></div>` : ""}${body}</div>` : ""}`;
  }
  return `<div class="sheet-bg" id="ppBg"><div class="sheet" id="ppSheet">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${e.emoji?esc(e.emoji)+" ":""}${esc(r ? (r.name||e.name) : e.name)}</div>
    ${mealSlotsOn() ? slotPicker("ppslot", e.slot||"") : ""}
    ${r ? coursePicker("ppcourse", recipeCourse(r)) : ""}
    ${r ? `<div class="servrow"><span class="servlbl">${t("Serves")}</span>
      <div class="qstep2"><button data-ppserv="-1" aria-label="${t("Fewer servings")}">−</button><span>${e.serves||r.servings||4}</span><button data-ppserv="1" aria-label="${t("More servings")}">+</button></div></div>
    <div class="ppserves-note">${tf("as written it serves {n}", { n:esc(String(r.servings||4)) })}</div>` : ""}
    ${src ? `<a class="optaction ppsrc" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${GLOBE_SVG(16)}<span>${t("Open link")}</span></a><div class="ppsrcname">${esc(host||src)}</div>` : ""}
    ${ns ? `<button class="optaction" id="ppMethod" aria-expanded="${planPick.method?'true':'false'}">${t("Method")} · ${ns===1?t("1 step"):tf("{n} steps", { n:ns })}</button>
      ${planPick.method ? `<ol class="ppsteps">${steps.map(x=>`<li>${esc(String(x))}</li>`).join("")}</ol>` : ""}` : ""}
    ${ingHTML}
    ${r && n ? `<button class="optaction" id="ppList">${t("Add to shopping list")}</button>`
             : `<button class="optaction" id="ppList">${t("Add to the shopping list")}</button>`}
    <button class="optaction" id="ppDel" style="border-color:#C24A33;color:#C24A33">${t("Remove from this day")}</button>
  </div></div>`;
}
/* v2.01: the whole week's shopping in one review — every planned meal, scaled to its servings,
   duplicates merged, and anything the pantry says is probably had left unticked. */
function planWeekToList(){
  const allowed=catList().map(c=>c.id);
  const rows=[], byKey={}; let meals=0;
  for(const k of planWeekKeys(planWeek)){
    for(const e of planEntries(k)){ meals++;
      const r = e.kind==="recipe" ? recipeById(e.rid) : null;
      let add;
      if(r && (r.ing||[]).length){
        const f = e.serves ? e.serves/(r.servings||4) : 1;   // same default the pick sheet shows
        add = r.ing.map(planIngNorm).map(x=>x.weight   // the amount scales, or else the count — never both
          ? { name:x.name, cat:x.cat, qty:x.qty, weight:scaleAmt(x.weight, f) }
          : { name:x.name, cat:x.cat, qty:Math.max(1, Math.round(x.qty*f)), weight:"" });
      } else add = [{ name:e.name||(r&&r.name)||"", cat:e.cat||"", qty:1, weight:"" }];
      for(const x of add){ const nm=String(x.name||"").trim(); if(!nm) continue; const key=nm.toLowerCase();
        const cur=byKey[key];
        if(!cur){ byKey[key]={ name:nm, cats:[x.cat||""], qty:x.qty, weight:x.weight||"" }; rows.push(byKey[key]); }
        /* An amount already says how much: "1 kg" + "500 g" is one line of 1.5 kg, not 2 × 1.5 kg.
           Counts add up only when neither side carries an amount. */
        else { if(cur.weight || x.weight){ cur.weight=mergeAmt(cur.weight, x.weight); cur.qty=Math.max(cur.qty, x.qty); }
               else cur.qty+=x.qty;
               cur.cats.push(x.cat||""); } }
    }
  }
  if(!rows.length) return;
  smartItems = rows.map(x=>{
    const c0 = x.cats.find(c=>c && allowed.includes(c));
    const known = knownEntry(x.name);
    const ai = c0 || ((known && known.cat) || "others"), mapped = newCat(ai, x.name);
    const cat = allowed.includes(mapped) ? mapped : (allowed.includes(ai) ? ai : "others");
    const q = Math.min(999, x.qty);
    return markHave({ name:x.name, qty:q, baseQty:q, weight:x.weight, baseWeight:x.weight, sub:"", category:cat, sel:true });
  });
  smartTitle = weekLabel(planWeek) + " — " + (meals===1 ? t("1 meal") : tf("{n} meals", { n:meals }));
  smartServings = null; smartOpen = true; smartLoading = false; smartError = ""; smartEdit = null; smartWOpen = null; smartCOpen = null;
  render();
}
function wirePlanTab(){ wireSiri(); wireVoice();   // v2.62: the Siri / no-list sheets render here too

  const lsw=app.querySelector("#listSwitch"); if(lsw) lsw.onclick=()=>{ listsOpen=true; render(); };
  const pwh=app.querySelector("#pwHint"); if(pwh) pwh.onclick=()=>{ const b=app.querySelector('.pdmore[data-pd="'+pwh.dataset.pd+'"]'); if(b) b.click(); };   // v2.16
  const pv=app.querySelector("#pwPrev"); if(pv) pv.onclick=()=>{ planWeek--; render(); };
  const nx=app.querySelector("#pwNext"); if(nx) nx.onclick=()=>{ planWeek++; render(); };
  const nw=app.querySelector("#pwNow");  if(nw) nw.onclick=()=>{ planWeek=0; render(); };
  const mo=app.querySelector("#pwMore"); if(mo) mo.onclick=()=>{ planWeekOpen=true; render(); };
  const tl=app.querySelector("#pwToList"); if(tl) tl.onclick=planWeekToList;
  const pwBg=app.querySelector("#pwBg"); if(pwBg) pwBg.onclick=e=>{ if(e.target===pwBg){ planWeekOpen=false; render(); } };
  const pwS=app.querySelector("#pwSave"); if(pwS) pwS.onclick=()=>{
    if(!planWeekCount(planWeek)) return;
    const nm=prompt("Name this plan", weekLabel(planWeek));
    if(nm===null) return;
    const t=String(nm).trim(); if(!t) return;
    planSaveWeek(planWeek, t); planWeekOpen=false; render(); };
  const pwC=app.querySelector("#pwClear"); if(pwC) pwC.onclick=()=>{
    const n=planWeekCount(planWeek); if(!n) return;
    if(!confirm(`Clear ${weekLabel(planWeek)}? That removes ${n} meal${n===1?"":"s"}.`)) return;
    planClearWeek(planWeek); planWeekOpen=false; render(); };
  app.querySelectorAll("[data-pwapply]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.pwapply, n=planWeekCount(planWeek);
    if(n && !confirm(`Apply this plan to ${weekLabel(planWeek)}? It replaces the ${n} meal${n===1?"":"s"} already there.`)) return;
    planApplySaved(id, planWeek); planWeekOpen=false; render(); });
  app.querySelectorAll("[data-pwdel]").forEach(b=>b.onclick=()=>{
    const pl=planData().saved.find(x=>x.id===b.dataset.pwdel);
    if(!confirm(`Delete the saved plan “${pl?pl.name:""}”?`)) return;
    planDeleteSaved(b.dataset.pwdel); render(); });
  app.querySelectorAll("[data-pd]").forEach(b=>b.onclick=()=>{ planMenu=b.dataset.pd; render(); });
  /* v2.07: one tap opens the entry. The v1.84 press-and-hold that opened a recipe for editing is gone,
     at the household's request: the tap sheet now shows the course, where the recipe came from and its
     ingredients, and edits them in place. */
  app.querySelectorAll("[data-pchip]").forEach(b=>{ const [day,id]=b.dataset.pchip.split("|");
    b.oncontextmenu=e=>e.preventDefault();
    b.onclick=()=>{ planPick={day,id}; render(); };
  });

  const pmBg=app.querySelector("#pmBg"); if(pmBg) pmBg.onclick=e=>{ if(e.target===pmBg){ planMenu=null; render(); } };
  const pmR=app.querySelector("#pmRecipe"); if(pmR) pmR.onclick=()=>{ planAdd={day:planMenu,kind:"recipe",name:"",ing:[],rid:"",edit:false,step:"choose",manage:false,allRecipes:false,q:"",imp:null,impVal:"",impBusy:false,impErr:"",sq:"",sres:null,ssrc:"",sscope:"web",src:"",steps:[],servings:0,slot:mealSlotsOn()?"dinner":"",serves:0,course:""}; planMenu=null; render(); };
  const pmF=app.querySelector("#pmFood");   if(pmF) pmF.onclick=()=>{ planAdd={day:planMenu,kind:"food",name:"",ing:[],rid:"",edit:false,q:"",cat:"",emoji:"",slot:mealSlotsOn()?"dinner":""}; planMenu=null; render(); };

  const paBg=app.querySelector("#paBg"); if(paBg) paBg.onclick=e=>{ if(e.target===paBg){ planAdd=null; render(); } };
  app.querySelectorAll("[data-paslot]").forEach(b=>b.onclick=()=>{ if(!planAdd) return; const k=b.dataset.paslot;
    planAdd.slot = (planAdd.slot===k) ? "" : k; render(); });
  app.querySelectorAll("[data-pacourse]").forEach(b=>b.onclick=()=>{ if(!planAdd) return;
    planAdd.course=b.dataset.pacourse; render(); });   // v2.05: a recipe always has a course — no toggle-off
  app.querySelectorAll("[data-paserv]").forEach(b=>b.onclick=()=>{ if(!planAdd) return;
    const cur=planAdd.serves||planAdd.servings||4;
    planAdd.serves=Math.max(1, Math.min(99, cur+(+b.dataset.paserv))); render(); });
  const paN=app.querySelector("#paName");
  /* v2.03: only food focuses its name — a recipe sheet raised the keyboard over everything on open. */
  if(paN){ if(planAdd.kind==="food" && !planAdd.edit && !planAdd.name) paN.focus();
    /* v1.45: a render tears a focused field out of the document and drops the keyboard, so typing only
       updates the draft and refreshes the ONE block that depends on it — never the page. */
    paN.oninput=()=>{ planAdd.name=paN.value; if(planAdd.kind!=="recipe") refreshPlanDyn(); };
    paN.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); planCommitAdd(); } }; }
  const paI=app.querySelector("#paIngIn");
  /* v1.94: one path for Enter and for the Add button, so the button is not a second, subtly
     different way of doing the same thing. A render would take the focused field with it, so this
     refreshes the one block that changed. */
  const paIngCommit=()=>{ if(!planAdd || !paI) return;
    const ing=planIngFromText(paI.value); if(!ing) return;
    planAdd.ing.push(ing); planAdd.q=""; paI.value=""; refreshPlanDyn(); paI.focus(); };
  if(paI){ paI.oninput=()=>{ planAdd.q=paI.value; refreshPlanDyn(); };
    paI.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); paIngCommit(); } }; }
  const paIA=app.querySelector("#paIngAdd");
  if(paIA){ paIA.onpointerdown=e=>e.preventDefault(); paIA.onclick=paIngCommit; }
  const paG=app.querySelector("#paGo"); if(paG){ paG.onpointerdown=e=>e.preventDefault(); paG.onclick=planCommitAdd; }
  app.querySelectorAll("[data-pimp]").forEach(b=>b.onclick=()=>{
    if(!planAdd || planAdd.impBusy) return;
    const k=b.dataset.pimp;
    if(k==="photo"){ const f=app.querySelector("#paPhoto"); if(f) f.click(); return; }
    planAdd.imp = (planAdd.imp===k) ? null : k; planAdd.impVal=""; planAdd.impErr=""; render(); });
  const paPh=app.querySelector("#paPhoto");
  if(paPh) paPh.onchange=()=>{ const file=paPh.files && paPh.files[0]; if(!file || !planAdd) return;
    planAdd.impBusy=true; planAdd.impErr=""; render();
    planShrinkImage(file, 1400, 0.72)
      .then(img=>planImport({ image:img }))
      .catch(()=>{ if(planAdd){ planAdd.impBusy=false; planAdd.impErr="Couldn't open that photo."; render(); } }); };
  const paIV=app.querySelector("#paImpVal");
  if(paIV){ paIV.focus();
    /* v1.45 again: typing must not re-render, or the field is torn out and the keyboard goes with it. */
    paIV.oninput=()=>{ if(planAdd.imp==="search") planAdd.sq=paIV.value; else planAdd.impVal=paIV.value; };
    paIV.onkeydown=e=>{ if(e.key==="Enter" && planAdd.imp==="search"){ e.preventDefault(); planSearch(); return; }
      if(e.key==="Enter" && planAdd.imp==="link"){ e.preventDefault(); planImpGo(); } }; }
  const paIG=app.querySelector("#paImpGo"); if(paIG){ paIG.onpointerdown=e=>e.preventDefault();
    paIG.onclick=()=>(planAdd && planAdd.imp==="search") ? planSearch() : planImpGo(); }
  /* v1.99: TikTok drops the query when a tiktok.com/search link hands off to the installed app —
     it opens its search screen with an empty box, so the dish has to be typed again. No URL shape
     survives that handoff reliably, and a custom app scheme fails with nothing to fall back to when
     the app is absent. Copying is the move that works either way: the link still opens TikTok, and
     the dish is already on the clipboard for one paste. Only on the SEARCH links — a real video has
     nothing to paste. */
  app.querySelectorAll("[data-tkq]").forEach(a=>a.addEventListener("click", ()=>{
    const q=a.dataset.tkq||""; if(!q) return;
    const said=()=>showToast(tf("Copied “{x}” — paste it into TikTok's search", { x:q }));
    try{
      if(hasClipboard()){ copyText(q).then(said, ()=>{}); return; }
      const t=document.createElement("textarea"); t.value=q;
      t.setAttribute("readonly",""); t.style.position="fixed"; t.style.opacity="0";
      document.body.appendChild(t); t.select();
      const okc=document.execCommand("copy"); document.body.removeChild(t);
      if(okc) said();
    }catch(e){}   // the link still opens; a failed copy just means typing it, as before
  }));
  app.querySelectorAll("[data-pres]").forEach(b=>b.onclick=()=>{
    if(!planAdd || planAdd.impBusy) return;
    const r=(planAdd.sres||[])[+b.dataset.pres]; if(!r) return;
    /* A web result is a page to read; a suggestion has no page, so the reader is asked to write that
       dish out. Either way it lands in the same form, for checking before anything is added. */
    planImport(r.url ? { url:r.url } : { dish:r.title });
  });
  /* v1.84: picking a saved recipe FILLS the form — its name into the field, its ingredients below it —
     and stays put. Nothing returns to the plan until Add is pressed, so what is about to be added can
     be read and changed first. The name input is written directly rather than re-rendered, so the
     keyboard survives. */
  app.querySelectorAll("[data-precipe]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ const r=recipeById(b.dataset.precipe); if(!r || !planAdd) return;
      /* v2.08: in Edit mode a tap opens the recipe itself for editing — the v1.89 editor, which the plan
         sheet's hold (v1.84) and then its Edit (v2.07) used to open. */
      if(planAdd.manage){ planAdd={ day:planAdd.day, kind:"recipe", name:r.name, ing:(r.ing||[]).map(planIngNorm), rid:r.id, edit:true, step:"form", manage:false, allRecipes:false, src:r.src||"", steps:Array.isArray(r.steps)?r.steps.slice():[], servings:+r.servings||0, q:"", imp:null, impVal:"", impBusy:false, impErr:"", sq:"", sres:null, ssrc:"", sscope:"web", slot:"", serves:0, course:r.course||"" }; render(); return; }
      planAdd.name=r.name; planAdd.rid=r.id; planAdd.ing=(r.ing||[]).map(planIngNorm); planAdd.q="";
      planAdd.src=r.src||""; planAdd.steps=Array.isArray(r.steps)?r.steps.slice():[]; planAdd.servings=+r.servings||0;   // v2.01
      planAdd.course=r.course||"";   // v2.05
      planAdd.step="form"; render(); }; });   // v2.03: the fields live on the form step
  const paRT=app.querySelector("#paRecToggle"); if(paRT) paRT.onclick=()=>{ if(!planAdd) return;
    const open=!recOpen(); setRecOpen(open); if(!open) planAdd.manage=false; render(); };
  app.querySelectorAll("[data-recsort]").forEach(b=>b.onclick=()=>{ if(!planAdd) return; setRecSort(b.dataset.recsort); render(); });
  const paMg=app.querySelector("#paManage"); if(paMg) paMg.onclick=()=>{ if(!planAdd) return; planAdd.manage=!planAdd.manage; render(); };
  const paAR=app.querySelector("#paAllRec"); if(paAR) paAR.onclick=()=>{ if(!planAdd) return; planAdd.allRecipes=true; render(); };
  const paWr=app.querySelector("#paWrite"); if(paWr) paWr.onclick=()=>{ if(!planAdd) return; planAdd.step="form"; render(); };
  const paBk=app.querySelector("#paBack"); if(paBk) paBk.onclick=()=>{ if(!planAdd) return; planAdd.step="choose"; render(); };
  const paBC=app.querySelector("#paBackChoose"); if(paBC) paBC.onclick=()=>{ if(!planAdd) return; planAdd.imp=null; planAdd.sres=null; planAdd.impErr=""; render(); };
  app.querySelectorAll("[data-precdel]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>{ const id=b.dataset.precdel; const r=recipeById(id); if(!r) return;
      if(!confirm('Delete the recipe "'+r.name+'"?\n\nDays it is already on keep it.')) return;
      planDeleteRecipe(id); render(); }; });
  wirePlanDyn();

  const ppBg=app.querySelector("#ppBg"); if(ppBg) ppBg.onclick=e=>{ if(e.target===ppBg){ planPick=null; render(); } };
  const ppM=app.querySelector("#ppMethod"); if(ppM) ppM.onclick=()=>{ if(!planPick) return; planPick.method=!planPick.method; render(); };
  const ppI=app.querySelector("#ppIng"); if(ppI) ppI.onclick=()=>{ if(!planPick) return; planPick.ing=!planPick.ing; render(); };   // v2.08
  /* v2.07: the recipe sheet — course and ingredient order. (v2.08: no editing here; see [data-precipe].) */
  const ppRecipe=()=>{ if(!planPick) return null; const e=planEntries(planPick.day).find(x=>x.id===planPick.id);
    return (e && e.kind==="recipe") ? recipeById(e.rid) : null; };
  app.querySelectorAll("[data-ppcourse]").forEach(b=>b.onclick=()=>{ const r=ppRecipe(); if(!r) return;
    planSaveRecipe(Object.assign({}, r, { course:b.dataset.ppcourse })); render(); });   // Object.assign keeps every other field (the fixed-shape trap)
  app.querySelectorAll("[data-ppingsort]").forEach(b=>b.onclick=()=>{ setIngSort(b.dataset.ppingsort); render(); });
  app.querySelectorAll("[data-ppslot]").forEach(b=>b.onclick=()=>{ if(!planPick) return;
    const e=planEntries(planPick.day).find(x=>x.id===planPick.id); if(!e) return; const k=b.dataset.ppslot;
    planUpdateEntry(planPick.day, planPick.id, { slot: e.slot===k ? "" : k }); render(); });
  app.querySelectorAll("[data-ppserv]").forEach(b=>b.onclick=()=>{ if(!planPick) return;
    const e=planEntries(planPick.day).find(x=>x.id===planPick.id); if(!e) return;
    const r=e.kind==="recipe" ? recipeById(e.rid) : null; if(!r) return;
    const cur=e.serves||r.servings||4;
    planUpdateEntry(planPick.day, planPick.id, { serves: Math.max(1, Math.min(99, cur+(+b.dataset.ppserv))) }); render(); });
  const ppD=app.querySelector("#ppDel"); if(ppD) ppD.onclick=()=>{ const p=planPick; planPick=null; planRemoveEntry(p.day,p.id); render(); };
  const ppL=app.querySelector("#ppList"); if(ppL) ppL.onclick=()=>{
    const es=planEntries(planPick.day), e=es.find(x=>x.id===planPick.id);
    if(!e){ planPick=null; render(); return; }
    const r = e.kind==="recipe" ? recipeById(e.rid) : null;
    /* v1.85: a recipe is several things at once, and some of them are already in the cupboard — so it
       goes through the same review sheet Smart add uses, where each ingredient can be turned off before
       anything is written. A single planned food is one item and needs no ceremony. */
    if(r && (r.ing||[]).length){
      const allowed=catList().map(c=>c.id);
      smartItems = r.ing.map(planIngNorm).map(x=>{
        const known = knownEntry(x.name);
        const ai = allowed.includes(x.cat) ? x.cat : ((known && known.cat) || "others"), mapped = newCat(ai, x.name);
        const cat = allowed.includes(mapped) ? mapped : (allowed.includes(ai) ? ai : "others");
        /* v1.94: the amount travels with the ingredient. It was hardcoded to one-of-each and no
           weight, so a recipe asking for 2lb of beef and 3 onions arrived as "beef" and "onion". */
        return markHave({ name:x.name, qty:x.qty, baseQty:x.qty, sub:"", category:cat, weight:x.weight, baseWeight:x.weight, sel:true });
      });
      /* v2.01: the entry's servings travel with it — the rows hold the recipe as written and the
         factor is applied once, here, the same way the scaler applies it. */
      smartTitle = r.name || ""; smartServings = { src: r.servings||4, target: e.serves||r.servings||4 };
      applyServingsScale();
      smartOpen = true; smartLoading = false; smartError = ""; smartEdit = null; smartWOpen = null; smartCOpen = null;
      planPick = null; render(); return;
    }
    addEntries(e.name, e.cat || null); save();
    planPick=null; render(); showToast("Added to the list"); };

  const cn=app.querySelector("#cartNavP"); if(cn) cn.onclick=()=>gotoPage(1);
  const st=app.querySelector("#setNavP"); if(st) st.onclick=()=>{ settingsFrom=0; gotoPage(2); };
  wireListsSheet();
  wireSmartSheet();
  wireRcptSheet(); wireTenSheet(); wireCmp(); wireOcc(); wireSpend(); wireLook(); wireAisleMap(); wireShopMenu(); wirePriceDiag(); wireCards(); wireStuck(); wireBaNew(); wireLocDiag(); wireRptSheet(); wireRstSheet();
  wireUserTiles();
}
/* v1.90: a recipe page shared into the app. Android hands it over directly through the manifest's
   share_target (?title=/?text=/?url=); iOS cannot register a PWA as a share target at all, so there the
   route is a Shortcut that opens ?import=<url>. Same door, two ways of knocking — and either way the
   app lands on the plan with the importer already running. */
function sharedRecipeURL(){
  const raw = params.get("import") || params.get("url") || params.get("text") || "";
  if(!raw) return "";
  /* A shared "text" is usually a sentence with the link inside it, not a bare URL. */
  const m = String(raw).match(/https?:\/\/[^\s"'<>]+/);
  if(!m) return "";
  try{ const u=new URL(m[0]);
    if(u.protocol!=="http:" && u.protocol!=="https:") return "";
    return u.toString(); }catch(e){ return ""; }
}
function takeSharedRecipe(){
  const u = sharedRecipeURL(); if(!u) return;
  /* Strip it out of the address bar before doing anything with it: a reload must not import the same
     page a second time, and the link is not ours to keep in a URL people may share onward. */
  try{ ["import","url","text","title"].forEach(k=>params.delete(k));
       const q=params.toString();
       history.replaceState(null, "", location.pathname + (q?("?"+q):"")); }catch(e){}
  /* v1.90: gated on having a name, not on Firebase. The plan is written through save(), which already
     keeps a local-only install working without a database — so a device that has never been pointed at
     Firebase can still import a recipe. Guarding on `configured` would have refused them for no reason,
     and would have made this whole path untestable, since the suites run local-only by design. */
  if(!me) return;                  // not set up yet — there is nothing to import into
  optOpen=false; listsOpen=false; view="plan"; planWeek=0;
  planAdd = { day:dayKey(new Date()), kind:"recipe", name:"", ing:[], rid:"", edit:false, step:"choose", manage:false, allRecipes:false, q:"",
              imp:"link", impVal:u, impBusy:false, impErr:"", sq:"", sres:null, ssrc:"", sscope:"web", src:"", steps:[], servings:0, slot:"", serves:0, course:"" };
  render();
  planImport({ url:u });
}
function planImpGo(){
  if(!planAdd || planAdd.impBusy) return;
  const el=document.querySelector("#paImpVal");
  const v=((el && el.value) || planAdd.impVal || "").trim();
  if(!v){ planAdd.impErr="Nothing to read yet."; render(); return; }
  planImport(planAdd.imp==="link" ? { url:v } : { text:v });
}
function planCommitAdd(){
  if(!planAdd) return;
  const nm=(planAdd.name||"").trim();
  const ing=(planAdd.ing||[]).map(planIngNorm);
  if(!nm){ planAdd=null; render(); return; }
  const day=planAdd.day;
  if(planAdd.kind==="recipe"){
    /* v1.84: editing writes back to the recipe and stops — the days that reference it show its name
       through recipeById(), so every day it is on follows the rename without touching their entries. */
    /* v2.01: both paths used to rebuild the recipe as { id, name, emoji, ing } — the fixed-shape trap
       (see writePlan / planIngNorm), which would silently drop servings, src and steps. Start from the
       existing recipe so an edit that did not re-import keeps its source, method and servings. */
    const rid = planAdd.rid || ("pr"+Date.now().toString(36));
    const prev = recipeById(rid) || {};
    planSaveRecipe({ id:rid, name:nm, emoji:"", ing, servings: planAdd.servings || prev.servings || 4,
                     src: planAdd.src || prev.src || "",
                     steps: (planAdd.steps && planAdd.steps.length) ? planAdd.steps : (prev.steps||[]),
                     course: planAdd.course || prev.course || guessCourse(nm) });   // v2.05
    if(planAdd.edit){ planAdd=null; render(); return; }
    planAddEntry(day, { id:"pe"+Date.now().toString(36), kind:"recipe", name:nm, emoji:"", rid,
                        slot: planAdd.slot||"", serves: planAdd.serves||0 });
  } else {
    planAddEntry(day, { id:"pe"+Date.now().toString(36), kind:"food", name:nm,
                        emoji:planAdd.emoji||"", cat:planAdd.cat||"", slot: planAdd.slot||"" });
  }
  planAdd=null; render();
}
/* LEGACY / UNREACHABLE: the pre-v1.15 plan page. Nothing calls this pair — the Plan TAB added in v1.82
   is renderPlanTab()/wirePlanTab(), just above this. Left in place rather than deleted so this version is
   only the new feature; it is dead weight and a candidate for removal on its own. */
function renderPlanPage(){
  const psm = (displayFor()==="cat" && sortModeFor()==="location") ? "cat" : sortModeFor();
  let planBody;
  if(psm==="cat" && displayFor()==="flat"){
    const all = state.items.map(i=>({it:i})).sort((A,B)=>bySortKey(A.it,B.it));
    const html = all.map(({it})=> planFilledPill(it,CAT(it.cat)) ).join("");
    planBody = all.length ? `<section class="cat"><div class="pills">${html}</div></section>` : "";
  } else if(displayFor()==="cat"){
    const alpha = sortModeFor()==="alpha";                                   // A–Z sorts ALL items in each category by name (ignoring subcategory)
    const byName = (a,b)=>(a.name||"").localeCompare(b.name||"");
    planBody = catList().map(cat=>{
      let inList = state.items.filter(i=>catShown(i.cat)===cat.id);
      const total = inList.length;
      if(!total && !cat.custom) return "";
      const collapsed = (collapse.planCats||[]).includes(cat.id);
      const catAdd = catEntry===cat.id ? `<div class="catadd">
          <div class="inwrap"><textarea id="catInput" rows="1" placeholder="${esc(tf("Add to {x}", { x:catLabel(cat) }))}" style="border:2px solid ${cat.color}"></textarea><button class="clearbtn" id="catClear" aria-label="${t("Clear")}">×</button></div>
          <button id="catAddBtn" style="background:${cat.color}">+</button></div>${catSuggest(cat)}` : "";
      const merged = inList.map(i=>({it:i})).sort((A,B)=> alpha ? byName(A.it,B.it) : bySortKey(A.it,B.it));
      const pills = merged.map(({it})=> planFilledPill(it,cat)).join("");
      const chead = CALM_THEMES.has(theme)
        ? calmHead(cat, inList.filter(i=>i.checked).length, inList.length, collapsed, "data-planc", catEntry===cat.id)
        : `<div class="chead"><button class="lbl catheadchip" data-planc="${cat.id}" style="background:${cat.color};border:1.5px solid ${cat.color};color:#fff;width:100%"><span class="cemoji">${catIcon(cat,16)}</span><span class="cname" style="color:#fff">${esc(catLabel(cat))}</span><span class="cnum" style="color:#fff;opacity:.85">${inList.length}/${total}${collapsed?' ▸':''}</span></button>
        <button class="plus" data-add="${cat.id}" style="${catEntry===cat.id?`background:${cat.color};color:#fff`:''}">${catEntry===cat.id?'×':'+'}</button></div>`;
      return `<section class="cat">${chead}${catAdd}
        ${collapsed?"":`<div class="pills" style="margin-top:6px">${pills}</div>`}</section>`;
    }).join("");
  } else if(psm==="auto"){
    planBody = catList().map(cat=>{
      const inList = state.items.filter(i=>catShown(i.cat)===cat.id);
      const total = inList.length;
      if(!total && !cat.custom) return "";
      const collapsed = (collapse.planCats||[]).includes(cat.id);
      const catAdd = catEntry===cat.id ? `<div class="catadd">
          <div class="inwrap"><textarea id="catInput" rows="1" placeholder="${esc(tf("Add to {x}", { x:catLabel(cat) }))}" style="border:2px solid ${cat.color}"></textarea><button class="clearbtn" id="catClear" aria-label="${t("Clear")}">×</button></div>
          <button id="catAddBtn" style="background:${cat.color}">+</button></div>${catSuggest(cat)}` : "";
      const combined = inList.map(i=>({it:i})).sort((A,B)=>bySortKey(A.it,B.it));
      const html = combined.map(({it})=> planFilledPill(it,CAT(it.cat)) ).join("");
      const chead = CALM_THEMES.has(theme)
        ? calmHead(cat, inList.filter(i=>i.checked).length, inList.length, collapsed, "data-planc", catEntry===cat.id)
        : `<div class="chead"><button class="lbl catheadchip" data-planc="${cat.id}" style="background:${cat.color};border:1.5px solid ${cat.color};color:#fff;width:100%"><span class="cemoji">${catIcon(cat,16)}</span><span class="cname" style="color:#fff">${esc(catLabel(cat))}</span><span class="cnum" style="color:#fff;opacity:.85">${inList.length}/${total}${collapsed?' ▸':''}</span></button>
        <button class="plus" data-add="${cat.id}" style="${catEntry===cat.id?`background:${cat.color};color:#fff`:''}">${catEntry===cat.id?'×':'+'}</button></div>`;
      return `<section class="cat">${chead}${catAdd}
        ${collapsed?"":`<div class="pills" style="margin-top:6px">${html}</div>`}</section>`;
    }).join("");
  } else if(psm==="location"){
    ensureLocCheck(); const cmp=locActive()?byAisle:bySortKey;
    const all = state.items.map(i=>({it:i})).sort((A,B)=>cmp(A.it,B.it));
    const html = all.map(({it})=> planFilledPill(it,CAT(it.cat)) ).join("");
    planBody = all.length ? `<section class="cat"><div class="pills">${html}</div></section>` : "";
  } else {
    let inList = state.items.slice().sort((a,b)=>a.name.localeCompare(b.name));
    const filled = inList.map(i=>planFilledPill(i, CAT(i.cat))).join("");
    planBody = filled ? `<section class="cat"><div class="pills">${filled}</div></section>` : "";
  }
  const hasAny = catList().some(c=> state.items.some(i=>catShown(i.cat)===c.id) || c.custom);
  app.innerHTML = `<div class="wrap" role="main">
    <div class="topfix" id="topfix">
      <header>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="backbtn" id="planBack" aria-label="${t("Back to lists")}">‹</button>
          <span class="title disp">${esc(state.name || (getLists().find(l=>l.code===listCode)||{}).name || "Choose")}<span class="dot">.</span></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">${syncChip()}<button id="optBtnTop" class="iconbtn" aria-label="${t("Settings")}" title="${t("Settings")}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>
      </header>
      ${locChip()}
      ${atStorePrompt()}
    </div>
    <div class="zoomwrap"><div class="zoomer ${styl()}${lineList()?' linelist':''}${gridCols()?(' gridmode grid'+gridCols()):''}${(dispBase()==='large'&&largeCols()===0)?' largevar':''}" id="zoomer" style="transform:scale(${dens()});transform-origin:top left;width:calc(100% / ${dens()})">
      ${mergeCardHTML()}
      ${hasAny ? planBody : `<div class="empty"><div class="empty-emoji">🛒</div><p class="empty-title">${t("Nothing planned yet")}</p><p class="empty-sub">${t("Tap <b>Add</b> below — pick from your Regulars in one tap or type anything new.")}</p></div>`}
      <button id="addCatPlan" style="margin:4px 0 2px;border:none;background:transparent;color:var(--muted);font-size:12px;font-weight:700;padding:4px 0">+ ${t("New category")}</button>
    </div></div>
  </div>
  ${planQBannerHTML()}
  ${(quickEdit==null && !addOpen)?`<div class="addpill-wrap" id="addPillWrap"><button class="addpill" id="addPill">${SEARCH_SVG}<span>${t("Add items…")}</span></button></div>`:""}
  ${bottomNav({planId:"planNavX",planActive:false,cartId:"cartNav",cartActive:false,setId:"setNav"})}${userTilesHTML()}  ${smartOpen?smartSheet():""}${rcpt?rcptSheet():""}${tenSheet?tenSheetHTML():""}${cmpOpen?cmpSheetHTML():""}${occSheet?occSheetHTML():""}${spendOpen?spendSheetHTML():""}${amOpen?amSheetHTML():""}${shopMenuOpen?shopMenuHTML():""}${priceDiagOpen?priceDiagHTML():""}${cardEdit?cardEditHTML():""}${cardShow?cardShowHTML():""}${stuckOpen?stuckHTML():""}${locDiagOpen?locDiagHTML():""}${rpt?rptSheet():""}${rst?rstSheet():""}${siriOpen?siriSheetHTML():""}${dictOpen?dictSheetHTML():""}${noListOpen?noListSheetHTML():""}
  ${editing?editSheet():(_editFoldKey="")}
  ${toast?`<div class="toast" id="toast"><span>${esc(t(toast))}</span>${toastAction?`<button id="undoBtn" class="undobtn">${esc(t(toastAction.label))}</button>`:""}</div>`:""}`;
}
function planRemove(id){ const it=state.items.find(i=>i.id===id); if(!it) return; playPlan(false);
  state.baTomb = state.baTomb || {};
  if(!state.buyAgain.some(b=>baKey(b)===baKey(it))){   // v2.68: the note is part of a Regular's key
    delete state.baTomb[baKey(it)];
    state.buyAgain.push({name:it.name,cat:it.cat,qty:it.qty||1,weight:it.weight||"",sub:it.sub||"",note:it.note||"",where:it.where||"",ts:Date.now()}); histLog("regadd", it.name); }
  histLog("rm", it.name);
  state.items = state.items.filter(i=>i.id!==id); save(); render(); }
function wirePlanPage(){
  wireAddSheet();
  app.querySelectorAll(".ba-restore").forEach(b=>{ const _p=b.dataset.restore.split("|"), cat=_p.pop(), name=_p.join("|"), note=b.dataset.regNote||"";
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=pressStart; b.onpointerleave=pressCancel; b.onpointercancel=pressCancel;
    b.onpointerup=()=>{ pressCancel();
      if(longFired){ const en=regFind(name,cat,note); editing={kind:"ba", name, cat, qty:(en?en.qty||1:1), weight:(en?en.weight||"":""), sub:(en?en.sub||"":""), note:(en?en.note||"":note), where:(en?en.where||"":""), tags:regTags(en), origName:name, origCat:cat, origNote:(en?en.note||"":note)}; render(); }
      else { restore(name,cat,note); } }; });
  app.querySelectorAll(".plan-in").forEach(b=>{ const id=b.dataset.planRm;
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=pressStart; b.onpointerleave=pressCancel; b.onpointercancel=pressCancel;
    b.onpointerup=(e)=>{ pressCancel(); const it=state.items.find(i=>i.id===id); if(!it) return;
      if(longFired){ quickEdit=null; editing={kind:"item", ...it}; render(); return; }
      quickEdit = (quickEdit===id ? null : id); render(); }; });   // v1.11 tap = select (qty banner); removal lives in the banner
  wireQuickPanel();
  app.querySelectorAll("[data-planc]").forEach(b=>{ const id=b.dataset.planc;
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=pressStart; b.onpointerleave=pressCancel; b.onpointercancel=pressCancel;
    b.onpointerup=()=>{ pressCancel();
      if(longFired){ const c=CAT(id); editing={kind:"cat", id, label:c.label, emoji:c.img?"":(c.emoji||""), img:c.img||"", color:c.color, iconManual:!!c.img}; render(); }
      else { if(!collapse.planCats) collapse.planCats=[]; collapse.planCats = collapse.planCats.includes(id) ? collapse.planCats.filter(x=>x!==id) : [...collapse.planCats, id]; localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); } }; });
  app.querySelectorAll("[data-add]").forEach(b=>{ const id=b.dataset.add;
    b.onclick=()=>{ if(catEntry===id){ catEntry=null; } else { catEntry=id; draftCatText=""; } render(); const ci=app.querySelector("#catInput"); if(ci) ci.focus(); }; });
  const pci=app.querySelector("#catInput"), pcab=app.querySelector("#catAddBtn"), pcc=app.querySelector("#catClear");
  const pToggle=()=>{ if(pcc) pcc.classList.toggle("show", !!(pci&&pci.value.trim())); };
  if(pci){ pci.value=draftCatText; pci.focus(); grow(pci); pToggle();
    pci.oninput=()=>{ draftCatText=pci.value; grow(pci); pToggle(); refreshCatSuggest(); };
    pci.onkeydown=e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); addEntries(pci.value,catEntry); pci.value=""; draftCatText=""; grow(pci); pToggle(); pci.focus(); } }; }
  if(pcc){ pcc.onpointerdown=e=>e.preventDefault(); pcc.onclick=()=>{ if(pci){ pci.value=""; draftCatText=""; grow(pci); pToggle(); pci.focus(); } }; }
  /* v1.74 item 1: a suggestion adds straight into the category and leaves the box focused, so several
     can be tapped in a row. pointerdown is cancelled for the same reason it is on #catAddBtn — a tap
     that moves focus takes the keyboard with it. */
  wireCatSuggest();
  if(pcab){ pcab.onpointerdown=e=>e.preventDefault(); pcab.onclick=()=>{ const v=app.querySelector("#catInput").value; addEntries(v,catEntry); draftCatText=""; render(); const x=app.querySelector("#catInput"); if(x){ x.focus(); grow(x); } }; }
  const acp=app.querySelector("#addCatPlan"); if(acp) acp.onclick=addCategory;
  // B4 restock suggestions
  app.querySelectorAll("[data-pred-add]").forEach(b=>b.onclick=()=>predictAdd(b.dataset.predAdd));
  app.querySelectorAll("[data-pred-rm]").forEach(b=>b.onclick=()=>predictDismiss(b.dataset.predRm));
  const pHide=app.querySelector("[data-pred-hide]"); if(pHide) pHide.onclick=predictHideAll;
  const pWhy=app.querySelector("[data-pred-why]"); if(pWhy) pWhy.onclick=()=>{ predictWhyOpen=!predictWhyOpen; render(); };
  // B5 merge duplicates
  app.querySelectorAll("[data-merge-go]").forEach(b=>b.onclick=()=>mergeCluster(b.dataset.mergeGo));
  app.querySelectorAll("[data-merge-x]").forEach(b=>b.onclick=()=>mergeDismiss(b.dataset.mergeX));
  const mHide=app.querySelector("[data-merge-hide]"); if(mHide) mHide.onclick=mergeHideAll;
  const ag=app.querySelector("#atstoreGo"); if(ag) ag.onclick=()=>gotoPage(1);
  const ax=app.querySelector("#atstoreX"); if(ax) ax.onclick=()=>{ try{ localStorage.setItem("ml_atstore_x", String(Date.now())); }catch(e){} render(); };
  const an=app.querySelector("#addNav"); if(an) an.onclick=openAdd;   // Add tab → add sheet
  const apl=app.querySelector("#addPill"); if(apl) apl.onclick=openAdd;
  const cn=app.querySelector("#cartNav"); if(cn) cn.onclick=()=>gotoPage(2);
  const qbc=app.querySelector("#qbannerClose"); if(qbc) qbc.onclick=()=>{ quickEdit=null; render(); };
  const qbr=app.querySelector("#qbannerRemove"); if(qbr) qbr.onclick=()=>{ const it=state.items.find(i=>i.id===quickEdit); const nm=it?cap(it.name):""; const id=quickEdit; quickEdit=null; planRemove(id); if(nm) showToast(nm+" moved to Regulars"); };
  wireSmartSheet();
  wireRcptSheet(); wireTenSheet(); wireCmp(); wireOcc(); wireSpend(); wireLook(); wireAisleMap(); wireShopMenu(); wirePriceDiag(); wireCards(); wireStuck(); wireBaNew(); wireLocDiag(); wireRptSheet(); wireRstSheet();
  const pbk=app.querySelector("#planBack"); if(pbk) pbk.onclick=()=>gotoPage(0);
  const ot=app.querySelector("#optBtnTop"); if(ot) ot.onclick=()=>{ optOpen=true; render(); };
  wireUserTiles();
  wireOptions();
  const ub=app.querySelector("#undoBtn"); if(ub) ub.onclick=()=>{ if(toastAction) toastAction.fn(); };
  wireEditSheet();
}
function wireSettingsPage(){   // v1.19 Settings is its own page (was an overlay sheet); v1.20 slides in/out
  const bk=app.querySelector("#setBack"); if(bk) bk.onclick=()=>gotoPage(settingsFrom);   // ‹ back slides to where we came from
  const pns=app.querySelector("#planNavS"); if(pns) pns.onclick=()=>{ optQuery=""; gotoPage(0); };   // Plan tab
  const cn=app.querySelector("#cartNav"); if(cn) cn.onclick=()=>{ optQuery=""; gotoPage(1); };   // Shop lies to the left → slides in from the left
  const stn=app.querySelector("#setNav"); if(stn) stn.onclick=()=>{ if(setLook){ setLook=false; render(); window.scrollTo(0,0); } };   // already on Settings; v2.18: from the look page, back to everyday Settings
  const ol=app.querySelector("#optLook"); if(ol) ol.onclick=()=>{ _lookY=window.scrollY||0; setLook=true; optQuery=""; render(); window.scrollTo(0,0); };
  const lb=app.querySelector("#lookBack"); if(lb) lb.onclick=()=>{ setLook=false; render(); const y=_lookY; window.scrollTo(0,y); requestAnimationFrame(()=>window.scrollTo(0,y)); };
  const os=app.querySelector("#optSearch"); if(os){
    os.oninput=e=>{ optQuery=e.target.value; os.parentElement.classList.toggle("has", !!optQuery); filterOptions(); };
    os.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); os.blur(); } }; }
  const oc=app.querySelector("#optSearchClear"); if(oc) oc.onclick=()=>{ optQuery=""; const i=app.querySelector("#optSearch");
    if(i){ i.value=""; i.parentElement.classList.remove("has"); i.focus(); } filterOptions(); };
  wireOptions();
  wireEditSheet();
  wireRcptSheet(); wireTenSheet(); wireCmp(); wireOcc(); wireSpend(); wireLook(); wireAisleMap(); wireShopMenu(); wirePriceDiag(); wireCards(); wireStuck(); wireBaNew(); wireLocDiag(); wireRptSheet(); wireRstSheet();   // v2.09: Settings has no smart sheet, so the receipt sheet is wired here on its own
  const ub=app.querySelector("#undoBtn"); if(ub) ub.onclick=()=>{ if(toastAction) toastAction.fn(); };
}
/* v1.77 item 3: which sections are folded. Keyed by the section's own name rather than its index, so
   adding or reordering a section cannot silently fold a different one. Everything started open: this
   makes Settings foldable, it does not decide for anyone which parts they never use — with the one
   exception OPT_COLL_DEFAULT names below, which v2.00 added and argues for there. */
/* v2.00: the sections nobody opens a grocery list's Settings to find. optColl() starts empty, which
   means "nothing folded", so a default has to be NAMED rather than assumed. Between a person and
   Sort, Smart add or Measurements sat nine appearance slots, four margin steppers, two colour
   pickers with eleven swatches each, and per-bar size and place controls — real preferences, every
   one, and none of them the reason anybody opens this page. Folded by default, never hidden: one tap
   opens any of them and the choice sticks from then on. Appearance keeps Theme, Wallpaper and Text
   size open, being the three with an immediate visible effect. Only the ABSENT case takes this
   default, so anyone who has already folded or unfolded anything keeps exactly what they chose.
   v2.18: everyday Tiles is open by default now that its colours moved to the look page; the look page's sections start folded, as its index. */
/* v2.18 (R12): Settings has two layers — everyday settings, and "Customise the look" on its own page — and a
   search across both. Memory only: the look page is where you are, not a preference, and a search left on would
   make Settings look broken the next time. var, not let: boot-order rule. */
var setLook = false, optQuery = "", _lookY = 0;
const LOOK_SECTS = new Set(["Layout & motion", "Colour", "Bars and overlays", "Category headings", "Tile colours and shape", "Sheets"]);
const OPT_COLL_DEFAULT = ["Layout & motion", "Colour", "Bars and overlays", "Category headings", "Tile colours and shape", "Sheets"];   // v2.69: "Edit item" became "Sheets"   // v2.63: Edit item joins the look page, folded like the rest
function optColl(){ try{ const raw=localStorage.getItem("ml_optcoll"); if(raw===null) return new Set(OPT_COLL_DEFAULT);
    const a=JSON.parse(raw||"[]"); return new Set(Array.isArray(a)?a:[]); }catch(e){ return new Set(); } }
/* Calls groupOptions() and NOT render(): folding a section must not rebuild the page and throw away
   the scroll position — that is the whole point of v1.75 item 2. */
function toggleOptColl(name){ const s=optColl(); if(s.has(name)) s.delete(name); else s.add(name);
  try{ localStorage.setItem("ml_optcoll", JSON.stringify([...s])); }catch(e){}
  groupOptions(); }
/* v1.77 item 3: fold each section's rows into a body of their own. The template emits headers and rows
   as flat siblings — a section IS "this header and everything up to the next one" — so the grouping is
   read from that rather than written into the template, which would have meant cutting several nested
   conditionals apart. Idempotent: it runs on every render and re-groups whatever it finds, so a body it
   built last time is simply rebuilt. */
/* v2.32 (the household's item 2): an explanation under a setting folds behind an (i) beside the setting's name — Settings reads
   as a list of choices, and the why is one tap away. Done on the drawn page, like groupOptions, so every .opthint in the
   template gets it without each being rewritten. Two hints under one setting share its (i). A hint that does not sit under a
   setting stays open. Toggling only flips classes — never render() (the v2.18 rule: the page must not rebuild). */
function infoBubbles(){ const page=document.querySelector(".optpage"); if(!page) return;
  page.querySelectorAll(".opthint:not([data-ib])").forEach((h,i)=>{ h.dataset.ib="1";
    let p=h.previousElementSibling; while(p && p.classList.contains("opthint")) p=p.previousElementSibling;
    const lab=(p && p.classList.contains("optrow")) ? p.querySelector(":scope > .optlabel") : null;
    if(!lab){ h.classList.add("opthint-open"); return; }
    let b=lab.querySelector(":scope > .infobtn");
    if(!b){ b=document.createElement("button"); b.type="button"; b.className="infobtn"; b.textContent="i";
      b.setAttribute("aria-expanded","false"); b.setAttribute("aria-label","What is this?"); b._hints=[];
      b.onclick=e=>{ e.stopPropagation(); const on=b.getAttribute("aria-expanded")!=="true";
        b._hints.forEach(x=>x.classList.toggle("opthint-open", on)); b.setAttribute("aria-expanded", on?"true":"false"); };
      lab.appendChild(b); }
    b._hints.push(h); }); }
function groupOptions(){
  const page=document.querySelector(".optpage"); if(!page) return;
  const coll=optColl();
  /* unwrap anything a previous pass built, so the sibling walk always sees the flat markup */
  page.querySelectorAll(".optgrpbody").forEach(b=>{ const p=b.parentNode;
    while(b.firstChild) p.insertBefore(b.firstChild, b);
    b.remove(); });
  let firstMain=true, firstLook=true;
  [...page.querySelectorAll(".optsect")].forEach(h=>{
    const name=h.dataset.sect||"";
    const body=document.createElement("div");
    body.className="optgrpbody";
    let n=h.nextSibling;
    while(n && !(n.nodeType===1 && n.classList && n.classList.contains("optsect"))){
      const next=n.nextSibling; body.appendChild(n); n=next;
    }
    h.insertAdjacentElement("afterend", body);
    const layer = LOOK_SECTS.has(name) ? "look" : "main";
    h.dataset.layer = layer; body.dataset.layer = layer;
    h.classList.toggle("layerfirst", layer==="look" ? firstLook : firstMain);
    if(layer==="look") firstLook=false; else firstMain=false;
    if(layer==="look" && !h.querySelector(".optlayertag")){ const c=h.querySelector(".optcaret");
      const tag=document.createElement("span"); tag.className="optlayertag"; tag.textContent=t("Customise the look");
      if(c) h.insertBefore(tag, c); else h.appendChild(tag); }
    const shut=coll.has(name);
    body.classList.toggle("coll", shut);
    h.classList.toggle("coll", shut);
    h.setAttribute("aria-expanded", shut?"false":"true");
    h.onclick=()=>{ if(optQuery.trim()) return; toggleOptColl(name); };
  });
  filterOptions();
}
/* v2.18 (R12): the search. Classes only — no render — so the field keeps its focus and the keyboard stays up.
   A section whose NAME matches shows whole; otherwise each row shows if its text matches (every word, any order),
   a subhead shows with any row under it (or whole, if the subhead itself matches), and a note shows with the
   row above it. Folded sections open while searching. Runs again after every render, so a setting changed
   from the results keeps the results. */
function optNorm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/color/g,"colour").replace(/gray/g,"grey"); }
function filterOptions(){ const page=document.querySelector(".optpage"); if(!page) return;
  const q=optNorm(optQuery).trim(), words=q.split(/\s+/).filter(Boolean);
  page.classList.toggle("searching", words.length>0);
  page.querySelectorAll(".optnomatch").forEach(e=>e.classList.remove("optnomatch"));
  const none=page.querySelector("#optNoMatch");
  if(!words.length){ if(none){ none.hidden=true; none.textContent=""; } return; }
  const hit=t=>{ const n=optNorm(t); return words.every(w=>n.includes(w)); };
  let any=0;
  page.querySelectorAll(".optlangtop").forEach(r=>{   // v2.56 item 1: the Language row, outside every section
    if(hit(r.textContent+" "+(r.dataset.find||""))) any++; else r.classList.add("optnomatch"); });
  page.querySelectorAll(".optsect").forEach(h=>{ const body=h.nextElementSibling;
    if(!body || !body.classList.contains("optgrpbody")) return;
    const secHit=hit(h.dataset.sect||"") || (appLang!=="en" && hit(t(h.dataset.sect||"")));   // v2.45 the shown name too
    let shown=0, sub=null, subHit=false, subShown=0, lastShown=false;
    const closeSub=()=>{ if(sub && !subHit && !subShown) sub.classList.add("optnomatch"); };
    for(const k of [...body.children]){
      if(k.classList.contains("optsub")){ closeSub(); sub=k; subHit=!secHit && hit(k.textContent); subShown=0; lastShown=false; continue; }
      const isNote=(k.tagName==="P" || k.tagName==="DIV") && !k.classList.contains("optrow") && !k.querySelector("button,input,select,textarea");
      const show = secHit || subHit ? true : (isNote ? lastShown : hit(k.textContent));
      if(show){ shown++; subShown++; } else k.classList.add("optnomatch");
      if(!isNote) lastShown=show;
    }
    closeSub();
    if(shown || secHit) any++; else { h.classList.add("optnomatch"); body.classList.add("optnomatch"); }
  });
  if(none){ none.hidden=any>0; none.textContent=any>0 ? "" : tf("No settings match “{q}”.", { q:optQuery.trim() }); }
}
function wireOptions(){
  const obr=app.querySelector("#optOnbReset"); if(obr) obr.onclick=()=>{   // v2.48 keep only the visit days, ask the rest again
    const v=onbGet().visits; try{ localStorage.setItem("ml_onb", JSON.stringify(v ? {fresh:1, visits:v} : {fresh:1})); }catch(e){}
    _onbLater={}; _onbShopsOpen=false; showToast(t("They will ask again")); render(); };
  const optBg=app.querySelector("#optBg"); if(optBg) optBg.onclick=()=>{ optOpen=false; render(); };
  const optS=app.querySelector("#optSheet"); if(optS) optS.onclick=e=>e.stopPropagation();
  const oca=app.querySelector("#optCollapseAll"); if(oca) oca.onclick=()=>{
    if(!shopMode){
      const ids=catList().filter(c=> state.items.some(i=>catShown(i.cat)===c.id)||state.buyAgain.some(e=>catShown(e.cat)===c.id)||c.custom).map(c=>c.id);
      const pc=collapse.planCats||[]; const open=ids.some(id=>!pc.includes(id));
      collapse.planCats = open ? ids.slice() : [];
    } else {
      const ids=catList().filter(c=>state.items.some(i=>catShown(i.cat)===c.id)).map(c=>c.id);
      const open=ids.some(id=>!collapse.cats.includes(id)) || (state.buyAgain.length>0 && collapse.ba);
      collapse.cats = open ? ids.slice() : []; collapse.ba = open ? false : true;
    }
    localStorage.setItem(LS.collapse, JSON.stringify(collapse)); optOpen=false; render(); };
  app.querySelectorAll("[data-opt-lang]").forEach(b=>b.onclick=()=>{ appLang = LANGS.some(l=>l.code===b.dataset.optLang) ? b.dataset.optLang : "en";   // v2.45, v2.55 any language in LANGS
    try{ localStorage.setItem("ml_lang", appLang); }catch(e){} try{ document.documentElement.lang = appLang; }catch(e){} render(); });
  app.querySelectorAll("[data-opt-theme]").forEach(b=>b.onclick=()=>{ if(theme!==b.dataset.optTheme) setTheme(b.dataset.optTheme); });
  /* v1.51 history */
  app.querySelectorAll("[data-hist-list]").forEach(b=>b.onclick=()=>{ histView=b.dataset.histList; histOpen=new Set(); render(); });
  app.querySelectorAll("[data-hist-group]").forEach(b=>b.onclick=()=>{ if(histGroup!==b.dataset.histGroup) setHistGroup(b.dataset.histGroup); });
  app.querySelectorAll("[data-hist-toggle]").forEach(b=>b.onclick=()=>{ const k=b.dataset.histToggle;
    if(histOpen.has(k)) histOpen.delete(k); else histOpen.add(k); render(); });
  const hc=app.querySelector("#optHistClear"); if(hc) hc.onclick=()=>{ histClear(histView||listCode); render(); };
  const orc=app.querySelector("#optRcpt"); if(orc) orc.onclick=()=>rcPick();   // v2.09
  app.querySelectorAll("[data-opt-sharepx]").forEach(b=>b.onclick=()=>{ try{ localStorage.setItem("ml_sharepx", b.dataset.optSharepx); }catch(e){} render(); });   // v2.47
  app.querySelectorAll("[data-opt-rcptask]").forEach(b=>b.onclick=()=>{ try{ localStorage.setItem("ml_rcptask", b.dataset.optRcptask); }catch(e){} render(); });   // v2.17
  const opc=app.querySelector("#optPriceClear"); if(opc) opc.onclick=()=>{ if(confirm("Forget every remembered price, and what you spent, in this list?")){ const now=Date.now(); state.prices={}; state.spend=[]; state.clr=Object.assign({}, state.clr, { prices:now, spend:now }); save(); render(); } };
  app.querySelectorAll("[data-opt-fill]").forEach(b=>b.onclick=()=>{ if(fillMode()!==b.dataset.optFill) setFill(b.dataset.optFill); });
  const ozm=app.querySelector("#optZoomMinus"); if(ozm) ozm.onclick=()=>setDensity(dens()-0.1);
  const ozp=app.querySelector("#optZoomPlus"); if(ozp) ozp.onclick=()=>setDensity(dens()+0.1);
  app.querySelectorAll("[data-opt-sound]").forEach(b=>b.onclick=()=>{ const want=b.dataset.optSound==="1"; if(soundOn!==want) toggleSound(); });
  app.querySelectorAll("[data-opt-wake]").forEach(b=>b.onclick=()=>{ try{ localStorage.setItem("ml_wakelock", b.dataset.optWake); }catch(e){} render(); });   // v2.16
  app.querySelectorAll("[data-memb-on]").forEach(b=>b.onclick=()=>{ const [k,v]=b.dataset.membOn.split("|"); const m=memb(); m[k].on=(v==="1"); membSave(m); });   // v2.20 the 10% shop
  app.querySelectorAll("[data-opt-sayshop]").forEach(b=>b.onclick=()=>{ const on=b.dataset.optSayshop==="1"; try{ localStorage.setItem("ml_sayshop", on?"1":"0"); }catch(e){}
    if(!on){ shoppingClear(); save(); } render(); });   // v2.23 R19: turning it off takes your name away at once
  const olv=app.querySelector("#optLeave"); if(olv) olv.onclick=()=>{ leaveList(); };   // v2.25 R26
  const oem=app.querySelector("#optEmpty"); if(oem) oem.onclick=()=>{ emptyList(); };
  /* v2.40 (sign-in by email): Your account */
  const acs=app.querySelector("#acctSend"); if(acs) acs.onclick=()=>acctSend((app.querySelector("#acctEmail")||{}).value);
  /* v2.41 an email and a password */
  const acg=app.querySelector("#acctGo"), acp=app.querySelector("#acctPw");
  const goPw=()=>acctPassword((app.querySelector("#acctEmail")||{}).value, (acp||{}).value);
  if(acg) acg.onclick=goPw;
  if(acp) acp.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); goPw(); } };
  const asp=app.querySelector("#acctSetPw"), anp=app.querySelector("#acctNewPw");
  if(asp) asp.onclick=()=>acctSetPassword((anp||{}).value);
  if(anp) anp.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); acctSetPassword(anp.value); } };
  const acf=app.querySelector("#acctForgot"); if(acf) acf.onclick=()=>acctForgot((app.querySelector("#acctEmail")||{}).value);
  const acu=app.querySelector("#acctUse"); if(acu) acu.onclick=()=>{ const v=String((app.querySelector("#acctPaste")||{}).value||"").trim();
    if(!_authM || !_auth || !_authM.isSignInWithEmailLink(_auth, v)){ acct={ sent:(acct&&acct.sent)||"", err:"That isn't the sign-in link. Copy the whole link from the email." }; render(); return; }
    acctComplete(v); };
  const aco=app.querySelector("#acctOut"); if(aco) aco.onclick=acctSignOut;
  const acd=app.querySelector("#acctDel"); if(acd) acd.onclick=()=>{ acctDelete(); };
  const ofg=app.querySelector("#optForget"); if(ofg) ofg.onclick=()=>{ forgetPhone(); };
  app.querySelectorAll("[data-memb-num]").forEach(b=>b.onclick=()=>{ const [k,f,d]=b.dataset.membNum.split("|"); const m=memb(); m[k][f]=(+m[k][f]||0)+(+d); state.memb=membNorm(m); save(); render(); });
  app.querySelectorAll("[data-memb-used]").forEach(b=>b.onclick=()=>{ const [k,v]=b.dataset.membUsed.split("|"); const m=memb(); membMark(m,k,v==="1"); membSave(m); });
  app.querySelectorAll("[data-memb-list]").forEach(b=>b.onclick=()=>tenOpen(b.dataset.membList));
  app.querySelectorAll("[data-pred-on]").forEach(b=>b.onclick=()=>{ predictCfg.on=(b.dataset.predOn==="1"); savePredictCfg(); render(); });   // B4 predictions
  app.querySelectorAll("[data-pred-freq]").forEach(b=>b.onclick=()=>{ predictCfg.freq=b.dataset.predFreq; savePredictCfg(); render(); });
  app.querySelectorAll("[data-pred-day]").forEach(b=>b.onclick=()=>{ predictCfg.day=+b.dataset.predDay; savePredictCfg(); render(); });
  app.querySelectorAll("[data-opt-sort]").forEach(b=>b.onclick=()=>setSort(b.dataset.optSort));
  app.querySelectorAll("[data-tiledisp]").forEach(b=>b.onclick=()=>setDispBase(b.dataset.tiledisp));   // v1.29 sets the display base only; grouping is separate
  app.querySelectorAll("[data-opt-cols]").forEach(b=>b.onclick=()=>setLargeCols(+b.dataset.optCols));
  app.querySelectorAll("[data-opt-accent]").forEach(b=>b.onclick=()=>setAccent(b.dataset.optAccent));
  app.querySelectorAll("[data-opt-textcol]").forEach(b=>b.onclick=()=>setTextCol(b.dataset.optTextcol));
  app.querySelectorAll("[data-opt-tilebg]").forEach(b=>b.onclick=()=>setTileBg(b.dataset.optTilebg));
  app.querySelectorAll("[data-opt-tilebrd]").forEach(b=>b.onclick=()=>setTileBrd(b.dataset.optTilebrd));
  app.querySelectorAll("[data-opt-tiletext]").forEach(b=>b.onclick=()=>setTileTxt(b.dataset.optTiletext));
  app.querySelectorAll("[data-opt-utilebg]").forEach(b=>b.onclick=()=>setUTileBg(b.dataset.optUtilebg));
  app.querySelectorAll("[data-opt-utilebrd]").forEach(b=>b.onclick=()=>setUTileBrd(b.dataset.optUtilebrd));
  app.querySelectorAll("[data-opt-utiletext]").forEach(b=>b.onclick=()=>setUTileTxt(b.dataset.optUtiletext));
  app.querySelectorAll("[data-opt-epilltext]").forEach(b=>b.onclick=()=>setEPillTxt(b.dataset.optEpilltext));   // v2.63 item D
  app.querySelectorAll("[data-opt-epillbg]").forEach(b=>b.onclick=()=>setEPillBg(b.dataset.optEpillbg));
  app.querySelectorAll("[data-opt-epillbrd]").forEach(b=>b.onclick=()=>setEPillBrd(b.dataset.optEpillbrd));
  /* v2.69: the sheet looks — which sheet the page shows, and every sheet x prop row (the edit pill trio is wired above) */
  /* v2.74: the layout rows — data-lk-<key>="<sheet>|<value>" */
  LK_LAYOUT.forEach(k=>app.querySelectorAll("[data-lk-"+k+"]").forEach(b=>b.onclick=()=>{ const [sh,v]=b.getAttribute("data-lk-"+k).split("|"); setLkLay(sh,k,v||""); }));
  app.querySelectorAll("[data-lk-sheet]").forEach(b=>b.onclick=()=>{ if(lookSheet!==b.dataset.lkSheet){ lookSheet=b.dataset.lkSheet; render(); } });
  SHEET_LOOKS.forEach(sh=>SHEET_PROPS.forEach(p=>{ if(sh==="edit" && LK_ALIAS[p]) return; const a="data-"+lkAttr(sh,p);
    app.querySelectorAll("["+a+"]").forEach(b=>b.onclick=()=>setLk(sh,p,b.getAttribute(a))); }));
  app.querySelectorAll("[data-opt-cattext]").forEach(b=>b.onclick=()=>setCatTxt(b.dataset.optCattext));
  /* v1.76 items 1 & 2: the seven new rows, wired exactly like the nine above them. */
  app.querySelectorAll("[data-opt-topbar]").forEach(b=>b.onclick=()=>setTopBar(b.dataset.optTopbar));
  app.querySelectorAll("[data-opt-navbar]").forEach(b=>b.onclick=()=>setNavBar(b.dataset.optNavbar));
  app.querySelectorAll("[data-opt-srchbar]").forEach(b=>b.onclick=()=>setSrchBar(b.dataset.optSrchbar));
  app.querySelectorAll("[data-opt-toptile]").forEach(b=>b.onclick=()=>setTopTile(b.dataset.optToptile));   // v2.13
  app.querySelectorAll("[data-opt-navsel]").forEach(b=>b.onclick=()=>setNavSel(b.dataset.optNavsel));
  app.querySelectorAll("[data-opt-cathdbg]").forEach(b=>b.onclick=()=>setCatHdBg(b.dataset.optCathdbg));
  app.querySelectorAll("[data-opt-cathdbrd]").forEach(b=>b.onclick=()=>setCatHdBrd(b.dataset.optCathdbrd));
  app.querySelectorAll("[data-opt-reghdtext]").forEach(b=>b.onclick=()=>setRegHdTxt(b.dataset.optReghdtext));
  app.querySelectorAll("[data-opt-reghdbg]").forEach(b=>b.onclick=()=>setRegHdBg(b.dataset.optReghdbg));
  app.querySelectorAll("[data-opt-reghdbrd]").forEach(b=>b.onclick=()=>setRegHdBrd(b.dataset.optReghdbrd));
  /* v1.76 item 1: the two transparency steppers — the key and the direction travel in the attribute,
     the same shape [data-opt-shade] uses. */
  app.querySelectorAll("[data-opt-bara]").forEach(b=>b.onclick=()=>{
    const [k,d]=b.dataset.optBara.split("|"); bumpBarAlpha(k, parseInt(d,10)); });
  /* v1.67 item 2: one handler for all nine custom pickers — the row's own attribute name says which
     setting it belongs to, so the map is the only thing to keep in step. `input` rather than `change`
     so the page follows the colour while it is being dragged. */
  const CUSTOM_SET = { "opt-accent":setAccent, "opt-textcol":setTextCol, "opt-cattext":setCatTxt,
    "opt-tiletext":setTileTxt, "opt-tilebg":setTileBg, "opt-tilebrd":setTileBrd,
    "opt-utiletext":setUTileTxt, "opt-utilebg":setUTileBg, "opt-utilebrd":setUTileBrd,
    "opt-epilltext":setEPillTxt, "opt-epillbg":setEPillBg, "opt-epillbrd":setEPillBrd,   // v2.63 item D
    /* v1.76 items 1 & 2: sixteen now. Every one of these setters takes `quiet`, so the custom picker
       can follow the drag without rebuilding the page underneath it. */
    "opt-topbar":setTopBar, "opt-navbar":setNavBar,
    /* v1.78: the third overlay tile. */
    "opt-srchbar":setSrchBar,
    "opt-toptile":setTopTile, "opt-navsel":setNavSel,   // v2.13
    "opt-cathdbg":setCatHdBg, "opt-cathdbrd":setCatHdBrd,
    "opt-reghdtext":setRegHdTxt, "opt-reghdbg":setRegHdBg, "opt-reghdbrd":setRegHdBrd };
  SHEET_LOOKS.forEach(sh=>SHEET_PROPS.forEach(p=>{ const a=lkAttr(sh,p); if(!CUSTOM_SET[a]) CUSTOM_SET[a]=(v,q)=>setLk(sh,p,v,q); }));   // v2.69
  app.querySelectorAll("[data-opt-custom]").forEach(inp=>{
    const fn=CUSTOM_SET[inp.dataset.optCustom]; if(!fn) return;
    /* v1.70: `change` is NOT "the picker closed" — on iOS it fires for every colour chosen inside the
       still-open overlay, so committing here re-rendered mid-pick and ejected you after one choice.
       Both events are quiet now; the rebuild waits for the picker to actually be finished with. */
    inp.oninput=()=>{ _colorPicking=true; colorPeek(true); fn(inp.value, true); };
    inp.onchange=()=>{ fn(inp.value, true);
      /* …except where `change` really does mean "closed": a desktop dialog returns focus elsewhere
         before firing it, and there is no blur to wait for. */
      if(document.activeElement!==inp) endColorPick(); };
    inp.onblur=()=>{ endColorPick(); }; });
  /* v1.75 item 1: one selector for all nine step controls on Auto rows — the row's key and the
     direction travel in the attribute, the same shape the Calm switch used. */
  app.querySelectorAll("[data-opt-shade]").forEach(b=>b.onclick=()=>{
    const [k,d]=b.dataset.optShade.split("|"); setShade(k, parseInt(d,10)); });
  app.querySelectorAll("[data-opt-transdir]").forEach(b=>b.onclick=()=>setTransDir(b.dataset.optTransdir));
  app.querySelectorAll("[data-opt-transspd]").forEach(b=>b.onclick=()=>setTransSpd(b.dataset.optTransspd));
  app.querySelectorAll("[data-opt-srchalign]").forEach(b=>b.onclick=()=>setSrchAlign(b.dataset.optSrchalign));
  app.querySelectorAll("[data-app-use]").forEach(b=>b.onclick=()=>useAppSlot(+b.dataset.appUse));
  app.querySelectorAll("[data-app-save]").forEach(b=>b.onclick=()=>{ appSaveAsk=+b.dataset.appSave; render(); });
  app.querySelectorAll("[data-app-saveyes]").forEach(b=>b.onclick=()=>{ const i=+b.dataset.appSaveyes; appSaveAsk=null; saveAppSlot(i); });
  app.querySelectorAll("[data-app-saveno]").forEach(b=>b.onclick=()=>{ appSaveAsk=null; render(); });
  app.querySelectorAll("[data-app-starthere]").forEach(b=>b.onclick=()=>{
    const cur=appSel()===null ? "0" : String(appSel());
    setAppStart(appStart()===cur ? "" : cur); });
  const oaf=app.querySelector("#optAppFactory"); if(oaf) oaf.onclick=()=>factoryAppearance();
  app.querySelectorAll("[data-opt-num]").forEach(b=>b.onclick=()=>bumpNum(b.dataset.optNum, +b.dataset.optDelta));
  /* v1.80: the user tiles' controls. Same attribute shape as the bars above — the id, the key and the
     direction travel in the attribute, so a tile added later needs no new handler. */
  app.querySelectorAll("[data-tile-num]").forEach(b=>b.onclick=()=>{
    const [id,k,d]=b.dataset.tileNum.split("|"); bumpTile(id, k, parseInt(d,10)); });
  app.querySelectorAll("[data-tile-alpha]").forEach(b=>b.onclick=()=>{
    const [id,d]=b.dataset.tileAlpha.split("|"); bumpTileAlpha(id, parseInt(d,10)); });
  app.querySelectorAll("[data-tile-shade]").forEach(b=>b.onclick=()=>{
    const [id,d]=b.dataset.tileShade.split("|"); bumpTileShade(id, parseInt(d,10)); });
  app.querySelectorAll("[data-tile-col]").forEach(b=>b.onclick=()=>{
    const [id,v]=b.dataset.tileCol.split("|"); patchTile(id,"col",v); });
  app.querySelectorAll("[data-tile-act]").forEach(b=>b.onclick=()=>{
    const [id,v]=b.dataset.tileAct.split("|"); patchTile(id,"act",v); });
  app.querySelectorAll("[data-tile-cat]").forEach(b=>b.onclick=()=>{
    const [id,v]=b.dataset.tileCat.split("|"); patchTile(id,"cat",v); });
  app.querySelectorAll("[data-tile-del]").forEach(b=>b.onclick=()=>deleteTile(b.dataset.tileDel));
  /* v1.80: the two text fields are written on `input` WITHOUT a render — a render rebuilds
     app.innerHTML, which destroys the focused field, and iOS drops the keyboard the instant that
     happens (the v1.45 note; #catInput is handled the same way). The value is persisted on every
     keystroke and the page is rebuilt once, on blur, when the field is finished with. */
  const tileText=(attr,key)=>app.querySelectorAll(`[data-tile-${attr}]`).forEach(inp=>{
    const id=inp.dataset[attr==="label"?"tileLabel":"tileEmoji"];
    inp.oninput=()=>{ const a=userTiles(); const t=a.find(x=>x.id===id); if(!t) return;
      t[key]=inp.value; writeTiles(a); };
    inp.onblur=()=>render(); });
  tileText("label","label"); tileText("emoji","emoji");
  /* v1.80: the custom picker follows the drag quietly, exactly as the v1.68 pickers do — committing
     on every colour chosen inside a still-open iOS overlay would rebuild the page underneath it. */
  app.querySelectorAll("[data-tile-custom]").forEach(inp=>{
    const id=inp.dataset.tileCustom;
    const quietSet=v=>{ const a=userTiles(); const t=a.find(x=>x.id===id); if(!t) return;
      t.col=v; writeTiles(a); applyTheme(); };
    inp.oninput=()=>{ _colorPicking=true; colorPeek(true); quietSet(inp.value); };
    inp.onchange=()=>{ quietSet(inp.value); if(document.activeElement!==inp) endColorPick(); };
    inp.onblur=()=>{ endColorPick(); }; });
  const aut=app.querySelector("#addUserTile"); if(aut) aut.onclick=addUserTile;
  wireUserTiles();
  const onr=app.querySelector("#optNumReset"); if(onr) onr.onclick=()=>resetNums();
  const ons=app.querySelector("#optNumSave"); if(ons) ons.onclick=()=>saveNumDefs();
  const onf=app.querySelector("#optNumFactory"); if(onf) onf.onclick=()=>factoryNums();
  app.querySelectorAll("[data-opt-wall]").forEach(b=>b.onclick=()=>{ if(wall!==b.dataset.optWall) setWall(b.dataset.optWall); });
  const wc=app.querySelector("[data-opt-wallcustom]");
  if(wc){ wc.oninput=()=>{ _colorPicking=true; colorPeek(true); setWall(wc.value, true); };
          wc.onchange=()=>{ setWall(wc.value, true); if(document.activeElement!==wc) endColorPick(); };
          wc.onblur=()=>{ endColorPick(); }; }
  app.querySelectorAll("[data-opt-wallpos]").forEach(b=>b.onclick=()=>{ if(wallPos!==b.dataset.optWallpos) setWallPos(b.dataset.optWallpos); });
  app.querySelectorAll("[data-opt-caton]").forEach(b=>b.onclick=()=>{ const v=b.dataset.optCaton==="1"; if(catOn!==v) setCatOn(v); });
  app.querySelectorAll("[data-opt-subon]").forEach(b=>b.onclick=()=>{ const v=b.dataset.optSubon==="1"; if(subOn!==v) setSubOn(v); });
  wireSiri(); wireVoice();   // v2.60; v2.64 the dictation sheet renders here too
  app.querySelectorAll("[data-opt-smart]").forEach(b=>b.onclick=()=>{ const want=b.dataset.optSmart==="1"; if(smartOn()!==want) setSmart(want); });
  app.querySelectorAll("[data-opt-units]").forEach(b=>b.onclick=()=>setUnitsMode(b.dataset.optUnits));
  app.querySelectorAll("[data-opt-mealslots]").forEach(b=>b.onclick=()=>setMealSlots(b.dataset.optMealslots==="1"));
  app.querySelectorAll("[data-opt-catemoji]").forEach(b=>b.onclick=()=>{ const want=b.dataset.optCatemoji==="1"; if(catEmojiOn()!==want) setCatEmoji(want); });
  app.querySelectorAll("[data-opt-iconstyle]").forEach(b=>b.onclick=()=>{ if(iconStyle()!==b.dataset.optIconstyle) setIconStyle(b.dataset.optIconstyle); });
  app.querySelectorAll("[data-opt-itememoji]").forEach(b=>b.onclick=()=>{ const want=b.dataset.optItememoji==="1"; if(itemEmojiOn()!==want) setItemEmoji(want); });
  app.querySelectorAll("[data-opt-icosize]").forEach(b=>b.onclick=()=>{ if(icoSize()!==b.dataset.optIcosize) setIcoSize(b.dataset.optIcosize); });
  app.querySelectorAll("[data-opt-linew]").forEach(b=>b.onclick=()=>{ if(lineW()!==b.dataset.optLinew) setLineW(b.dataset.optLinew); });
  app.querySelectorAll("[data-opt-useloc]").forEach(b=>b.onclick=()=>{ const want=b.dataset.optUseloc==="1"; if(useLoc!==want){ useLoc=want; localStorage.setItem("ml_useloc", want?"1":"0"); locState={checked:false,busy:false,ts:0,err:0,nearId:null,dist:Infinity}; if(want) ensureLocCheck(); render(); } });
  app.querySelectorAll("[data-opt-store]").forEach(b=>b.onclick=()=>{ const v=b.dataset.optStore; if(storeSel!==v){ storeSel=v; localStorage.setItem("ml_store", v); locState={checked:false,busy:false,ts:0,err:0,nearId:null,dist:Infinity}; if(v==="auto") ensureLocCheck(); render(); } });
  const sadd=app.querySelector("[data-store-add]"); if(sadd) sadd.onclick=()=>{ const id="c"+uid().slice(0,6); state.stores=state.stores||[]; state.stores.push({id,name:"New store",aisles:[]}); storeSel=id; localStorage.setItem("ml_store", id); save(); render(); };
  const snm=app.querySelector("#storeName"); if(snm) snm.onchange=()=>{ const nm=(snm.value||"").trim()||"Store"; const cs=(state.stores||[]).find(x=>x.id===storeSel);
    if(cs){ cs.name=nm; } else { state.storeMeta=state.storeMeta||{}; state.storeMeta[storeSel]=Object.assign({}, state.storeMeta[storeSel], {name:nm}); }
    save(); render(); };
  const srm=app.querySelector("#storeRemove"); if(srm) srm.onclick=()=>{   // hide any store (built-in or custom) so it can be restored later
    state.storeMeta=state.storeMeta||{}; state.storeMeta[storeSel]=Object.assign({}, state.storeMeta[storeSel], {hidden:true});
    storeSel="auto"; localStorage.setItem("ml_store","auto"); save(); render(); };
  app.querySelectorAll("[data-store-restore]").forEach(b=>b.onclick=()=>{ const id=b.dataset.storeRestore; if(state.storeMeta&&state.storeMeta[id]){ delete state.storeMeta[id].hidden; delete state.storeMeta[id].removed; } save(); render(); });
  app.querySelectorAll("[data-store-delete]").forEach(b=>b.onclick=()=>{ const id=b.dataset.storeDelete;
    if((state.stores||[]).some(x=>x.id===id)){ state.stores=(state.stores||[]).filter(x=>x.id!==id); if(state.storeMeta) delete state.storeMeta[id]; }   // custom → gone for good
    else { state.storeMeta=state.storeMeta||{}; state.storeMeta[id]=Object.assign({}, state.storeMeta[id], {hidden:true, removed:true}); }   // built-in → drop from the list (can't delete an app store)
    save(); render(); });
  const oss=app.querySelector("#optSetStore"); if(oss) oss.onclick=setStoreHere;
  const rai=app.querySelector("#optResetAI"); if(rai) rai.onclick=aiResetStore;
  app.querySelectorAll("[data-opt-style]").forEach(b=>b.onclick=()=>{ if(styl()!==b.dataset.optStyle) setStyle(b.dataset.optStyle); });
  app.querySelectorAll("[data-switch-user]").forEach(b=>b.onclick=()=>{ const nm=b.dataset.switchUser; if(nm && nm!==me){ me=nm; localStorage.setItem(LS.me, nm); } optOpen=false; render(); });
  const osh=app.querySelector("#optShare"); if(osh) osh.onclick=copyLink;
  /* v2.44 (members by account): Settings › People */
  app.querySelectorAll("[data-access-rm]").forEach(b=>b.onclick=()=>{ const id=b.dataset.accessRm, nm=b.dataset.accessNm||"Someone";
    if(!confirm(`Remove ${nm} from this list? Their phone loses it, and the list gets a new link.`)) return;
    accessWrite({ acl:{[id]:false}, joinKey:newKey(), openUntil:0 }, tf("{x} removed", { x:nm })); });
  const acl=app.querySelector("#accessClose"); if(acl) acl.onclick=()=>accessWrite({ openUntil:0 }, "Closed — only the current link lets someone new in");
  const ank=app.querySelector("#accessNewKey"); if(ank) ank.onclick=()=>{ if(!confirm("Make a new link? The old one stops working for anyone not already on the list.")) return;
    accessWrite({ joinKey:newKey(), openUntil:0 }, "New link made — share it from Lists & sharing"); };
  const oex=app.querySelector("#optExport"); if(oex) oex.onclick=exportListText;
  const obk=app.querySelector("#optBackup"); if(obk) obk.onclick=backupToFile;   // v2.15 backups
  const orf=app.querySelector("#optRestoreFile"); if(orf) orf.onclick=restorePick;
  app.querySelectorAll("[data-snaprestore]").forEach(b=>b.onclick=()=>{ const s=snapList(listCode)[+b.dataset.snaprestore]; if(!s) return;
    rst={ list:s.list, label:tf("The backup from {x}", { x:new Date(s.at).toLocaleDateString(dateLoc(),{weekday:"long",day:"numeric",month:"long"}) }) }; render(); });
  const osl=app.querySelector("#optSendList"); if(osl) osl.onclick=shareListText;   // v2.13: was the Shop page's top-right button
  const oc13=app.querySelector("#optCats13"); if(oc13) oc13.onclick=()=>{ if(confirm(t("Move this list to the new categories? A backup is kept in Settings › Backups."))) switchToCats13(); };   // v2.57 item 4
  const orp=app.querySelector("#optReport"); if(orp) orp.onclick=()=>{ rpt={ kind:"broken", text:"", diag:true }; render(); };
  const vf=app.querySelector("#verFoot"); if(vf){ let _dt; const _cancel=()=>clearTimeout(_dt);
    vf.onpointerdown=()=>{ _dt=setTimeout(()=>{ diagOpen=true; render(); }, 550); };
    vf.onpointerup=_cancel; vf.onpointerleave=_cancel; vf.onpointercancel=_cancel; }
  const od=app.querySelector("#optDiag"); if(od) od.onclick=()=>{ diagOpen=true; render(); };
  const dbg=app.querySelector("#diagBg"); if(dbg) dbg.onclick=e=>{ if(e.target===dbg){ diagOpen=false; render(); } };
  const dcl=app.querySelector("#diagClose"); if(dcl) dcl.onclick=()=>{ diagOpen=false; render(); };
  const dpr=app.querySelector("#diagProbe"); if(dpr) dpr.oninput=()=>{ const o=app.querySelector("#diagProbeOut"); if(o) o.innerHTML=diagProbeHTML(dpr.value); };
  const dsb=app.querySelector("#diagSandbox"); if(dsb) dsb.onclick=openSandbox;
  app.querySelectorAll("[data-diag-list]").forEach(b=>b.onclick=()=>{ const code=b.dataset.diagList; if(code!==listCode){ switchList(code); } });  // keep diagnostics open, inspect the chosen list
  const drp=app.querySelector("#diagResetPredict"); if(drp) drp.onclick=(configured?resetPredictionsServer:resetPredictions);
  const diagKeepScroll=fn=>{ const sc=app.querySelector("#diagSheetEl"); const y=sc?sc.scrollTop:0; fn(); render(); const s2=app.querySelector("#diagSheetEl"); if(s2) s2.scrollTop=y; };
  const dpa=app.querySelector("#diagPredToggleAll"); if(dpa) dpa.onclick=()=>diagKeepScroll(()=>{ const keys=Object.keys(purch||{}); const allOpen=keys.length&&keys.every(k=>diagPredExpand.has(k)); if(allOpen) diagPredExpand.clear(); else keys.forEach(k=>diagPredExpand.add(k)); });
  app.querySelectorAll("[data-diag-sort]").forEach(el=>el.onclick=()=>diagKeepScroll(()=>{ diagPredSort=el.dataset.diagSort; }));
  app.querySelectorAll("[data-diag-pred]").forEach(el=>el.onclick=()=>diagKeepScroll(()=>{ const k=el.dataset.diagPred; if(diagPredExpand.has(k)) diagPredExpand.delete(k); else diagPredExpand.add(k); }));
  infoBubbles(); groupOptions();   // v1.77 item 3: last, so it folds markup that is already wired (v2.32: the (i)s first)
}
/* A18 ✨ Smart add — planning-mode AI parse → preview → confirm.
   Calls the server-side /api/parse (Groq); the API key never touches the client. */
// B3 recipe-shaped input (steps / servings / cooking verbs) routes to /api/recipe so servings scale
function looksLikeRecipe(t){
  const s=(t||"").toLowerCase();
  if(/\bserves?\s+\d/.test(s)) return true;
  const steps=/(preheat|bake|roast|simmer|whisk|knead|combine|saut|\bfry\b|\bboil\b|marinat|garnish|drain|dough|batter|\boven\b|\bmin(ute)?s?\b|°|degrees|tbsp|tsp|tablespoon|teaspoon)/;
  const lines=(t||"").split(/\n/).filter(l=>l.trim()).length;
  return steps.test(s) && lines>=3;
}
async function smartAdd(){
  const mi=document.getElementById("mainInput");
  return smartAddText(mi?mi.value:""); }
/* v2.57 item 6: the body of Smart add, for any text — the voice sheet's ✓ calls it too */
async function smartAddText(text){
  text=String(text||"").trim();
  if(!text) return;
  const recipe=looksLikeRecipe(text);
  /* v2.58 (the household): the keyboard goes down when Smart add starts, so its suggestions can be seen */
  try{ const ae=document.activeElement; if(ae && ae.blur) ae.blur(); }catch(e){}
  smartOpen=true; smartLoading=true; smartStep=""; smartError=""; smartItems=[]; smartEdit=null; smartWOpen=null; smartCOpen=null; smartServings=null; smartTitle=""; smartFromPhoto=false; render();
  try{ const ae=document.activeElement; if(ae && ae.blur && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) ae.blur(); }catch(e){}   // a render that put the focus back
  return smartRequest(recipe?"/api/recipe":"/api/parse", {text}, recipe);
}
/* v2.56 item 7: a photo of a list (or a recipe) read by the recipe reader — the same resize and the same call as the Plan
   page's Photo import (planShrinkImage → /api/recipe {image}), landing in the Smart add review like a recipe. */
var smartStep = "";
var smartFromPhoto = false;   // v2.57 item 3: the review came from a photo of a list — its header and its "nothing found" say so
function smartPhoto(camera){
  pickFile(camera ? { accept:"image/*", capture:"environment" } : { accept:"image/*" }).then(file=>{ if(!file) return;
    smartOpen=true; smartLoading=true; smartStep="Preparing the photo…"; smartError=""; smartItems=[]; smartEdit=null; smartWOpen=null; smartCOpen=null; smartServings=null; smartTitle=""; smartFromPhoto=true; render();
    planShrinkImage(file, 1400, 0.72)
      .then(img=>{ smartStep="Reading the photo…"; render();
        /* v2.56: every wait ends — 75 s at most (the function's own limit is 60 s) */
        return Promise.race([smartRequest("/api/recipe", { image:img, kind:"list" }, true),
          new Promise(r=>setTimeout(()=>{ if(smartLoading && smartStep){ smartLoading=false; smartStep=""; smartError="Reading the photo took too long. Try again, or type the list."; render(); } r(); }, 75000))]); })
      .catch(()=>{ smartLoading=false; smartStep=""; smartError="Couldn't open that photo."; render(); }); }); }
async function smartRequest(path, payload, recipe){
  let res, data;
  try{
    res=await apiFetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  }catch(e){ res=null; }
  smartStep="";
  if(!res){
    smartLoading=false; smartError="Couldn't reach Smart add. Check your connection — you can still type items normally."; render(); return;
  }
  if(res.status===500){
    smartLoading=false; smartError="Smart add isn't set up yet. Add a GEMINI_API_KEY (or GROQ_API_KEY) in Vercel (see docs/ai-setup.md). You can still type items normally."; render(); return;
  }
  if(!res.ok){
    /* v1.91: Smart add read no code off the failure, so when Groq retired the model in August it spent
       three weeks telling people to rephrase — the one thing that could not possibly have helped. The
       server names what went wrong; say it. */
    smartLoading=false;
    let ecode=""; try{ ecode=((await res.json())||{}).code||""; }catch(e){}
    /* v1.93: an overloaded model and a spent daily quota are not the input's fault either — telling
       someone to rephrase while a queue clears is the same mistake in a smaller hat. */
    smartError = ecode==="signin" ? "This phone isn't signed in yet. Check your connection and try again."
      : ecode==="appcheck" ? "The app couldn't prove it's the real app. Close it completely and open it again."
      : ecode==="model"
      ? "Smart add's model is no longer available — set GEMINI_MODEL (or GROQ_MODEL) in Vercel (see docs/ai-setup.md). You can still type items normally."
      : ecode==="busy"
        ? "The model is busy right now — give it a moment and try again. You can still type items normally."
        : ecode==="quota"
          ? "Today's free quota for this model is used up. It resets tomorrow, or set GEMINI_MODEL in Vercel to a model with more headroom (see docs/ai-setup.md). You can still type items normally."
          : "Couldn't read that — try rephrasing, or just type your items.";
    render(); return;
  }
  try{ data=await res.json(); }catch(e){ data=null; }
  const raw=(data&&Array.isArray(data.items))?data.items:null;
  if(!raw){ smartLoading=false; smartError="Couldn't read that — try rephrasing, or just type your items."; render(); return; }
  const allowed=catList().map(c=>c.id);
  smartItems=raw.map(it=>{ const nm0=String(it&&it.name||"").trim(), ai=String(it&&it.category||"others"), mapped=newCat(ai, nm0);
    const q=(Number.isFinite(+(it&&it.qty))&&+it.qty>=1)?Math.min(999,Math.round(+it.qty)):1;
    const w=(it&&typeof it.weight==="string")?it.weight.trim().slice(0,16):"";
    const nt=(it&&typeof it.note==="string")?it.note.replace(/[\r\n]+/g," ").trim().slice(0,140):"";   // v2.70: what tells it apart
    return {
      name:nm0, note:nt,
      qty:q, baseQty:q, sub:"", sel:true,
      category:allowed.includes(mapped) ? mapped : (allowed.includes(ai) ? ai : "others"),   // v2.67: the AI speaks the nine
      weight:w, baseWeight:w,
    }; }).filter(it=>it.name);
  if(recipe){ const src=(data&&+data.servings>=1)?Math.round(+data.servings):4;
    smartServings={ src, target:src, title:(data&&data.title)?String(data.title).slice(0,80):"" }; }
  smartTitle = smartServings ? (smartServings.title||"") : "";
  smartLoading=false;
  if(!smartItems.length && smartFromPhoto){ smartError=t("Nothing to buy found in that photo — try a closer photo of the list or the products."); }
  else if(!smartItems.length){ smartError=recipe?"No ingredients found — try pasting the full recipe.":"Nothing to add from that — try adding more detail, or type your items."; }
  render();
}
function recipeScale(delta){
  if(!smartServings) return;
  const t=Math.max(1,Math.min(99,(smartServings.target||smartServings.src)+delta));
  smartServings.target=t;
  applyServingsScale();
  render();
}
/* v2.01: the scaling itself, without a render — the plan's review sheet applies an entry's servings
   once on the way in. Weights scale too (scaleAmt keeps the unit). */
function applyServingsScale(){
  if(!smartServings) return;
  const f=smartServings.target/smartServings.src;
  /* An amount carries the scale on its own: "1 kg" at double servings is "2 kg", and the count stays
     1 — scaling both showed "2× 2 kg", four kilos. Only a row without an amount scales its count. */
  for(const it of smartItems){ const b=(it.baseQty!=null?it.baseQty:it.qty);
    if(it.baseWeight){ it.weight=scaleAmt(it.baseWeight, f); it.qty=b; }
    else it.qty=Math.max(1,Math.round(b*f)); }
}
function wireSmartSheet(){
  const sBg=app.querySelector("#smartBg"); if(sBg) sBg.onclick=e=>{ if(e.target===sBg){ smartOpen=false; smartWOpen=null; smartCOpen=null; smartTitle=""; smartFromPhoto=false; render(); } };
  const sOk=app.querySelector("#smartOk"); if(sOk) sOk.onclick=()=>{ smartOpen=false; smartError=""; render(); };
  const sCancel=app.querySelector("#smartCancel"); if(sCancel) sCancel.onclick=()=>{ smartOpen=false; smartItems=[]; smartEdit=null; smartWOpen=null; smartCOpen=null; smartServings=null; smartTitle=""; smartFromPhoto=false; render(); };
  const sConfirm=app.querySelector("#smartConfirm"); if(sConfirm) sConfirm.onclick=commitSmartItems;
  app.querySelectorAll("[data-recipe-serv]").forEach(b=>{ b.onclick=()=>recipeScale(+b.dataset.recipeServ); });
  /* v1.85: selection, not removal — unchecking a row is the same intent and can be changed back. */
  app.querySelectorAll("[data-smart-sel]").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.smartSel;
    if(!smartItems[i]) return; smartItems[i].sel = (smartItems[i].sel===false); render(); }; });
  const sAll=app.querySelector("#smartToggleAll"); if(sAll) sAll.onclick=()=>{
    const any=smartItems.some(it=>it.sel!==false);
    smartItems.forEach(it=>{ it.sel = !any; }); render(); };
  app.querySelectorAll("[data-smart-edit]").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.smartEdit; smartEdit = (smartEdit===i ? null : i); smartWOpen=null; smartCOpen=null; render(); }; });
  app.querySelectorAll("[data-smart-wopen]").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.smartWopen; smartWOpen = (smartWOpen===i ? null : i); render(); edShowEnd(app.querySelector(".smartedit"), "unit"); }; });
  app.querySelectorAll("[data-smart-copen]").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.smartCopen; smartCOpen = (smartCOpen===i ? null : i); render(); edShowEnd(app.querySelector(".smartedit"), "cat"); }; });
  app.querySelectorAll("[data-smart-q]").forEach(b=>{ b.onclick=()=>{ const [i,d]=b.dataset.smartQ.split("|"); const it=smartItems[+i]; if(it){ it.qty=Math.max(1,Math.min(999,(it.qty||1)+(+d))); render(); } }; });
  app.querySelectorAll("[data-smart-cat]").forEach(b=>{ b.onclick=()=>{ const [i,cid]=b.dataset.smartCat.split("|"); const it=smartItems[+i]; if(it){ if(it.category!==cid) it.sub=""; it.category=cid; it.catPicked=true; smartCOpen=null; render(); } }; });
  app.querySelectorAll("[data-smart-name]").forEach(inp=>{ inp.oninput=()=>{ const it=smartItems[+inp.dataset.smartName]; if(!it) return; it.name=inp.value;
    const nm=inp.closest(".smartchip")&&inp.closest(".smartchip").querySelector(".smartchip-name");   // the head follows the name, still without a render
    if(nm) nm.innerHTML=`${(it.qty>1)?`<b>${it.qty}× </b>`:""}${it.weight?`<b>${esc(showAmt(it.weight))} </b>`:""}${esc(cap(it.name))}`; }; });   // no re-render: keep focus while typing
  app.querySelectorAll("[data-smart-addcat]").forEach(b=>{ b.onclick=()=>{ const it=smartItems[+b.dataset.smartAddcat]; if(!it) return; const nm=prompt(t("New category name:"),""); if(nm&&nm.trim()){ const id=makeCategory(nm); if(id){ it.category=id; it.sub=""; it.catPicked=true; smartCOpen=null; render(); } } }; });
  app.querySelectorAll("[data-smart-wstep]").forEach(b=>{ b.onclick=()=>{ const p=b.dataset.smartWstep.split("|"); const it=smartItems[+p[0]]; if(it){ it.weight=wStep(it.weight,p[1],+p[2]); render(); } }; });   // v2.76: smartWOpen stays
  app.querySelectorAll("[data-smart-wt]").forEach(b=>{ b.onclick=()=>{ const p=b.dataset.smartWt.split("|"); const i=+p[0], w=p[1]||""; const it=smartItems[i]; if(it){ it.weight = (it.weight===w ? "" : w); smartWOpen=null; render(); } }; });
  app.querySelectorAll("[data-smartsort]").forEach(b=>b.onclick=()=>{ setIngSort(b.dataset.smartsort); render(); });   // v2.08
}
function smartSheet(){
  let inner;
  if(smartLoading){
    inner=`<div role="status" style="padding:22px 4px;text-align:center;color:var(--muted);font-weight:700">✨ ${t(smartStep||"Reading your list…")}</div>`;
  } else if(smartError){
    inner=`<div style="padding:6px 2px 16px;color:var(--text);font-weight:600;line-height:1.5">${esc(t(smartError))}</div>
      <button class="optaction" id="smartOk">${t("OK")}</button>`;
  } else {
    const n=smartItems.length;
    const chipOf=(it,idx)=>{ const c=CAT(it.category); const open=smartEdit===idx;
      const have=state.items.some(i=>!i.checked && (i.name||"").toLowerCase()===it.name.toLowerCase());
      const editor = open ? `<div class="smartedit">
          <input class="edtitle" data-smart-name="${idx}" value="${esc(cap(it.name))}" autocomplete="off" autocapitalize="words" aria-label="${t("Item name")}" />
          <div class="edrows">${/* v2.74: the rows in cells, as in Edit item */""}
          <div class="edcell" data-row="qty"><div class="editsec edrow"><span class="editsec-l">${t("Quantity")}</span><span class="eqty"><button data-smart-q="${idx}|-1" aria-label="${t("Less")}">−</button><span>${it.qty||1}</span><button data-smart-q="${idx}|1" aria-label="${t("More")}">+</button></span></div></div>
          <div class="edcell" data-row="unit"${smartWOpen===idx?' data-open="1"':''}><button class="editsec" data-smart-wopen="${idx}" aria-expanded="${smartWOpen===idx}" aria-label="${t("Unit")}"><span class="editsec-l">${t("Unit")}</span><span class="editsec-v"><span class="edval">${it.weight ? esc(it.weight) : t("Unit")} <span class="editsec-ch">${smartWOpen===idx?'▾':'▸'}</span></span></span></button>
          ${smartWOpen===idx ? `<div class="wgrid">${WEIGHTS.map(w=>`<button class="catchip${((it.weight||"")===w)?' on':''}" data-smart-wt="${idx}|${esc(w)}">${w?esc(w):t("Unit")}</button>`).join("")}${wCounters("data-smart-wstep", idx, it.weight)}</div>` : ""}</div>
          <div class="edcell" data-row="cat"${smartCOpen===idx?' data-open="1"':''}><button class="editsec" data-smart-copen="${idx}" aria-expanded="${smartCOpen===idx}" aria-label="${t("Category")}"><span class="editsec-l">${t("Category")}</span><span class="editsec-v"><span class="edval">${catIcon(c,14)} ${esc(catLabel(c))} <span class="editsec-ch">${smartCOpen===idx?'▾':'▸'}</span></span></span></button>
          ${smartCOpen===idx ? `<div class="edchips">${catList().map(cc=>`<button class="catchip" data-smart-cat="${idx}|${cc.id}" style="${cc.id===it.category?`background:${cc.color};border-color:${cc.color};color:#fff`:''}">${catIcon(cc,13)} ${esc(catLabel(cc))}</button>`).join("")}<button class="catchip" data-smart-addcat="${idx}" style="border-style:dashed;font-weight:800">${t("＋ New")}</button></div>` : ""}</div>
          </div>
        </div>` : "";
      return `<div class="smartchip ${open?'open':''}${it.sel===false?' off':''}" style="border-left:4px solid ${c.color}">
        <div class="smartchip-top">
          <button class="smartchip-head" data-smart-edit="${idx}">
            ${/* v1.94: the collapsed row is a SUMMARY, so it converts like every other summary does.
                   The weight chips below it are the editor and deliberately stay literal — same split
                   as a shop pill and its quick-edit. Leaving this one alone would have shown "8 oz"
                   here and "225 g" on the pill it creates, one tap apart. */""}
            <span class="smartchip-name">${(it.qty>1)?`<b>${it.qty}× </b>`:""}${it.weight?`<b>${esc(showAmt(it.weight))} </b>`:""}${esc(cap(it.name))}${it.note?` <span class="smartchip-note">· ${esc(it.note)}</span>`:""}</span>
            ${have?`<span class="smartchip-have" title="${t("Already on your list")}">${t("in list")}</span>`:""}
            ${it.have?`<span class="smartchip-have" title="${it.haveDays===1?t("Bought 1 day ago — probably still in the cupboard"):tf("Bought {n} days ago — probably still in the cupboard", { n:it.haveDays })}">${t("probably have")}</span>`:""}
            <span class="smartchip-cat">${catIcon(c,13)} ${esc(catLabel(c))}</span>
            <span class="smartchip-caret" aria-hidden="true">▾</span>
          </button>
          <button class="smartcheck ${it.sel===false?'':'on'}" data-smart-sel="${idx}" role="checkbox" aria-checked="${it.sel===false?'false':'true'}" aria-label="${it.sel===false?tf('Add {x}', { x:esc(cap(it.name)) }):tf('Do not add {x}', { x:esc(cap(it.name)) })}">✓</button>
        </div>${editor}
      </div>`; };
    /* v2.08: a review that came from a recipe (or the week) can be read in recipe order or grouped by
       category — the same ml_ingsort choice as the recipe sheet. Only the DISPLAY order changes: every
       row keeps its own index, so select/edit still act on the right item. */
    const fromRecipe = !!smartServings || !!smartTitle;
    const byCat = fromRecipe && n>1 && ingSort()==="cat";
    let chips;
    if(byCat){ const ids=catList().map(c=>c.id);
      const groups=ids.concat([...new Set(smartItems.map(it=>it.category))].filter(id=>!ids.includes(id)));
      chips=groups.map(id=>{ const g=smartItems.map((it,idx)=>[it,idx]).filter(([it])=>it.category===id); if(!g.length) return "";
        const c=CAT(id); return `<p class="palabel recgroup">${esc(c ? catLabel(c) : t("Others"))} · ${g.length}</p>` + g.map(([it,idx])=>chipOf(it,idx)).join(""); }).join("");
    } else chips=smartItems.map(chipOf).join("");
    const sortRow = (fromRecipe && n>1) ? `<div class="recsort" role="group" aria-label="${t("Order ingredients")}"><button data-smartsort="recipe" class="${ingSort()==='recipe'?'on':''}" aria-pressed="${ingSort()==='recipe'?'true':'false'}">${t("Recipe order")}</button><button data-smartsort="cat" class="${ingSort()==='cat'?'on':''}" aria-pressed="${ingSort()==='cat'?'true':'false'}">${t("Category")}</button></div>` : "";
    const scaler = smartServings ? `<div class="servrow">
        <span class="servlbl">${t("Serves")}</span>
        <div class="qstep2"><button data-recipe-serv="-1" aria-label="${t("Fewer servings")}">−</button><span>${smartServings.target}</span><button data-recipe-serv="1" aria-label="${t("More servings")}">+</button></div>
        <span class="servnote">${tf("recipe makes {n} · quantities scale", { n:smartServings.src })}</span>
      </div>` : "";
    const nSel=smartItems.filter(it=>it.sel!==false).length;
    const head=`<div class="smarthd" style="justify-content:flex-end">
      <button id="smartToggleAll">${nSel?t("Deselect all"):t("Select all")}</button></div>`;
    inner=`${scaler}${head}${sortRow}<div class="smartchips">${chips}</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="optaction" id="smartCancel" style="flex:1">${t("Cancel")}</button>
        <button class="optaction" id="smartConfirm" style="flex:1;background:var(--accent);color:var(--on-accent);border-color:var(--accent)${nSel?'':';opacity:.4'}"${nSel?'':' disabled'}>${nSel===1?t('Add 1 item'):tf('Add {n} items', { n:nSel })}</button>
      </div>`;
  }
  const rec=!!smartServings || !!smartTitle;
  const ttl=(smartFromPhoto && !smartTitle) ? "📖 " + t("From your photo") : rec ? (smartTitle ? `📖 ${esc(smartTitle)}` : "📖 " + t("From recipe")) : "✨ " + t("Smart add");
  /* v1.85: only the Smart-add recipe path carries a servings scaler.
     v2.01: a planned recipe has servings now too, so it gets the scaler; the whole-week review does
     not (it mixes recipes), so the line must not promise a control that is not there. */
  return `<div class="sheet-bg" id="smartBg"><div class="sheet" id="smartSheetEl" data-look="smart">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${ttl}</div>
    ${inner}
  </div></div>`;
}
function commitSmartItems(){
  for(const it of smartItems){
    if(it.sel===false) continue;
    /* v2.70: the same item with a different note is a separate item — merge only when name AND note match */
    const ex=state.items.find(i=>!i.checked && i.name.toLowerCase()===it.name.toLowerCase() && noteKey(i.note)===noteKey(it.note));
    if(ex){ if(it.qty>1) ex.qty=(ex.qty||1)+it.qty; if(it.weight) ex.weight=it.weight; if(it.sub) ex.sub=it.sub; markDirty(ex.id); continue; }
    const nid=uid();
    const known=knownEntry(it.name);
    const sub=it.sub || ((known&&known.cat===it.category&&known.sub)||"");
    state.items.push({id:nid,name:it.name,qty:it.qty,cat:it.catPicked ? it.category : newCat(it.category, it.name),sub,weight:it.weight||"",note:it.note||"",checked:false,by:me});
    markDirty(nid);
  }
  const mi=document.getElementById("mainInput"); if(mi) mi.value="";
  draftMain="";
  smartOpen=false; smartItems=[]; smartError=""; smartEdit=null; smartWOpen=null; smartCOpen=null; smartServings=null; smartTitle=""; smartFromPhoto=false;
  save(); render();
}
/* B8 hidden AI diagnostics — long-press the version number to inspect the
   on-device learning (read-only): categorisation/sort tester, learned shop
   order per store, restock cadence. Plus a throwaway sandbox list. */
function diagItemInfo(name, cat, known){
  const c=CAT(cat)||{};
  const subId = cat==="meat" ? meatSub(name) : ((known&&known.sub)||"");     // `sub` on items is a subcategory id, not its label
  const subObj = subId ? ((c.subs||[]).find(s=>s.id===subId)) : null;
  const sub = subObj ? (subObj.label||"") : (cat==="meat" ? subId : "");     // resolve id → label; hide stale/unknown custom-sub ids
  const it={name,cat};
  const st=activeStore();
  return `<div style="line-height:1.75">
    <div>${t("Category:")} <b style="color:${c.color||'var(--ink)'}">${esc(c.emoji||'')} ${esc(catLabel(c)||cat)}</b> <span style="color:var(--muted2)">(${known?t('remembered'):t('guessed')})</span></div>
    ${cat==="meat"?`<div>${t("Meat group:")} <b>${esc(sub||subId)}</b></div>`:(sub?`<div>${t("Subcategory:")} <b>${esc(sub)}</b></div>`:"")}
    <div>${t("Aisle rank")}${st?` @ ${esc(st.name)}`:` <span style="color:var(--muted2)">${t("(category order)")}</span>`}: <b>${aisleRank(it)}</b></div>
    <div>${t("AI rank:")} <b>${aiRank(it)}</b>${aiSortOK()?"":` <span style="color:var(--muted2)">${t("— AI off at Home/Other")}</span>`}</div>
  </div>`;
}
function diagProbeHTML(raw){
  const name=(raw||"").trim();
  if(!name) return `<span style="color:var(--muted2)">${t("Type an item above to see how it's filed and where it sorts.")}</span>`;
  const known=knownEntry(name);
  const cat=(known&&known.cat)||guessCat(name)||"others";
  return diagItemInfo(name, cat, known);
}
function diagAIHTML(){
  const keys=[...new Set([...Object.keys(aiItems||{}), ...Object.keys(aiOrder||{})])];
  if(!keys.length) return `<span style="color:var(--muted2)">${t("No AI order learned yet — check items off in shop mode at a store.")}</span>`;
  return keys.map(k=>{ const nm=(storeById(k)||{}).name||k;
    const im=aiItems[k]||{}; const items=Object.keys(im).sort((a,b)=>im[a]-im[b]).map(ik=>esc(cap(ik.split("|")[0])));
    const catSeq=aiSeq(aiOrder,k).map(x=>esc(catLabel(CAT(x))||x)).join(" → ")||"—";
    return `<div style="margin:9px 0"><b>${esc(nm)}</b>
      <div style="color:var(--muted2);font-size:11px;margin-top:2px">${t("Item route (learned check order)")}</div>
      <div style="color:var(--muted)">${items.length?items.join(" → "):"—"}</div>
      <div style="color:var(--muted2);font-size:11px;margin-top:4px">${t("Categories")}</div>
      <div style="color:var(--muted)">${catSeq}</div></div>`; }).join("");
}
function diagPredictHTML(){
  const keys=Object.keys(purch||{});
  if(!keys.length) return `<span style="color:var(--muted2)">${t("No purchase history yet — clear checked items to log a shop.")}</span>`;
  const rows=keys.map(k=>{ const r=purch[k]; const cad=cadenceOf(r); const days=cad?Math.round(cad/DAY_MS):0;
    const last=(r.ts&&r.ts.length)?r.ts[r.ts.length-1]:0; const ago=last?Math.round((Date.now()-last)/DAY_MS):null;
    return {key:k,name:r.name,cat:r.cat,days,ago,buys:(r.ts||[]).length}; });
  rows.sort((a,b)=>{                                                    // unknown cadence (days 0) always sinks to the bottom of cadence sorts
    if(diagPredSort==="short"||diagPredSort==="long"){ const au=!a.days,bu=!b.days; if(au!==bu) return au?1:-1;
      if(a.days!==b.days) return diagPredSort==="short"? a.days-b.days : b.days-a.days; return a.name.localeCompare(b.name); }
    return a.name.localeCompare(b.name);                               // "az" (default)
  });
  const allOpen=rows.every(r=>diagPredExpand.has(r.key));
  const sortBtn=(m,lbl)=>`<button data-diag-sort="${m}" style="background:${diagPredSort===m?'var(--accent)':'transparent'};color:${diagPredSort===m?'#fff':'var(--muted)'};border:1px solid var(--line);border-radius:999px;font-size:11px;font-weight:700;padding:3px 9px;cursor:pointer">${lbl}</button>`;
  const controls=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
    <span style="font-size:11px;color:var(--muted2)">${t("Sort")}</span>${sortBtn("az","A–Z")}${sortBtn("short",t("Short"))}${sortBtn("long",t("Long"))}
    <button id="diagPredToggleAll" style="margin-left:auto;background:none;border:none;color:var(--accent);font-weight:700;font-size:12px;cursor:pointer;padding:2px 2px">${allOpen?t("Collapse all"):t("Expand all")}</button></div>`;
  return controls + rows.map(r=>{ const open=diagPredExpand.has(r.key);
    return `<div data-diag-pred="${esc(r.key)}" style="padding:5px 0;border-bottom:1px solid var(--line);cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span>${open?"▾ ":"▸ "}${esc(cap(r.name))}</span>
        <span style="color:var(--muted);white-space:nowrap">${r.days?tf("~{n}d", { n:r.days }):(r.buys===1?t("1 buy"):tf("{n} buys", { n:r.buys }))}${r.ago!=null?` · ${tf("{n}d ago", { n:r.ago })}`:""}</span></div>
      ${open?`<div style="margin-top:6px;padding:8px 10px;background:var(--card);border-radius:10px;font-size:13px">${diagItemInfo(r.name, r.cat, knownEntry(r.name))}</div>`:""}
    </div>`; }).join("");
}
function diagStoreHTML(){
  const n=(state.buyAgain||[]).length; const pct=BA_CAP?Math.round(n/BA_CAP*100):0;
  return `<div>${t("Saved items:")} <b>${n}</b> ${tf("of {n}", { n:BA_CAP })} <span style="color:var(--muted2)">${tf("({n}% full)", { n:pct })}</span></div>
    <div style="height:6px;border-radius:3px;background:var(--line);margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct)}%;background:var(--accent)"></div></div>
    <div style="font-size:11px;color:var(--muted2);margin-top:6px;line-height:1.5">${t("Shared Buy-again items across the household.")} ${n>=BA_CAP?t("Cap reached — oldest items drop off first."):tf("Room for {n} more.", { n:BA_CAP-n })}</div>`;
}
function openSandbox(){ const code="sbx-"+(((me||"me").toLowerCase().replace(/[^a-z0-9]/g,"")||"me").slice(0,6));
  rememberList(code,"Sandbox"); diagOpen=false; optOpen=false; switchList(code); }
function diagSheet(){ const hd=x=>`<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 6px">${t(x)}</div>`;
  return `<div class="sheet-bg" id="diagBg"><div class="sheet" id="diagSheetEl" style="max-height:84vh;overflow:auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div class="disp" style="font-weight:800;font-size:17px">${FLASK_SVG(16)} ${t("AI diagnostics")}</div>
      <button id="diagClose" class="iconbtn" aria-label="${t("Close")}">✕</button></div>
    <div style="font-size:11px;color:var(--muted2)">${t("Read-only")} · ${esc(APP_VERSION)}</div>
    ${(()=>{ const ls=getLists(); return ls.length>1 ? `${hd("List")}<div class="storegrid">${ls.map(l=>`<button data-diag-list="${esc(l.code)}" class="storechip ${l.code===listCode?'on':''}">${esc(l.name||l.code)}</button>`).join("")}</div><div style="font-size:11px;color:var(--muted2);margin-top:6px">${t("Inspecting this list's items, categories &amp; buy-again. Learned shop order is per-device; restock history is shared with everyone on this list.")}</div>` : ""; })()}
    ${hd("Entry tester")}
    <input id="diagProbe" placeholder="${t("Type an item…")}" autocomplete="off" autocapitalize="none" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:14px" />
    <div id="diagProbeOut" style="margin-top:8px;font-size:13px">${diagProbeHTML("")}</div>
    ${hd("Buy-again storage")}<div style="font-size:13px">${diagStoreHTML()}</div>
    ${hd("AI shop order — per store")}<div style="font-size:13px">${diagAIHTML()}</div>
    ${hd("Restock cadence")}
    <div style="font-size:11.5px;color:var(--muted2);margin:-2px 2px 9px;line-height:1.65">
      ${t("Each row reads <b>cadence · last bought</b>.")}<br>
      <b>${tf("~{n}d", { n:5 })}</b> — ${t("estimated restock interval: the typical gap between your buys (median of your last purchases). Needs 2+ buys to estimate.")}<br>
      <b>${tf("{n} buys", { n:3 })}</b> — ${t("shown <i>instead</i> of an interval when there's too little history yet (fewer than 2 buys to compare).")}<br>
      <b>· ${tf("{n}d ago", { n:3 })}</b> — ${t("days since you last bought it.")}<br>
      ${t("An item is suggested to restock once “days ago” reaches about its interval (≈85%), on your reminder day (Settings › Predictions).")}
    </div>
    <div style="font-size:13px">${diagPredictHTML()}</div>
    ${Object.keys(purch||{}).length ? `<button class="optaction" id="diagResetPredict" style="margin-top:10px">♻︎ ${t("Reset restock history")}${configured?' — '+t('everyone on this list'):''}</button>` : ""}
    <button class="optaction" id="diagSandbox" style="margin-top:16px">${FLASK_SVG(16)} ${t("Open a sandbox list")}</button>
    <div style="font-size:11px;color:var(--muted2);margin-top:8px;line-height:1.5">${t("A separate throwaway list to test entry, sorting &amp; predictions without touching your real list. Delete it anytime from Lists (press &amp; hold).")}</div>
  </div></div>`;
}
let histView = null;   // v1.51: which list the History section is showing; null = the one you are in
/* v1.52: the history is grouped into collapsible periods. `histOpen` is deliberately in-memory rather
   than persisted — "collapse automatically" means every visit starts folded up, so a long log is a
   short list of periods you open one at a time instead of a wall of rows. */
let histGroup = localStorage.getItem("ml_histgroup") || "day";   // day | week | month
let histOpen = new Set();
function setHistGroup(g){ histGroup=g; try{ localStorage.setItem("ml_histgroup", g); }catch(e){} histOpen=new Set(); render(); }
/* The period a timestamp belongs to, as a stable key plus the label to show. Weeks start on Monday
   (getDay() is Sunday-based, hence the +6)/7 shuffle). */
function histPeriod(ts){
  const d=new Date(ts||0);
  if(histGroup==="month") return { k:d.getFullYear()+"-"+d.getMonth(),
    label:d.toLocaleDateString(dateLoc(),{month:"long",year:"numeric"}) };
  if(histGroup==="week"){
    const m=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    m.setDate(m.getDate() - ((m.getDay()+6)%7));
    return { k:"w"+m.getFullYear()+"-"+m.getMonth()+"-"+m.getDate(),
      label:tf("Week of {x}", { x:m.toLocaleDateString(dateLoc(),{day:"numeric",month:"short"}) }) };
  }
  return { k:d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate(),
    label:d.toLocaleDateString(dateLoc(),{weekday:"short",day:"numeric",month:"short"}) };
}
/* v1.62 item 4: five looks that between them cover the range — a soft default, a flat monochrome, a
   dark one, a dense one for a long list, and a big-and-airy one. They live in the last five slots and
   are overwritten the moment the user saves over them, so they are a starting point rather than
   furniture. Keys only: each is exactly what "Save to" would have captured. */
const APP_PRESETS = [
  { name:"Market", keys:{ ml_theme:"light", ml_wall:"", ml_fill:"accent", ml_fill_v141:"1", ml_accent:"orange",
      ml_tilerad:"12", ml_gapx:"8", ml_gapy:"8", ml_caton:"1", ml_catemoji:"1", ml_itememoji:"1" } },
  { name:"Paper",  keys:{ ml_theme:"light", ml_wall:"", ml_fill:"empty", ml_fill_v141:"1", ml_accent:"black",
      ml_tilerad:"4", ml_gapx:"6", ml_gapy:"6", ml_caton:"1", ml_catemoji:"0", ml_itememoji:"0" } },
  { name:"Night",  keys:{ ml_theme:"dark", ml_wall:"", ml_fill:"full", ml_fill_v141:"1", ml_accent:"white",
      ml_tilerad:"18", ml_gapx:"8", ml_gapy:"8", ml_tilebgcalm:"1", ml_caton:"1", ml_catemoji:"1", ml_itememoji:"1" } },
  { name:"Compact",keys:{ ml_theme:"light", ml_wall:"", ml_fill:"accent", ml_fill_v141:"1", ml_accent:"green",
      ml_tilerad:"8", ml_gapx:"2", ml_gapy:"2", ml_padt:"2", ml_largecols:"2",
      ml_displays:JSON.stringify({cat:"large",flat:"large"}), ml_densities:JSON.stringify({cat:0.9,flat:0.9}),
      ml_caton:"1", ml_catemoji:"1", ml_itememoji:"0" } },
  { name:"Airy",   keys:{ ml_theme:"light", ml_wall:"wall-3", ml_wallpos:"bottom", ml_fill:"empty", ml_fill_v141:"1",
      ml_accent:"sand", ml_tilerad:"22", ml_gapx:"14", ml_gapy:"14", ml_padl:"20", ml_padr:"20", ml_padt:"14",
      ml_largecols:"1", ml_displays:JSON.stringify({cat:"large",flat:"large"}),
      ml_densities:JSON.stringify({cat:1.1,flat:1.1}), ml_caton:"1", ml_catemoji:"1", ml_itememoji:"1" } }
];
/* v1.62 item 4: nine slots, and the last five ship filled with curated looks (see APP_PRESETS). */
const APP_SLOTS = 9;
/* v1.62 item 4: "record all settings" — an explicit include list kept missing whatever was added
   last, which is exactly what the user hit. The definition is inverted: a slot captures every ml_*
   key EXCEPT the ones that are data, identity or per-session state. Anything new is therefore
   captured by default, and the only thing to maintain is the short list of what a look must not
   carry with it.
   v1.63 item 3: `ml_app` (unanchored) covers every slot key at once — ml_appslots, ml_appsel,
   ml_appstart, ml_appdef, ml_appmig163 — so restoring a look can never rearrange the slots or re-arm
   the migration. The learning and data keys are matched by PREFIX, not anchored: loadLearn stores
   them per list as `ml_purch_<code>`, `ml_aiorder_<code>` and so on, so an anchored `ml_purch$` matched
   nothing that actually exists and every list's purchase history was being deleted. They (ml_purch*,
   ml_ai*, ml_predict*, ml_store*,
   ml_lastview) are listed because applyStoredAppearance DELETES everything it does not exclude, and
   since v1.63 that clear runs at every launch: a look must never take your history, your stores or
   your learned route with it. Keep this in step with APP_EXCLUDE_BOOT at the top of the module. */
const APP_EXCLUDE = /^(ml_cache_|ml_collapse_|ml_hist_|ml_ai|ml_predict|ml_purch|ml_store|ml_atstore|ml_merge_|ml_lists$|ml_lastlist$|ml_lastview[23]?$|ml_me$|ml_shop$|ml_kbh$|ml_app|ml_numdef$|ml_units$|ml_optcoll$|ml_mealslots$|ml_recopen$|ml_recsort$|ml_ingsort$|ml_rcptday$|ml_rptday$|ml_crashday$|ml_installhint$|ml_snap_|ml_wakelock$|ml_rcptnudge$|ml_rcptask$|ml_tenhide$|ml_cmphide$|ml_sayshop$|ml_lookseen$|ml_aisleday$|ml_cards$|ml_lastcart$|ml_cardnudge$|ml_cardask$|ml_stucklog$|ml_cardview$|ml_signinemail$|ml_lang$|ml_sharepx$|ml_onb$|ml_gonelists$|ml_micdenied$|ml_nosmall$|ml_lastoutside$|ml_siriSmart$|ml_prefsseen$|ml_nocard$|ml_jk_)/;
function appearanceSnapshot(){ const o={};
  for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
    if(k && k.indexOf("ml_")===0 && !APP_EXCLUDE.test(k)) o[k]=localStorage.getItem(k); }
  return o; }
function appSlots(){ let a=null;
  try{ a=JSON.parse(localStorage.getItem("ml_appslots")||"null"); }catch(e){}
  if(!Array.isArray(a)){
    a=[];
    try{ const old=JSON.parse(localStorage.getItem("ml_appdef")||"null"); if(old&&typeof old==="object") a[0]=old; }catch(e){}
  }
  const out=[]; for(let i=0;i<APP_SLOTS;i++) out[i]=a[i]||null;
  /* the five curated looks fill any of the last five slots the user has not written to themselves */
  APP_PRESETS.forEach((p,n)=>{ const idx=APP_SLOTS-APP_PRESETS.length+n; if(!out[idx]) out[idx]={ __preset:p.name, ...p.keys }; });
  return out; }
function appSel(){ return localStorage.getItem("ml_appsel"); }
function appStart(){ const v=localStorage.getItem("ml_appstart"); return v===null ? null : v; }
function setAppStart(v){ try{ if(v==="" || v===null) localStorage.removeItem("ml_appstart");
    else { materialiseAppSlots(); localStorage.setItem("ml_appstart", String(v)); } }catch(e){}
  showToast(v===""||v===null ? "Opens where you left off" : "Opens in slot "+(+v+1)); render(); }
/* v1.63 item 3: "record all the current use, slots 1 to 9". Until now the five curated looks were
   COMPUTED at read time and only existed in storage once you saved over them, and an untouched user
   slot was a null. Both are written out as real records here, so all nine are things that exist and
   can be swapped, started from, or overwritten. A slot with nothing in it records the look that is
   in use right now rather than staying empty — recording all nine means all nine. */
function materialiseAppSlots(){
  const cur=appearanceSnapshot();
  const out=appSlots().map(s=> s ? s : {...cur});
  try{ localStorage.setItem("ml_appslots", JSON.stringify(out)); }catch(e){}
  return out;
}
/* v1.63 item 3: a one-time move, run once per device. Slot 4 and slot 1 exchange contents and the new
   slot 1 becomes the look the app starts in. Guarded by its own key (matched by the ml_app exclusion,
   so restoring a look can never re-arm it). */
function migrateAppSlots163(){
  if(localStorage.getItem("ml_appmig163")==="1") return false;
  try{ localStorage.setItem("ml_appmig163","1"); }catch(e){}
  const a=materialiseAppSlots();
  const t=a[0]; a[0]=a[3]; a[3]=t;
  try{ localStorage.setItem("ml_appslots", JSON.stringify(a));
       localStorage.setItem("ml_appstart","0"); localStorage.setItem("ml_appsel","0"); }catch(e){}
  return true;
}
function saveAppSlot(i){ const a=materialiseAppSlots(); a[i]=appearanceSnapshot();
  try{ localStorage.setItem("ml_appslots", JSON.stringify(a)); localStorage.setItem("ml_appsel", String(i)); }catch(e){}
  try{ localStorage.removeItem("ml_appdef"); }catch(e){}
  showToast(tf("Saved to slot {n}", { n:i+1 }));
  render(); }
function useAppSlot(i){ const a=appSlots(); if(!a[i]) return;
  try{ localStorage.setItem("ml_appsel", String(i)); }catch(e){}
  applyStoredAppearance(a[i]); }
/* Restoring reloads rather than reassigning. Roughly twenty module-level `let`s are read once at boot
   from these keys (theme, wall, accent, fill, catOn, densities, displays …); writing the storage and
   hand-patching each global is the kind of list that silently falls out of step the next time a
   setting is added. The boot path already rebuilds all of it from localStorage in a few milliseconds,
   so let it. */
/* v1.62 item 4: the clear uses the same exclusion rule as the snapshot, so what a look replaces and
   what it captures can never drift apart. */
function applyStoredAppearance(o){
  const kill=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
    if(k && k.indexOf("ml_")===0 && !APP_EXCLUDE.test(k)) kill.push(k); }
  kill.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  if(o) Object.keys(o).forEach(k=>{ if(k!=="__preset" && !APP_EXCLUDE.test(k)){ try{ localStorage.setItem(k, o[k]); }catch(e){} } });
  try{ location.reload(); }catch(e){ render(); }
}
/* v1.57 item 2: a factory reset resets the LOOK and nothing else — `ml_appslots` is deliberately
   excluded from the sweep, so the saved looks survive it. */
function factoryAppearance(){ try{ localStorage.removeItem("ml_appsel"); }catch(e){} applyStoredAppearance(null); }
function optionsBody(){
  const row=(label,control)=>`<div class="optrow"><span class="optlabel">${label}</span><span class="optctrl">${control}</span></div>`;
  const rowNL=(label,control)=>`<div class="optrow optnl"><span class="optlabel">${label}</span><span class="optctrl">${control}</span></div>`;   // v1.29 no dividing line
  /* v1.54 item 1: one stepper, driven by the NUMOPT table so the label, bounds and units all come
     from a single place. */
  const numCtl=k=>`<div class="seg"><button data-opt-num="${k}" data-opt-delta="-1" aria-label="${t("Less")}">−</button><span class="numval">${numVal(k)}</span><button data-opt-num="${k}" data-opt-delta="1" aria-label="${t("More")}">+</button></div>`;
  const numCell=k=>`<div class="numcell"><span>${t(NUMOPT[k].label)}</span>${numCtl(k)}</div>`;
  /* v1.57 item 2: one layout for every colour picker, so Auto, the steps and the swatches land in the same
     places on every row. Ten swatches cannot fit beside a label at 390px — what makes the rows look
     aligned is that they all WRAP the same way, which a fixed grid guarantees and a flex row does not. */
  /* v1.75 item 1: the Calm switch that used to sit in every row is gone; its place in the grid is
     taken by the Darker/Lighter pair, which now renders on every row including Auto. `ck` is the
     SHADE_KEYS name of the row — the key the level is stored under. */
  const colRow=(label, attr, cur, ck, opts)=>{
    const o=opts||{};
    const pal=o.pal||ACCENTS;
    const sw=k=>`<button data-${attr}="${k}" class="colsw ${cur===k?'on':''}" style="background:${pal[k]}" aria-label="${k}" title="${k}"></button>`;
    return `<div class="optrow optnl optrow-col"><span class="optlabel">${label}</span><div class="colgrid">
      <button data-${attr}="auto" class="colbtn2 colspan3 ${cur==='auto'?'on':''}">${t("Auto")}</button>`
      + `${o.page?`<button data-${attr}="page" class="colsw colsw-page ${cur==='page'?'on':''}" aria-label="${t("Page")}" title="${t("Match the page background")}"></button>`:""}`
      + `${(()=>{ const isHex = typeof cur==="string" && cur.charAt(0)==="#";
            return `<label class="colsw colcustom ${isHex?'on':''}" title="${t("Any colour")}"`
              + ` style="${isHex?`background:${cur}`:''}">`
              + `<input type="color" data-opt-custom="${attr}" value="${isHex?cur:'#888888'}" aria-label="${t("Custom colour")}"></label>`; })()}`
      + `${(()=>{
            /* v1.75 item 1: the step is the row's only control on Auto, so it has to render there too.
               With a colour to step from it still COMMITS a hex, exactly as v1.72 shipped it — the
               value is real and the button previews it. On Auto there is no one colour (the theme or
               the category decides, and each category is different), so there is nothing honest to
               preview: the step is stored as a level instead and the chip stays plain, with the count
               shown once it is off zero so the row says how far it has been moved. */
            const lv=shadeOn[ck]||0;
            if(cur==='auto'){
              const step=(d,lbl)=>`<button data-opt-shade="${ck}|${d}" class="colbtn2 colspan3 colstep`
                + `${(d<0?lv<0:lv>0)?' on':''}" aria-label="${lbl}" title="${lbl}"`
                + `${(d<0?lv<=-SHADE_MAX:lv>=SHADE_MAX)?' disabled':''}>${lbl}${(d<0?lv<0:lv>0)?' '+Math.abs(lv):''}</button>`;
              return step(-1,t("Darker"))+step(1,t("Lighter"));
            }
            const base = pickHex(cur, pal);
            if(!base || base.charAt(0)!=='#') return "";
            const lo = shadeHex(base,-1), hi = shadeHex(base,1);
            /* v1.73: labelled, not just coloured. Two bare circles among eleven palette circles read
               as two more palette colours; the words say what they do. They still wear the colour
               they would produce, with the label in whatever contrasts with it, so the button is its
               own preview — onAccent already answers "black or white on this?". */
            const chip=(v,lbl)=> (!v || v.toLowerCase()===base.toLowerCase()) ? ""
              : `<button data-${attr}="${v}" class="colbtn2 colspan3 colstep" aria-label="${lbl}" title="${lbl}"`
                + ` style="background:${v};border-color:${v};color:${onAccent(v)}">${lbl}</button>`;
            return chip(lo,t("Darker")) + chip(hi,t("Lighter")); })()}`
      + `${Object.keys(pal).map(sw).join("")}</div></div>`;
  };
  /* v1.80: a colour row for a tile of your own. Deliberately NOT a parameter on colRow above: that one
     is load-bearing for sixteen fixed rows whose attribute names and SHADE_KEYS entries are fixed
     strings, and a user tile has neither — its colour and its step live on the tile object, keyed by
     id. Generalising colRow to take both shapes would put all sixteen at risk for the one row that is
     not like them, so this emits the SAME classes and looks identical while carrying its own
     attributes. */
  const tileColRow=(tl)=>{
    const pal=ACCENTS, cur=tl.col, lv=parseInt(tl.shade,10)||0;
    const sw=k=>`<button data-tile-col="${tl.id}|${k}" class="colsw ${cur===k?'on':''}" style="background:${pal[k]}" aria-label="${k}" title="${k}"></button>`;
    const isHex = typeof cur==="string" && cur.charAt(0)==="#";
    const step=(d,lbl)=>`<button data-tile-shade="${tl.id}|${d}" class="colbtn2 colspan3 colstep`
      + `${(d<0?lv<0:lv>0)?' on':''}" aria-label="${lbl}" title="${lbl}"`
      + `${(d<0?lv<=-SHADE_MAX:lv>=SHADE_MAX)?' disabled':''}>${lbl}${(d<0?lv<0:lv>0)?' '+Math.abs(lv):''}</button>`;
    return `<div class="optrow optnl optrow-col"><span class="optlabel">${t("Colour")}</span><div class="colgrid">
      <button data-tile-col="${tl.id}|auto" class="colbtn2 colspan3 ${cur==='auto'?'on':''}">${t("Auto")}</button>`
      + `<label class="colsw colcustom ${isHex?'on':''}" title="${t("Any colour")}" style="${isHex?`background:${cur}`:''}">`
      + `<input type="color" data-tile-custom="${tl.id}" value="${isHex?cur:'#888888'}" aria-label="${t("Custom colour")}"></label>`
      + step(-1,t("Darker")) + step(1,t("Lighter"))
      + `${Object.keys(pal).map(sw).join("")}</div></div>`;
  };
  const subhead=x=>`<div class="optsub">${t(x)}</div>`;
  /* v1.12 grouped settings; v1.29 the HR variant.
     v1.77 item 3: a section header is a button now, and the rows under it are folded into a body by
     groupOptions() after the render. Settings is sixteen colour rows long since v1.76 — an index you
     can close is the difference between a panel and a wall. */
  /* v1.79 item 4: the two helpers emit the same header now — the rule is on .optsect itself and the
     first header suppresses it in CSS. Both names stay because they are called from many places. */
  const sectHR=h=>`<button class="optsect" data-sect="${esc(h)}">${t(h)}<span class="optcaret" aria-hidden="true"></span></button>`;
  const sect=sectHR;
  let curSort = (displayFor()==="cat" && (sortModeFor()==="location"||sortModeFor()==="ai")) ? "cat" : sortModeFor();
  if(curSort==="ai" && !aiSortOK()) curSort="location";
  return `
    ${view!=="lists" ? `<div class="optsearch${optQuery?' has':''}"><span class="optsearch-ic" aria-hidden="true">${SEARCH_SVG}</span><input id="optSearch" type="search" placeholder="${t("Search settings")}" aria-label="${t("Search settings")}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${esc(optQuery)}"><button id="optSearchClear" type="button" aria-label="Clear search">×</button></div>
    <p class="optnone" id="optNoMatch" role="status" hidden></p>` : ""}
    ${/* v2.56 item 1: Language sits above every section, where the household looks first (it was folded
          inside Appearance and nobody found it). Outside any section, so filterOptions matches it on its own
          — by "Language" and "Langue" whichever language is showing. */""}
    <div class="optrow optnl optlangtop" data-layer="main" data-find="Language Langue"><span class="optlabel">${t("Language")}</span><span class="optctrl"><div class="seg">${LANGS.map(l=>`<button data-opt-lang="${l.code}" lang="${l.code}" class="${appLang===l.code?'on':''}">${l.name}</button>`).join("")}</div></span></div>
    ${sect("Appearance")}
    ${rowNL(t("Theme"), `<div class="seg segfull" style="flex-wrap:wrap">${
      [{k:"light",label:"Light",bg:"#F6F2E7",br:"#DAD3C0",dot:"#D2542B"},
       {k:"dark", label:"Dark", bg:"#141C18",br:"#33433B",dot:"#E2502C"}]
      .map(th=>`<button data-opt-theme="${th.k}" class="themebtn ${theme===th.k?'on':''}"><span class="themesw" style="background:${th.bg};border-color:${th.br}"><i style="background:${accentHex()||th.dot}"></i></span>${t(th.label)}</button>`).join("")
    }</div>`)}
    ${/* v1.57 item 2: no rule after Wallpaper in either case. Theme, Wallpaper and Text size are the
          three controls that change the whole page at once, so they read as one group and nothing
          separates them — including when there is no wallpaper and Text size follows directly. */""}
    ${rowNL(t("Wallpaper"), `<div class="wallrow">${[{v:"",label:t("None")},{v:"wall-1"},{v:"wall-2"},{v:"wall-3"},{v:"wall-4"},
      {v:"wall-blue"},{v:"wall-yellow"},{v:"wall-pink"},{v:"wall-grey"}]
      .map(w=>`<button data-opt-wall="${w.v}" class="wallbtn ${wall===w.v?'on':''}" aria-label="${esc(w.label||w.v)}" style="${
        !w.v ? "" : (WALL_TINTS[w.v]
          ? `background-image:url('img/${TINT_BAND[w.v]}-${wallPos}.jpg'), ${WALL_TINTS[w.v]};background-blend-mode:luminosity, normal;background-position:center ${wallPos==='bottom'?'bottom':'top'}`
          : `background-image:url('img/${w.v}-${wallPos}.jpg');background-position:center ${wallPos==='bottom'?'bottom':'top'}`)
      }">${w.label||''}</button>`).join("")}${
      /* v1.71: the swatch previews the truth — the flat colour the page will actually be, not a ramp
         with a photo band over it that the page no longer paints. */
      (()=>{ const isHex = typeof wall==="string" && wall.charAt(0)==="#";
        return `<label class="wallbtn wallcustom ${isHex?'on':''}" title="${t("Any colour")}" style="${isHex
          ? `background-image:none;background-color:${wall}`
          : ''}"><input type="color" data-opt-wallcustom value="${isHex?wall:'#7BA05B'}" aria-label="${t("Custom wallpaper colour")}"></label>`; })()
      }${
      /* v1.72: step the wallpaper toward white or black, the same as any other colour. Only for a
         custom colour: a shipped tint is a photograph with a ramp, and there is no single value to
         step from. */
      (()=>{ const isHex = typeof wall==="string" && wall.charAt(0)==="#";
        if(!isHex) return "";
        const lo=shadeHex(wall,-1), hi=shadeHex(wall,1);
        const chip=(v,lbl)=> (!v || v.toLowerCase()===wall.toLowerCase()) ? ""
          : `<button data-opt-wall="${v}" class="wallbtn wallstep" aria-label="${lbl}" title="${lbl}"`
            + ` style="background-image:none;background-color:${v};color:${onAccent(v)}">${lbl}</button>`;
        return chip(lo,t("Darker"))+chip(hi,t("Lighter")); })()
      }</div>`)}
    ${wall ? rowNL(t("Wallpaper items"), `<div class="seg"><button data-opt-wallpos="top" class="${wallPos==='top'?'on':''}">${t("Top")}</button><button data-opt-wallpos="bottom" class="${wallPos==='bottom'?'on':''}">${t("Bottom")}</button></div>`) : ""}
    ${/* v1.57 item 2: Text size sits with the wallpaper and the theme — the three things that change
          the whole page at once — and with no rule between them, because they are one group. */""}
    ${rowNL(t("Text size"), `<div class="seg"><button id="optZoomMinus">−</button><span style="min-width:46px;display:flex;align-items:center;justify-content:center;font-weight:800">${Math.round(dens()*100)}%</span><button id="optZoomPlus">+</button></div>`)}
    ${/* v2.00 item 2: the appearance slots, the margin steppers and the page-transition controls
          are real preferences, but they are not what someone opens Settings to find — and they sat
          in front of Sort and Smart add. Their own section, folded by default. */""}
    <button class="optaction optlookbtn" id="optLook"><span class="olb-t"><span>${t("Customise the look")}</span><span class="olb-s">${t("Layout, colours, bars, headings and tiles")}</span></span><span class="olb-c" aria-hidden="true">›</span></button>
    ${sectHR("Layout & motion")}
    ${me ? `<button class="optaction" id="optLookSend" style="margin:2px 0 6px">${/* v2.26 */""}${t("Send this look to my other phones")}</button>
    <div style="margin:0 2px 12px;font-size:12.5px;color:var(--muted2);font-weight:600">${tf("Open the list on your other phone as {me} and it offers this look, once. Only the look travels — not your list or settings.", { me:esc(me) })}</div>` : ""}
    ${/* v1.57 item 2: four slots. One saved look was not enough to compare two ideas — which is what
          anyone actually does with this. Applying is one tap; saving is a deliberate second row, so a
          mis-tap costs you a preview rather than the look you had. */""}
    <div class="optrow optrow-wide optnl optrow-slots"><span class="optlabel">${t("My appearance")}</span><div class="optwide">
      <div class="slotrow"><span class="slotcap">${t("Use")}</span><div class="slotgrid">${
        appSlots().map((s,i)=>`<button data-app-use="${i}" class="colbtn2 slotbtn ${s?'':'empty'} ${String(appSel())===String(i)?'on':''} ${String(appStart())===String(i)?'start':''}" ${s?'':'disabled'} title="${s&&s.__preset?esc(s.__preset):tf('Slot {n}', { n:i+1 })}">${s&&s.__preset?esc(s.__preset):(i+1)}</button>`).join("")}</div></div>
      <div class="slotrow"><span class="slotcap">${t("Save to")}</span><div class="slotgrid">${
        [...Array(APP_SLOTS)].map((_,i)=>`<button data-app-save="${i}" class="colbtn2 slotbtn ${appSaveAsk===i?'on':''}">${i+1}</button>`).join("")}</div></div>
      ${appSaveAsk===null ? "" : `<div class="slotrow"><span class="slotcap"></span><div class="slotgrid slotask">
        <span class="slotasktxt">${tf("Replace slot {n}?", { n:appSaveAsk+1 })}</span>
        <button data-app-saveyes="${appSaveAsk}" class="colbtn2 slotbtn on">${t("Save")}</button>
        <button data-app-saveno="1" class="colbtn2 slotbtn">${t("Cancel")}</button></div></div>`}
      ${/* v1.63 item 3: which slot the app opens in. A third row of nine buttons would have made this
            one block half the Appearance section, and it never needed nine: the slot you want to start
            in is the one you are using, so this marks THAT one. Off (the default) is how the app has
            always behaved — it opens with whatever you last left it as. With a start slot set, anything
            you change afterwards is a try-out that lasts until the next launch, which is the point.
            Which slot it is stays visible as a ring on the Use row above. */""}
      <div class="numbtns"><button data-app-starthere="1" class="colbtn2 ${appStart()!==null&&appStart()===String(appSel())?'on':''}">${
        appStart()===null ? t("Start in this slot")
        : appStart()===String(appSel()) ? t("Starts in this slot")
        : tf("Start in this slot (now {n})", { n:+appStart()+1 })}</button><button id="optAppFactory" class="colbtn2">${t("Factory default")}</button></div></div></div>
    ${/* v1.79 item 3: Page margins moved out of Tiles and in with the other settings that resize
          everything at once — it measures the whole page, not a tile.
          v2.00: no longer beside Text size; the appearance machinery moved one section down, under
          the folded "Layout & motion", and Page margins moved with it. */""}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Page margins")}</span><div class="optwide">
      <div class="numgrid">${numCell("padl")}${numCell("padr")}${numCell("padt")}${numCell("padb")}</div>
      <div class="numbtns"><button id="optNumSave" class="colbtn2">${t("Set as my default")}</button>${
        hasNumDefs()?`<button id="optNumReset" class="colbtn2">${t("Reset to mine")}</button>`:""
      }<button id="optNumFactory" class="colbtn2">${t("Factory default")}</button></div></div></div>
    ${/* v1.75 item 3: the two page-change controls sit with Text size and the wallpaper — the settings
          that change how the whole app looks and moves rather than one part of it. */""}
    <div class="optrow optrow-wide optnl"><span class="optlabel">${t("Page slides in from")}</span><div class="optwide">
      <div class="seg segfull seg5">${Object.keys(TRANS_DIRS).map(k=>
        `<button data-opt-transdir="${k}" class="${transDir===k?'on':''}">${t(TRANS_DIRS[k])}</button>`).join("")}</div></div></div>
    <div class="optrow optrow-wide optnl"><span class="optlabel">${t("Page change speed")}</span><div class="optwide">
      <div class="seg segfull seg5">${["instant","fast","normal","slow","slower"].map(k=>
        `<button data-opt-transspd="${k}" class="${transSpd===k?'on':''}">${t(k.charAt(0).toUpperCase()+k.slice(1))}</button>`).join("")}</div></div></div>

    ${sectHR("Colour")}
    ${/* v1.57 item 2: "Colour accent" renamed. It has not been only an accent for several versions —
          it drives the nav highlight, the user chips and the selected states. */""}
    ${colRow(t("Colour details"), "opt-accent", accent, "accent", {page:true})}
    ${colRow(t("Text colour"), "opt-textcol", textCol, "text", {pal:TEXTCOLS, page:true})}

    ${sectHR("Bars and overlays")}
    ${/* v1.76 items 1 & 3: these two are the app's frame — they belong together and not inside Colour,
          because each is a colour AND a transparency AND a height, which is a different kind of
          decision from "what colour is this one thing".
          v1.78: three tiles now, each read as ONE thing under its own subhead — colour, then where it
          sits and how big it is, then how much of the page shows through it. The old combined
          "Bar transparency" and "Bar height" rows made you hold two tiles in your head at once to
          change one; the height numbers are the same barT/barB, just moved into the grid they belong
          to. Dragging these tiles on the page, and adding tiles of your own, are the next two
          versions — this one is only the numbers. */""}
    ${subhead("Top bar")}
    ${colRow(t("Colour"), "opt-topbar", topBar, "topbar", {page:true})}
    ${colRow(t("Name, count and store"), "opt-toptile", topTile, "toptile", {page:true})}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Size and place")}</span><div class="optwide">
      <div class="numgrid">${numCell("topx")}${numCell("topy")}${numCell("topw")}${numCell("barT")}${numCell("topr")}</div></div></div>
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Transparency")}</span><div class="optwide">
      <div class="numgrid">
        <div class="numcell"><span>${t("Top")}</span><div class="seg"><button data-opt-bara="top|-1" aria-label="${t("Less")}">−</button><span class="numval">${barAlpha("top")}%</span><button data-opt-bara="top|1" aria-label="${t("More")}">+</button></div></div>
      </div></div></div>
    ${subhead("Bottom bar")}
    ${colRow(t("Colour"), "opt-navbar", navBar, "navbar", {page:true})}
    ${colRow(t("Selected tab"), "opt-navsel", navSel, "navsel", {page:true})}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Size and place")}</span><div class="optwide">
      <div class="numgrid">${numCell("navx")}${numCell("navy")}${numCell("navw")}${numCell("barB")}${numCell("navr")}</div></div></div>
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Transparency")}</span><div class="optwide">
      <div class="numgrid">
        <div class="numcell"><span>${t("Bottom")}</span><div class="seg"><button data-opt-bara="nav|-1" aria-label="${t("Less")}">−</button><span class="numval">${barAlpha("nav")}%</span><button data-opt-bara="nav|1" aria-label="${t("More")}">+</button></div></div>
      </div></div></div>
    ${subhead("Search bar")}
    ${colRow(t("Colour"), "opt-srchbar", srchBar, "srchbar", {page:true})}
    ${rowNL(t("Align"), `<div class="seg segfull">${Object.keys(SRCH_ALIGN).map(k=>
      `<button data-opt-srchalign="${k}" class="${srchAlign()===k?'on':''}">${t(SRCH_ALIGN[k])}</button>`).join("")}</div>`)}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Size and place")}</span><div class="optwide">
      <div class="numgrid">${numCell("srchx")}${numCell("srchy")}${numCell("srchw")}${numCell("srchh")}${numCell("srchr")}</div></div></div>
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Transparency")}</span><div class="optwide">
      <div class="numgrid">
        <div class="numcell"><span>${t("Search")}</span><div class="seg"><button data-opt-bara="srch|-1" aria-label="${t("Less")}">−</button><span class="numval">${barAlpha("srch")}%</span><button data-opt-bara="srch|1" aria-label="${t("More")}">+</button></div></div>
      </div></div></div>
    ${/* v1.80: tiles of your own, under the same subhead-per-tile rule the three built-ins got in
          v1.78 — one tile reads as ONE thing: what it says, what it does, then colour, transparency
          and where it sits. The controls are deliberately the same shape as the bars' controls, so
          there is nothing new to learn once you have moved the search bar once. */""}
    ${subhead("My tiles")}
    ${userTiles().map(ut=>`
    <div class="optsub">${ut.label?esc(ut.label):t("Shortcut")}</div>
    <div class="optrow optnl" style="gap:7px">
      <input data-tile-label="${esc(ut.id)}" value="${esc(ut.label||"")}" placeholder="${t("Label")}" autocomplete="off" style="flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:14px;font-weight:600" />
      <input data-tile-emoji="${esc(ut.id)}" value="${esc(ut.emoji||"")}" placeholder="🙂" autocomplete="off" style="flex:0 0 62px;width:62px;text-align:center;padding:10px 6px;border-radius:12px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:16px" />
    </div>
    <div class="optrow optrow-wide optnl"><span class="optlabel">${t("Does")}</span><div class="optwide">
      <div class="seg segfull" style="flex-wrap:wrap">${Object.keys(TILE_ACTS).map(k=>
        `<button data-tile-act="${esc(ut.id)}|${k}" class="${ut.act===k?'on':''}">${t(TILE_ACTS[k])}</button>`).join("")}</div></div></div>
    ${ut.act!=="cat" ? "" : `<div class="optrow optrow-wide optnl"><span class="optlabel">${t("Category")}</span><div class="optwide">
      <div style="display:flex;flex-wrap:wrap;gap:6px">${catList().map(c=>
        `<button class="catchip" data-tile-cat="${esc(ut.id)}|${esc(c.id)}" style="${ut.cat===c.id?`background:${c.color};border-color:${c.color};color:#fff`:''}">${catIcon(c,15)} ${esc(catLabel(c))}</button>`).join("")}</div></div></div>`}
    ${tileColRow(ut)}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Transparency")}</span><div class="optwide">
      <div class="numgrid">
        <div class="numcell"><span>${t("Tile")}</span><div class="seg"><button data-tile-alpha="${esc(ut.id)}|-1" aria-label="${t("Less")}">−</button><span class="numval">${(ut.alpha===undefined?100:parseInt(ut.alpha,10)||0)}%</span><button data-tile-alpha="${esc(ut.id)}|1" aria-label="${t("More")}">+</button></div></div>
      </div></div></div>
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Size and place")}</span><div class="optwide">
      <div class="numgrid">${Object.keys(TILE_NUM).map(k=>
        `<div class="numcell"><span>${t(TILE_NUM[k].label)}</span><div class="seg"><button data-tile-num="${esc(ut.id)}|${k}|-1" aria-label="${t("Less")}">−</button><span class="numval">${parseInt(ut[k],10)||0}</span><button data-tile-num="${esc(ut.id)}|${k}|1" aria-label="${t("More")}">+</button></div></div>`).join("")}</div></div></div>
    <button class="optaction" data-tile-del="${esc(ut.id)}" style="border-color:#C24A33;color:#C24A33">${t("Delete this tile")}</button>`).join("")}
    <button class="optaction" id="addUserTile">＋ ${t("Add a tile")}</button>

    ${sectHR("Category headings")}
    ${/* v1.76 items 2 & 3: the heading's three colours, twice — the list and Regulars head different
          kinds of thing and someone who wants them to differ has no other way to say so. Category
          text moved out of Colour to sit with the surface it paints on, and Category icons moved up
          from the bottom of Tiles: it is a heading control, not a tile one. */""}
    ${/* v2.18: Category icons and Icon style moved again, into everyday Tiles — this section is colours only now, on the look page. */""}
    ${subhead("On the list")}
    ${colRow(t("Text"), "opt-cattext", catTxt, "cat", {pal:TEXTCOLS, page:true})}
    ${colRow(t("Background"), "opt-cathdbg", catHdBg, "cathdbg", {page:true})}
    ${colRow(t("Border"), "opt-cathdbrd", catHdBrd, "cathdbrd", {page:true})}
    ${subhead("In Regulars")}
    ${colRow(t("Text"), "opt-reghdtext", regHdTxt, "reghdtext", {pal:TEXTCOLS, page:true})}
    ${colRow(t("Background"), "opt-reghdbg", regHdBg, "reghdbg", {page:true})}
    ${colRow(t("Border"), "opt-reghdbrd", regHdBrd, "reghdbrd", {page:true})}

    ${sectHR("Tiles")}
    ${view!=="lists" ? `<div class="optrow optrow-wide optnl"><span class="optlabel">${t("Tile display")}</span><div class="optwide">
      <div class="tdlist">
        <div class="tdrow">
        <button class="tdopt ${dispBase()==='large'?'on':''}" data-tiledisp="large">${largeCols()===1?`<span class="tdprev ${catOn?'tdprev-listcat':'tdprev-list'}">${catOn?'<b></b><i></i><i></i>':'<i></i><i></i><i></i>'}</span>`:largeCols()===0?`<span class="tdprev tdprev-var">${catOn?'<b></b>':''}${Array.from({length:5},()=>'<u></u>').join("")}</span>`:`<span class="tdprev tdprev-grid" style="grid-template-columns:repeat(${largeCols()},1fr)">${catOn?'<b></b>':''}${Array.from({length:catOn?largeCols():largeCols()*2},()=>'<u></u>').join("")}</span>`}<span class="tdlabel">${t("Tile display")}${largeCols()===0?t(' · variable'):largeCols()===1?t(' · list'):''}</span></button>
        <div class="dispcols">${[1,2,3,4,5,6].map(n=>`<button class="colbtn ${dispBase()==='large'&&largeCols()===n?'on':''}" data-opt-cols="${n}">${n}</button>`).join("")}<button class="colbtn ${dispBase()==='large'&&largeCols()===0?'on':''}" data-opt-cols="0" title="${t("Variable width — tiles size to the word")}">↔</button></div>
        </div>
      </div></div></div>
    ${rowNL(t("Group by category"), `<div class="seg"><button data-opt-caton="1" class="${catOn?'on':''}">${t("On")}</button><button data-opt-caton="0" class="${!catOn?'on':''}">${t("Off")}</button></div>`)}
    ${catOn ? rowNL(t("Group by subcategory"), `<div class="seg"><button data-opt-subon="1" class="${subOn?'on':''}">${t("On")}</button><button data-opt-subon="0" class="${!subOn?'on':''}">${t("Off")}</button></div>`) : ""}` : ""}
    ${row(t("Item icons"), `<div class="seg"><button data-opt-itememoji="1" class="${itemEmojiOn()?'on':''}"><span class="tdswatch tdswatch-ico">${iconStyle()==="drawn"?illSVG("bread"):"🍞"}</span>${t("On")}</button><button data-opt-itememoji="0" class="${!itemEmojiOn()?'on':''}"><span class="tdswatch tdswatch-ico off"></span>${t("Off")}</button></div>`)}
    ${itemEmojiOn() ? row(t("Icon size"), `<div class="seg">${[["s","S"],["m","M"],["l","L"],["xl","XL"]].map(([k,l])=>`<button data-opt-icosize="${k}" class="${icoSize()===k?'on':''}" aria-label="${tf("Icon size {x}", { x:l })}">${l}</button>`).join("")}</div>`) : ""}
    ${(itemEmojiOn() && /^(l|xl)$/.test(icoSize())) ? `<div class="opthint">${t("At this size each tile shows its name under the icon.")}</div>` : ""}
    ${rowNL(t("Category icons"), `<div class="seg"><button data-opt-catemoji="1" class="${catEmojiOn()?'on':''}"><span class="tdswatch tdswatch-ico">${iconStyle()==="drawn"?catMarkSVG("vegetable"):"🥦"}</span>${t("On")}</button><button data-opt-catemoji="0" class="${!catEmojiOn()?'on':''}"><span class="tdswatch tdswatch-ico off"></span>${t("Off")}</button></div>`)}
    ${rowNL(t("Icon style"), `<div class="seg"><button data-opt-iconstyle="drawn" class="${iconStyle()==='drawn'?'on':''}"><span class="tdswatch tdswatch-ico">${catMarkSVG("vegetable")}</span>${t("Drawn")}</button><button data-opt-iconstyle="emoji" class="${iconStyle()==='emoji'?'on':''}">${t("Emoji")}</button></div>`)}
    <p class="hint" style="text-align:left;margin:0 0 12px">${t("Drawn uses line drawings for items and the nine standard categories; categories you made keep their emoji.")}</p>
    ${iconStyle()==="drawn" ? row(t("Line weight"), `<div class="seg">${[["fine","Fine"],["thin","Thin"],["regular","Regular"],["bold","Bold"]].map(([k,l])=>`<button data-opt-linew="${k}" class="${lineW()===k?'on':''}">${t(l)}</button>`).join("")}</div>`) : ""}
    ${/* v2.18 (R12): the tiles' colours and shape are the look page's; what a tile shows stays in everyday Tiles. */""}
    ${sectHR("Tile colours and shape")}
    ${rowNL(t("Tile appearance"), `<div class="seg"><button data-opt-fill="full" class="${fillMode()==='full'?'on':''}"><span class="tdswatch" data-sw="full" style="background:var(--accent)"></span>${t("Full")}</button><button data-opt-fill="accent" class="${fillMode()==='accent'?'on':''}"><span class="tdswatch" data-sw="accent" style="border:1.5px solid var(--muted2);border-left:4px solid var(--accent)"></span>${t("Accent")}</button><button data-opt-fill="empty" class="${fillMode()==='empty'?'on':''}"><span class="tdswatch" data-sw="empty" style="border:1.5px solid var(--muted2)"></span>${t("Empty")}</button></div>`)}
    ${/* v1.57 item 2: the two tile states, each with the same three colours in the same order, so the
          two blocks can be read against each other. */""}
    ${subhead("Selected tiles · on the list")}
    ${colRow(t("Text"), "opt-tiletext", tileTxt, "tiletext", {pal:TEXTCOLS, page:true})}
    ${colRow(t("Background"), "opt-tilebg", tileBg, "tilebg", {page:true})}
    ${colRow(t("Border"), "opt-tilebrd", tileBrd, "tilebrd", {page:true})}
    ${subhead("Unselected tiles · in Regulars")}
    ${colRow(t("Text"), "opt-utiletext", uTileTxt, "utiletext", {pal:TEXTCOLS, page:true})}
    ${colRow(t("Background"), "opt-utilebg", uTileBg, "utilebg", {page:true})}
    ${colRow(t("Border"), "opt-utilebrd", uTileBrd, "utilebrd", {page:true})}
    ${/* v2.18: roundness and gap are the tiles' shape, not part of "Unselected tiles" above them — their own subhead */""}
    ${subhead("Shape")}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Tile roundness")}</span><div class="optwide">
      <div class="numgrid">${numCell("rad")}</div></div></div>
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Tile gap")}</span><div class="optwide">
      <div class="numgrid">${numCell("gapx")}${numCell("gapy")}</div></div></div>
    ${/* v2.63 item D: the Edit item pills — the same three colours as a tile state, and their shape */""}
    ${/* v2.69: one section for every sliding sheet — pick the sheet, then its surface, its pills and their shape */""}
    ${sectHR("Sheets")}
    ${rowNL(t("Sheet"), `<div class="seg">${[["edit","Edit item"],["smart","Smart add"],["add","Add items"],["card","My card"],["other","Other sheets"]].map(([k,l])=>`<button data-lk-sheet="${k}" class="${lookSheet===k?'on':''}">${t(l)}</button>`).join("")}</div>`)}
    ${colRow(t("Background"), lkAttr(lookSheet,"bg"), lkGet(lookSheet,"bg"), lkId(lookSheet,"bg"), {page:true})}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Transparency")}</span><div class="optwide">
      <div class="numgrid">${numCell("lk_"+lookSheet+"_alpha")}</div></div></div>${/* v2.70: how opaque the sheet is, % */""}
    ${colRow(t("Text"), lkAttr(lookSheet,"text"), lkGet(lookSheet,"text"), lkId(lookSheet,"text"), {pal:TEXTCOLS, page:true})}
    ${subhead("Buttons and tiles")}
    ${colRow(t("Text"), lkAttr(lookSheet,"ptext"), lkGet(lookSheet,"ptext"), lkId(lookSheet,"ptext"), {pal:TEXTCOLS, page:true})}
    ${colRow(t("Background"), lkAttr(lookSheet,"pbg"), lkGet(lookSheet,"pbg"), lkId(lookSheet,"pbg"), {page:true})}
    ${colRow(t("Border"), lkAttr(lookSheet,"pbrd"), lkGet(lookSheet,"pbrd"), lkId(lookSheet,"pbrd"), {page:true})}
    ${subhead("Shape")}
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Roundness")}</span><div class="optwide">
      <div class="numgrid">${numCell(lkNumKey(lookSheet,"rad"))}</div></div></div>
    <div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Gap")}</span><div class="optwide">
      <div class="numgrid">${numCell(lkNumKey(lookSheet,"gapx"))}${numCell(lkNumKey(lookSheet,"gapy"))}</div></div></div>
    ${/* v2.74: the layout — Rows and Choices in two levels, the row names, the gap between rows (Choices only for sheets without rows) */""}
    ${subhead("Layout")}
    ${(()=>{ const hasRows = lookSheet==="edit" || lookSheet==="smart";
      const seg=k=>`<div class="smcols lklay">${[["","Default"],["1"],["2"],["3"],["4"],["5"],["6"],["v"]].map(([v,l])=>`<button class="colbtn ${lkLay(lookSheet,k)===v?'on':''}" data-lk-${k}="${lookSheet}|${v}"${v==="v"?` aria-label="${t("Variable width")}"`:""}${v===""?' style="width:auto;padding:0 10px"':""}>${v===""?t(l):v==="v"?"↔":v}</button>`).join("")}</div>`;
      const wide=(l,c)=>`<div class="optrow optrow-wide optnl"><span class="optlabel">${l}</span><div class="optwide">${c}</div></div>`;   // the label above: eight buttons do not fit beside it
      return `${hasRows ? wide(t("Rows"), seg("rows")) : ""}
    ${wide(t("Choices"), seg("chcols"))}
    ${hasRows ? rowNL(t("Row names"), `<div class="seg"><button data-lk-names="${lookSheet}|" class="${lkLay(lookSheet,"names")!=="0"?'on':''}">${t("On")}</button><button data-lk-names="${lookSheet}|0" class="${lkLay(lookSheet,"names")==="0"?'on':''}">${t("Off")}</button></div>`) : ""}
    ${hasRows ? `<div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Row gap")}</span><div class="optwide">
      <div class="numgrid">${numCell("lk_"+lookSheet+"_rgapx")}${numCell("lk_"+lookSheet+"_rgapy")}</div></div></div>` : ""}`; })()}
    ${sect("Shopping")}${/* v2.30: was "Sort" — the store, its order, its aisle map, and the sound and screen while you shop (Sound folded in) */""}
    ${rowNL(t("Location"), `<div class="seg"><button data-opt-useloc="1" class="${useLoc?'on':''}">${t("On")}</button><button data-opt-useloc="0" class="${!useLoc?'on':''}">${t("Off")}</button></div>`)}
    <div class="optrow optrow-wide optnl"><span class="optlabel">${t("Store")}</span><div class="optwide">
      <div class="storegrid">${[{id:"auto",name:t("Auto-detect")},{id:"home",name:t("Home")},...STORES.filter(s=>!storeOverride(s.id).hidden).map(s=>storeById(s.id)),...(state.stores||[]).filter(s=>!storeOverride(s.id).hidden),{id:"other",name:t("Other")}].map(s=>`<button data-opt-store="${s.id}" class="storechip ${storeSel===s.id?'on':''}">${s.id==="home"?HOME_SVG(14)+" ":""}${esc(s.name)}</button>`).join("")}<button data-store-add class="storechip" style="border-style:dashed">${t("＋ Add store")}</button></div>
      ${isRealStore(storeSel) ? `<div class="optrow" style="gap:7px"><input id="storeName" value="${esc((storeById(storeSel)||{}).name||"")}" placeholder="${t("Store name")}" style="flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text);font-size:14px;font-weight:600" /><button id="storeRemove" style="padding:10px 12px;border-radius:12px;border:2px solid #C24A33;background:transparent;color:#C24A33;font-weight:700;font-size:13px">${t("Remove")}</button></div>` : ""}
    </div></div>
    ${(storeSel==="home" || isRealStore(storeSel)) ? `<button class="optaction" id="optSetStore" style="margin-top:2px">${PIN_SVG(14)} ${tf("Set {x} location here", { x:esc(storeName(storeById(storeSel))||t("store")) })}</button>` : ""}
    ${isRealStore(storeSel) ? `<button class="optaction" id="optAisleMap" style="margin-top:6px">${/* v2.27 */""}${tf("Aisle map for {x}", { x:esc((storeById(storeSel)||{}).name||t("this shop")) })}${(()=>{ const m=(state.aislemap||{})[storeSel]; return (m && m.aisles && m.aisles.length) ? (m.aisles.length===1 ? tf(" · {n} aisle", { n:m.aisles.length }) : tf(" · {n} aisles", { n:m.aisles.length })) : ""; })()}</button>` : ""}
    ${(()=>{ const hid=[...STORES,...(state.stores||[])].filter(s=>{ const o=storeOverride(s.id); return o.hidden && !o.removed; }); return hid.length ? `<div class="optrow" style="flex-direction:column;align-items:stretch;gap:6px;margin-top:6px"><span class="optlabel" style="font-size:12.5px;color:var(--muted2)">${t("Hidden stores")}</span>${hid.map(s=>`<div style="display:flex;gap:7px;align-items:center"><span style="flex:1;min-width:0;color:var(--muted);font-size:13px;font-weight:600">${esc((storeById(s.id)||s).name||s.id)}</span><button class="storechip" data-store-restore="${s.id}" style="flex:0 0 auto">${t("Restore")}</button><button class="storechip" data-store-delete="${s.id}" aria-label="Delete" style="flex:0 0 auto;border-color:#C24A33;color:#C24A33">✕</button></div>`).join("")}</div>` : ""; })()}
    <div style="margin:-2px 2px 10px;font-size:12.5px;color:var(--muted2);font-weight:600">${(()=>{ const nid=storeSel==="auto"?(useLoc&&!locState.busy&&locState.checked&&!locState.err&&locState.nearId):storeSel; return nid==="home"?HOME_SVG(14)+" ":(storeSel==="auto"&&nid&&storeById(nid))?PIN_SVG(14)+" ":""; })()}${esc(storeLabel())}</div>
    ${view!=="lists" ? `<div class="optrow optrow-wide optnl"><span class="optlabel">${t("Sort")}</span><div class="optwide">
      <div class="seg segfull">${(displayFor()==="flat" && shopMode && aiSortOK())?`<button data-opt-sort="ai" class="${curSort==='ai'?'on':''}">${t("✨ AI")}</button>`:""}${displayFor()==="flat"?`<button data-opt-sort="location" class="${curSort==='location'?'on':''}">${t("Location")}</button>`:""}<button data-opt-sort="cat" class="${curSort==='cat'?'on':''}">${t("Category")}</button><button data-opt-sort="alpha" class="${curSort==='alpha'?'on':''}">${t("A–Z")}</button></div>
    </div></div>
    <div class="opthint">${t("<b>Location</b> walks the shop you're at, aisle by aisle — its own aisle map if you have made one (Aisle map, below the shops), otherwise the built-in order — and at a market shows only what it sells. <b>✨ AI</b> learns the order you tick things at each shop and follows it next time. <b>Category</b>: your categories in the order they are listed, then A–Z. <b>A–Z</b>: by name. Location and AI show when the list is not grouped by category.")}</div>
    ${(displayFor()==="flat" && curSort==="ai") ? `<div class="opthint">✨ AI learns the order you check things off at ${esc((activeStore()||{}).name||"each store")} and reorders your next trip. Pick the store in Location so it learns per shop.</div>` : ""}
    ${(displayFor()==="flat" && curSort==="ai" && aiSeenCount()>0) ? `<button class="optaction" id="optResetAI" style="margin:-2px 0 10px">${t("♻︎ Reset AI — restart from category")}</button>` : ""}` : ""}
    ${row(t("Sound"), `<div class="seg"><button data-opt-sound="1" class="${soundOn?'on':''}">${t("On")}</button><button data-opt-sound="0" class="${!soundOn?'on':''}">${t("Off")}</button></div>`)}
    ${row(t("First-time questions"), `<button class="storechip" id="optOnbReset">${t("Ask again")}</button>`)}<div class="opthint">${t("Your shops, pinning a shop, the aisle map and the how-it-works tip each ask once. This brings back any you answered with Skip or Never.")}</div>
    ${row(t("Keep screen on"), `<div class="seg"><button data-opt-wake="1" class="${wakePref()?'on':''}">${t("On")}</button><button data-opt-wake="0" class="${!wakePref()?'on':''}">${t("Off")}</button></div>`)}
    <div class="opthint">${t("While the cart has something in it, so the phone does not dim and lock mid-aisle.")}</div>
    ${(view!=="lists") ? `${sect("Smart features")}${/* v2.30: Smart add, restock suggestions, receipts and prices, memberships — the AI-assisted things, in one place */""}${row(t("Smart add"), `<div class="seg"><button data-opt-smart="1" class="${smartOn()?'on':''}">${t("On")}</button><button data-opt-smart="0" class="${!smartOn()?'on':''}">${t("Off")}</button></div>`)}<div class="opthint">${t("The ✨ button in the add bar. Type or paste a whole list or a recipe — “2 kg chicken, milk and eggs for pancakes” — and it becomes separate items with amounts and categories. What you type is sent to the AI reader; nothing else. Recipes on the Plan page have their own reader and work either way.")}</div>${row(t("Siri & Shortcuts"), `<button class="storechip" id="optSiri">${t("Set up Siri")}</button>`)}<div class="opthint">${t("Add to any of your lists by voice from anywhere, with an iPhone Shortcut. On Android, share any text to Market List.")}</div>` : ""}
    ${(view!=="lists") ? `<div class="optsub">${t("Restock suggestions")}</div>${rowNL(t("Suggest restocks"), `<div class="seg"><button data-pred-on="1" class="${predictCfg.on?'on':''}">${t("On")}</button><button data-pred-on="0" class="${!predictCfg.on?'on':''}">${t("Off")}</button></div>`)}
    ${predictCfg.on ? `${rowNL(t("Remind me"), `<div class="seg"><button data-pred-freq="weekly" class="${predictCfg.freq==='weekly'?'on':''}">${t("Weekly")}</button><button data-pred-freq="monthly" class="${predictCfg.freq==='monthly'?'on':''}">${t("Monthly")}</button></div>`)}
    ${predictCfg.freq==='weekly' ? `<div class="optrow optrow-wide optnl"><span class="optlabel">${t("Day")}</span><div class="optwide">
      <div class="daychips">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=>{ const dv=(i+1)%7; return `<button class="daychip ${predictCfg.day===dv?'on':''}" data-pred-day="${dv}">${d}</button>`; }).join("")}</div></div></div>` : ""}
    <div class="opthint">${t("Suggests restocking items on your schedule, from how often you buy them — on your device. Adds only when you tap.")}</div>` : ""}` : ""}
    ${(view!=="lists") ? `<div class="optsub">${t("Receipts and prices")}</div>
      <button class="optaction" id="optRcpt" style="margin-top:2px">${CAMERA_SVG(16)} ${t("Read a receipt")}</button>
      ${row(t("Ask after a shop"), `<div class="seg"><button data-opt-rcptask="1" class="${rcptAskOn()?'on':''}">${t("On")}</button><button data-opt-rcptask="0" class="${!rcptAskOn()?'on':''}">${t("Off")}</button></div>`)}
      ${row(t("Share prices with other households"), `<div class="seg"><button data-opt-sharepx="1" class="${sharePxOn()?'on':''}">${t("On")}</button><button data-opt-sharepx="0" class="${!sharePxOn()?'on':''}">${t("Off")}</button></div>`)}<div class="opthint">${t("Off unless you turn it on. When on, the prices you confirm from receipts at Coles, Woolworths and ALDI are pooled with other households that also turned it on — the chain, the item, the price and the day, never your list, your shop or your card — and “Which store is cheaper” fills its gaps with the middle price from at least two households. Sharing yours needs your email in Your account; seeing others' does not.")}</div>
      ${(sharePxOn() && !shareEmailAcct()) ? `<div style="margin:0 2px 8px;font-size:12.5px;color:var(--muted2);font-weight:600">${t("Add your email in Your account to share yours — you can already see others'.")}</div>` : ""}
      <button class="optaction" id="optCompare">${/* v2.21 */""}${t("Which store is cheaper for this list")}</button>
      <button class="optaction" id="optSpend">${/* v2.24 */""}${t("What we spend")}</button>
      <div style="margin:6px 2px 10px;font-size:12.5px;color:var(--muted2);font-weight:600">${(()=>{ const pc=Object.keys(state.prices||{}).length; return pc ? (pc===1 ? tf("{n} item with a remembered price. Kept in this list, shared only with the people on it.", { n:pc }) : tf("{n} items with a remembered price. Kept in this list, shared only with the people on it.", { n:pc })) : t("Read a receipt after a shop and the app remembers what you paid at each store. Free."); })()}</div>
      ${(Object.keys(state.prices||{}).length || (state.spend||[]).length) ? `<button class="optaction" id="optPriceClear">${BIN_SVG(16)} ${t("Clear prices and spending")}</button>` : ""}` : ""}
    ${(view!=="lists") ? `<div class="optsub">${t("Memberships")}</div>${/* v2.20 the 10% shop: which memberships the household has, the rules (they change), this month */""}
      ${Object.keys(CHAINS).map(k=>{ const c=memb()[k], p=periodOf(new Date(), c.day), u=c.used[p.key];
        return `${row(esc(CHAINS[k].name), `<div class="seg"><button data-memb-on="${k}|1" class="${c.on?'on':''}">${t("On")}</button><button data-memb-on="${k}|0" class="${!c.on?'on':''}">${t("Off")}</button></div>`)}
        ${c.on ? `<div class="optrow optrow-wide optnl optrow-num"><span class="optlabel">${t("Its rules")}</span><div class="optwide"><div class="numgrid">
          <div class="numcell"><span>${t("Off")}</span><div class="seg"><button data-memb-num="${k}|pct|-1" aria-label="Less">−</button><span class="numval">${c.pct}%</span><button data-memb-num="${k}|pct|1" aria-label="More">+</button></div></div>
          <div class="numcell"><span>${t("Up to")}</span><div class="seg"><button data-memb-num="${k}|cap|-5" aria-label="Less">−</button><span class="numval">$${c.cap}</span><button data-memb-num="${k}|cap|5" aria-label="More">+</button></div></div>
          <div class="numcell"><span>${t("From day")}</span><div class="seg"><button data-memb-num="${k}|day|-1" aria-label="${t("Earlier")}">−</button><span class="numval">${c.day}</span><button data-memb-num="${k}|day|1" aria-label="${t("Later")}">+</button></div></div>
        </div></div></div>
        <div class="membstat" data-memb-stat="${k}">${esc(monthName(p))}: ${u ? tf("used on {d}", { d:esc(new Date(u).toLocaleDateString(dateLoc(),{day:"numeric",month:"short"})) }) : (p.daysLeft===1 ? tf("unused · {n} day left", { n:p.daysLeft }) : tf("unused · {n} days left", { n:p.daysLeft }))}
          <button class="storechip" data-memb-used="${k}|${u?0:1}">${u?t("Not used yet"):t("Used it")}</button></div>
        <button class="optaction" data-memb-list="${k}">${tf("{x} stock-up list for {m}", { x:esc(CHAINS[k].short), m:esc(monthName(p)) })}</button>` : ""}`; }).join("")}
      <div style="margin:6px 2px 10px;font-size:12.5px;color:var(--muted2);font-weight:600">${t("Each takes 10% off one shop a month, up to $50, as of October 2026 — set the rules to what your membership says. A receipt that shows the member discount marks the month as used.")}</div>
      <div class="optsub">${t("Cards at the till")}</div>${/* v2.31 item 5: kept on this phone only */""}
      ${cardsGet().map(c=>row(esc(c.name), `<div class="seg"><button data-card-open="${esc(c.id)}">${t("Show")}</button><button data-card-edit="${esc(c.id)}">${t("Edit")}</button></div>`)).join("")}
      <button class="optaction" data-card-add="1">${CARD_SVG(16)} ${t("Add a membership card")}</button>
      ${row(t("Ask for a card after a shop"), `<div class="seg"><button data-opt-cardask="1" class="${cardAskOn()?'on':''}">${t("On")}</button><button data-opt-cardask="0" class="${!cardAskOn()?'on':''}">${t("Off")}</button></div>`)}
      <div class="snapnote">${t("On this phone only. A card comes up when you finish a shop at its store, and from the Shop page's menu.")}</div>` : ""}
    ${(view!=="lists") ? `${sect("Plan & recipes")}${row(t("Meal slots"), `<div class="seg"><button data-opt-mealslots="1" class="${mealSlotsOn()?'on':''}">${t("On")}</button><button data-opt-mealslots="0" class="${!mealSlotsOn()?'on':''}">${t("Off")}</button></div>`)}
    <div class="opthint">${t("Breakfast, lunch, dinner or snack on each planned meal.")}</div>` : ""}
    ${(view!=="lists") ? `${row(t("Convert amounts"), `<div class="seg"><button data-opt-units="off" class="${unitsMode()==='off'?'on':''}">${t("Off")}</button><button data-opt-units="metric" class="${unitsMode()==='metric'?'on':''}">${t("Metric")}</button><button data-opt-units="imperial" class="${unitsMode()==='imperial'?'on':''}">${t("Imperial")}</button></div>`)}
    <div class="opthint">${t("Changes how amounts are shown, not what is stored — a recipe\'s own wording comes back if you turn this off. Amounts it can\'t read, like “a pinch”, are left alone.")}</div>` : ""}
    ${state.members.length ? `${sectHR("People")}<div class="optrow optnl" style="flex-direction:column;align-items:stretch;gap:7px">
      <div class="userlist">${state.members.map(m=>`<button class="userchip ${m===me?'on':''}" data-switch-user="${esc(m)}">${esc(m)}${m===me?`<span class="ucur">${t("you")}</span>`:""}</button>`).join("")}</div>
    </div>
    ${accessHTML()}
    ${row(t("Say when I'm shopping"), `<div class="seg"><button data-opt-sayshop="1" class="${sayShopOn()?'on':''}">${t("On")}</button><button data-opt-sayshop="0" class="${!sayShopOn()?'on':''}">${t("Off")}</button></div>`)}
    <div class="opthint">${t("While you tick things off at a shop, the others see which shop — only its name, for an hour and a half, gone when you finish.")}</div>` : ""}
    ${sectHR("Lists & sharing")}
    <button class="optaction" id="optShare" style="margin-top:2px">${t("Share link")}</button>
    <button class="optaction" id="optSendList" style="margin-top:10px">${SHARE_SVG(16)} ${t("Send what's to buy to another app")}</button>
    <button class="optaction" id="optOccSave" style="margin-top:10px">${t("Save what's to buy as an occasion")}</button>
    <button class="optaction" id="optOccAdd" style="margin-top:10px">${t("Add an occasion to the list")}${(state.templates||[]).length?` (${(state.templates||[]).length})`:""}</button>
    <button class="optaction" id="optExport" style="margin-top:10px">${t("Export the full list — to buy and Regulars")}</button>
    <button class="optaction" id="optBackup" style="margin-top:10px">${t("Back up this list to a file")}</button>
    <button class="optaction" id="optRestoreFile" style="margin-top:10px">${t("Restore from a backup file")}</button>
    ${catList().some(c=>c.id==="pantry") ? "" : `${row(t("Use the new categories"), `<button class="storechip" id="optCats13">${t("Use the new categories")}</button>`)}<div class="opthint">${t("Moves this list to the thirteen categories, in the order a shop is walked (Bakery, Deli, Dairy, Pantry, Frozen…). Items and Regulars move to where shops shelve them; categories you made stay. A backup is taken first.")}</div>`}
    ${snapsHTML()}
    ${sectHR("History")}
    ${(()=>{
      /* v1.51: the picker only appears with more than one list — a single-list user does not need to
         be told which one they are looking at. */
      const lists = getLists(); const code = histView || listCode;
      const entries = histRead(code);
      const pick = lists.length>1 ? `<div class="optrow optnl" style="border-bottom:none;padding-bottom:2px"><div class="storegrid">${
        lists.map(l=>`<button data-hist-list="${esc(l.code)}" class="storechip ${code===l.code?'on':''}">${esc(l.name||l.code)}</button>`).join("")}</div></div>` : "";
      if(!entries.length) return pick + `<div style="margin:6px 2px 10px;font-size:12.5px;color:var(--muted2);font-weight:600">${t("Nothing recorded yet. Adding, removing and buying items will show up here.")}</div>`;
      const grp = `${rowNL(t("Group by"), `<div class="seg"><button data-hist-group="day" class="${histGroup==='day'?'on':''}">${t("Day")}</button><button data-hist-group="week" class="${histGroup==='week'?'on':''}">${t("Week")}</button><button data-hist-group="month" class="${histGroup==='month'?'on':''}">${t("Month")}</button></div>`)}`;
      /* v1.52: bucket first, render second. Every bucket is folded unless the user has opened it this
         visit, so the section is a short index of periods rather than 150 rows of log. */
      const buckets=[]; const byKey={};
      for(const e of entries.slice(0,400)){
        const p=histPeriod(e.t||0);
        if(!byKey[p.k]){ byKey[p.k]={ k:p.k, label:p.label, rows:[] }; buckets.push(byKey[p.k]); }
        byKey[p.k].rows.push(e);
      }
      const body = buckets.map(b=>{
        const open = histOpen.has(b.k);
        const head = `<button class="histhead ${open?'open':''}" data-hist-toggle="${esc(b.k)}" aria-expanded="${open?'true':'false'}"><span class="histheadlabel">${esc(b.label)}</span><span class="histheadn">${b.rows.length}</span><span class="histchev">${open?'▾':'▸'}</span></button>`;
        if(!open) return head;
        const rows = b.rows.map(e=>{
          const time=new Date(e.t||0).toLocaleTimeString(dateLoc(),{hour:"numeric",minute:"2-digit"});
          return `<div class="histrow"><span class="histname">${esc(cap(e.n||""))}</span><span class="histact">${esc(t(HIST_LABEL[e.a]||e.a||""))}</span><span class="histtime">${esc(time)}</span></div>`;
        }).join("");
        return head + `<div class="histrows">${rows}</div>`;
      }).join("");
      return pick + grp + `<div class="histlist">${body}</div>`
        + (entries.length>400 ? `<div style="margin:4px 2px;font-size:12.5px;color:var(--muted2);font-weight:600">${tf("Showing the most recent 400 of {n}.", { n:entries.length })}</div>` : "")
        + `<div style="margin:4px 2px 8px;font-size:12.5px;color:var(--muted2);font-weight:600">${t("Kept on this device only — it is not shared with the rest of the household.")}</div>`
        + `<button class="optaction" id="optHistClear" style="margin-top:2px">${BIN_SVG(16)} ${t("Clear this list’s history")}</button>`;
    })()}
    ${sectHR("Help")}
    <button class="optaction" id="optReport" style="margin-top:10px">${REPORT_SVG(16)} ${t("Report a problem")}</button>
    <button class="optaction" id="optDiag" style="margin-top:10px">${FLASK_SVG(16)} ${t("AI diagnostics")}</button>
    <button class="optaction" id="optPriceDiag" style="margin-top:10px">${FLAG_TAG_SVG} ${t("Price diagnostics")}</button>
    <button class="optaction" id="optLocDiag" style="margin-top:10px">${PIN_SVG(16)} ${t("Location diagnostics")}</button>
    ${row(t("Connection check"), `<span class="optdiag" id="optConnDiag">${connDiagHTML()}</span>`)}<div class="opthint">${t("If saving is slow, a screenshot of this helps find why.")}</div>
    ${stuckLog().length ? `<button class="optaction" id="optStuck" style="margin-top:10px">${tf("Screen log · {n}", { n:stuckLog().length })}</button>` : ""}
    ${sectHR("Your data")}
    <a class="optaction" id="optPrivacy" href="/privacy.html" style="margin-top:2px">${t("Privacy — what the app keeps, and where")}</a>
    ${acctHTML()}
    ${(me && (state.members||[]).includes(me)) ? `<button class="optaction" id="optLeave" style="margin-top:10px">${t("Leave this list")}</button>` : ""}
    <button class="optaction" id="optEmpty" style="margin-top:10px">${t("Empty this list for everyone")}</button>
    <button class="optaction" id="optForget" style="margin-top:10px">${t("Forget everything on this phone")}</button>
    <div style="margin:6px 2px 10px;font-size:12.5px;color:var(--muted2);font-weight:600">${t("Leaving takes your name off this list and this phone forgets it; the others keep it. Emptying clears what is in the list for everyone — items, Regulars, the plan, prices, spending, occasions and what the app has learned. Forgetting clears every list, name, setting and backup on this phone; the shared lists stay for their people.")}</div>
    <div id="verFoot" style="text-align:center;margin-top:12px;font-size:12.5px;color:var(--muted2);font-weight:600" title="Build: ${APP_BUILD_DATE} · hold for diagnostics">${APP_VERSION}</div>`;
}
function renderSettingsPage(){
  app.innerHTML = `
    <div class="topfix" id="topfix">
      <header>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${setLook ? `<button class="backbtn" id="lookBack" aria-label="${t("Back to Settings")}">‹</button><span class="title disp" role="heading" aria-level="1">${t("Customise the look")}</span>`
                    : `<span class="title disp" role="heading" aria-level="1">${t("Settings")}</span>`}
        </div>
        <div style="display:flex;align-items:center;gap:8px">${syncChip()}</div>
      </header>
    </div>
    <div class="wrap" role="main">
    <div class="zoomwrap"><div class="zoomer ${styl()}" id="zoomer" style="transform:scale(${dens()});transform-origin:top left;width:calc(100% / ${dens()})">
      <div class="optpage${setLook?' look':''}">${optionsBody()}</div>
    </div></div>
    </div>
    ${bottomNav({planId:"planNavS",planActive:false,cartId:"cartNav",cartActive:false,setId:"setNav",setActive:true})}${userTilesHTML()}
    ${diagOpen?diagSheet():""}
    ${listsOpen?listsSheet():""}
    ${rcpt?rcptSheet():""}${tenSheet?tenSheetHTML():""}${cmpOpen?cmpSheetHTML():""}${occSheet?occSheetHTML():""}${spendOpen?spendSheetHTML():""}${amOpen?amSheetHTML():""}${shopMenuOpen?shopMenuHTML():""}${priceDiagOpen?priceDiagHTML():""}${cardEdit?cardEditHTML():""}${cardShow?cardShowHTML():""}${stuckOpen?stuckHTML():""}${locDiagOpen?locDiagHTML():""}${rpt?rptSheet():""}${rst?rstSheet():""}${siriOpen?siriSheetHTML():""}${dictOpen?dictSheetHTML():""}${noListOpen?noListSheetHTML():""}
    ${listActOpen?listActSheet():""}
  ${newListOpen?newListSheet():""}
    ${editing?editSheet():(_editFoldKey="")}
    ${toast?`<div class="toast" id="toast"><span>${esc(t(toast))}</span>${toastAction?`<button id="undoBtn" class="undobtn">${esc(t(toastAction.label))}</button>`:""}</div>`:""}`;
}
/* v1.81: the sheet is a SWITCHER, not a manager — one tap per row picks a list, the way the
   reference app does it. Reordering, renaming and deleting still live on the Lists page, which
   this links to, so the two are not two half-copies of each other. */
/* v2.57 item 10b: the lists sheet's ⋯ opens this row's actions inline, one row at a time (no Move up/down — rows drag) */
var listOptsCode=null;
function listsSheet(){
  const lists=getLists();
  const rows=lists.map(l=>{ const st=listStats(l.code); const cur=l.code===listCode;
    const sub = st.total ? `${st.total===1?tf("{n} item",{ n:st.total }):tf("{n} items",{ n:st.total })}${st.done?` · ${tf("{n} in cart",{ n:st.done })}`:""}` : t("Empty");
    /* v2.56 item 3: a "⋯" on each row opens what you can do to the list (press & hold still does too); no radio —
       the current list is shown by its border, tint and name colour. A div, so the ⋯ button can sit inside it. */
    return `<div role="button" tabindex="0" class="listpick${cur?' cur':''}" data-list="${esc(l.code)}"${cur?' aria-current="true"':''}>
      <span class="lp-main"><span class="lp-name">${esc(l.name||t('Untitled list'))}</span><span class="lp-sub">${sub}</span></span>
      <button class="lp-more" data-list-more="${esc(l.code)}" aria-label="${t("List options")}" aria-expanded="${listOptsCode===l.code}">${MENU_SVG(20)}</button></div>`
      + (listOptsCode===l.code ? `<div class="lp-opts" data-lo="${esc(l.code)}">
        <button class="optaction" data-lo-rename="${esc(l.code)}">${t("Rename")}</button>
        <button class="optaction" data-lo-share="${esc(l.code)}">${t("Share")}</button>
        <button class="optaction" data-lo-dup="${esc(l.code)}">${t("Duplicate list")}</button>
        <button class="optaction" data-lo-delete="${esc(l.code)}" style="border-color:#C24A33;color:#C24A33">${t("Delete")}</button></div>` : ""); }).join("");
  return `<div class="sheet-bg" id="listsBg"><div class="sheet" id="listsSheetEl">
    <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${t("Your lists")}</div>
    <div class="listrows">${rows||`<p class="empty-sub">${t("No lists yet.")}</p>`}</div>
    <button class="newlist" id="newList">${t("+ Create new list")}</button>
  </div></div>`;
}
function chipsHTML(activeCat){ return catList().map(c=>
  `<button class="catchip" data-ec="${c.id}" style="${activeCat===c.id?`background:${c.color};border-color:${c.color};color:#fff`:''}">${catIcon(c,15)} ${esc(catLabel(c))}</button>`).join(""); }

function editSheet(){
  if(editing.kind==="newcat"){
    return `<div class="sheet-bg kbpin" id="sheetBg"><div class="sheet" id="sheet">
      <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${t("New category")}</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${iconEditorHTML()}
        <input id="catName" value="${esc(editing.label)}" placeholder="${t("Category name")}" style="flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text)" />
      </div>
      <div id="stripWrap">${iconStripHTML()}</div>
      <input id="iconFile" type="file" accept="image/*" style="display:none" />
      <input id="emojiKbd" inputmode="text" autocomplete="off" style="position:absolute;opacity:0;height:1px;width:1px;pointer-events:none;left:-9999px" />
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="newCancel" style="padding:13px 16px;border-radius:14px;border:2px solid var(--ink);background:transparent;color:var(--text);font-weight:700;font-size:15px">${t("Cancel")}</button>
        <button id="newCreate" style="flex:1;padding:13px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${t("Create")}</button>
      </div>
    </div></div>`;
  }
  if(editing.kind==="cat"){
    const cs=catList(); const idx=cs.findIndex(c=>c.id===editing.id); const n=cs.length;
    const cat=cs[idx]||{subs:[]}; const subs=cat.subs||[];
    const subRows = subs.length ? subs.map((s,i)=>
      `<div class="subrow2">
        <input class="subedit" data-sublabel="${s.id}" value="${esc(s.label)}" />
        <button class="iconmini" data-subup="${s.id}" ${i===0?'disabled style="opacity:.35"':''}>↑</button>
        <button class="iconmini" data-subdown="${s.id}" ${i===subs.length-1?'disabled style="opacity:.35"':''}>↓</button>
        <button class="iconmini subdel" data-sub="${s.id}" style="color:#C24A33">×</button>
      </div>`).join("") : `<div class="none" style="margin-top:6px">${t("No subcategories yet")}</div>`;
    return `<div class="sheet-bg kbpin" id="sheetBg"><div class="sheet" id="sheet">
      <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${t("Edit category")}</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${iconEditorHTML()}
        <input id="catName" value="${esc(editing.label)}" style="flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text)" />
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="font-size:11px;color:var(--muted);font-weight:700;white-space:nowrap">${tf("{a} of {b}", { a:idx+1, b:n })}</div>
          <div style="display:flex;gap:4px">
            <button class="iconbtn" id="moveUp" ${idx<=0?'disabled style="opacity:.35"':''} style="font-size:16px">↑</button>
            <button class="iconbtn" id="moveDown" ${idx>=n-1?'disabled style="opacity:.35"':''} style="font-size:16px">↓</button>
          </div>
        </div>
      </div>
      <div id="stripWrap">${iconStripHTML()}</div>
      <input id="iconFile" type="file" accept="image/*" style="display:none" />
      <input id="emojiKbd" inputmode="text" autocomplete="off" style="position:absolute;opacity:0;height:1px;width:1px;pointer-events:none;left:-9999px" />
      <div style="margin-top:16px"><button id="addSubBtn" style="border:none;background:var(--chip);color:var(--text);font-size:12px;font-weight:700;padding:7px 12px;border-radius:999px">${t("+ Add subcategory")}</button></div>
      <div style="margin-top:8px">${subRows}</div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="catRemove" style="padding:13px 16px;border-radius:14px;border:2px solid #C24A33;background:transparent;color:#C24A33;font-weight:700;font-size:15px">${t("Delete")}</button>
        <button id="catSave" style="flex:1;padding:13px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${t("Save")}</button>
      </div>
    </div></div>`;
  }
  if(editing.kind==="bacat"){
    const shown = catList().filter(c=> state.items.some(i=>catShown(i.cat)===c.id) || c.custom).length;
    const n = shown+1; const idx = Math.max(0, Math.min(editing.pos|0, shown));
    return `<div class="sheet-bg kbpin" id="sheetBg"><div class="sheet" id="sheet">
      <div class="disp" style="font-weight:800;font-size:17px;margin-bottom:12px">${t("Edit “Buy again”")}</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${iconEditorHTML()}
        <input id="catName" value="${esc(editing.label)}" style="flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:2px solid var(--ink);outline:none;background:var(--card);color:var(--text)" />
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="font-size:11px;color:var(--muted);font-weight:700;white-space:nowrap">${tf("{a} of {b}", { a:idx+1, b:n })}</div>
          <div style="display:flex;gap:4px">
            <button class="iconbtn" id="baUp" ${idx<=0?'disabled style="opacity:.35"':''} style="font-size:16px">↑</button>
            <button class="iconbtn" id="baDown" ${idx>=n-1?'disabled style="opacity:.35"':''} style="font-size:16px">↓</button>
          </div>
        </div>
      </div>
      <div id="stripWrap">${iconStripHTML()}</div>
      <input id="iconFile" type="file" accept="image/*" style="display:none" />
      <input id="emojiKbd" inputmode="text" autocomplete="off" style="position:absolute;opacity:0;height:1px;width:1px;pointer-events:none;left:-9999px" />
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="baDeleteHist" style="padding:13px 12px;border-radius:14px;border:2px solid #C24A33;background:transparent;color:#C24A33;font-weight:700;font-size:14px">${t("Delete history")}</button>
        <button id="baCatSave" style="flex:1;padding:13px;border-radius:14px;border:none;background:var(--btn);color:#fff;font-weight:800;font-size:15px">${t("Save")}</button>
      </div>
    </div></div>`;
  }
  const isItem = editing.kind==="item";
  editFold(editing.kind + "|" + (editing.id || editing.origName || ""));   // v2.57 item 9a
  const qtyBlock = `<div class="qstep"><button id="qMinus">−</button><span style="min-width:22px;text-align:center;font-weight:800;font-size:16px">${editing.qty||1}</span><button id="qPlus">+</button></div>`;
  /* v2.70: Save and Delete take the tile shape — the pills' roundness and border width, 44px tall */
  const btnDelStyle = "display:inline-flex;align-items:center;justify-content:center;gap:6px;height:44px;box-sizing:border-box;padding:0 14px;border-radius:var(--epillrad, 999px);border:1.5px solid #C24A33;background:transparent;color:#C24A33;font-weight:700;font-size:var(--edfs, 15px)";
  const btnSaveStyle = "flex:1;height:44px;box-sizing:border-box;padding:0 14px;border-radius:var(--epillrad, 999px);border:1.5px solid var(--btn);background:var(--btn);color:#fff;font-weight:800;font-size:var(--edfs, 15px)";
  const selCat = CAT(editing.cat);
  return `<div class="sheet-bg kbpin" id="sheetBg"><div class="sheet" id="sheet" data-look="edit">
    ${/* v2.63 item D: the title IS the name field; then flags, Quantity, Measure, price, Note, Category, Where to buy (no Subcategory) */""}
    ${/* v2.70: the last price sits in the title row; the flags move down to just above the buttons */""}
    ${/* v2.71: the Note moves up to right below the title; "Measure" is now "Unit" */""}
    <div class="edtitlerow"><input id="editName" class="edtitle" value="${esc(editing.name)}" aria-label="${t("Item name")}" />${priceLine(editing.name, { compact:true, note:editing.note||"" })}</div>
    <div class="edrows">${/* v2.74: the rows, each with its open choices, in a cell — Customise the look › Sheets › Layout lays them out */""}
    <div class="edcell" data-row="note">${noteSecHTML(editing.note||"", editing.name, { input:'id="editNote"', chip:"data-en-chip" })}</div>
    <div class="edcell" data-row="qty"><div class="editsec edrow"><span class="editsec-l">${t("Quantity")}</span><span class="eqty"><button id="qMinus" aria-label="${t("Less")}">−</button><span>${editing.qty||1}</span><button id="qPlus" aria-label="${t("More")}">+</button></span></div></div>
    <div class="edcell" data-row="unit"${wOpen==="edit"?' data-open="1"':''}><button class="editsec" data-w-open="edit" aria-expanded="${wOpen==="edit"}" aria-label="${t("Unit")}"><span class="editsec-l">${t("Unit")}</span><span class="editsec-v"><span class="edval">${esc(editing.weight||t("Unit"))} <span class="editsec-ch">${wOpen==="edit"?'▾':'▸'}</span></span></span></button>
    ${weightChips("edit", editing.weight)}</div>
    <div class="edcell" data-row="cat"${editCatOpen?' data-open="1"':''}><button class="editsec" id="ecHead" aria-label="${t("Category")}"><span class="editsec-l">${t("Category")}</span><span class="editsec-v"><span class="edval">${selCat?`${catIcon(selCat,14)} ${esc(catLabel(selCat))}`:'—'} <span class="editsec-ch">${editCatOpen?'▾':'▸'}</span></span></span></button>
    ${editCatOpen ? `<div class="edchips">${chipsHTML(editing.cat)}<button class="catchip" id="ecAddCat" style="border-style:dashed;font-weight:800">${t("＋ New")}</button></div>` : ""}</div>
    ${(isItem || editing.kind==="ba") ? (()=>{ const ws=rcSavedStores(), w=editing.where||"", wl=whereIds({ where:w }), cur=whereNames(wl).join(", ");
      return `<div class="edcell" data-row="where"${editWhereOpen?' data-open="1"':''}><button class="editsec" id="ewHead" aria-label="${t("Where to buy")}"><span class="editsec-l">${t("Where to buy")}</span><span class="editsec-v"><span class="edval">${esc(cur||t("Anywhere"))} <span class="editsec-ch">${editWhereOpen?'▾':'▸'}</span></span></span></button>
      ${editWhereOpen ? `<div class="edchips"><button class="catchip" data-ew="" style="${!w?'background:var(--btn);border-color:var(--btn);color:#fff':''}">${t("Anywhere")}</button>${ws.map(s=>`<button class="catchip" data-ew="${esc(s.id)}" style="${wl.includes(s.id)?'background:var(--btn);border-color:var(--btn);color:#fff':''}" aria-pressed="${wl.includes(s.id)}">${esc(s.name)}</button>`).join("")}</div>` : ""}</div>`; })() : ""}
    </div>
    ${(isItem || editing.kind==="ba") ? `<div class="edchips edflags" style="flex-wrap:nowrap">${[{k:"urgent",label:t("Urgent")},{k:"discount",label:t("If on sale")}].map(f=>{ const on=(editing.tags||[]).includes(f.k); return `<button class="flagchip${on?' on':''}" data-flag="${f.k}"><span aria-hidden="true">${FLAG_ICON[f.k]}</span>${f.label}</button>`; }).join("")}</div>` : ""}
    <div style="display:flex;gap:8px;margin-top:16px">
      <button id="delBtn" style="${btnDelStyle}">${TRASH_SVG(17)}${t("Delete")}</button>
      <button id="saveBtn" style="${btnSaveStyle}">${t("Save")}</button>
    </div>
  </div></div>`;
}

function wireAddBar(){
  const mi=document.querySelector("#mainInput");   // v1.49: the sheet lives in <body>, not under #app
  const mc=document.querySelector("#mainClear");
  const toggleClear=(el,btn)=>{ if(btn) btn.classList.toggle("show", !!(el&&el.value.trim())); };
  const commit=(text)=>{ const t=(text||"").trim(); if(!t) return; draftMain=""; playPlan(true);
    addKeepScroll(()=>stageAdds(()=>addEntries(t,null)));
    const m2=document.getElementById("mainInput"); if(m2){ m2.value=""; m2.focus(); } };
  if(mi){ mi.value=draftMain; grow(mi); toggleClear(mi,mc);
    mi.oninput=()=>{ draftMain=mi.value; grow(mi); toggleClear(mi,mc); if(addEditId) addEditId=null; if(addOpen) refreshAddBody(); };   // v1.32 typing returns from the details panel to search
    mi.onkeydown=e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault();
      /* v1.40 item 1: the keyboard's blue tick now finishes the whole add flow — commit whatever is
         typed, then land back on the shop page. It used to only commit and leave the sheet open. */
      if(addOpen){
        /* v1.44 item 5: the return key is the "I'm done" gesture — commit what's typed and land back on
           the shop page. With the edit panel open the bar only MIRRORS the item that is already on the
           list, so committing its text would add a duplicate; only the prefix typed before it is real. */
        const raw = addEditId ? (addEditPrefix||"") : (mi.value||"");
        const t = raw.trim().replace(/,\s*$/,"");
        if(t){ draftMain=""; playPlan(true); stageAdds(()=>addEntries(t,null)); }
        commitAddSheet(); return; }
      commit(mi.value); } };
    mi.onpaste=e=>{ const t=(e.clipboardData||window.clipboardData).getData("text");
      const looksLikeBlock = t && (t.indexOf("\n")>=0 || /\b(meat|fruit|vegetable|veg|fresh|bulk|asian|alcohol|health|others)\s*:/i.test(t) || t.split(",").length>2);
      if(looksLikeBlock){ e.preventDefault(); commit(t); } }; }
  if(mc){ mc.onpointerdown=e=>e.preventDefault(); mc.onclick=()=>{ if(mi){ mi.value=""; draftMain=""; grow(mi); toggleClear(mi,mc); if(addOpen) refreshAddBody(); mi.focus(); } }; }
}
function wire(){
  const et=app.querySelector("#elseToggle"); if(et) et.onclick=()=>{ elseOpen=!elseOpen; render(); };   // v2.22 R17
  wireAddSheet();
  wireSmartSheet(); wireVoice(); wireSiri();
  wireRcptSheet(); wireTenSheet(); wireCmp(); wireOcc(); wireSpend(); wireLook(); wireAisleMap(); wireShopMenu(); wirePriceDiag(); wireCards(); wireStuck(); wireBaNew(); wireLocDiag(); wireRptSheet(); wireRstSheet();
  { const cb=app.querySelector("#checkedbar.drop"); if(_cartDropping){ const done=()=>{ _cartDropping=false; };
      if(cb && !matchMedia("(prefers-reduced-motion: reduce)").matches){ cb.addEventListener("animationend", done, { once:true }); setTimeout(done, 700); } else done(); } }
  const chh=app.querySelector("#checkedHead"); if(chh) chh.onclick=()=>{ if(_cartDropping) return;   /* v2.72: a stray tap from the tick that moved the list */
    collapse.checked = !(collapse.checked!==false); localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); };
  const ca=app.querySelector("#collapseAll"); if(ca) ca.onclick=()=>{ const ids=catList().filter(c=>state.items.some(i=>catShown(i.cat)===c.id)).map(c=>c.id);
    const open=ids.some(id=>!collapse.cats.includes(id)) || (state.buyAgain.length>0 && collapse.ba);
    collapse.cats = open ? ids.slice() : [];
    collapse.ba = open ? false : true;
    localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); };

  /* item pills: tap = check, hold = edit */
  /* v2.57 item 10a: hold (450 ms) then move more than 8px drags the item within its row (itemDragStart); a hold without
     movement still opens Edit item, a tap still ticks. touch-action and the touchmove block apply only once held. */
  app.querySelectorAll("[data-pill]").forEach(b=>{ const id=b.dataset.pill;
    let down=null, drag=null;
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=e=>{ pressStart(); down={ x:e.clientX, y:e.clientY }; };
    b.onpointermove=e=>{ if(!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
      if(!drag){ if(!longFired || Math.hypot(dx,dy)<=8) return; drag=itemDragStart(b,e); if(!drag){ down=null; return; } }
      tileDragMove(drag, e, dx, dy); };
    b.onpointerleave=()=>{ if(!drag) pressCancel(); };
    b.onpointercancel=()=>{ pressCancel(); down=null; if(drag){ const d=drag; drag=null; tileDragEnd(d,false); } };
    b.addEventListener("touchmove", e=>{ if(down && longFired) e.preventDefault(); }, { passive:false });
    b.onpointerup=(e)=>{ pressCancel(); down=null;
      if(drag){ const d=drag; drag=null; tileDragEnd(d,true); return; }
      const it=state.items.find(i=>i.id===id); if(!it) return;
      if(longFired){ quickEdit=null; editing={kind:"item", ...it}; render(); return; }
      if(e.target.closest("[data-qmore]")){ quickEdit = (quickEdit===id ? null : id); render(); return; }
      quickEdit=null;
      if(shopMode && !it.checked){                        // A23 show the tick first, pause, then fly into the cart
        if(b.classList.contains("picking")) return;
        const circle=b.querySelector(".pcheck"); if(circle) circle.textContent="✓";
        b.classList.add("picking");
        setTimeout(()=>{ if(flyItemToCart(b, it)) _cartPending++; toggleItem(id); }, 260);
        return;
      }
      toggleItem(id); }; });

  /* category header: tap = collapse, hold = edit/reorder/remove */
  app.querySelectorAll("[data-cat]").forEach(b=>{ const id=b.dataset.cat;
    const has=state.items.some(i=>catShown(i.cat)===id);   // v2.17: Others holding only items whose category is gone still folds
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=pressStart; b.onpointerleave=pressCancel; b.onpointercancel=pressCancel;
    b.onpointerup=()=>{ pressCancel(); if(longFired){ const c=CAT(id); editing={kind:"cat", id, label:c.label, emoji:c.img?"":(c.emoji||""), img:c.img||"", color:c.color, iconManual:!!c.img}; render(); }
      else if(has){ toggleCat(id); } }; });

  /* v1.63 item 2: Urgent collapses like any other section. It is not a real category, so it gets its
     own attribute rather than being fed to the `[data-cat]` handler, whose long-press would call
     CAT("__urgent") and open an editor for a category that does not exist. */
  app.querySelectorAll("[data-urgentc]").forEach(b=>b.onclick=()=>toggleCat("__urgent"));

  app.querySelectorAll("[data-add]").forEach(b=>{ const id=b.dataset.add;
    b.onclick=()=>{ if(catEntry===id){ catEntry=null; } else { catEntry=id; draftCatText=""; } render(); const ci=app.querySelector("#catInput"); if(ci) ci.focus(); }; });
  const ci=app.querySelector("#catInput"), cab=app.querySelector("#catAddBtn"), cc=app.querySelector("#catClear");
  const toggleCC=()=>{ if(cc) cc.classList.toggle("show", !!(ci&&ci.value.trim())); };
  if(ci){ ci.value=draftCatText; ci.focus(); grow(ci); toggleCC();
    ci.oninput=()=>{ draftCatText=ci.value; grow(ci); toggleCC(); refreshCatSuggest(); };
    ci.onkeydown=e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); addEntries(ci.value,catEntry); ci.value=""; draftCatText=""; grow(ci); toggleCC(); ci.focus(); } }; }
  if(cc){ cc.onpointerdown=e=>e.preventDefault(); cc.onclick=()=>{ if(ci){ ci.value=""; draftCatText=""; grow(ci); toggleCC(); ci.focus(); } }; }
  /* v1.74 item 1: a suggestion adds straight into the category and leaves the box focused, so several
     can be tapped in a row. pointerdown is cancelled for the same reason it is on #catAddBtn — a tap
     that moves focus takes the keyboard with it. */
  wireCatSuggest();
  if(cab){ cab.onpointerdown=e=>e.preventDefault(); cab.onclick=()=>{ const v=app.querySelector("#catInput").value; addEntries(v,catEntry); draftCatText=""; render(); const x=app.querySelector("#catInput"); if(x){ x.focus(); grow(x); } }; }

  const sb=app.querySelector("#sweepBtn"); if(sb) sb.onclick=()=>sweep();   // v2.13: not onclick=sweep — the click event became the toast's text ("[object PointerEvent]")
  app.querySelectorAll("[data-merge-go]").forEach(b=>b.onclick=()=>mergeCluster(b.dataset.mergeGo));   // v1.15 merge-duplicates card now lives on the combined page
  app.querySelectorAll("[data-merge-x]").forEach(b=>b.onclick=()=>mergeDismiss(b.dataset.mergeX));
  const mHide=app.querySelector("[data-merge-hide]"); if(mHide) mHide.onclick=mergeHideAll;
  const ub=app.querySelector("#undoBtn"); if(ub) ub.onclick=()=>{ if(toastAction) toastAction.fn(); };
  const bh=app.querySelector("#baHead"); if(bh){ bh.oncontextmenu=e=>e.preventDefault();
    bh.onpointerdown=pressStart; bh.onpointerleave=pressCancel; bh.onpointercancel=pressCancel;
    bh.onpointerup=()=>{ pressCancel();
      if(longFired){ editing={kind:"bacat", label:state.baMeta.label||"Buy again", emoji:state.baMeta.img?"":(state.baMeta.emoji||"↩"), img:state.baMeta.img||"", color:"#6AA8FF", iconManual:true, pos:state.baMeta.pos|0}; render(); }
      else { toggleBA(); } }; }

  /* buy-again: tap = restore, hold = edit (remove lives inside the edit popup) */
  app.querySelectorAll(".ba-restore").forEach(b=>{ const _p=b.dataset.restore.split("|"), cat=_p.pop(), name=_p.join("|"), note=b.dataset.regNote||"";
    b.oncontextmenu=e=>e.preventDefault();
    b.onpointerdown=pressStart; b.onpointerleave=pressCancel; b.onpointercancel=pressCancel;
    b.onpointerup=()=>{ pressCancel();
      if(longFired){ const en=regFind(name,cat,note); editing={kind:"ba", name, cat, qty:(en?en.qty||1:1), weight:(en?en.weight||"":""), sub:(en?en.sub||"":""), note:(en?en.note||"":note), where:(en?en.where||"":""), tags:regTags(en), origName:name, origCat:cat, origNote:(en?en.note||"":note)}; render(); }
      else { restore(name,cat,note); } }; });
  const cba=app.querySelector("#clearBA"); if(cba) cba.onclick=()=>{ const prev=snapState(); const now=Date.now(); state.baTomb=state.baTomb||{}; state.buyAgain.forEach(e=>{ state.baTomb[baKey(e)]=now; }); state.buyAgain=[]; save(); render(); showUndo(prev,"Buy-again cleared"); };

  const dsh=app.querySelector("#doneShop"); if(dsh) dsh.onclick=()=>{ if(state.items.some(i=>i.checked)){ finishOpen=true; render(); } else gotoPage(1); };
  const fbg=app.querySelector("#finishBg"); if(fbg) fbg.onclick=e=>{ if(e.target===fbg){ finishOpen=false; render(); } };
  const fsv=app.querySelector("#finishSave"); if(fsv) fsv.onclick=()=>{ finishOpen=false; sweep(); gotoPage(1); };
  const frc=app.querySelector("#finishRcpt"); if(frc) frc.onclick=()=>{ finishOpen=false; render(); rcPick(); };
  const fkp=app.querySelector("#finishKeep"); if(fkp) fkp.onclick=()=>{ finishOpen=false; gotoPage(1); };
  const ssh=app.querySelector("#startShop"); if(ssh) ssh.onclick=()=>gotoPage(1);
  const aiAp=app.querySelector("[data-ai-apply]"); if(aiAp) aiAp.onclick=aiApplyProposal;   // B7 accept the proposed aisle order
  const aiKp=app.querySelector("[data-ai-keep]"); if(aiKp) aiKp.onclick=aiDismissProposal;   // B7 revert / keep current
  const lsw=app.querySelector("#listSwitch"); if(lsw) lsw.onclick=()=>{ listsOpen=true; render(); };   // v1.81 title opens the switcher
  const nrl=app.querySelector("#newerReload"); if(nrl) nrl.onclick=()=>location.reload();   // v2.49 S9 newer-data card
  const icd=app.querySelector("#installDone"); if(icd) icd.onclick=installDismiss;   // v2.15 install card
  const rng=app.querySelector("#rcNudgeGo"); if(rng) rng.onclick=()=>{ rcptNudgeClear(); rcPick(); };   // v2.17 the receipt at the till
  onbWire();   // v2.48 first-time cards
  const rnn=app.querySelector("#rcNudgeNo"); if(rnn) rnn.onclick=()=>{ rcptNudgeClear(); render(); };
  const icg=app.querySelector("#installGo"); if(icg) icg.onclick=()=>{ const p=_bip; _bip=null; if(!p){ installDismiss(); return; }
    try{ p.prompt(); (p.userChoice||Promise.resolve()).finally(installDismiss); }catch(e){ installDismiss(); } };
  const pnv=app.querySelector("#planNav"); if(pnv) pnv.onclick=()=>gotoPage(0);   // Plan tab
  const cn=app.querySelector("#cartNav"); if(cn) cn.onclick=()=>gotoPage(1);
  const stn=app.querySelector("#setNav"); if(stn) stn.onclick=()=>{ settingsFrom=1; gotoPage(2); };   // Settings tab (bottom-right) — slides in from the right
  /* v1.89: a tap adds an item; a press-and-hold offers where the button itself should live. The
     alignment has been in Settings since v1.88, roughly two screens down "Bars and overlays" — which
     is where a setting belongs and not where anyone looks for it. Press-and-hold is the gesture this
     app already uses for "options for this thing" (lists, recipes, items, categories). */
  const saf=app.querySelector("#shopAddFab");
  if(saf){ saf.oncontextmenu=e=>e.preventDefault();
    saf.onpointerdown=pressStart; saf.onpointerleave=pressCancel; saf.onpointercancel=pressCancel;
    saf.onpointerup=()=>{ pressCancel(); if(longFired){ fabMoveOpen=true; render(); } else openAdd(); }; }
  const rsa=app.querySelector("[data-reg-showall]"); if(rsa) rsa.onclick=()=>{   // v1.24 "Regulars" header — shown by default; tap to hide/show the categories
    collapse.regAll = (collapse.regAll===false); localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); };
  app.querySelectorAll("[data-regc]").forEach(b=>{ const id=b.dataset.regc;   // v1.24 each regulars category collapsed by default; tap to open (tracked in regOpen)
    b.onclick=()=>{ if(!collapse.regOpen) collapse.regOpen=[];
      collapse.regOpen = collapse.regOpen.includes(id) ? collapse.regOpen.filter(x=>x!==id) : [...collapse.regOpen, id];
      localStorage.setItem(LS.collapse, JSON.stringify(collapse)); render(); }; });
  /* v2.56 item 5: hold a Regular (the usual 450 ms buzz), then move the finger more than 8px — it drags within its category
     instead of opening its details; letting go renumbers the category's `pos` 0..n-1 (ts bumped so the order syncs).
     A hold with no movement still opens the details as before. touch-action and the touchmove block only apply once held,
     so the page scrolls normally otherwise. */
  const regPress=(b,shortFn,longIdFn)=>{ b.oncontextmenu=e=>e.preventDefault();   // v1.17 tap toggles, long-press edits
    let down=null, drag=null;
    b.onpointerdown=e=>{ e.preventDefault(); pressStart(); down={ x:e.clientX, y:e.clientY }; try{ b.setPointerCapture(e.pointerId); }catch(_){} };   // held from the start, so a mouse or trackpad that slips off the tile still drags
    b.onpointermove=e=>{ if(!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
      if(!drag){ if(!longFired || Math.hypot(dx,dy)<=8 || !b.dataset.regk) return; drag=regDragStart(b,e); if(!drag) return; }
      regDragMove(drag, e, dx, dy); };
    b.onpointerleave=()=>{ if(!drag) pressCancel(); };
    b.onpointercancel=()=>{ pressCancel(); down=null; if(drag){ const d=drag; drag=null; regDragEnd(d,false); } };
    b.addEventListener("touchmove", e=>{ if(down && longFired) e.preventDefault(); }, { passive:false });
    b.onpointerup=()=>{ pressCancel(); down=null;
      if(drag){ const d=drag; drag=null; regDragEnd(d,true); return; }
      if(longFired){ const id=longIdFn&&longIdFn(); if(id) editItemById(id); return; } shortFn(); }; };
  app.querySelectorAll("[data-reg-add]").forEach(b=>{ const p=b.dataset.regAdd.split("|"), cat=p.pop(), name=p.join("|"), note=b.dataset.regNote||"";   // v2.68: the note rides in data-reg-note
    /* v2.36 opened the add sheet and its Edit item panel on a tap here. v2.42 (the household): no need — a Regular already has
       its amount and details, so a tap adds it, as before v2.36; a long-press still opens its details */
    /* v2.65 (the household): a long-press opens the Regular's own editor WITHOUT putting it on the list — its Save keeps it a
       Regular only, as long as it is not on the list (v2.42 added it first, then edited the list item) */
    regPress(b, ()=>{ addFromRegular(name,cat,note); }, ()=>{ const en=regFind(name,cat,note)||{};
      quickEdit=null; editing={kind:"ba", name, cat, qty:en.qty||1, weight:en.weight||"", sub:en.sub||"", note:en.note||"", where:en.where||"", tags:regTags(en), origName:name, origCat:cat, origNote:en.note||""}; render(); return null; }); });
  app.querySelectorAll("[data-reg-rm]").forEach(b=>{ const id=b.dataset.regRm;
    regPress(b, ()=>removeFromList(id), ()=>id); });
  const ot=app.querySelector("#optBtnTop"); if(ot) ot.onclick=()=>{ optOpen=true; listsOpen=false; render(); };
  app.querySelectorAll("[data-example]").forEach(b=>b.onclick=()=>{ addEntries(b.dataset.example, null); });
  /* v2.56 item 4: the empty list's two tiles. openAdd mounts the sheet synchronously, so #mainInput exists for startMic,
     and both stay inside the tap (iOS keyboard and microphone permission need the gesture). */
  { const em=app.querySelector("#emptyMic"); if(em) em.onclick=()=>openVoice();   // v2.57 item 6: the voice sheet, started inside the tap
    const ea=app.querySelector("#emptyAdd"); if(ea) ea.onclick=()=>openAdd(); }
  wireQuickPanel();
  const ac=app.querySelector("#addCat"); if(ac) ac.onclick=addCategory;

  wireUserTiles();

  /* options sheet */
  wireOptions();

  /* lists sheet */
  wireListsSheet();


  wireEditSheet();
}
function wireEditSheet(){
  if(editing){
    const bg=app.querySelector("#sheetBg"); if(bg) bg.onclick=()=>{ editing=null; render(); };
    const sh=app.querySelector("#sheet"); if(sh) sh.onclick=e=>e.stopPropagation();
    if(editing.kind==="newcat"){
      const cn=app.querySelector("#catName"); if(cn) cn.oninput=e=>{ editing.label=e.target.value; autoIcon(); refreshStrip(); };
      wireIconEditor();
      const cc=app.querySelector("#newCreate"); if(cc) cc.onclick=createCategoryFromSheet;
      const cx=app.querySelector("#newCancel"); if(cx) cx.onclick=()=>{ editing=null; render(); };
    } else if(editing.kind==="cat"){
      const cn=app.querySelector("#catName"); if(cn) cn.oninput=e=>{ editing.label=e.target.value; autoIcon(); refreshStrip(); };
      wireIconEditor();
      const mu=app.querySelector("#moveUp"); if(mu) mu.onclick=()=>{ saveCatEditQuiet(); const cs=catList(); const i=cs.findIndex(c=>c.id===editing.id); moveCat(editing.id,i-1); };
      const md=app.querySelector("#moveDown"); if(md) md.onclick=()=>{ saveCatEditQuiet(); const cs=catList(); const i=cs.findIndex(c=>c.id===editing.id); moveCat(editing.id,i+1); };
      const asb=app.querySelector("#addSubBtn"); if(asb) asb.onclick=()=>{ saveCatEditQuiet(); addSub(editing.id); };
      app.querySelectorAll("[data-sublabel]").forEach(inp=>{ inp.onchange=()=>{ const c=catList().find(x=>x.id===editing.id); const s=c&&c.subs.find(z=>z.id===inp.dataset.sublabel); if(s){ s.label=(inp.value||"").trim()||s.label; save(); } }; });
      if(pendingSubFocus){ const ni=app.querySelector(`[data-sublabel="${pendingSubFocus}"]`); pendingSubFocus=null; if(ni){ ni.focus(); } }
      app.querySelectorAll("[data-subup]").forEach(b=>b.onclick=()=>{ saveCatEditQuiet(); moveSub(editing.id,b.dataset.subup,-1); });
      app.querySelectorAll("[data-subdown]").forEach(b=>b.onclick=()=>{ saveCatEditQuiet(); moveSub(editing.id,b.dataset.subdown,1); });
      app.querySelectorAll(".subdel").forEach(b=>b.onclick=()=>{ saveCatEditQuiet(); removeSub(editing.id, b.dataset.sub); });
      const cr=app.querySelector("#catRemove"); if(cr) cr.onclick=()=>removeCat(editing.id);
      const csv=app.querySelector("#catSave"); if(csv) csv.onclick=saveCatEdit;
    } else if(editing.kind==="bacat"){
      const cn=app.querySelector("#catName"); if(cn) cn.oninput=e=>{ editing.label=e.target.value; };
      wireIconEditor();
      const shown = catList().filter(c=> state.items.some(i=>catShown(i.cat)===c.id) || c.custom).length;
      const persistPos=()=>{ state.baMeta={label:editing.label||"Buy again", emoji:editing.img?"":(editing.emoji||"↩"), img:editing.img||"", pos:editing.pos}; save(); };
      const bu=app.querySelector("#baUp"); if(bu) bu.onclick=()=>{ editing.pos=Math.max(0,(Math.min(editing.pos|0,shown))-1); persistPos(); render(); };
      const bd=app.querySelector("#baDown"); if(bd) bd.onclick=()=>{ editing.pos=Math.min(shown,(Math.min(editing.pos|0,shown))+1); persistPos(); render(); };
      const bdel=app.querySelector("#baDeleteHist"); if(bdel) bdel.onclick=()=>{ const prev=snapState(); const now=Date.now(); state.baTomb=state.baTomb||{}; state.buyAgain.forEach(e=>{ state.baTomb[baKey(e)]=now; }); state.buyAgain=[]; editing=null; save(); render(); showUndo(prev,"Buy-again history cleared"); };
      const bsv=app.querySelector("#baCatSave"); if(bsv) bsv.onclick=()=>{ state.baMeta={label:(editing.label||"").trim()||"Buy again", emoji:editing.img?"":(editing.emoji||"↩"), img:editing.img||"", pos:editing.pos|0}; rememberList(listCode, state.name); editing=null; save(); render(); };
    } else {
      const en=app.querySelector("#editName"); if(en) en.oninput=e=>editing.name=e.target.value;
      /* v1.62 item 5: the same in-sheet weight control the add panel uses. Scoped to #sheet rather
         than the document: the add sheet is mounted outside `app` and uses the same attribute names,
         so an unscoped query here could rebind its buttons to `editing`. */
      document.querySelectorAll("#sheet [data-w-open]").forEach(b=>{ b.onpointerdown=e=>e.preventDefault();
        b.onclick=()=>{ wOpen = (wOpen==="edit") ? null : "edit"; render();
          /* v1.64 item 1: bring the newly-opened grid into view — same reason as the add panel. */
          edShowEnd(document.querySelector("#sheet"), "unit"); }; });
      document.querySelectorAll("#sheet [data-w-set]").forEach(b=>tapNoScroll(b, ()=>{
        const w=b.dataset.wSet.split("|")[1]||""; editing.weight=w; wOpen=null; render(); }));
      document.querySelectorAll("#sheet [data-wstep]").forEach(b=>tapNoScroll(b, ()=>{   // v2.76: the counters keep the Unit row open
        const p=b.dataset.wstep.split("|"); editing.weight=wStep(editing.weight,p[1],+p[2]); render(); }));
      const qm=app.querySelector("#qMinus"); if(qm) qm.onclick=()=>{ editing.qty=Math.max(1,(editing.qty||1)-1); render(); };
      const qp=app.querySelector("#qPlus"); if(qp) qp.onclick=()=>{ editing.qty=(editing.qty||1)+1; render(); };
      app.querySelectorAll("[data-ec]").forEach(b=>b.onclick=()=>{ editing.cat=b.dataset.ec; editing.sub=null; render(); });
      app.querySelectorAll("[data-es]").forEach(b=>b.onclick=()=>{ editing.sub=b.dataset.es||null; render(); });
      app.querySelectorAll("[data-flag]").forEach(b=>b.onclick=()=>{ const k=b.dataset.flag; const t=Array.isArray(editing.tags)?editing.tags.slice():[]; const i=t.indexOf(k); if(i<0)t.push(k); else t.splice(i,1); editing.tags=t;
      /* v1.62 item 2: "get this now" and "only if you happen to pass it" are opposite instructions —
         an item cannot be both. Selecting one clears the other rather than refusing the tap, so the
         control never feels stuck. */
      if(k==="urgent") editing.tags = editing.tags.filter(t=>t!=="convenient");
      else if(k==="convenient") editing.tags = editing.tags.filter(t=>t!=="urgent");
      /* v1.58 item 1: Urgent and the old ★ were two controls for one idea. The chip is now the only
         one, and it keeps `starred` in step so the existing "urgent floats to the top" sort and any
         item saved by an older build both keep working. */
      editing.starred = (editing.tags||[]).includes("urgent");
      render(); });
      const ech=app.querySelector("#ecHead"); if(ech) ech.onclick=()=>{ editCatOpen=!editCatOpen; render(); edShowEnd(document.querySelector("#sheet"), "cat"); };
      const ewh=app.querySelector("#ewHead"); if(ewh) ewh.onclick=()=>{ editWhereOpen=!editWhereOpen; render(); edShowEnd(document.querySelector("#sheet"), "where"); };   // v2.22 R17
      /* v2.35: shops toggle on and off — several can be ticked; Anywhere clears them */
      app.querySelectorAll("[data-ew]").forEach(b=>b.onclick=()=>{ const id=b.dataset.ew; if(!id){ editing.where=""; render(); return; }
        const s=new Set(whereIds(editing)); if(s.has(id)) s.delete(id); else s.add(id); editing.where=[...s].join(","); render(); });
      /* v2.70: a chosen tile is removed by a tap; typed text becomes tiles at a comma, Enter or leaving the field */
      const enChip=b=>{ b.onpointerdown=e=>e.preventDefault(); b.onclick=()=>{ editing.note=noteChipTap(b); }; };   // v2.65: no re-render — the field keeps focus
      const enote=app.querySelector("#editNote"); if(enote){
        enote.oninput=()=>{ editing.note = enote.value.indexOf(",")>=0 ? noteCommit(enote, enChip, true) : noteFromWrap(enote.closest(".ednotewrap")); };   // v2.22 R16 · v2.68: selected chips + the free text
        enote.onkeydown=e=>{ if(e.key===","||e.key==="Enter"){ e.preventDefault(); editing.note=noteCommit(enote, enChip); } };
        enote.onblur=()=>{ if(enote.isConnected) editing.note=noteCommit(enote, enChip); }; }
      app.querySelectorAll("[data-en-chip]").forEach(enChip);
      const eac=app.querySelector("#ecAddCat"); if(eac) eac.onclick=()=>{ const nm=prompt(t("New category name:"),""); if(nm&&nm.trim()){ const id=makeCategory(nm); if(id){ editing.cat=id; editing.sub=null; render(); } } };
      const eas=app.querySelector("#esAddSub"); if(eas) eas.onclick=()=>{ if(!editing.cat){ showToast("Pick a category first"); return; } const nm=prompt(t("New subcategory name:"),""); if(nm&&nm.trim()){ const id=makeSub(editing.cat,nm); if(id){ editing.sub=id; render(); } } };
      const del=app.querySelector("#delBtn"); if(del) del.onclick=()=> editing.kind==="item" ? deleteItemEditing() : removeBAfromSheet();
      const sv=app.querySelector("#saveBtn"); if(sv) sv.onclick=()=> saveEverywhere();   // v2.65: one Save — the list and the Regulars
    }
  }
}

/* Three linear pages: Plan (0) ▸ Shop (1) ▸ Settings (2). Plan is its own view as of v1.82; Shop is
   view="detail" with shopMode. The Lists page went in v1.87 — the list switcher behind the title does
   everything it did. A horizontal swipe drags the live page with the finger before committing (see
   transitionTo for the animation). */
function curPageIdx(){ return optOpen ? 2 : (view==="plan" ? 0 : 1); }
function applyPage(idx){
  catEntry=null; quickEdit=null;
  if(idx===2){ optOpen=true; return; }
  optOpen=false;
  if(idx===0){ view="plan"; } else { view="detail"; shopMode=true; }
}
let _pageAnim=false;
/* v1.75 item 3: which way a page arrives, and how fast. Auto is what the app has always done — the
   pages sit in a row (Lists · Shop · Settings) and a new one slides in from the side it lives on, so
   the movement says where you went. A fixed direction is the same motion every time regardless, which
   is what someone who just wants one consistent animation is asking for. Instant is a real answer to
   "speed" and the honest way to turn the movement off. */
const TRANS_DIRS = { auto:"Auto", left:"Left", right:"Right", up:"Up", down:"Down" };
const TRANS_SPD  = { instant:0, fast:220, normal:378, slow:560, slower:800 };
let transDir = TRANS_DIRS[localStorage.getItem("ml_transdir")] ? localStorage.getItem("ml_transdir") : "auto";
let transSpd = (localStorage.getItem("ml_transspd") in TRANS_SPD) ? localStorage.getItem("ml_transspd") : "normal";
function setTransDir(v){ transDir=v; setLS("ml_transdir",v); render(); }
function setTransSpd(v){ transSpd=v; setLS("ml_transspd",v); render(); }
/* v1.75 item 2: where you were on each page, so leaving one and coming back does not throw the
   position away. Settings is the page it matters on — it is long, and the thing you were adjusting is
   halfway down it — but a page you scrolled is a page you scrolled, so all three are remembered.
   Restored after the render AND again on the next frame: the new page's content does not have its
   full height until it has been laid out, so a single scrollTo before that lands short. */
const _pageY={};
/* v1.14/1.18 single-layer transition: render the new page, then slide/fade the incoming .wrap in
   from the correct side. No cloned "ghost" layer, so the old and new screens can never be on
   screen at the same time. As of v1.18 the fixed header (.topfix) lives OUTSIDE .wrap (so an
   ancestor transform can never unpin it on iOS Safari); only the scrolling content (.wrap) slides,
   the header and bottom nav stay put — native-tab style. */
function transitionTo(idx){
  if(idx<0 || idx>2 || _pageAnim) return;
  const from=curPageIdx();
  if(idx===from){ render(); return; }
  const dir = idx>from ? 1 : -1;                                  // 1 → new page enters from the right (it lies to the right)
  applyPage(idx);
  _pageY[from]=window.scrollY||window.pageYOffset||0;
  window.scrollTo(0,0);
  render();
  const backY=_pageY[idx]||0;
  if(backY>0){ window.scrollTo(0,backY); requestAnimationFrame(()=>window.scrollTo(0,backY)); }
  const ms = TRANS_SPD[transSpd];
  if(!ms || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const nw=app.querySelector(".wrap"); if(!nw) return;
  /* the page ENTERS from the named edge: "Left" means it comes in from the left, so it starts at
     -100% and travels to 0. Auto keeps the page order deciding, which is the shipped behaviour. */
  const from100 = transDir==="left" ? "translateX(-100%)" : transDir==="right" ? "translateX(100%)"
                : transDir==="up"   ? "translateY(-100%)" : transDir==="down"  ? "translateY(100%)"
                : "translateX(" + (dir>0?100:-100) + "%)";
  const to0 = from100.indexOf("translateY")===0 ? "translateY(0)" : "translateX(0)";
  _pageAnim=true;
  nw.style.willChange="transform";
  const a=nw.animate([{transform:from100,opacity:.35},{transform:to0,opacity:1}],
    {duration:ms, easing:"cubic-bezier(.32,.72,.30,1)"});
  const fin=()=>{ _pageAnim=false; if(nw.isConnected) nw.style.willChange=""; };
  a.onfinish=fin; a.oncancel=fin; setTimeout(fin, ms+130);          // safety net if WAAPI events don't fire
}
/* v2.60: the one door for items arriving from outside the app — Siri through an iPhone Shortcut (?add=), Android's share
   sheet (?text=), and later the store apps' App Intents / Assistant / share intents (platform.js onOutsideText). Only
   platform.js knows how the text arrives. A text seen in the last 2 minutes is ignored (Siri sometimes opens a link twice);
   with no name yet it waits in sessionStorage until join() sets one. ml_lastoutside and ml_siriSmart are in BOTH exclusions. */
function siriSmartOn(){ try{ return localStorage.getItem("ml_siriSmart")==="1"; }catch(e){ return false; } }
function setSiriSmart(on){ try{ localStorage.setItem("ml_siriSmart", on?"1":"0"); }catch(e){} render(); }
function addFromOutside(text, source){
  text = String(text||"").trim().slice(0, 1000); if(!text) return;
  if(!me){ try{ sessionStorage.setItem("ml_pendingoutside", JSON.stringify({ text, source })); }catch(e){} return; }
  const h = text.toLowerCase();
  try{ const last = JSON.parse(localStorage.getItem("ml_lastoutside")||"null");
    if(last && last.h===h && Date.now()-(+last.t||0) < 120000) return;
    localStorage.setItem("ml_lastoutside", JSON.stringify({ h, t:Date.now() })); }catch(e){}
  if(source==="shortcut") text = text.replace(/\s+(and|et|then|puis)\s+/gi, ", ");
  if(siriSmartOn() && smartOn()){ smartAddText(text); return; }
  const before = addStaged.slice(); addStaged = [];
  stageAdds(()=>addEntries(text, null));
  const ids = addStaged.slice(); addStaged = before;
  const n = ids.length; if(!n){ render(); return; }
  toast = source==="shortcut" ? (getLists().length>1 ? tf("Added {n} to {list}", { n, list: state.name||"Groceries" }) : tf("Added {n} from Siri", { n })) : tf("Added {n} from a share", { n });
  toastAction = { label:"Undo", fn:()=>{ const drop=new Set(ids); state.items = state.items.filter(i=>!drop.has(i.id)); toast=null; toastAction=null; clearTimeout(_toastT); save(); render(); } };
  render(); clearTimeout(_toastT); _toastT=setTimeout(()=>{ toast=null; toastAction=null; render(); }, 5000);
}
var siriOpen=false;   // v2.60 the "Add with Siri" sheet. var: render reads it at boot
var noListOpen=false;   // v2.62 a shortcut's words reached a browser that knows no list. var: render reads it at boot
function noListSheetHTML(){
  return `<div class="sheet-bg" id="noListBg"><div class="sheet" id="noListSheet" role="dialog" aria-labelledby="noListT">
    <div class="disp" id="noListT" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Which list?")}</div>
    <div class="michint">${t("This browser doesn't know your lists yet, so nothing was added. Open your list here once with its share link, or open the shortcut's link in the home-screen app.")}</div>
    <button id="noListOk" class="optaction" style="margin-top:12px">${t("OK")}</button>
  </div></div>`; }
function siriLink(){ return location.origin+"/?add="; }   // v2.62: one link for every list — the phone picks the list
function siriListLink(){ let k=""; try{ k=localStorage.getItem("ml_jk_"+listCode)||""; }catch(e){}
  return location.origin+"/?list="+encodeURIComponent(listCode)+(k?("&k="+encodeURIComponent(k)):"")+"&add="; }
function siriSheetHTML(){
  const steps=[t("Open the Shortcuts app and tap +."), t("Add the action “Dictate Text”."),
    t("Add the action “URL”, paste the link, then tap at the very end and choose “Dictated Text”."),
    t("Add the action “Open URLs”."), t("Name the shortcut “Market List”. Now say “Hey Siri, Market List”.")];
  const on=siriSmartOn();
  return `<div class="sheet-bg" id="siriBg"><div class="sheet" id="siriSheet" role="dialog" aria-labelledby="siriT">
    <div class="disp" id="siriT" style="font-weight:800;font-size:17px;margin-bottom:6px">${t("Add with Siri")}</div>
    <div class="michint">${t("Say “Hey Siri, Market List” and what you need. It lands on the list you used last — or say a list's name first: “Hardware, nails and glue”. Siri turns your voice into text on your iPhone; only the words reach the app.")}</div>
    <div class="optlabel" style="margin-top:12px">${t("One link for all your lists")}</div>
    <input id="siriLink" readonly value="${esc(siriLink())}" style="width:100%;margin-top:12px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--muted2);background:transparent;color:var(--text);font-size:13px">
    <button id="siriCopy" class="storechip" style="margin-top:8px">${t("Copy link")}</button>
    <ol class="michelp">${steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
    <div class="michint">${t("If the shortcut opens Safari instead of the app, Safari doesn't know your lists. Use this list's own link instead:")}</div>
    <input id="siriListLink" readonly value="${esc(siriListLink())}" style="width:100%;margin-top:8px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--muted2);background:transparent;color:var(--text);font-size:13px">
    <button id="siriCopyList" class="storechip" style="margin-top:8px">${t("Copy this list's link")}</button>
    <div class="optrow" style="margin-top:12px"><span class="optlabel">${t("Voice adds go through Smart add")}</span><span class="optctrl"><div class="seg"><button data-siri-smart="1" class="${on?'on':''}">${t("On")}</button><button data-siri-smart="0" class="${!on?'on':''}">${t("Off")}</button></div></span></div>
    <div class="michint">${t("On: Smart add tidies what you said into separate items, and the words are sent to the AI. Off: nothing leaves your phone except the items saved to your list.")}</div>
  </div></div>`; }
function wireSiri(){
  const ob=app.querySelector("#optSiri"); if(ob) ob.onclick=()=>{ siriOpen=true; render(); };
  const bg=app.querySelector("#siriBg"); if(bg) bg.onclick=e=>{ if(e.target===bg){ siriOpen=false; render(); } };
  const cp=app.querySelector("#siriCopy"); if(cp) cp.onclick=()=>{ const u=siriLink();
    if(hasClipboard()){ copyText(u); showToast("Link copied"); } else { const i=app.querySelector("#siriLink"); if(i){ i.focus(); i.select(); } } };
  const cl=app.querySelector("#siriCopyList"); if(cl) cl.onclick=()=>{ const u=siriListLink();
    if(hasClipboard()){ copyText(u); showToast("Link copied"); } else { const i=app.querySelector("#siriListLink"); if(i){ i.focus(); i.select(); } } };
  const nb=app.querySelector("#noListBg"); if(nb) nb.onclick=e=>{ if(e.target===nb){ noListOpen=false; render(); } };
  const nk=app.querySelector("#noListOk"); if(nk) nk.onclick=()=>{ noListOpen=false; render(); };
  app.querySelectorAll("[data-siri-smart]").forEach(b=>b.onclick=()=>{ const want=b.dataset.siriSmart==="1"; if(siriSmartOn()!==want) setSiriSmart(want); });
}
function takePendingOutside(){ let o=null; try{ o=JSON.parse(sessionStorage.getItem("ml_pendingoutside")||"null"); sessionStorage.removeItem("ml_pendingoutside"); }catch(e){}
  if(o && o.text) addFromOutside(o.text, o.source); }
function gotoPage(idx){ transitionTo(idx); }
// v1.20 swipe-between-pages is disabled — navigation is via the bottom nav only (the transition
// still animates, sliding in the logical direction based on the pages' relative positions).
let _swipe=null, _drag=null;
function _swipeBlocked(){ return true; }

window.addEventListener("resize", syncZoomHeight);
/* v2.10: the web font arriving changes every tile's height and the page's — measure again once it has */
if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ try{ syncZoomHeight(); }catch(e){} });
/* v1.63 item 3: the swap has to be in place before the first paint of THIS launch, and the appearance
   globals were read on the way down — so the one launch it runs on applies the new slot 1 and reloads
   into it. Every launch after that picks the start slot up at the top of the module, no reload. */
if(migrateAppSlots163()){ applyStoredAppearance(appSlots()[0]); }
render();
_booted=true; if(_pendingFinish){ const n=_pendingFinish; _pendingFinish=null; autoFinishAt(n); }   // v2.10
{ const o = takeOutsideText(); if(o){ params.delete("add"); if(o.source==="share"){ params.delete("text"); params.delete("title"); }
    if(_outsideNoList && o.source==="shortcut"){ try{ sessionStorage.removeItem("ml_pendingoutside"); }catch(e){} if(me){ noListOpen=true; render(); } }   // v2.62: a browser that knows no list — nothing added, and nothing kept for later
    else addFromOutside((_bootOutside && o.source==="shortcut" && o.text===_bootOutside.from.slice(0,1000).trim()) ? _bootOutside.text : o.text, o.source); } }   // v2.60 Siri (?add=) or a shared text (?text=) — first, and out of the app's own copy of the address too, so the recipe importer's rewrite below can never put it back
takeSharedRecipe();   // v1.90 a page shared in from the phone's share sheet
onOutsideText(addFromOutside);
