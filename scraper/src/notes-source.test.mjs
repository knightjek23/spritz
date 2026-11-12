// Run: node src/notes-source.test.mjs
import assert from "node:assert/strict";
import {
  searchKey, htmlToText, looksBlocked, excerptAroundNotes, groundNotes, pageStatesTiers,
  parseConcentration, checkVariant, nameMatches, classifySource, robotsAllows,
} from "./notes-source.ts";
import { normalizeNote, isDescriptor, compareNotes } from "./notes-compare.ts";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };

const TIERED = `<html><head><title>Sauvage Eau de Toilette | Example Store</title>
<style>.a{color:red}</style><script>var notes = "Oud, Civet";</script></head><body>
<h1>Dior Sauvage Eau de Toilette</h1>
<p>Fragrance notes</p><ul><li>Top notes: Calabrian Bergamot, Pepper</li>
<li>Heart notes: Sichuan Pepper, Lavender &amp; Geranium</li>
<li>Base notes: Ambroxan, Cedar, Labdanum</li></ul>
<script type="application/ld+json">{"description":"A fresh scent with V\\u00e9tiver and \\"Elemi\\"."}</script>
</body></html>`;
const FLAT = `<html><head><title>Bleu de Chanel Eau de Parfum - CHANEL</title></head><body>
<p>An aromatic-woody fragrance. Key notes: cedar, New Caledonian sandalwood. A powerful trail.</p></body></html>`;

t("searchKey", () => {
  assert.equal(searchKey("Vétiver & Ylang-Ylang!"), "vetiver ylang ylang");
});
t("htmlToText: title, entities, scripts dropped, ld+json kept", () => {
  const p = htmlToText(TIERED);
  assert.equal(p.title, "Sauvage Eau de Toilette | Example Store");
  assert.ok(p.text.includes("Lavender & Geranium"));
  assert.ok(!p.text.includes("Civet"), "plain <script> content must not count as page text");
  assert.ok(p.text.includes("Elemi"), "ld+json description is page content");
});
t("looksBlocked", () => {
  assert.equal(looksBlocked(403, "x".repeat(5000)), true);
  assert.equal(looksBlocked(200, "tiny"), true);
  assert.equal(looksBlocked(200, "<html><title>Just a moment...</title>" + "x".repeat(5000)), true);
  assert.equal(looksBlocked(200, "<html><title>Sauvage</title>" + "x".repeat(5000)), false);
});
t("excerptAroundNotes finds the notes section, empty when none", () => {
  assert.ok(excerptAroundNotes(htmlToText(TIERED).text).includes("Ambroxan"));
  assert.equal(excerptAroundNotes("A page about shipping and returns."), "");
});
t("groundNotes keeps only words on the page", () => {
  const page = htmlToText(TIERED).text;
  const g = groundNotes(["Calabrian Bergamot", "pepper", "Sichuan pepper", "Oud", "Nutmeg", "Lavender"], page);
  assert.deepEqual(g.kept, ["Calabrian Bergamot", "pepper", "Sichuan pepper", "Lavender"]);
  assert.deepEqual(g.dropped, ["Oud", "Nutmeg"]);
});
t("groundNotes matches whole words only", () => {
  assert.deepEqual(groundNotes(["Rose", "Amber"], "notes of rosewood and ambergris").kept, []);
});
t("pageStatesTiers", () => {
  assert.equal(pageStatesTiers(htmlToText(TIERED).text), true);
  assert.equal(pageStatesTiers(htmlToText(FLAT).text), false);
  assert.equal(pageStatesTiers("Notes - Top: lemon. Middle: rose. Base: musk."), true);
  assert.equal(pageStatesTiers("Our top seller. Key notes: lemon, rose."), false);
});
t("parseConcentration", () => {
  assert.equal(parseConcentration("Sauvage Eau de Parfum"), "edp");
  assert.equal(parseConcentration("sauvage-eau-de-toilette-spray"), "edt");
  assert.equal(parseConcentration("Baccarat Rouge 540 Extrait de Parfum"), "extrait");
  assert.equal(parseConcentration("Sauvage Parfum"), "parfum");
  assert.equal(parseConcentration("Sauvage"), null);
});
t("checkVariant: the pilot's wrong-page cases are rejected", () => {
  const edt = { name: "Sauvage", concentration: "edt", concentrations: ["edt"] };
  assert.equal(checkVariant(edt, "Sauvage Eau de Parfum | DIOR", "https://dior.com/sauvage-eau-de-parfum-F078522009.html"), "mismatch");
  assert.equal(checkVariant(edt, "Sauvage Eau de Toilette | DIOR", "https://dior.com/x"), "ok");
  assert.equal(checkVariant(edt, "Sauvage | DIOR", "https://dior.com/sauvage"), "ok");
});
t("checkVariant: row with no strength on record is unconfirmed, name counts", () => {
  const none = { name: "Sauvage", concentration: null, concentrations: [] };
  assert.equal(checkVariant(none, "Sauvage Eau de Parfum", "https://dior.com/x"), "unconfirmed");
  const named = { name: "Sauvage Eau de Parfum", concentration: null, concentrations: null };
  assert.equal(checkVariant(named, "Sauvage Eau de Parfum", "https://dior.com/x"), "ok");
  const multi = { name: "Bleu de Chanel", concentration: "edt", concentrations: ["edt", "edp"] };
  assert.equal(checkVariant(multi, "Bleu de Chanel Eau de Parfum", "https://chanel.com/x"), "ok");
});
t("nameMatches", () => {
  assert.equal(nameMatches("Tobacco Vanille", "Tobacco Vanille Eau de Parfum | TOM FORD", "https://x.com/p"), true);
  assert.equal(nameMatches("Ombré Leather (2018)", "Ombre Leather Eau de Parfum", "https://x.com/p"), true);
  assert.equal(nameMatches("Tobacco Vanille", "Oud Wood Eau de Parfum | TOM FORD", "https://x.com/oud-wood"), false);
  assert.equal(nameMatches("Green Irish Tweed", "Aventus | Creed", "https://creedboutique.com/products/aventus"), false);
});
t("classifySource is decided from the URL", () => {
  assert.equal(classifySource("https://www.sephora.com/product/x", "Dior"), "retailer");
  assert.equal(classifySource("https://shop.nordstrom.com/s/x", "Dior"), "retailer");
  assert.equal(classifySource("https://www.dior.com/en_us/beauty/x", "Dior"), "brand");
  assert.equal(classifySource("https://creedboutique.com/products/aventus", "Creed"), "brand");
  assert.equal(classifySource("https://www.franciskurkdjian.com/us-en/p/x", "Maison Francis Kurkdjian"), "brand");
  assert.equal(classifySource("https://parfums-de-marly.com/products/layton", "Parfums de Marly"), "brand");
  assert.equal(classifySource("https://www.hermes.com/us/en/product/x", "Hermès"), "brand");
  assert.equal(classifySource("https://www.giorgioarmanibeauty.com/us/x", "Giorgio Armani"), "brand");
  assert.equal(classifySource("https://www.tomfordbeauty.com/products/x", "Tom Ford"), "brand");
  assert.equal(classifySource("https://www.fragrantica.com/perfume/Dior/x", "Dior"), null);
  assert.equal(classifySource("https://www.fragrancenet.com/x", "Dior"), "retailer");
  assert.equal(classifySource("https://www.fragrancex.com/x", "Dior"), null);
  assert.equal(classifySource("https://someblog.com/dior-sauvage-review", "Dior"), null);
});
t("robotsAllows", () => {
  const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\nDisallow: /search*\nAllow: /search/help\n";
  assert.equal(robotsAllows(robots, "/products/aventus"), true);
  assert.equal(robotsAllows(robots, "/cart/add"), false);
  assert.equal(robotsAllows(robots, "/search?q=x"), false);
  assert.equal(robotsAllows(robots, "/search/help"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "/anything"), false);
  assert.equal(robotsAllows("", "/anything"), true);
});
t("normalizer: the pilot's false differences now agree", () => {
  assert.equal(normalizeNote("Papua New Guinean vanilla extract"), "vanilla");
  assert.equal(normalizeNote("New Caledonian sandalwood"), "sandalwood");
  assert.equal(normalizeNote("Cocoa"), normalizeNote("Cacao"));
  assert.equal(normalizeNote("lychee"), normalizeNote("Litchi"));
  assert.equal(normalizeNote("Guaiacwood"), normalizeNote("Guaiac Wood"));
  assert.equal(normalizeNote("Mandarin"), normalizeNote("Mandarin Orange"));
  assert.equal(normalizeNote("jasmine from Grasse"), "jasmine");
  assert.equal(normalizeNote("May rose from Grasse"), "rose");
  assert.equal(normalizeNote("jasmine petals"), "jasmine");
  assert.equal(normalizeNote("Spice Notes"), normalizeNote("Spicy Notes"));
  assert.equal(normalizeNote("oak moss"), normalizeNote("Oakmoss"));
  assert.equal(normalizeNote("Sichuan Pepper"), "sichuan pepper");
});
t("isDescriptor: marketing phrases are not notes, real notes are", () => {
  for (const d of ["bright citrus top notes", "dry woody tones", "woody ambery musky accord", "ambery notes", "a powerful trail"])
    assert.equal(isDescriptor(d), true, d);
  for (const n of ["Bergamot", "Pink Pepper", "Woody Notes", "Lily-of-the-Valley", "Ambergris Accord", "Papua New Guinean vanilla extract"])
    assert.equal(isDescriptor(n), false, n);
});
t("end to end on a tiered page: grounded notes match the stored row", () => {
  const page = htmlToText(TIERED).text;
  const src = {
    top: groundNotes(["Calabrian Bergamot", "Pepper"], page).kept,
    mid: groundNotes(["Sichuan Pepper", "Lavender", "Geranium"], page).kept,
    base: groundNotes(["Ambroxan", "Cedar", "Labdanum"], page).kept,
    flat: [],
  };
  const stored = {
    top: [{ name: "Bergamot" }, { name: "Pepper" }],
    mid: [{ name: "Sichuan Pepper" }, { name: "Lavender" }, { name: "Geranium" }],
    base: [{ name: "Ambroxan" }, { name: "Cedarwood" }, { name: "Labdanum" }],
  };
  const r = compareNotes(stored, src);
  assert.equal(r.outcome, "match");
  assert.equal(r.tiersVerified, true);
});
console.log(`\n${passed} tests passed`);
