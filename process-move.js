const twilio = require('twilio');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 100 });
const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async function(context, event, callback) {
  const client = context.getTwilioClient();
  const mappings = {
    '1': 'A1', '2': 'A2', '3': 'A3',
    '4': 'B1', '5': 'B2', '6': 'B3',
    '7': 'C1', '8': 'C2', '9': 'C3'
  };
  let gameState = cache.get('gameState') || {
    'A1': ' ', 'A2': ' ', 'A3': ' ',
    'B1': ' ', 'B2': ' ', 'B3': ' ',
    'C1': ' ', 'C2': ' ', 'C3': ' '
  };

  const digit = event.Digits;
  const move = mappings[digit];

  if (!checkIfSpaceIsAvailable(gameState, move)) {
    const response = new twilio.twiml.VoiceResponse();
    response.say('Invalid move. Please try again.');
    response.gather({
      numDigits: 1,
      action: '/process-move'
    });
    return callback(null, response);
  }
  
  updateGameState(gameState, `${move} = X`);

  let result = checkGameResult(gameState);
  if (result) {
    const imageUrl = await generateImageFromGameState(gameState);
    await sendSms(client, result, imageUrl);
    cache.del('gameState');
    const response = new twilio.twiml.VoiceResponse();
    response.say(result);
    return callback(null, response);
  }

  const aiMove = await getAIMove(move, gameState);
  updateGameState(gameState, `${aiMove} = O`);
  const imageUrl = await generateImageFromGameState(gameState);

  result = checkGameResult(gameState);
  if (result) {

    await sendSms(client, result, imageUrl);
    cache.del('gameState');
    const response = new twilio.twiml.VoiceResponse();
    response.say(result);
    return callback(null, response);
  }

  cache.set('gameState', gameState);

  const message = `You played ${move}. AI played ${aiMove}. What's your next move?`;
  await sendSms(client, message, imageUrl);
  const response = new twilio.twiml.VoiceResponse();
  response.say(message);
  response.gather({
    numDigits: 1,
    action: '/process-move'
  });

  return callback(null, response);

  function updateGameState(gameState, playerMove) {
    const [position, value] = playerMove.split(' = ');
    gameState[position] = value;
  }

  function checkIfSpaceIsAvailable(gameState, move) {
    return gameState[move] === ' ';
  }

  function checkGameResult(board) {
    const score = evaluate(board);
    if (score === 10) return 'AI wins! Game over.';
    if (score === -10) return 'You win! Game over.';
    if (!Object.values(board).includes(' ')) return "It's a draw! Game over.";
    return null;
  }

  function evaluate(board) {
    const winningCombinations = [
      ['A1', 'A2', 'A3'], ['B1', 'B2', 'B3'], ['C1', 'C2', 'C3'],
      ['A1', 'B1', 'C1'], ['A2', 'B2', 'C2'], ['A3', 'B3', 'C3'],
      ['A1', 'B2', 'C3'], ['A3', 'B2', 'C1']
    ];

    for (const combination of winningCombinations) {
      const [a, b, c] = combination;
      if (board[a] === board[b] && board[b] === board[c]) {
        if (board[a] === 'O') return 10;
        if (board[a] === 'X') return -10;
      }
    }
    return 0;
  }

  async function getAIMove(playerMove, gameState) {
    const prompt = `You're playing a game of tic tac toe with a human. The goal is to get three marks (X or O) in a row horizontally, vertically, or diagonally. The human plays X at ${playerMove}. Your top priority is to win the game. If you can't win immediately, try to block the human from forming a winning line by adding your move. What's your next move? Reply with just your answer (e.g., B2), current game state is ${JSON.stringify(gameState)}`;
    const genAI = new GoogleGenerativeAI(context.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
  
    return text;
  }

  function generateImageFromGameState(board) {
    const data = {
      title: 'Tic Tac Toe Board',
      columns: [
        { title: '', dataIndex: 'col0' },
        { title: '1', dataIndex: 'col1' },
        { title: '2', dataIndex: 'col2' },
        { title: '3', dataIndex: 'col3' }
      ],
      dataSource: [
        { col0: 'A', col1: board['A1'], col2: board['A2'], col3: board['A3'] },
        { col0: 'B', col1: board['B1'], col2: board['B2'], col3: board['B3'] },
        { col0: 'C', col1: board['C1'], col2: board['C2'], col3: board['C3'] }
      ]
    };

    const url = `https://api.quickchart.io/v1/table?data=${encodeURIComponent(JSON.stringify(data))}`;
    return url;
  }

    async function sendSms(client, message, mediaUrl = null) {
    const messageData = {
      from: context.TWILIO_PHONE_NUMBER,
      to: `whatsapp:${event.From}`
    };

    if (mediaUrl) {
      messageData.mediaUrl = [mediaUrl];
    } else {
      console.log('No media URL available for SMS');
    }

    if (message) messageData.body = message;

    await client.messages.create(messageData).catch(console.error);
  }
};
