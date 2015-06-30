// Load the TCP Library
var fs = require('fs');
var net = require('net');
var path = require('path');
var express = require('express');
var mysql = require('mysql');
var http = require('http');
var app = express();
var bodyParser = require('body-parser');
app.use(bodyParser.json({limit: '150mb'}));
app.use(bodyParser.urlencoded({limit: '150mb', extended: true}));

var timeoutTime = 60 * 1 * 1000; // miliseconds
var timeout = null;
var interval = null;
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'tcp',
    timezone: 'utc -3'
});

connection.connect(function (err) {
    if (err) return console.error('error connecting: ' + err.stack);
});

app.get('/', function (req, res) {
    var filename = path.join(__dirname, 'views/index.html');
    var html = fs.readFileSync(filename, 'utf8');
    res.send(html);
});
app.post('/data', function (req, res) {
    connection.query("SELECT * FROM data ORDER BY timestamp DESC Limit 30", function (err, rows) {
        if (err) return err;
        res.send(rows);
    });
});
app.post('/active', function (req, res) {
    connection.query("SELECT * FROM active ORDER BY timestamp DESC", function (err, rows) {
        if (err) return err;
        res.send(rows);
    });
});

// Keep track of the chat clients
var clients = [];

// Start a TCP Server
net.createServer(function (socket) {
    app.post('/send', function (req, res) {
        var data = req.body.data;
        var name = req.body.name;
        write(data, name);
        res.send(data + ' Enviada Correctamente a ' + name)
    });

    // Identify this client
    socket.name = socket.remoteAddress + ":" + socket.remotePort;

    // Put this new client in the list
    clients.push(socket);

    console.log('Connected : ' + socket.name);
    connection.query("" +
        "INSERT INTO " +
        "active (name, timestamp, ip, port) " +
        "VALUES ('" + socket.name + "', NOW(), '" + socket.remoteAddress + "', '" + socket.remotePort + "');"
        , function (err, rows) {
            if (err) return err;
        });


    setTimeout(function () {
        write('Connected', socket.name)
    }, 100);

    // Handle incoming messages from clients.
    socket.on('data', function (data) {
        if (data != "" && data != " " && data != "\r") {
            var url = '/upload/frame/' + data;
            var options = {
                host: 'elabra.magikbox.cl',
                port: 80,
                path: url,
                method: 'POST'
            };

            if (timeout == null)
                startTimeout(socket);
            else
                restartTimeout(socket);
            connection.query("" +
                "INSERT INTO " +
                "data (data, name, timestamp, ip, port) " +
                "VALUES ('" + data + "', '" + socket.name + "', NOW(), '" + socket.remoteAddress + "', '" + socket.remotePort + "');"
                , function (err, rows) {
                    if (err) return err;
                });
            console.log(socket.name + " > " + data + "");

            var req = http.request(options, function (res) {
                if (res.statusCode == 200) {
                    res.setEncoding('utf8');
                    res.on('data', function (chunk) {
                        console.log(chunk);
                    });
                }
            });

            req.on('error', function (e) {
                console.log('problem with request: ' + e.message);
            });

// write data to request body
            req.write('data\n');
            req.write('data\n');
            req.end();
        }
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        connection.query("DELETE FROM active WHERE name = '" + socket.name + "';");
        clients.splice(clients.indexOf(socket), 1);
        console.log(socket.name + " end.");
    });

    socket.on('close', function () {
        connection.query("DELETE FROM active WHERE name = '" + socket.name + "';");
        clients.splice(clients.indexOf(socket), 1);
        console.log(socket.name + " closed.");
    });

    socket.on('error', function (error) {
        connection.query("DELETE FROM active WHERE name = '" + socket.name + "';");
        clients.splice(clients.indexOf(socket), 1);
        console.log(socket.name + " error.");
        console.log('Error: ' + error);

    });
    function write(message, to) {
        clients.forEach(function (client) {
            if (client.name != to) return;
            client.write(message, function (err) {
                if (err) process.stdout.write('Error', err)
            });
            console.log('SEND :' + to + ' > ' + message)
        });
    }

    function startTimeout(socket) {
        timeout = setTimeout(function () {
            console.log('SEND :' + socket.name + ' > Desconnected');
            socket.end('Disconnect');
            clearInterval(interval);
            connection.query("DELETE FROM active WHERE name = '" + socket.name + "';");
            clients.splice(clients.indexOf(socket), 1);
            console.log(socket.name + " closed.");
        }, timeoutTime);
        console.log('start ' + socket.name)
    }

    function restartTimeout(socket) {
        clearTimeout(timeout);
        startTimeout(socket);
    }
}).listen(5000, function () {
    var port = '5000';
    console.log('TCP app listening at http://0.0.0.0:' + port);
});

var server = app.listen(3000, function () {
    var port = server.address().port;
    console.log('HTML app listening at http://0.0.0.0:' + port);
});
