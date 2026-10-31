/* Market List reference data: the default categories and their words, the stores and their aisle maps, the wallpaper tints, the emoji library. v2.19: moved out of index.html byte for byte. Pure data: no imports, nothing from the app. */

/* default categories (ids stay fixed; label/color/order are editable & saved) */
export const DEFAULT_CATS = [
  { id:"meat", label:"Meat", emoji:"🥩", color:"#B5402B" },
  { id:"fruit", label:"Fruit", emoji:"🍌", color:"#C98A06" },
  { id:"vegetable", label:"Vegetable", emoji:"🥦", color:"#3E7C3A" },
  { id:"fresh", label:"Fresh", emoji:"🥛", color:"#2E6FA3" },
  { id:"bulk", label:"Bulk", emoji:"🧻", color:"#6B5CA5" },
  { id:"health", label:"Health", emoji:"💊", color:"#2E8C7F" },
  { id:"asian", label:"Asian", emoji:"🍜", color:"#C73B5B" },
  { id:"alcohol", label:"Alcohol", emoji:"🍷", color:"#8A5A2B" },
  { id:"others", label:"Others", emoji:"🛒", color:"#5B6770" },
];

/* meat sub-grouping order: beef, lamb, chicken, seafood, then anything else */
export const MEAT_SUBS = [
  { id:"beef",    words:["beef","steak","sirloin","ribeye","rib eye","brisket","mince","ground beef","wagyu","veal","chuck"] },
  { id:"lamb",    words:["lamb","mutton"] },
  { id:"chicken", words:["chicken","thigh","drumstick","wing","poultry","breast"] },
  { id:"seafood", words:["fish","salmon","prawn","shrimp","tuna","crab","squid","mussel","oyster","scallop","cod","mackerel","seafood","lobster","clam","anchovy","barramundi","snapper","sardine"] },
];

export const DICT = {
  meat:["chicken","beef","pork","lamb","turkey","duck","sausage","bacon","mince","steak","fish","salmon","prawn","shrimp","tuna","ham","wings","drumstick","thigh","ribs","meatball","mutton","veal","crab","squid","scallop","cod","lobster"],
  fruit:["banana","apple","orange","berries","berry","strawberr","blueberr","raspberr","kiwi","grape","mango","melon","watermelon","pineapple","peach","pear","plum","lemon","lime","avocado","cherry","papaya","dragonfruit","lychee","longan"],
  vegetable:["ginger","broccoli","brocollini","broccolini","choysum","choy sum","bok choy","pak choi","kailan","kangkung","tomato","spinach","mushroom","pumpkin","squash","green bean","bean sprout","taugeh","cabbage","chilli","chili","carrot","potato","onion","garlic","shallot","lettuce","cucumber","capsicum","zucchini","corn","celery","kale","leek","eggplant","cauliflower","radish","beetroot","asparagus","coriander","cilantro","basil","spring onion","scallion","lemongrass"],
  fresh:["milk","tofu","egg","yogurt","yoghurt","cheese","parmesan","butter","bread","cream","juice","hummus","margarine","croissant","bagel","baguette"],
  bulk:["sparkling water","water","salt","sugar","flour","rice","pasta","spaghetti","oil","vinegar","tissue","toilet paper","paper towel","kitchen towel","detergent","sponge","cereal","oats","coffee","tea","honey","peanut butter","jam","ketchup","mayo","mustard","stock","canned","chickpea","lentil","battery","foil","popcorn","chocolate chip"],
  asian:["kimchi","ramen","noodle","noodles","udon","soba","soy sauce","miso","gochujang","gochugaru","nori","seaweed","dumpling","gyoza","wonton","fish sauce","oyster sauce","sesame oil","sesame","curry paste","tempeh","mirin","dashi","wasabi","sriracha","sambal","laksa","pho","jin ramen","shin ramen"],
  alcohol:["wine","beer","vodka","whisky","whiskey","gin","rum","soju","sake","cider","champagne","prosecco","tequila"],
  health:["shampoo","conditioner","soap","toothpaste","toothbrush","floss","vitamin","panadol","paracetamol","ibuprofen","medicine","bandage","band-aid","plaster","supplement","probiotic","sunscreen","cough","lozenge","melatonin","fish oil","magnesium"],
};

/* v1.52 — the five colour wallpapers. Deliberately CSS gradients rather than image files: the PWA has
   to work offline with zero external fetches, so every asset ships in the repo, and a flat colour wash
   is a gradient's natural job anyway. `--wall` feeds `background-image`, which takes a gradient
   exactly as happily as a url(). (v1.54 superseded the rest of this paragraph: these are no longer
   gradient-only, and the Top/Bottom control is no longer photo-only — see TINT_BAND below.) */
export const WALL_TINTS = {
  "wall-blue":   "linear-gradient(160deg,#DDE9F8 0%,#9CBEE6 48%,#3F6FA8 100%)",
  "wall-yellow": "linear-gradient(160deg,#FBEFCB 0%,#EDD183 48%,#BE9526 100%)",
  "wall-pink":   "linear-gradient(160deg,#FBE0EC 0%,#EDA6C4 48%,#C25587 100%)",
  "wall-grey":   "linear-gradient(160deg,#E9EBEE 0%,#BFC5CC 48%,#7B838C 100%)"
};

/* v1.54 item 1: the five colour wallpapers had no food band, because they are gradients rather than
   photographs. Rather than shipping five more JPEGs, the existing band art is layered OVER the
   gradient and blended in `luminosity` — the gradient keeps the hue, the photo contributes only its
   light and shade, so the produce reads as a tonal relief in the wallpaper's own colour. That also
   means Top/Bottom now means something for all ten wallpapers, not just the four photographic ones. */
export const TINT_BAND = { "wall-blue":"wall-2", "wall-yellow":"wall-3",
                    "wall-pink":"wall-4", "wall-grey":"wall-2" };

/* Location sort — per-store walk order from aisle photos. Entries scanned top-to-bottom,
   first keyword match wins, so specific multi-word terms precede the generic ones they contain.
   r = walk position (category pins in aisleRank override these for meat/veg/fruit/health/asian/alcohol). */
export const AISLES_DAND = [
  // specific overrides (must beat the generic terms they contain)
  { r:14, words:["longlife milk","long life milk","uht"] },                 // long-life milk is aisle 4 (not the fridge)
  { r:17, words:["coconut milk"] },                                         // aisle 7
  { r:15, words:["peanut butter"] },                                        // aisle 5
  { r:16, words:["soy sauce","fish sauce","oyster sauce","hoisin","sriracha","sambal"] }, // aisle 6 (asian)
  { r:20, words:["fish oil"] },                                             // aisle 10 (health)
  { r:23, words:["toilet paper","toilet roll","toilet"] },                  // aisle 13 (beat "oil" inside "toilet")
  { r:24, words:["ice cream","ice-cream","icecream","icy pole","ice block"] }, // aisle 14
  // front / perimeter
  { r:4,  words:["egg"] },                                                  // eggs at the front with produce
  // numbered aisles 1–14
  { r:11, words:["bread","flatbread","cereal","muesli","oats","weetbix","gluten free","health food","tortilla","bagel","crumpet","croissant","baguette"] },                   // 1
  { r:12, words:["chocolate","lolly","lollies","candy","sweets","gum","snack","chip","crisps","popcorn","cordial"] },                                                          // 2
  { r:13, words:["water","soft drink","softdrink","soda","cola","lemonade","juice","energy drink","mineral water","sparkling","mixer","tonic"] },                              // 3
  { r:14, words:["coffee","tea","cracker","lunchbox","biscuit","cookie","milo","butter"] },                                                                                   // 4 (+ butter)
  { r:15, words:["flour","sugar","bbq","picnic","muesli bar","spread","honey","jam","nutella","maple","baking"] },                                                            // 5
  { r:16, words:["indian","noodle","ramen","udon","soba","asian","pasta","spaghetti","macaroni","international","rice","curry","couscous","quinoa","laksa","pho","yogurt","yoghurt","cream"] }, // 6 (+ yogurt/cream)
  { r:17, words:["sauce","ketchup","mayo","mayonnaise","mustard","canned veg","canned tomato","tinned","paper towel","kitchen towel","canned fish","tuna","sardine","baked bean","bean","chickpea","lentil","quick snack","tomato paste","passata"] },          // 7
  { r:18, words:["gravy","spice","seasoning","oil","vinegar","cookware","houseware","soup","stock","broth","salt","pepper","herb"] },                                          // 8
  { r:19, words:["dishwashing","dishwasher","cleaning","cleaner","brushware","brush","household","laundry","detergent","fabric softener","air freshener","bleach","sponge","garbage bag","bin bag","foil","cling wrap","glad wrap"] },                            // 9
  { r:20, words:["baby","formula","nappy","nappies","diaper","wipes","vitamin","medicine","panadol","paracetamol","ibuprofen","nurofen","dental","toothpaste","toothbrush","floss","mouthwash","supplement","probiotic","bandage","band-aid","plaster","sunscreen","cough","lozenge","melatonin","magnesium"] },                  // 10
  { r:21, words:["shaving","shave","razor","shampoo","conditioner","body wash","bodywash","soap","cosmetic","skin care","skincare","hair care","haircare","deodorant","moisturiser","moisturizer","makeup","lipstick","mascara","tampon","sanitary"] },          // 11
  { r:22, words:["pet food","dog food","dog treat","dog","cat food","cat litter","bird seed","kibble","puppy","kitten"] },                                                     // 12
  { r:23, words:["toilet paper","tissue","hosiery","sock","milk","cheese","frozen veg","mixed veg","frozen pea","fish finger","fish"] },                                       // 13 (+ milk/cheese)
  { r:24, words:["frozen","gelato","sorbet","dip","pastry","puff pastry","pizza","fries","ready meal","frozen meal","berries"] },                                             // 14
];

// Coles Victoria Gardens, Richmond — 10 aisles (r = aisle number + 10; perimeter dairy last).
export const AISLES_RICH = [
  // specific overrides
  { r:12, words:["longlife milk","long life milk","uht"] },                 // aisle 2
  { r:12, words:["peanut butter"] },                                        // aisle 2 (spreads)
  { r:13, words:["muesli bar"] },                                           // aisle 3 (beat "muesli")
  { r:15, words:["coconut milk","soy sauce","fish sauce","oyster sauce","hoisin","sriracha","sambal","curry paste","canned fish","tinned fish","tuna","sardine"] }, // aisle 5
  { r:18, words:["toilet paper","toilet roll","toilet"] },                  // aisle 8 (beat "oil")
  { r:20, words:["ice cream","ice-cream","icecream","frozen veg","mixed veg","frozen pea","frozen meal","fish finger","fish fillet"] }, // aisle 10
  // numbered aisles 1–10
  { r:11, words:["bread","flatbread","gluten free","health food","tortilla","bagel","crumpet","croissant","baguette","topping","sprinkle"] },        // 1
  { r:12, words:["coffee","tea","cereal","weetbix","oats","muesli","spread","honey","jam","nutella","milo"] },                                       // 2
  { r:13, words:["lolly","lollies","candy","sweets","chocolate","biscuit","cookie","cracker","snack","popcorn","gum"] },                             // 3
  { r:14, words:["energy drink","soft drink","softdrink","soda","cola","lemonade","chip","crisps","water","mineral water","sparkling","mixer","tonic","cordial","juice"] }, // 4
  { r:15, words:["indian","international","asian","noodle","ramen","udon","soba","rice","curry","couscous","laksa","pho","pasta","spaghetti","macaroni","canned","tinned","bean","baked bean","chickpea","lentil","passata","pasta sauce","sauce","ketchup","mayo","mustard","soup","stock","broth"] }, // 5
  { r:16, words:["sugar","cookware","houseware","oil","vinegar","flour","baking","herb","spice","seasoning","salt","pepper","gravy"] },               // 6
  { r:17, words:["cosmetic","makeup","lipstick","mascara","dental","toothpaste","toothbrush","floss","mouthwash","body wash","bodywash","soap","hair care","haircare","shampoo","conditioner","deodorant","medicine","panadol","paracetamol","ibuprofen","nurofen","razor","shaving","shave","sunscreen","sanitary","tampon"] }, // 7
  { r:18, words:["baby","formula","nappy","nappies","diaper","wipes","laundry","detergent","fabric softener","tissue","paper towel","kitchen towel","hosiery","sock"] }, // 8
  { r:19, words:["gardening","garden","cleaning","cleaner","brush","air freshener","bleach","dishwashing","dishwasher","sponge","foil","cling wrap","glad wrap","bin bag","garbage bag","pet food","dog food","dog treat","cat food","cat litter","bird seed","kibble","pest control","pest","insect","fly spray"] }, // 9
  { r:20, words:["pizza","frozen","gelato","sorbet","pastry","puff pastry","fries","ready meal","berries","dip","egg","vegetable"] },                 // 10 (eggs + frozen veg)
  // perimeter dairy (end of the walk)
  { r:23, words:["milk","cheese","cream","yogurt","yoghurt","butter"] },
];

export const STORES = [
  { id:"dand",  name:"Coles Dandenong",   lat:-37.9881, lng:145.2140, aisles:AISLES_DAND, naisles:14 },
  { id:"rich",  name:"Coles Vic Garden",  lat:-37.8158, lng:144.9996, aisles:AISLES_RICH, naisles:10 },
  { id:"trade", name:"Coles Traders",     lat:null,     lng:null,     aisles:[] },   // aisle map TBC
  { id:"asri",  name:"Asian Richmond",    lat:null,     lng:null,     aisles:[] },   // aisle map TBC
  { id:"asgl",  name:"Asian Glenferrie",  lat:null,     lng:null,     aisles:[] },   // aisle map TBC
  { id:"dmkt",  name:"Dandenong market",  lat:null,     lng:null,     market:true },  // fresh/meat/produce only
];

export const DEFAULT_CAT_IMG = { fresh:"milk.png", health:"cross.png", asian:"ramen.png" };

export const MEAT_DEFAULT_SUBS = [
  { id:"beef", label:"Beef" }, { id:"lamb", label:"Lamb" },
  { id:"chicken", label:"Chicken" }, { id:"seafood", label:"Seafood" },
];

export const EMOJI_LIB = [
  // meat & poultry
  {e:"🥩",k:"meat beef steak red"},{e:"🍖",k:"meat bone lamb chop ribs"},{e:"🍗",k:"chicken poultry meat drumstick turkey"},{e:"🥓",k:"bacon meat pork"},{e:"🌭",k:"sausage hotdog meat"},{e:"🍔",k:"burger beef meat"},{e:"🐂",k:"beef cow meat"},{e:"🐑",k:"lamb sheep meat"},{e:"🐔",k:"chicken poultry"},{e:"🐷",k:"pork pig meat"},{e:"🦃",k:"turkey poultry meat"},
  // fish & seafood
  {e:"🐟",k:"fish seafood"},{e:"🐠",k:"fish seafood"},{e:"🦐",k:"prawn shrimp seafood"},{e:"🦞",k:"lobster seafood"},{e:"🦀",k:"crab seafood"},{e:"🦑",k:"squid calamari seafood"},{e:"🐙",k:"octopus seafood"},{e:"🦪",k:"oyster shellfish seafood"},{e:"🍣",k:"sushi fish asian seafood"},{e:"🍤",k:"prawn tempura seafood asian"},
  // fruit
  {e:"🍌",k:"banana fruit"},{e:"🍎",k:"apple fruit red"},{e:"🍏",k:"apple green fruit"},{e:"🍐",k:"pear fruit"},{e:"🍊",k:"orange fruit citrus"},{e:"🍋",k:"lemon fruit citrus"},{e:"🍓",k:"strawberry fruit berry"},{e:"🫐",k:"blueberry berry fruit"},{e:"🍇",k:"grape fruit"},{e:"🍉",k:"watermelon fruit"},{e:"🍈",k:"melon fruit"},{e:"🍒",k:"cherry fruit"},{e:"🍑",k:"peach fruit"},{e:"🥭",k:"mango fruit"},{e:"🍍",k:"pineapple fruit"},{e:"🥥",k:"coconut fruit"},{e:"🥝",k:"kiwi fruit"},{e:"🍅",k:"tomato fruit vegetable"},{e:"🫒",k:"olive fruit"},
  // vegetables
  {e:"🥦",k:"broccoli vegetable veg green"},{e:"🥬",k:"lettuce leafy vegetable veg salad"},{e:"🥕",k:"carrot vegetable veg"},{e:"🌽",k:"corn vegetable veg"},{e:"🥒",k:"cucumber vegetable veg"},{e:"🫑",k:"pepper capsicum vegetable veg"},{e:"🌶️",k:"chilli pepper spicy vegetable"},{e:"🧄",k:"garlic vegetable veg"},{e:"🧅",k:"onion vegetable veg"},{e:"🥔",k:"potato vegetable veg"},{e:"🍠",k:"sweet potato yam vegetable"},{e:"🍆",k:"eggplant aubergine vegetable veg"},{e:"🫛",k:"peas beans vegetable veg"},{e:"🍄",k:"mushroom vegetable veg"},{e:"🥗",k:"salad vegetable veg greens"},{e:"🌰",k:"chestnut nut"},
  // dairy & fresh
  {e:"🥛",k:"milk dairy fresh"},{e:"🧀",k:"cheese dairy fresh"},{e:"🥚",k:"egg fresh dairy"},{e:"🧈",k:"butter dairy fresh"},{e:"🍳",k:"egg fried breakfast fresh"},{e:"🥤",k:"drink cup juice fresh"},
  // bakery
  {e:"🍞",k:"bread bakery loaf"},{e:"🥖",k:"baguette bread bakery"},{e:"🥐",k:"croissant bakery pastry"},{e:"🥯",k:"bagel bakery bread"},{e:"🥨",k:"pretzel bakery snack"},{e:"🧇",k:"waffle bakery breakfast"},{e:"🥞",k:"pancake breakfast bakery"},{e:"🍰",k:"cake bakery dessert"},{e:"🧁",k:"cupcake bakery dessert"},{e:"🥧",k:"pie bakery dessert"},{e:"🍪",k:"cookie biscuit snack bakery"},{e:"🍩",k:"donut doughnut bakery"},
  // asian
  {e:"🍜",k:"ramen noodle asian soup"},{e:"🍲",k:"hotpot stew asian soup"},{e:"🍱",k:"bento asian lunch"},{e:"🍚",k:"rice asian"},{e:"🍙",k:"riceball onigiri asian"},{e:"🍘",k:"rice cracker asian"},{e:"🥟",k:"dumpling gyoza asian"},{e:"🥡",k:"takeout box asian"},{e:"🥢",k:"chopsticks asian"},{e:"🍢",k:"oden skewer asian"},{e:"🍛",k:"curry rice asian"},{e:"🫕",k:"fondue pot"},
  // bulk / household / cleaning
  {e:"🧻",k:"toilet paper bulk household tissue"},{e:"🧼",k:"soap cleaning household"},{e:"🧴",k:"bottle lotion shampoo household"},{e:"🧽",k:"sponge cleaning household"},{e:"🧹",k:"broom cleaning household"},{e:"🧺",k:"basket laundry household"},{e:"🪣",k:"bucket cleaning household"},{e:"🧯",k:"extinguisher household"},{e:"🔋",k:"battery household bulk"},{e:"💡",k:"bulb light household"},{e:"🗑️",k:"bin trash household"},{e:"📦",k:"box package bulk others"},{e:"🛒",k:"cart shopping others"},{e:"🛍️",k:"bags shopping others"},
  // health
  {e:"💊",k:"pill medicine health pharmacy"},{e:"🩹",k:"bandage plaster health"},{e:"🌡️",k:"thermometer health"},{e:"🧬",k:"supplement dna health"},{e:"🩺",k:"stethoscope health doctor"},{e:"💉",k:"syringe vaccine health"},{e:"🦠",k:"germ health"},{e:"🧪",k:"vitamin tube health"},{e:"🪥",k:"toothbrush dental health hygiene"},{e:"🧷",k:"safety pin baby"},
  // alcohol & drinks
  {e:"🍷",k:"wine alcohol drink"},{e:"🍺",k:"beer alcohol drink"},{e:"🍻",k:"beers alcohol drink"},{e:"🥂",k:"champagne alcohol drink"},{e:"🍾",k:"champagne bottle alcohol"},{e:"🥃",k:"whisky alcohol drink"},{e:"🍸",k:"cocktail alcohol drink"},{e:"🍹",k:"cocktail tropical drink"},{e:"🍶",k:"sake asian alcohol"},{e:"☕",k:"coffee tea drink"},{e:"🍵",k:"tea drink asian"},{e:"🧃",k:"juice box drink"},{e:"🧋",k:"bubble tea drink asian"},{e:"🥤",k:"soda drink"},{e:"💧",k:"water drink"},
  // snacks / sweets / frozen / condiments
  {e:"🍫",k:"chocolate snack sweet"},{e:"🍬",k:"candy sweet snack"},{e:"🍭",k:"lollipop sweet snack"},{e:"🍿",k:"popcorn snack"},{e:"🥜",k:"peanut nut snack"},{e:"🍯",k:"honey condiment sweet"},{e:"🧂",k:"salt condiment seasoning"},{e:"🧊",k:"ice frozen"},{e:"🍦",k:"ice cream frozen dessert"},{e:"🍨",k:"ice cream frozen dessert"},{e:"🥫",k:"can tin canned food"},{e:"🍝",k:"pasta spaghetti italian"},{e:"🍕",k:"pizza italian"},{e:"🌮",k:"taco mexican"},{e:"🌯",k:"burrito wrap mexican"},
  // baby / pet / others
  {e:"👶",k:"baby kids infant"},{e:"🍼",k:"baby bottle milk infant"},{e:"🐶",k:"pet dog"},{e:"🐱",k:"pet cat"},{e:"🦴",k:"bone pet dog"},{e:"🐾",k:"paw pet"},{e:"🌸",k:"flower garden others"},{e:"🪴",k:"plant garden others"},{e:"🎁",k:"gift present party others"},{e:"🎉",k:"party celebrate others"},{e:"🍴",k:"food dining others"},{e:"🔧",k:"tool hardware spanner diy"},{e:"🔨",k:"hammer tool hardware diy"},{e:"🪛",k:"screwdriver tool hardware diy"},{e:"🔩",k:"screw bolt hardware diy"},
];

/* v2.33 (the household's item 18, docs/categories-proposal.md): thirteen categories, in the order most Australian
   supermarkets are walked, each with its own colour — and Others, the fallback for what nothing else knows. Only NEW lists
   start with them; a list made before keeps its own. Ids shared with the nine (meat, fruit, vegetable, asian, health) mean
   the same thing, so what the app already knows about them carries over. */
export const CATS13 = [
  { id:"fruit",     label:"Fruit",                 emoji:"🍌", color:"#C98A06" },
  { id:"vegetable", label:"Vegetables",            emoji:"🥦", color:"#3E7C3A" },
  { id:"bakery",    label:"Bakery",                emoji:"🍞", color:"#9C6B30" },
  { id:"meat",      label:"Meat & seafood",        emoji:"🥩", color:"#B5402B" },
  { id:"deli",      label:"Deli",                  emoji:"🫒", color:"#7C8A2E" },
  { id:"dairy",     label:"Dairy, eggs & fridge",  emoji:"🥛", color:"#2E5FA3" },
  { id:"pantry",    label:"Pantry",                emoji:"🥫", color:"#6B5CA5" },
  { id:"snacks",    label:"Snacks & drinks",       emoji:"🍿", color:"#D2691E" },
  { id:"frozen",    label:"Frozen",                emoji:"🧊", color:"#1F8FB3" },
  { id:"asian",     label:"Asian & international", emoji:"🍜", color:"#C73B5B" },
  { id:"health",    label:"Health & beauty",       emoji:"💊", color:"#2E8C7F" },
  { id:"household", label:"Household",             emoji:"🧻", color:"#5B6770" },
  { id:"liquor",    label:"Liquor",                emoji:"🍷", color:"#8E2C5E" },
  { id:"others",    label:"Others",                emoji:"🛒", color:"#8A8178" },
];
/* an item's detailed aisle type (js/aisles.js) → its category in the thirteen ("produce" is decided by fruit or veg) */
export const TYPE_CAT13 = { meat:"meat", deli:"deli", dairy:"dairy", bakery:"bakery", frozen:"frozen", breakfast:"pantry",
  spreads:"pantry", pasta:"pantry", canned:"pantry", sauces:"pantry", oil:"pantry", spices:"pantry", baking:"pantry",
  snacks:"snacks", drinks:"snacks", world:"asian", health:"health", personal:"health", baby:"household",
  cleaning:"household", paper:"household", pet:"household", liquor:"liquor", household:"household" };
/* the nine's ids that the thirteen do not have, for a name whose aisle type is unknown */
export const OLD_CAT13 = { fresh:"dairy", bulk:"pantry", alcohol:"liquor" };
/* v2.57 item 9: suggestions for an item's note, by a lowercase name stem (a whole word, plural allowed; the longest stem
   that matches wins). The values are stored data typed into a note — they stay English. */
export const NOTE_HINTS = {
  yogurt:["Greek","low fat","plain","vanilla"], yoghurt:["Greek","low fat","plain","vanilla"],
  milk:["full cream","light","skim","lactose free"], bread:["wholemeal","white","sourdough","multigrain"],
  egg:["free range","cage free","large"], cheese:["tasty","mozzarella","parmesan","light"],
  butter:["salted","unsalted"], chicken:["breast","thigh","skin on","free range"],
  coffee:["beans","ground","decaf"], rice:["jasmine","basmati","brown"], pasta:["spaghetti","penne","gluten free"],
  juice:["no added sugar","with pulp"], cream:["thickened","sour","light"], tomato:["cherry","roma","tinned"],
  potato:["washed","brushed","baby"], bacon:["short cut","middle","streaky"], mince:["beef","lean","pork"],
  flour:["plain","self raising","wholemeal"], sugar:["white","brown","caster","raw"],
  oil:["olive","extra virgin","vegetable","canola"], tea:["bags","green","black"], apple:["red","green","pink lady"],
  onion:["brown","red","spring"] };
