'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const ops = require('./ops');
const dynamo = require('./dynamo');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
//Accepts userID and single message.  Sends message to user
async function sendTextMessage(recipientId, messageText) {
    return new Promise(async (resolve, reject) => {
        const messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: messageText
            }
        };
        //Send the message
        await callSendAPI(messageData);
        resolve();
    });
}
//Accepts userID, array of quick replies, and message.  Sends all to user.
async function sendQuickReplies(recipientId, data, str) {
    return new Promise(async (resolve, reject) => {
        const messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: str,
                quick_replies: []
            }
        }
        //Check for special use cases, default to for loop
        switch (data[0][0]) {
            case ('email'):
                const qr = {
                    "content_type": "user_email"
                }
                messageData.message.quick_replies.push(qr);
                await callSendAPI(messageData);
                resolve();
                break;
            default:
                for (let i = 0; i < data.length; i++) {
                    let qr = {
                        "content_type": "text",
                        "title": data[i][0],
                        "payload": data[i][1]
                    }
                    messageData.message.quick_replies.push(qr);
                }
                await callSendAPI(messageData);
                resolve();
        }
    });
}
async function sendButton(recipientId, button, str){
  return new Promise(async (resolve, reject) => {
    const messageData = {
      recipient:{
        id:recipientId
      },
      message:{
        attachment:{
          type:"template",
          payload:{
            template_type:"button",
            text:str,
            buttons:[
              {
                type: button.type,
                title: button.title,
                payload: button.payload
              }
            ]
          }
        }
      }
    }
    //Send the button
    await callSendAPI(messageData);
    resolve();

  });
}
//Accepts userID and search term for GIPHY api.  Calls the GIPHY api, then sends gif to user
async function sendGif(recipientId, term) {
    return new Promise(async (resolve, reject) => {
        //Call the GIPHY API
        ops.callGiphyAPI(term, async function(data) {
            try {
                data = data.data.images.fixed_width.url;
            } catch (err) {
                resolve();
            }
            if (typeof data !== 'string') {
                data = JSON.stringify(data);
            }
            const messageData = {
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
            await callSendAPI(messageData);
            resolve();
        });
    });
}
//Accepts userID and message array.  Sends all messages to user in proper order using async/await
async function sendMultipleMessages(recipientId, messageText) {
    return new Promise(async (resolve, reject) => {
        let messageData = {};
        for (var i = 0; i < messageText.length; i++) {
            messageData = {
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
        resolve();
    });
}
//Accepts a message object. sends message data to FB for delivery
function callSendAPI(data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const path = '/v2.6/me/messages?access_token=' + PAGE_ACCESS_TOKEN;
        const options = {
            host: "graph.facebook.com",
            path: path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const callback = function(res) {
            let str = '';
            res.on('data', (chunk) => { str += chunk; });
            res.on('end', () => { resolve(str); });
        }
        const req = https.request(options, callback);
        req.write(body);
        req.end();
    });
}
//Accepts new messsage event object.  Sends the message to Lex, then responds to the user
async function respond(event, user) {
    const senderID = event.sender.id;
    const recipientID = event.recipient.id;
    const timeOfMessage = event.timestamp;
    const message = event.message;
    const messageId = message.mid;
    const messageText = message.text;
    const messageAttachments = message.attachments;
    const messageQr = message.quick_reply;
    //Check if message is text or multi-media
    if (messageText) {
        //Leave message as seen for 1 second, then send typing bubble
        setTimeout(async function() {
            await callSendAPI(ops.typing(senderID));
            //After typing bubble is sent, process the message in lex and determine a response
            let lexData;
            if (typeof messageQr == 'undefined') {
                lexData = await ops.lexify(messageText, senderID);
            } else {
                lexData = await ops.lexify(messageQr.payload, senderID);
            }
            console.log(lexData);
            console.log("Hello");
            if(lexData.multipleFound){
              console.log("Send the QRs");
              const intents = [];

              for(let i = 0; i < lexData.multiple.length; i++){

                let qr = [];
                qr.push(lexData.multiple[i].intentName);
                qr.push(lexData.multiple[i].intentName);
                intents.push(qr);

              }
              console.log(intents);
              await sendQuickReplies(senderID, intents, 'I detected multiple questions!  I can only handle one at a time.  Were you asking about one of these topics?');
              console.log("Sent QRs");
            }else{
              if (lexData.intentName == null) {
                  //No intent has been found, ask the user to rephrase their message
                  setTimeout(async function() {
                      const greet = "Hello, " + user.first_name + "!";
                      await sendTextMessage(senderID, greet )
                      await sendTextMessage(senderID, "I'm sorry, I wasn't quite able to understand you.  I've made a note of this so someone can help teach me how to respond to this!");
                      sendButton(senderID, { type: 'phone_number', title: 'Call Berkey Filters', payload: '1-800-350-4170'}, "If I haven't been very helpful, please give us a call!");
                  }, 2000);
              } else {
                  //Check if there are multiple messages to send, or just one
                  if (typeof lexData.message.messages !== 'undefined') {
                      //Send array of messages to user in proper order
                      const greet = "Hello, " + user.first_name + "!";
                      await sendTextMessage(senderID, greet);
                      setTimeout(async () => {
                          await sendMultipleMessages(senderID, lexData.message.messages);
                          switch (lexData.intentName) {
                              case ('Initialize'):
                                  await sendGif(senderID, 'Greetings');
                                  await sendQuickReplies(senderID, [
                                      ['Yes', 'Please link my account'],
                                      ['No', 'Do not link my account']
                                  ], 'Do you have a BerkeyFilters.com account?');
                                  break;
                              case ('whyLink'):
                                  await sendQuickReplies(senderID, [
                                      ["I'm in!", 'Please link my account'],
                                      ['No thanks', 'Do not link my account']
                                  ], 'Would you like to link your BerkeyFilters.com account?');
                                  break;
                              case ('Help'):
                              case ('HowAreYou'):
                              break;
                              default:
                                await sendQuickReplies(senderID, [
                                  ['This helped, thanks!', 'Thanks'],
                                  ["This didn't help.", 'I need a human']
                                ], 'Was I able to help?');
                          }
                      }, 2000);
                  } else {
                      setTimeout(async function() {
                          //Send single message to user
                          if (lexData.message !== 'linkingCompleted') {
                        
                              await sendTextMessage(senderID, lexData.message);
                          }
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
                                  break;
                              case ('Joke'):
                                  sendGif(senderID, 'Funny');
                                  break;
                              case ('yesLink'):
                                  if (lexData.dialogState == 'ElicitSlot' && lexData.slotToElicit == 'email') {
                                      sendQuickReplies(senderID, [
                                          ['email']
                                      ], 'If this is not your email address, please type it in!');
                                  } else if (lexData.dialogState == 'Fulfilled' && lexData.message == 'linkingCompleted') {
                                      //const storeData = await magento.getUserByEmail(lexData.slots);
                                      sendTextMessage(senderID, 'Awesome, your account has been linked!');
                                      const req = await dynamo.linkUser(senderID);
                                  }
                                  break;

                              case ('needHuman'):
                                  sendButton(senderID, { type: 'phone_number', title: 'Call Berkey Filters', payload: '1-800-350-4170'}, 'Here you go!');
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
                              await sendQuickReplies(senderID, [
                                ['This helped, thanks!', 'Thanks'],
                                ["This didn't help.", 'I need a human']
                              ], 'Was I able to help you today?');
                          }
                      }, 2000);
                  }
              }
            }

        }, 1000);
    } else if (messageAttachments) {
        //Respond to media with a thumbs up and a GIF
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
exports.handler =  (event, context, callback) => {
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
            //Handle each incoming message
            data.entry.forEach(function(entry) {
                entry.messaging.forEach(async function(msg) {
                    if (msg.message) {
                        callSendAPI(ops.seen(msg.sender.id));
                        let user = await ops.getUserData(msg);
                        user.goodId = msg.sender.id;
                        msg.dynamoData = await dynamo.userInit(user);
                        respond(msg, user);
                    } else if (msg.postback) {
                        callSendAPI(ops.seen(msg.sender.id));
                        let user = await ops.getUserData(msg);
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
