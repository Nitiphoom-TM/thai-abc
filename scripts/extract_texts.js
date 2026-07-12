// Extracts every spoken-text string from index.html's data arrays without needing a DOM.
// Each `const NAME = [ ... ];` / `const NAME = "...";` block is self-contained (only string/array/object
// literals) so we can safely eval each one in isolation once we slice it out by bracket-matching.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function extractConst(name) {
  const re = new RegExp("const\\s+" + name + "\\s*=\\s*");
  const m = re.exec(src);
  if (!m) throw new Error("not found: " + name);
  let j = m.index + m[0].length;
  // scalar (string) case: starts with a quote, ends at the matching quote + ';'
  if (src[j] === '"') {
    const end = src.indexOf('";', j);
    return JSON.parse(src.slice(j, end + 1));
  }
  // array/object case: bracket-match [ ... ] or { ... }
  const open = src[j];
  const close = open === "[" ? "]" : "}";
  let depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === open) depth++;
    else if (src[k] === close) { depth--; if (depth === 0) { k++; break; } }
  }
  const literal = src.slice(j, k);
  // eslint-disable-next-line no-eval
  return eval("(" + literal + ")");
}

const CHILD_NAME = extractConst("CHILD_NAME");
const LETTERS = extractConst("LETTERS");
const ANIMALS = extractConst("ANIMALS");
const VEHICLES = extractConst("VEHICLES");
const VOWELS = extractConst("VOWELS");
const ALPHA = extractConst("ALPHA");
const TH_WORD = extractConst("TH_WORD");
const EN_WORD = extractConst("EN_WORD");
const TRAVEL = extractConst("TRAVEL");
const BODY = extractConst("BODY");
const TABLE = extractConst("TABLE");
const DAILY = extractConst("DAILY");
const INSTRUMENTS = extractConst("INSTRUMENTS");
const NATURE = extractConst("NATURE");
const FRUITS = extractConst("FRUITS");
const JOBS = extractConst("JOBS");
const COLORS = extractConst("COLORS");
const CARJOBS = extractConst("CARJOBS");
const ITEMJOBS = extractConst("ITEMJOBS");
const COOK_INGS = extractConst("COOK_INGS");
const COOK_RECIPES = extractConst("COOK_RECIPES");
// PRAISE_TIERS references CHILD_NAME via string concatenation in source; eval with it in scope
const PRAISE_TIERS = (function () {
  const literal = (function () {
    const re = /const\s+PRAISE_TIERS\s*=\s*/;
    const m = re.exec(src);
    let j = m.index + m[0].length;
    let depth = 0, k = j;
    for (; k < src.length; k++) {
      if (src[k] === "[") depth++;
      else if (src[k] === "]") { depth--; if (depth === 0) { k++; break; } }
    }
    return src.slice(j, k);
  })();
  // eslint-disable-next-line no-eval
  return eval(literal);
})();

const out = { th: new Set(), en: new Set() };
const add = (set, s) => { if (s && String(s).trim()) set.add(String(s)); };

LETTERS.forEach(x => add(out.th, x.say));
ANIMALS.forEach(x => add(out.th, x.n));
VEHICLES.forEach(x => add(out.th, x.n));
VOWELS.forEach(v => add(out.th, v));
ALPHA.forEach(a => add(out.en, a.L + ". " + a.w));
TH_WORD.forEach(w => add(out.th, w));
EN_WORD.forEach(w => add(out.en, w));
TRAVEL.forEach(x => add(out.th, x.n));
BODY.forEach(x => add(out.th, x.n));
TABLE.forEach(x => add(out.th, x.n));
DAILY.forEach(x => add(out.th, x.n));
INSTRUMENTS.forEach(x => add(out.th, x.n));
NATURE.forEach(x => add(out.th, x.n));
FRUITS.forEach(x => add(out.th, x.n));
JOBS.forEach(x => add(out.th, x.n));
COLORS.forEach(x => add(out.th, x.n));
CARJOBS.forEach(x => { add(out.th, x.n); add(out.th, x.use); });
ITEMJOBS.forEach(x => { add(out.th, x.n); add(out.th, x.use); });
COOK_INGS.forEach(x => add(out.th, x.n));
COOK_RECIPES.forEach(x => add(out.th, x.n));
PRAISE_TIERS.forEach(tier => tier.forEach(m => add(out.th, m)));

// fixed UI/game phrases (static, non-parameterized)
[
  "มาเรียนกันเลย " + CHILD_NAME,
  "ยินดีต้อนรับ" + CHILD_NAME,
  "ทำลายสถิติ",
  "ลองอีกครั้งนะ",
  "ใส่วัตถุดิบก่อนนะ",
  "เลือกวิธีทำก่อนนะ",
  "อร่อยจัง อิ่มแล้ว",
  "รถสวยมากเลย",
  "ไม่อยู่ตรงนี้จ้า ลองอีกที",
  "ลองฟังอีกทีนะ",
  "ลองใหม่นะ",
  "จานสร้างสรรค์พิเศษ",
].forEach(s => add(out.th, s));

// peek-a-boo reveal lines ("นี่คือคุณ"+name+"!") for its 12-animal cast
["วัว","สุนัข","แมว","ไก่","เป็ด","หมู","ช้าง","ม้า","สิงโต","กบ","ลิง","แกะ"]
  .forEach(n => add(out.th, "นี่คือคุณ" + n + "!"));

// sound-tap question lines ("ตัวไหนร้อง ... นะ?") for its cast
[["เหมียว เหมียว"],["โฮ่ง โฮ่ง"],["มอ มอ"],["กุ๊ก กุ๊ก"],["ก๊าบ ก๊าบ"],["อู๊ด อู๊ด"],
 ["อ๊บ อ๊บ"],["โฮกกก"],["แปร๊นๆ"],["วี้หว่อ วี้หว่อ"],["ฉึกฉัก ฉึกฉัก"],["ปี๊น ปี๊น"]]
  .forEach(([q]) => add(out.th, "ตัวไหนร้อง \"" + q + "\" นะ? 🤔"));
["แมว","สุนัข","วัว","ไก่","เป็ด","หมู","กบ","สิงโต","ช้าง","รถตำรวจ","รถไฟ","รถยนต์"]
  .forEach(n => add(out.th, "ใช่แล้ว คุณ" + n));

fs.writeFileSync(
  path.join(__dirname, "tts_texts.json"),
  JSON.stringify({ th: [...out.th], en: [...out.en] }, null, 2)
);
console.log("th:", out.th.size, "en:", out.en.size);
