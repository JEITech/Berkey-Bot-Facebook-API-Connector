'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const ops = require('./ops');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
module.exports = {
    //Accepts message string, userID, and callback function.  Send message to Lex to process.
    async lexify(messageText, senderID) {
        return new Promise(async (resolve, reject) => {
            function regx(str) {
                return JSON.parse(JSON.stringify(str).replace(/\\"/g, '"').replace(/\"{/g, '{').replace(/\"}]}"/g, '"}]}'));
            }

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
            const init = await send(params);
            //console.log(init);
            if (init.intentName == null) {
                const messageStrings = userInput.split(' ');
                const intents = [];
                let logStr = 'Log info! :';

                function dupes(arr, lexer) {
                    for (let j = 0; j < arr.length; j++) {
                        if (arr[j].intentName == lexer.intentName) {
                            return false;
                        }
                    }
                    return true;
                };
                for (let i = 0; i < messageStrings.length; i++) {
                    logStr += 'Iteration ' + i + ' ---- ';
                    if (messageStrings[i] !== '') {
                        params.inputText = messageStrings[i];
                        logStr += ' params updated ' + JSON.stringify(params);
                        let lexer = await send(params);
                        logStr += 'Posting to lex now ---- ';
                        logStr += JSON.stringify(lexer);
                        console.log(JSON.stringify(lexer));
                        let checkDupes = dupes(intents, lexer);
                        if (checkDupes && typeof lexer.intentName == 'string' && lexer.message !== 'none' && lexer.intentName !== 'Bye' && lexer.intentName !== 'Sorry' && lexer.intentName !== 'Initialize' && lexer.intentName !== 'GoAway' && lexer.intentName !== 'Thanks' && lexer.intentName !== 'Hi' && lexer.intentName !== 'Help' && lexer.intentName !== 'Insult') {
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
                if (intents.length > 1) {
                    init.multipleFound = true;
                    init.multiple = intents;
                    resolve(init)
                } else if (intents.length == 1) {
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
    }
}
