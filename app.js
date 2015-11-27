var http = require('http');
var async = require('async');
var fs = require('fs')
var redmine = require('./redmine');
var config = require('config');

var client = null;
var lastTimePath = './lasttime.txt';
var lastTime;
var results = [];
var enableRedmine = true;
var enableGitlab = true;

function procRedmine(next) {
	var env = {};
	try {
		env = config.get('redmine');
	} catch (e) {
	}
	var redmineEnv = {};
	redmineEnv['url'] = process.env['REDMINE_URL'] || env['url'];
	redmineEnv['project'] = process.env['REDMINE_PROJECT'] || env['project'];
	redmineEnv['key'] = process.env['REDMINE_KEY'] || env['key'];
	redmineEnv['project_id'] = process.env['REDMINE_PROJECT_ID'] || env['project_id'];
	redmineEnv['icon'] = process.env['REDMINE_ICON'] || env['icon'];
	if (enableRedmine) {
		redmine.run(new Date(lastTime), redmineEnv, function(msg) {
			console.log('Hit Count : ' + msg.length);
			results = results.concat(msg);
			next();
		});
	} else {
		next();
	}
}

function dec(value) {
	return (value < 10)? '0' + value : value;
}

function makeDateStr(date) {
	var dateStr = [];
	dateStr.push(dec(date.getMonth()+1));
	dateStr.push('/');
	dateStr.push(dec(date.getDate()));
	dateStr.push(' ');
	dateStr.push(dec(date.getHours()));
	dateStr.push(':');
	dateStr.push(dec(date.getMinutes()));
	return dateStr.join('');
}

function MattermostOut() {}

MattermostOut.prototype.push = function(item, callback) {
	var env = config.get('mattermost');
	var host = process.env['MATTERMOST_HOST'] || env['host'];
	var port = process.env['MATTERMOST_PORT'] || env['port'];
	var path = process.env['MATTERMOST_PATH'] || env['path'];
	var options = {
		hostname: host,
		path: path,
		port: port,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		}
	}

	var requestBbody = "payload=" + JSON.stringify({
		"username": item.type,
		"icon_url" : item.icon,
		text : item.msg
	});
	var req = http.request(options, function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		});
		res.on('end', function() {
			callback();
		});
	}).on('error', function(e) {
		console.log('error')
		console.log(e.message);
	});
	req.write(requestBbody);
	req.end();
};

function ConsoleOut() {
}
ConsoleOut.prototype.push = function(item, callback) {
	console.log(item.msg);
	callback();
} 

var outputModule = new MattermostOut();

function outputLog(arr) {
	var list = arr.sort(function(a,b){
		var aTime = new Date(a.date);
		var bTime = new Date(b.date);
		return (aTime.getTime() < bTime.getTime())?-1:1;
	});

	async.eachSeries(list, function iterator(item, callback) {
		setTimeout(function() {
			outputModule.push(item, function() {
				callback();
			});
		}, 3 * 1000);
	}, function(err) {
	});
}

function procReadLastTime(next) {
	if (fs.exists(lastTimePath, function(exists) {
		if (exists) {
			var buf = fs.readFileSync(lastTimePath);
			if (buf) {
				lastTime = buf;
			}
		}
		console.log("Ticket Search Start from " + lastTime);
		next();
	}));
}

function updateLastTime() {
	var dateStr =  (new Date()).toString();
	fs.writeFile(lastTimePath, dateStr);
}

function start(callback) {
	async.waterfall([
		procReadLastTime,
		procRedmine
	], function complete(err) {
		updateLastTime();
		callback(results);
	});
}

function run() {
	start(function(results) {
		outputLog(results);
	});
}

run();
