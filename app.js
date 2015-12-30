var express = require('express');
var http = require('http');
var app = express();
var server = http.createServer(app);

app.get('/', function(req, res) {
	res.send('Hello world');
});

server.listen(3000, function() {
	console.log('Listening on port ' + server.address().port);
})