require('./src/data/aeroview').scrapeAeroview('CYPK')
  .then(r => console.log(r ? r.letter + ': ' + r.raw.substring(0,80) : 'null'))
  .catch(e => console.error('FAIL:', e.message));
