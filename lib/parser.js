"use strict";

var _ = require('lodash');

var nonterm        = /^<(\w+)>(.)?$/;
var validmodifiers = /^[+*?]$/;

function mk_re(src)
{
  var flags = '';
  if (src instanceof RegExp)
  {
    flags = src.toString().match(/[gimuy]*$/)[0];
    src = src.source;
  }
  src.replace(/^\^/, '');
  return new RegExp("^\\s*" + src, flags);;
}

function Atom(src)
{
  this.src = src;

  this.match = function(input)
  {
    var result = this.src.exec(input);

    if (result == null)
      return false;

    return result[0].length;
  }

  if (typeof src == 'string')
  {
    var a = nonterm.exec(src);
    if ( a != null)
    {
      var sym = a[1];
      var mod = a[2];

      this.sym = sym;
      this.mod = mod;

      if (mod != null && validmodifiers.exec(mod) == null)
      {
        throw "Invalid modifier: " + mod;
      }

      if (mod == '*' || mod == '+')
      {
        this.match = function(input)
        {
          var result = 0;
          var n;
          var rounds = 0;
          var tmp = input.dup();
          var rule_sym = input.next_sym();

          while (true)
          {
            var n = tmp.parse(sym);
            if (n === false || n == 0)
            {
              break;
            }
            rounds++;
            result += n;
            tmp.index += n;
            tmp.matched(rule_sym);
          }
          if (mod == '+' && rounds == 0)
          {
            return false;
          }
          return result;
        }
      }
      else if (mod == '?')
      {
        this.match = function(input)
        {
          var result = 0;
          result += input.parse(sym);
          return result;
        }
      }
      else
      {
        this.match = function(input)
        {
          return input.parse(sym);
        }
      }
    }
    else
    {
      if (src.length > 0)
      {
        this.src = mk_re("[" + src.split('').join('][') + "]");
      }
      else
      {
        this.src = mk_re('');
      }
    }
  }
  else if (src instanceof RegExp)
  {
    this.src = mk_re(src);
  }
  else if (src instanceof Function)
  {
    this.match = src;
    this.str   = src.toString();
    this.str   = this.str.slice(0, Math.min(this.str.indexOf('\n')-2, 30));
  }
  else
  {
    throw "Cannot parse atom: " + src + " ( " + typeof src + " )";
  }

  if (this.str == null)
  {
    this.str = this.src.toString();
  }
}
Atom.prototype.toString = function()
{
  return this.str;
}

function Rule(atoms, sym)
{
  if (typeof atoms == 'string')
  {
    atoms = atoms.replace(/{prec .*}/, '');
    this.atoms = _.map(
      atoms.split(/\s+/),
      function(atom, i)
      {
        var result = new Atom(atom);
        //console.log(atom + ' => ' + result.sym + ' (' + sym + ') ' + i);
        return result;
      }
    );
  }
  else if (    atoms instanceof RegExp
            || atoms instanceof Function
          )
  {
    this.atoms = [ new Atom(atoms) ];
  }
  else
  {
    throw "Cannot parse rule: " + atoms + " ( " + typeof atoms + " )";
  }

  this.match = function(input)
  {
    var result = 0;
    var tmp = input.dup();
    for (var i in this.atoms)
    {
      var atom = this.atoms[i];
      if (i == 0)
      {
        if (input.last_sym == atom.sym)
        {
          continue;
        }
        if (input.is_left_recursive(atom.sym))
        {
          return false;
        }
      }

      var n = atom.match(tmp);
      if (n === false)
      {
        return false;
      }
      result += n;
      tmp.index += n;
    }
    return result;
  }
}
Rule.prototype.toString = function()
{
  return this.atoms.join(' ');
}

var Input = function(src, nodes)
{
  var index = 0;
  var indent = "";
  var symstk = [{index: 0, last: null, next: null, toString: function() { return [this.last, this.next, this.index].join(' => ') } }];
  var memory = {};

  if (_.isObject(src) && src instanceof Input)
  {
    index = src.index
    nodes = src.nodes;
    indent = src.indent + "  ";
    symstk = _.clone(src.symstk);
    symstk.unshift(_.clone(src.symstk[0]));
    memory = src.memory;
    src   = src.src;
  }

  this._index = index;
  this.nodes = nodes;
  this.indent = indent;
  this.symstk = symstk;
  this.memory = memory;
  this.src   = src;
}
Object.defineProperties(Input.prototype,
  {
    'length':
    {
      configurable: false,
      enumerable: true,
      get: function() { return this.src.length - this.index },
    },
    'short':
    {
      configurable: false,
      enumerable: true,
      get: function() { return this.src.substr(this.index, 20).replace(/\n/g, "\\n") },
    },
    'index':
    {
      configurable: false,
      enumerable: true,
      get: function() { return this._index },
      set: function(v) { this._index = v; this.symstk[0].index = v },
    },
  }
);
Input.prototype.toString = function()
{
  return this.src.slice(this.index);
}
Input.prototype.dup = function()
{
  return new Input(this);
}
Input.prototype.last_sym = function()
{
  return this.symstk[0].last;
}
Input.prototype.is_left_recursive = function(sym)
{
  var last_symstk = this.symstk[0];
  for (var i in this.symstk)
  {
    if (i == 0)
    {
      continue;
    }

    var symstk = this.symstk[i];
    if (last_symstk.index != symstk.index)
    {
      return false;
    }
    if (symstk.last == sym)
    {
      return false;
    }
    if (symstk.next == sym)
    {
      return true;
    }
  }

  return false;
}
Input.prototype.parse = function(sym)
{
  var memory_key = [sym, this.index, this.is_left_recursive(sym), this.last_sym].join('-');
  if (memory_key in this.memory)
  {
    console.log(this.indent + "Found memory for " + sym + " on '" + this.short + "' ");
    return this.memory[memory_key];
  }
  this.symstk[0].next = sym;
  console.log(this.indent + "Attempting descent for " + sym + " on '" + this.short + "' " + this.symstk);

  var rules = this.nodes[sym];
  if (rules == null)
  {
    throw "Cannot find symbol: " + sym;
  }

  for (var i in rules)
  {
    var rule = rules[i];
    var tmp  = this.dup();

    console.log(this.indent + "  Attempting match for " + rule + " on '" + this.short + "'");

    var n = rule.match(tmp);
    if (n !== false)
    {
      this.symstk[0].index = this.index;
      this.symstk[0].last  = sym;

      console.log(this.indent + "  Yep " + this.symstk);
      this.memory[memory_key] = n;
      return n;
    }
  }

  console.log(this.indent + "  Nope");
  this.memory[memory_key] = false;
  return false;
}

module.exports = function(start, gmr)
{
  var nodes = _.merge({}, gmr);

  _.each(nodes,
    function(node, sym)
    {
      nodes[sym] = _.map(node,
        function(rule, i)
        {
          return new Rule(rule, sym);
        }
      );
    }
  );

  var aparse_descent = function(input, sym)
  {
    console.log("Attempting descent for " + sym + " on '" + input.slice(0, 20).replace(/\n/g, "\\n") + "'");

    var node = nodes[sym];
    for (var i in node)
    {
      var rule = node[i];
      var tmp = input;

      console.log("  Attempting match for " + rule + " on '" + input.slice(0, 20).replace(/\n/g, "\\n") + "'");

      if (rule.match(input))
      {
        console.log("  Yep");
        return true;
      }

      /*
      for (var i in rule)
      {
        var atom = rule[i];
        if (atom instanceof RegExp)
        {
          var match = atom.exec(tmp);
          if ( match == null )
          {
            console.log("  Nope");
            return false;
          }
          tmp = tmp.slice(match[0].length);
          continue;
        }

        if (!parse_descent(tmp, atom))
        {
          console.log("  Nope");
          return false;
        }
      }
      console.log("  Yep");
      return true;
      */

      //throw "Unknown rule: " + rule;
    }

    console.log("  Nope");
    return false;
  }

  var parser = function(source)
  {
    console.log(nodes, start);
    var input = new Input(source, nodes);
    return input.parse(start);
    return parse_descent(source, start);
  }

  return {
    parse: parser,
  };
}
