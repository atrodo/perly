#!/usr/bin/env node

'use strict';
var parser_gen = require('./lib/parser');
var grammar = require('./gmr.js');
var CORE = require('./CORE.js');
var parser = parser_gen('grammar', grammar);

if (require.main === module)
{
  var prog = process.argv[1];
  var getopt = require('node-getopt').create([
    ['d' , 'debug'     , 'debug'],
    ['u' , 'dump_tree' , 'dump parse tree'],
    ['O' , 'show_js'   , 'show the javascript, do not execute'],
    ['h' , 'help'      , 'display this help'],
    ['v' , 'version'   , 'show version']
  ])
  .bindHelp()

  getopt.setHelp(
    "Usage: " + prog + " [OPTION] [FILE]\n" +
    "perly\n" +
    "\n" +
    "[[OPTIONS]]\n" +
    "\n" +
    ""
  )

  var opt = getopt.parseSystem();

  console.info(opt);

  var file = opt.argv[0];
  if (file == null)
  {
    getopt.showHelp();
    process.exit(1);
  }

  var path = require('path').normalize(file);
  var source = require('fs').readFileSync(path, "utf8");
  var runtime = {
    CORE: CORE,
    ns: {
      'CORE::': CORE,
    },
  };
  parser.eval(source, runtime, opt.options);
}
