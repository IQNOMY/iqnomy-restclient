# iqnomy-restclient
IQNOMY API client with credential authentication

## Description
Use this Node.js module for accessing the [IQNOMY API](https://api.iqnomy.com/?url=https://myliquidsuite-api.iqnomy.com/api/swagger.json).
This module will need credentials for authentication. It will store an access token in the current working folder and will refresh it when necessary.

## Example
The following piece of code will get all registered industries:
```
var iqRestClient = require("iqnomy-restclient");
iqRestClient.get("liquidaccount/industry").then(function($data) {
	console.log($data);
}, function($err) {
	console.log($err);
});
```
