import { it, expect } from 'vitest';
import { mayAutoExecute, agentDestinations } from '../frontend-vue/src/utils/agent-destinations.mjs';
it('automates reversible navigation and bounded settings, preserves confirmation for transactions and external MCP', () => {
  expect(agentDestinations['go:free-upload'].upload).toBe(true);
  expect(agentDestinations['go:drafts'].path).toBe('/portal/workspace?section=drafts');
  expect(agentDestinations['go:staff-orders']).toMatchObject({ path: '/orders/index', staff: true });
  expect(mayAutoExecute({ target: 'go:free-upload', operation: 'click' })).toBe(true);
  expect(mayAutoExecute({ target: 'go:orders', operation: 'click', commandId: 'external' })).toBe(false);
  expect(mayAutoExecute({ target: 'fill', operation: 'fill' }, '填充率')).toBe(true);
  for (const label of ['開始列印', '立即付款', '送出訂單', '刪除帳號', '切片']) expect(mayAutoExecute({ operation: 'click' }, label)).toBe(false);
  expect(mayAutoExecute({ operation: 'fill' }, '付款備註')).toBe(false);
});
