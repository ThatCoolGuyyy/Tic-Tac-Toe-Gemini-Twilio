exports.handler = function(context, event, callback) {
  const twilio = require('twilio');
  const twiml = new twilio.twiml.VoiceResponse();

  // twiml.say('Welcome to Tic Tac Toe. Please enter a number between 1 and 9 to make your move.');
  twiml.say('go.');

  twiml.gather({
    numDigits: 1,
    action: '/process-move'
  });

  return callback(null, twiml);
};
