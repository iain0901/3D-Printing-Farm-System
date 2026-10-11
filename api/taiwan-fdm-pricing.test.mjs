import { describe, it, expect } from 'vitest';
import { computeAutoQuote, taiwanFdmQuoteConfig } from './pricing-engine.mjs';
describe('owner-approved Taiwan FDM quotation policy', () => {
 it('charges the order minimum once and includes five percent tax', () => {
  const quote = computeAutoQuote(taiwanFdmQuoteConfig, {scope:'order',grams:10.82,minutes:18.633,quantity:3,material:'PLA'});
  expect(quote.currency).toBe('TWD');expect(quote.total).toBe(210);expect(quote.input.totalGrams).toBe(10.8);
 });
 it('prices TPU through its explicit sale-rate multiplier', () => {
  const quote = computeAutoQuote(taiwanFdmQuoteConfig, {scope:'order',grams:200,minutes:10,quantity:1,material:'TPU'});
  expect(quote.total).toBe(Math.round(200*3.6*(6.5/4)*1.05));
 });
 it('uses machine time when it exceeds material and minimum', () => {
  const quote = computeAutoQuote(taiwanFdmQuoteConfig, {scope:'order',grams:10,minutes:480,quantity:1,material:'PLA'});
  expect(quote.total).toBe(Math.round((480/60)*80*1.05));
 });
});
