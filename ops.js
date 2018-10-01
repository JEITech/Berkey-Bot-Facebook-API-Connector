'use strict'
const VERIFY_TOKEN = 'berkeyToken';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require('https');
const AWS = require('aws-sdk');
const ops = require('./ops');
const giphy = require('giphy-api')(process.env.GIPHY_ACCESS_TOKEN);
module.exports = {
    //Accepts userID.  Return "mark as seen" object for Send API.
    seen (recipientId) {
        const messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'mark_seen'
        }
        return messageData;
    },
    //Accepts userID.  Return "display typing bubble" object for Send API.
    typing (recipientId) {
        const messageData = {
            recipient: {
                id: recipientId
            },
            sender_action: 'typing_on'
        }
        return messageData;
    },
    //Accepts message string, userID, and callback function.  Send message to Lex to process.
    lexify (messageText, senderID) {
        return new Promise((resolve, reject) => {
            AWS.config.region = 'us-west-2';
            const lexruntime = new AWS.LexRuntime();
            const params = {
                botAlias: "BerkeyBot",
                botName: "BerkeyBot",
                inputText: messageText,
                userId: senderID,
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
    async dynamoCheck (user) {
            return new Promise(function(resolve, reject) {
                AWS.config.region = 'us-west-2';
                const docClient = new AWS.DynamoDB.DocumentClient();
                const table = 'BerkeyBotUsers';
                const userId = Number(user.goodId);
                let params = {
                    TableName: table,
                    KeyConditionExpression: "#iii = :psid",
                    ExpressionAttributeNames: { "#iii": "id" },
                    ExpressionAttributeValues: { ":psid": userId }
                }
                docClient.query(params, async (err, data) => {
                    if (err) {
                        console.log("Error accessing DB! " + JSON.stringify(err));
                        resolve();
                    } else {
                        if (data.Count == 0) {
                            console.log('Adding user');
                            params = {
                                TableName: table,
                                Item: {
                                    "id": userId,
                                    "firstName": user.first_name,
                                    "lastName": user.last_name
                                }
                            };
                            docClient.put(params, (err, data) => {
                                if (err) {
                                    console.log("Error adding user to DB! " + JSON.stringify(err));
                                    resolve();
                                } else {
                                    console.log("User added woo" + JSON.stringify(data));
                                    resolve(data);
                                }
                            });
                        } else {
                            resolve(data);
                        }
                    }
                });
            });
        },
        //Accepts event object.  Retrieves user data from FB
        getUserData (data) {
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
        callGiphyAPI (term, callback) {
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
        fbVerify (event) {
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
