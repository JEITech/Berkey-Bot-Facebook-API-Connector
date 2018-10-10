'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const ops = require('./ops');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
//For marking as seen or sending typing bubbles
class fbAction{
  constructor(recipientId, action){
    this.recipient = {"id": recipientId};
    this.sender_action = action;
  }
}
//For sending a standard text message
class fbMessage {
  constructor(recipientId, messageText){
    this.recipient = {"id": recipientId};
    this.message = {"text": messageText};
  }
}
//For sending media, quick replies, or other media messages
class fbAttachment {
  constructor(recipientId, type, payload){
    this.recipient = {"id": recipientId};
    this.message = {
      "attachment" : {
        "type": type,
        "payload": payload
      }
    }
  }
}
//Accepts a message object. sends message data to FB for delivery
function callSendAPI(data, intent) {
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

module.exports = {
  //Accepts userID.  Return "mark as seen" object for Send API.
  async seen(recipientId) {
      return new Promise(async (resolve, reject) => {
        let message = new fbAction(recipientId, 'mark_seen');
        let response = await callSendAPI(message);
        resolve(response);
      });
  },
  //Accepts userID.  Return "display typing bubble" object for Send API.
  async typing(recipientId) {
      return new Promise(async (resolve, reject) => {
        let message = new fbAction(recipientId, 'typing_on');
        let response = await callSendAPI(message);
        resolve(response);
      });
  },
  //Accepts userID and single message.  Sends message to user
  async sendTextMessage(recipientId, messageText) {
      return new Promise(async (resolve, reject) => {
          let message = new fbMessage(recipientId, messageText);
          let response = await callSendAPI(message);
          resolve(response);
      });
  },
  //Accepts userID, array of quick replies, and message.  Sends all to user.
  async sendQuickReplies(recipientId, data, str) {
      return new Promise(async (resolve, reject) => {
          let message = new fbMessage(recipientId, str);
          message.message.quick_replies = [];
          //Check for special use cases, default to for loop
          switch (data[0][0]) {
              case ('email'):
                  const qr = {
                      "content_type": "user_email"
                  }
                  message.message.quick_replies.push(qr);
                  await callSendAPI(message);
                  resolve();
                  break;
              default:
                  for (let i = 0; i < data.length; i++) {
                      let qr = {
                          "content_type": "text",
                          "title": data[i][0],
                          "payload": data[i][1]
                      }
                      message.message.quick_replies.push(qr);
                  }
                  //Send the quick replies
                  let response = await callSendAPI(message);
                  resolve(response);
          }
      });
  },
  //Accepts usderID, butotn object, and message.  Sends to user.
  async sendButton(recipientId, button, str){
    return new Promise(async (resolve, reject) => {
      //Define custom payload
      let payload = {
              template_type:"button",
              text: str,
              buttons:[
                {
                  type: button.type,
                  title: button.title,
                  payload: button.payload
                }
              ]
            }
      let message = new fbAttachment(recipientId, "template", payload)
      let response = await callSendAPI(message);
      resolve(response);

    });
  },
  //Accepts userID and search term for GIPHY api.  Calls the GIPHY api, then sends gif to user
  async sendGif(recipientId, term) {
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
              //Define custom payload
              let payload =  {
                              url: data,
                              is_reusable: false
                          }

              let message = new fbAttachment (recipientId, "image", payload);
              let response = await callSendAPI(message);
              resolve(response);
          });
      });
  },
  //Accepts userID and message array.  Sends all messages to user in proper order using async/await
  async sendMultipleMessages(recipientId, messageText) {
      return new Promise(async (resolve, reject) => {
          let deetz = [];
          for (var i = 0; i < messageText.length; i++) {
              //Buil message object
              let message = new fbMessage(recipientId, messageText[i].value);
              //Send message and wait for FB to confirm delivery before next loop iteration
              let response = await callSendAPI(message);
              deetz.push(response);
          }
          resolve(deetz);
      });
  },
    //Accepts event object.  Retrieves user data from FB
    getUserData(data) {
        return new Promise(function(resolve, reject) {
            const body = JSON.stringify(data);
            const path = 'https://graph.facebook.com/' + data.sender.id + '?fields=first_name,last_name&access_token=' + PAGE_ACCESS_TOKEN;
            https.get(path, (res) => {
                let str = '';
                res.on('data', (chunk) => { str += chunk; });
                res.on('end', () => {
                    var data = JSON.parse(str);
                    resolve(data);
                });
            });
        });
    },
    //Accepts Lambda event object.  Verifies webhook access for FB.
    fbVerify(event) {
        const queryParams = event.queryStringParameters;
        const rVerifyToken = queryParams['hub.verify_token']
        if (rVerifyToken === VERIFY_TOKEN) {
            const challenge = queryParams['hub.challenge']
            const response = {
                'body': parseInt(challenge),
                'statusCode': 200
            };
            callback(null, response);
        } else {
            const response = {
                'body': 'Error, wrong validation token',
                'statusCode': 422
            };
            callback(null, response);
        }
    }
}
