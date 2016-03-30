// This is a template for a Node.js scraper on morph.io (https://morph.io)

var cheerio = require("cheerio");
var request = require("request");
var sqlite3 = require("sqlite3").verbose();
var queue = require('queue-async');

var db;
var q;

const DOMAIN = 'http://www.aph.gov.au';
const URL = DOMAIN + '/Senators_and_Members/Parliamentarian_Search_Results';

function initDatabase(callback) {
	// Set up sqlite database.
	db = new sqlite3.Database("data.sqlite");
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS data (id TEXT PRIMARY KEY, name TEXT, detailUrl TEXT, speechUrl TEXT, speech TEXT, date TEXT)");
		callback();
	});
}

function fetchPage(url, callback) {
	// Use request to read in pages.
	q.defer(function(cb){

		request(url, function (error, response, body) {
			if (error) {
				console.log("Error requesting page: " + error);
				return;
			}
			callback(body);
			cb();
			if (global.gc) global.gc();
		});
	});
}

function processListing(body){
	var $ = cheerio.load(body);

	// Look for next
	var $next = $('a').filter(function(){
		return $(this).text() === 'Next';
	}).first();

	// Fetch further listings
	if ($next.length > 0) {
		fetchPage(URL + $next.attr('href'), processListing);
	}

	// Process
	$('ul.search-filter-results li p.title a').each(function(){
		var url = $(this).attr('href'),
			id = url.match(/MPID\=(.*)($|&)/)[1],
			data = {
				$id: id,
				$detailUrl: DOMAIN + url
			};

		if (!data.$id) {
			console.log('empty', url);
		}
		fetchPage(DOMAIN + url, processDetailPage.bind(data));
	});
}

function processDetailPage(body) {
	var $ = cheerio.load(body),
		data = this;

	data.$name = $('#content > h1').text();

	var speechLink = $('a').filter(function(){
		return $(this).text() === 'First speech';
	}).first();

	if (speechLink.length) {
		data.$speechUrl = speechLink.attr('href');
		fetchPage(speechLink.attr('href'), processSpeechPage.bind(data));
		console.log('Fetching ', data.$name);
	} else {
		db.run("INSERT OR REPLACE INTO data (id,name,detailUrl) VALUES ($id, $name, $detailUrl)", data, (global.gc) ? global.gc : null);
	}
}

function processSpeechPage(body) {
	var $ = cheerio.load(body),
		date,
		data = this;

	data.$speech = $('#documentContentPanel').text().trim();
	date = $('#documentInfoPanel > div + div').html();
	if (date) {
		data.$date = date.split('<br>')[0];
	} else {
		data.$date = null;
	}

	db.run("INSERT OR REPLACE INTO data (id, name, detailUrl, speechUrl, speech, date) VALUES ($id, $name, $detailUrl, $speechUrl, $speech, $date)", data, (global.gc) ? global.gc : null);
}

q = queue(10);

initDatabase(function(){
	fetchPage(URL + '?q=&mem=1&sen=1&ps=100', processListing);
	fetchPage(URL + '?q=&mem=1&sen=1&ps=100&for=1', processListing);
});

