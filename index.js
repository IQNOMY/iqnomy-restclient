/*
 * http://underscorejs.org/
 * Utility library
 */
var underscore = require("underscore");

/*
 * https://github.com/flatiron/prompt
 * For getting prompt info
 */
var prompt = require('prompt');

/*
 * http://unirest.io/nodejs
 * For REST calls
 */
var unirest = require('unirest');

/*
 * https://github.com/simonlast/node-persist
 * For persisting like a cache
 */
var storage = require('node-persist');
// you must first call storage.initSync
storage.initSync();

// Exporting module
var exports = {};
module.exports = exports;

var DEFAULT_KEY_KEYCLOAK_AUTHENTICATION = "credentials";

// Set defaults
var baseUrl = "https://myliquidsuite-api.iqnomy.com/api/";
var baseHeader = {"Content-Type": "application/json"};
var strictSSL = true;
var cacheAuthentication = true;
var requestToken = null;

var keycloakState = {
    access_token: null, // eslint-disable-line camelcase
    refresh_token: null, // eslint-disable-line camelcase
    username: null,
    password: null
};

// Init credentials
var savedCredentials = storage.getItemSync(DEFAULT_KEY_KEYCLOAK_AUTHENTICATION);
if (savedCredentials) {
    keycloakState.access_token = savedCredentials.accessToken; // eslint-disable-line camelcase
    keycloakState.refresh_token = savedCredentials.refreshToken; // eslint-disable-line camelcase
}

function Response($status, $message, $response) {
    this.status = $status;
    this.message = $message;
    this.response = $response;
}

Response.prototype.toString = function() {
    return JSON.stringify(this);
};

Response.prototype.isSuccess = function() {
    return (this.status > 199 && this.status < 299);
};

Response.prototype.getBody = function() {
    return this.response.raw_body;
};

Response.prototype.getJSON = function() {
    return this.response.body;
};

function createUrl($path) {
    return baseUrl + $path;
}

function createHeader() {
    return underscore.extend({}, baseHeader, {"Authorization": "Bearer " + keycloakState.access_token});
}

// Create the default response object that is expected
function createResponse(status, message, response) {
    return new Response(status, message, response);
}

function confirmPrompt($message, $callback) {
    prompt.start();
    prompt.get([
{
        name: 'action',
        description: $message,
        type: 'string',
        required: true,
        message: "Choose Y(es) or N(o)",
        conform: function($action) {
            return (typeof $action === 'string') && ($action.toLowerCase() === "y" || $action.toLowerCase() === "n");
        }
    }
], function($error, $results) {
        if ($error) {
            return $callback(false, $error);
        }
        return $callback($results.action.toLowerCase() === "y", null);
        
    });
}

function saveKeycloakCredentials($accessToken, $refreshToken) {
    storage.setItemSync(DEFAULT_KEY_KEYCLOAK_AUTHENTICATION, {
        accessToken: $accessToken,
        refreshToken: $refreshToken
    });
}

// Show the prompt to authenticate yourself
function authPrompt($request, $resolve, $reject) {
    console.log("Enter your keycloak credentials");
    prompt.start();
    prompt.get([
        {
            name: 'username',
            required: true
        },
        {
            name: 'password',
            hidden: true,
            required: true
        }
    ], function ($error, $results) {
        if ($error) {
            return $reject(createResponse(500, "Authentication error! " + $error));
        }
        // Adding auth info to context
        keycloakState.username = $results.username;
        keycloakState.password = $results.password;

        // Logging
        console.log("Using credentials:");
        console.log('  username: ' + keycloakState.username);
        console.log('  password: ' + "*".repeat(keycloakState.password.length));

        return requestToken($request, $resolve, $reject);
    });
}

// Authenticate
function authenticate($request, $resolve, $reject) {
    if (keycloakState.refresh_token) {
        requestToken($request, $resolve, $reject);
    } else {
        authPrompt($request, $resolve, $reject);
    }
}

function execute($request, $resolve, $reject) {
    var promiseHandler = function ($resolve, $reject) {
        // Update authentication
        $request.headers(createHeader()).end(function ($response) {
                if ($response.statusCode === 401) {
                    console.log("Authentication error: : " + $response.body.message + ". Need to authenticate.");
                    return authenticate($request, $resolve, $reject);
                }
                return $resolve(createResponse($response.status, null, $response));
            });
    };
    if ($resolve && $reject) {
        return promiseHandler($resolve, $reject)
    }
    return new Promise(promiseHandler);
}

// Request the keycloak token
requestToken = function($request, $resolve, $reject) {
    var url = "https://keycloak.iqnomy.com/auth/realms/IQNOMY/protocol/openid-connect/token";
    var headers = {"Content-Type": "application/x-www-form-urlencoded"};
    var body = null;
    
    if (keycloakState.refresh_token) {
        body = "grant_type=refresh_token&client_id=icookie-test&refresh_token=" + keycloakState.refresh_token;
        console.log("Refreshing keycloak token...");
    } else {
        body = "grant_type=password&client_id=icookie-test&username=" + keycloakState.username + "&password=" + keycloakState.password;
        console.log("Requesting keycloak token...");
    }
    
    unirest.post(url).
        headers(headers).
        send(body).
        end(function ($response) {
            if ($response.statusCode !== 200) {
                if (keycloakState.refresh_token) {
                    keycloakState.refresh_token = null; // eslint-disable-line camelcase
                    keycloakState.access_token = null; // eslint-disable-line camelcase

                    storage.removeItemSync(DEFAULT_KEY_KEYCLOAK_AUTHENTICATION);
                }

                console.log("Unable to request token: " + $response.body.message + ".");
                confirmPrompt('Do you want to retry?', function($confirm, $error) {
                    if ($error) {
                        return $reject(createResponse(500, "Confirm prompt error! " + $error));
                    }
                    if ($confirm) {
                        console.log("Retrying authentication...");
                        return authenticate($request, $resolve, $reject);
                    }
                        return $resolve(createResponse(401, "Not retrying."));
                    
                });
            } else {
                // Saving the token
                var auth = $response.body;
                keycloakState.access_token = auth.access_token; // eslint-disable-line camelcase
                keycloakState.refresh_token = auth.refresh_token; // eslint-disable-line camelcase

                // Cache credentials
                if (cacheAuthentication) {
                    saveKeycloakCredentials(auth.access_token, auth.refresh_token);
                }

                console.log("Authentication succes!");
                console.log("");
                console.log("Executing initial REST API request");
                return execute($request, $resolve, $reject);
            }
        });
};

exports.setAccessToken = function($accessToken) {
    keycloakState.access_token = $accessToken; // eslint-disable-line camelcase
};

exports.setRefreshToken = function($refreshToken) {
    keycloakState.refresh_token = $refreshToken; // eslint-disable-line camelcase
};

exports.setBaseUrl = function($baseUrl) {
    baseUrl = $baseUrl;
};

exports.strictSSL = function($strictSSL) {
    strictSSL = $strictSSL;
};

exports.cacheAuthentication = function($cacheAuthentication) {
    cacheAuthentication = $cacheAuthentication;
};

exports.get = function($path) {
    var request = unirest.get(createUrl($path)).strictSSL(strictSSL);
    return execute(request);
};

// Export the post resource function
exports.post = function($path, $resource) {
    var request = unirest.post(createUrl($path)).strictSSL(strictSSL).
send(JSON.stringify($resource));
    return execute(request);
};

// Export the post resource function
exports.put = function($path, $resource) {
    var request = unirest.put(createUrl($path)).strictSSL(strictSSL).
send(JSON.stringify($resource));
    return execute(request);
};

// Export the post resource function
exports.delete = function($path) {
    var request = unirest.delete(createUrl($path)).strictSSL(strictSSL);
    return execute(request);
};