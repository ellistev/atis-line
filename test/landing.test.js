const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { renderLandingPage } = require('../src/pages/landing');

const SAMPLE_AIRPORTS = [
  { region: 'Lower Mainland', regionDigit: '1', icao: 'CYVR', name: 'Vancouver International', digit: '1', source: 'aeroview' },
  { region: 'Lower Mainland', regionDigit: '1', icao: 'CYXX', name: 'Abbotsford', digit: '2', source: 'aeroview' },
  { region: 'Victoria', regionDigit: '2', icao: 'CYYJ', name: 'Victoria International', digit: '1', source: 'aeroview' },
  { region: 'North Coast', regionDigit: '3', icao: 'CYPR', name: 'Prince Rupert', digit: '1', source: 'metar' },
];

const SAMPLE_REGIONS = {
  '1': { region: 'Lower Mainland', airports: [
    { icao: 'CYVR', name: 'Vancouver International', digit: '1', source: 'aeroview' },
    { icao: 'CYXX', name: 'Abbotsford', digit: '2', source: 'aeroview' },
  ]},
  '2': { region: 'Victoria', airports: [
    { icao: 'CYYJ', name: 'Victoria International', digit: '1', source: 'aeroview' },
  ]},
  '3': { region: 'North Coast', airports: [
    { icao: 'CYPR', name: 'Prince Rupert', digit: '1', source: 'metar' },
  ]},
};

describe('landing page', () => {
  const html = renderLandingPage(SAMPLE_AIRPORTS, SAMPLE_REGIONS);

  it('renders valid HTML', () => {
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('contains the phone number with tel: link', () => {
    assert.ok(html.includes('tel:+17782005935'));
    assert.ok(html.includes('+1 (778) 200-5935'));
  });

  it('contains service name and tagline', () => {
    assert.ok(html.includes('ATIS Line'));
    assert.ok(html.includes('Free phone-based aviation weather for Canadian pilots'));
  });

  it('contains all regions', () => {
    assert.ok(html.includes('Lower Mainland'));
    assert.ok(html.includes('Victoria'));
    assert.ok(html.includes('North Coast'));
  });

  it('contains all airport ICAO codes', () => {
    assert.ok(html.includes('CYVR'));
    assert.ok(html.includes('CYXX'));
    assert.ok(html.includes('CYYJ'));
    assert.ok(html.includes('CYPR'));
  });

  it('includes responsive viewport meta tag', () => {
    assert.ok(html.includes('viewport'));
    assert.ok(html.includes('width=device-width'));
  });

  it('includes data source info', () => {
    assert.ok(html.includes('NAV CANADA'));
    assert.ok(html.includes('Aeroview'));
    assert.ok(html.includes('METAR'));
  });

  it('includes update frequency info', () => {
    assert.ok(html.includes('every 15 minutes'));
    assert.ok(html.includes('hourly'));
  });

  it('includes coming soon note', () => {
    assert.ok(html.includes('More regions coming soon'));
  });

  it('includes analytics link', () => {
    assert.ok(html.includes('/analytics'));
  });

  it('includes footer text', () => {
    assert.ok(html.includes('Built for pilots, by pilots'));
  });

  it('shows source badges for each region', () => {
    assert.ok(html.includes('D-ATIS'));
    assert.ok(html.includes('METAR'));
  });
});
