var http = require('http'),
	faye = require('faye'),
	fs = require('fs')
;

var wordList = fs.readFileSync('2of12inf.txt').toString().split('\n').map(function(word){return word.toUpperCase().replace(/[^A-Z]/g,'')});

var bayeux = new faye.NodeAdapter({mount: '/faye', timeout: 45});
bayeux.listen(1000);

var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function Player(data) {
	this.name = data.name;
	this.slug = this.name.replace(/\s/g,'-').replace(/[^a-zA-Z\-]/g,'');
}

Player.prototype = {
	name: 'Unnamed player',
	score: 0,

	sendMessage: function(message,kind) {
		kind = kind || 'chat';
		game.client.publish('/message/'+this.name, {kind: kind, player: 'Nulac', message: message})
	},

	award: function(points) {
		this.score += points;
		game.client.publish('/player/score',{player: this.name, score: this.score});
	}
}

function Game() {
	this.players = [];

	this.doSubscriptions();

	this.init()
}
Game.prototype = {
	usedLetters: '',
	turn: null,

	init: function() {
		this.usedLetters = '';
		this.playedWords = [];
		this.availableLetters = alphabet.split('');
		this.client.publish('/turn/played/list',this.playedWords);
		if(this.players.length) {
			this.turn = 0;
			this.nextTurn();
		}
	},

	end: function() {
		this.currentPlayer.score++;
		this.client.publish('/players',this.players);
		this.client.publish('/message',{kind: 'won', message: 'There are no playable letters, so '+this.currentPlayer.name+' wins!'});
		this.init();
	},

	doSubscriptions: function() {
		var game = this;
		var client = this.client = bayeux.getClient();
		client.subscribe('/join',function(data) {
			var player;
			var name = data.name;
			if(!(name in game.players)) {
				player = game.addPlayer(data);
				client.publish('/message', {kind: 'join', message: name+' joined'});
			}
			else {
				player = game.players[name];
				client.publish('/message', {kind: 'join', message: name+' rejoined'});
			}
			player.sendMessage('Hi, '+player.name+'!');
			client.publish('/players',game.players);

			if(game.players.length==1)
				game.nextTurn();
			
			game.publishInit();
		});

		client.subscribe('/turn',function(data) {
			var player = game.players[data.player];
			if(player!=game.currentPlayer && player) {
				player.sendMessage("It isn't your turn.",'error');
			}
			else {
				word = data.word.toUpperCase().replace(/[^A-Z]/g,'');
				game.takeTurn(word);
			}
		});
	},

	addPlayer: function(data) {
		var player = new Player(data);

		this.players.push(player);
		this.players[player.name] = player;
		
		return player;
	},
	
	nextTurn: function(data) {
		this.turn = (this.turn+1) % this.players.length;
		this.currentPlayer = this.players[this.turn];
		this.publishState();
	},

	takeTurn: function(word) {
		try {
			if(wordList.indexOf(word)==-1)
				throw(new Error("I don't recognise the word "+word));
			if(wordList.indexOf(word)==-1)
				throw(new Error("I don't recognise the word "+word));
			if(word.length<4)
				throw(new Error('Your word must be at least four letters long.'));
			if(this.availableLetters.indexOf(word[0])==-1)
				throw(new Error('The first letter of your word must be in the previous word.'));
			if(this.usedLetters.indexOf(word[0])>0)
				throw(new Error(word[0]+' has been used.'));

			this.usedLetters += word[0];
			var usedLetters = this.usedLetters;
			this.availableLetters = alphabet.split('').filter(function(l){ return usedLetters.indexOf(l)==-1 && word.indexOf(l)>0; });
			this.playedWords.push(word);
			this.client.publish('/turn/played',word);
			this.client.publish('/turn/played/list',this.playedWords);
			if(this.availableLetters.length) {
				this.nextTurn();
			} else {
				this.end();
			}
		}
		catch(e) {
			this.currentPlayer.sendMessage(e.message,'badword');
		}
	},

	publishState: function() {
		this.client.publish('/current-player',this.currentPlayer.name);
		this.client.publish('/availableLetters',this.availableLetters);
	},

	publishInit: function() {
		this.client.publish('/init',{
			availableLetters: this.availableLetters,
			playedWords: this.playedWords,
			currentPlayer: this.currentPlayer.name
		});
	}
}

var game = new Game();
