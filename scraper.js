// This is a template for a Node.js scraper on morph.io (https://morph.io)

var cheerio = require("cheerio");
var request = require("request");
var sqlite3 = require("sqlite3").verbose();
var db;
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
	request(url, function (error, response, body) {
		if (error) {
			console.log("Error requesting page: " + error);
			return;
		}

		callback(body);
	});
}

function fetchListing(url) {
	fetchPage(url, processListing);
}

function processListing(body){
	var $ = cheerio.load(body);

	// Look for next
	var $next = $('a').filter(function(){
		return $(this).text() === 'Next'
	}).first();

	// Fetch further listings
	if ($next.length > 0) {
		fetchListing(URL + $next.attr('href'));
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
		fetchDetailPage.call(data, DOMAIN + url);
	});
};

function fetchDetailPage(url) {
	fetchPage(url, processDetailPage.bind(this));
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
		fetchSpeechPage.call(data, speechLink.attr('href'));
	} else {
		db.run("INSERT OR REPLACE INTO data (id,name,detailUrl) VALUES ($id, $name, $detailUrl)", data);
	}
}

function fetchSpeechPage(url) {
	console.log('Fetching speech for ' + this.$name);
	fetchPage(url, processSpeechPage.bind(this));
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

	db.run("INSERT OR REPLACE INTO data (id, name, detailUrl, speechUrl, speech, date) VALUES ($id, $name, $detailUrl, $speechUrl, $speech, $date)", data);
}

initDatabase(function(){
	fetchListing(URL + '?mem=1&q=');
	fetchListing(URL + '?sen=1&q=');
});
