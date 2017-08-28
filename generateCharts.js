// jshint esversion:6
const D3Node = require('d3-node');
const d3 = require('d3');
const fs = require('fs');

const mysql = require('promise-mysql');
const config = require('./config');

if (!/\/$/.test(config.outputFolder)) {
   config.outputFolder += '/';
}

if (!fs.existsSync(config.outputFolder)) {
   console.log('Output folder doesn\'t exist');
   return 1;
}

mysql.createConnection(config.db).then((conn) => {
   var result = conn.query('SELECT * FROM assets ORDER BY date ASC');

   conn.end();

   return result;
}).then((rows) => {
   var repos = preprocessData(rows);
   var fileInfo = generateCharts(repos);

   generateHtmlOverview(fileInfo);
});

function preprocessData(rows) {
   var repos = {};

   for (var row of rows) {
      if (!repos[row.repoName]) {
         repos[row.repoName] = {
            name: row.repoName,
            assets: {}
         };
      }

      var assets = repos[row.repoName].assets;

      if (!assets[row.id]) {
         assets[row.id] = {
            name: row.name,
            downloads: []
         };
      }

      if (!repos[row.repoName].minDate || repos[row.repoName].minDate > row.date) {
         repos[row.repoName].minDate = row.date;
      }

      if (!repos[row.repoName].maxDate || repos[row.repoName].maxDate < row.date) {
         repos[row.repoName].maxDate = row.date;
      }

      if (!repos[row.repoName].minDownloadCount || repos[row.repoName].minDownloadCount > row.downloadCount) {
         repos[row.repoName].minDownloadCount = row.downloadCount;
      }

      if (!repos[row.repoName].maxDownloadCount || repos[row.repoName].maxDownloadCount < row.downloadCount) {
         repos[row.repoName].maxDownloadCount = row.downloadCount;
      }

      assets[row.id].downloads.push({
         key: row.date,
         value: row.downloadCount
      });

      repos[row.repoName].assets = assets;
   }

   return repos;
}

function generateCharts(repos) {
   var fileInfo = [];

   for (let repoName in repos) {
      let fi = generateChartForRepo(repos[repoName]);

      fileInfo.push(fi);
   }

   return fileInfo;
}

function generateChartForRepo(repo) {
   var d3n = new D3Node({
      d3Module: d3
   });

   var svg = d3n.createSVG(960, 480),
      margin = {
         top: 20,
         right: 20,
         bottom: 30,
         left: 50
      },
      width = +svg.attr('width') - margin.left - margin.right,
      height = +svg.attr('height') - margin.top - margin.bottom,
      g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

   var x = d3.scaleTime()
      .rangeRound([0, width]);

   var y = d3.scaleLinear()
      .rangeRound([height, 0]);

   var line = d3.line()
      .x(function(d) {
         return x(d.key);
      })
      .y(function(d) {
         return y(d.value);
      });

   x.domain([repo.minDate, repo.maxDate]);
   y.domain([0, repo.maxDownloadCount * 1.1]);

   g.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x));

   g.append('g')
      .call(d3.axisLeft(y))
      .append('text')
      .attr('fill', '#000')
      .attr('y', 6)
      .attr('x', 5)
      .attr('text-anchor', 'start')
      .text('Downloads');

   var color = d3.scaleOrdinal(d3.schemeCategory10);
   var getColor = () => {
      return color(asset.name);
   };

   for (var assetId in repo.assets) {
      var asset = repo.assets[assetId];

      if (asset.name.match(/.sig$/)) {
         continue;
      }

      addLine(g, asset, getColor, line, x, y, width);
   }

   var fileName = repo.name.replace('/', '-') + '.svg';

   fs.writeFile(config.outputFolder + fileName, d3n.svgString(), () => {});

   return {
      name: fileName,
      title: repo.name
   };
}

function addLine(g, asset, getColor, line, x, y, width) {
   g.append('path')
      .datum(asset.downloads)
      .attr('fill', 'none')
      .attr('stroke', getColor)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', 1.5)
      .attr('d', line);

   var circleWrapper = g.selectAll('.dot')
      .data(function() {
         return asset.downloads;
      })
      .enter()
      .append('g')
      .attr('transform', function(d) {
         return 'translate(' + x(d.key) + ', ' + y(d.value) + ')';
      });

   circleWrapper.append('title')
      .text(function(d) {
         return d.value;
      });

   circleWrapper.append('circle')
      .attr('r', 3)
      .attr('fill', getColor);

   circleWrapper.append('text')
      .style("display", 'none')
      .text(function(d) {
         return d.value;
      });

   g.append('text')
      .attr('transform', 'translate(' + (width + 3) + ',' + y(asset.downloads[asset.downloads.length - 1].value) + ')')
      .attr('dy', '-.3em')
      .attr('text-anchor', 'end')
      .attr('font-family', 'sans-serif')
      .attr('font-size', '80%')
      .style('fill', getColor)
      .text(asset.name);
}

function generateHtmlOverview(fileInfo) {
   var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>\n';

   for (let fi of fileInfo) {
      html += `<h2>${fi.title}</h2>\n`;
      html += `<img src="${fi.name}" alt="${fi.title}" />\n`;
   }

   html += '</body></html>';

   fs.writeFile(config.outputFolder + 'index.html', html, () => {});
}
