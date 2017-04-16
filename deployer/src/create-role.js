// @flow
const AWS      = require('aws-sdk')
const execSync = require('child_process').execSync
const fs       = require('fs')
const Promise  = require('bluebird')

AWS.config.loadFromPath('./config.json');

const SOURCE_BUCKET = 'danstutzman-lambda-example'
const TARGET_BUCKET = `${SOURCE_BUCKET}resized`
const FUNCTION_NAME = 'CreateThumbnail'
const EXECUTION_ROLE_NAME = `lambda-${FUNCTION_NAME}-execution`
const EXECUTION_POLICY_NAME = `lambda-${FUNCTION_NAME}-execution-access`
const ROLE_WAIT_SECONDS = 8

// Returns Promise with ARN
function createIamRoleIdempotent(roleName:string) {
  return new Promise(function(resolve, reject) {
    getArnForIamRole(roleName).then(function(arn) {
      resolve(arn)
    }).catch(function(err) {
      if (err.code === 'NoSuchEntity') {
        console.log('Wait %d seconds for role to be created...', ROLE_WAIT_SECONDS)
        setTimeout(function() {
          resolve(createIamRoleNonIdempotent(roleName))
        }, ROLE_WAIT_SECONDS * 1000)
      } else {
        reject(err)
      }
    })
  })
}

function getArnForIamRole(roleName:string) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting IAM.getRole for role name '${roleName}'...`)
    new AWS.IAM().getRole({
      RoleName: roleName,
    }, function(err, data) {
      if (err) {
        reject(err)
      } else {
        if (data && data['Role']) {
          const arn = data['Role']['Arn']
          resolve(arn)
        } else {
          reject(`Bad data from getRole: ${JSON.stringify(data)}`)
        }
      }
    })
  })
}

// Returns Promise with ARN
function createIamRoleNonIdempotent(roleName:string) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting IAM.createRole for role name '${roleName}'...`)
    new AWS.IAM().createRole({
      AssumeRolePolicyDocument: JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
              "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }),
      Path: "/",
      RoleName: roleName,
    }, function(err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(getArnForIamRole(roleName))
      }
    })
  })
}

// Returns promise with no data
function putRolePolicyIdempotent(roleName:string,
    lambdaExecutionAccessPolicyName:string, sourceBucket:string, targetBucket:string) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting IAM.putRolePolicy for role name '${roleName}'...`)
    new AWS.IAM().putRolePolicy({
      RoleName: roleName,
      PolicyName: lambdaExecutionAccessPolicyName,
      PolicyDocument: JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "logs:*"
            ],
            "Resource": "arn:aws:logs:*:*:*"
          },
          {
            "Effect": "Allow",
            "Action": [
              "s3:GetObject"
            ],
            "Resource": `arn:aws:s3:::${sourceBucket}/*`
          },
          {
            "Effect": "Allow",
            "Action": [
              "s3:PutObject"
            ],
            "Resource": `arn:aws:s3:::${targetBucket}/*`
          }
        ]
      })
    }, function(err, data) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}


// TODO: remove dependency on CreateThumbnail.zip
function createFunction(functionName:string, executionRoleArn:string) {

  if (false) {

    /*
  return new Promise(function(resolve, reject) {
    console.log(`Requesting Lambda.createFunction for name '${functionName}'...`)
    new AWS.Lambda().createFunction({
      FunctionName: functionName,
      Role: executionRoleArn,
      Timeout: 30,
      Runtime: 'nodejs4.3',
      Code: {
        ZipFile: fs.readFileSync('../deployed/build/CreateThumbnail.zip'),
      },
      Handler: `${FUNCTION_NAME}.handler`,
    }, function(err, data) {
      if (err) {
        reject(err)
      } else {
        if (data && data['FunctionArn']) {
          resolve(data['FunctionArn'])
        } else {
          throw new Error(`Couldn't find functionArn in result from createFunction: ${
            JSON.stringify(data)}`)
        }
      }
    })
  })
  */
}
}

// Returns Promise with functionArn as data
function createFunctionIdempotent(functionName:string, executionRoleArn:string) {
  return new Promise(function(resolve, reject) {
    const gitSha1 = execSync('git rev-parse HEAD').toString().trim()
    if (!fs.existsSync(`../deployed/build/${gitSha1}.zip`)) {
      const zipCommand = `cd ../deployed && npm install && mkdir -p build &&
        zip -r -q build/${gitSha1}.zip src/CreateThumbnail.js node_modules`
      console.log(`Executing ${zipCommand}...`)
      console.log(execSync(zipCommand).toString())
    }
    reject()
  })
  /*
  return new Promise(function(resolve, reject) {
    console.log(
      `Requesting Lambda.listVersionsByFunction for name '${functionName}'...`)
    new AWS.Lambda().listVersionsByFunction({
      FunctionName: functionName,
    }, function(err, data) {
      if (err) {
        if (err.code === 'ResourceNotFoundException') {
          resolve(createFunction(functionName, executionRoleArn))
        } else {
          reject(err)
        }
      } else {
        if (!data || !data.Versions) {
          reject(`Couldn't find Versions in: ${JSON.stringify(data)}`)
        } else {
          let functionArn;
          for (const version of (data.Versions:any)) {
            if (version.Version === '$LATEST') {
              functionArn = version['FunctionArn'].replace(/:\$LATEST$/, '')
            }
          }
          if (functionArn) {
            resolve(functionArn)
          } else {
            reject(
              `Couldn't find functionArn in versions: ${JSON.stringify(data)}`)
          }
        }
      }
    })
  })
  */
}

function invokeFunction(functionName:string, sourceBucket:string) {
  return new Promise(function(resolve, reject) {
    console.log(
      `Requesting Lambda.invokeFunction for name '${functionName}'...`)
    new AWS.Lambda().invoke({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      LogType: 'Tail',
      Payload: JSON.stringify({
        "Records":[
          {
             "eventVersion":"2.0",
             "eventSource":"aws:s3",
             "awsRegion":"us-east-1",
             "eventTime":"1970-01-01T00:00:00.000Z",
             "eventName":"ObjectCreated:Put",
             "userIdentity":{
                "principalId":"AIDAJDPLRKLG7UEXAMPLE"
             },
             "requestParameters":{
                "sourceIPAddress":"127.0.0.1"
             },
             "responseElements":{
                "x-amz-request-id":"C3D13FE58DE4C810",
                "x-amz-id-2":"FMyUVURIY8/IgAtTv8xRjskZQpcIZ9KG4V5Wp6S7S/JRWeUWerMUE5JgHvANOjpD"
             },
             "s3":{
                "s3SchemaVersion":"1.0",
                "configurationId":"testConfigRule",
                "bucket":{
                   "name":sourceBucket,
                   "ownerIdentity":{
                      "principalId":"A3NL1KOZZKExample"
                   },
                   "arn":`arn:aws:s3:::${sourceBucket}`
                },
                "object":{
                   "key":"HappyFace.jpg",
                   "size":1024,
                   "eTag":"d41d8cd98f00b204e9800998ecf8427e",
                   "versionId":"096fKKXTRTtl3on89fVO.nfljtsv6qko"
                }
             }
          }
        ]
      }),
    }, function(err, data) {
      if (err) {
        reject(err)
      } else {
        if (data && data['LogResult']) {
          const base64LogText = data['LogResult']
          resolve(Buffer.from(base64LogText, 'base64').toString())
        } else {
          reject(`Unexpected response from invokeFunction: ${JSON.stringify(data)}`)
        }
      }
    })
  })
}

function putBucketNotification(sourceBucket:string, functionArn:string) {
  console.log('functionArn', functionArn)
  return new Promise(function(resolve, reject) {
    console.log(`Requesting Lambda.putBucketNotification...`)
    new AWS.S3().putBucketNotification({
      Bucket: sourceBucket,
      NotificationConfiguration: {
        CloudFunctionConfiguration: {
          Event: "s3:ObjectCreated:*",
          CloudFunction: functionArn,
          Id: "CreateThumbnailStartingEvent",
        }
      },
    }, function(err, data) {
      if (err) {
        reject(JSON.stringify(err))
      } else {
        resolve()
      }
    })
  })
}

function addPermission(functionName:string, sourceBucket:string) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting Lambda.addPermission...`)
    new AWS.Lambda().addPermission({
      FunctionName: functionName,
      Action: 'lambda:InvokeFunction',
      Principal: 's3.amazonaws.com',
      StatementId: 'some-unique-id',
      SourceArn: `arn:aws:s3:::${sourceBucket}`,
    }, function(err, data) {
      if (err) {
        if (err.code === 'ResourceConflictException') { // already exists, so ignore
          resolve()
        } else {
          reject(err)
        }
      } else {
        resolve()
      }
    })
  })
}

function deleteFunction(functionName:string, ignoreIfNotExists:bool) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting Lambda.deleteFunction for '${functionName}'...`)
    new AWS.Lambda().deleteFunction({
      FunctionName: functionName,
    }, function(err, data) {
      if (err) {
        if (ignoreIfNotExists && err.code === 'ResourceNotFoundException') {
          resolve()
        } else {
          reject(err)
        }
      } else {
        resolve()
      }
    })
  })
}

function deleteRole(roleName:string, ignoreIfNotExists:bool) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting IAM.deleteRole for '${roleName}'...`)
    new AWS.IAM().deleteRole({
      RoleName: roleName,
    }, function(err, data) {
      if (err) {
        if (ignoreIfNotExists && err.code == 'NoSuchEntity') {
          resolve()
        } else {
          reject(err)
        }
      } else {
        resolve()
      }
    })
  })
}

function deleteRolePolicy(roleName:string, policyName:string, ignoreIfNotExists:bool) {
  return new Promise(function(resolve, reject) {
    console.log(`Requesting IAM.deleteRolePolicy for '${policyName}'...`)
    new AWS.IAM().deleteRolePolicy({
      RoleName: roleName,
      PolicyName: policyName,
    }, function(err, data) {
      if (err) {
        if (ignoreIfNotExists && err.code === 'NoSuchEntity') {
          resolve()
        } else {
          reject(err)
        }
      } else {
        resolve()
      }
    })
  })
}

if (false) {
  deleteFunction(FUNCTION_NAME, true).then(function() {
    deleteRolePolicy(EXECUTION_ROLE_NAME, EXECUTION_POLICY_NAME, true)
        .then(function() {
      deleteRole(EXECUTION_ROLE_NAME, true).then(function() {
        console.log('deleted')
      })
    })
  })
}
if (true) {
  createIamRoleIdempotent(EXECUTION_ROLE_NAME).then(function(executionRoleArn) {
    putRolePolicyIdempotent(EXECUTION_ROLE_NAME, EXECUTION_POLICY_NAME,
        SOURCE_BUCKET, TARGET_BUCKET).then(function() {
      createFunctionIdempotent(FUNCTION_NAME, executionRoleArn)
          .then(function(functionArn) {
        console.log('executionRoleArn', executionRoleArn)
        addPermission(FUNCTION_NAME, SOURCE_BUCKET).then(function() {
          putBucketNotification(SOURCE_BUCKET, functionArn).then(function() {
            console.log('put bucket notification')
            invokeFunction(FUNCTION_NAME, SOURCE_BUCKET).then(function(logText) {
              console.log('invoke', logText)
            })
          })
        })
      })
    })
  }).catch(function(err) {
    console.error('Error', err)
  })
}

/*
var crypto = require('crypto');
var path = require('path');
var lambda = new AWS.Lambda({
      region: 'us-west-2'
});
var filePath = path.resolve(__dirname, 'CreateThumbnail.zip');

new AWS.Lambda().getFunction({
      FunctionName: FUNCTION_NAME,
}, function (error, data) {
      if (error) {
                console.error(error);
                return process.exit(1);
            }
      var lambdaSha256 = (data:any).Configuration.CodeSha256;

      var shasum = crypto.createHash('sha256');
      fs.createReadStream(filePath)
      .on("data", function (chunk) {
                shasum.update(chunk);
            })
      .on("end", function () {
                var sha256 = shasum.digest('base64');
                console.log('sha256', sha256, 'on lambda:', lambdaSha256)
                if (sha256 === lambdaSha256) {
                              console.log("No need to upload, sha hashes are the same");
                          } else {
                                        console.log("That needs to be uploaded again son.")
                                    }
                process.exit();
            });
});
*/