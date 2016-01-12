var express = require('express');
var router = express.Router();
var app = require('../app.js');
var User = app.User;
var Chatroom = app.Chatroom;
var createTimestamp = app.createTimestamp;
// chatroom view
router.route('/chatroom')
	.get(function(req, res, next) {	
		Chatroom.findById(req.query.id, function(err, chatroom) {
			if (err) {
				next(err);
			} else if (!chatroom) {
				next({
					status: 400,
					message: 'Bad request'
				});
			} else if (chatroom.members.indexOf(req.session.user.username) == -1) {
				res.redirect('/contactdir');
				return;
			} else {
				var curmsg;
				var curPage;
				if (chatroom.messageLog.length > 0) {
					curmsg = chatroom.messageLog[chatroom.messageLog.length - 1].messages;
					curPage = chatroom.messageLog.length - 1;
				} else {
					curmsg = [];
					curPage = 0;
				}
				res.render('chatroom', {
					name: chatroom.name,
					id: chatroom._id,
					user: req.session.user.username,
					isAdmin: req.session.user.username == chatroom.admin,
					members: chatroom.members,
					curMessages: curmsg,
					numMessages: curmsg.length,
					curPage: curPage
				});
			}
		});
	})
	// save an emitted message
	.post(function(req, res, next) {
		var newMessage = req.body;
		Chatroom.findById(newMessage.id, function(err, chatroom) {
			if (err) {
				next(err);
			} else if (!chatroom || chatroom.members.indexOf(req.session.user.username) == -1
				|| req.session.user.username != newMessage.user) {
				// make sure request's user is in the chatroom and sent the msg
				res.end();
				return;
			} else {
				if (newMessage.newPage == 'true' || chatroom.messageLog.length == 0) {
					// need new page
					chatroom.messageLog.push({
						messages: []
					});
				}
				var curPage = chatroom.messageLog[chatroom.messageLog.length - 1];
				curPage.messages.push({
					text: newMessage.text,
					username: newMessage.user,
					timestamp: createTimestamp(),
				});
				chatroom.save(function(err) {
					if (err) {
						next(err);
					}
				});
				res.end();
			}
		});
	});
// get a desired page of messages from a chatroom's message log; used to load previous/next messages
// in chatroom view
router.get('/getpage', function(req, res, next) {
	var chatroomId = req.query.id;
	var pageNum = Number(req.query.pageNum);
	Chatroom.findById(chatroomId, function(err, chatroom) {
		if (err) next(err); 
		else if (!chatroom || pageNum < 0 || pageNum >= chatroom.messageLog.length
			|| chatroom.members.indexOf(req.session.user.username) == -1) {
			// session's user must belong to the chatroom in the query
			res.send({
				error: 'Bad request'
			});
		} else {
			res.send(chatroom.messageLog[pageNum]);
		}
	});
});
// invite another user to a requested chatroom; only the admin of the chatroom has this privilege
router.get('/inviteuser', function(req, res, next) {
	var chatroomId = req.query.chatroomId;
	var searchTerm = req.query.term;
	Chatroom.findById(chatroomId, function(err, chatroom) {
		if (err) {
			next(err);
		} else if (!chatroom || chatroom.admin != req.session.user.username) {
			res.send('Bad request');
			return;
		} else if (chatroom.members.length == chatroom.capacity) {
			res.send('This room is full, cannot invite any more users.');
			return;
		} else {
			User.findOne({username: searchTerm}, function(err, user) {
				if (err) next(err);
				else if (!user) {
					res.send('No user with that username was found.');
					return;
				} else {
					var notifications = user.notifications;
					var chatrooms = user.chatrooms;
					var i;
					for (i = 0; i < chatrooms.length; i++) {
						var room = chatrooms[i];
						if (String(room.id) == String(chatroomId)) {
							if (room.approved) {
								res.send('That user is already in this room');
								return;
							} else {
								res.send('That user has already requested to join this room.');
								return;
							}
						}
					}
					for (var i = 0; i < notifications.length; i++) {
						var notification = notifications[i];
						if (String(notification.chatroomId) == String(chatroomId)) {
							res.send('That user has already been invited to join this room.');
							return;
						}
					}
					notifications.push({
						type: 'invite',
						chatroomId: chatroomId,
						chatroomName: chatroom.name,
						sender: req.session.user.username
					});
					user.save(function(err) {
						if (err) next(err);
					});
					res.send('Invite sent!');
				}
			});
		}
	});
});

module.exports = router;