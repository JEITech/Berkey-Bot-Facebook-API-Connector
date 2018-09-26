'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const request = require('request');
const ops = require('./ops');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
//Accepts userID and single message.  Sends message to user
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
        //Send the message
        callSendAPI(messageData).then(function() { resolve() });
    });
}
//Accepts userID and search term for GIPHY api.  Calls the GIPHY api, then sends gif to user
function sendGif(recipientId, term) {
    return new Promise(function(resolve, reject) {
        //Call the GIPHY API
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
                            is_reusable: false
                        }
                    }
                }
            };
            //Send the GIF
            callSendAPI(messageData).then(function() { resolve() });
        });
    });
}
//Accepts userID and message array.  Sends all messages to user in proper order using async/await
async function respond(recipientId, messageText) {
    for (var i = 0; i < messageText.length; i++) {
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: messageText[i].value
            }
        };
        //Send message and wait for FB to confirm delivery before next loop iteration
        await callSendAPI(messageData);
    }
}
//Accepts a message object. sends message data to FB for delivery
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
//Accepts new messsage event object.  Sends the message to Lex, then responds to the user
async function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;
    var messageId = message.mid;
    var messageText = message.text;
    var messageAttachments = message.attachments;
    //Check if message is text or multi-media
    if (messageText) {
        //Mark message as seen
        await callSendAPI(ops.seen(senderID));
        //Leave message as seen for 1 second, then send typing bubble
        setTimeout(async function() {
            await callSendAPI(ops.typing(senderID));
            //After typing bubble is sent, process the message in lex and determine a response
            const lexData = await ops.lexify(messageText, senderID);
            if (lexData.intentName == null) {
                //No intent has been found, ask the user to rephrase their message
                setTimeout(async function() {
                    await sendTextMessage(senderID, "I'm sorry, I wasn't quite able to understand you.  Could you try rephrasing your message for me?");
                    sendGif(senderID, 'Oops');
                }, 2000);
            } else {
                //Check if there are multiple messages to send, or just one
                if (typeof lexData.message.messages !== 'undefined') {
                    //Send array of messages to user in proper order
                    setTimeout(function() {

                      respond(senderID, lexData.message.messages);

                      

                    }, 2000);
                } else {
                    setTimeout(async function() {
                        //Send single message to user
                        await sendTextMessage(senderID, lexData.message);
                        //Switch based off intent to determine any further actions
                        switch (lexData.intentName) {
                            case ('Hi'):
                                sendGif(senderID, 'Hello');
                                break;
                            case ('Insult'):
                                sendGif(senderID, 'Sad');
                                break;
                            case ('Love'):
                                sendGif(senderID, 'Happy');
                                break;
                            case ('Bye'):
                                sendGif(senderID, 'Goodbye');
                            default:
                        }
                    });
                }
            }
        }, 1000);
    } else if (messageAttachments) {
        //Respond to media with a thumbs up and a GIF
        await callSendAPI(ops.seen(senderID))
        setTimeout(async function() {
            await callSendAPI(ops.typing(senderID));
            setTimeout(async function() {
                //Send unicode for thumbsup emoji as string
                await sendTextMessage(senderID, "\ud83d\udc4d");
                sendGif(senderID, 'Thumbs up');
            }, 1000);
        }, 1000);
    }
}
exports.handler = (event, context, callback) => {
    //Check if need to verify FB Webhook
    if (event.queryStringParameters) {
        //Verify FB Webhook
        ops.fbVerify(event);
    } else {
        //Validate incoming data as proper message object
        var data;
        if (typeof(event.body) == 'string') {
            data = JSON.parse(event.body);
        } else {
            data = event.body;
        }
        if (data.object === 'page') {
            //Send each new message to the message handler, receivedMessage();
            data.entry.forEach(function(entry) {
                entry.messaging.forEach(function(msg) {
                    if (msg.message) {
                        receivedMessage(msg);
                    }
                });
            });
        }
        //Respond with status code 200 once execution is complete
        var response = {
            'body': "ok",
            'statusCode': 200
        };
        callback(null, response);
    }
}
