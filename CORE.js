var globals = require('./globals.js');
var CORE = {
  say: function()
  {
    for (var i = 0; i < arguments.length; i++)
    {
      process.stdout.write("" + arguments[i] + "\n");
    }
  },
  warn: function()
  {
    for (var i = 0; i < arguments.length; i++)
    {
      // TODO: line numbers
      process.stderr.write("" + arguments[i] + "\n");
    }
  },
  die: function()
  {
    // TODO: line numbers
    var error = [].slice(arguments).join("\n");
    throw error;
  },
  eval: function(block)
  {
    var result;
    globals.EVAL_ERROR = null;
    try
    {
      result = block();
    }
    catch(e)
    {
      globals.EVAL_ERROR = e;
    };
    return result;
  },
};

module.exports = CORE;
