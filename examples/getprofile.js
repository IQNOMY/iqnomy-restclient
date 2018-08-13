const iqRestClient = require("../");

function getProfile(tenantId, profileId, cb) {
    var path = "liquidaccount/" + tenantId + "/profile/" + profileId;
    iqRestClient.get(path).then(function($data) {
        if ($data.status !== 200) {
            return cb($data.status, $data);
        }
        cb(null, $data);
    }, function($err) {
        cb($err);
    });
}

getProfile("123456", "AYCvqQ!!-8S898pWLshzTMg72Tp72tVhI8lL3KAz91!9wxLk4", function(err, data) {
    
    if (err) {
        console.log(err);
        console.log(data);
    } else {
        console.log(data.response.body);
    }
    
});