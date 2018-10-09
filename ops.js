'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const ops = require('./ops');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
module.exports = {
    //Accepts userID.  Return "mark as seen" object for Send API.
    seen(recipientId) {
        const messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'mark_seen'
        }
        return messageData;
    },
    //Accepts userID.  Return "display typing bubble" object for Send API.
    typing(recipientId) {
        const messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'typing_on'
        }
        return messageData;
    },
    //Accepts message string, userID, and callback function.  Send message to Lex to process.
    async lexify(messageText, senderID) {
        return new Promise(async (resolve, reject) => {
            const userInput = messageText;
            AWS.config.region = 'us-west-2';
            const lexruntime = new AWS.LexRuntime();
            const params = {
                botAlias: "BerkeyBot",
                botName: "BerkeyBot",
                inputText: messageText,
                userId: senderID,
                sessionAttributes: {}
            };
            function send(params) {
                return new Promise((resolve, reject) => {
                    lexruntime.postText(params, function(err, data) {
                        if (err) {
                            resolve(err);
                        } else {
                            data = regx(data);
                            resolve(data);
                        }
                    });
                });
            };

            function regx(str) {
                return JSON.parse(JSON.stringify(str).replace(/\\"/g, '"').replace(/\"{/g, '{').replace(/\"}]}"/g, '"}]}'));
            }
            const init = await send(params);
            //console.log(init);
            if (init.intentName == null) {
                const messageStrings = userInput.split(' ');

                const intents = [];
                let logStr = 'Log info! :';
                function dupes(arr, lexer){
                  for(let j=0; j<arr.length; j++){
                    if(arr[j].intentName == lexer.intentName ){
                      return false;
                    }
                  }
                  return true;
                };
                for (let i = 0; i < messageStrings.length; i++) {
                      logStr += 'Iteration ' + i + ' ---- ';
                      if(messageStrings[i] !== ''){
                      params.inputText = messageStrings[i];
                      logStr += ' params updated ' + JSON.stringify(params);

                      let lexer = await send(params);

                      logStr += 'Posting to lex now ---- ';
                      logStr += JSON.stringify(lexer);
                      console.log(JSON.stringify(lexer));
                      let checkDupes = dupes(intents, lexer);
                      if (checkDupes && typeof lexer.intentName == 'string' && lexer.message !== 'none' && lexer.intentName !== 'Bye' && lexer.intentName !== 'GoAway' && lexer.intentName !== 'Thanks' && lexer.intentName !== 'Hi' && lexer.intentName !== 'Help' && lexer.intentName !== 'Insult') {
                          logStr += 'Should push to intents now';
                          console.log("Pushing to intents " + JSON.stringify(lexer))
                          intents.push(lexer);

                      }
                      logStr += 'End of log for iteration ' + i + '.'
                  }
                }
                console.log('Hello');
                console.log(intents);
                console.log(logStr);
                if(intents.length > 1){
                  init.multipleFound = true;
                  init.multiple = intents;
                  resolve(init)
                }else if(intents.length == 1){
                  console.log('Only 1 found');
                  intents[0].multipleFound = false;
                  resolve(intents[0]);
                } else if (intents.length == 0) {
                    init.multipleFound = false;
                    resolve(init);
                }
            } else {
                init.multipleFound = false;
                resolve(init);
            }
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
    //Accepts search term and callback function.  Configures GIPHY search object, and sends API response to the callback.
    callGiphyAPI(term, callback) {
        giphy.translate({
            rating: 'y',
            fmt: 'json',
            s: term,
            limit: 1
        }, function(err, res) {
            callback(res);
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
