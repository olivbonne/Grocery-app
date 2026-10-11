/* v2.27 An aisle order you actually walk (the plan's "future improvements", 10 October). Pure: no imports — the app
   passes in what these need, like js/tenpct.js, js/compare.js and js/spend.js.

   AISLE TYPES are the detailed subcategories a supermarket arranges its aisles by ("Pasta, rice & grains", "Canned food"),
   in the spirit of the aisle names in Coles' app — written here from general knowledge of Australian supermarkets, not
   copied from it, and not checkable from this environment. The broad categories stay what the screen shows; a type only
   drives the order.

   A name finds its type by the LONGEST word that starts a word in it — so "peanut butter" is a spread, not dairy; "toilet
   paper" is paper goods and "foil" never reads as oil; "eggplant" is produce, not eggs. (The drawings learned this the
   hard way: a short stem hides inside longer words.)

   A SHOP'S AISLE MAP is the shop's own signs in the order the household walks them, one line each ("5 Pasta, rice & sauces").
   An item goes to the first aisle whose sign names its type, or failing that a word in its name. */

export const AISLE_TYPES = [
  { id:"produce",   label:"Fruit & veg",              words:["fruit","vegetable","veg","salad","herbs","apple","banana","orange","lemon","lime","avocado","tomato","potato","onion","garlic","carrot","broccoli","lettuce","spinach","mushroom","capsicum","bell pepper","cucumber","zucchini","eggplant","pumpkin","berries","berry","grape","mango","pear","kiwi","melon","ginger","chilli","bok choy","kangkung","taugeh","bean sprout","sweet potato","corn","celery","cabbage","cauliflower","leek","spring onion","coriander","parsley","basil","mint"] },
  { id:"meat",      label:"Meat & seafood",           words:["meat","chicken","beef","lamb","pork","mince","steak","sausage","sausages","schnitzel","drumstick","thigh","wings","fish","salmon","barramundi","prawn","prawns","seafood","squid","mussels","kangaroo","veal","ribs","chops","burger","burgers","hamburger","hot dog"] },
  { id:"deli",      label:"Deli",                     words:["deli","ham","salami","prosciutto","bacon","olives","dip","dips","hummus","pate","cold cuts","antipasto","chorizo","pastrami"] },
  { id:"dairy",     label:"Dairy, eggs & fridge",     words:["dairy","milk","cheese","yoghurt","yogurt","butter","cream","egg","eggs","margarine","custard","sour cream","cream cheese","feta","mozzarella","parmesan","fresh pasta","tofu"] },
  { id:"bakery",    label:"Bakery",                   words:["bakery","bread","rolls","roll","buns","bun","wraps","wrap","croissant","bagel","baguette","muffin","crumpets","pita","sourdough","tortilla","hot dog buns","hamburger buns","burger buns","hot dog rolls"] },
  { id:"frozen",    label:"Frozen",                   words:["frozen","ice cream","icecream","ice-cream","icy pole","ice block","frozen peas","frozen veg","fish fingers","pizza","dumplings","spring rolls","ice"] },
  { id:"breakfast", label:"Breakfast & cereal",       words:["breakfast","cereal","cereals","oats","muesli","porridge","granola","weet-bix","weetbix","cornflakes","long life milk","longlife milk","uht milk","uht"] },
  { id:"spreads",   label:"Spreads, honey & jam",     words:["spreads","spread","peanut butter","jam","honey","vegemite","nutella","marmalade","maple syrup","syrup"] },
  { id:"pasta",     label:"Pasta, rice & grains",     words:["pasta","spaghetti","penne","fusilli","macaroni","lasagne","lasagna","noodles","noodle","rice","quinoa","couscous","grains","risotto","vermicelli"] },
  { id:"canned",    label:"Canned food",              words:["canned","tinned","tins","tin","cans","baked beans","tuna","sardines","chickpeas","lentils","kidney beans","beans","soup","canned tomatoes","diced tomatoes","corn kernels"] },
  { id:"sauces",    label:"Sauces & condiments",      words:["sauces","sauce","condiments","ketchup","tomato sauce","mayonnaise","mayo","mustard","dressing","vinegar","stock","gravy","tomato paste","pesto","salsa","relish","chutney","pasta sauce"] },
  { id:"oil",       label:"Oil & vinegar",            words:["olive oil","vegetable oil","canola oil","cooking oil","sesame oil","coconut oil","sunflower oil","spray oil","oils","oil & vinegar"] },
  { id:"spices",    label:"Herbs & spices",           words:["spices","spice","seasoning","salt","black pepper","pepper","cumin","paprika","cinnamon","turmeric","curry powder","oregano","dried herbs","stock cubes","garam masala","chilli flakes"] },
  { id:"baking",    label:"Baking",                   words:["baking","flour","sugar","yeast","cocoa","vanilla","icing","baking powder","bicarb","cake mix","choc chips","sprinkles","brown sugar","caster sugar"] },
  { id:"snacks",    label:"Snacks & confectionery",   words:["snacks","snack","chips","crisps","crackers","rice crackers","biscuits","biscuit","cookies","chocolate","lollies","confectionery","popcorn","nuts","almonds","cashews","muesli bar","muesli bars","pretzels","corn chips","tim tams"] },
  { id:"drinks",    label:"Drinks",                   words:["drinks","drink","water","sparkling water","juice","soft drink","soft drinks","soda","coke","lemonade","cordial","coffee","tea","kombucha","energy drink","coconut water","milo"] },
  { id:"world",     label:"International & Asian",    words:["international","asian","soy sauce","fish sauce","oyster sauce","hoisin","sriracha","sambal","kicap","coconut milk","coconut cream","curry paste","miso","nori","rice paper","mexican","indian","taco","tortilla chips","kimchi","gochujang"] },
  { id:"health",    label:"Health & medicine",        words:["health","vitamin","vitamins","medicine","panadol","paracetamol","nurofen","ibuprofen","bandaid","band-aid","first aid","fish oil","antiseptic","cold & flu","cough"] },
  { id:"personal",  label:"Personal care",            words:["personal care","beauty","shampoo","conditioner","soap","body wash","deodorant","toothpaste","toothbrush","mouthwash","floss","razor","razors","sunscreen","moisturiser","lotion","tampons","pads","cotton","hand wash","hair"] },
  { id:"baby",      label:"Baby",                     words:["baby","nappies","nappy","baby wipes","formula","baby food"] },
  { id:"cleaning",  label:"Cleaning & laundry",       words:["cleaning","laundry","detergent","washing powder","washing liquid","dishwashing","dishwasher","bleach","cleaner","spray","sponge","sponges","toilet cleaner","fabric softener","disinfectant","wipes"] },
  { id:"paper",     label:"Paper, foil & wraps",      words:["paper","toilet paper","toilet roll","tissues","paper towel","foil","cling wrap","baking paper","bin bags","garbage bags","zip lock","sandwich bags","serviettes","napkins"] },
  { id:"pet",       label:"Pet",                      words:["pet","pets","dog food","cat food","dog treats","cat litter","kitty litter","pet food"] },
  { id:"liquor",    label:"Liquor",                   words:["liquor","beer","wine","spirits","vodka","gin","whisky","whiskey","rum","cider","prosecco","champagne"] },
  { id:"household", label:"Household",                words:["household","batteries","battery","light bulb","globe","candles","matches","tape","pegs","bin","storage","kitchenware"] },
];

/* the broad category's usual aisle, for a name that matches nothing */
export const CAT_TYPE = { meat:"meat", vegetable:"produce", fruit:"produce", fresh:"dairy", health:"health", asian:"world", alcohol:"liquor" };

const norm = s => " " + String(s || "").toLowerCase().replace(/[^a-z0-9&'-]+/g, " ").replace(/\s+/g, " ").trim() + " ";
/* does `w` start a word in the normalised text `t`? ("oil" starts no word in " toilet paper ", "egg" starts " eggs ") */
const startsWord = (t, w) => t.indexOf(" " + w) >= 0;

/* the type of a name: the type whose word, starting a word in the name, is longest */
export function aisleTypeOf(name){ const t = norm(name); let best = "", bestLen = 0;
  for(const a of AISLE_TYPES) for(const w of a.words){ if(w.length > bestLen && startsWord(t, w)){ best = a.id; bestLen = w.length; } }
  return best; }

/* one line of a map, as typed or read from a sign: "Aisle 5 — Pasta, rice & sauces" → { n:"5", t:"Pasta, rice & sauces" } */
export function parseAisleLine(line){ let s = String(line || "").trim(); if(!s) return null;
  let n = ""; const m = s.match(/^(?:aisle\s*)?([0-9]{1,3}[a-z]?)\b[\s.:·—–-]*/i);
  if(m){ n = m[1].toUpperCase(); s = s.slice(m[0].length).trim(); }
  s = s.replace(/^aisle\b[\s.:·—–-]*/i, "").trim();
  if(!s) return null;
  return { n, t:s.slice(0, 80) }; }

/* the map's aisles, each with the types and words its sign names */
export function mapAisles(aisles){ return (Array.isArray(aisles) ? aisles : []).filter(a => a && a.t).map(a => {
  const parts = String(a.t).toLowerCase().split(/,|&|\/|\+|\band\b|·|;/).map(x => x.trim()).filter(Boolean);
  const types = new Set(parts.map(aisleTypeOf).filter(Boolean)); const whole = aisleTypeOf(a.t); if(whole) types.add(whole);
  return { n:a.n || "", t:a.t, types, parts }; }); }

/* where an item goes in a mapped shop: the index of the first aisle that names its type — or, failing that, a word of its
   name, or its broad category's usual type — and -1 when the map cannot place it */
export function mapRank(mapped, name, cat){ if(!mapped || !mapped.length) return -1;
  const ty = aisleTypeOf(name);
  if(ty){ const i = mapped.findIndex(a => a.types.has(ty)); if(i >= 0) return i; }
  const t = norm(name);
  const j = mapped.findIndex(a => a.parts.some(p => p.length > 2 && startsWord(t, p)));
  if(j >= 0) return j;
  const ct = CAT_TYPE[cat]; if(ct){ const k = mapped.findIndex(a => a.types.has(ct)); if(k >= 0) return k; }
  return -1; }
