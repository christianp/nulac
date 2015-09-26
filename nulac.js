function Game(players) {
	this.players = players;
	this.used = {};
	this.moves = [];
	this.announcements = [];
	this.last_word = null;
	this.re_word = new RegExp('^['+this.alphabet+']*$');
	this.wordlist = words;

	this.display = new Display(this);

}
Game.prototype = {
	alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	words: [],

	start: function() {
		this.running = true;

		this.display.start();

		this.announce({
			action: "start",
			text: "The game has begun"
		});

		this.next_player();
	},

	announce: function(message) {
		this.announcements.push(message);
		this.display.announce(message);
	},

	move: function(player,word) {
		if(player!=this.current_player) {
			throw(new Error("It's not "+player.name+"'s turn"));
		}

		if(!this.running) {
			throw(new Error("The game is not running"));
		}

		word = word.toUpperCase().trim();
		var initial = word[0];

		if(!this.re_word.test(word)) {
			throw(new Error("The word \""+word+"\" uses a non-alphabet character"));
		}

		if(word.length<4) {
			throw(new Error("The word must be at least four letters long"));
		}

		if(this.wordlist.indexOf(word)==-1) {
			throw(new Error(word+" isn't in the list of allowed words"));
		}

		if(this.last_word && this.last_word.indexOf(initial)==-1) {
			throw(new Error("The letter "+initial+" is not present in the last word played"));
		}

		if(this.used[initial]) {
			throw(new Error("The letter "+initial+" has already been used"));
		}

		this.used[initial] = true;
		this.moves.push({player: player, word: word});
		this.last_word = word;

		this.display.move(player,word);

		this.announce({
			action: "move",
			player: player,
			word: word,
			text: player.name+" plays \""+word+"\""
		});

		var playable_letter = false;
		for(var i=0;i<word.length;i++) {
			if(!this.used[word[i]]) {
				playable_letter = true;
				break;
			}
		}

		if(playable_letter) {
			this.next_player();
		} else {
			this.win(player);
		}

	},

	letter_available: function(letter) {
		return !this.used[letter] && !( this.last_word && this.last_word.indexOf(letter)==-1 );
	},

	next_player: function() {
		if(this.current_player) {
			this.current_player_index = (this.current_player_index+1) % this.players.length;
			this.current_player = this.players[this.current_player_index];
		} else {
			this.current_player = this.players[0];
			this.current_player_index = 0;
		}

		this.display.next_player(this.current_player);

		this.announce({
			action: "next_player",
			player: this.current_player,
			text: "It's "+this.current_player.name+"'s turn"
		});
	},

	win: function(player) {
		this.running = false;

		var score = this.moves.length;

		player.win(score);

		this.display.win(player);

		this.announce({
			action: "win",
			player: player,
			word: this.last_word,
			score: score,
			text: player.name+" wins the game, scoring "+score+" points"
		});
	}
}

function Player(name) {
	this.name = name;
	this.score = 0;
	this.wins = 0;
}
Player.prototype = {
	win: function(score) {
		this.wins += 1;
		this.score += score;
	}
}

function make_element(name,attributes,innerText) {
	var e = document.createElement(name);
	for(var attribute in attributes) {
		e.setAttribute(attribute,attributes[attribute]);
	}
	if(innerText!==undefined) {
		e.innerText = innerText;
	}
	return e;
}

function Display(game) {
	this.game = game;
}
Display.prototype = {

	get_player_display: function(player) {
		for(var i=0;i<this.game.players.length;i++) {
			if(this.game.players[i]==player) {
				return this.player_displays[i];
			}
		}
	},

	start: function() {
		var d = this;
		var players_list = document.querySelector('#players tbody');
		players_list.innerHTML = '';
		this.player_displays = [];
		this.game.players.forEach(function(player) {
			var root = make_element('tr',{'class':'player'});
			var name = make_element('td',{'class':'name'}, player.name);
			root.appendChild(name);
			var score = make_element('td',{'class':'score'}, player.score);
			root.appendChild(score);
			var wins = make_element('td',{'class':'wins'}, player.wins);
			root.appendChild(wins);
			d.player_displays.push({root:root, player:player, score:score, wins:wins, player: player});
			players_list.appendChild(root);
		});

		var word_input = document.getElementById('word-input');

		function letter_clicker(letter) {
			return function() {
				word_input.value += letter;
			}
		}

		var alphabet_list = document.getElementById('alphabet');
		alphabet_list.innerHTML = '';
		this.letter_displays = {};
		for(var i=0;i<d.game.alphabet.length;i++) {
			var letter = d.game.alphabet[i];
			var li = make_element('li',{'class':'letter'},letter);

			li.onclick = letter_clicker(letter);

			alphabet_list.appendChild(li);
			d.letter_displays[letter] = li;
		}

		var moves_list = document.getElementById('moves');
		moves_list.innerHTML = '';

		var announcements_list = document.getElementById('announcements');
		announcements_list.innerHTML = '';

		var input_form = document.getElementById('input');
		input_form.onsubmit = function() {
			d.submit();
			return false;
		}
	},

	submit: function() {
		var word_input = document.getElementById('word-input');
		var word = word_input.value;
		try {
			this.game.move(this.game.current_player,word);
		} catch(e) {
			this.announce({
				action: "error",
				text: e.message
			});
		}
	},

	announce: function(message) {
		console.log(message.text);
		var li = make_element('li',{'class': 'announcement '+message.action},message.text);
		var announcements_list = document.getElementById('announcements');
		announcements.appendChild(li);
	},

	move: function(player,word) {
		var moves_list = document.getElementById('moves');
		var li = make_element('li',{'class':'move'});
		var player = make_element('span',{'class':'player'},player.name);
		li.appendChild(player);
		var word = make_element('span',{'class':'word'}, word);
		li.appendChild(word);
		moves_list.appendChild(li);
	},

	next_player: function(player) {
		var d = this;
		for(var i=0;i<d.game.alphabet.length;i++) {
			var letter = d.game.alphabet[i];
			var letter_display = d.letter_displays[letter];
			letter_display.classList.toggle('used',d.game.used[letter]);
			letter_display.classList.toggle('available',d.game.letter_available(letter));
		}

		d.player_displays.forEach(function(player_display,i) {
			var player = player_display.player;
			player_display.root.classList.toggle('current',player==d.game.current_player);
		});

		var word_input = document.getElementById('word-input');
		word_input.value = '';
	},

	win: function(player) {
		for(var i=0;i<this.player_displays.length;i++) {
			var player_display = this.player_displays[i];
			var player = player_display.player;
			player_display.score.innerText = player.score;
			player_display.wins.innerText = player.wins;
		}

		var word_input = document.getElementById('word-input');
		word_input.setAttribute('disabled',true);
		var submit = document.querySelector('#input button[type=submit]');
		submit.setAttribute('disabled',true);
	}
}

var players = [];
for(var i=0;i<2;i++) {
	players.push(new Player("Player "+i));
}

var game = new Game(players);
game.start();

function go(word) {
	game.move(game.current_player,word);
}
