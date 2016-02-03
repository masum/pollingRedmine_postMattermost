#!/usr/local/bin/node
var http = require('http');
var async = require('async');

var option
var statuses = [];
var trackers = [];
var versions = [];
var categories = [];
var memberships = [];
var results = [];
var _env;
var _lastTime;

function redmine() {
}

redmine.run = function(time, env, callback) {
	_env = env;
	_lastTime = time;
	async.waterfall([
		procListStatus,
		procListTracker,
		procListVersions,
		procListCategories,
		procListMemberships,
		procSearchIssues,
		procFetchIssues
	], function complete(err) {
		callback(results);
	});
};

function makeUrl(param) {
	var optProject = _env.project;
	if ('project' in param) {
		optProject = param.project;
	}
	var url = [];
	url.push(_env.url);
	if (optProject) {
		url.push('projects/');
		url.push(optProject + '/');
	}
	url.push(param.func);
	if (param.id) {
		url.push('/' + param.id + '.json');
	}
	var query = [];
	if (_env['project_id']) {
		query.push('project_id=' + _env['project_id']);
	}
	if (_env.key) {
		query.push('key=' + _env.key);
	}
	if (param.include) {
		query.push('include=' + param.include);
	}
	if (param['status_id']) {
		query.push('status_id=' + param['status_id']);		
	} 
	if (query.length > 0) {
		var queryStr = query.join('&');
		url.push('?' + queryStr);
	}
	var urlStr = url.join('');
	return urlStr;
}

function searchIssues(callback) {
	restGet(makeUrl({
		'func':'issues.json',
		'status_id': '*'
	}), callback);
}

function fetchIssue(id, callback) {
	var url = makeUrl({
		'project': '',
		'func': 'issues',
		'id': id,
		'include': 'journals'
	});
	restGet(url, callback);
}

function restGet(url, callback) {
	var data = '';
	var req = http.get(url, function(res) {
		res.setEncoding('utf8');
		res.on('data', function(str) {
			data += str;
		});
		res.on('end', function() {
			callback(JSON.parse(data));
		});	
	});
	
	req.on('error', function(err) {
		console.log('redmine http request error!');
		console.log(err.message);
	});
	req.end();
}
function value(data, cut) {
	if (!data) {
		return data;
	}
	var num = cut || 20;
	var newData = data.replace(/[\n\r]/g,"");
	newData = newData.substring(0,num);
	if (data.length > num) {
		newData += "...";
	}
	return newData;
}
function date(d) {
	return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes(); 
}

function valueToStringByFieldID(id, value) {
	var array = [];
	if (id === 'fixed_version_id') {
		array = versions;
	} else if (id === 'status_id') {
		array = statuses;
	} else if (id === 'category_id') {
		array = categories;
	} else if (id === 'assigned_to_id') {
		array = memberships;
	}
	for (var i=0;i<array.length;i++) {
        if (array[i]) {
            if (array[i].id.toString() === value) {
                return array[i].name;
            }
        }
	}
	return value;
}

var fieldLabel = {
	'fixed_version_id':'対象バージョン',
	'priority_id':'優先度',
	'assigned_to_id':'担当者',
	'status_id':'ステータス',
	'description':'説明',
	'done_ratio':'進捗率',
	'start_date':'開始日',
	'due_date':'期日',		
	'subject':'題名',
	'category_id':'カテゴリ',
	'label_relates_to':'関連するチケット',
	'estimated_hours':'予定工数'
}

function valueToFieldName(key) {
	var name = fieldLabel[key];
	if (!name) {
		name = key;
	}
	return name;
}

function procListStatus(next) {
	var url = makeUrl({
		'project': '',
		'func': 'issue_statuses.json'
	});
	restGet(url, function(data) {
		statuses = data.issue_statuses;
		next();
	});
}
function procListTracker(next) {
	var url = makeUrl({
		'project': '',
		'func': 'trackers.json'
	});
	restGet(url, function(data) {
		trackers = data.trackers;
		next();
	});
}
function procListVersions(next) {
	var url = makeUrl({
		'func': 'versions.json'
	});
	restGet(url, function(data) {
		versions = data.versions;
		next();
	});
}
function procListCategories(next) {
	var url = makeUrl({
		'func': 'issue_categories.json'
	});
	restGet(url, function(data) {
		categories = data.issue_categories;
		next();
	});	
}
function procListMemberships(next) {
	var url = makeUrl({
		'func': 'memberships.json'
	});
	restGet(url, function(data) {
		var list = data.memberships;
		for (var i=0;i<list.length;i++) {
			memberships.push(list[i].user);	
		}
		next();
	});	
}
function procSearchIssues(next) {
	searchIssues(function(data) {
		next(null, data.issues);
	});
}

var msg_note = 'コメント追加：「#{note}」';
var msg_del = '#{field}の値「#{old}」を削除';
var msg_set = '#{field}を「#{new}」へ設定';
var msg_update = '#{field}を「#{old}」から「#{new}」へ変更';
var msg_file = '添付ファイルを登録 #{new} ';

function toMessage(type, user, update, ticket, field, oldValue, newValue) {
	var message = '';
	if (type === 'attachment') {
		message = msg_file;
	} else {
	    if (oldValue) {
            if (newValue) {
		        message = msg_update;
		    } else {
			    message = msg_del;
		    }
	    } else if (newValue) {
		    message = msg_set;
		}
	}
	message = message.replace('#{field}', field);
	message = message.replace('#{old}', oldValue);
	message = message.replace('#{new}', newValue);
	message += '(' + user + ')';
	return message;
}

function oneTicket(id, callback) {
	fetchIssue(id, function(data2) {
		var item = data2.issue;
		var id = item.id;
		var subject = item.subject;
		var ticket = '#' + id + ' ' + value(subject, 30);
		var created = new Date(item.created_on);
		var author = item.author.name;
        var msgbase = '[##{id}](' + _env.url + 'issues/#{id}) #{subject}';
		msgbase = msgbase.replace('#{subject}',subject);
		msgbase = msgbase.replace(/\#{id}/g, id);
		console.log("「(#" + id  + ")"+ subject + "」, journal:" + item.journals.length);
		if (item.journals.length === 0) {
			if (_lastTime.getTime() <= created.getTime()) {
				var message = msgbase + '(' + author + ')';
				results.push({
					'type':'Redmine',
					'msg': message,
					'date': created,
				    'icon': _env['icon']
				});
			}
			callback();
			return;
		}
		for (var j=0; j<item.journals.length; j++) {
			var jou = item.journals[j];
			var user = jou.user.name;
			var update = new Date(jou.created_on);
			if (_lastTime.getTime() > update.getTime()) {
				continue;
			}
			var message = msgbase;
			if (jou.notes) {
				message += '\n';
				message += value(jou.notes, 30);
				message += '(' + user + ')';
			} 
			for (var k=0; k<jou.details.length; k++) {
				var detail = jou.details[k];
				var fieldName,oldvalue,newvalue;
				if (detail.property === 'attachment') {
				    fieldName = '';
				    oldvalue = '';
				    newvalue = detail.new_value;
				} else {
				    fieldName = valueToFieldName(detail.name);
				    oldvalue = value(valueToStringByFieldID(detail.name, detail.old_value));					
				    newvalue = value(valueToStringByFieldID(detail.name, detail.new_value));
				}
				message += '\n';
				message += toMessage(detail.property, user, update, ticket, fieldName, oldvalue, newvalue);		
			};
			results.push({
				'type':'Redmine',
				'msg': message,
				'date': update,
				'icon': _env['icon']
			});
		}
		callback();
	});
}

function procFetchIssues(list, next) {
	async.eachSeries(list, function iterator(item, callback) {
		oneTicket(item.id, function() {
			callback();
		});
	}, function(err) {
		next();
	});
}

module.exports = redmine;