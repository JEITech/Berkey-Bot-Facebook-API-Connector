'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const ops = require('./ops');
const dynamo = require('./dynamo');
const fb = require('./fb');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
const dashbot = require('dashbot')('I4vdS0iOwt8e18MHGntI1UlnvpNzsDrKueFE8qLH').generic;
//Define classes
class dashData {
    constructor(text, userId, fb) {
        this.text = text;
        this.userId = userId;
        this.fb = fb;
    }
}
//Sends data to Dashbot when interaction is complete
function dashbotEnd(data) {
    dashbot.logOutgoing(data, {
        'body': "ok",
        'statusCode': 200
    });
}
//Accepts new messsage event object.  Sends the message to Lex, then responds to the user
async function respond(event, user) {
    const senderID = event.sender.id;
    const message = event.message;
    const messageId = message.mid;
    const messageText = message.text;
    const messageAttachments = message.attachments;
    const messageQr = message.quick_reply;
    //Check if message is text or multi-media
    if (messageText) {
        //Leave message as seen for 1 second, then send typing bubble
        setTimeout(async function() {
            await fb.typing(senderID);
            //After typing bubble is sent, process the message in lex and determine a response
            let lexData;
            if (typeof messageQr == 'undefined') {
                lexData = await ops.lexify(messageText, senderID);
            } else {
                lexData = await ops.lexify(messageQr.payload, senderID);
            }
            if (lexData.multipleFound) {
                const intents = [];
                for (let i = 0; i < lexData.multiple.length; i++) {
                    let qr = [];
                    qr.push(lexData.multiple[i].intentName);
                    qr.push(lexData.multiple[i].intentName);
                    intents.push(qr);
                }
                await fb.sendQuickReplies(senderID, intents, 'I detected multiple questions!  I can only handle one at a time.  Were you asking about one of these topics?');
            } else {
                if (lexData.intentName == null) {
                    //No intent has been found, ask the user to rephrase their message
                    setTimeout(async function() {
                        const greet = "Hello, " + user.first_name + "!";
                        await fb.sendTextMessage(senderID, greet)
                        await fb.sendTextMessage(senderID, "I'm sorry, I wasn't quite able to understand you.  I've made a note of this so someone can help teach me how to respond to this!");
                        fb.sendButton(senderID, { type: 'phone_number', title: 'Call Berkey Filters', payload: '1-800-350-4170' }, "If I haven't been very helpful, please give us a call!");
                    }, 2000);
                } else {
                    //Check if there are multiple messages to send, or just one
                    if (typeof lexData.message.messages !== 'undefined') {
                        //Send array of messages to user in proper order
                        const greet = "Hello, " + user.first_name + "!";
                        await fb.sendTextMessage(senderID, greet);
                        setTimeout(async () => {
                            await fb.sendMultipleMessages(senderID, lexData.message.messages);
                            switch (lexData.intentName) {
                                case ('Initialize'):
                                    await fb.sendGif(senderID, 'Greetings');
                                    await fb.sendQuickReplies(senderID, [
                                        ['Yes', 'Please link my account'],
                                        ['No', 'Do not link my account']
                                    ], 'Do you have a BerkeyFilters.com account?');
                                    break;
                                case ('whyLink'):
                                    await fb.sendQuickReplies(senderID, [
                                        ["I'm in!", 'Please link my account'],
                                        ['No thanks', 'Do not link my account']
                                    ], 'Would you like to link your BerkeyFilters.com account?');
                                    break;
                                case ('Help'):
                                case ('HowAreYou'):
                                    break;
                                default:
                                    await fb.sendQuickReplies(senderID, [
                                        ['This helped, thanks!', 'Thanks'],
                                        ["This didn't help.", 'I need a human']
                                    ], 'Was I able to help?');
                            }
                            let analytics = new dashData(messageText, senderID, event);
                            analytics.intent = { "name": lexData.intentName };
                            dashbot.logOutgoing(analytics);
                        }, 2000);
                    } else {
                        setTimeout(async function() {
                            //Send single message to user
                            if (lexData.message !== 'linkingCompleted') {
                                await fb.sendTextMessage(senderID, lexData.message);
                            }
                            //Switch based off intent to determine any further actions
                            switch (lexData.intentName) {
                                case ('Hi'):
                                    fb.sendGif(senderID, 'Hello');
                                    break;
                                case ('Insult'):
                                    fb.sendGif(senderID, 'Sad');
                                    break;
                                case ('Love'):
                                    fb.sendGif(senderID, 'Happy');
                                    break;
                                case ('Bye'):
                                    fb.sendGif(senderID, 'Goodbye');
                                    break;
                                case ('Joke'):
                                    fb.sendGif(senderID, 'Funny');
                                    break;
                                case ('yesLink'):
                                    if (lexData.dialogState == 'ElicitSlot' && lexData.slotToElicit == 'email') {
                                        fb.sendQuickReplies(senderID, [
                                            ['email']
                                        ], 'If this is not your email address, please type it in!');
                                    } else if (lexData.dialogState == 'Fulfilled' && lexData.message == 'linkingCompleted') {
                                        //const storeData = await magento.getUserByEmail(lexData.slots);
                                        fb.sendTextMessage(senderID, 'Awesome, your account has been linked!');
                                        const req = await dynamo.linkUser(senderID);
                                    }
                                    break;
                                case ('needHuman'):
                                    fb.sendButton(senderID, { type: 'phone_number', title: 'Call Berkey Filters', payload: '1-800-350-4170' }, 'Here you go!');
                                    break;
                                case ('Thanks'):
                                case ('GoAway'):
                                case ('HowAreYou'):
                                case ('noLink'):
                                case ('whyLink'):
                                case ('Humans'):
                                case ('Sorry'):
                                case ('OrderStatus'):
                                    break;
                                default:
                                    await fb.sendQuickReplies(senderID, [
                                        ['This helped, thanks!', 'Thanks'],
                                        ["This didn't help.", 'I need a human']
                                    ], 'Was I able to help you today?');
                            };
                            let analytics = new dashData(messageText, senderID, event);
                            analytics.intent = { "name": lexData.intentName };
                            dashbot.logOutgoing(analytics);
                        }, 2000);
                    }
                }
            }
        }, 1000);
    } else if (messageAttachments) {
        //Respond to media with a thumbs up and a GIF
        setTimeout(async function() {
            await fb.typing(senderID);
            setTimeout(async function() {
                //Send unicode for thumbsup emoji as string
                await fb.sendTextMessage(senderID, "\ud83d\udc4d");
                fb.sendGif(senderID, 'Thumbs up');
                let analytics = new dashData(message.text, event.sender.id, msg);
                analytics.intent = { "name": 'MediaMessage' };
                dashbot.logIncoming(analytics);
            }, 1000);
        }, 1000);
    }
}
exports.handler = (event, context, callback) => {

  console.log(JSON.stringify(event));
    //Check if need to verify FB Webhook
    if (event.queryStringParameters) {
        //Verify FB Webhook
        fb.fbVerify(event);
    } else {
        //Validate incoming data as proper message object
        let data;
        if (typeof(event.body) == 'string') {
            data = JSON.parse(event.body);
        } else {
            data = event.body;
        }
        if (data.object === 'page') {
            //Handle each incoming message
            data.entry.forEach(function(entry) {
                entry.messaging.forEach(async function(msg) {
                    if (msg.message) {
                        fb.seen(msg.sender.id);
                        let analytics = new dashData(msg.message.text, msg.sender.id, msg);
                        dashbot.logIncoming(analytics);
                        let user = await fb.getUserData(msg);
                        user.goodId = msg.sender.id;
                        msg.dynamoData = await dynamo.userInit(user);
                        respond(msg, user);
                    } else if (msg.postback) {
                        fb.seen(msg.sender.id);
                        let user = await fb.getUserData(msg);
                        user.goodId = msg.sender.id;
                        msg.dynamoData = await dynamo.userInit(user);
                        msg.message = { text: msg.postback.payload };
                        respond(msg);
                    }
                });
            });
        }
        //Respond with status code 200 once execution is complete
        const response = {
            'body': "ok",
            'statusCode': 200
        };
        callback(null, response);
    }
}
