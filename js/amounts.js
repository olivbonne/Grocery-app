/* v2.43 (architecture review L17): the amount helpers — reading "1 1/2", rounding, scaling for servings
   and adding two amounts together. Moved byte for byte from js/app.js; pure functions, no imports.
   showAmt (which reads the units setting) stays in js/app.js and uses the table from here. */
export const UNIT_TABLE = {
  // imperial -> base (mass in g, volume in ml)
  oz:{g:28.3495}, ounce:{g:28.3495}, ounces:{g:28.3495},
  lb:{g:453.592}, lbs:{g:453.592}, pound:{g:453.592}, pounds:{g:453.592},
  tsp:{ml:4.92892}, teaspoon:{ml:4.92892}, teaspoons:{ml:4.92892},
  tbsp:{ml:14.7868}, tablespoon:{ml:14.7868}, tablespoons:{ml:14.7868},
  cup:{ml:236.588}, cups:{ml:236.588},
  pint:{ml:473.176}, pints:{ml:473.176}, pt:{ml:473.176},
  quart:{ml:946.353}, quarts:{ml:946.353}, qt:{ml:946.353},
  gallon:{ml:3785.41}, gallons:{ml:3785.41}, gal:{ml:3785.41},
  // metric -> base
  g:{g:1, metric:true}, gram:{g:1, metric:true}, grams:{g:1, metric:true},
  kg:{g:1000, metric:true}, kilo:{g:1000, metric:true}, kilogram:{g:1000, metric:true}, kilograms:{g:1000, metric:true},
  ml:{ml:1, metric:true}, millilitre:{ml:1, metric:true}, milliliter:{ml:1, metric:true},
  cl:{ml:10, metric:true}, dl:{ml:100, metric:true},
  l:{ml:1000, metric:true}, litre:{ml:1000, metric:true}, liter:{ml:1000, metric:true}, litres:{ml:1000, metric:true}, liters:{ml:1000, metric:true},
};
/* A number the way a recipe writes one: 2, 2.5, 1/2, 1 1/2. */
export function parseNum(s){
  const t=String(s).trim().replace(",", ".");
  let m=t.match(/^(\d+)\s+(\d+)\/(\d+)$/); if(m) return +m[1] + (+m[2])/(+m[3]);
  m=t.match(/^(\d+)\/(\d+)$/);             if(m) return (+m[1])/(+m[2]);
  const n=parseFloat(t); return isFinite(n) ? n : null;
}
export function roundAmt(n){
  if(n>=100) return String(Math.round(n/5)*5);
  if(n>=10)  return String(Math.round(n));
  const r=Math.round(n*10)/10; return String(r).replace(/\.0$/,"");
}
/* v1.97: a spoon is a spoon. "2 tbsp" is written identically in a British and an American recipe,
   so turning it into "30 ml" is noise dressed up as help. These units are neutral: never converted
   out of, and — just as important — never converted INTO, or Imperial would keep reintroducing them
   from millilitres and the problem would simply face the other way.
   v2.01: cups join them — the user asked for cups to stay cups. A cup is a measure people cook with,
   not a quantity they want translated. Imperial therefore never produces cups either (pints above a
   pint, fl oz below). */
export const NEUTRAL_UNITS = /^(tsp|teaspoons?|tbsp|tbs|tablespoons?|cups?)$/i;
/* v2.01: scale an amount for a different number of servings — "500 g" × 1.5 → "750 g", "2 cups" × 0.5
   → "1 cup". Scaling is not converting: the unit is kept exactly, spoons and cups included. Anything
   without a readable leading number ("a pinch", "2 cloves" is fine — it has one) passes through. */
export function scaleAmt(w, f){
  const s=String(w||"").trim(); if(!s || !isFinite(f) || f===1) return s;
  const m=s.match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(.*)$/); if(!m) return s;
  const n=parseNum(m[1]); if(n===null) return s;
  let unit=m[2].trim(); const v=roundAmt(n*f);
  if(/^cups?$/i.test(unit)) unit = (v==="1") ? "cup" : "cups";
  return unit ? (v+" "+unit) : v;
}
/* v2.01: two recipes asking for mince should be one line with the total, not two lines. Same unit →
   add the numbers and keep the unit (spoons and cups included — adding is not converting). Same
   family but different units (g and kg, ml and l, lb and g) → add in the base unit and say it in
   metric. Anything else is shown side by side rather than guessed at. */
export function mergeAmt(a, b){
  const A=String(a||"").trim(), B=String(b||"").trim();
  if(!A) return B; if(!B) return A;
  const re=/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(.*)$/;
  const ma=A.match(re), mb=B.match(re);
  if(ma && mb){
    const na=parseNum(ma[1]), nb=parseNum(mb[1]);
    if(na!==null && nb!==null){
      const ua=ma[2].trim(), ub=mb[2].trim();
      const ka=ua.toLowerCase().replace(/s$/,""), kb=ub.toLowerCase().replace(/s$/,"");
      const ta=UNIT_TABLE[ua.toLowerCase()], tb=UNIT_TABLE[ub.toLowerCase()];
      /* Two metric amounts are summed exactly and written the way a shop label would: 500 g + 500 g
         is "1 kg", 1 kg + 250 g is "1.25 kg" (not roundAmt's "1.3 kg", which loses 50 g on a
         shopping line). */
      if(ta && tb && ta.metric && tb.metric){
        const trim=(n)=>String(Math.round(n*1000)/1000);
        if(ta.g!==undefined && tb.g!==undefined){ const g=na*ta.g+nb*tb.g; return g>=1000 ? trim(g/1000)+" kg" : trim(g)+" g"; }
        if(ta.ml!==undefined && tb.ml!==undefined){ const ml=na*ta.ml+nb*tb.ml; return ml>=1000 ? trim(ml/1000)+" l" : trim(ml)+" ml"; }
      }
      if(ka===kb){
        const v=roundAmt(na+nb);
        let unit = ub.length>ua.length ? ub : ua;          // the plural spelling, when one side has it
        if(/^cups?$/i.test(unit)) unit = (v==="1") ? "cup" : "cups";
        return unit ? (v+" "+unit) : v;
      }
      if(ta && tb && !NEUTRAL_UNITS.test(ua) && !NEUTRAL_UNITS.test(ub)){
        if(ta.g!==undefined && tb.g!==undefined){ const g=na*ta.g+nb*tb.g; return g>=1000 ? roundAmt(g/1000)+" kg" : roundAmt(g)+" g"; }
        if(ta.ml!==undefined && tb.ml!==undefined){ const ml=na*ta.ml+nb*tb.ml; return ml>=1000 ? roundAmt(ml/1000)+" l" : roundAmt(ml)+" ml"; }
      }
    }
  }
  return A+" + "+B;
}
