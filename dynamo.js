'use strict'
const https = require('https');
const AWS = require('aws-sdk');
module.exports = {
  async userInit (user) {
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
                                  "lastName": user.last_name,
                                  "bfAccount": JSON.stringify({ status: 'unlinked'})
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
      async linkUser (userId) {
        return new Promise(function(resolve, reject){

          AWS.config.region = 'us-west-2';
          const docClient = new AWS.DynamoDB.DocumentClient();
          const table = 'BerkeyBotUsers';
        //  const userId = Number(user.Items[0].id);
          let params = {
              TableName: table,
              Key:{ "id" : Number(userId) },
              UpdateExpression: "SET bfAccount = :x",
              ExpressionAttributeValues: {
                ":x": '{ "status" : "linked"}'
              },
              ReturnValues: "UPDATED_NEW"
          };

          docClient.update(params, (err, data) => {

            if (err) {
                console.log("Error linking user in DB! " + JSON.stringify(err));
                resolve(err);
            } else {
                console.log("User account linked woo" + JSON.stringify(data));
                resolve(data);
            }

          });

        });
      }
}
