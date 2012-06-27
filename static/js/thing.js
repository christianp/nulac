//Knockout rubbish
ko.bindingHandlers.class = {
	init: function(el,value) {
		value = ko.utils.unwrapObservable(value());
		ko.utils.domData.set(el,'class','');
	},
	update: function(el,value) {
		value = ko.utils.unwrapObservable(value());
		var oldValue = ko.utils.domData.get(el,'class');
		ko.utils.domData.set(el,'class',value);
		$(el).removeClass(oldValue).addClass(value);
	}
};

function subscribeObservable(client,path) {
	var obs = ko.observable();
	client.subscribe(path,function(d) {
		obs(d);
	});
	return obs;
}

function subscribeArray(client,path) {
	var obs = ko.observableArray();
	client.subscribe(path,function(d) {
		obs(d);
	});
	return obs;
}


//The actual thing
$(function() {

	//set up faye pub/sub
	var client = window.client = new Faye.Client('/faye');

	function Message(data) {
		this.player = data.player;
		this.kind = data.kind || '';
		this.message = data.message;
	}

	function Player(data) {
		this.name = data.name;
		this.slug = data.slug;
		this.score = subscribeObservable(client,'/player/score/'+this.slug);
		this.score(data.score);
	}

	function Nulac() {
		var game = this;

		//is the player currently in the game?
		this.playing = ko.observable(false);
		//the player's name
		this.myName = ko.observable(null);

		//list of all the players in the game
		this.players = ko.observableArray([]);
		this.playerNames = {};

		//list of chat messages, game narration, etc.
		this.messages = ko.observableArray([]);

		//the name of the player whose turn it is
		this.currentPlayer = subscribeObservable(client,'/current-player');
		this.myGo = ko.computed(function(){ return this.currentPlayer()==this.myName(); }, this);

		//the letters that can be used
		this.availableLetters = subscribeObservable(client,'/available-letters');
		this.playedWords = subscribeArray(client,'/turn/played/list');

		//when a game starts
		client.subscribe('/new-game',function() {
			game.receiveMessage({kind: 'new-game', message: 'A new round has started.'});
			game.playedWords([]);
		});

		//when a game ends
		client.subscribe('/end-game',function(player) {
			game.receiveMessage({kind: 'end-game', message: 'There are no available letters, so '+player+' wins this round.'});
		});

		//when a player joins
		client.subscribe('/new-player',function(data) {
			var player = game.addPlayer(data);
			game.receiveMessage({kind: 'join', message: player.name+' has joined the game.'});
		});

		//when a chat message is sent
		client.subscribe('/message',function(data) {
			game.receiveMessage(data)
		});

		//when a player plays a word
		client.subscribe('/played',function(data) {
			//add the word to the list of played words
			game.playedWords.push(data.word);

			//tell the player
			game.receiveMessage({player: data.player, kind: 'played', message: 'played '+data.word});
		});

		//debug: echo all channels
		client.subscribe('/**',function(data) {
			console.log(data);
		});

		//when the current player changes, tell the player
		client.subscribe('/current-player',function(player) {
			game.setCurrentPlayer(player);
		});
	}
	Nulac.prototype = {
		join: function(el) {
			var game = this;
			var name = $(el).find('.name').val();
			this.myName(name);
			$.post('/join',{name: name})
				.success(function(data) {
					game.updateState(data);
					game.playing(true);
				})
				.error(function(data) {
					console.log(data);
				})
			;
		},
		
		addPlayer: function(data) {
			var player = new Player(data);
			this.playerNames[player.name] = player;
			this.players.push(player);
			return player;
		},

		updateState: function(data) {
			console.log(data);
			var game = this;

			//create the list of players
			this.players([]);
			var playerNames = this.playerNames = {};
			for(var i=0;i<data.players.length;i++) {
				this.addPlayer(data.players[i]);
			}

			//record the player's name
			this.myName(data.you.name);

			//listen for private messages
			client.subscribe('/message/'+data.you.slug,function(data) {
				game.receiveMessage(data)
			});

			//record the played words and available letters
			this.playedWords(data.playedWords);
			this.availableLetters(data.availableLetters);

			//record the current player
			this.setCurrentPlayer(data.currentPlayer);
		},

		receiveMessage: function(data) {
			console.log(data.kind,data.message);
			this.messages.splice(0,0,new Message(data));
		},

		setCurrentPlayer: function(player) {
			if(player==this.currentPlayer())
				return;
			this.currentPlayer(player);
			var message = player==this.myName() ? "It's your turn." : "It's "+player+"'s turn.";
			this.receiveMessage({kind: 'currentplayer', message: message});
		},

		sendMessage: function(el) {
			var message = $(el).find('#chat').val();
			$(el).find('.message').val('');

			client.publish('/message',{ 
				player: this.myName(), 
				kind: 'chat',
				message: message 
			});
		},

		playWord: function(el) {
			var word = $(el).find('#play').val();
			$(el).find('#play').val('');

			client.publish('/play',{player: this.myName(), word: word});
		}
	};

	var game = window.game = new Nulac();
	ko.applyBindings(game);

});
