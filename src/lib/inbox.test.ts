import { describe, expect, it } from 'vitest';
import { findMerchantRule, merchantKey, newInboxKey, parseAmount, parseDate, parseInboxText, ruleChoice, type InboxEntry } from './inbox';
import { percentsFor } from './split';
import { HOUSEHOLD, type MerchantRule } from '../types';

describe('inkorgen: belopp', () => {
  it('svenska och engelska format', () => {
    expect(parseAmount('129,00 kr')).toEqual({ amount: 129, currency: null });
    expect(parseAmount('1 299,50 kr').amount).toBe(1299.5);
    expect(parseAmount('1 299,50 kr').amount).toBe(1299.5);
    expect(parseAmount('SEK 129.50').amount).toBe(129.5);
    expect(parseAmount('1,299.00 kr').amount).toBe(1299);
    expect(parseAmount('1.299,00 kr').amount).toBe(1299);
    expect(parseAmount('1.299').amount).toBe(1299);
    expect(parseAmount('85 kr').amount).toBe(85);
  });
  it('känner igen utländsk valuta', () => {
    expect(parseAmount('€12,50')).toEqual({ amount: 12.5, currency: 'EUR' });
    expect(parseAmount('12,50 EUR').currency).toBe('EUR');
    expect(parseAmount('$4.99').currency).toBe('USD');
  });
  it('inget belopp', () => {
    expect(parseAmount('').amount).toBeNull();
    expect(parseAmount('kr').amount).toBeNull();
  });
});

describe('inkorgen: datum', () => {
  it('ISO 8601 och svenskt/engelskt standardformat', () => {
    expect(parseDate('2026-10-25T14:03:00+02:00')).toBe('2026-10-25');
    expect(parseDate('25 okt. 2026 14:03')).toBe('2026-10-25');
    expect(parseDate('3 november 2026')).toBe('2026-11-03');
    expect(parseDate('Oct 25, 2026 at 2:03 PM')).toBe('2026-10-25');
    expect(parseDate('igår')).toBeNull();
  });
});

describe('inkorgen: texten från genvägen', () => {
  it('Belopp;Handlare;Datum', () => {
    expect(parseInboxText('129,00 kr;ICA Nära Hjärtat;2026-10-25T14:03:00+02:00')).toEqual({
      amount: 129,
      currency: null,
      merchant: 'ICA Nära Hjärtat',
      date: '2026-10-25',
    });
  });
  it('handlare med semikolon och saknade delar', () => {
    expect(parseInboxText('50 kr;Bar;Café;2026-10-25').merchant).toBe('Bar;Café');
    expect(parseInboxText('50 kr;Pressbyrån')).toMatchObject({ amount: 50, merchant: 'Pressbyrån', date: null });
    expect(parseInboxText(';;2026-10-25')).toMatchObject({ amount: null, merchant: '', date: '2026-10-25' });
  });
});

describe('inkorgen: minne för handlare', () => {
  const rule = (name: string, lineKey = 'variable:mat', shared = false): MerchantRule => ({
    name,
    lineKey,
    section: 'variable',
    lineName: 'Mat',
    shared,
  });

  it('samma butik ger samma nyckel', () => {
    expect(merchantKey('ICA Nära Hjärtat 1234')).toBe('ica nara hjartat');
    expect(merchantKey('ICA NARA HJARTAT')).toBe('ica nara hjartat');
    expect(merchantKey('  ')).toBe('');
  });
  it('exakt träff och gissning på första ordet', () => {
    const merchants = { [merchantKey('ICA Nära Hjärtat')]: rule('ICA Nära Hjärtat') };
    expect(findMerchantRule(merchants, 'ICA NARA HJARTAT 1234')?.exact).toBe(true);
    expect(findMerchantRule(merchants, 'ICA Kvantum')).toMatchObject({ exact: false });
    expect(findMerchantRule(merchants, 'Coop')).toBeNull();
  });
  it('gissar inte när liknande butiker hamnat olika', () => {
    const merchants = {
      [merchantKey('Pizzeria Roma')]: rule('Pizzeria Roma', 'variable:noje'),
      [merchantKey('Pizzeria Napoli')]: rule('Pizzeria Napoli', 'variable:mat'),
    };
    expect(findMerchantRule(merchants, 'Pizzeria Milano')).toBeNull();
  });
  it('bokför på den som betalade, eller delat enligt sparade andelar', () => {
    const entry: InboxEntry = {
      id: 'x',
      key: 'k',
      raw: '',
      personId: 'b',
      amount: 100,
      currency: null,
      merchant: 'ICA',
      date: '2026-10-25',
    };
    expect(ruleChoice(entry, rule('ICA'), ['a', 'b'], '2026-10-26')).toMatchObject({ target: 'b', percents: undefined });
    const shared = { ...rule('ICA', 'variable:mat', true), split: { a: 40, b: 60 } };
    expect(ruleChoice(entry, shared, ['a', 'b'], '2026-10-26')).toMatchObject({ target: HOUSEHOLD, percents: [40, 60] });
    // Ensam i hushållet: inget att dela med
    expect(ruleChoice({ ...entry, personId: 'a' }, shared, ['a'], '2026-10-26')).toMatchObject({ target: 'a' });
    expect(ruleChoice({ ...entry, amount: null }, shared, ['a', 'b'], '2026-10-26')).toBeNull();
  });
  it('sparade andelar måste gå ihop', () => {
    expect(percentsFor({ a: 40, b: 60 }, ['a', 'b'])).toEqual([40, 60]);
    expect(percentsFor({ a: 40 }, ['a', 'b'])).toBeNull();
    expect(percentsFor({ a: 40, b: 50 }, ['a', 'b'])).toBeNull();
  });
  it('nyckeln är lång nog för reglerna', () => {
    const key = newInboxKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
