'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const request = require('request');
const ops = require('./ops');
const giphy = require('giphy-api')('ZMOzQyQkZvQYotb2OoXpbsNB16FTwI1s');

function sendTextMessage(recipientId, messageText) {
    return new Promise(function(resolve, reject) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: messageText
            }
        };
        callSendAPI(messageData).then(function() { resolve() });
    });
}

function sendGif(recipientId, term) {
    return new Promise(function(resolve, reject) {
        ops.callGiphyAPI(term, function(data) {
            try {
                data = data.data.images.fixed_width.url;
            } catch (err) {
                reject();
            }
            if (typeof data !== 'string') {
                data = JSON.stringify(data);
            }
            var messageData = {
                recipient: {
                    id: recipientId
                },
                message: {
                    attachment: {
                        type: "image",
                        payload: {
                            url: data,
                            is_reusable: true
                        }
                    }
                }
            };
            callSendAPI(messageData).then(function() { resolve() });
        });
    });
}
async function respond(recipientId, messageText) {
    var messages = [];
    for (var i = 0; i < messageText.length; i++) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: messageText[i].value
            }
        };
        messages.push(messageData);
        await callSendAPI(messageData);
    }
}

function callSendAPI(data) {
    return new Promise(function(resolve, reject) {
        var body = JSON.stringify(data);
        var path = '/v2.6/me/messages?access_token=' + PAGE_ACCESS_TOKEN;
        var options = {
            host: "graph.facebook.com",
            path: path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        var callback = function(response) {
            var str = ''
            response.on('data', function(chunk) {
                str += chunk;
            });
            response.on('end', function() {
                resolve(str);
            });
        }
        var req = https.request(options, callback);
        req.write(body);
        req.end();
    });
}

function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;
    var messageId = message.mid;
    var messageText = message.text;
    var messageAttachments = message.attachments;
    if (messageText) {
        callSendAPI(ops.seen(senderID)).then(function() {
            setTimeout(function() {
                callSendAPI(ops.typing(senderID)).then(function() {
                    ops.lexify(messageText, senderID, function(senderID, res) {
                        if (typeof(res) == 'string') {
                            setTimeout(function() { sendTextMessage(senderID, ('Error: ' + res)); }, 2000);
                        } else if (res.intentName !== null) {
                            var oof = ops.lexProcess(res);
                            if (typeof oof.message.messages !== 'undefined') {
                                setTimeout(function() { respond(senderID, oof.message.messages); }, 2000);
                            } else {
                                switch (res.intentName) {
                                    case ('Hi'):
                                        setTimeout(function() {
                                            sendTextMessage(senderID, oof.message).then(function() {
                                                sendGif(senderID, 'Hello');
                                            });
                                        }, 2000);
                                        break;
                                    case ('Insult'):
                                        setTimeout(function() {
                                            sendTextMessage(senderID, oof.message).then(function() {
                                                sendGif(senderID, 'Crying');
                                            });
                                        }, 2000);
                                        break;
                                    default:
                                        setTimeout(function() { sendTextMessage(senderID, oof.message); }, 2000);
                                }
                            }
                        } else {
                            setTimeout(function() {
                                sendTextMessage(senderID, "I'm sorry, I wasn't quite able to understand you.  Could you try rephrasing your message for me?  Thanks!").then(function() {
                                    sendGif(senderID, 'Sorry');
                                });
                            }, 2000);
                        }
                    });
                });
            }, 1000);
        });
    } else if (messageAttachments) {
        callSendAPI(ops.seen(senderID)).then(function() {
            callSendAPI(ops.typing(senderID)).then(function() {
                setTimeout(function() {
                    sendTextMessage(senderID, "\ud83d\udc4d").then(function() {
                        sendGif(senderID, 'cool');
                    });
                }, 1000);
            });
        });
    }
}
exports.handler = (event, context, callback) => {
    if (event.queryStringParameters) {
        ops.fbVerify(event);
    } else {
        var data;
        if (typeof(event.body) == 'string') {
            data = JSON.parse(event.body);
        } else {
            data = event.body;
        }
        if (data.object === 'page') {
            data.entry.forEach(function(entry) {
                var pageID = entry.id;
                var timeOfEvent = entry.time;
                entry.messaging.forEach(function(msg) {
                    if (msg.message) {
                        receivedMessage(msg);
                    } else {
                        console.log("Webhook received unknown event: ", event);
                    }
                });
            });
        }
        var response = {
            'body': "ok",
            'statusCode': 200
        };
        callback(null, response);
    }
}
