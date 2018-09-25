'use strict'
const AWS = require('aws-sdk');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
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
    lexProcess: function(data) {
        var oof = JSON.stringify(data);
        oof = oof.replace(/\\"/g, '"');
        oof = oof.replace(/\"{/g, '{');
        oof = oof.replace(/\"}]}"/g, '"}]}');
        oof = JSON.parse(oof);
        return oof;
    },
    callGiphyAPI: function(term, callback) {
        var data = {
            rating: 'g',
            fmt: 'json',
            s: term,
            limit: 1
        }
        giphy.translate(data, function(err, res) {
            callback(res);
        });
    },
    fbVerify: function(event) {
        var queryParams = event.queryStringParameters;
        var rVerifyToken = queryParams['hub.verify_token']
        if (rVerifyToken === VERIFY_TOKEN) {
            var challenge = queryParams['hub.challenge']
            var response = {
                'body': parseInt(challenge),
                'statusCode': 200
            };
            callback(null, response);
        } else {
            var response = {
                'body': 'Error, wrong validation token',
                'statusCode': 422
            };
            callback(null, response);
        }
    }
}
