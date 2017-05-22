var express = require('express');
var app = express();
var port = process.env.PORT || 3000;
var bodyParser = require('body-parser');
var oxfordEmotion = require("node-oxford-emotion")("b87c8eed78d04440b09d31c7c5eb5043")
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var fs = require("fs");
var azureStorage = require('azure-storage');
const uuidV4 = require('uuid/v4');
var Connection = require('tedious').Connection;
var Request = require('tedious').Request;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.set('views', __dirname);
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);

app.post('/', multipartMiddleware, function(req, resp) {
    var imageInfo = {};
    if (req.body.photourl) {
        var photourl = req.body.photourl;
        imageInfo.key = photourl;
        var emotion = oxfordEmotion.recognize("url", photourl, function(cb) {
            imageInfo.emotionString = parseStringFromOxformEmotionAPIResponse(cb);
            saveImageInfo(imageInfo);
            resp.end("<p>Success!</p>");
        });
    } else {
        var imageName = uuidV4() + req.files.photo.name;
        imageInfo.key = "https://attachedimages.blob.core.windows.net/mycontainer/" + imageName;
        saveImageToContainer(imageName, req.files.photo.path);

        var imageData = binaryRead(req.files.photo.path);
        var emotion = oxfordEmotion.recognize("image", imageData, function(cb) {
            imageInfo.emotionString = parseStringFromOxformEmotionAPIResponse(JSON.parse(cb));
            saveImageInfo(imageInfo);
            resp.end("<p>Success!</p>");
        });
    }
});

function binaryRead(file) {
    var bitmap = fs.readFileSync(file);
    return new Buffer(bitmap.toString('binary'),'binary');
}

function parseStringFromOxformEmotionAPIResponse(response) {
    var string = response.length + " faces. Emotions are:";
    response.forEach(function(face) {
        var biggestEmotion = "";
        var biggestEmotionValue = 0;
        for (var emotion in face["scores"]) {
            var emotionValue = face["scores"][emotion];
            if (emotionValue > biggestEmotionValue) {
                biggestEmotion = emotion;
                biggestEmotionValue = emotionValue;
            }
        }
        string += " " + biggestEmotion;
    });
    return string;
}

function saveImageInfo(imageInfo) {
    saveImageToSql(imageInfo.key, imageInfo.emotionString);
}

function saveImageToSql(imageKey, imageEmotionsString) {
    getSqlConnection(function(connection) {
        var query = "INSERT INTO images VALUES('" + imageKey + "', '" + imageEmotionsString + "')";
        request = new Request(
        query,
        function(err, rowCount, rows) {
            console.log(rowCount + ' row(s) inserted');
        });
        connection.execSql(request);
    });
}

function getSqlConnection(completion) {
    var config = {
            userName: 'bogdan.raducan',
            password: 'Dxu-QAd-o3H-8pV',
            server: 'analysedimages.database.windows.net',
            options: {
                database: 'analysed_images',
                encrypt: true
            }
        }
    var connection = new Connection(config);

    connection.on('connect', function(err) {
        if (err) {
            console.log(err)
        } else {
            completion(connection);
        }
    });
}

function saveImageToContainer(imageName, imagePath) {
    var uploadOptions = {
        container: 'mycontainer',
        blob: imageName, 
        imagePath: imagePath 
    }

    var blobSvc = azureStorage.createBlobService('attachedimages', "ACVxnTgghzGesi95w2+6pkWsotlZBV9XbKYEoJMu2rqYxfCE8vga6HIPtaZ5tlc6j+8uIqE+mPJOn8NXo7giVQ==");
    blobSvc.createContainerIfNotExists('mycontainer', function(error, result, response){
    });
    blobSvc.createBlockBlobFromLocalFile(uploadOptions.container,
                                         uploadOptions.blob,
                                         uploadOptions.imagePath,
                                         function (error) {
                                             if (error != null) {
                                                 console.log('Azure Full Error: ', error);
                                             } else {
                                                 console.log('Azure Full Success');
                                             }
                                    });
}

app.get('/', function(req, res) {
    res.render("main.html");
});

app.get('/photos', function(req, res) {
    analysedImagesHTML(function completion(imagesHTMLString){
        var htmlString = "<html><body><style>table {font-family: arial, sans-serif;\
             border-collapse: collapse; width: 100%;} td, th {border: 1px solid #dddddd; \
                 text-align: left; padding: 8px; } tr:nth-child(even) { background-color: \
                     #dddddd; }</style>";
        htmlString += "<H2>Analysed photos</H2>";
        htmlString += "<table>";
        htmlString += "<tr><th>URL</th><th>Emotions</th></tr>";
        htmlString += imagesHTMLString;
        htmlString += "</table></body></html>";
        res.end(htmlString);
    });
});

function analysedImagesHTML(completion) {
    var imagesHTMLString = "";
    getSqlConnection(function(connection) {
        var imageHTMLString = "<tr>";
        var query = "SELECT * FROM images";
        request = new Request(
            query,
            function(err, rowCount, rows) {
                console.log(rows);
                completion(imagesHTMLString);
            });

        request.on('row', function(columns) {
            imageHTMLString = "<tr>";
            columns.forEach(function(column) {
                imageHTMLString += "<td>";
                if (column.metadata.colName == "url_link") {
                    imageHTMLString += "<a href=\"" + column.value + "\">Image URL</a>";
                } else {
                    imageHTMLString += column.value;
                }
                imageHTMLString += "</td>";
            });
            imageHTMLString += "</tr>";
            imagesHTMLString += imageHTMLString;
        });
        connection.execSql(request);
    });
}

app.listen(port);
console.log('Server Listening at port ' + port);