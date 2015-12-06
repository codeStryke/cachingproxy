var http = require('http');
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
		request
			.get({
				uri: target,
				encoding: null
				})
			.on('response', function (response) {
				// Since we don't know the size of the response
				// at this point creating an array of buffers
				var chunkArray = [];
				response.on('data', function (chunk) {
					chunkArray.push(new Buffer(chunk));
				});
				response.on('end', function () {
					var cacheEntry = {
						statusCode: response.statusCode,
						headers: response.headers,
						data: Buffer.concat(chunkArray)
					};

					addEntryInCache(target, cacheEntry);

					sendResponse(cacheEntry, res);
				});
			});
	}
};

function addEntryInCache(key, cacheEntry) {
	var bufSize = cacheEntry.data.length;

	var sizeIncrease = bufSize + sizeof(cacheEntry.headers) + sizeof(cacheEntry.statusCode);

	if(currentCacheSize + sizeIncrease < proxyConfig.cacheSizeBytes &&
		currentCacheElementCount + 1 < proxyConfig.cacheSizeElements) {
		cache[key] = cacheEntry;
		currentCacheSize += sizeIncrease;
		currentCacheElementCount += 1;
		setTimeout(removeEntryFromCache, proxyConfig.cacheDuration, key, sizeIncrease);
	}
	else {
		// If we want to implement a cache eviction strategy it could go here
		// Right now I'm not evicting entries for cache unless they expire
		// based on proxyConfig
		// If users are staying on the same domain or using the back button
		// more frequently then there is a higher chance of a cache hit if
		// there is no eviction.
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
		res.write(cacheEntry.data);
		res.end();
	} catch (err) {
		console.log('Error sending Response', err, 'cacheEntry', cacheEntry);
	}
}

// Live Stats
/*
function printCacheStats() {
	console.log('currentCacheElementCount', currentCacheElementCount, 'currentCacheSize', currentCacheSize);
}

setInterval(printCacheStats, 1000);
*/