var CORE = {
  say: function()
  {
    for (var i = 0; i < arguments.length; i++)
    {
      process.stdout.write("" + arguments[i] + "\n");
    }
  },
};

module.exports = CORE;
