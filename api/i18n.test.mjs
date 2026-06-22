import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const allowedUntranslatedUi = new Set([
  "*, printer.*, queue.status",
  "Promise",
  "email@studio.test",
  "layerpilot",
  "mqtt://broker.local:1883"
]);

function extractTranslationKeys(source) {
  const match = source.match(/const zhTwTranslations[\s\S]*?= \{([\s\S]*?)\};/);
  expect(match).toBeTruthy();
  return new Set([...match[1].matchAll(/\n\s*"((?:\\.|[^"])*)"\s*:/g)].map((item) => item[1]));
}

function stripMarketingSite(source) {
  return source.replace(new RegExp("function MarketingSite[\\s\\S]*?\\nfunction AuthScreen"), "function AuthScreen");
}

function collectVisibleEnglish(source) {
  const candidates = new Set();
  const patterns = [
    />\s*([A-Z][A-Za-z0-9 ,/()'&.:-]{2,100})\s*</g,
    /(?:title|placeholder|aria-label)="([^"{}]{2,100})"/g,
    /<PanelTitle\s+title="([^"]+)"/g,
    /addToast\("([^"]{2,130})"/g
  ];
  const ignored = /^(https?:|[A-Z]{2,5}$|\d|\$|Asia\/|America\/|Europe\/|LP-|queue:|printer\.|order\.)/;
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1].trim();
      if (!value || ignored.test(value)) continue;
      candidates.add(value);
    }
  }
  return candidates;
}

describe("Traditional Chinese UI translations", () => {
  it("covers visible static UI text that the DOM language switcher can translate", async () => {
    const source = stripMarketingSite(await readFile(new URL("../src/App.tsx", import.meta.url), "utf8"));
    const translated = extractTranslationKeys(source);
    const visibleEnglish = collectVisibleEnglish(source);
    const missing = [...visibleEnglish]
      .filter((text) => !translated.has(text))
      .filter((text) => !allowedUntranslatedUi.has(text))
      .sort();

    expect(missing).toEqual([]);
  });

  it("offers English, Traditional Chinese, and Simplified Chinese language modes", async () => {
    const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(source).toContain('type Language = "en" | "zh-TW" | "zh-CN"');
    expect(source).toContain('<option value="zh-TW">繁體中文</option>');
    expect(source).toContain('<option value="zh-CN">简体中文</option>');
    expect(source).toContain("zhCnTranslations");
    expect(source).toContain("document.documentElement.lang = language");
  });
});
