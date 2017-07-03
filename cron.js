// jshint esversion:6
var mysql = require('promise-mysql');
var request = require('request-promise-native');
var config = require('./config');

var dateOfRun = new Date();
var connection;

mysql.createConnection(config.db).then((conn) => {
   connection = conn;

   return setupTable();
}).then(() => {
   return Promise.all(config.repos.map(processRepo));
}).then(() => {
   connection.end();
}).catch((err) => {
   console.warn('Something went wrong.');

   connection.end();
});

function processRepo(repo) {
   var url = 'https://api.github.com/repos/' + repo.name + '/releases';

   var requestOptions = {
      url: url,
      headers: {
         'User-Agent': 'sualko/github-release-stats'
      },
      transform2xxOnly: true,
      transform: (body) => {
         return JSON.parse(body);
      }
   };

   return request(requestOptions).then((repoData) => {
      return Promise.all(repoData.map((release) => {
         release.repoName = repo.name;

         processRelease(release);
      }));
   }).catch((err) => {
      console.warn('Could not request ' + url);
   });
}

function processRelease(release){
   return Promise.all(release.assets.map((asset) => {
      return processAsset(asset, release);
   }));
}

function processAsset(asset, release) {
   var row = {
      id: asset.id,
      name: asset.name,
      repoName: release.repoName,
      downloadCount: asset.download_count,
      releaseId: release.id,
      releaseTagName: release.tag_name,
      date: dateOfRun
   };

   return connection.query('INSERT INTO assets SET ?', row);
}

function setupTable() {
   return connection.query('SELECT 1 FROM `assets` LIMIT 1').catch(() => {
      return connection.query('CREATE TABLE `assets` ( ' +
         ' `pkey` INT NOT NULL AUTO_INCREMENT ,' +
         ' `id` INT NOT NULL ,' +
         ' `name` TEXT NOT NULL ,' +
         ' `repoName` TEXT NOT NULL ,' +
         ' `downloadCount` INT NOT NULL ,' +
         ' `releaseId` TEXT NOT NULL ,' +
         ' `releaseTagName` TEXT NOT NULL ,' +
         ' `date` DATETIME NOT NULL ,' +
         ' PRIMARY KEY (`pkey`)) ENGINE = InnoDB;');
   });
}
