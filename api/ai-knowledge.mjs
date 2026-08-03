const clean = (value) => String(value || "").trim();

export function normalizeAiKnowledge(item = {}) {
  return {
    id: clean(item.id),
    title: clean(item.title).slice(0, 160),
    content: clean(item.content).slice(0, 6000),
    category: clean(item.category || "general").slice(0, 80),
    tags: Array.isArray(item.tags) ? [...new Set(item.tags.map((tag) => clean(tag).toLowerCase()).filter(Boolean))].slice(0, 20) : [],
    enabled: item.enabled !== false
  };
}

function queryTerms(input = "") {
  const plain = clean(input).toLowerCase();
  const words = plain.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 2);
  const cjk = plain.match(/[\u3400-\u9fff]{2,}/g) || [];
  return [...new Set([...words, ...cjk])].slice(0, 30);
}

export function findRelevantAiKnowledge(items = [], input = "", maxItems = 4) {
  const terms = queryTerms(input);
  return (items || [])
    .map(normalizeAiKnowledge)
    .filter((item) => item.enabled && item.title && item.content)
    .map((item) => {
      const searchable = `${item.title}\n${item.category}\n${item.tags.join(" ")}\n${item.content}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? (item.tags.includes(term) ? 4 : 1) : 0), 0);
      return { ...item, score };
    })
    .filter((item) => !terms.length || item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh-Hant"))
    .slice(0, maxItems)
    .map(({ score, ...item }) => item);
}
