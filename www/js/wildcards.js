// Wildcards: __name__ in a prompt or negative is replaced by a random line of that wildcard's options when a job runs;
// options can hold other __wildcards__, {a|b} choices and ${variables}. Batch Count gives each image its own picks.
(function () {
    const KEY = 'bojroWildcards';          // [ { name, lines: [option] } ]
    const ON_KEY = 'bojroWildcardsOn';     // 'false' turns them off
    // Picking is wcengine.js's; a name typed with spaces ("__hair color__") is the one with underscores.
    const E = window.WcEngine, { TOKEN, MAX_DEPTH, WEIGHT, nameKey, weighted, weightedPick } = E;
    // Garment words the scene model taught (scene.js).
    try { E.learnWear(JSON.parse(localStorage.getItem('bojroWcWear') || '{}')); } catch (e) {}
    // Examples: put there on first run, and back (with these options) by Reset App Configuration (cfg.js).
    // A starter set from the Bungles SFW library; __starter scene__ uses them all.
    const DEFAULTS = [{"name": "starter scene", "lines": ["# A whole picture from the wildcards below: put __starter scene__ in a prompt after your subject (1girl, a character LoRA...).", "# Each __name__ picks one option of that wildcard; options can hold wildcards of their own, labels (## indoor) and conditions (?indoor::).", "__solo__, __looks__, __casual outfits__, __pose__, __expressions__, __casual outfit scenes__, __time of day__, __weather__, __lighting__, __composition__"]}, {"name": "accessories", "lines": ["__bags__", "__belts__", "__eyewear__", "__hats__", "__jewelry__", "__neckwear__", "__wrist accessories__"]}, {"name": "affectionate expressions", "lines": ["?!covered face:: affectionate ## blush", "?!mouth-hidden & !covered face & !mouth-state:: blowing a kiss ## blush, mouth-state", "?!covered face:: blush ## blush", "?!mouth-hidden & !covered face & !mouth-state:: fond smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: gentle smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: kiss ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: loving smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: puckered lips ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: shy smile ## blush, mouth-state", "?!eyes-hidden & !mouth-hidden & !covered face & !gaze & !eye-state & !mouth-state:: smile, closed eyes ## blush, eye-state, eyes-closed, mouth-state", "?!covered face:: tender expression ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "alternative hairstyles", "lines": ["ahoge", "asymmetrical bob", "asymmetrical hair", "bedhead", "drill hair", "emo hairstyle", "half updo, ahoge", "hime cut", "hime cut, long hair", "hime cut, straight hair", "hime cut, very long hair", "jellyfish haircut", "layered haircut", "messy hair", "mullet", "scene haircut", "shag haircut", "shaved side", "sidecut", "spiky hair", "two side up", "undercut", "wolf cut"]}, {"name": "amusement park scenes", "lines": ["## place", "amusement park entrance with colorful gates", "amusement park parade route", "carousel illuminated at night", "Ferris wheel at sunset", "game arcade inside an amusement park", "haunted house attraction", "roller coaster track above the amusement park", "water park with twisting slides"]}, {"name": "angry expressions", "lines": ["?!covered face:: angry ## blush", "?!mouth-hidden & !covered face & !mouth-state:: angry, open mouth ## blush, mouth-state", "?!covered face:: annoyed ## blush", "?!mouth-hidden & !covered face & !mouth-state:: clenched teeth ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: frown ## blush, mouth-state", "?!eyes-hidden & !covered face:: furrowed brow ## blush", "?!eyes-hidden & !covered face:: glare ## blush", "?!mouth-hidden & !covered face & !mouth-state:: pouting ## blush, mouth-state", "?!mouth-hidden & !covered face:: scowl ## blush", "?!mouth-hidden & !covered face & !mouth-state:: shouting ## blush, mouth-state", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "architectural style", "lines": ["__fantasy architecture__", "__futuristic architecture__", "__historical architecture__", "__modern architecture__", "__regional architecture__", "__traditional architecture__"]}, {"name": "artificial lighting", "lines": ["candlelight", "firelight", "neon lights", "overhead lighting", "spotlight", "studio lighting"]}, {"name": "atmospheric lighting", "lines": ["ambient lighting", "ambient occlusion", "backlighting", "bloom", "dramatic lighting", "diffused lighting", "dim lighting", "harsh lighting", "lens flare", "rim lighting", "soft lighting", "underlighting", "volumetric lighting"]}, {"name": "bags", "lines": ["#! school excludes nsfw", "backpack, shoulder straps", "basket bag, woven bag", "belt bag, waist strap", "briefcase, business bag", "0.2::camera around neck", "clutch bag, small handbag", "coin purse, small pouch", "crossbody bag, long strap", "doctor bag, top handles ## top", "drawstring bag, drawstring closure", "duffel bag, sports bag", "fanny pack, waist bag", "gym bag, shoulder strap", "handbag, short handles", "heart shaped purse, small handbag", "holster, thigh holster", "laptop bag, shoulder strap", "leather bag, buckle closure", "messenger bag, crossbody bag", "mini backpack, small bag", "parasol, lace trim", "purse, small bag", "0.2::quiver, arrow holder", "satchel, shoulder bag", "school bag, backpack ## school", "shopping bag, paper bag", "shoulder bag, single strap", "0.2::sword, scabbard, sheathed sword", "tote bag, shoulder bag", "0.2::umbrella, folded umbrella"]}, {"name": "bangs", "lines": ["bob cut, blunt bangs", "bob cut, parted bangs", "hime cut", "hime cut, long hair", "long hair, blunt bangs", "long hair, parted bangs", "long hair, swept bangs", "long straight hair, blunt bangs", "long straight hair, swept bangs", "long wavy hair, parted bangs", "medium hair, blunt bangs", "medium hair, parted bangs", "medium hair, swept bangs", "ponytail, swept bangs", "short hair, blunt bangs", "short hair, swept bangs", "twin braids, blunt bangs", "twintails, blunt bangs"]}, {"name": "belts", "lines": ["belly chain, chain jewelry", "belly chain, waist jewelry", "braided belt, woven belt", "chain belt, metal chain", "chain waist belt, dangling chain", "corset belt, lace up", "decorative sash, ribbon", "double belt, layered belts", "double buckle belt, metal buckle", "elastic belt, stretch belt", "garter belt, garter straps", "grommet belt, metal eyelets", "harness, body harness", "high waisted belt, wide belt", "leather belt, simple buckle", "obi belt, kimono", "obi, sash belt", "pouch belt, multiple pouches", "ribbon belt, bow", "ribbon sash, tied waist", "rope belt, tied waist", "sash, tied waist", "skirt belt, waist belt ## skirt", "studded belt, metal studs", "suspender belt, stocking suspenders", "thin belt, small buckle", "utility belt, multiple pouches", "waist harness, straps", "western belt, ornate buckle", "wide belt, large buckle"]}, {"name": "blouses and shirts", "lines": ["#! school excludes nsfw", "blouse, puffy sleeves ## top", "dress shirt, collared shirt ## button-front, top", "halter neck blouse, sleeveless ## top", "peasant blouse, loose sleeves ## top", "peplum top, flared hem ## top", "polo shirt, short sleeves ## top", "ruffled blouse, frills ## top", "sailor shirt, sailor collar ## school, top"]}, {"name": "boots", "lines": ["ankle boots, high heeled boots", "combat boots, lace-up boots", "cowboy boots, pointed toe", "knee boots, high heels", "lace-up boots, flat soles", "rubber boots", "thigh boots, high heeled boots", "?cold:: ugg boots"]}, {"name": "bottoms", "lines": ["__leggings__", "__pants__", "__shorts__", "__skirts__"]}, {"name": "braided hairstyles", "lines": ["braid", "braided ponytail", "braided ponytail, hair ribbon", "braided ponytail, scrunchie", "braided updo", "crown braid", "crown braid, flower in hair", "dutch braid", "fishtail braid", "fishtail braid, hair ribbon", "french braid", "french braid, hair ribbon", "high twin braids", "long braid", "long braid, hair ribbon", "long braid, scrunchie", "low twin braids", "rope braid", "side braid", "side braid, hair ribbon", "side braid, scrunchie", "single braid", "twin braids", "twin braids, hair bows", "twin braids, hair ribbon", "twin braids, hairbands", "twin braids, scrunchies", "waterfall braid"]}, {"name": "briefs and full coverage panties", "lines": ["__color__ panties ## panties", "__color__ high waisted bottomwear, panties ## panties", "__color__ boyshort panties ## panties"]}, {"name": "brimmed hats", "lines": ["__color__ cowboy hat", "__color__ fedora", "__color__ straw hat", "__color__ porkpie hat"]}, {"name": "camera angles", "lines": ["bird's-eye view", "dutch angle", "eye-level view", "high-angle view", "low-angle view", "worm's-eye view"]}, {"name": "casual and specialty skirts", "lines": ["A-line skirt ## skirt, crotch-covered, upper-legs-covered", "asymmetrical skirt ## skirt, crotch-covered, upper-legs-covered", "denim skirt ## skirt, crotch-covered, upper-legs-covered", "flared skirt ## skirt, crotch-covered, upper-legs-covered", "high-waisted skirt ## skirt, crotch-covered, upper-legs-covered", "maxi skirt ## skirt, crotch-covered, upper-legs-covered", "miniskirt ## crotch-covered, upper-legs-covered, skirt", "wrap skirt ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "casual dresses", "lines": ["babydoll dress, oversized clothes ## dress, crotch-covered", "minidress, short dress ## dress, crotch-covered", "?!cold:: pinafore dress, sleeveless ## dress, crotch-covered", "shirt dress, collared dress ## dress, top, crotch-covered", "summer dress, short sleeves ## dress, crotch-covered", "?!cold:: sundress, sleeveless ## dress, crotch-covered", "sweater dress, long sleeves ## dress, top, crotch-covered", "sweatshirt dress, oversized ## dress, crotch-covered"]}, {"name": "casual hats and caps", "lines": ["__color__ baseball cap", "__color__ beanie", "__color__ bucket hat", "__color__ cabbie hat", "__color__ newsboy cap", "__color__ visor cap", "__color__ visor", "__color__ sun hat"]}, {"name": "casual outfit scenes", "lines": ["__everyday japanese scenes__", "cafe ## place, place-indoor", "living room ## place, place-indoor", "park ## place, place-outdoor", "residential street, __architectural style__ ## place, place-outdoor", "shopping street, __architectural style__ ## place, place-outdoor"]}, {"name": "casual outfits", "lines": ["## dressed", "{3::${c00cb90=!mint green}${c00cb91=!light blue}${c00cb92=!white}|3::${c00cb90=!yellow}${c00cb91=!blue}${c00cb92=!white}|3::${c00cb90=!blue}${c00cb91=!light blue}${c00cb92=!white}|3::${c00cb90=!lavender}${c00cb91=!light blue}${c00cb92=!white}|2::${c00cb90=!burgundy}${c00cb91=!blue}${c00cb92=!white}|2::${c00cb90=!orange}${c00cb91=!orange}${c00cb92=!white}|2::${c00cb90=!coral}${c00cb91=!orange}${c00cb92=!white}|2::${c00cb90=!mint green}${c00cb91=!mint green}${c00cb92=!white}|3::${c00cb90=!yellow}${c00cb91=!orange}${c00cb92=!white}|2::${c00cb90=!blue}${c00cb91=!teal}${c00cb92=!white}|2::${c00cb90=!lavender}${c00cb91=!light blue}${c00cb92=!light pink}|2::${c00cb90=!burgundy}${c00cb91=!pink}${c00cb92=!white}|2::${c00cb90=!orange}${c00cb91=!blue}${c00cb92=!white}|2::${c00cb90=!coral}${c00cb91=!pink}${c00cb92=!white}|2::${c00cb90=!mint green}${c00cb91=!light blue}${c00cb92=!light pink}|3::${c00cb90=!yellow}${c00cb91=!emerald green}${c00cb92=!white}}casual outfit, {6::${c00cb90}|${c00cb90} __top pattern__} hoodie, ${c00cb91} jeans, ${c00cb92} sneakers ## legs-covered, top", "?!cold:: open jacket, {4::${c0626c0=!black}${c0626c1=!white}${c0626c2=!red}|3::${c0626c0=!dark brown}${c0626c1=!white}${c0626c2=!red}|3::${c0626c0=!dark grey}${c0626c1=!white}${c0626c2=!red}|3::${c0626c0=!navy blue}${c0626c1=!white}${c0626c2=!red}|2::${c0626c0=!dark green}${c0626c1=!white}${c0626c2=!green}|3::${c0626c0=!black}${c0626c1=!white}${c0626c2=!teal}|2::${c0626c0=!dark brown}${c0626c1=!beige}${c0626c2=!red}|2::${c0626c0=!dark grey}${c0626c1=!white}${c0626c2=!blue}|2::${c0626c0=!navy blue}${c0626c1=!beige}${c0626c2=!red}|2::${c0626c0=!dark green}${c0626c1=!white}${c0626c2=!yellow}|3::${c0626c0=!black}${c0626c1=!white}${c0626c2=!pink}|2::${c0626c0=!dark brown}${c0626c1=!white}${c0626c2=!teal}|2::${c0626c0=!dark grey}${c0626c1=!white}${c0626c2=!pink}|2::${c0626c0=!navy blue}${c0626c1=!white}${c0626c2=!blue}|2::${c0626c0=!dark green}${c0626c1=!white}${c0626c2=!teal}|3::${c0626c0=!black}${c0626c1=!white}${c0626c2=!yellow}}casual outfit, ${c0626c0} denim jacket, ${c0626c1} tank top, ${c0626c2} plaid skirt, ${c0626c0} knee socks, ${c0626c0} loafers ## skirt, top", "{4::${c083390=!light pink}${c083391=!beige}${c083392=!white}|3::${c083390=!yellow}${c083391=!beige}${c083392=!white}|3::${c083390=!orange}${c083391=!beige}${c083392=!white}|3::${c083390=!lavender}${c083391=!beige}${c083392=!white}|3::${c083390=!purple}${c083391=!beige}${c083392=!white}|3::${c083390=!blue}${c083391=!beige}${c083392=!white}|3::${c083390=!mint green}${c083391=!beige}${c083392=!white}|3::${c083390=!light pink}${c083391=!light pink}${c083392=!white}|2::${c083390=!yellow}${c083391=!beige}${c083392=!beige}|2::${c083390=!orange}${c083391=!cream}${c083392=!white}|2::${c083390=!lavender}${c083391=!beige}${c083392=!beige}|2::${c083390=!purple}${c083391=!beige}${c083392=!light grey}|2::${c083390=!blue}${c083391=!beige}${c083392=!cream}|2::${c083390=!mint green}${c083391=!beige}${c083392=!cream}|3::${c083390=!light pink}${c083391=!white}${c083392=!white}|2::${c083390=!yellow}${c083391=!beige}${c083392=!light grey}}casual outfit, {6::${c083390}|${c083390} __top pattern__} blouse, ${c083391} ballet flats, ${c083392} jeans ## legs-covered, top", "?!cold:: {4::${c098e30=!blue}${c098e31=!white}${c098e32=!brown}|3::${c098e30=!yellow}${c098e31=!white}${c098e32=!brown}|3::${c098e30=!orange}${c098e31=!white}${c098e32=!brown}|3::${c098e30=!green}${c098e31=!white}${c098e32=!brown}|2::${c098e30=!pink}${c098e31=!white}${c098e32=!grey}|2::${c098e30=!light blue}${c098e31=!white}${c098e32=!grey}|2::${c098e30=!lavender}${c098e31=!white}${c098e32=!grey}|3::${c098e30=!blue}${c098e31=!beige}${c098e32=!brown}|2::${c098e30=!yellow}${c098e31=!cream}${c098e32=!brown}|2::${c098e30=!orange}${c098e31=!beige}${c098e32=!brown}|2::${c098e30=!green}${c098e31=!white}${c098e32=!grey}|${c098e30=!pink}${c098e31=!light grey}${c098e32=!grey}|${c098e30=!light blue}${c098e31=!beige}${c098e32=!grey}|${c098e30=!lavender}${c098e31=!light grey}${c098e32=!grey}|3::${c098e30=!blue}${c098e31=!white}${c098e32=!khaki}|2::${c098e30=!yellow}${c098e31=!white}${c098e32=!khaki}}casual outfit, ${c098e30} striped button-up shirt, ${c098e31} shorts, ${c098e31} canvas shoes, ${c098e32} belt ## button-front, top, shorts, crotch-covered, upper-legs-covered", "{5::${c107000=!dark green}${c107001=!white}${c107002=!beige}${c107003=!brown}|4::${c107000=!dark brown}${c107001=!white}${c107002=!beige}${c107003=!brown}|4::${c107000=!burgundy}${c107001=!white}${c107002=!beige}${c107003=!brown}|4::${c107000=!black}${c107001=!white}${c107002=!beige}${c107003=!brown}|4::${c107000=!dark grey}${c107001=!white}${c107002=!beige}${c107003=!brown}|4::${c107000=!dark green}${c107001=!white}${c107002=!beige}${c107003=!grey}|3::${c107000=!dark brown}${c107001=!white}${c107002=!beige}${c107003=!tan}|3::${c107000=!burgundy}${c107001=!white}${c107002=!beige}${c107003=!khaki}|3::${c107000=!black}${c107001=!cream}${c107002=!beige}${c107003=!brown}|3::${c107000=!dark grey}${c107001=!white}${c107002=!cream}${c107003=!brown}|4::${c107000=!dark green}${c107001=!cream}${c107002=!beige}${c107003=!brown}|3::${c107000=!dark brown}${c107001=!white}${c107002=!beige}${c107003=!khaki}|3::${c107000=!burgundy}${c107001=!white}${c107002=!beige}${c107003=!grey}|3::${c107000=!black}${c107001=!white}${c107002=!beige}${c107003=!tan}|3::${c107000=!dark grey}${c107001=!white}${c107002=!beige}${c107003=!camel}|4::${c107000=!dark green}${c107001=!white}${c107002=!beige}${c107003=!camel}}casual outfit, {6::${c107000}|${c107000} __top pattern__} cardigan, ${c107001} collared shirt, ${c107002} pleated skirt, ${c107003} loafers ## button-front, skirt, top", "{3::${c1cdfa0=!white}${c1cdfa1=!lavender}|2::${c1cdfa0=!light blue}${c1cdfa1=!lavender}|2::${c1cdfa0=!beige}${c1cdfa1=!lavender}|2::${c1cdfa0=!light pink}${c1cdfa1=!lavender}|2::${c1cdfa0=!cream}${c1cdfa1=!lavender}|2::${c1cdfa0=!white}${c1cdfa1=!yellow}|${c1cdfa0=!light blue}${c1cdfa1=!blue}|${c1cdfa0=!beige}${c1cdfa1=!mint green}|${c1cdfa0=!light pink}${c1cdfa1=!sky blue}|${c1cdfa0=!cream}${c1cdfa1=!emerald green}|2::${c1cdfa0=!white}${c1cdfa1=!sky blue}|${c1cdfa0=!light blue}${c1cdfa1=!sky blue}|${c1cdfa0=!beige}${c1cdfa1=!yellow}|${c1cdfa0=!light pink}${c1cdfa1=!mint green}|${c1cdfa0=!cream}${c1cdfa1=!blue}|2::${c1cdfa0=!white}${c1cdfa1=!burgundy}}casual outfit, pastel yellow cardigan, ${c1cdfa0} camisole, ${c1cdfa0} flats, ${c1cdfa1} midi skirt ## button-front, skirt, top", "{3::${c22bf00=!brown}${c22bf01=!cream}|2::${c22bf00=!camel}${c22bf01=!cream}|2::${c22bf00=!olive}${c22bf01=!cream}|2::${c22bf00=!khaki}${c22bf01=!cream}|2::${c22bf00=!tan}${c22bf01=!cream}|2::${c22bf00=!brown}${c22bf01=!white}|${c22bf00=!camel}${c22bf01=!white}|${c22bf00=!olive}${c22bf01=!light grey}|${c22bf00=!khaki}${c22bf01=!beige}|${c22bf00=!tan}${c22bf01=!white}|2::${c22bf00=!brown}${c22bf01=!light grey}|${c22bf00=!camel}${c22bf01=!light grey}|${c22bf00=!olive}${c22bf01=!beige}|${c22bf00=!khaki}${c22bf01=!white}|${c22bf00=!tan}${c22bf01=!light grey}|2::${c22bf00=!brown}${c22bf01=!beige}}casual outfit, ${c22bf00} knit sweater, ${c22bf01} pleated skirt, ${c22bf01} tights, ${c22bf00} knee-high boots ## legs-covered, skirt, top", "{3::${c403ce0=!white}${c403ce1=!black}|2::${c403ce0=!light grey}${c403ce1=!black}|2::${c403ce0=!beige}${c403ce1=!black}|2::${c403ce0=!cream}${c403ce1=!black}|2::${c403ce0=!light blue}${c403ce1=!black}|2::${c403ce0=!white}${c403ce1=!dark grey}|${c403ce0=!light grey}${c403ce1=!burgundy}|${c403ce0=!beige}${c403ce1=!dark grey}|${c403ce0=!cream}${c403ce1=!burgundy}|${c403ce0=!light blue}${c403ce1=!dark grey}|2::${c403ce0=!white}${c403ce1=!burgundy}|${c403ce0=!light grey}${c403ce1=!dark brown}|${c403ce0=!beige}${c403ce1=!navy blue}|${c403ce0=!cream}${c403ce1=!navy blue}|${c403ce0=!light blue}${c403ce1=!navy blue}|2::${c403ce0=!white}${c403ce1=!dark brown}}casual outfit, {6::${c403ce0}|${c403ce0} __top pattern__} blouse, ${c403ce1} pinafore dress, ${c403ce1} tights, ${c403ce1} mary janes ## dress, legs-covered, top", "{4::${c6b4fd0=!grey}${c6b4fd1=!black}${c6b4fd2=!white}|3::${c6b4fd0=!camel}${c6b4fd1=!black}${c6b4fd2=!white}|3::${c6b4fd0=!khaki}${c6b4fd1=!black}${c6b4fd2=!white}|3::${c6b4fd0=!brown}${c6b4fd1=!black}${c6b4fd2=!white}|3::${c6b4fd0=!tan}${c6b4fd1=!black}${c6b4fd2=!white}|3::${c6b4fd0=!grey}${c6b4fd1=!black}${c6b4fd2=!cream}|2::${c6b4fd0=!camel}${c6b4fd1=!dark green}${c6b4fd2=!white}|2::${c6b4fd0=!khaki}${c6b4fd1=!dark brown}${c6b4fd2=!white}|2::${c6b4fd0=!brown}${c6b4fd1=!black}${c6b4fd2=!cream}|2::${c6b4fd0=!tan}${c6b4fd1=!dark grey}${c6b4fd2=!white}|3::${c6b4fd0=!grey}${c6b4fd1=!black}${c6b4fd2=!light pink}|2::${c6b4fd0=!camel}${c6b4fd1=!black}${c6b4fd2=!cream}|2::${c6b4fd0=!khaki}${c6b4fd1=!dark green}${c6b4fd2=!white}|2::${c6b4fd0=!brown}${c6b4fd1=!dark green}${c6b4fd2=!white}|2::${c6b4fd0=!tan}${c6b4fd1=!navy blue}${c6b4fd2=!white}|3::${c6b4fd0=!grey}${c6b4fd1=!dark grey}${c6b4fd2=!white}}casual outfit, ${c6b4fd0} sweatshirt, ${c6b4fd1} leggings, ${c6b4fd2} running shoes ## legs-covered", "?!cold:: {3::${c80bdc0=!red}${c80bdc1=!black}|2::${c80bdc0=!green}${c80bdc1=!black}|2::${c80bdc0=!yellow}${c80bdc1=!black}|2::${c80bdc0=!sky blue}${c80bdc1=!black}|2::${c80bdc0=!coral}${c80bdc1=!black}|2::${c80bdc0=!burgundy}${c80bdc1=!black}|2::${c80bdc0=!mustard yellow}${c80bdc1=!black}|2::${c80bdc0=!red}${c80bdc1=!navy blue}|${c80bdc0=!green}${c80bdc1=!dark brown}|${c80bdc0=!yellow}${c80bdc1=!dark brown}|${c80bdc0=!sky blue}${c80bdc1=!navy blue}|${c80bdc0=!coral}${c80bdc1=!dark brown}|${c80bdc0=!burgundy}${c80bdc1=!burgundy}|${c80bdc0=!mustard yellow}${c80bdc1=!navy blue}|2::${c80bdc0=!red}${c80bdc1=!burgundy}|${c80bdc0=!green}${c80bdc1=!dark green}}casual outfit, ${c80bdc0} plaid shirt, ${c80bdc1} denim shorts, ${c80bdc1} ankle boots, ${c80bdc1} belt ## top, shorts, crotch-covered, upper-legs-covered", "{4::${c88f150=!beige}${c88f151=!white}${c88f152=!orange}${c88f153=!brown}|3::${c88f150=!cream}${c88f151=!white}${c88f152=!teal}${c88f153=!brown}|3::${c88f150=!white}${c88f151=!white}${c88f152=!teal}${c88f153=!brown}|3::${c88f150=!light pink}${c88f151=!white}${c88f152=!light blue}${c88f153=!grey}|3::${c88f150=!light blue}${c88f151=!white}${c88f152=!light blue}${c88f153=!grey}|4::${c88f150=!beige}${c88f151=!white}${c88f152=!yellow}${c88f153=!brown}|3::${c88f150=!cream}${c88f151=!white}${c88f152=!blue}${c88f153=!brown}|3::${c88f150=!white}${c88f151=!white}${c88f152=!orange}${c88f153=!brown}|2::${c88f150=!light pink}${c88f151=!light grey}${c88f152=!light blue}${c88f153=!grey}|2::${c88f150=!light blue}${c88f151=!light pink}${c88f152=!light blue}${c88f153=!grey}|4::${c88f150=!beige}${c88f151=!white}${c88f152=!teal}${c88f153=!brown}|3::${c88f150=!cream}${c88f151=!white}${c88f152=!orange}${c88f153=!brown}|3::${c88f150=!white}${c88f151=!white}${c88f152=!blue}${c88f153=!brown}|2::${c88f150=!light pink}${c88f151=!light blue}${c88f152=!light blue}${c88f153=!grey}|2::${c88f150=!light blue}${c88f151=!cream}${c88f152=!light blue}${c88f153=!grey}|4::${c88f150=!beige}${c88f151=!white}${c88f152=!burgundy}${c88f153=!brown}}casual outfit, {6::${c88f150}|${c88f150} __top pattern__} cardigan, ${c88f151} t-shirt, ${c88f152} jeans, ${c88f151} sneakers, ${c88f153} shoulder bag ## button-front, legs-covered, top", "?!cold:: {4::${c936070=!cream}${c936071=!white}${c936072=!pink}|3::${c936070=!light grey}${c936071=!white}${c936072=!pink}|3::${c936070=!white}${c936071=!white}${c936072=!pink}|3::${c936070=!light pink}${c936071=!white}${c936072=!pink}|2::${c936070=!light blue}${c936071=!white}${c936072=!blue}|3::${c936070=!cream}${c936071=!beige}${c936072=!pink}|2::${c936070=!light grey}${c936071=!white}${c936072=!orange}|2::${c936070=!white}${c936071=!beige}${c936072=!pink}|2::${c936070=!light pink}${c936071=!light pink}${c936072=!pink}|2::${c936070=!light blue}${c936071=!white}${c936072=!light blue}|3::${c936070=!cream}${c936071=!white}${c936072=!light blue}|2::${c936070=!light grey}${c936071=!white}${c936072=!sky blue}|2::${c936070=!white}${c936071=!white}${c936072=!sky blue}|2::${c936070=!light pink}${c936071=!light grey}${c936072=!pink}|2::${c936070=!light blue}${c936071=!white}${c936072=!sky blue}|3::${c936070=!cream}${c936071=!light grey}${c936072=!pink}}casual outfit, {6::${c936070}|${c936070} __top pattern__} hoodie, pastel pink shorts, ${c936071} ankle socks, ${c936072} sneakers ## top, shorts, crotch-covered, upper-legs-covered", "{4::${cb195c0=!navy blue}${cb195c1=!beige}${cb195c2=!white}|3::${cb195c0=!dark grey}${cb195c1=!beige}${cb195c2=!white}|3::${cb195c0=!dark green}${cb195c1=!beige}${cb195c2=!white}|3::${cb195c0=!dark brown}${cb195c1=!beige}${cb195c2=!white}|3::${cb195c0=!black}${cb195c1=!beige}${cb195c2=!white}|3::${cb195c0=!navy blue}${cb195c1=!beige}${cb195c2=!light blue}|2::${cb195c0=!dark grey}${cb195c1=!light blue}${cb195c2=!white}|2::${cb195c0=!dark green}${cb195c1=!white}${cb195c2=!white}|2::${cb195c0=!dark brown}${cb195c1=!white}${cb195c2=!white}|2::${cb195c0=!black}${cb195c1=!beige}${cb195c2=!cream}|3::${cb195c0=!navy blue}${cb195c1=!beige}${cb195c2=!light grey}|2::${cb195c0=!dark grey}${cb195c1=!beige}${cb195c2=!cream}|2::${cb195c0=!dark green}${cb195c1=!beige}${cb195c2=!cream}|2::${cb195c0=!dark brown}${cb195c1=!beige}${cb195c2=!cream}|2::${cb195c0=!black}${cb195c1=!cream}${cb195c2=!white}|3::${cb195c0=!navy blue}${cb195c1=!light blue}${cb195c2=!white}}casual outfit, ${cb195c0} sweatshirt, ${cb195c1} chinos, ${cb195c2} sneakers ## legs-covered", "{3::${cb462d0=!black}${cb462d1=!dark blue}|2::${cb462d0=!dark brown}${cb462d1=!dark blue}|2::${cb462d0=!dark green}${cb462d1=!dark blue}|2::${cb462d0=!navy blue}${cb462d1=!dark blue}|2::${cb462d0=!dark grey}${cb462d1=!dark blue}|2::${cb462d0=!black}${cb462d1=!dark grey}|${cb462d0=!dark brown}${cb462d1=!dark brown}|${cb462d0=!dark green}${cb462d1=!dark green}|${cb462d0=!navy blue}${cb462d1=!dark grey}|${cb462d0=!dark grey}${cb462d1=!dark green}|2::${cb462d0=!black}${cb462d1=!navy blue}|${cb462d0=!dark brown}${cb462d1=!dark green}|${cb462d0=!dark green}${cb462d1=!navy blue}|${cb462d0=!navy blue}${cb462d1=!dark brown}|${cb462d0=!dark grey}${cb462d1=!navy blue}|2::${cb462d0=!black}${cb462d1=!dark green}}casual outfit, ${cb462d0} oversized sweater, ${cb462d1} skinny jeans, ${cb462d0} ankle boots ## legs-covered, top", "?!cold:: open jacket, {3::${cb90960=!light blue}${cb90961=!white}|2::${cb90960=!green}${cb90961=!white}|2::${cb90960=!purple}${cb90961=!white}|2::${cb90960=!emerald green}${cb90961=!white}|2::${cb90960=!orange}${cb90961=!white}|2::${cb90960=!pink}${cb90961=!white}|2::${cb90960=!burgundy}${cb90961=!white}|2::${cb90960=!light blue}${cb90961=!light grey}|${cb90960=!green}${cb90961=!cream}|${cb90960=!purple}${cb90961=!beige}|${cb90960=!emerald green}${cb90961=!light grey}|${cb90960=!orange}${cb90961=!light grey}|${cb90960=!pink}${cb90961=!beige}|${cb90960=!burgundy}${cb90961=!beige}|2::${cb90960=!light blue}${cb90961=!beige}|${cb90960=!green}${cb90961=!light grey}}casual outfit, ${cb90960} denim jacket, ${cb90961} sundress, ${cb90961} sandals ## dress", "{4::${cd23200=!cream}${cd23201=!olive green}${cd23202=!brown}|3::${cd23200=!beige}${cd23201=!olive green}${cd23202=!brown}|3::${cd23200=!light grey}${cd23201=!olive green}${cd23202=!brown}|${cd23200=!light blue}${cd23201=!lavender}${cd23202=!grey}|${cd23200=!light pink}${cd23201=!light blue}${cd23202=!grey}|3::${cd23200=!cream}${cd23201=!olive green}${cd23202=!tan}|2::${cd23200=!beige}${cd23201=!olive green}${cd23202=!grey}|2::${cd23200=!light grey}${cd23201=!mustard yellow}${cd23202=!brown}|${cd23200=!light blue}${cd23201=!sky blue}${cd23202=!grey}|${cd23200=!light pink}${cd23201=!pink}${cd23202=!grey}|3::${cd23200=!cream}${cd23201=!olive green}${cd23202=!grey}|2::${cd23200=!beige}${cd23201=!olive green}${cd23202=!olive}|2::${cd23200=!light grey}${cd23201=!olive green}${cd23202=!olive}|${cd23200=!light blue}${cd23201=!light blue}${cd23202=!grey}|${cd23200=!light pink}${cd23201=!lavender}${cd23202=!grey}|3::${cd23200=!cream}${cd23201=!emerald green}${cd23202=!brown}}casual outfit, {6::${cd23200}|${cd23200} __top pattern__} blouse, ${cd23201} wide-leg pants, ${cd23202} loafers, ${cd23202} leather belt ## legs-covered, pants, top", "?!cold:: {4::${cd2df80=!white}${cd2df81=!olive green}${cd2df82=!black}|3::${cd2df80=!beige}${cd2df81=!olive green}${cd2df82=!black}|3::${cd2df80=!cream}${cd2df81=!olive green}${cd2df82=!black}|3::${cd2df80=!light grey}${cd2df81=!olive green}${cd2df82=!black}|2::${cd2df80=!light blue}${cd2df81=!lavender}${cd2df82=!black}|3::${cd2df80=!white}${cd2df81=!olive green}${cd2df82=!burgundy}|2::${cd2df80=!beige}${cd2df81=!burgundy}${cd2df82=!black}|2::${cd2df80=!cream}${cd2df81=!mint green}${cd2df82=!black}|2::${cd2df80=!light grey}${cd2df81=!burgundy}${cd2df82=!black}|2::${cd2df80=!light blue}${cd2df81=!mint green}${cd2df82=!black}|3::${cd2df80=!white}${cd2df81=!burgundy}${cd2df82=!black}|2::${cd2df80=!beige}${cd2df81=!olive green}${cd2df82=!dark brown}|2::${cd2df80=!cream}${cd2df81=!olive green}${cd2df82=!dark green}|2::${cd2df80=!light grey}${cd2df81=!mint green}${cd2df82=!black}|3::${cd2df80=!white}${cd2df81=!lavender}${cd2df82=!black}|2::${cd2df80=!beige}${cd2df81=!emerald green}${cd2df82=!black}}casual outfit, ${cd2df80} oversized t-shirt, ${cd2df81} cargo shorts, ${cd2df82} sneakers ## top, shorts, crotch-covered, upper-legs-covered", "{3::${cee2e60=!black}${cee2e61=!grey}|2::${cee2e60=!dark green}${cee2e61=!grey}|2::${cee2e60=!dark brown}${cee2e61=!grey}|2::${cee2e60=!dark grey}${cee2e61=!grey}|2::${cee2e60=!navy blue}${cee2e61=!grey}|2::${cee2e60=!black}${cee2e61=!tan}|${cee2e60=!dark green}${cee2e61=!tan}|${cee2e60=!dark brown}${cee2e61=!khaki}|${cee2e60=!dark grey}${cee2e61=!khaki}|${cee2e60=!navy blue}${cee2e61=!camel}|2::${cee2e60=!black}${cee2e61=!brown}|${cee2e60=!dark green}${cee2e61=!brown}|${cee2e60=!dark brown}${cee2e61=!brown}|${cee2e60=!dark grey}${cee2e61=!tan}|${cee2e60=!navy blue}${cee2e61=!khaki}|2::${cee2e60=!black}${cee2e61=!camel}}casual outfit, ${cee2e60} cropped hoodie, ${cee2e61} cargo pants, ${cee2e60} high-top sneakers, silver chain necklace ## legs-covered, pants, top", "{5::${cf62a90=!orange}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!brown}|4::${cf62a90=!teal}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!brown}|4::${cf62a90=!burgundy}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!brown}|4::${cf62a90=!blue}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!brown}|4::${cf62a90=!orange}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!khaki}|3::${cf62a90=!teal}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!camel}|3::${cf62a90=!burgundy}${cf62a91=!dark blue}${cf62a92=!navy blue}${cf62a93=!brown}|3::${cf62a90=!blue}${cf62a91=!dark blue}${cf62a92=!dark grey}${cf62a93=!brown}|4::${cf62a90=!orange}${cf62a91=!dark grey}${cf62a92=!black}${cf62a93=!brown}|3::${cf62a90=!teal}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!khaki}|3::${cf62a90=!burgundy}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!tan}|3::${cf62a90=!blue}${cf62a91=!dark blue}${cf62a92=!black}${cf62a93=!camel}|4::${cf62a90=!orange}${cf62a91=!black}${cf62a92=!black}${cf62a93=!brown}|3::${cf62a90=!teal}${cf62a91=!dark blue}${cf62a92=!dark grey}${cf62a93=!brown}|3::${cf62a90=!burgundy}${cf62a91=!dark blue}${cf62a92=!dark green}${cf62a93=!brown}|3::${cf62a90=!blue}${cf62a91=!burgundy}${cf62a92=!black}${cf62a93=!brown}}casual outfit, {6::${cf62a90}|${cf62a90} __top pattern__} sweater, ${cf62a91} denim skirt, ${cf62a92} tights, ${cf62a93} ankle boots ## legs-covered, skirt, top", "{4::${cfa18f0=!white}${cfa18f1=!burgundy}${cfa18f2=!black}|3::${cfa18f0=!cream}${cfa18f1=!burgundy}${cfa18f2=!black}|3::${cfa18f0=!light grey}${cfa18f1=!burgundy}${cfa18f2=!black}|3::${cfa18f0=!beige}${cfa18f1=!burgundy}${cfa18f2=!black}|2::${cfa18f0=!light blue}${cfa18f1=!sky blue}${cfa18f2=!black}|3::${cfa18f0=!white}${cfa18f1=!burgundy}${cfa18f2=!dark grey}|2::${cfa18f0=!cream}${cfa18f1=!burgundy}${cfa18f2=!dark brown}|2::${cfa18f0=!light grey}${cfa18f1=!burgundy}${cfa18f2=!burgundy}|2::${cfa18f0=!beige}${cfa18f1=!sky blue}${cfa18f2=!black}|2::${cfa18f0=!light blue}${cfa18f1=!light blue}${cfa18f2=!black}|3::${cfa18f0=!white}${cfa18f1=!burgundy}${cfa18f2=!dark brown}|2::${cfa18f0=!cream}${cfa18f1=!burgundy}${cfa18f2=!dark grey}|2::${cfa18f0=!light grey}${cfa18f1=!burgundy}${cfa18f2=!dark grey}|2::${cfa18f0=!beige}${cfa18f1=!mustard yellow}${cfa18f2=!black}|2::${cfa18f0=!light blue}${cfa18f1=!blue}${cfa18f2=!black}|3::${cfa18f0=!white}${cfa18f1=!mustard yellow}${cfa18f2=!black}}casual outfit, {6::${cfa18f0}|${cfa18f0} __top pattern__} sweater, ${cfa18f1} pleated skirt, ${cfa18f2} tights, ${cfa18f2} loafers ## legs-covered, skirt, top", "casual outfit, open hoodie, white camisole, blue jeans, white sneakers ## legs-covered, pants, top", "?!cold:: casual outfit, open jacket, denim jacket, black crop top, pleated miniskirt, ankle boots ## skirt, top"]}, {"name": "casual tops", "lines": ["__hoodies__", "__off-shoulder and asymmetrical tops__", "__sweatshirts__", "?!cold:: __tank tops__", "__t-shirts__"]}, {"name": "color", "lines": ["amber", "apricot", "aqua", "baby blue", "beige", "black", "blue", "bronze", "brown", "burgundy", "camel", "charcoal grey", "chartreuse", "chocolate brown", "coffee brown", "copper", "coral", "cream", "crimson", "cyan", "dark grey", "emerald green", "forest green", "fuchsia", "gold", "golden yellow", "green", "grey", "hot pink", "indigo", "ivory", "lavender", "lemon yellow", "light grey", "lilac", "lime green", "magenta", "maroon", "mauve", "mint green", "mustard yellow", "navy blue", "off-white", "olive green", "orange", "peach", "pink", "purple", "red", "rose", "rose pink", "royal blue", "sage green", "salmon", "scarlet", "seafoam green", "silver", "sky blue", "tan", "teal", "turquoise", "violet", "white", "wine red", "yellow"]}, {"name": "commercial indoor locations", "lines": ["bakery ## place, place-indoor", "bar ## place, place-indoor", "bookstore ## place, place-indoor", "boutique ## place, place-indoor", "burlesque theater ## place, place-indoor", "cabaret club ## place, place-indoor", "cafe ## place, place-indoor", "casino ## place, place-indoor", "casino floor ## place, place-indoor", "clothing store ## place, place-indoor", "cocktail bar ## place, place-indoor", "cocktail lounge ## place, place-indoor", "coffee shop ## place, place-indoor", "convenience store ## place, place-indoor", "department store ## place, place-indoor", "department store counter ## place, place-indoor", "fast food restaurant ## place, place-indoor", "fast food restaurant counter ## place, place-indoor", "game arcade ## place, place-indoor", "hostess club ## place, place-indoor", "hostess lounge ## place, place-indoor", "hotel bar ## place, place-indoor", "hotel lobby ## place, place-indoor", "hotel reception desk ## place, place-indoor", "hotel room ## place, place-indoor", "jazz club ## place, place-indoor", "maid cafe ## place, place-indoor", "mall ## place, place-indoor", "movie theater ## place, place-indoor", "nightclub ## place, place-indoor", "post office ## place, place-indoor", "pub ## place, place-indoor", "reception area ## place, place-indoor", "restaurant ## place, place-indoor", "restaurant kitchen ## place, place-indoor, place-kitchen", "salon ## place, place-indoor", "studio ## place, place-indoor", "supermarket ## place, place-indoor", "VIP lounge ## place, place-indoor"]}, {"name": "composition", "lines": ["__camera angles__, __viewpoints__, __shot types__"]}, {"name": "confused expressions", "lines": ["?!covered face:: confused ## blush", "?!covered face:: confusion ## blush", "?!covered face:: curious ## blush", "?!eyes-hidden & !covered face:: furrowed brow ## blush", "?!eyes-hidden & !covered face & !eyes-closed & !gaze & !eye-state:: looking up ## blush, eye-state, gaze", "?!covered face:: perplexed ## blush", "?!covered face:: questioning ## blush", "?!eyes-hidden & !covered face:: raised eyebrow ## blush", "?!eyes-hidden & !covered face & !gaze & !eye-state:: sideways glance ## blush, eye-state, gaze", "?!covered face:: skeptical ## blush", "?!covered face:: thinking ## blush", "?!covered face:: uncertain ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "corsets and lingerie tops", "lines": ["bustier, strapless ## top", "camisole, spaghetti strap ## top", "corset top, lace trim ## top", "lace top, sheer fabric ## top"]}, {"name": "costume and uniform headwear", "lines": ["#! school excludes nsfw", "__color__ bonnet", "cat ears", "__color__ hood", "__color__ maid headdress", "__color__ military hat", "__color__ nurse cap", "__color__ police hat", "__color__ sailor hat ## school", "rabbit ears", "__color__ witch hat", "__color__ wizard hat"]}, {"name": "crop tops and short tops", "lines": ["?!cold:: crop top, short sleeves, midriff ## top", "halter top, bare shoulders ## top", "?!cold:: tube top, strapless ## top", "wrap top, v-neck ## top"]}, {"name": "cropped leggings", "lines": ["__color__ capri pants, leggings ## crotch-covered, upper-legs-covered"]}, {"name": "crying expressions", "lines": ["?!mouth-hidden & !covered face:: bawling ## blush", "?!eyes-hidden & !covered face:: crying ## blush", "?!eyes-hidden & !covered face & !eye-state:: crying with eyes closed ## blush, eye-state, eyes-closed", "?!eyes-hidden & !covered face:: crying with eyes open ## blush", "?!mouth-hidden & !covered face:: quivering lips ## blush", "?!eyes-hidden & !covered face:: sad, crying ## blush", "?!mouth-hidden & !covered face:: sobbing ## blush", "?!eyes-hidden & !covered face:: streaming tears ## blush", "?!eyes-hidden & !covered face:: tears ## blush", "?!eyes-hidden & !covered face:: weeping ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "curly hairstyles", "lines": ["curly bob", "curly hair", "curly hair, blunt bangs", "curly hair, hair bow", "curly hair, hair ribbon", "curly hair, hairband", "curly hair, hairclip", "curly hair, half updo", "curly hair, headband", "curly hair, sidelocks", "curly hair, swept bangs", "curly ponytail", "curly twintails", "fluffy hair", "long curly hair", "loose curls", "medium curly hair", "ringlets", "short curly hair", "tight curls", "very long curly hair", "voluminous curly hair"]}, {"name": "decorative and specialty panties", "lines": ["__color__ bloomers ## panties", "__color__ frilly panties ## panties", "__color__ lace panties ## panties", "__color__ ribbon-trimmed panties ## panties", "__color__ satin panties ## panties", "__color__ translucent panties ## panties", "__color__ multi-strapped panties ## panties"]}, {"name": "dresses", "lines": ["__casual dresses__", "__fitted dresses__", "__flowing dresses__", "__formal and statement dresses__", "__traditional dresses__"]}, {"name": "ecstatic expressions", "lines": ["?!mouth-hidden & !covered face & !mouth-state:: big grin ## blush, mouth-state", "?!covered face:: excited ## blush", "?!covered face:: joyful ## blush", "?!mouth-hidden & !covered face & !mouth-state:: laughing ## blush, mouth-state", "?!eyes-hidden & !mouth-hidden & !covered face & !gaze & !eye-state & !mouth-state:: laughing, closed eyes ## blush, eye-state, eyes-closed, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: laughing, open mouth ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: wide smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: grin ## blush, mouth-state", "?!mouth-hidden & !covered face:: beaming ## blush", "?!covered face:: ecstatic ## blush", "?!covered face:: overjoyed ## blush", "?!covered face:: exhilarated ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "embarrassed expressions", "lines": ["?!mouth-hidden & !covered face & !mouth-state:: awkward smile ## blush, mouth-state", "?!covered face:: bashful ## blush", "?!covered face:: blush ## blush", "?!eyes-hidden & !covered face & !gaze & !eye-state:: blush, closed eyes ## blush, eye-state, eyes-closed", "?!eyes-hidden & !covered face & !gaze & !eye-state:: blush, looking away ## blush, eye-state, gaze", "?!covered face:: embarrassed ## blush", "?!eyes-hidden & !covered face & !gaze & !eye-state:: embarrassed, looking away ## blush, eye-state, gaze", "?!covered face:: flustered ## blush", "?!mouth-hidden & !covered face & !mouth-state:: nervous smile ## blush, mouth-state", "?!covered face:: shy ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "embarrassed shy expressions", "lines": ["?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: embarrassed, heavy blush, looking away, parted lips ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: embarrassed, red cheeks, looking away, closed mouth ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: embarrassed, heavy blush, downcast eyes, biting own lip ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: embarrassed, full-face blush, looking down, slightly open mouth ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: embarrassed, nose blush, sideways glance, nervous smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: embarrassed, red cheeks, closed eyes, nervous smile ## blush, eye-state, eyes-closed, mouth-state", "?!covered face & !mouth-hidden & !mouth-state:: embarrassed, blush, furrowed brow, closed mouth ## blush, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: embarrassed, nose blush, half-closed eyes, parted lips ## blush, eye-state, mouth-state", "?!covered face & !mouth-hidden & !mouth-state:: embarrassed, heavy blush, parted lips ## blush, mouth-state", "?!covered face & !eyes-hidden & !gaze & !eye-state:: embarrassed, heavy blush, looking away, half-closed eyes ## blush, eye-state, gaze"]}, {"name": "everyday japanese scenes", "lines": ["apartment building entrance ## place, place-indoor", "covered shopping street ## place, place-outdoor", "Japanese apartment interior ## place, place-indoor", "Japanese convenience store interior ## place, place-indoor", "Japanese residential neighbourhood ## place, place-outdoor", "Japanese shopping arcade ## place, place-indoor", "local community centre ## place, place-indoor", "public library reading area ## place, place-indoor", "quiet neighbourhood street at dusk ## place, place-outdoor", "riverside cycling path ## place, place-outdoor", "train station concourse ## place, place-indoor", "train station ticket gates ## place, place-indoor"]}, {"name": "expressions", "lines": ["__affectionate expressions__", "0.15::__angry expressions__ ## negative", "__confused expressions__", "0.15::__crying expressions__ ## negative", "__ecstatic expressions__", "__embarrassed expressions__", "0.15::__fearful expressions__ ## negative", "__happy expressions__", "__neutral expressions__ ## flat", "0.15::__painful expressions__ ## negative", "__playful expressions__", "0.15::__sad expressions__ ## negative", "__serious expressions__ ## flat", "__shy expressions__", "__smug expressions__", "__surprised expressions__", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "eye color", "lines": ["amber eyes", "aqua eyes", "black eyes", "blue eyes", "brown eyes", "chestnut eyes", "chocolate eyes", "coral eyes", "crimson eyes", "cyan eyes", "dark blue eyes", "dark brown eyes", "dark green eyes", "dark grey eyes", "emerald green eyes", "golden eyes", "green eyes", "grey eyes", "hazel eyes", "heterochromia", "honey eyes", "jade eyes", "lavender eyes", "light blue eyes", "light brown eyes", "light grey eyes", "lilac eyes", "lime green eyes", "magenta eyes", "mint green eyes", "navy blue eyes", "olive green eyes", "orange eyes", "peach eyes", "pink eyes", "purple eyes", "red eyes", "rose eyes", "ruby eyes", "scarlet eyes", "silver eyes", "sky blue eyes", "steel blue eyes", "teal eyes", "turquoise eyes", "violet eyes", "wine red eyes", "yellow eyes"]}, {"name": "eyewear", "lines": ["__glasses__", "__other eyewear__", "__sunglasses__", "10::{|}"]}, {"name": "fantasy architecture", "lines": ["ancient fantasy architecture", "castle architecture", "dwarven architecture", "elven architecture", "fairy tale architecture", "fantasy architecture", "gothic fantasy architecture", "magical architecture", "medieval fantasy architecture", "ornate fantasy architecture"]}, {"name": "fantasy indoors", "lines": ["alchemy laboratory ## place, place-indoor", "ancient tomb ## place, place-indoor", "castle interior ## place, place-indoor", "crystal cavern ## place, place-indoor", "crystal chamber ## place, place-indoor", "dungeon ## place, place-indoor", "enchanted room ## place, place-indoor", "fantasy shop ## place, place-indoor", "futuristic research laboratory ## place, place-indoor", "magic library ## place, place-indoor", "magical academy courtyard ## place, place-indoor", "medieval inn ## place, place-indoor", "palace hall ## place, place-indoor", "potion shop ## place, place-indoor", "royal bedroom ## place, place-bed, place-indoor", "space colony greenhouse ## place, place-indoor", "spaceship observation deck ## place, place-indoor", "tavern ## place, place-indoor", "temple chamber ## place, place-indoor", "throne room ## place, place-indoor", "underground chamber ## place, place-indoor", "wizard's study ## place, place-indoor"]}, {"name": "fantasy outdoors", "lines": ["ancient elven ruins ## place, place-outdoor", "ancient ruins ## place, place-outdoor", "castle courtyard, __historical architecture__ ## place, place-outdoor", "castle grounds, __historical architecture__ ## place, place-outdoor", "crystal forest ## place, place-outdoor", "desert oasis ## place, place-outdoor", "dragon nest in a mountain cavern ## place, place-outdoor", "dragon's lair ## place, place-outdoor", "enchanted forest ## place, place-outdoor", "enchanted waterfall ## place, place-outdoor, place-water", "fairy grove ## place, place-outdoor", "fairy tale landscape ## place, place-outdoor", "fantasy city, __fantasy architecture__ ## place, place-outdoor", "fantasy forest ## place, place-outdoor", "fantasy village, __fantasy architecture__ ## place, place-outdoor", "floating castle above the clouds ## place, place-outdoor", "floating island ## place, place-outdoor", "magical garden ## place, place-outdoor", "magical lake ## place, place-outdoor", "medieval street, __historical architecture__ ## place, place-outdoor", "medieval town, __historical architecture__ ## place, place-outdoor", "mystical meadow ## place, place-outdoor", "underground fantasy city ## place, place-outdoor"]}, {"name": "fearful expressions", "lines": ["?!covered face:: apprehensive ## blush", "?!covered face:: fearful ## blush", "?!covered face:: nervous ## blush", "?!mouth-hidden & !covered face & !mouth-state:: nervous smile ## blush, mouth-state", "?!covered face:: scared ## blush", "?!covered face:: trembling ## blush", "?!eyes-hidden & !covered face & !eye-state:: wide-eyed, scared ## blush, eye-state", "?!covered face:: worried ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "fitted dresses", "lines": ["bodycon dress, tight dress ## dress, crotch-covered", "?!cold:: cutout dress, midriff ## dress, crotch-covered", "?!cold:: halter dress, sleeveless ## dress, crotch-covered", "pencil dress, tight dress ## dress, crotch-covered", "strapless dress, cleavage ## dress, crotch-covered"]}, {"name": "fitted skirts", "lines": ["leather skirt, tight skirt ## skirt, crotch-covered, upper-legs-covered", "pencil skirt, tight skirt ## skirt, crotch-covered, upper-legs-covered", "skirt suit, pencil skirt ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "flared and layered skirts", "lines": ["bubble skirt ## skirt, crotch-covered, upper-legs-covered", "circle skirt, flared skirt ## skirt, crotch-covered, upper-legs-covered", "gothic lolita, layered skirt ## skirt, crotch-covered, upper-legs-covered", "ruffled skirt, frills ## skirt, crotch-covered, upper-legs-covered", "tutu, layered skirt ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "flats and casual shoes", "lines": ["ballet flats, flat shoes", "canvas shoes, low top ## top", "clogs, wooden shoes", "loafers, leather shoes", "loose shoes, slip on shoes", "mary janes, strap shoes", "sneakers, low top ## top"]}, {"name": "flowing dresses", "lines": ["a-line dress, knee length ## dress, crotch-covered", "empire waist, flowing dress ## dress, crotch-covered", "fit and flare dress, flared skirt ## dress, skirt, crotch-covered", "frilled dress, frills ## dress, crotch-covered", "pleated dress, short dress ## dress, crotch-covered", "tiered dress, long dress ## dress, crotch-covered", "wrap dress, tied waist ## dress, crotch-covered"]}, {"name": "flustered shy expressions", "lines": ["?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: flustered, full-face blush, wide-eyed, slightly open mouth ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: flustered, blushing profusely, wide-eyed, parted lips ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: flustered, red face, wide-eyed, open mouth ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: flustered, heavy blush, half-closed eyes, parted lips ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: flustered, heavy blush, narrowed eyes, biting own lip ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !eye-state:: flustered, full-face blush, wide-eyed ## blush, eye-state"]}, {"name": "footwear", "lines": ["__boots__", "__flats and casual shoes__", "__heels__", "?!cold:: __sandals__", "__sports footwear__", "?!cold:: __traditional footwear__"]}, {"name": "formal and ceremonial headwear", "lines": ["__color__ beret", "__color__ bowler hat", "__color__ crown", "__color__ fascinator", "__color__ tiara", "__color__ top hat"]}, {"name": "formal and statement dresses", "lines": ["backless dress, backless outfit ## dress, crotch-covered", "evening gown, floor length ## dress, crotch-covered", "gothic lolita, frills, puffy sleeves ## dress, crotch-covered", "lace dress, lace trim ## dress, crotch-covered", "maid, apron, frills ## dress, crotch-covered", "off shoulder dress, bare shoulders ## dress, crotch-covered", "one shoulder dress, asymmetrical ## dress, crotch-covered"]}, {"name": "full-length leggings", "lines": ["__color__ leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ striped leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ pattern leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ print leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ stirrup leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ torn leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ latex leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ detached leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ high waisted bottomwear, leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ camo, leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ ribbed, leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ translucent, leggings ## legs-covered, crotch-covered, upper-legs-covered"]}, {"name": "futuristic architecture", "lines": ["alien architecture", "cyberpunk architecture", "floating architecture", "futuristic architecture", "neon-lit architecture", "sci-fi architecture", "sleek futuristic architecture", "space-age architecture", "utopian architecture"]}, {"name": "glasses", "lines": ["black-framed eyewear", "cat-eye glasses", "glasses", "oval glasses", "reading glasses", "rectangular glasses", "red-framed eyewear", "rimless eyewear", "round glasses", "safety glasses", "semi-rimless eyewear", "thick-framed glasses", "thin-framed glasses", "white-framed eyewear"]}, {"name": "hair buns and updos", "lines": ["braided bun", "chignon", "double bun", "double bun, hair bows", "double bun, hair ribbon", "double bun, scrunchies", "french twist", "hair bun", "hair bun, hairband", "high bun", "high bun, hair bow", "high bun, hair ribbon", "low bun", "low bun, hair ornament", "low bun, hair sticks", "messy bun", "messy bun, scrunchie", "messy updo", "neat updo", "single bun", "single side bun", "topknot", "updo, flower in hair", "updo, hair ornament"]}, {"name": "hair color", "lines": ["aqua hair", "ash blonde hair", "ash grey hair", "auburn hair", "black hair", "blonde hair", "blue hair", "brown hair", "burgundy hair", "charcoal grey hair", "chestnut hair", "chocolate brown hair", "copper hair", "coral hair", "crimson hair", "cyan hair", "dark blonde hair", "dark brown hair", "dark grey hair", "dirty blonde hair", "emerald green hair", "forest green hair", "ginger hair", "golden blonde hair", "gradient hair", "green hair", "grey hair", "honey blonde hair", "hot pink hair", "indigo hair", "lavender hair", "light blonde hair", "light blue hair", "light brown hair", "light grey hair", "lilac hair", "lime green hair", "magenta hair", "mahogany hair", "mint green hair", "multicolored hair", "navy blue hair", "olive green hair", "orange hair", "pastel blue hair", "pastel green hair", "pastel pink hair", "pastel purple hair", "pastel rainbow hair", "pink hair", "platinum blonde hair", "platinum hair", "purple hair", "rainbow hair", "red hair", "rose pink hair", "sage green hair", "scarlet hair", "silver hair", "sky blue hair", "strawberry blonde hair", "streaked hair", "teal hair", "turquoise hair", "two-tone hair", "violet hair", "white hair", "wine red hair"]}, {"name": "hairstyles", "lines": ["__alternative hairstyles__", "__bangs__", "__braided hairstyles__", "__curly hairstyles__", "__hair buns and updos__", "__long hair__", "__medium hair__", "__ponytails__", "__short hair__", "__straight hairstyles__", "__twintails__", "__wavy hairstyles__"]}, {"name": "happy expressions", "lines": ["?!mouth-hidden & !covered face & !mouth-state:: gentle smile ## blush, mouth-state", "?!covered face:: happy ## blush", "?!covered face:: cheerful ## blush", "?!mouth-hidden & !covered face & !mouth-state:: light smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: smile, open mouth ## blush, mouth-state", "?!eyes-hidden & !mouth-hidden & !covered face & !gaze & !eye-state & !mouth-state:: smile, closed eyes ## blush, eye-state, eyes-closed, mouth-state", "?!mouth-hidden & !covered face:: giggling ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "hats", "lines": ["__casual hats and caps__", "__brimmed hats__", "__formal and ceremonial headwear__", "__costume and uniform headwear__"]}, {"name": "heels", "lines": ["high heels, pointed toe", "kitten heels, low heels", "platform heels, high heels", "pumps, closed toe heels", "stilettos, high heels", "wedge heels, wedge shoes"]}, {"name": "historical architecture", "lines": ["Art Deco architecture", "Art Nouveau architecture", "Baroque architecture", "classical Greek architecture", "classical Roman architecture", "Edwardian architecture", "Georgian architecture", "Gothic architecture", "medieval architecture", "Neoclassical architecture", "Renaissance architecture", "Rococo architecture", "Romanesque architecture", "Victorian architecture"]}, {"name": "hoodies", "lines": ["__color__ hoodie, pullover hoodie ## top", "__color__ zip up hoodie, front zipper ## top, zip-front", "__color__ cropped hoodie, cropped top ## top", "__color__ oversized hoodie, oversized clothes ## top", "__color__ sleeveless hoodie, sleeveless ## top", "__color__ fitted hoodie, tight fit ## top", "__color__ graphic hoodie, printed design ## top", "__color__ hooded sweatshirt, long sleeves ## top", "__color__ cropped zip up hoodie, cropped top, front zipper ## top, zip-front"]}, {"name": "house indoor locations", "lines": ["attic ## place, place-indoor", "basement ## place, place-indoor", "bathroom ## place, place-bath, place-indoor", "bedroom ## place, place-bed, place-indoor", "dining room ## place, place-indoor", "entrance hall ## place, place-indoor", "hallway ## place, place-indoor", "home office ## place, place-indoor", "indoor garden ## place, place-indoor", "kitchen ## place, place-indoor, place-kitchen", "laundry room ## place, place-indoor", "living room ## place, place-indoor", "mansion interior ## place, place-indoor", "stairs ## place, place-indoor", "sunroom ## place, place-indoor", "tatami room ## place, place-indoor", "tea room ## place, place-indoor", "walk-in closet ## place, place-indoor"]}, {"name": "indoors", "lines": ["__commercial indoor locations__", "__fantasy indoors__", "__house indoor locations__", "__other indoor locations__", "__public indoor locations__", "__transport locations__"]}, {"name": "japanese seasonal scenes", "lines": ["## place", "?!spring & !summer & !winter:: japanese fall scenes ## autumn", "?!summer & !autumn & !winter:: japanese spring scenes ## spring", "?!spring & !autumn & !winter:: japanese summer scenes ## summer", "?!spring & !summer & !autumn:: japanese winter scenes ## cold, winter"]}, {"name": "jewelry", "lines": ["anklet, ankle jewelry", "beaded necklace, beads", "belly chain, waist jewelry", "body chain, body jewelry", "brooch, decorative pin", "chain necklace, chain jewelry", "chandelier earrings, dangling jewelry", "choker, neck jewelry", "cross necklace, cross pendant", "drop earrings, dangling jewelry", "ear cuffs, ear jewelry", "flower brooch, flower jewelry", "gem earrings, gemstone jewelry", "gemstone necklace, gemstone jewelry", "heart necklace, heart pendant", "hoop earrings, round earrings", "lapel pin, pin", "layered necklace, multiple necklaces", "lip piercing, facial jewelry", "locket, pendant necklace", "mismatched earrings, earrings", "multiple earrings, ear piercing", "navel piercing, belly button ring", "nose ring, nose piercing", "pearl earrings, pearl jewelry", "pearl necklace, pearl jewelry", "pendant necklace, pendant", "statement necklace, large jewelry", "stud earrings, simple earrings", "toe ring, foot jewelry"]}, {"name": "knee-length shorts", "lines": ["bermuda shorts, knee length ## crotch-covered, upper-legs-covered, shorts", "cargo shorts, multiple pockets ## crotch-covered, upper-legs-covered, shorts", "culotte shorts, flared shorts ## crotch-covered, upper-legs-covered, shorts"]}, {"name": "leggings", "lines": ["__full-length leggings__", "__cropped leggings__", "__specialty leggings__"]}, {"name": "lighting", "lines": ["__artificial lighting__", "__atmospheric lighting__", "__natural lighting__"]}, {"name": "long hair", "lines": ["hip-length hair", "layered long hair", "long asymmetrical hair", "long hair", "long hair, blunt bangs", "long hair, flower in hair", "long hair, hair between eyes", "long hair, hair bow", "long hair, hair ornament", "long hair, hair over one eye", "long hair, hair ribbon", "long hair, hair tucked behind ears", "long hair, hairband", "long hair, hairclip", "long hair, headband", "long hair, parted bangs", "long hair, swept bangs", "long layered hair", "long shaggy hair", "thigh-length hair", "very long hair", "waist-length hair"]}, {"name": "long shorts", "lines": ["long shorts, below-knee length ## crotch-covered, upper-legs-covered, shorts", "three-quarter-length shorts ## crotch-covered, upper-legs-covered, shorts"]}, {"name": "long skirts", "lines": ["long skirt, high slit ## skirt, crotch-covered, upper-legs-covered", "maxi skirt, floor length ## skirt, crotch-covered, upper-legs-covered", "sarong, wrap skirt ## skirt, crotch-covered, upper-legs-covered", "side slit skirt, long skirt ## skirt, crotch-covered, upper-legs-covered", "tiered skirt, layered skirt ## skirt, crotch-covered, upper-legs-covered", "wrap skirt, tied waist ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "looks", "lines": ["__makeup__, __hairstyles__"]}, {"name": "loose fit pants", "lines": ["## pants", "baggy jeans, oversized clothes ## legs-covered, crotch-covered, pants", "culottes, wide leg ## crotch-covered, upper-legs-covered, pants", "hakama, pleated pants ## legs-covered, pants, crotch-covered", "harem pants, baggy ## legs-covered, pants, crotch-covered", "jogger pants, elastic waistband ## legs-covered, pants, crotch-covered", "palazzo pants, wide leg ## legs-covered, pants, crotch-covered", "parachute pants, baggy ## legs-covered, pants, crotch-covered", "sweatpants, oversized clothes ## legs-covered, crotch-covered, pants", "wide leg jeans, high waisted ## legs-covered, crotch-covered, pants", "wide leg pants, long pants ## legs-covered, pants, crotch-covered"]}, {"name": "low-rise and cheeky panties", "lines": ["__color__ bikini bottom only, panties ## panties", "__color__ cheeky panties ## panties", "__color__ highleg panties ## panties", "__color__ low-leg panties ## panties", "__color__ panties ## panties"]}, {"name": "makeup", "lines": ["black makeup, dark red lipstick, black eyeshadow, black eyeliner, dark red blush, black nail polish", "blue makeup, pink lipstick, blue eyeshadow, blue eyeliner, pink blush, blue nail polish", "brown makeup, brown lipstick, bronze eyeshadow, peach blush, brown nail polish", "burgundy makeup, burgundy lipstick, burgundy eyeshadow, rose blush, burgundy nail polish", "coral makeup, coral lipstick, coral eyeshadow, coral blush, coral nail polish", "doll-like makeup, pink lipstick, pink eyeshadow, long eyelashes, pink blush, pink nail polish", "glamorous makeup, red lipstick, gold eyeshadow, winged eyeliner, rosy blush, red nail polish", "gold makeup, red lipstick, gold eyeshadow, bronze eyeliner, peach blush, gold nail polish", "gothic makeup, black lipstick, dark purple eyeshadow, black eyeliner, dark purple blush, black nail polish", "green makeup, pink lipstick, green eyeshadow, pink blush, green nail polish", "lavender makeup, lavender lipstick, lavender eyeshadow, lavender blush, lavender nail polish", "mint makeup, pink lipstick, mint eyeshadow, pink blush, mint nail polish", "natural makeup, coral lipstick, peach eyeshadow, brown eyeliner, coral blush, coral nail polish", "natural makeup, mauve lipstick, taupe eyeshadow, mauve blush, mauve nail polish", "natural makeup, pink lipstick, light pink eyeshadow, brown eyeliner, peach blush, pink nail polish", "natural makeup, rose lipstick, rose eyeshadow, pink blush, rose nail polish", "navy makeup, red lipstick, navy blue eyeshadow, rose blush, navy blue nail polish", "orange makeup, orange lipstick, orange eyeshadow, peach blush, orange nail polish", "peach makeup, peach lipstick, peach eyeshadow, peach blush, peach nail polish", "pink makeup, pink lipstick, pink eyeshadow, pink eyeliner, pink blush, pink nail polish", "punk makeup, dark red lipstick, black eyeshadow, heavy eyeliner, red blush, black nail polish", "purple makeup, purple lipstick, lavender eyeshadow, pink blush, purple nail polish", "red makeup, red lipstick, red eyeshadow, red blush, red nail polish", "rose makeup, rose lipstick, rose eyeshadow, rose blush, rose nail polish", "silver makeup, pink lipstick, silver eyeshadow, black eyeliner, pink blush, silver nail polish", "teal makeup, coral lipstick, teal eyeshadow, peach blush, teal nail polish", "white makeup, pink lipstick, white eyeshadow, pink blush, white nail polish", "yellow makeup, coral lipstick, yellow eyeshadow, peach blush, yellow nail polish"]}, {"name": "medium hair", "lines": ["collarbone-length hair", "half updo", "half updo, hair bow", "half updo, hair ribbon", "half updo, scrunchie", "layered hair", "medium asymmetrical hair", "medium hair", "medium hair, blunt bangs", "medium hair, hair bow", "medium hair, hair ribbon", "medium hair, hairband", "medium hair, hairclip", "medium hair, headband", "medium hair, parted bangs", "medium hair, swept bangs", "medium layered hair", "medium long hair", "medium shaggy hair", "medium-length hair", "shaggy hair", "shoulder-length hair", "wolf cut"]}, {"name": "mid-thigh shorts", "lines": ["bike shorts, skin tight ## crotch-covered, upper-legs-covered, shorts", "boxers \\(clothing\\), oversized clothes ## crotch-covered, upper-legs-covered, shorts", "?!cold:: denim shorts, frayed hem ## crotch-covered, upper-legs-covered, shorts", "gym shorts, athletic wear ## crotch-covered, upper-legs-covered, shorts", "gym shorts, oversized clothes ## crotch-covered, upper-legs-covered, shorts", "gym shorts, side stripes ## crotch-covered, upper-legs-covered, shorts", "high waisted shorts, denim ## crotch-covered, upper-legs-covered, shorts", "lace shorts, lace trim ## crotch-covered, upper-legs-covered, shorts", "leather shorts, tight fit ## crotch-covered, upper-legs-covered, shorts", "low rise shorts, denim ## crotch-covered, upper-legs-covered, shorts", "overall shorts, denim overalls ## crotch-covered, upper-legs-covered, shorts", "pleated shorts, high waisted ## crotch-covered, upper-legs-covered, shorts", "puffy shorts, elastic waistband ## crotch-covered, upper-legs-covered, shorts", "spandex shorts, athletic wear ## crotch-covered, upper-legs-covered, shorts", "suspender shorts, high waisted ## crotch-covered, upper-legs-covered, shorts", "sweat shorts, oversized clothes ## crotch-covered, upper-legs-covered, shorts", "tailored shorts, dress shorts ## dress, crotch-covered, upper-legs-covered, shorts", "tennis shorts, pleated shorts ## crotch-covered, upper-legs-covered, shorts", "yoga shorts, tight fit ## crotch-covered, upper-legs-covered, shorts"]}, {"name": "midi skirts", "lines": ["#! school excludes nsfw", "a-line skirt, high waisted ## skirt, crotch-covered, upper-legs-covered", "asymmetrical skirt, uneven hem ## skirt, crotch-covered, upper-legs-covered", "high waisted skirt, belt ## skirt, crotch-covered, upper-legs-covered", "midi skirt, knee length ## skirt, crotch-covered, upper-legs-covered", "plaid skirt, pleated skirt ## skirt, crotch-covered, upper-legs-covered", "school uniform, pleated skirt ## school, skirt, crotch-covered, upper-legs-covered", "tennis skirt, pleated skirt ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "mini skirts", "lines": ["denim skirt, miniskirt ## skirt, crotch-covered, upper-legs-covered", "frilled miniskirt, lace trim ## crotch-covered, upper-legs-covered, skirt", "low rise skirt, miniskirt ## skirt, crotch-covered, upper-legs-covered", "microskirt, tight skirt ## skirt, crotch-covered, upper-legs-covered", "miniskirt, flared skirt ## skirt, crotch-covered, upper-legs-covered", "miniskirt, pleated skirt ## skirt, crotch-covered, upper-legs-covered", "pleated miniskirt, high waisted ## crotch-covered, upper-legs-covered, skirt", "suspender skirt, miniskirt ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "modern architecture", "lines": ["brutalist architecture", "contemporary architecture", "glass architecture", "high-tech architecture", "industrial architecture", "mid-century modern architecture", "minimalist architecture", "modern architecture", "organic architecture", "sustainable architecture"]}, {"name": "mountain locations", "lines": ["cliff ## place, place-outdoor", "mountain ## place, place-outdoor", "mountain forest ## place, place-outdoor", "mountain lake ## place, place-outdoor", "mountain path ## place, place-outdoor", "mountain peak ## place, place-outdoor", "mountain village ## place, place-outdoor", "rocky mountain ## place, place-outdoor", "?!spring & !summer & !autumn:: snowy mountain ## cold, place, place-outdoor, place-snow, winter", "valley ## place, place-outdoor"]}, {"name": "natural lighting", "lines": ["?!night:: dappled sunlight ## daylight", "?!night:: light rays ## daylight", "?!daylight:: moonlight ## night", "?!night:: sunlight ## daylight"]}, {"name": "nature outdoors", "lines": ["__mountain locations__", "__open landscape locations__", "__rural locations__", "__water locations__", "__woods locations__"]}, {"name": "neckwear", "lines": ["ascot, neckwear", "bandana, neckerchief", "bell choker, small bell", "bolo tie, decorative clasp", "bowtie, formal wear", "choker, tight necklace", "collar, leather collar", "cravat pin, decorative pin", "cravat, formal neckwear", "detached collar, collared accessory", "fur collar, fluffy trim", "hooded scarf, hood", "infinity scarf, loop scarf", "lace choker, lace trim", "lace neck ribbon, bow", "lanyard, hanging badge", "long scarf, hanging scarf", "neck corsage, flower accessory", "neck scarf, tied scarf", "neck warmer, knitted fabric", "necktie, collared shirt ## button-front, top", "pearl choker, pearl necklace", "ribbon choker, bow", "ribbon collar, bow", "ribbon tie, tied bow", "ruff \\(clothing\\), frills", "silk scarf, neck scarf", "spiked choker, metal spikes", "studded choker, metal studs", "velvet choker, ribbon"]}, {"name": "neutral expressions", "lines": ["?!covered face:: bored ## blush", "?!covered face:: calm ## blush", "?!mouth-hidden & !covered face & !mouth-state:: closed mouth ## blush, mouth-state", "?!covered face:: expressionless ## blush", "?!eyes-hidden & !covered face & !eye-state:: half-closed eyes ## blush, eye-state", "?!mouth-hidden & !covered face & !mouth-state:: light smile ## blush, mouth-state", "?!covered face:: neutral expression ## blush", "?!covered face:: relaxed expression ## blush", "?!covered face:: serene ## blush", "?!covered face:: sleepy ## blush", "?!mouth-hidden & !covered face & !mouth-state:: slight smile ## blush, mouth-state", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "off-shoulder and asymmetrical tops", "lines": ["__color__ off shoulder top, bare shoulders ## top", "__color__ one shoulder top, asymmetrical ## top", "__color__ asymmetrical top, uneven hem ## top", "__color__ cold shoulder top, shoulder cutouts ## top", "?!cold:: __color__ off shoulder crop top, bare shoulders, midriff ## top", "?!cold:: __color__ one shoulder crop top, asymmetrical, midriff ## top", "__color__ off shoulder long sleeve top, bare shoulders, long sleeves ## top", "__color__ draped off shoulder top, bare shoulders ## top"]}, {"name": "open landscape locations", "lines": ["countryside ## place, place-outdoor", "field ## place, place-outdoor", "flower field ## place, place-outdoor", "grassland ## place, place-outdoor", "hillside ## place, place-outdoor", "meadow ## place, place-outdoor", "open field ## place, place-outdoor", "picnic area ## place, place-outdoor", "plain ## place, place-outdoor", "rolling hills ## place, place-outdoor", "?!spring & !autumn & !winter:: sunflower field ## place, place-outdoor, summer", "track and field ## place, place-outdoor", "wheat field ## place, place-outdoor"]}, {"name": "other eyewear", "lines": ["blindfold ## eyes-hidden", "eyepatch", "goggles", "monocle", "night vision goggles", "protective goggles", "safety goggles", "ski goggles", "swimming goggles", "visor"]}, {"name": "other indoor locations", "lines": ["#! school excludes nsfw", "art studio ## place, place-indoor", "automotive workshop ## place, place-indoor", "ballroom ## place, place-indoor", "bedroom streaming setup ## place, place-bed, place-indoor", "billiards hall ## place, place-indoor", "bowling alley ## place, place-indoor", "changing room ## place, place-indoor", "clothing store ## place, place-indoor", "construction equipment yard ## place, place-indoor", "control room ## place, place-indoor", "convenience store ## place, place-indoor", "dance studio ## place, place-indoor", "dressing room ## place, place-indoor", "factory ## place, place-indoor", "gaming room ## place, place-indoor", "gaming streaming studio ## place, place-indoor", "gothic interior ## place, place-indoor", "grand hall ## place, place-indoor", "greenhouse ## place, place-indoor", "home streaming room ## place, place-indoor", "indoor market ## place, place-indoor", "karaoke room ## place, place-indoor", "laboratory ## place, place-indoor", "locker room ## place, place-indoor", "mail sorting office ## place, place-indoor", "movie theater ## place, place-indoor", "old mansion ## place, place-indoor", "photography studio ## place, place-indoor", "postal sorting depot ## place, place-indoor", "private room ## place, place-indoor", "recording studio ## place, place-indoor", "school classroom ## place, place-indoor, school", "server room ## place, place-indoor", "tea room ## place, place-indoor", "underground bunker ## place, place-indoor", "warehouse ## place, place-indoor", "workshop ## place, place-indoor"]}, {"name": "other outdoors", "lines": ["#! school excludes nsfw", "amusement park ## place, place-outdoor", "athletic track ## place, place-outdoor", "building site scaffolding ## place, place-outdoor", "carousel ## place, place-outdoor", "cemetery ## place, place-outdoor", "construction site ## place, place-outdoor", "Ferris wheel ## place, place-outdoor", "festival grounds ## place, place-outdoor", "fire rescue site ## place, place-outdoor", "flower garden ## place, place-outdoor", "graveyard ## place, place-outdoor", "haunted house attraction ## place, place-outdoor", "ice rink ## place, place-ice, place-outdoor", "Japanese garden ## place, place-outdoor", "outdoor pool ## place, place-outdoor", "parking lot ## place, place-outdoor", "playground ## place, place-outdoor", "riding arena ## place, place-outdoor", "riverside promenade ## place, place-outdoor", "roadworks site ## place, place-outdoor", "roller coaster ## place, place-outdoor", "school grounds ## place, place-outdoor, school", "school rooftop ## place, place-outdoor, school", "secluded garden ## place, place-outdoor", "shrine ## place, place-outdoor", "?!spring & !summer & !autumn:: ski resort ## place, place-outdoor, winter, cold", "soccer field ## place, place-outdoor", "soccer stadium ## place, place-outdoor", "sports field ## place, place-outdoor", "stadium ## place, place-outdoor", "stargazing hilltop ## place, place-outdoor", "temple grounds ## place, place-outdoor", "water park ## place, place-outdoor"]}, {"name": "outdoors", "lines": ["__amusement park scenes__", "__fantasy outdoors__", "__japanese seasonal scenes__", "__nature outdoors__", "__other outdoors__", "__town outdoors__", "__weather atmosphere scenes__"]}, {"name": "painful expressions", "lines": ["?!mouth-hidden & !covered face & !mouth-state:: clenched teeth ## blush, mouth-state", "?!eyes-hidden & !covered face:: eyes squeezed shut ## blush", "?!eyes-hidden & !covered face:: furrowed brow ## blush", "?!mouth-hidden & !covered face:: grimace ## blush", "?!mouth-hidden & !covered face & !mouth-state:: open mouth ## blush, mouth-state", "?!covered face:: pained expression ## blush", "?!covered face:: strained expression ## blush", "?!mouth-hidden & !covered face & !mouth-state:: strained smile ## blush, mouth-state", "?!mouth-hidden & !covered face:: wince ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "panties", "lines": ["__briefs and full coverage panties__", "__low-rise and cheeky panties__", "__thongs and string panties__", "__decorative and specialty panties__"]}, {"name": "pants", "lines": ["## pants", "__loose fit pants__", "__regular fit pants__", "__tight pants__"]}, {"name": "playful expressions", "lines": ["?!covered face:: cheeky ## blush", "?!mouth-hidden & !covered face & !mouth-state:: grin ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: laughing ## blush, mouth-state", "?!covered face:: mischievous ## blush", "?!covered face:: playful ## blush", "?!mouth-hidden & !covered face & !mouth-state:: pout ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: puckered lips ## blush, mouth-state", "?!covered face & !mouth-state:: smirk ## blush, mouth-state", "?!mouth-hidden & !covered face:: teasing ## blush", "?!mouth-hidden & !covered face & !mouth-state:: tongue out ## blush, mouth-state", "?!eyes-hidden & !covered face & !eye-state:: wink ## blush, eye-state", "?!eyes-hidden & !mouth-hidden & !covered face & !eye-state & !mouth-state:: wink, smile ## blush, eye-state, mouth-state", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "pleated skirts", "lines": ["knee-length pleated skirt ## skirt, crotch-covered, upper-legs-covered", "long pleated skirt ## skirt, crotch-covered, upper-legs-covered", "pleated skirt ## skirt, crotch-covered, upper-legs-covered", "short pleated skirt ## skirt, crotch-covered, upper-legs-covered"]}, {"name": "ponytails", "lines": ["braided ponytail", "curly ponytail", "high braided ponytail", "high ponytail", "high ponytail, hair bow", "high ponytail, hair ribbon", "high ponytail, hairband", "high ponytail, scrunchie", "long ponytail", "low braided ponytail", "low ponytail", "low ponytail, hair bow", "low ponytail, hair ribbon", "low ponytail, scrunchie", "ponytail", "ponytail, hair ornament", "ponytail, loose strands", "ponytail, sidelocks", "short ponytail", "side ponytail", "side ponytail, hair bow", "side ponytail, hair ribbon", "side ponytail, hairband", "side ponytail, scrunchie", "wavy ponytail"]}, {"name": "pose", "lines": ["head tilt", "?(!posture|kneel) & !stance:: kneeling ## stance", "?!posture|stand|sit:: leaning back", "?!posture|stand|sit:: leaning forward", "?(!posture|lie) & !stance:: lying ## stance", "pinup \\(style\\)", "?!posture|lie|sit:: reclining", "?(!posture|sit) & !stance:: sitting ## stance", "?(!posture|crouch) & !stance:: squatting ## stance", "?(!posture|stand) & !stance:: standing ## stance"]}, {"name": "public indoor locations", "lines": ["#! school excludes nsfw", "aquarium ## place, place-indoor", "art gallery ## place, place-indoor", "ballroom ## place, place-indoor", "church interior ## place, place-indoor", "classroom ## place, place-indoor, school", "classroom interior ## place, place-indoor, school", "clinic ## place, place-indoor", "concert venue ## place, place-indoor", "convention hall ## place, place-indoor", "fire station ## place, place-indoor", "grand hall ## place, place-indoor", "gymnasium ## place, place-indoor", "hospital emergency department ## place, place-indoor", "hospital intensive care unit ## place, place-indoor", "hospital nurses' station ## place, place-indoor", "hospital room ## place, place-indoor", "indoor swimming pool ## place, place-indoor", "lecture hall ## place, place-indoor", "library ## place, place-indoor", "library archive ## place, place-indoor", "library reading room ## place, place-indoor", "meeting room ## place, place-indoor", "museum ## place, place-indoor", "music hall ## place, place-indoor", "office ## place, place-indoor", "opera house ## place, place-indoor", "police interrogation room ## place, place-indoor", "police station ## place, place-indoor", "school hallway ## place, place-indoor, school", "school library ## place, place-indoor, school", "school staff room ## place, place-indoor, school", "shrine interior ## place, place-indoor", "sports hall ## place, place-indoor", "stage ## place, place-indoor", "temple interior ## place, place-indoor", "theater ## place, place-indoor", "university classroom ## place, place-indoor, school", "university lecture hall ## place, place-indoor"]}, {"name": "regional architecture", "lines": ["African vernacular architecture", "Aztec architecture", "English cottage architecture", "French country architecture", "Indian architecture", "Islamic architecture", "Mayan architecture", "Mediterranean architecture", "Moroccan architecture", "Nordic architecture", "Swiss chalet architecture", "Tudor architecture"]}, {"name": "regular fit pants", "lines": ["## pants", "capri pants ## crotch-covered, upper-legs-covered, pants", "cargo pants, multiple pockets ## legs-covered, pants, crotch-covered", "corduroy pants, high waisted ## legs-covered, pants, crotch-covered", "dress pants, tailored fit ## dress, legs-covered, pants, crotch-covered, zip-front", "flared jeans, high waisted ## legs-covered, crotch-covered, pants, zip-front", "flared pants, high waisted ## legs-covered, pants, crotch-covered", "high waisted pants, straight leg ## legs-covered, pants, crotch-covered", "overalls, denim overalls ## legs-covered, crotch-covered, pants", "plaid pants, tailored fit ## legs-covered, pants, crotch-covered", "slacks, straight leg ## legs-covered, crotch-covered, pants, zip-front", "straight leg jeans, denim ## legs-covered, crotch-covered, pants, zip-front", "striped pants, straight leg ## legs-covered, pants, crotch-covered", "suspender pants, high waisted ## legs-covered, pants, crotch-covered", "torn jeans, distressed denim ## legs-covered, crotch-covered, pants, zip-front", "track pants, side stripes ## legs-covered, pants, crotch-covered"]}, {"name": "rural locations", "lines": ["barn exterior ## place, place-outdoor", "campsite ## place, place-outdoor", "country lane ## place, place-outdoor", "farm ## place, place-outdoor", "farmland ## place, place-outdoor", "farmyard ## place, place-outdoor", "orchard ## place, place-outdoor", "rural road ## place, place-outdoor", "stable ## place, place-outdoor", "village ## place, place-outdoor", "vineyard ## place, place-outdoor"]}, {"name": "sad expressions", "lines": ["?!covered face:: dejected ## blush", "?!covered face:: disappointed ## blush", "?!covered face:: downcast expression ## blush", "?!mouth-hidden & !covered face & !mouth-state:: frown ## blush, mouth-state", "?!eyes-hidden & !covered face & !gaze & !eye-state:: looking away ## blush, eye-state, gaze", "?!eyes-hidden & !covered face & !gaze & !eye-state:: looking down ## blush, eye-state, gaze", "?!covered face:: melancholy ## blush", "?!eyes-hidden & !covered face:: puppy eyes ## blush", "?!mouth-hidden & !covered face:: quivering lips ## blush", "?!covered face:: sad ## blush", "?!mouth-hidden & !covered face & !mouth-state:: sad smile ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: slight frown ## blush, mouth-state", "?!eyes-hidden & !covered face:: tears ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "sandals", "lines": ["?!cold:: flip flops, thong sandals", "?!cold:: gladiator sandals, strappy sandals", "?!cold:: sandals, flat sandals", "?!cold:: slides, open toe sandals", "?!cold:: strappy sandals, open toe"]}, {"name": "serious expressions", "lines": ["?!mouth-hidden & !covered face & !mouth-state:: closed mouth ## blush, mouth-state", "?!covered face:: determined ## blush", "?!covered face:: expressionless ## blush", "?!covered face:: focused ## blush", "?!eyes-hidden & !covered face:: furrowed brow ## blush", "?!eyes-hidden & !covered face:: intense gaze ## blush", "?!eyes-hidden & !covered face & !eye-state:: narrowed eyes ## blush, eye-state", "?!covered face:: neutral expression ## blush", "?!covered face:: serious ## blush", "?!covered face:: stern ## blush", "?!covered face:: stoic ## blush", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "short hair", "lines": ["angled bob", "asymmetrical bob", "blunt bob", "bob cut", "chin-length hair", "curly bob", "ear-length hair", "inverted bob", "layered bob", "pixie cut", "short bob", "short hair", "short hair, blunt bangs", "short hair, hair bow", "short hair, hair ornament", "short hair, hair ribbon", "short hair, hairband", "short hair, hairclip", "short hair, headband", "short hair, swept bangs", "short layered hair", "short shaggy hair", "short spiky hair", "wavy bob"]}, {"name": "short shorts", "lines": ["bloomers, frills ## crotch-covered, upper-legs-covered, shorts", "dolphin shorts, curved hem ## crotch-covered, upper-legs-covered, shorts", "?!cold:: frayed denim shorts, short shorts ## crotch-covered, upper-legs-covered, shorts", "?!cold:: micro shorts, tight shorts ## crotch-covered, upper-legs-covered, shorts", "?!cold:: short shorts, denim shorts ## crotch-covered, upper-legs-covered, shorts", "?!cold:: short shorts, tight shorts ## crotch-covered, upper-legs-covered, shorts"]}, {"name": "shorts", "lines": ["__short shorts__", "__mid-thigh shorts__", "__knee-length shorts__", "__long shorts__", "__skorts__"]}, {"name": "shot types", "lines": ["?!shot:: close-up ## shot", "?!shot:: cowboy shot ## shot", "establishing shot", "?!shot:: extreme close-up ## shot", "?!shot:: full body ## shot", "long shot", "medium close-up", "?!shot:: medium shot ## shot", "?!shot:: portrait ## shot", "three-quarter shot", "?!shot:: upper body ## shot", "?!shot:: wide shot ## shot"]}, {"name": "shy expressions", "lines": ["3::__subtle shy expressions__", "2::__embarrassed shy expressions__", "1::__flustered shy expressions__", "0.5::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "skirts", "lines": ["__casual and specialty skirts__", "__fitted skirts__", "__flared and layered skirts__", "__long skirts__", "__midi skirts__", "__mini skirts__", "__pleated skirts__"]}, {"name": "skorts", "lines": ["skort, pleated skirt ## crotch-covered, upper-legs-covered, shorts", "tennis skort, pleated skirt ## crotch-covered, upper-legs-covered, shorts", "athletic skort ## crotch-covered, upper-legs-covered, shorts", "denim skort ## crotch-covered, upper-legs-covered, shorts", "golf skort ## crotch-covered, upper-legs-covered, shorts", "wrap skort ## crotch-covered, upper-legs-covered, shorts"]}, {"name": "smug expressions", "lines": ["?!covered face:: confident ## blush", "?!mouth-hidden & !covered face & !mouth-state:: grin ## blush, mouth-state", "?!eyes-hidden & !covered face & !eye-state & !mouth-state:: half-closed eyes, smirk ## blush, eye-state, mouth-state", "?!covered face:: self-satisfied ## blush", "?!mouth-hidden & !covered face & !mouth-state:: sly smile ## blush, mouth-state", "?!covered face & !mouth-state:: smirk ## blush, mouth-state", "2::?!covered face:: smug ## blush", "?!mouth-hidden & !covered face & !mouth-state:: smug smile ## blush, mouth-state", "?!eyes-hidden & !covered face & !eye-state:: smug, half-closed eyes ## blush, eye-state", "5::?!covered face & !eye-state & !mouth-state:: smug, smile, closed mouth, half-closed eyes ## blush, eye-state, mouth-state", "?!eyes-hidden & !covered face & !eye-state:: wink ## blush, eye-state"]}, {"name": "solo", "lines": ["#! last", "1girl, solo"]}, {"name": "specialty leggings", "lines": ["__color__ cutout, leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ fishnet clothing, leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ lace, leggings ## legs-covered, crotch-covered, upper-legs-covered", "__color__ leather, leggings ## legs-covered, crotch-covered, upper-legs-covered"]}, {"name": "sports footwear", "lines": ["high top sneakers, casual shoes ## top", "platform sneakers, thick soles", "running shoes, sneakers"]}, {"name": "straight hairstyles", "lines": ["long straight hair", "medium straight hair", "short straight hair", "sleek straight hair", "straight hair", "straight hair, blunt bangs", "straight hair, blunt bob", "straight hair, hair between eyes", "straight hair, hair bow", "straight hair, hair over one eye", "straight hair, hair ribbon", "straight hair, hair tucked behind ears", "straight hair, hairband", "straight hair, hairclip", "straight hair, headband", "straight hair, hime cut", "straight hair, layered hair", "straight hair, parted bangs", "straight hair, swept bangs", "very long straight hair", "waist-length straight hair"]}, {"name": "subtle shy expressions", "lines": ["?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, light blush, looking away, closed mouth ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: bashful, blush, looking down, slight smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: nervous, light blush, downcast eyes, nervous smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, nose blush, looking down, closed mouth ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: bashful, ear blush, half-closed eyes, light smile ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, rosy cheeks, looking at viewer, light smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: nervous, blush, sideways glance, nervous smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: bashful, nose blush, closed eyes, gentle smile ## blush, eye-state, eyes-closed, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: shy, light blush, half-closed eyes, parted lips ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, ear blush, looking away, light smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: nervous, heavy blush, looking at viewer, parted lips ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: bashful, rosy cheeks, downcast eyes, closed mouth ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, blush, looking down, puckered lips ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: bashful, full-face blush, looking away, slight smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, light blush, looking at viewer, parted lips ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: nervous, sweatdrop, looking away, slightly open mouth ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, blush, raised eyebrows, looking down, light smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: bashful, blush, closed eyes, closed smile ## blush, eye-state, eyes-closed, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: shy, red cheeks, downcast eyes, nervous smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: nervous, blush, wide-eyed, closed mouth ## blush, eye-state, mouth-state", "?!covered face & !eyes-hidden & !mouth-hidden & !gaze & !eye-state & !mouth-state:: bashful, ear blush, looking at viewer, slight smile ## blush, eye-state, gaze, mouth-state", "?!covered face & !mouth-hidden & !mouth-state:: shy, blush, closed mouth ## blush, mouth-state", "?!covered face & !mouth-hidden & !mouth-state:: bashful, nose blush, slight smile ## blush, mouth-state", "?!covered face & !eyes-hidden & !gaze & !eye-state:: shy, blush, looking down, downcast eyes ## blush, eye-state, gaze", "?!covered face & !eyes-hidden & !gaze & !eye-state:: nervous, sweatdrop, sideways glance ## blush, eye-state, gaze", "?!covered face & !eyes-hidden & !eye-state:: bashful, ear blush, closed eyes ## blush, eye-state, eyes-closed", "?!covered face & !eyes-hidden & !mouth-hidden & !eye-state & !mouth-state:: blush, closed eyes, closed smile ## blush, eye-state, eyes-closed, mouth-state"]}, {"name": "sunglasses", "lines": ["aviator sunglasses", "black sunglasses", "cat-eye sunglasses", "red sunglasses", "rimless sunglasses", "round sunglasses", "sport sunglasses", "square sunglasses", "sunglasses", "tinted eyewear", "tinted glasses", "white sunglasses"]}, {"name": "surprised expressions", "lines": ["?!covered face:: astonished ## blush", "?!mouth-hidden & !covered face & !mouth-state:: gasp ## blush, mouth-state", "?!mouth-hidden & !covered face & !mouth-state:: open mouth ## blush, mouth-state", "?!eyes-hidden & !covered face:: raised eyebrows ## blush", "?!covered face:: shocked ## blush", "?!mouth-hidden & !covered face & !mouth-state:: slightly open mouth ## blush, mouth-state", "?!covered face:: surprised ## blush", "?!mouth-hidden & !covered face & !mouth-state:: surprised, open mouth ## blush, mouth-state", "?!eyes-hidden & !covered face & !eye-state:: wide-eyed ## blush, eye-state", "?!eyes-hidden & !mouth-hidden & !covered face & !eye-state & !mouth-state:: wide-eyed, open mouth ## blush, eye-state, mouth-state", "0.1::?covered face|mouth-hidden|eyes-hidden:: {|}"]}, {"name": "sweaters and knit tops", "lines": ["cardigan, open front ## button-front, top", "cropped cardigan, long sleeves ## button-front, top", "?!cold:: cropped sweater, midriff ## top", "off shoulder sweater, oversized ## top", "sweater, oversized ## top", "turtleneck sweater, long sleeves ## top"]}, {"name": "sweatshirts", "lines": ["__color__ sweatshirt, long sleeves ## top", "__color__ oversized sweatshirt, oversized clothes ## top", "__color__ cropped sweatshirt, cropped top ## top", "__color__ crewneck sweatshirt, crew neck ## top", "__color__ graphic sweatshirt, printed design ## top", "__color__ raglan sweatshirt, raglan sleeves ## top", "__color__ zip up sweatshirt, front zipper ## top, zip-front", "__color__ mock neck sweatshirt, high neck ## top"]}, {"name": "t-shirts", "lines": ["__color__ t-shirt, short sleeves ## top", "__color__ oversized t-shirt, oversized clothes ## top", "__color__ fitted t-shirt, short sleeves, tight fit ## top", "__color__ cropped t-shirt, short sleeves, cropped top, midriff ## top", "__color__ long sleeve t-shirt, long sleeves ## top", "__color__ v-neck t-shirt, v-neck ## top", "__color__ crew neck t-shirt, crew neck ## top", "__color__ graphic t-shirt, printed design ## top", "__color__ striped t-shirt, horizontal stripes ## top", "__color__ raglan t-shirt, raglan sleeves ## top", "__color__ pocket t-shirt, breast pocket ## top", "__color__ baseball t-shirt, three-quarter sleeves ## top"]}, {"name": "tank tops", "lines": ["?!cold:: __color__ tank top, sleeveless ## top", "?!cold:: __color__ fitted tank top, sleeveless, tight fit ## top", "?!cold:: __color__ loose tank top, sleeveless, oversized clothes ## top", "?!cold:: __color__ ribbed tank top, sleeveless, ribbed fabric ## top", "?!cold:: __color__ racerback tank top, sleeveless, racerback ## top", "?!cold:: __color__ cropped tank top, sleeveless, cropped top, midriff ## top", "?!cold:: __color__ spaghetti strap tank top, thin straps ## top", "?!cold:: __color__ athletic tank top, sleeveless, athletic wear ## top"]}, {"name": "thongs and string panties", "lines": ["__color__ string panties ## panties", "__color__ micro panties ## panties", "__color__ side-tie panties ## panties", "__color__ thong ## panties"]}, {"name": "tight pants", "lines": ["## pants", "leather pants, tight fit ## legs-covered, pants, crotch-covered", "low rise pants, fitted ## legs-covered, pants, crotch-covered", "skinny jeans, tight pants ## legs-covered, pants, crotch-covered, zip-front", "yoga pants, tight fit ## legs-covered, pants, crotch-covered"]}, {"name": "time of day", "lines": ["?!night:: day ## daylight", "evening", "morning", "?!daylight:: night ## night", "sunrise", "sunset", "twilight"]}, {"name": "top pattern", "lines": ["argyle", "checkered", "floral print", "plaid", "polka dot", "stripes"]}, {"name": "tops", "lines": ["__blouses and shirts__", "__casual tops__", "__corsets and lingerie tops__", "__crop tops and short tops__", "__sweaters and knit tops__"]}, {"name": "town outdoors", "lines": ["alley, __architectural style__ ## place, place-outdoor", "backstreet, __architectural style__ ## place, place-outdoor", "balcony, __architectural style__ ## place, place-outdoor", "bridge ## place, place-outdoor", "?!summer & !autumn & !winter:: cherry blossom-lined shopping street ## place, place-outdoor, spring", "city plaza ## place, place-outdoor", "city rooftop ## place, place-outdoor", "city street, __architectural style__ ## place, place-outdoor", "city, __architectural style__ ## place, place-outdoor", "cityscape, __architectural style__ ## place, place-outdoor", "commercial street ## place, place-outdoor", "fireworks festival riverside ## place, place-outdoor, place-water", "garden ## place, place-outdoor", "harbor ## place, place-outdoor, place-water", "market, __architectural style__ ## place, place-outdoor", "park ## place, place-outdoor", "pier ## place, place-outdoor", "plaza, __architectural style__ ## place, place-outdoor", "rain-soaked neon city street ## place, place-outdoor", "rainy city street ## place, place-outdoor", "residential street, __architectural style__ ## place, place-outdoor", "restaurant street ## place, place-outdoor", "rooftop, __architectural style__ ## place, place-outdoor", "seaside promenade ## place, place-outdoor", "shopping district ## place, place-outdoor", "shopping district, __architectural style__ ## place, place-outdoor", "shopping street, __architectural style__ ## place, place-outdoor", "skate park ## place, place-outdoor", "skyscraper rooftop ## place, place-outdoor", "?!spring & !summer & !autumn:: snow-covered street ## cold, place, place-outdoor, place-snow, winter", "?!spring & !summer & !autumn:: snowy town square at dusk ## cold, place, place-outdoor, place-snow, winter", "street, __architectural style__ ## place, place-outdoor", "?!spring & !autumn & !winter:: summer festival street with lanterns ## place, place-outdoor, summer", "tourist attraction ## place, place-outdoor", "town square, __architectural style__ ## place, place-outdoor", "traditional street ## place, place-outdoor", "train platform ## place, place-outdoor"]}, {"name": "traditional architecture", "lines": ["Japanese shrine architecture", "Japanese temple architecture", "pagoda architecture", "traditional Chinese architecture", "traditional European architecture", "traditional Japanese architecture", "traditional Korean architecture", "traditional stone architecture", "traditional townhouse architecture", "traditional wooden architecture"]}, {"name": "traditional dresses", "lines": ["china dress, fitted dress ## dress, crotch-covered", "china dress, high collar ## dress, crotch-covered", "kimono, wide sleeves ## crotch-covered, dress"]}, {"name": "traditional footwear", "lines": ["?!cold:: geta, traditional sandals", "?!cold:: zori, flat sandals"]}, {"name": "transport locations", "lines": ["airplane cabin ## place, place-indoor", "airport terminal ## place, place-indoor", "bus interior ## place, place-indoor", "bus station ## place, place-indoor", "car interior ## place, place-indoor", "ferry interior ## place, place-indoor", "ship interior ## place, place-indoor", "station platform ## place, place-indoor", "subway platform ## place, place-indoor", "subway station ## place, place-indoor", "subway train interior ## place, place-indoor", "taxi interior ## place, place-indoor", "train interior ## place, place-indoor", "train station ## place, place-indoor"]}, {"name": "twintails", "lines": ["curly twintails", "high twintails", "high twintails, hair bows", "high twintails, hair ribbon", "long twintails", "long twintails, hair bows", "long twintails, hair ribbon", "low twintails", "low twintails, hair bows", "low twintails, hair ribbon", "short twintails", "side twintails", "twintails", "twintails, blunt bangs", "twintails, hair bows", "twintails, hair ribbon", "twintails, hairbands", "twintails, scrunchies", "twintails, sidelocks", "twintails, swept bangs", "wavy twintails"]}, {"name": "viewpoints", "lines": ["0.2::first person view", "?!angle:: from behind ## angle, covered face", "front view", "?!eyes-closed:: looking back ## gaze", "over-the-shoulder view", "0.2::pov", "rear view ## covered face", "side view", "three-quarter view"]}, {"name": "water locations", "lines": ["beach ## place, place-outdoor, place-water", "cliffside ## place, place-outdoor, place-water", "?!summer & !autumn & !winter:: hot spring ## place, place-outdoor, place-water, spring", "lake ## place, place-outdoor, place-water", "ocean ## place, place-outdoor, place-water", "pond ## place, place-outdoor, place-water", "river ## place, place-outdoor, place-water", "riverbank ## place, place-outdoor, place-water", "rocky beach ## place, place-outdoor, place-water", "sandy beach ## place, place-outdoor, place-water", "seaside ## place, place-outdoor, place-water", "shore ## place, place-outdoor, place-water", "stream ## place, place-outdoor, place-water", "waterfall ## place, place-outdoor, place-water"]}, {"name": "wavy hairstyles", "lines": ["beach waves", "layered wavy hair", "long wavy hair", "loose waves", "medium wavy hair", "short wavy hair", "soft waves", "very long wavy hair", "voluminous wavy hair", "wavy bob", "wavy hair", "wavy hair, blunt bangs", "wavy hair, hair bow", "wavy hair, hair over one eye", "wavy hair, hair ribbon", "wavy hair, hairband", "wavy hair, hairclip", "wavy hair, half updo", "wavy hair, headband", "wavy hair, parted bangs", "wavy hair, swept bangs", "wavy ponytail", "wavy twintails"]}, {"name": "weather", "lines": ["?(!place-indoor) & !spring & !summer & !autumn:: blizzard ## cold, wet-weather, winter", "?(!place-indoor) & !night:: clear sky", "?!place-indoor:: cloudy sky", "?!place-indoor:: drizzle ## wet-weather", "?!place-indoor:: fog", "?((!place-indoor) & !night) & !spring & !autumn & !winter:: heat haze ## summer", "?!place-indoor:: heavy rain ## wet-weather", "?(!place-indoor) & !spring & !summer & !autumn:: heavy snowfall ## cold, winter", "?!place-indoor:: light rain", "?!place-indoor:: lightning", "?!place-indoor:: overcast sky", "?!place-indoor:: partly cloudy", "?!place-indoor:: rain ## wet-weather", "?(!place-indoor) & !night:: rainbow", "?(!place-indoor) & !spring & !summer & !autumn:: snowfall ## cold, wet-weather, winter", "?!place-indoor:: strong wind", "?(!night) & !place-indoor:: sunny ## daylight", "?!place-indoor:: thunderstorm ## wet-weather", "?!place-indoor:: wind"]}, {"name": "weather atmosphere scenes", "lines": ["## place", "foggy forest path at dawn ## place, place-outdoor", "misty lakeside in the morning ## place, place-outdoor, place-water", "rain-soaked city street at night ## place, place-outdoor", "?!spring & !summer & !autumn:: snowfall beneath warm streetlights ## cold, place, place-outdoor, place-snow, winter", "?!spring & !summer & !autumn:: snowy town at dusk ## cold, place, place-outdoor, place-snow, winter", "sunbeams through a rainy window ## place, place-indoor", "sunlit flower garden after rain ## place, place-outdoor", "windy seaside cliff beneath storm clouds ## place, place-outdoor, place-water"]}, {"name": "woods locations", "lines": ["bamboo forest ## place, place-outdoor", "clearing ## place, place-outdoor", "forest ## place, place-outdoor", "forest path ## place, place-outdoor", "grove ## place, place-outdoor", "jungle ## place, place-outdoor", "meadow in the woods ## place, place-outdoor", "rainforest ## place, place-outdoor"]}, {"name": "wrist accessories", "lines": ["arm warmers, fingerless", "bangle, rigid bracelet", "beaded bracelet, beads", "bracelet watch, wristwatch", "bracelet, simple jewelry", "chain bracelet, metal chain", "charm bracelet, dangling charms", "cuff bracelet, wide bracelet", "detached sleeves, wrist cuffs", "digital watch, wristwatch", "elbow gloves, elbow length", "fingerless gloves, wrist length", "friendship bracelet, woven bracelet", "frilled wrist cuffs, frills", "gloves, wrist length", "lace cuffs, frills", "lace wrist cuffs, lace trim", "leather bracelet, wrist strap", "multiple bracelets, layered jewelry", "pearl bracelet, charm bracelet", "pearl bracelet, pearl jewelry", "ribbon bracelet, bow", "ribbon wristband, bow", "scrunchie, hair tie", "sports wristband, athletic wear", "studded bracelet, metal studs", "sweatband, wristband", "wrist cuffs, metal cuffs", "wristband, plain band", "wristwatch, wrist accessory"]}];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = text => { if (typeof Toast !== 'undefined') Toast.show({ text, duration: 'short' }); };

    function read() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || '[]');
            // Names are lower case (older ones made so here; they still match either way).
            return Array.isArray(v) ? v.filter(w => w && typeof w.name === 'string' && Array.isArray(w.lines)).map(w => (w.name === w.name.toLowerCase() ? w : { ...w, name: w.name.toLowerCase() })) : [];
        } catch (e) { return []; }
    }
    // The list as compiled by the engine, read again only when it changed.
    let lastRaw = null, lastList = [];
    function library() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) {}
        if (raw !== lastRaw) { lastRaw = raw; lastList = read(); }
        return E.compile(lastList);
    }
    function write(list) {
        try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
        if (window.WcAdvanced && WcAdvanced.paintCountSoon) WcAdvanced.paintCountSoon();
        // All combinations' count changes with the library too.
        if (window.MoreSettings && MoreSettings.paintAllSoon) MoreSettings.paintAllSoon();
    }
    const enabled = () => localStorage.getItem(ON_KEY) !== 'false';
    const options = w => weighted(w).map(o => o.text);
    const byName = (list, name) => list.find(w => nameKey(w.name) === nameKey(name)) || null;
    // Lower case letters, numbers, spaces, _ - and ( ); one space between words, none at the ends.
    const cleanName = s => String(s || '').toLowerCase().replace(/[^a-z0-9 _()-]/g, '').replace(/\s+/g, ' ').trim().replace(/^[_ ]+|[_ ]+$/g, '');

    // ---- resolving ----
    // A text with its wildcards picked (wcengine.js): memo keeps the nth use the same across an image's texts, index is its
    // place in Batch Count, image (E.image()) the variables, tags and rules they share.
    function resolveText(text, list, memo, active = new Set(), depth = 0, count = new Map(), index = 0, problems = null, image = undefined) {
        return E.resolve(text, list && list.byKey ? list : E.compile(list), E.state({ memo, active, count, index, problems, image }), depth);
    }
    const TEXT_FIELDS = ['prompt', 'negative_prompt', 'hr_prompt', 'hr_negative_prompt'];
    function usesWildcards(payload, list) {
        const texts = TEXT_FIELDS.map(f => payload[f]);
        const ad = payload.alwayson_scripts?.ADetailer?.args;
        if (Array.isArray(ad)) ad.forEach(u => { if (u && typeof u === 'object') texts.push(u.ad_prompt, u.ad_negative_prompt); });
        const lib = E.compile(list);
        return texts.some(t => typeof t === 'string' && ([...t.matchAll(new RegExp(E.CALL.source, 'g'))].some(m => E.entry(lib, m[1])) || E.hasVariant(t) || E.hasGlob(t, lib)));
    }
    // mode: the job's tab, for random::<LoRA type> (randomtokens.js); wc false: random:: only (wildcards off).
    function resolvePayload(payload, list, index = 0, memo = new Map(), problems = null, mode = 'xl', wc = true, record = null) {
        let p = { ...payload };
        if (!wc) return window.RandomTokens ? RandomTokens.expandPayload(p, mode, memo, problems, index) : p;
        // random:: / order:: first, so a character's trigger words (its outfit) are there when wildcards are picked;
        // again after, for ones a wildcard gave.
        if (window.RandomTokens && RandomTokens.inPayload(p)) p = RandomTokens.expandPayload(p, mode, memo, problems, index);
        const lib = E.compile(list), image = E.image();
        // The negative's own tags: prompt picks avoid them, and ones still picked are left out.
        // ~word: any tag ending in that word (item 63).
        const negTags = typeof p.negative_prompt === 'string' ? E.ownTags(p.negative_prompt) : [];
        const avoid = new Set(negTags.filter(t => t[0] !== '~'));
        avoid.ends = negTags.filter(t => t[0] === '~').map(t => t.slice(1).trim()).filter(Boolean);
        // What the prompt's character wears: picked tags that clash with it (Scene optimization's too) are left out.
        const worn = E.wearOfText(typeof p.prompt === 'string' ? p.prompt : '');
        // Wildcards written in the negative: kept out of the positive fields, and add nothing to the negative.
        const ban = typeof p.negative_prompt === 'string' ? E.callsIn(p.negative_prompt) : new Set();
        const r = (t, positive, main) => {
            const s = E.state({ memo, active: new Set(), count: new Map(), index, problems, image, avoid: positive ? avoid : null, record, ban: ban.size ? ban : null, noRepeat: localStorage.getItem('bojroWcNoRepeat') !== 'false' });
            if (!positive && ban.size && typeof t === 'string') t = t.replace(new RegExp(E.CALL.source, 'g'), (w, n) => (ban.has(E.nameKey(n)) ? '' : w));
            let out = E.resolve(t, lib, s);
            if (positive && (avoid.size || avoid.ends.length || worn.all.size) && typeof t === 'string') {
                const own = new Set(E.ownTags(t));
                out = out.split('\n').map((line, i) => {
                    const occ = main && worn.lines ? worn.lines[i] : worn.all;
                    return line.split(',').filter(x => { const k = E.plainTag(x); return !k || own.has(k) || !E.avoided(avoid, k) && !(occ && occ.size && E.clashTag(k, occ)); }).join(',');
                }).join('\n');
                s.blank = true;
            }
            return s.blank ? E.tidyBlank(out) : out;
        };
        TEXT_FIELDS.forEach(f => { if (typeof p[f] === 'string') p[f] = r(p[f], !/negative/.test(f), f === 'prompt'); });
        const ad = p.alwayson_scripts?.ADetailer?.args;
        if (Array.isArray(ad)) {
            p.alwayson_scripts = { ...p.alwayson_scripts, ADetailer: { ...p.alwayson_scripts.ADetailer, args: ad.map(u => (u && typeof u === 'object' ? { ...u, ad_prompt: r(u.ad_prompt, true), ad_negative_prompt: r(u.ad_negative_prompt) } : u)) } };
        }
        if (window.RandomTokens && RandomTokens.inPayload(p)) p = RandomTokens.expandPayload(p, mode, memo, problems, index);
        return p;
    }
    // Problems found while picking, in words, for the Debug Log and TRY.
    const PROBLEM = { missing: n => `no wildcard called "${n}"`, loop: n => `"${n}" is inside itself (left out)`, depth: n => `"${n}" is more than ${MAX_DEPTH} wildcards deep (left out)`, empty: n => `"${n}" has no options`,
        none: n => `no option of "${n}" fits (left out)`, unset: n => `\${${n}} isn't set`, expr: n => `can't read the condition in ${n}`,
        rules: n => `the rules leave no option of "${n}" (left out)`, outfit: n => `no option of "${n}" fits what the prompt wears (left out)`, rule: n => `can't read the rule "${n}"`, random: n => `random:: ${n} (left out)` };
    // The requests a job is sent as: itself without wildcards, else one copy per image (n_iter 1, seeds counting on).
    // memoFor(i) (Scene optimization): image i's picks as the wildcards' first uses; tidy drops tags left empty.
    function parts(job, memoFor, tidy) {
        const list = library().list;
        if (!job || !job.payload) return [job];
        const wc = enabled() && usesWildcards(job.payload, list), rnd = !!(window.RandomTokens && RandomTokens.inPayload(job.payload));
        if (!wc && !rnd) return [job];
        // All combinations (More Settings): one image per combination of the prompt's choices, going on from where the
        // last run stopped (comboAbort()).
        const combo = job.combos && enabled() ? combosFor(job.payload.prompt, job.mode, job.typedPrompt, job.payload.n_iter) : null;
        const used = [...[job.payload.prompt, job.payload.negative_prompt].join('\n').matchAll(new RegExp(E.CALL.source, 'g'))].map(m => m[1]);
        noteUsed(used.filter(n => byName(list, n)));
        let n = job.payload.n_iter || 1;
        if (combo && combo.list.length > 1) {
            n = combo.list.length;
            const given = memoFor;
            memoFor = i => { const m = given ? given(i) : new Map(); combo.list[i].forEach((v, k) => { if (!m.has(k)) m.set(k, v); }); return m; };
            comboAt.set(job.mode, { sig: combo.sig, at: (combo.start + n) % combo.total });
        }
        const problems = [];
        const seed = Number(job.payload.seed), seeded = localStorage.getItem('bojroWcSeeded') === 'true' && Number.isFinite(seed) && seed !== -1;
        // Same seed, same picks: a seed the app picked notes each image's place (IN ORDER wildcards); one sent back
        // takes it again (randomtokens.js).
        const R = window.RandomTokens, rolledSeed = seeded && R && R.rolled && R.rolled(seed);
        const placeOf = i => { if (!seeded || rolledSeed || !R || !R.seedRec || combo) return i; const r = R.seedRec(seed + i); return r && Number.isInteger(r.i) ? r.i : i; };
        // Each image's picks are kept with it (Reroll, wcreroll.js); job.reroll gives kept ones back.
        const one = i => {
            const memo = memoFor ? memoFor(i) : new Map(), record = new Map();
            if (job.reroll) job.reroll.forEach(([k, v]) => { if (!memo.has(k)) memo.set(k, Array.isArray(v) ? [...v] : v); });
            if (rolledSeed) R.seedNote(seed + i, { i });
            if (R && R.atImage) R.atImage(seeded ? seed + i : null);
            let p;
            try { p = E.withRandom(seeded ? E.seeded(seed + i) : null, () => resolvePayload(job.payload, list, placeOf(i), memo, problems, job.mode, wc, record)); }
            finally { if (R && R.atImage) R.atImage(null); }
            if (tidy) p.prompt = E.tidyBlank(p.prompt);
            const picks = [...record.values()];
            memo.forEach((v, k) => { if (/^(random|order):/.test(k) && k !== 'random:taken' && typeof v === 'string') picks.push({ k, random: true, pick: v }); });
            // Scene optimization's picks: each slot it filled, so one can be redrawn (wcreroll.js).
            memo.forEach((bits, k) => {
                if (!/^#bits:/.test(k) || !Array.isArray(bits)) return;
                const top = picks.find(x => x.k === k.slice(6));
                if (!top) return;
                top.bits = bits;
                bits.forEach((b, j) => { if (b.slot) picks.push({ k: `${top.k}/${j}`, name: b.name, pick: b.text, multi: true, parent: top.k, sceneSlot: true }); });
            });
            // fc: Forge Couple's background and region texts and names (one per prompt line), or null when it was off.
            p.wcPicks = picks.length ? { v: 1, mode: job.mode, prompt: job.typedPrompt != null ? job.typedPrompt : job.payload.prompt, picks, fc: job.fcInfo || null } : null;
            return p;
        };
        // The picks travel with the request, not in what is sent.
        const part = (p, extra) => { const wcPicks = p.wcPicks; delete p.wcPicks; return { ...job, payload: p, ...extra, ...(wcPicks ? { wcPicks } : {}) }; };
        const logged = out => {
            if (problems.length && typeof dlog === 'function') dlog(`wildcards: ${problems.map(p => PROBLEM[p.type](p.name)).join('; ')}`);
            return out;
        };
        if (n <= 1) return logged([part(one(0), {})]);
        return logged(Array.from({ length: n }, (_, i) => {
            const p = one(i);
            p.n_iter = 1;
            if (typeof p.seed === 'number' && p.seed !== -1) p.seed += i;
            if (typeof p.subseed === 'number' && p.subseed !== -1) p.subseed += i;
            return part(p, { splitOf: [i + 1, n], ...(combo && combo.list.length > 1 ? { comboPos: (combo.start + i) % combo.total } : {}) });
        }));
    }
    // ---- All combinations ----
    // The most images a run of All combinations makes (Config, 1-999).
    const COMBO_CAP_KEY = 'bojroWcComboCap';
    const comboCap = () => { const n = parseInt(localStorage.getItem(COMBO_CAP_KEY), 10); return n >= 1 && n <= 999 ? n : 100; };
    const COMBO_JOBS_KEY = 'bojroWcComboJobs';
    const comboJobs = () => { const n = parseInt(localStorage.getItem(COMBO_JOBS_KEY), 10); return n >= 1 && n <= 999 ? n : 50; };
    function setComboJobs(v) {
        const k = parseInt(v, 10), n = isNaN(k) ? 50 : Math.min(999, Math.max(1, k));
        localStorage.setItem(COMBO_JOBS_KEY, String(n));
        const el = document.getElementById('cfgWcComboJobs');
        if (el) el.value = String(n);
    }
    // A job with more combinations than a run makes: 'now' (this run; from ADD TO QUEUE, just this one), the plan for
    // comboJobsOf() (queue them all), or null (cancelled). Anything else: 'now' without asking.
    async function comboAsk(job, fromQueue) {
        if (!job || !job.combos || !job.payload) return 'now';
        const c = comboCount(job.payload.prompt, job.mode);
        if (c.total <= c.n) return 'now';
        const per = c.n, want = Math.ceil(c.total / per), jobs = Math.min(want, comboJobs());
        const imgs = Math.min(c.total, jobs * per), f = x => x.toLocaleString('en');
        const now = document.createElement('button');
        now.type = 'button';
        now.className = 'btn-small combo-now-btn';
        now.textContent = fromQueue ? `QUEUE ${f(per)} ONLY` : `GENERATE ${f(per)} NOW`;
        now.onclick = () => window.__appConfirmResolve('now');
        const r = await window.appConfirm(jobs < want ? `${f(per)} per run, ${f(comboJobs())} jobs at most. Queue the first ${f(imgs)}?` : `${f(per)} per run. Queue all ${f(c.total)} as ${f(jobs)} job${jobs === 1 ? '' : 's'}?`,
            { title: `${f(c.total)} Combinations`, okText: `QUEUE ${f(jobs)} JOB${jobs === 1 ? '' : 'S'}`, extra: now });
        if (!r) return null;
        return r === 'now' ? 'now' : { jobs, per, imgs };
    }
    // The jobs for 'queue': copies of the job, the last with what's left; each goes on from the one before when it runs.
    function comboJobsOf(job, plan) {
        return Array.from({ length: plan.jobs }, (_, i) => {
            const j = JSON.parse(JSON.stringify(job));
            j.payload.n_iter = Math.min(plan.per, plan.imgs - i * plan.per);
            if (plan.jobs > 1) j.comboPart = [i + 1, plan.jobs];
            j.id = `${Date.now()}${i}`;
            j.timestamp = new Date().toLocaleString();
            return j;
        });
    }
    function setComboCap(v) {
        const k = parseInt(v, 10), n = isNaN(k) ? 100 : Math.min(999, Math.max(1, k));
        localStorage.setItem(COMBO_CAP_KEY, String(n));
        const el = document.getElementById('cfgWcComboCap');
        if (el) el.value = String(n);
        if (window.MoreSettings && MoreSettings.paintCombos) ['xl', 'anima', 'qwen', 'flux', 'krea'].forEach(m => MoreSettings.paintCombos(m));
    }
    // Per tab: where the next run starts, for the prompt it was for (sig: the prompt as typed).
    const comboAt = new Map();
    const comboStart = (mode, sig, total) => { const c = comboAt.get(mode); return c && c.sig === sig && total ? c.at % total : 0; };
    function combosFor(prompt, mode, typed, most) {
        const sig = typed != null ? typed : prompt;
        const extra = window.RandomTokens && RandomTokens.groupAxes ? RandomTokens.groupAxes(prompt, mode) : [];
        const probe = E.combos(prompt, E.compile(library().list), 0, extra);
        const start = comboStart(mode, sig, probe.total);
        return { ...E.combos(prompt, E.compile(library().list), Math.min(comboCap(), most > 0 ? most : Infinity), extra, start), sig, start };
    }
    // Combinations for a prompt (More Settings' count line, MoreSettings.apply()): { total, n, next } with n images made
    // and next the combination the run starts at (1 = the first).
    function comboCount(prompt, mode = 'xl') {
        if (!enabled() || typeof prompt !== 'string') return { total: 0, n: 0, next: 1 };
        const extra = window.RandomTokens && RandomTokens.groupAxes ? RandomTokens.groupAxes(prompt, mode) : [];
        const c = E.combos(prompt, E.compile(library().list), 0, extra);
        return { total: c.total, n: Math.min(c.total, comboCap()), next: comboStart(mode, prompt, c.total) + 1 };
    }
    // ABORT: the next run starts at the image that was aborted (engine.js). SKIP needs nothing: the next image is next.
    function comboAbort(part) {
        if (!part || part.comboPos == null) return;
        const c = comboAt.get(part.mode);
        if (c) c.at = part.comboPos;
        if (window.MoreSettings && MoreSettings.paintCombos) MoreSettings.paintCombos(part.mode);
    }
    const comboReset = mode => { comboAt.delete(mode); if (window.MoreSettings && MoreSettings.paintCombos) MoreSettings.paintCombos(mode); };
    // One resolve of a text with every pick and problem (for Explain and tests).
    function explain(text, index = 0) {
        const s = E.state({ index, trace: [], problems: [] });
        let out = E.resolve(text, library(), s);
        if (s.blank) out = E.tidyBlank(out);
        const vars = {};
        s.vars.forEach((v, k) => { if ('value' in v) vars[k] = v.value; });
        return { text: out, trace: s.trace, problems: s.problems, vars };
    }

    // ---- suggestions (tagcomplete.js) ----
    // The last 5 wildcards put in from the tag bar or used in a generation, newest first.
    const RECENT_KEY = 'bojroWcRecent';
    function recent() {
        try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function noteUsed(names) {
        const add = [...new Set(names.map(nameKey))];
        if (!add.length) return;
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(add.concat(recent().filter(n => !add.includes(n))).slice(0, 5))); } catch (e) {}
    }
    // The tag bar after "__": the last used first; once something is typed, the closest names first (the name itself,
    // starting with it, a word starting with it, the rest), shorter first, then the last used, then A-Z.
    function suggest(q) {
        const s = nameKey(q || ''), r = recent();
        const used = w => { const i = r.indexOf(nameKey(w.name)); return i < 0 ? r.length : i; };
        const close = w => { const n = nameKey(w.name); return !s ? 0 : n === s ? 0 : n.startsWith(s) ? 1 : ('_' + n).includes('_' + s) ? 2 : 3; };
        return read().filter(w => nameKey(w.name).includes(s))
            .sort((a, b) => close(a) - close(b) || (s ? a.name.length - b.name.length : 0) || used(a) - used(b) || a.name.localeCompare(b.name))
            .map(w => ({ name: w.name, count: options(w).length }));
    }

    // ---- the Wildcards window ----
    const SEARCH_OPTIONS_KEY = 'bojroWcSearchOptions';
    function toggleSearchOptions() {
        const on = localStorage.getItem(SEARCH_OPTIONS_KEY) !== 'true';
        localStorage.setItem(SEARCH_OPTIONS_KEY, on ? 'true' : 'false');
        if (typeof Toast !== 'undefined') Toast.show({ text: on ? 'Searching options, labels and rules' : 'Searching names only', duration: 'short' });
        render();
    }
    // A wildcard's text for content search: its lines, rules and conditions also in the app's words (+ RULE, the editor's
    // plain words, LIST view's Only if), so "never together" finds "#! a excludes b".
    const RULE_WORDS = { excludes: r => (r.a ? 'never together never with' : 'never'), requires: () => 'needs', one: () => 'only one of', last: () => 'pick last' };
    function searchText(w) {
        return w.lines.map(l => {
            const t = String(l).trim();
            if (t.startsWith('#!')) { const r = E.parseRule(t), f = RULE_WORDS[r.type]; return f ? `${t}\n${f(r)}` : t; }
            return !t.startsWith('#') && t.indexOf('::') >= 0 && E.parseOption(t).cond ? `${t}\nonly if` : t;
        }).join('\n');
    }
    function render() {
        const listEl = document.getElementById('wcList');
        if (!listEl) return;
        const q = typeof searchQuery === 'function' ? searchQuery(document.getElementById('wcSearch').value) : document.getElementById('wcSearch').value;
        document.getElementById('wcSearchClear').classList.toggle('hidden', !document.getElementById('wcSearch').value);
        // In the order chosen with the sort button (item 85); the library keeps the order they were made in.
        const libList = read(), madeAt = new Map(libList.map((w, i) => [w, i]));
        const order = ListSort.compare('wc', { name: w => w.name, key: w => nameKey(w.name), added: w => madeAt.get(w) || 0 });
        ListSort.paint(document.getElementById('wcSortBtn'), 'wc');
        let list = libList.slice().sort(order);
        // Names only, or options, labels and rules too (the button beside the search box); names that match come first.
        const inOptions = localStorage.getItem(SEARCH_OPTIONS_KEY) === 'true';
        const btn = document.getElementById('wcSearchOptions');
        if (btn) { btn.classList.toggle('active', inOptions); btn.setAttribute('aria-pressed', inOptions ? 'true' : 'false'); }
        if (q) {
            const nameOf = w => [w.name.replace(/_/g, ' ')];
            // Closest names first (the name itself, then starting with it, shorter first), the rest alphabetical.
            const key = t => (typeof searchKey === 'function' ? searchKey(t) : t.toLowerCase()).replace(/[_\s]+/g, ' ').trim();
            const qk = key(q), rank = w => { const n = key(w.name); return n === qk ? 0 : n.startsWith(qk) ? 1 : 2; };
            const named = (typeof searchFilter === 'function' ? searchFilter(list, nameOf, q) : list.filter(w => w.name.includes(q)))
                .map((w, i) => ({ w, i, r: rank(w), l: w.name.length })).sort((a, b) => a.r - b.r || (a.r < 2 ? a.l - b.l : 0) || a.i - b.i).map(x => x.w);
            if (inOptions && typeof searchFilter === 'function') {
                const has = new Set(named);
                // By words, never inside one (item 14): "hat" doesn't find "chatting"; the word being typed matches the start
                // of a word ("excl" finds "excludes"), a trailing space makes it whole.
                const whole = typeof searchMatches === 'function' ? list.filter(w => searchMatches(searchText(w), q)) : [];
                list = named.concat(whole.filter(w => !has.has(w)));
            } else list = named;
        }
        // Favourites only (the star beside the search box).
        const favOnly = localStorage.getItem(FAV_ONLY_KEY) === 'true', fb = document.getElementById('wcFavOnly');
        if (fb) {
            fb.classList.toggle('on', favOnly); fb.setAttribute('aria-pressed', favOnly ? 'true' : 'false');
            const svg = fb.querySelector('svg'); if (svg) svg.setAttribute('fill', favOnly ? 'currentColor' : 'none');
        }
        // Favourites view: favourites only, unless searching (then everything, favourites first, item 59).
        if (favOnly) { const f = favSet(); list = q ? list.filter(w => f.has(nameKey(w.name))).concat(list.filter(w => !f.has(nameKey(w.name)))) : list.filter(w => f.has(nameKey(w.name))); }
        // What the select-all circle picks from (item 83).
        shownKeys = list.map(w => nameKey(w.name));
        if (selecting) paintSel();
        listEl.innerHTML = '';
        listEl.classList.toggle('wc-adv', !!(window.WcAdvanced && WcAdvanced.on()));
        if (!list.length) {
            listEl.innerHTML = `<div class="empty-note">${favOnly && !q ? 'No favorites yet. Tap a star to add one.' : q ? 'No wildcards match.' : 'No wildcards yet. Tap + to add one.'}</div>`;
            fit();
            return;
        }
        const badges = window.WcAdvanced ? WcAdvanced.badgesFor() : () => '';
        // In the box first, then the rest in the order they had.
        const box = target(), favs = favSet();
        // The box's wildcards read once (a test per wildcard was slow with a big library).
        const inUse = new Set();
        // <lora:...> tags first: a LoRA file name can hold "__" too. Only names in the library count, so a stray "__"
        // (o__o, ^__^, one half typed) doesn't pair with the next one, and names starting or ending in "_" are found.
        if (box) {
            const v = String(box.value || '').replace(/<[^<>]*>/g, ','), keys = new Set(read().map(w => useKey(w.name)));
            for (let i = v.indexOf('__'); i >= 0;) {
                let hit = -1;
                for (let j = v.indexOf('__', i + 2); j >= 0 && j - i < 300; j = v.indexOf('__', j + 1)) {
                    const t = v.slice(i + 2, j);
                    if (t.includes('\n')) break;
                    if (t && keys.has(useKey(t))) { hit = j; inUse.add(useKey(t)); break; }
                }
                i = v.indexOf('__', hit >= 0 ? hit + 2 : i + 1);
            }
        }
        const used = w => inUse.has(useKey(w.name));
        const rank = w => (used(w) ? 0 : 1);
        // Groups (the button beside the star): wildcards sharing a first word, three or more, under one header.
        const grouped = groupsOn() && !q && !favOnly, gb = document.getElementById('wcGroups');
        if (gb) { gb.classList.toggle('on', groupsOn()); gb.setAttribute('aria-pressed', groupsOn() ? 'true' : 'false'); }
        let items, shownGroup = k => k;
        if (grouped) {
            const G = groupsOf(list), groups = G.groups;
            shownGroup = G.shown;
            items = list.filter(used).sort(order).map(w => ({ w }));
            [...groups.keys()].sort((a, b) => (a === 'other') - (b === 'other') || COLLATE.compare(a, b)).forEach(k => {
                const m = groups.get(k).sort(order), open = openGroups.has(k);
                items.push({ group: k, n: m.length, open, used: m.some(used), keys: m.map(x => nameKey(x.name)) });
                if (open) m.forEach(x => items.push({ w: x, child: true }));
            });
        } else items = list.map((w, i) => ({ w, i, r: rank(w) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => ({ w: x.w }));
        const header = it => {
            const row = document.createElement('div');
            row.className = 'lora-item-row wc-group' + (it.open ? ' open' : '') + (it.used ? ' active' : '');
            row.dataset.group = it.group;
            row.innerHTML = `<i data-lucide="${it.open ? 'chevron-down' : 'chevron-right'}" width="18" height="18"></i><span>${esc(shownGroup(it.group))}</span><span class="wc-count">${it.n}</span>`;
            // Selecting: a circle for the whole group (its favourites left out).
            row._keys = it.keys;
            if (selecting) {
                const f = favSet(), mine = it.keys.filter(k => !f.has(k));
                if (mine.length) {
                    const ring = document.createElement('button');
                    ring.type = 'button';
                    ring.className = 'wc-group-ring';
                    ring.setAttribute('aria-label', 'Select this group');
                    ring.onclick = e => {
                        e.stopPropagation();
                        const all = mine.every(k => selecting.has(k));
                        mine.forEach(k => { if (all) selecting.delete(k); else selecting.add(k); });
                        listEl.querySelectorAll('.wc-row[data-key]').forEach(r => r.classList.toggle('wc-picked', selecting.has(r.dataset.key)));
                        paintSel();
                    };
                    row.appendChild(ring);
                }
                paintGroup(row);
            }
            // Long press (not selecting): select the group's wildcards (not its favourites); the group stays as it is.
            let held = 0, fired = false, at = null;
            row.addEventListener('pointerdown', e => {
                if (selecting) return;
                fired = false; at = [e.clientX, e.clientY];
                held = setTimeout(() => {
                    held = 0; fired = true;
                    const f = favSet(), mine = it.keys.filter(k => !f.has(k));
                    if (!mine.length) { toast("Favorites can't be selected"); return; }
                    selecting = new Set(mine);
                    paintSel();
                    renderKeep();
                }, 500);
            });
            row.addEventListener('pointermove', e => { if (held && at && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) { clearTimeout(held); held = 0; } });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => row.addEventListener(t, () => { if (held) { clearTimeout(held); held = 0; } }));
            row.oncontextmenu = e => e.preventDefault();
            row.onclick = () => {
                if (fired) { fired = false; return; }
                // One open at a time (as Config); the tapped header stays where it is on screen.
                const was = openGroups.has(it.group), off = row.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
                openGroups.clear();
                if (!was) openGroups.add(it.group);
                render();
                const find = () => [...listEl.querySelectorAll('.wc-group')].find(x => x.dataset.group === it.group);
                let h = find();
                for (let tries = 0; !h && listEl.indicatorGrow && tries < 50; tries++) { const n = listEl.children.length; listEl.indicatorGrow(listEl.scrollHeight); h = find(); if (listEl.children.length === n) break; }
                if (h) {
                    const to = h.getBoundingClientRect().top - listEl.getBoundingClientRect().top + listEl.scrollTop - off;
                    if (listEl.indicatorGrow) listEl.indicatorGrow(to);
                    listEl.scrollTop = to;
                }
            };
            return row;
        };
        const make = it => {
            if (it.group) return header(it);
            const w = it.w;
            const opts = options(w);
            const row = document.createElement('div');
            const fav = favs.has(nameKey(w.name));
            const key = nameKey(w.name), picked = !!(selecting && selecting.has(key));
            row.dataset.key = key;
            row.className = 'lora-item-row wc-row' + (used(w) ? ' active' : '') + (it.child ? ' lv-child' : '') + (selecting ? ' wc-selecting' : '') + (picked ? ' wc-picked' : '') + (selecting && fav ? ' wc-nopick' : '');
            // The name (two lines at most) and its option count; Advanced: its badges under it. No preview of the options.
            row.innerHTML = `
                <div class="lora-item-info wc-info">${(b => `
                    <div class="lora-item-name wc-name"><span class="wc-name-text">${esc(w.name)}</span><span class="wc-count">${opts.length}</span></div>${b ? `<div class="wc-badges">${b}</div>` : ''}`)(badges(w))}
                </div>
                <div class="lora-star-toggle-stack"><button type="button" class="lora-btn-star wc-fav${fav ? ' on' : ''}" title="Favorite" aria-label="Favorite" aria-pressed="${fav}"><i data-lucide="star" width="24" height="24"${fav ? ' fill="currentColor"' : ''}></i></button><button type="button" class="lora-btn-action" title="Edit" aria-label="Edit"><i data-lucide="pencil" width="16" height="16"></i></button></div>`;
            row.querySelector('.wc-fav').onclick = e => { e.stopPropagation(); if (!selecting) toggleFav(w.name, row); };
            row.querySelector('.lora-btn-action').onclick = e => { e.stopPropagation(); if (!selecting) edit(w.name); };
            // Long press: select it (and then others) to delete; a tap then selects or deselects.
            let held = 0, fired = false, at = null;
            row.addEventListener('pointerdown', e => {
                if (selecting) return;
                fired = false; at = [e.clientX, e.clientY];
                held = setTimeout(() => { held = 0; fired = true; if (fav) toast("Favorites can't be selected"); else startSelect(w.name); }, 500);
            });
            row.addEventListener('pointermove', e => { if (held && at && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) { clearTimeout(held); held = 0; } });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => row.addEventListener(t, () => { if (held) { clearTimeout(held); held = 0; } }));
            row.oncontextmenu = e => e.preventDefault();
            row.onclick = () => {
                if (fired) { fired = false; return; }
                if (!selecting) { send(w.name); return; }
                if (fav) { toast("Favorites can't be selected"); return; }
                if (selecting.has(key)) selecting.delete(key); else selecting.add(key);
                const on = selecting.has(key);
                row.classList.toggle('wc-picked', on);
                paintSel();
            };
            return row;
        };
        // A batch at a time, the next added while it's within two screens of the end.
        let done = 0;
        const more = () => {
            const frag = document.createDocumentFragment(), added = [];
            items.slice(done, done + BATCH).forEach(it => { const r = make(it); added.push(r); frag.appendChild(r); });
            done = Math.min(items.length, done + BATCH);
            listEl.appendChild(frag);
            // Badges too wide for one line wrap onto a second (the name then keeps to one line).
            added.forEach(r => { const b = r.querySelector('.wc-badges'); if (b && b.scrollWidth > b.clientWidth + 1) r.classList.add('wc-wrap2'); });
            rowH = (added.find(r => r.classList.contains('wc-row')) || {}).offsetHeight || rowH;
            if (window.lucide) lucide.createIcons();
        };
        more();
        listEl.onscroll = () => {
            if (done < items.length && listEl.scrollTop + listEl.clientHeight * 3 >= listEl.scrollHeight) more();
        };
        // The scroll bar: sized for the whole list, and a drag adds rows as far as it reaches.
        listEl.indicatorScale = () => (done ? Math.max(1, items.length / done) : 1);
        listEl.indicatorGrow = target => { while (done < items.length && listEl.scrollHeight - listEl.clientHeight < target + listEl.clientHeight) more(); };
        lastGrouped = grouped;
        fit(grouped);
    }
    // Groups by kind, for wildcards without a shared first word.
    const KINDS = [
        ['clothing', /\b(tops?|shirts?|blouses?|skirts?|pants|trousers|shorts|jeans|dress|dresses|shoes|boots|sneakers|heels|sandals|socks|legwear|stockings|tights|pantyhose|thighhighs|kneehighs|over-kneehighs|leggings|hosiery|hats?|caps|helmets|headgear|bags?|jackets?|coats?|sweaters?|hoodies?|swimwear|swimsuits?|bikinis?|bodysuits|lingerie|underwear|bras?|panties|gloves|aprons|armor|armour|accessories|jewelry|jewellery|earrings|necklaces|bracelets|eyewear|glasses|sunglasses|belts|scarves|neckwear|headwear|footwear|outerwear|sleepwear|bottoms|uniforms?|outfits?|costumes?|clothing|garments?)\b/],
        ['hair', /\b(hair|hairstyles?|ponytails?|twintails|bangs|buns|updos|braids?)\b/],
        ['camera', /\b(camera|shot types?|viewpoints?|composition|angles?|framing|lens)\b/],
        ['atmosphere', /\b(weather|seasons?|time of day|mood|lighting)\b/],
        ['places', /\b(indoors|outdoors|interiors|locations?|places?|backgrounds?)\b/],
    ];
    // Groups on or off, and which are open (until the app closes).
    // Groups (the Wildcards window and Export Wildcards): a shared first word (three or more), else a kind, else a shared
    // last word; fewer than three under "other". Returns the groups (word -> wildcards) and the header's spelling.
    function groupsOf(list) {
        // A shared first word (three or more); else a kind (clothing, hair...); else a shared last word.
        // Singular and plural together (activities, activity).
        // (tennis, succubus, dress: not plurals)
        const one = t => (/ies$/.test(t) ? t.slice(0, -3) + 'y' : /(ss|sh|ch|x)es$/.test(t) ? t.slice(0, -2) : /[^siu]s$/.test(t) && t.length > 3 ? t.slice(0, -1) : t);
        const words = w => w.name.trim().toLowerCase().split(/[\s_]+/).map((t, i, a) => (i === 0 || i === a.length - 1 ? one(t) : t)), first = new Map(), last = new Map();
        list.forEach(w => { const f = words(w)[0]; first.set(f, (first.get(f) || 0) + 1); });
        // A header shows the word as the names spell it: the plural when they use both (skirt length, skirts).
        const forms = new Map();
        list.forEach(w => { const raw = w.name.trim().toLowerCase().split(/[\s_]+/); [raw[0], raw[raw.length - 1]].forEach(t => { const k = one(t); if (!forms.has(k)) forms.set(k, new Map()); forms.get(k).set(t, (forms.get(k).get(t) || 0) + 1); }); });
        const shown = k => { const m = forms.get(k); const pl = m && [...m.entries()].filter(([t]) => t !== k).sort((a, b) => b[1] - a[1])[0]; return pl ? pl[0] : k; };
        const kindOf = w => { const n = w.name.trim().toLowerCase().replace(/[\s_]+/g, ' '); const k = KINDS.find(([, re]) => re.test(n) && !/\bscenes?\b/.test(n)); return k ? k[0] : ''; };
        list.forEach(w => { if (first.get(words(w)[0]) < 3 && !kindOf(w)) { const l = words(w).slice(-1)[0]; last.set(l, (last.get(l) || 0) + 1); } });
        const word = w => { const ws = words(w); return first.get(ws[0]) >= 3 ? ws[0] : kindOf(w) || (last.get(ws[ws.length - 1]) >= 3 ? ws[ws.length - 1] : '#' + ws.join(' ')); };
        const members = new Map();
        list.forEach(w => { const k = word(w); if (!members.has(k)) members.set(k, []); members.get(k).push(w); });
        // Groups A-Z, each wildcard A-Z inside; ones without a group of their own under "other".
        const groups = new Map();
        members.forEach((m, k) => {
            const g = m.length < 3 || k[0] === '#' ? 'other' : k;
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(...m);
        });
        return { groups, shown };
    }
    const GROUPS_KEY = 'bojroWcGroups', openGroups = new Set();
    const groupsOn = () => localStorage.getItem(GROUPS_KEY) === 'true';
    function toggleGroups() {
        localStorage.setItem(GROUPS_KEY, groupsOn() ? 'false' : 'true');
        render();
    }
    // A wildcard row's height (with its gap), for fitting the list to about LIST_H (four of the old, taller rows).
    let rowH = 0, lastGrouped = false;
    const LIST_H = 400;
    const BATCH = 30;
    // An option as it reads: variables set with ${x=!{3::a|b}} shown as their first choice, wherever ${x} is used.
    function readable(o) {
        const first = {};
        let t = String(o).replace(/\$\{(\w+)=!?\{(?:[\d.]+::)?([^|{}]*)[^{}]*\}\}/g, (m, n, v) => { first[n] = v.trim(); return ''; });
        t = t.replace(/\$\{(\w+)(?::([^}]*))?\}/g, (m, n, d) => (n in first ? first[n] : d !== undefined ? d : m));
        // An inline choice made by the colour pass ({6::black|black __top pattern__}): its first option.
        t = t.replace(/\{(?:[\d.]+::)?([^|{}]*)\|[^{}]*\}/g, '$1');
        return t.replace(/\s{2,}/g, ' ').trim();
    }
    const COLLATE = new Intl.Collator(undefined, { sensitivity: 'base' });
    // A token's name as the box's matching sees it: no (values) or [filter], spaces and underscores alike.
    const useKey = t => t.replace(/\[[^\[\]\n]*\]$/, '').replace(/\([^()\n]*=[^()\n]*\)$/, '').trim().replace(/[ _]+/g, ' ').toLowerCase();
    // Four whole wildcards, as far as the screen allows (ui.js).
    function fit(grouped = lastGrouped) {
        const listEl = document.getElementById('wcList');
        if (!listEl || typeof fitListToWholeRows !== 'function') return;
        const before = listEl.parentElement.style.maxHeight;
        if (grouped) {
            // Headers and rows: as many whole ones as fill about four rows' height.
            const all = listEl.querySelectorAll('.wc-row, .wc-group'), h = LIST_H, top = listEl.getBoundingClientRect().top - listEl.scrollTop;
            let n = 0;
            while (n < all.length && all[n].getBoundingClientRect().bottom - top <= h) n++;
            fitListToWholeRows(listEl, all, 1, Math.max(1, n));
        } else fitListToWholeRows(listEl, listEl.querySelectorAll('.wc-row'), 1, Math.max(1, Math.round(LIST_H / ((rowH || 60) + 8))));
        const after = listEl.parentElement.style.maxHeight;
        if (after !== before && typeof dlog === 'function') {
            const c = listEl.closest('.modal-content'), o = listEl.getBoundingClientRect().top - listEl.scrollTop;
            const rows = [...listEl.querySelectorAll('.wc-row')].slice(0, 6).map(r => { const b = r.getBoundingClientRect(); return `${Math.round(b.top - o)}+${Math.round(b.height)}`; });
            const parts = c ? [...c.children].map(e => `${e.id || e.className.split(' ')[0]}:${Math.round(e.getBoundingClientRect().height)}`) : [];
            const ae = document.activeElement;
            dlog(`wc fit ${before || 'none'} -> ${after || 'none'}: rows ${rows.join(' ')} of ${listEl.querySelectorAll('.wc-row').length}; window ${c ? Math.round(c.getBoundingClientRect().top) + '/' + Math.round(c.getBoundingClientRect().height) + ' max ' + getComputedStyle(c).maxHeight : '?'}; ${parts.join(' ')}; scroll ${Math.round(listEl.scrollTop)}; pad ${listEl.style.paddingBottom}; focus ${ae ? ae.id || ae.tagName : '-'}; editor ${document.getElementById('wcEditorModal')?.classList.contains('hidden') ? 'closed' : 'open'}`);
        }
    }
    // ---- selecting several to delete (item 19) ----
    let selecting = null; // name keys, while selecting
    // The select-all circle (item 83): every wildcard shown but favourites, or none of them if they all are.
    let shownKeys = [];
    const pickable = () => { const f = favSet(); return shownKeys.filter(k => !f.has(k)); };
    // A group row while selecting: its circle and "picked of all" (all: a tick and the row red; some: a dash).
    function paintGroup(h) {
        const ks = h._keys || [], c = h.querySelector('.wc-count'), ring = h.querySelector('.wc-group-ring');
        const got = selecting ? ks.filter(k => selecting.has(k)).length : 0, f = favSet(), mine = ks.filter(k => !f.has(k));
        const all = !!selecting && mine.length > 0 && mine.every(k => selecting.has(k));
        if (c) c.textContent = got ? `${got} of ${ks.length}` : String(ks.length);
        h.classList.toggle('wc-group-all', all);
        if (ring) { ring.classList.toggle('all', all); ring.classList.toggle('some', !all && got > 0); }
    }
    function toggleSelectAll() {
        if (!selecting) return;
        const keys = pickable(), all = keys.length > 0 && keys.every(k => selecting.has(k));
        keys.forEach(k => { if (all) selecting.delete(k); else selecting.add(k); });
        paintSel();
        renderKeep();
    }
    function paintSel() {
        document.body.classList.toggle('wc-selecting', !!selecting);
        const b = document.getElementById('wcSelDelete');
        if (b && selecting) { b.textContent = `DELETE (${selecting.size})`; b.disabled = !selecting.size; }
        const c = document.getElementById('wcSelCount'), sa = document.getElementById('wcSelAll');
        if (c && selecting) c.textContent = `${selecting.size} selected`;
        if (sa) {
            const keys = pickable(), all = !!selecting && keys.length > 0 && keys.every(k => selecting.has(k));
            sa.classList.toggle('all', all);
            sa.querySelector('.gal-tick')?.classList.toggle('hidden', !all);
        }
        document.querySelectorAll('#wcList .wc-group').forEach(paintGroup);
        // CANCEL and DELETE: two equal halves.
        document.querySelectorAll('#wcSelBar .btn-small').forEach(b => { b.style.flex = '1 1 0'; });
    }
    function startSelect(name) {
        selecting = new Set([nameKey(name)]);
        paintSel();
        renderKeep();
    }
    function cancelSelect() {
        if (!selecting) return;
        selecting = null;
        paintSel();
        renderKeep();
    }
    async function deleteSelected() {
        if (!selecting || !selecting.size) return;
        // Everything shown picked (the circle): the shown favourites can go too, if ticked (item 83).
        const f = favSet(), keys = pickable(), favShown = shownKeys.filter(k => f.has(k));
        const offer = favShown.length > 0 && keys.length > 0 && keys.every(k => selecting.has(k));
        const n = selecting.size, k = favShown.length;
        const titleOf = m => (m === 1 ? 'Delete Wildcard?' : `Delete ${m} Wildcards?`), msgOf = m => `${m} wildcard${m === 1 ? '' : 's'} will go to Recently deleted.`;
        const pending = window.appConfirm(msgOf(n), { title: titleOf(n), okText: 'DELETE', danger: true, checkbox: offer ? `Include ${k} favorite${k === 1 ? '' : 's'}` : undefined });
        const box = offer ? document.getElementById('appConfirmCheck') : null;
        if (box) box.onchange = () => {
            const m = box.checked ? n + k : n;
            document.getElementById('appConfirmTitle').textContent = titleOf(m);
            const msg = document.getElementById('appConfirmMessage');
            if (msg) msg.textContent = msgOf(m);
        };
        const ok = await pending;
        const withFavs = offer && window.appConfirmChecked();
        if (box) box.onchange = null;
        if (!ok) return;
        const going = new Set([...selecting].concat(withFavs ? favShown : []));
        const list = read(), gone = list.filter(w => going.has(nameKey(w.name)));
        write(list.filter(w => !going.has(nameKey(w.name))));
        if (withFavs) { const left = favSet(); favShown.forEach(x => left.delete(x)); try { localStorage.setItem(FAV_KEY, JSON.stringify([...left])); } catch (e) {} }
        if (window.WcHistory) WcHistory.deletedMany(gone);
        selecting = null;
        paintSel();
        renderKeep();
    }
    // The list drawn again where it was (item 25: after saving or deleting).
    function renderKeep() {
        const listEl = document.getElementById('wcList');
        const top = listEl ? listEl.scrollTop : 0;
        render();
        if (!listEl) return;
        if (listEl.indicatorGrow) listEl.indicatorGrow(top);
        listEl.scrollTop = top;
    }
    // The search stays as it was (item 56: until cleared, or the app starts again).
    // Opened from the tag bar's gear in another window (the style editor, a LoRA editor): over it, its own windows
    // above that, and tapped wildcards go into the box it came from. All put back on closing.
    const WC_MODALS = ['wcEditorModal', 'wcTryModal', 'wcRerollModal', 'wcHistModal', 'wcCheckModal', 'wcImportModal', 'wcExportModal', 'wcGuideModal'];
    let origin = null, raised = null;
    function raise() {
        const m = document.getElementById('wildcardsModal');
        const top = typeof topmostOverlay === 'function' ? topmostOverlay() : null;
        if (!top || top === m || WC_MODALS.includes(top.id)) return;
        const z = el => parseInt(getComputedStyle(el).zIndex, 10) || 0, base = z(m), over = z(top);
        if (over < base) return;
        raised = [m, ...WC_MODALS.map(id => document.getElementById(id)).filter(Boolean)].map(el => [el, el.style.zIndex]);
        m.style.zIndex = over + 1;
        raised.slice(1).forEach(([el]) => { el.style.zIndex = Math.max(z(el), over + 2 + Math.max(0, z(el) - 3000)); });
    }
    function lower() {
        if (raised) raised.forEach(([el, was]) => { el.style.zIndex = was; });
        raised = null;
    }
    function open(from) {
        const m = document.getElementById('wildcardsModal');
        if (m.classList.contains('hidden')) {
            origin = from && from.nodeType === 1 && !BOX_RE.test(from.id || '') && !from.closest('[id^="fc-"][id$="-regions"]') ? from : null;
            raise();
        }
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        // Shown first, so the list is fitted as it's drawn.
        m.classList.remove('hidden');
        render();
    }
    function close() {
        const m = document.getElementById('wildcardsModal');
        if (m.classList.contains('hidden')) return;
        if (selecting) { selecting = null; paintSel(); }
        m.classList.add('hidden');
        origin = null;
        lower();
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    }
    function clearSearch() {
        document.getElementById('wcSearch').value = '';
        render();
    }

    // ---- the editor ----
    let editing = null; // the name being edited; '' for a new one
    // The title's name box as wide as its text, so the pencil sits beside it.
    let measure = null;
    function fitName() {
        const el = document.getElementById('wcEditorName');
        measure = measure || document.createElement('canvas').getContext('2d');
        const cs = getComputedStyle(el);
        measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        el.style.width = `${Math.ceil(measure.measureText(el.value || el.placeholder).width) + 4}px`;
    }
    function paintCount() {
        const text = document.getElementById('wcEditorText').value.replace(/\uFF3F/g, '_');
        const n = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).length;
        document.getElementById('wcEditorCount').textContent = `${n} option${n === 1 ? '' : 's'}.`;
        // Nested ones that don't exist would reach the prompt as typed.
        const list = read();
        const missing = [...new Set([...text.matchAll(TOKEN)].map(m => m[1]).filter(name => !byName(list, name)))];
        const warn = document.getElementById('wcEditorMissing');
        warn.textContent = missing.length ? `No wildcard called ${missing.map(m => `"${m}"`).join(', ')}.` : '';
        warn.classList.toggle('hidden', !missing.length);
    }
    let inOrder = false;
    function paintOrder() {
        document.querySelectorAll('#wcOrderSeg .toggle-opt').forEach(b => b.classList.toggle('active', (b.dataset.order === 'inorder') === inOrder));
    }
    function setOrder(v) {
        inOrder = v === 'inorder';
        paintOrder();
    }
    function edit(name, keepTrail) {
        if (!keepTrail) trail = [];
        const w = name ? byName(read(), name) : null;
        editing = w ? w.name : '';
        inOrder = !!(w && w.inOrder);
        paintOrder();
        syncModels();
        document.getElementById('wcSettingsBox').classList.add('hidden');
        document.getElementById('wcGenHint').value = '';
        document.getElementById('wcEditorName').value = w ? w.name : '';
        document.getElementById('wcEditorText').value = w ? w.lines.join('\n') : '';
        document.getElementById('wcEditorDeleteBtn').classList.toggle('hidden', !w);
        document.getElementById('wcEditorHistBtn').classList.toggle('hidden', !w);
        fitName();
        paintCount();
        document.getElementById('wcAdvAsk')?.classList.add('hidden');
        document.getElementById('wcRulePanel')?.classList.add('hidden');
        if (window.WcList) WcList.reset();
        if (window.WcAdvanced) WcAdvanced.paintEditor();
        const m = document.getElementById('wcEditorModal');
        if (m.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
        m.classList.remove('hidden');
        paintBack();
        // A new one starts with its name ready to type.
        if (!w) setTimeout(() => document.getElementById('wcEditorName').focus(), 50);
    }
    // ---- going into a nested wildcard and back (item 40) ----
    // The wildcards gone through, each as it was left (unsaved changes and all).
    let trail = [];
    const stateNow = () => ({ editing, name: document.getElementById('wcEditorName').value, text: document.getElementById('wcEditorText').value, inOrder });
    function paintBack() {
        const chip = document.getElementById('wcBackChip');
        if (!chip) return;
        const last = trail[trail.length - 1];
        chip.classList.toggle('hidden', !last);
        if (last) document.getElementById('wcBackName').textContent = (last.name || '').trim() || 'new wildcard';
        if (window.lucide) lucide.createIcons();
    }
    function editNested(name) {
        const w = byName(read(), name);
        if (!w) { toast(`No wildcard called "${name}"`); return; }
        if (window.WcList && WcList.editing()) WcList.done();
        trail.push(stateNow());
        edit(w.name, true);
        document.querySelector('#wcEditorModal .modal-content').scrollTop = 0;
    }
    function back() {
        const st = trail.pop();
        if (!st) { closeEditor(); return; }
        edit(st.editing, true);
        document.getElementById('wcEditorName').value = st.name;
        document.getElementById('wcEditorText').value = st.text;
        inOrder = st.inOrder;
        paintOrder();
        fitName();
        paintCount();
        if (window.WcList) WcList.reset();
        if (window.WcAdvanced) WcAdvanced.paintEditor();
        paintBack();
    }
    // × (and back, which presses it): back to the wildcard before, when there is one; a tap on × closes the editor.
    function closeX(e) {
        if (trail.length && e && e.isTrusted === false) { back(); return; }
        closeEditor();
    }
    function closeEditor() {
        const m = document.getElementById('wcEditorModal');
        trail = [];
        paintBack();
        if (m.classList.contains('hidden')) return;
        if (m.contains(document.activeElement)) document.activeElement.blur();
        m.classList.add('hidden');
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
        editing = null;
        [400, 1600].forEach(ms => setTimeout(refit, ms));
    }
    // From scratch (fitting keeps an earlier size while a text box has focus or the keyboard is up).
    function refit() {
        const listEl = document.getElementById('wcList');
        if (!listEl || document.getElementById('wildcardsModal')?.classList.contains('hidden')) return;
        const busy = (typeof isTextBox === 'function' && isTextBox(document.activeElement)) || (typeof isKeyboardUp === 'function' && isKeyboardUp());
        if (!busy) listEl.parentElement.style.maxHeight = '';
        fit();
    }
    async function save() {
        if (window.WcList) { if (WcList.editing()) WcList.done(); WcList.tidyAll(); }
        const nameEl = document.getElementById('wcEditorName');
        const name = cleanName(nameEl.value);
        if (!name) {
            await window.appAlert('Give the wildcard a name (letters, numbers, spaces, _ - and ( )).', { title: 'Name Needed' });
            nameEl.focus();
            return;
        }
        const list = read();
        const other = byName(list, name);
        if (other && nameKey(other.name) !== nameKey(editing)) {
            await window.appAlert(`There's already a wildcard called "${other.name}".`, { title: 'Name In Use' });
            return;
        }
        const lines = document.getElementById('wcEditorText').value.split('\n').map(l => l.trim()).filter(Boolean);
        const at = editing ? list.findIndex(w => nameKey(w.name) === nameKey(editing)) : -1;
        const w = { name, lines, ...(inOrder ? { inOrder: true } : {}) };
        const before = at >= 0 ? list[at] : null, was = editing;
        if (at >= 0) list[at] = w; else list.push(w);
        if (editing && nameKey(editing) !== nameKey(name)) {
            // __old__, __old(…)__ and __old[…]__ in other wildcards become the new name, if wanted.
            const re = new RegExp(E.CALL.source, 'g');
            const swap = l => l.replace(re, (m, n) => (nameKey(n) === nameKey(editing) ? m.replace(n, name) : m));
            const callers = list.filter(x => x !== w && x.lines.some(l => swap(l) !== l));
            if (callers.length && await window.appConfirm(`${callers.length} wildcard${callers.length === 1 ? ' calls' : 's call'} "${editing}". Change ${callers.length === 1 ? 'it' : 'them'} to "${name}"?`, { title: 'Renamed', okText: 'CHANGE' })) callers.forEach(x => { x.lines = x.lines.map(swap); });
        }
        write(list);
        if (was && nameKey(was) !== nameKey(name)) renamedKeys(was, name);
        // Versions (wchistory.js).
        if (window.WcHistory) WcHistory.saved(before, w, was);
        // Opened from another wildcard: back to it.
        if (trail.length) { renderKeep(); back(); return; }
        closeEditor();
        renderKeep();
    }
    // A rename takes its favourite star and its place among the recently used along.
    function renamedKeys(from, to) {
        const a = nameKey(from), b = nameKey(to);
        try {
            const f = favSet();
            if (f.has(a)) { f.delete(a); f.add(b); localStorage.setItem(FAV_KEY, JSON.stringify([...f])); }
            const r = recent();
            if (r.includes(a)) localStorage.setItem(RECENT_KEY, JSON.stringify([...new Set(r.map(n => (n === a ? b : n)))]));
        } catch (e) {}
    }
    // TAGS or SCENES (item 43).
    const GEN_MODE_KEY = 'bojroWcGenMode';
    const genMode = () => (localStorage.getItem(GEN_MODE_KEY) === 'scenes' ? 'scenes' : 'tags');
    function setGenMode(m) {
        localStorage.setItem(GEN_MODE_KEY, m === 'scenes' ? 'scenes' : 'tags');
        paintGenMode();
    }
    function paintGenMode() {
        const m = genMode();
        document.getElementById('wcGenTags')?.classList.toggle('active', m === 'tags');
        document.getElementById('wcGenScenes')?.classList.toggle('active', m === 'scenes');
    }
    const SCENE_SYSTEM = 'You write options for a Stable Diffusion wildcard. Reply with 10 options, one per line. Each option is one coherent set of ' +
        '4 to 10 Danbooru tags, comma-separated and lowercase, making a whole scene, outfit or situation of exactly the kind asked for (and the theme, if ' +
        'given), every tag fitting the others; each option different from the rest. No people counts (1girl), character names, quality or style tags, ' +
        'no numbering, bullets or other text.';
    // GENERATE: more options from Magic Prompt's model, like the ones there, added to the box (none it already has).
    async function generate() {
        const btn = document.getElementById('wcGenBtn');
        const textEl = document.getElementById('wcEditorText');
        const name = cleanName(document.getElementById('wcEditorName').value);
        const hint = document.getElementById('wcGenHint').value.trim();
        // What the list is: the name, or with no name yet the hint; the hint is otherwise a theme.
        const subject = name || hint;
        const theme = name ? hint : '';
        if (!subject) {
            await window.appAlert('Give the wildcard a name, or say in the hint what it lists (e.g. hair color).', { title: 'Nothing To Go On' });
            return;
        }
        if (typeof getLlmConfig !== 'function') return;
        let { baseUrl, key } = getLlmConfig();
        let model = document.getElementById('wcModelSelect').value;
        if (!model) {
            if (typeof connectToLlmService === 'function') await connectToLlmService();
            syncModels();
            ({ baseUrl, key } = getLlmConfig());
            model = document.getElementById('wcModelSelect').value;
            if (!model) return;
        }
        const have = textEl.value.split('\n').map(l => l.trim().replace(WEIGHT, '')).filter(l => l && !l.startsWith('#'));
        const ask = (what, extra) => `List: ${what}${extra}`;
        const scenes = genMode() === 'scenes';
        const user = ask(subject, `${theme ? `\nTheme: ${theme}` : ''}${have.length ? `\nAlready have (don't repeat): ${have.slice(0, scenes ? 6 : 12).join(scenes ? ' / ' : '; ')}` : ''}`);
        const shots = scenes ? [
            { role: 'system', content: SCENE_SYSTEM },
            { role: 'user', content: ask('date spots', '') },
            { role: 'assistant', content: 'beach, ocean, sunset, wet sand, seashell, light breeze, golden hour\ncafe interior, window seat, coffee cup, rain on window, warm lighting, bokeh\nnight city, neon lights, crowded street, puddles, reflections\nforest path, autumn leaves, falling leaves, dappled sunlight, mossy rocks\nlibrary, bookshelves, sitting by window, afternoon light, dust particles' },
            { role: 'user', content: ask('weather', '\nTheme: winter') },
            { role: 'assistant', content: 'heavy snow, snowstorm, overcast, visible breath, snow on ground\nclear sky, sunlight, snow-covered trees, sparkling snow, frost\nfog, bare trees, frozen lake, ice, cold colors\nlight snow, snowflakes, night, streetlight, falling snow' }
        ] : [
            { role: 'system', content: 'You list Danbooru tags for a Stable Diffusion wildcard. Reply with 20 tags of exactly the kind asked for, one per line: each a single short tag of one to three words, lowercase, nothing added (no descriptions, styles, extra features or combinations), and no numbering, bullets or other text.' },
            { role: 'user', content: ask('eye color', '') },
            { role: 'assistant', content: 'blue eyes\nred eyes\ngreen eyes\nbrown eyes\npurple eyes\nyellow eyes\npink eyes\ngrey eyes\naqua eyes\nheterochromia' },
            { role: 'user', content: ask('weather', '\nTheme: winter') },
            { role: 'assistant', content: 'snow\nsnowing\nblizzard\nfog\novercast\nfrost\nicicles\nsnowflakes' }
        ];
        const label = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'GENERATING...';
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (key) headers['Authorization'] = `Bearer ${key}`;
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify({ model: model || 'default', temperature: scenes ? 0.8 : 0.7, max_tokens: scenes ? 900 : 300, stream: false, messages: shots.concat({ role: 'user', content: user }) })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const out = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || data.response || '';
            const seen = new Set(have.map(l => l.toLowerCase()));
            const added = [];
            // SCENES: a line is one option, its tags tidied (4-16 of them).
            if (scenes) out.replace(/<think>[\s\S]*?<\/think>/gi, '').split('\n').forEach(l => {
                const tags = l.replace(/^\s*(?:[-*•]|\d+[.)]|option\s*\d+\s*:)\s*/i, '').replace(/^["'`]+|["'`.]+$/g, '').split(',')
                    .map(t => t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()).filter(t => t && t.split(' ').length <= 5 && !/:$/.test(t));
                const t = [...new Set(tags)].join(', ');
                if (tags.length < 3 || tags.length > 16 || seen.has(t)) return;
                seen.add(t);
                added.push(t);
            });
            else out.replace(/<think>[\s\S]*?<\/think>/gi, '').split(/[\n;,]/).forEach(l => {
                const t = l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["'`]+|["'`.:]+$/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                // A tag, not a description: four words at most.
                if (!t || t.split(' ').length > 4 || /:$/.test(t) || seen.has(t)) return;
                seen.add(t);
                added.push(t);
            });
            if (added.length) {
                textEl.value = textEl.value.replace(/\s*$/, '') + (textEl.value.trim() ? '\n' : '') + added.join('\n');
                if (window.WcList) WcList.paint();
                if (window.WcAdvanced) WcAdvanced.paintEditor();
                textEl.scrollTop = textEl.scrollHeight;
                paintCount();
            }
            toast(added.length ? `Added ${added.length} option${added.length === 1 ? '' : 's'}` : scenes ? 'No new scenes came back. Try again, or another model.' : 'No new short tags came back. Try again, or another model.');
        } catch (e) {
            await window.appAlert('Generation failed: ' + (e.message || e), { title: 'Generation Failed', danger: true });
        } finally {
            btn.disabled = false;
            btn.innerHTML = label;
        }
    }

    // GENERATE's own model, from Magic Prompt's list (filled on LINK); remembered apart from Magic Prompt's choice.
    const MODEL_KEY = 'bojroWildcardModel';
    function syncModels() {
        const src = document.getElementById('llmModelSelect'), sel = document.getElementById('wcModelSelect');
        if (!src || !sel) return;
        const saved = localStorage.getItem(MODEL_KEY) || sel.value || src.value;
        sel.innerHTML = '';
        Array.from(src.options).forEach(o => { if (o.value) sel.appendChild(new Option(o.value, o.value)); });
        if (saved && !Array.from(sel.options).some(o => o.value === saved)) sel.appendChild(new Option(saved, saved));
        if (!sel.options.length) sel.appendChild(new Option('Connect first...', ''));
        sel.value = saved || sel.options[0].value;
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('wcModelSelect');
    }
    function saveModel() {
        const v = document.getElementById('wcModelSelect').value;
        if (v) localStorage.setItem(MODEL_KEY, v);
    }
    document.addEventListener('DOMContentLoaded', () => {
        const src = document.getElementById('llmModelSelect');
        if (src) new MutationObserver(syncModels).observe(src, { childList: true });
        syncModels();
    });

    async function remove() {
        if (!editing) return;
        if (!(await window.appConfirm(`Delete wildcard "${editing}"?`, { title: 'Delete Wildcard', okText: 'DELETE', danger: true }))) return;
        const gone = byName(read(), editing);
        write(read().filter(w => nameKey(w.name) !== nameKey(editing)));
        // Recently deleted, with UNDO (wchistory.js).
        if (window.WcHistory) WcHistory.deleted(gone);
        if (trail.length) { renderKeep(); back(); return; }
        closeEditor();
        renderKeep();
    }

    // Reset App Configuration: the examples back as they came; other wildcards stay.
    function restoreDefaults() {
        const list = read().filter(w => !DEFAULTS.some(d => nameKey(d.name) === nameKey(w.name)));
        write(list.concat(DEFAULTS.map(d => ({ name: d.name, lines: d.lines.slice() }))));
    }
    if (localStorage.getItem(KEY) === null) write(DEFAULTS.map(d => ({ name: d.name, lines: d.lines.slice() })));
    // Examples saved with underscores (before names could have spaces) take the spaced name; prompts using either work.
    else {
        const list = read();
        let renamed = false;
        list.forEach(w => { const d = DEFAULTS.find(x => x.name !== w.name && x.name.replace(/ /g, '_') === w.name); if (d) { w.name = d.name; renamed = true; } });
        if (renamed) write(list);
    }

    function setEnabled(on) {
        localStorage.setItem(ON_KEY, on ? 'true' : 'false');
        paintBoxButtons();
        paintOff();
    }
    // Scene optimization goes with wildcards (style.css: body.wc-off).
    function paintOff() {
        document.body.classList.toggle('wc-off', !enabled());
        // All combinations' Batch Count lock follows (moresettings.js).
        if (window.MoreSettings && MoreSettings.paintCombos) ['xl', 'anima', 'qwen', 'flux', 'krea'].forEach(m => MoreSettings.paintCombos(m));
    }

    // ---- sending to a prompt box ----
    const FAV_KEY = 'bojroWcFavs';
    const FAV_ONLY_KEY = 'bojroWcFavOnly';
    function toggleFavOnly() {
        localStorage.setItem(FAV_ONLY_KEY, localStorage.getItem(FAV_ONLY_KEY) === 'true' ? 'false' : 'true');
        render();
    }
    const favSet = () => { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); } };
    function toggleFav(name, row) {
        const s = favSet(), k = nameKey(name), on = !s.has(k);
        if (on) s.add(k); else s.delete(k);
        localStorage.setItem(FAV_KEY, JSON.stringify([...s]));
        // Only the star changes (the order updates next time); with favourites only, an unstarred row goes.
        const btn = row && row.querySelector('.wc-fav');
        if (!btn) { render(); return; }
        if (!on && localStorage.getItem(FAV_ONLY_KEY) === 'true') {
            row.remove();
            if (!document.querySelector('#wcList .wc-row')) render();
            return;
        }
        btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        const svg = btn.querySelector('svg'); if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
    }
    // The prompt or negative box wildcards go to: the last one used on the tab in view, else its prompt.
    const BOX_RE = /^(xl|anima|qwen|flux|krea|inp)_(prompt|neg)$/;
    let lastBox = null;
    document.addEventListener('focusin', e => { const t = e.target; if (t && t.tagName === 'TEXTAREA' && (BOX_RE.test(t.id) || t.closest('[id^="fc-"][id$="-regions"]'))) lastBox = t; }, true);
    function target() {
        if (origin && origin.isConnected && origin.offsetParent) return origin;
        const mode = typeof currentMode !== 'undefined' ? currentMode : 'xl';
        if (lastBox && lastBox.isConnected && lastBox.offsetParent && (lastBox.id.startsWith(mode + '_') || lastBox.closest(`#fc-${mode}-regions`))) return lastBox;
        return document.getElementById(`${mode === 'img2img' ? 'inp' : mode}_prompt`);
    }
    // __name__ (with a filter or values) in a text; spaces and underscores alike, any case.
    const tokenFor = name => new RegExp(`__${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ _]+/g, '[ _]+')}(?:\\([^()\\n]*=[^()\\n]*\\))?(?:\\[[^\\[\\]\\n]*\\])?__`, 'i');
    const inBox = (name, text) => tokenFor(name).test(String(text || ''));
    // A tap: in the box, it comes out (as a tag of its own); otherwise it goes in at the end.
    function send(name) {
        const el = target();
        if (!el) return;
        const re = tokenFor(name);
        if (re.test(el.value)) {
            const tag = new RegExp(`(^|,|\\n)[ \\t]*${re.source}[ \\t]*(?=,|\\n|$)`, 'gi');
            const next = el.value.replace(tag, '$1').replace(/^[\s,]+/, '').replace(/,[ \t]*(?=,)/g, '').replace(/\n[ \t]*,/g, '\n');
            if (next === el.value) { if (typeof Toast !== 'undefined') Toast.show({ text: "It's inside other text: edit the box to take it out", duration: 'short' }); return; }
            el.value = withTrailingComma(next);
        } else {
            el.value = withTrailingComma(el.value) + `__${name}__, `;
            noteUsed([name]);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        render();
    }

    // ---- the wildcard button in the prompt and negative boxes ----
    const BOX_IDS = ['xl_prompt', 'xl_neg', 'anima_prompt', 'anima_neg', 'flux_prompt', 'qwen_prompt', 'qwen_neg', 'krea_prompt', 'krea_neg', 'inp_prompt', 'inp_neg'];
    const WC_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h5M15 19h5"/><path d="M8 5C6 5 5 6 5 8v1.5C5 11 4 12 3 12c1 0 2 1 2 2.5V16"/><path d="M16 5c2 0 3 1 3 3v1.5c0 1.5 1 2.5 2 2.5-1 0-2 1-2 2.5V16"/></svg>';
    function paintBoxButtons() {
        const regions = [...document.querySelectorAll('[id^="fc-"][id$="-regions"] textarea.fc-text')];
        BOX_IDS.map(id => document.getElementById(id)).concat(regions).forEach(ta => {
            if (!ta) return;
            const id = ta.id;
            let wrap = ta.parentElement.classList.contains('wc-box') ? ta.parentElement : null;
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'wc-box';
                ta.parentNode.insertBefore(wrap, ta);
                wrap.appendChild(ta);
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'wc-box-btn';
                b.title = 'Wildcards';
                b.setAttribute('aria-label', 'Wildcards');
                b.innerHTML = WC_ICON;
                b.onclick = e => { e.preventDefault(); lastBox = ta; Wildcards.open(); };
                wrap.appendChild(b);
            }
            const on = enabled();
            wrap.classList.toggle('wc-box-on', on);
        });
    }
    function paintConfig() {
        paintOff();
        paintGenMode();
        const sw = document.getElementById('cfgWildcardsSwitch');
        if (sw) sw.checked = enabled();
        const seeded = document.getElementById('cfgWcSeeded');
        if (seeded) seeded.checked = localStorage.getItem('bojroWcSeeded') === 'true';
        const nr = document.getElementById('cfgWcNoRepeat');
        if (nr) nr.checked = localStorage.getItem('bojroWcNoRepeat') !== 'false';
        const cap = document.getElementById('cfgWcComboCap');
        if (cap) cap.value = String(comboCap());
        const cj = document.getElementById('cfgWcComboJobs');
        if (cj) cj.value = String(comboJobs());
        const blocks = document.getElementById('cfgNegBlocks');
        if (blocks) blocks.checked = localStorage.getItem('bojroNegBlocks') !== 'false';
    }
    document.addEventListener('DOMContentLoaded', () => {
        paintConfig();
        paintBoxButtons();
        // Inpaint / img2img's checkpoint decides theirs.
        document.addEventListener('change', e => { if (e.target && /^(inp|img2img)_modelSelect$/.test(e.target.id || '')) paintBoxButtons(); });
        document.getElementById('inp_prompt')?.addEventListener('focus', paintBoxButtons);
        setInterval(() => { if (!document.hidden) paintBoxButtons(); }, 2000);
        document.getElementById('wcEditorText')?.addEventListener('input', paintCount);
        const nameEl = document.getElementById('wcEditorName');
        nameEl?.addEventListener('input', fitName);
        // Leaving the box shows the name as it will be saved (lower case); SAVE saves it.
        nameEl?.addEventListener('blur', () => { const v = nameEl.value.toLowerCase(); if (v !== nameEl.value) { nameEl.value = v; fitName(); } });
    });

    window.Wildcards = {
        editNested, back, closeX,
        cancelSelect, deleteSelected, toggleSelectAll, selecting: () => (selecting ? [...selecting] : null),
        comboCount, comboAbort, comboReset, comboCap, setComboCap, comboJobs, setComboJobs, comboAsk, comboJobsOf, setGenMode,
        // A-Z in the editor: options by their text (not a leading 3:: or ?cond::), # lines kept first.
        sortOptions: () => {
            const t = document.getElementById('wcEditorText');
            const ls = t.value.split('\n').map(l => l.trim()).filter(Boolean);
            const key = l => l.replace(/^\d+(?:\.\d+)?\s*::\s*/, '').replace(/^\?[^:]*(?::(?!:)[^:]*)*::\s*/, '').replace(/^[{(\[]+/, '').toLowerCase();
            const head = ls.filter(l => l.startsWith('#')), rest = ls.filter(l => !l.startsWith('#')).sort((a, b) => COLLATE.compare(key(a), key(b)));
            t.value = head.concat(rest).join('\n');
            t.dispatchEvent(new Event('input', { bubbles: true }));
        },
        groupsOf, groupsOn: () => groupsOn(), favKeys: () => [...favSet()],
        defaults: () => DEFAULTS.map(d => ({ name: d.name, lines: d.lines.slice(), ...(d.inOrder ? { inOrder: true } : {}) })),
        parts, explain, suggest, noteUsed, send, toggleFav, paintBoxButtons, problemText: p => (PROBLEM[p.type] || (n => n))(p.name), restoreDefaults, resolveText: (t, memo = new Map()) => resolveText(t, library(), memo), enabled, setEnabled,
        open: from => { open(from); if (window.WcAdvanced) WcAdvanced.paint(); }, close, render, clearSearch, toggleSearchOptions, toggleFavOnly, toggleGroups, edit, closeEditor, save, remove, generate, setOrder, saveModel, toggleSettings: () => document.getElementById('wcSettingsBox').classList.toggle('hidden'),
        // Scene optimization (scene.js)
        _parts: { lib: () => library(), read, nameKey, byName, weighted, weightedPick, resolveText, MAX_DEPTH, tokenRe: () => new RegExp(TOKEN.source, 'g'), hasToken: t => new RegExp(TOKEN.source).test(t) },
        // Backup & Restore (backup.js)
        backupList: read, restoreList: list => write(list.filter(w => w && typeof w.name === 'string' && Array.isArray(w.lines))),
        // The Advanced view (wcadvanced.js)
        _lib: { read, write },
        // Versions (wchistory.js): the wildcard being edited; a version put in the editor to save.
        _editing: () => editing,
        _load: w => {
            document.getElementById('wcEditorName').value = w.name;
            const t = document.getElementById('wcEditorText');
            t.value = w.lines.join('\n');
            t.dispatchEvent(new Event('input', { bubbles: true }));
            setOrder(w.inOrder ? 'inorder' : 'random');
            fitName();
        }
    };
})();
