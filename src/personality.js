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
  // Classic one-liners
  'What\'s the difference between a pilot and a jet engine? The jet engine stops whining when you shut it off.',
  'How do you know if a pilot is at your party? Don\'t worry, they\'ll tell you.',
  'What\'s the purpose of a propeller? To keep the pilot cool. Don\'t believe me? Turn it off and watch them sweat.',
  'A good landing is one you walk away from. A great landing is one where you can use the airplane again.',
  'Why did the student pilot fail his exam? Because he kept winging it.',
  'What do you call a pregnant flight attendant? Pilot error.',
  'What\'s the difference between God and a pilot? God doesn\'t think he\'s a pilot.',
  'How many pilots does it take to change a light bulb? Just one. He holds the bulb and the world revolves around him.',
  'Why do pilots make bad fishermen? They always tell the truth about how big the catch was.',
  'What do you call a pilot who doesn\'t make checklists? Brave. Or a co-pilot.',
  // ATC classics
  'Tower: "Cessna 152, what are your intentions?" Pilot: "To get my instrument rating and never have to talk to you again."',
  'Pilot: "Approach, Cessna 1234 with you at ten thousand, request lower." ATC: "Why?" Pilot: "Because I\'d like to land eventually."',
  'Tower: "What\'s your ETA?" Pilot: "Uh... Tuesday?" Tower: "Say again?" Pilot: "I\'m having a really long Monday."',
  'ATC: "Say altitude." Pilot: "Altitude." ATC: "Say airspeed." Pilot: "Airspeed." ATC: "Say heading." Pilot: "Heading." ATC: "Please disregard all previous transmissions and land immediately."',
  // Weather
  'What\'s a pilot\'s favorite weather? CAVU. Ceiling and visibility... absolutely unfair to golfers.',
  'The forecast said VFR. The weather said otherwise. The METAR just shrugged.',
  'There are old pilots and bold pilots. There are no old, bold pilots. There are, however, plenty of bold retired accountants who became pilots.',
  // Canadian aviation
  'Why do Canadian pilots always sound so calm on the radio? Because "sorry" has a very soothing effect, even in an emergency.',
  'A Canadian pilot declared an emergency and ended the call with "sorry for the trouble." NAV CANADA gave him a frequency change.',
  'What do you call a Canadian flying in class B airspace? Very polite and also lost.',
  // Touch and goes
  'How many touch and goes does it take to stay current? Five. How many do you actually do? Seventeen. Just to be sure.',
  'My instructor said my landings were improving. Then he called them "controlled arrivals" and I knew I was in trouble.',
  // Misc
  'Flying is the second greatest thrill known to man. Landing is the first.',
  'The only time you have too much fuel is when you\'re on fire.',
  'Aviation in itself is not inherently dangerous. But to an even greater degree than the sea, it is terribly unforgiving of any carelessness, incapacity, or neglect.',
  'Why is the runway always too short? Because it ends right where you need more of it.',
  'What\'s the most useless thing in aviation? The runway behind you, the altitude above you, and the fuel in the truck.',
  'Preflight checklist item 47: ensure aircraft is still an aircraft.',
  'The FAA regulations are written in blood. The Transport Canada rules are written in blood, then translated into French, then back into English, just to be safe.',
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
