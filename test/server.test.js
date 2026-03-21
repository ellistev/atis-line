const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatMetarForSpeech } = require('../server');

describe('formatMetarForSpeech', () => {
  it('returns null for null metar', () => {
    assert.equal(formatMetarForSpeech(null, 'Test'), null);
  });

  it('expands cloud abbreviations', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM FEW040 BKN100',
      'Pitt Meadows',
    );
    assert.ok(speech.includes('few clouds at'));
    assert.ok(speech.includes('broken clouds at'));
  });

  it('preserves raw wind token when KT is attached to digits', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR',
      'Test',
    );
    assert.ok(speech.includes('27015KT'));
  });

  it('expands P6SM', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR',
      'Test',
    );
    assert.ok(speech.includes('greater than 6 statute miles'));
  });

  it('expands weather phenomena', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT 3SM RA BR BKN020',
      'Test',
    );
    assert.ok(speech.includes('rain'));
    assert.ok(speech.includes('mist'));
  });

  it('expands sky clear', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR',
      'Test',
    );
    assert.ok(speech.includes('clear skies'));
  });

  it('expands CAVOK', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT CAVOK',
      'Test',
    );
    assert.ok(speech.includes('ceiling and visibility okay'));
  });

  it('expands NOSIG', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR NOSIG',
      'Test',
    );
    assert.ok(speech.includes('no significant change'));
  });

  it('handles altimeter', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR A3012',
      'Test',
    );
    assert.ok(speech.includes('altimeter 3012'));
  });

  it('marks remarks section', () => {
    const speech = formatMetarForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR RMK CU2',
      'Test',
    );
    assert.ok(speech.includes('Remarks:'));
  });
});
