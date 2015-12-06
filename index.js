var http = require('http');
var https = require('https');
var url = require('url');
var request = require('request');
var fs = require('fs');
var sizeof = require('object-sizeof');

var proxyConfig = JSON.parse(fs.readFileSync('proxyconfig.json'));

var currentCacheSize = 0;
var currentCacheElementCount = 0;

var cache = {};

http.createServer(onRequest).listen(3000);

function onRequest(req, res) {
	req.on('error', function(err) {
		console.error(err);
		res.statusCode = 400;
		res.end();
	});
	res.on('error', function(err) {
		console.error(err);
	});

	getResource(req.url, req, res);
}

var getResource = function (target, req, res) {
	// Check if the target is present in the cache
	// if present return the data
	// else make the request to get the data
	// then check if it can be cached
	// return the data

	if(target in cache) {
		sendResponse(cache[target], res);
	}
	else {
		request.get({
			uri: target,
			encoding: null
		}, function (err) {
			//console.log('err', err);
			//console.log('target', target);
		})
			.on('response', function (response) {
				var bufData = [];
				response.on('data', function (chunk) {
					//console.log(chunk);
					bufData.push(new Buffer(chunk));
				});
				response.on('end', function () {
					//console.log(target);
					var cacheEntry = {
						statusCode: response.statusCode,
						headers: response.headers,
						data: bufData
					};

					if(!response.statusCode) {
						console.log('key', target);
					}

					addEntryInCache(target, cacheEntry);

					sendResponse(cacheEntry, res);
				});
			});
	}
};

function addEntryInCache(key, cacheEntry) {
	var bufData = cacheEntry.data;
	var bufSize = 0;
	for(var i = 0; i < bufData.length; i++) {
		bufSize += bufData[i].length;
	}

	var sizeIncrease = bufSize + sizeof(cacheEntry.headers) + sizeof(cacheEntry.statusCode);

	if(currentCacheSize + sizeIncrease < proxyConfig.cacheSizeBytes &&
		currentCacheElementCount + 1 < proxyConfig.cacheSizeElements) {
		cache[key] = cacheEntry;
		currentCacheSize += sizeIncrease;
		currentCacheElementCount += 1;
		setTimeout(removeEntryFromCache, proxyConfig.cacheDuration, key, sizeIncrease);
	}
}

function removeEntryFromCache(key, size) {
	delete cache[key];
	currentCacheElementCount -= 1;
	currentCacheSize -= size;
}

function sendResponse(cacheEntry, res) {
	try {
		res.writeHeader(cacheEntry.statusCode, '', cacheEntry.headers);
		var bufData = cacheEntry.data;
		for (var i = 0; i < bufData.length; i++) {
			res.write(bufData[i]);
		}
		res.end();
	} catch (err) {
		console.log('Error sending Response', err, 'cacheEntry', cacheEntry);
	}
}

function printCacheStats() {
	console.log('currentCacheElementCount', currentCacheElementCount, 'currentCacheSize', currentCacheSize);
}

setInterval(printCacheStats, 1000);