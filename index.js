// => jQuery(".views-row") limit 40
// url => jQuery("a").attr("href")
// image => jQuery(".game-image img").attr("src")
// description => jQuery(".game-content .views-field-field-game-about").text()
// title => jQuery(".game-content .views-field-title").text()
// queue:
// check jQuery(".field__label:contains('Source files:')")
// jam site => jQuery(".field__label:contains('Jam Site:') + .field__items").text()
// tech notes => jQuery(".field__label:contains('Technology Notes:') + .field__items").text()
// download => jQuery(".field__label:contains('Source files:') + .field__items a").attr("href")
// filesize

var fs = require('fs');
var TAFFY = require('taffy');
var data = JSON.parse(fs.readFileSync(__dirname + "/public/db.json", "utf8")).projects;
var db = TAFFY(data);
const cheerio = require('cheerio');
var request = require('request');
var queue = require('queue');
var getFileSize = require('remote-file-size');

var mainPageQueue = queue({
  concurrency: 16,
  timeout: 10000,
});

var years = [[2017, 148], [2016, 135], [2015, 108], [2014, 85]];

// var year = 2017;
// var endPage = 148;

// var year = 2016;
// var endPage = 135;

// var year = 2015;
// var endPage = 108;

// var year = 2014;
// var endPage = 85;

for (var j = 0; j < years.length; j++) {
  var baseUrl = "https://globalgamejam.org/" + years[j][0] + "/games?title=&country=All&city=&tools=All&diversifier=All&platforms=All&other_tools=All&page=";
  for (var i = 0; i <= years[j][1]; i++) {
    mainPageQueue.push(parsePage(baseUrl, i));
  }
}

function parsePage(baseUrl, j) {
  return function (callback) {
    console.log('parsing page: ' + j);
    getContents(baseUrl + j, function (err, contents) {
      if (err) return callback(err);
      extractMainPage(contents);
      callback();
    });
  }
}

function getContents(url, callback) {
  request(url, function (error, response, body) {
    callback(error, body);
  });
}

var baseObj = {
  year: "",
  title: "",
  pageUrl: "",
  description: "",
  imageUrl: "",
  site: "",
  hasVideo: 0,
  videoUrl: "",
  tools: "",
  techNotes: "",
  fileSize: "",
  downloadUrl: ""
}

function extractMainPage(html) {
  const $ = cheerio.load(html);
  $(".views-row").each(function (i, elem) {
    if ($('.game-content', elem).text().length > 0) {
      var data = JSON.parse(JSON.stringify(baseObj));
      data.title = $(".game-content .views-field-title", elem).text().trim();
      if (db({ title: data.title }).first()) {
        return;
      }
      data.description = $(".game-content .views-field-field-game-about", elem).text().trim();
      data.pageUrl = "https://globalgamejam.org" + $("a", elem).attr("href").trim();
      data.imageUrl = $("img", elem).attr("src").trim();
      if (db({ pageUrl: data.pageUrl }).first()) {
        return;
      }
      mainPageQueue.push(function (cb) {
        parseSubPage(data, cb);
      });
    }
  });
}

function parseSubPage(data, callback) {
  getContents(data.pageUrl, function (err, contents) {
    if (err) return callback(err);
    extractSubPage(data, contents, callback);
  });
}

function extractSubPage(data, html, callback) {
  console.log('Parsing Game: ' + data.title);
  const $ = cheerio.load(html);
  if ($(".field__label:contains('Source files:')").length == 0) {
    return callback();
  }
  data.year = $(".field__label:contains('Jam year:') + .field__items").text().trim();
  data.site = $(".field__label:contains('Jam Site:') + .field__items").text().trim();
  data.techNotes = $(".field__label:contains('Technology Notes:') + .field__items").text().trim();
  data.tools = $(".field__label:contains('Tools and Technologies:') + .field__items").text().trim();
  data.videoUrl = $(".field__label:contains('Video Link:') + .field__items").text().trim();
  if (data.videoUrl) {
    data.hasVideo = 1;
  }
  data.downloadUrl = $(".field__label:contains('Source files:') + .field__items a").attr("href").trim();
  if (!data.downloadUrl) return callback();
  getFileSize(data.downloadUrl, function (err, size) {
    if (err) return callback();
    if (size < 1024 * 1024) return;
    data.id = getId();
    data.fileSize = size;
    db.insert(data);
    saveDb();
    callback();
  });
}

var lastId = db().get().length;

function getId() {
  lastId++;
  return lastId;
}

function saveDb() {
  fs.writeFileSync(__dirname + "/public/db.json", JSON.stringify({ projects: db().get() }), "utf8");
}

console.log("DB Length: " + db().get().length);

mainPageQueue.start(function (err) {
  if (err) throw err
  console.log('all done');
});

