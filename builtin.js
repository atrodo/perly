var builtins = {};

var CORE = require('./CORE.js');
for (var k in CORE)
{
  builtins[k] = 'runtime.CORE.' + k;
}
module.exports = builtins;
