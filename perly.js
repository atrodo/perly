#!/usr/bin/env node

var parser_gen = require('./lib/parser');
var grammar = require('./gmr.js');
var parser = parser_gen('grammar', grammar);

if (require.main === module)
{
  var args = process.argv.slice(1);
  if (args[1] == null)
  {
    console.log('Usage: '+args[0]+' FILE');
    process.exit(1);
  }

  var path = require('path').normalize(args[1]);
  var source = require('fs').readFileSync(path, "utf8");
  console.log(parser.eval(source));
}
