'use strict'
const AWS = require('aws-sdk');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
module.exports = {
    //Accepts userID.  Return "mark as seen" object for Send API.
    seen: function(recipientId) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'mark_seen'
        }
        return messageData;
    },
    //Accepts userID.  Return "display typing bubble" object for Send API.
    typing: function(recipientId) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'typing_on'
        }
        return messageData;
    },
    //Accepts message string, userID, and callback function.  Send message to Lex to process.
    lexify: function(messageText, senderID) {
        return new Promise(function(resolve, reject) {
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
                    reject(err);
                } else {
                    data = JSON.parse(JSON.stringify(data).replace(/\\"/g, '"').replace(/\"{/g, '{').replace(/\"}]}"/g, '"}]}'));
                    resolve(data);
                }
            });
        });
    },
    //Accepts search term and callback function.  Configures GIPHY search object, and sends API response to the callback.
    callGiphyAPI: function(term, callback) {
        var data = {
            rating: 'y',
            fmt: 'json',
            s: term,
            limit: 1
        }
        giphy.translate(data, function(err, res) {
            callback(res);
        });
    },
    //Accepts Lambda event object.  Verifies webhook access for FB.
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
