var http = require('http'),
	faye = require('faye'),
	fs = require('fs'),
	express = require('express')
;

var wordList = fs.readFileSync('2of12inf.txt').toString().split('\n').map(function(word){return word.toUpperCase().replace(/[^A-Z]/g,'')});
var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function Player(data) {
	this.name = data.name;
	this.slug = this.name.replace(/\s/g,'-').replace(/[^a-zA-Z\-_!~\(\)\$@]/g,'');
}

Player.prototype = {
	name: 'Unnamed player',
	score: 0,

	state: function() {
		return {
			name: this.name,
			slug: this.slug,
			score: this.score
		};
	},

	sendMessage: function(message,kind) {
		kind = kind || 'chat';
		game.client.publish('/message/'+this.slug, {kind: kind, player: 'Nulac', message: message})
	},

	award: function(points) {
		this.score += points;
		game.client.publish('/player/score/'+this.slug,this.score);
	}
}

function Game() {
	
	//set up the server
	var app = this.server = express.createServer();
	app.configure(function () {
		app.use(express.bodyParser());
		app.use(express.static(__dirname + '/static'));
	});
	app.listen(8123);


	//set up faye pub/sub
	var bayeux = new faye.NodeAdapter({mount: '/faye', timeout: 45});
	bayeux.attach(app);
	this.client = bayeux.getClient();

	//make subscriptions to faye channels
	this.doSubscriptions();

	//set up the addresses clients can access
	this.doWebMethods();


	// set up game

	this.players = [];

	this.init()
}
Game.prototype = {
	usedLetters: '',
	turn: 0,

	doWebMethods: function() {
		var app = this.server,
			client = this.client,
			game = this;
		;

		//to join a game
		app.post('/join',function(req,res) {
			var data = req.body;
			var player = game.join(data);
			var odata = game.state();
			odata.you = player.state();
			res.send(odata);
		});

		//to get the current state of the game
		app.get('/state',function(req,res) {
			res.send(game.state());
		});


		//404 handlers
		function notFound(req,res) {
			res.send('Not found',404);
		}
		app.get(/\/.*/,notFound);
		app.post(/\/.*/,notFound);
	},

	doSubscriptions: function() {
		var client = this.client;
		var game = this;

		client.subscribe('/play',function(data) {
			var player = game.players[data.player];
			word = data.word.toUpperCase().replace(/[^A-Z]/g,'');
			game.tryWord(player,word);
		});

		//debug: echo all messages
		client.subscribe('/**',function(data) {
			console.log(data);
		});
	},

	init: function() {
		//set game state
		this.usedLetters = '';
		this.playedWords = [];
		this.availableLetters = alphabet.split('');

		//tell the players
		this.client.publish('/new-game','new game');

		//if there are players, pick one to take a turn
		if(this.players.length) {
			this.turn = 0;
			this.nextTurn();
		}
	},

	end: function() {
		//give the winning player 10 points
		this.currentPlayer.award(10);

		//tell the players
		this.client.publish('/end-game',this.currentPlayer.name);

		//start a new game
		this.init();
	},

	join: function(data) {
		var player;

		//decide if the player is already in the game
		if(!(data.name in this.players)) {
			//if not, add them
			player = this.addPlayer(data)
		}
		else {
			player = this.players[data.name];
		}

		//say hi to the player
		player.sendMessage('Hi, '+player.name+'!');
		
		return player;
	},

	addPlayer: function(data) {
		//create the player
		var player = new Player(data);

		//add it to the list
		this.players.push(player);
		this.players[player.name] = player;

		//tell the other players
		this.client.publish('/new-player',player.state());

		//if this is the first player, it's their turn
		if(this.players.length==1)
			this.nextTurn();

		return player
	},

	removePlayer: function(player) {
		//remove the player from the list
		var i = this.players.indexOf(player);
		this.players.splice(i,1);
		delete this.players[player.name];

		//tell the other players
		this.client.publish('/player/left',player.name);
		this.sendMessage({message: player.name+' left the game.', kind: 'player-left'});

		//now it's the next player's turn
		if(this.currentPlayer == player) {
			this.turn--;
			this.nextTurn();
		}
	},

	tryWord: function(player,word) {
		//check it's the player's turn
		if(player!=this.currentPlayer) {
			player.sendMessage("It isn't your turn.",'error');
			return;
		}

		//check the word is valid
		try {
			if(wordList.indexOf(word)==-1)
				throw(new Error("I don't recognise the word "+word));
			if(word.length<4)
				throw(new Error('Your word must be at least four letters long.'));
			if(this.availableLetters.indexOf(word[0])==-1)
				throw(new Error('The first letter of your word must be in the previous word.'));
			if(this.usedLetters.indexOf(word[0])>0)
				throw(new Error(word[0]+' has been used.'));
		}
		//if not, tell the player
		catch(e) {
			this.currentPlayer.sendMessage(e.message,'badword');
			return;
		}

		//if the word is valid, play it
		this.playWord(word);
	},

	playWord: function(word) {
		var game = this;

		//keep track of which letters have been used and are available
		this.usedLetters += word[0];
		this.availableLetters = alphabet.split('').filter(function(l){return game.usedLetters.indexOf(l)==-1 && word.indexOf(l)>0});
		this.playedWords.push(word);

		//tell the players
		this.client.publish('/played',{player: this.currentPlayer.name, word: word});
		this.client.publish('/available-letters',this.availableLetters);

		//give the player a point for each letter
		this.currentPlayer.award(word.length);

		//if there are unused letters in the word, it's the next player's turn
		if(this.availableLetters.length)
			this.nextTurn();
		//if not, that's the end of the game
		else
			this.end();
	},

	nextTurn: function(data) {
		//work out whose turn it is now
		this.turn = (this.turn+1) % this.players.length;
		this.currentPlayer = this.players[this.turn];

		//tell the players
		this.client.publish('/current-player',this.currentPlayer.name);
	},

	sendMessage: function(data) {
		if(typeof data=='string')
			data = {kind: 'chat',message: data};

		data.kind = data.kind || 'chat';
		data.player = 'Nulac';

		this.client.publish('/message',data);
	},

	state: function() {
		return {
			players: this.players.map(function(p) {return p.state()}),
			playedWords: this.playedWords,
			availableLetters: this.availableLetters,
			currentPlayer: this.currentPlayer.name
		}
	}
}

var game = new Game();
