var express = require('express');
var router = express.Router();
var app = require('../app.js');
var User = app.User;
var Chatroom = app.Chatroom;

// notifications view
router.get('/', function(req, res, next) {
	res.render('notifications', {
		notifications: req.session.user.notifications
	});
});
// have user accept the chatroom invite designated by the given notification
function acceptInvite(user, notification, next, callback) {
	Chatroom.findById(notification.chatroomId, function(err, chatroom) {
		if (err) next(err);
		else if (!chatroom) { // chatroom has been deleted
			callback({
				success: false,
				msg: 'That room has been deleted.'
			});
		} else if (chatroom.members.length == chatroom.capacity) { // chatroom is full
			callback({
				success: false,
				msg: 'Chatroom is at full capacity right now. Try again later.'
			});
		} else {
			chatroom.members.push(user.username);
			chatroom.save(function(err) {
				if (err) next(err);
			});
			// add notification's chatroom to list of the accepter of the invite
			user.chatrooms.push({
				id: notification.chatroomId,
				approved: true
			});
			notification.remove();
			user.save(function(err) {
				if (err) next(err);
			});
			callback({
				success: true,
				msg: ''
			});
		}
	});
}
// process acceptions/rejections of chatroom invitations
router.post('/invite', function(req, res, next) {
	var notification = req.session.user.notifications.id(req.body.notificationId);
	if (!notification || notification.type != 'invite') {
		// notification is not an invite or does not exist for the session's user
		res.send({
			success: false,
			msg: 'Error: invalid notification'
		});
	} else {
		var ret;
		if (req.body.action == 'accept') {
			acceptInvite(req.session.user, notification, next, function(json) {
				res.send(json);
			}); // acceptInvite removes the notification as well
		} else {
			// note that if we reject an invite, we make no changes to the user's chatrooms
			notification.remove();
			req.session.user.save(function(err) {
				if (err) next(err);
			});
			res.send({
				success: true,
				msg: ''
			});			
		}
	}	
});
// admin of a chatroom accepts user's request to join the chatroom
function acceptRequest(user, notification, next, callback) {
	// add the sender to the chatroom's list of members
	Chatroom.findById(notification.chatroomId, function(err, chatroom) {
		if (err) next(err);
		else if (!chatroom) {
			callback({
				success: false,
				msg: 'That chatroom has been deleted.'
			});
		} else if (chatroom.members.length == chatroom.capacity) {
			callback({
				success: false,
				msg: 'Chatroom is at full capacity right now. Try again later.'
			});
		} else {
			chatroom.members.push(user.username);
			chatroom.save(function(err) {
				if (err) next(err);
			});
			// find the chatroom the sender of the notification can now join and reset its approved attribute
			for (var i = 0; i < user.chatrooms.length; i++) {
				if (String(user.chatrooms[i].id) == String(notification.chatroomId)) {
					user.chatrooms[i].approved = true;
					break;
				}
			}
			user.save(function(err) {
				if (err) next(err);
			});
			callback({
				success: true,
				msg: ''
			});
		}
	});
}
// admin rejects user's request to join chatroom
function rejectRequest(user, notification, next, callback) {
	// find the chatroom to which the sender of the notification has been denied access and remove it
	// from the sender's chatrooms list
	for (var i = 0; i < user.chatrooms.length; i++) {
		if (String(user.chatrooms[i].id) == String(notification.chatroomId)) {
			user.chatrooms.splice(i, 1);
			break;
		}
	}
	user.save(function(err) {
		if (err) next(err);
	});
	callback({
		success: true,
		msg: ''
	});
}
// process acceptions/rejections of requests to join chatrooms
router.post('/request', function(req, res, next) {
	var notification = req.session.user.notifications.id(req.body.notificationId);
	if (!notification || notification.type != 'request') {
		res.send({
			success: false,
			msg: 'Error: invalid notification'
		});
	} else {
		User.findOne({username: notification.sender}, function(err, user) {
			if (err || !user) next(err);
			else if (!user) res.send({
				success: false,
				msg: 'Error: bad request'
			});
			else {
				function callback(json) {
					if (json.success) {
						// only remove the notification if there was no issue processing it
						notification.remove();
						req.session.user.save(function(err) {
							if (err) next(err);
						});
					}
					res.send(json);	
				}
				if (req.body.action == 'accept') {
					acceptRequest(user, notification, next, callback);
				} else {
					rejectRequest(user, notification, next, callback);
				}
			}
		});
	}
});

module.exports = router;