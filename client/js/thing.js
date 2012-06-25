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

$(function() {
	var client = window.client = new Faye.Client('http://localhost:1000/faye');

	function Message(data) {
		this.player = data.player;
		this.kind = data.kind || '';
		this.message = data.message;
	}

	function Player(data) {
		this.name = data.name;
		this.slug = data.slug;
		this.score = subscribeObservable('/player/'+this.slug+'/score');
		this.score(data.score);
	}

	function Nulac() {
		var game = this;
		this.me = ko.observable(null);

		this.players = ko.observableArray([]);
		this.playerNames = {};

		client.subscribe('/players',function(data) {
			var list = [];
			game.playerNames = {};
			for(var x in data) {
				if(!(x in data)) {
					var player = new Player(data[x]);
					game.playerNames[player.name] = player;
					list.push(player);
				}
			}
			game.players(list);
		});

		this.messages = ko.observableArray([]);

		client.subscribe('/message',this.receiveMessage);

		this.currentPlayer = subscribeObservable(client,'/current-player');
		this.availableLetters = subscribeObservable(client,'/availableLetters');
		this.playedWords = subscribeArray(client,'/turn/played/list');

		client.subscribe('/turn/played',function(word) {
			game.receiveMessage({player: game.currentPlayer(), kind: 'played', message: 'played '+word});
		});

		client.subscribe('/player/score',function(data) {
			var player = game.playerNames[data.name];
			player.score(data.score);
		});

		this.oPlayer = null;
		ko.computed(function() {
			var player = this.currentPlayer();
			if((!player) || player==this.oPlayer)
				return;
			this.oPlayer = player;
			this.receiveMessage({kind: 'currentplayer', message: "It's "+player+"'s turn."});
		},this);

		var initSubscription = client.subscribe('/init',function(data) {
			console.log('get init');
			game.availableLetters(data.availableLetters);
			game.playedWords(data.playedWords);
			game.currentPlayer(data.currentPlayer);
			initSubscription.cancel();
		});
	}
	Nulac.prototype = {
		join: function(el) {
			var name = $(el).find('.name').val();

			client.subscribe('/message/'+name,this.receiveMessage);
			client.publish('/join',{name: name});
			this.me(name);
		},

		receiveMessage: function(data) {
			game.messages.splice(0,0,new Message(data));
		},

		sendMessage: function(el) {
			var message = $(el).find('.message').val();
			$(el).find('.message').val('');

			if(message.toUpperCase() == message) {
				client.publish('/turn',{player: this.me(), word: message});
			}
			else {
				client.publish('/message',{ 
					player: this.me(), 
					kind: 'chat',
					message: message 
				});
			}
		}
	};

	var game = window.game = new Nulac();
	ko.applyBindings(game);

});
