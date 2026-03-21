// Sign-offs, jokes, and personality content for the ATIS line

const SIGN_OFFS = [
  'Fly safe out there.',
  'Check your NOTAMs, and have a good flight.',
  'Blue skies... or at least that\'s the forecast.',
  'Happy landings.',
  'Keep the shiny side up.',
  'Winds be with you.',
];

const AVIATION_JOKES = [
  'What do you call a pregnant flight attendant? Pilot error.',
  'Why did the student pilot fail their exam? Because they kept winging it.',
  'What\'s the difference between a pilot and a jet engine? The jet engine stops whining when you shut it off.',
  'A good landing is one you walk away from. A great landing is one where you can use the airplane again.',
  'How do you know if a pilot is at your party? Don\'t worry, they\'ll tell you.',
  'What\'s the purpose of a propeller? To keep the pilot cool. Don\'t believe me? Turn it off and watch them sweat.',
];

const ABOUT_TEXT =
  'This is a community project built by GA pilots for GA pilots. ' +
  'When NAV CANADA retired the phone based ATIS for the Lower Mainland, we decided to bring it back ourselves. ' +
  'We pull weather data from public sources and read it back in a format pilots are used to. ' +
  'It\'s not official, but it\'s made with love and a healthy respect for good weather briefings. ' +
  'Thanks for calling, and tell your flying buddies about us.';

function getRandomSignOff() {
  return SIGN_OFFS[Math.floor(Math.random() * SIGN_OFFS.length)];
}

function getRandomJoke() {
  return AVIATION_JOKES[Math.floor(Math.random() * AVIATION_JOKES.length)];
}

module.exports = {
  SIGN_OFFS,
  AVIATION_JOKES,
  ABOUT_TEXT,
  getRandomSignOff,
  getRandomJoke,
};
