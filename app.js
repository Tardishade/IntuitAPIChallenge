'use strict'

var http = require('http');
var port = process.env.PORT || 3000;
var request = require('request');
var qs = require('querystring');
var util = require('util');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var express = require('express');
var app = express();
var pug = require('pug');
// Quickbooks
var QuickBooks = require('node-quickbooks');
var Tokens = require('csrf');
var csrf = new Tokens();
// Mongodb
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var url = 'mongodb://localhost:27017/homigoChallenge';
var mongot = require('./mongotest.js');

// Attributes to search for
var attributeArray = ["Customers", "Bills", "Invoice"];

QuickBooks.setOauthVersion('2.0');

app.set('port', port);
app.set('views', 'views');
app.set('view engine', 'pug');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser('brad'));
app.use(session({ resave: false, saveUninitialized: false, secret: 'smith' }));

// Server Starts
app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});

// Keys for OAuth
var consumerKey = 'Q0WQ157ddpeqVlHdbb24Cz6TUyi0d92WFcS8G2FbhkjZ0FDbUu';
var consumerSecret = 'Z21ACXJrTTLbpzBSppvJu2HGmQXFjnIOms81Hzag';

// First route
app.get('/', function (req, res) {
  res.redirect('/start');
});

// Start route
app.get('/start', function (req, res) {
  res.render('intuit.ejs', { locals: { port: port, appCenter: QuickBooks.APP_CENTER_BASE } });
});

// OAUTH 2 makes use of redirect requests
function generateAntiForgery (session) {
  session.secret = csrf.secretSync();
  return csrf.create(session.secret);
};

app.get('/requestToken', function (req, res) {
  var redirecturl = QuickBooks.AUTHORIZATION_URL +
    '?client_id=' + consumerKey +
    '&redirect_uri=' + encodeURIComponent('http://localhost:' + port + '/callback/') +
    '&scope=com.intuit.quickbooks.accounting' +
    '&response_type=code' +
    '&state=' + generateAntiForgery(req.session);

  res.redirect(redirecturl);
});

// Primary route, has to be accessed before accesing any of the others.
app.get('/callback', function (req, res) {
  var auth = (new Buffer(consumerKey + ':' + consumerSecret).toString('base64'));

  var postBody = {
    url: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + auth,
    },
    form: {
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: 'http://localhost:' + port + '/callback/'
    }
  };

  var mypost = request.post(postBody, function (e, r, data) {
        var accessToken = JSON.parse(r.body);

        // save the access token somewhere on behalf of the logged in user
        var qbo = new QuickBooks(consumerKey,
                                consumerSecret,
                                accessToken.access_token, /* oAuth access token */
                                false, /* no token secret for oAuth 2.0 */
                                req.query.realmId,
                                true, /* use a sandbox account */
                                true, /* turn debugging on */
                                4, /* minor version */
                                '2.0', /* oauth version */
                                accessToken.refresh_token /* refresh token */);


        app.get('/tables', function (req, res) {  
            
            MongoClient.connect(url, function(err, db) {
                assert.equal(null, err);
                console.log("Connected successfully to server");
                await sendStuff(db, qbo);
                
                
            });
        });
        
        app.get('/sync', function (req, res) {
            
            //replicate '/tables'
            
        });
    });

  res.send('<!DOCTYPE html><html lang="en"><head></head><body><script>window.opener.location.reload(); window.close();</script></body></html>');

});

async function myCustomers (qbo, attribute) {
    qbo.findCustomers(function (_, customers) {
        customers.QueryResponse.Customer.forEach((element) => { 
            mongot.insertDocument(db, attribute, element);
        });
    });    
}

async function myInvoices (qbo, attribute) {
    qbo.findInvoices(function (_, invoices) {
        invoices.QueryResponse.Invoice.forEach((element) => { 
            mongot.insertDocument(db, attribute, element);
        });
    });    
}

async function myBills (qbo, attribute, db) {
    qbo.findBills(function (_, bills) {
        customers.QueryResponse.Bill.forEach((element) => { 
            mongot.insertDocument(db, attribute, element);
        });
    });    
}



function sendStuff(db, qbo, callback) {
    
    attributeArray.forEach(function(attribute) { 

        await mongot.removeDocuments(db, attribute);
                            
        if (attribute === "Customers") {
            
            mongot.findDocuments(db, (result) => {
                sendObj[attribute] = mongot.createSpecialArray(attribute, result);
            });
                        
                });
            } else if (attribute === "Bills") {
                qbo.findBills(function (_, bills) {
                    bills.QueryResponse.Bill.forEach((element) => { 
                        mongot.insertDocument(db, attribute, element);
                        var docArr = [];
                        mongot.findDocuments(db, (result) => {
                            docArr = result;
                        }, attribute);
                        sendObj[attribute] = mongot.createSpecialArray(attribute, docArr);
                    });
                });
            } else {
                qbo.findInvoices(function (_, invoices) {
                    invoices.QueryResponse.Invoice.forEach((element) => { 
                        mongot.insertDocument(db, attribute, element);
                        var docArr = [];
                            mongot.findDocuments(db, (result) => {
                                docArr = result;
                            }, attribute);
                            sendObj[attribute] = mongot.createSpecialArray(attribute, docArr);
                    });
                });
            }
    });    
}

