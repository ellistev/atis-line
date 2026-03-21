const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { getAtisLetter, metarToSpeech } = require('../server-simple');

describe('getAtisLetter', () => {
  it('returns Alpha for first observation', () => {
    const letter = getAtisLetter('ZZZZ', 'METAR ZZZZ 010000Z 00000KT');
    assert.equal(letter, 'Alpha');
  });

  it('returns same letter for unchanged METAR', () => {
    const metar = 'METAR TEST 010000Z 27015KT';
    const first = getAtisLetter('TEST', metar);
    const second = getAtisLetter('TEST', metar);
    assert.equal(first, second);
  });

  it('advances letter when METAR changes', () => {
    const first = getAtisLetter('ADVN', 'METAR ADVN 010000Z 27015KT');
    const second = getAtisLetter('ADVN', 'METAR ADVN 010100Z 27010KT');
    assert.equal(first, 'Alpha');
    assert.equal(second, 'Bravo');
  });
});

describe('metarToSpeech', () => {
  it('returns null for null metar', () => {
    assert.equal(metarToSpeech(null, 'Test', 'Alpha'), null);
  });

  it('includes airport name and ATIS letter', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT P6SM FEW040 BKN100 18/12 A3012 RMK CU2SC4',
      'Pitt Meadows',
      'Bravo',
    );
    assert.ok(speech.includes('Pitt Meadows information Bravo'));
  });

  it('expands P6SM', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT P6SM FEW040',
      'Test', 'Alpha',
    );
    assert.ok(speech.includes('visibility greater than 6'));
  });

  it('includes observation time', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT P6SM CLR',
      'Test', 'Alpha',
    );
    assert.ok(speech.includes('1953 zulu'));
  });

  it('expands cloud layers', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT P6SM FEW040 BKN100',
      'Test', 'Alpha',
    );
    assert.ok(speech.includes('few clouds at 4000 feet'));
    assert.ok(speech.includes('ceiling broken 10000 feet'));
  });

  it('strips remarks', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT P6SM CLR RMK CU2SC4 SLP012',
      'Test', 'Alpha',
    );
    assert.ok(!speech.includes('RMK'));
    assert.ok(!speech.includes('SLP012'));
  });

  it('expands weather phenomena', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT 3SM RA BR BKN020',
      'Test', 'Alpha',
    );
    assert.ok(speech.includes('rain'));
    assert.ok(speech.includes('mist'));
  });

  it('includes advise-on-contact message', () => {
    const speech = metarToSpeech(
      'METAR CYPK 181953Z 27015KT P6SM CLR',
      'Test', 'Charlie',
    );
    assert.ok(speech.includes('Advise on initial contact you have information Charlie'));
  });
});
