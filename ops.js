'use strict'
const AWS = require('aws-sdk');
const giphy = require('giphy-api')('ZMOzQyQkZvQYotb2OoXpbsNB16FTwI1s');
module.exports = {
    seen: function(recipientId) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'mark_seen'
        }
        return messageData;
    },
    typing: function(recipientId) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'typing_on'
        }
        return messageData;
    },
    lexify: function(messageText, senderID, callback) {
        AWS.config.region = 'us-west-2';
        var lexruntime = new AWS.LexRuntime();
        var userID = senderID;
        var params = {
            botAlias: "BerkeyBot",
            botName: "BerkeyBot",
            inputText: messageText,
            userId: userID,
            sessionAttributes: {}
        };
        lexruntime.postText(params, function(err, data) {
            if (err) {
                callback(senderID, JSON.stringify(err));
            } else {
                callback(senderID, data);
            }
        });
    },
    translateSticker: function(searchTerm, callback) {
        giphy.translate({
            s: searchTerm,
            rating: 'pg',
            fmt: 'json',
            limit: 1
        }, function(err, res) {
              callback(res);
        });
    }, searchGifs: function(searchTerm, callback) {
        giphy.search({
            q: searchTerm,
            rating: 'pg',
            fnt: 'json',
            limit: 1
        }, function(err, res) {
          callback(res);
        });
    }

}
