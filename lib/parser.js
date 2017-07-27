"use strict";

var _ = require('lodash');
var util = require('util');

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
  return new RegExp("^" + src, flags);;
}

var SymMatched = function(sym, length)
{
  if (_.isObject(length))
  {
    // If it's got a syms key, turn it into a SNode
    if (length.syms != null)
    {
      var result = new SNode(length.syms, length.symbol, length.gen, length.len)
      if (length.len != null)
      {
        result.len = length.len
      }
      return result;
    }

    // A SymMatched object gets created when len is defined
    if (length.len != null)
    {
      this.len = length.len;
      if ('sym' in length)
      {
        this.sym = length.sym;
      }
      else
      {
        this.sym = sym;
      }
      if ('matched' in length)
      {
        this.matched = length.matched;
      }
      return;
    }
    throw "Invalid creation of a SymMatched: " + length;
  }

  if (_.isString(length))
  {
    this.len = length.length;
    this.matched = length;
    this.sym = sym;
    return;
  }

  if (!_.isInteger(length))
  {
    console.trace();
    throw "SymMatched requires an integer length";
  }
  this.len = length;
  this.sym = sym;
}
SymMatched.prototype.set_matched = function(s)
{
  if (this.matched != undefined && this.matched != s)
  {
    //throw "Already given a matched string: " + this.matched + " vs " + s;
    return;
  }
  this.matched = s;
}
SymMatched.prototype.toString = function(indent)
{
  indent = indent || '';
  var matched = this.matched ? ' ('+this.matched+')' : '';
  return indent + [this.sym, this.len].join(' => ') + matched;
}
SymMatched.prototype.dump = SymMatched.prototype.toString;
SymMatched.prototype.to_code = function(backend)
{
  return this.matched || '';
}
SymMatched.prototype.is_snode = false;

var SymWS = function(length)
{
  if (!_.isInteger(length))
  {
    throw "SymWS requires an integer length";
  }
  this.len = length;
  this.sym = null;
}
SymWS.prototype = new SymMatched(null, 0);

var GNode = {};
function SNode(syms, symbol, gen, len_override)
{
  if (syms == null)
  {
    syms = [];
  }

  if (!(syms instanceof Array))
  {
    syms = [syms];
  }

  if (gen != null && !GNode.isPrototypeOf(gen))
  {
    console.trace();
    throw "Gen must be a plain object, not " + typeof gen;
  }

  var len = 0;
  var length = 0;
  for (var i=syms.length-1; i>=0; i--)
  {
    var sym = syms[i];
    if (!(sym instanceof SymMatched) && !(sym instanceof SNode))
    {
      sym = new SymMatched(null, sym);
    }
    len += sym.len;

    if (!(sym instanceof SymWS))
    {
      this[length] = sym;
      length++;
    }
  }

  this.gen  = gen;
  this.sym  = symbol;
  this.syms = syms;
  this.len  = len_override != undefined ? len_override : len;
  this.length = length;
}
SNode.prototype.set_matched = function(s)
{
  if (this.matched != undefined && this.matched != s)
  {
    console.trace();
    throw "Already given a matched string: '" + this.matched + "' vs '" + s + "'";
  }
  this.matched = s;
}
SNode.prototype.to_code = function(backend, pgenmem)
{
  var genmem = {};
  var args = { length: this.length, snode: this, genmem: genmem, };
  var items = this;

  pgenmem = pgenmem || {};
  Object.setPrototypeOf(genmem, pgenmem);

  for (var i=0; i < this.length; i++)
  {
    (function()
    {
      var item = items[i];
      var has_cached = false;
      var cached;
      Object.defineProperty(args, i,
        {
          enumerable: true,
          get: function ()
          {
            if (!has_cached)
            {
              cached = item.to_code(backend, genmem);
              has_cached = true;
            }
            return cached;
          }
        }
      );
    })();
  }

  if (this.gen != null && backend in this.gen)
  {
    return this.gen[backend].call(null, args, this);
  }

  if (this.length == 0)
  {
    return '';
  }

  var outputs = [];
  for (var i=0; i < this.length; i++)
  {
    var output = args[i];

    if (output)
    {
      outputs.push( output );
    }
  }

  if (outputs.length == 1)
  {
    return outputs[0];
  }
  //if (args.length == 1)
  //{
  //  return;
  //}

  console.log(this.dump(), '\n', args);
  throw "Cannot auto generate code for '"+backend+"' on a node with !=1 output children (" + this.sym + ") (" + outputs.length + " children) (" + this.matched.slice(0, 20) + ")";
}
SNode.prototype.dump = function(indent)
{
  indent = indent || '';
  var result = [
    indent + 'SNode: [',
    indent + '  len: ' + this.len + ',',
    indent + '  gen: ' + this.gen + ',',
    indent + '  sym: ' + this.sym + ',',
  ];
  for (var i=0; i < this.length; i++)
  {
    result.push( indent + '  ' + i + ':' );
    result.push( this[i].dump(indent + '    ') );
  }
  result.push( indent + ']' );
  return result.join('\n');
}
SNode.prototype.is_snode = true;

function Atom(src)
{
  this.src = src;

  this.match = function(input)
  {
    var result = this.src.exec(input);

    if (result == null)
      return;

    return new SymMatched(null, result[0].length);
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
          var n;
          var match_count = 0;

          while (true)
          {
            //console.log(input.length);
            var n = input.parse(sym);
            if (n == null)
            {
              break;
            }
            //console.log('atom match', match_count, n);
            input.matched(n);
            input.matched(new SymMatched(sym, 0));
            match_count++;
          }

          if (mod == '+' && match_count == 0)
          {
            return;
          }
          //console.log('atommatched', input._matches);
          return input;
          //return new SymMatched(sym, tmp.matches);
        }
      }
      else if (mod == '?')
      {
        this.match = function(input)
        {
          var result = input.parse(sym);
          //console.log('?match' + result);
          if (result == null)
          {
            return [];
            result = new SymMatched(sym, 0);
          }
          return result;
        }
      }
      else
      {
        this.match = function(input)
        {
          var n = input.parse(sym);
          //console.log('atom match '+n);
          return n;
        }
      }
    }
    else
    {
      if (src.length > 0)
      {
        // TODO: [^] does not do what you think it does.
        var regex = src.split('');
        regex = _.map(regex,
          function(c, i)
          {
            if (c == '^' || c == ']')
            {
              c = '\\' + c;
            }
            else
            {
              c = '[' + c + ']';
            }
            return c;
          }
        );
        this.src = mk_re(regex.join(''));
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
    this.match = function(input)
    {
      var result = src(input);
      if (result === false)
      {
        return;
      }
      return new SymMatched(null, result);
    }
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
  function mk_atom(atom)
  {
    if (typeof atom == 'string')
    {
      atom = atom.replace(/{prec .*}/, '');
      return _.map(
        atom.trim().split(/\s+/),
        function(atom, i)
        {
          var result = new Atom(atom);
          //console.log(atom + ' => ' + result.sym + ' (' + sym + ') ' + i);
          return result;
        }
      );
    }
    else if (GNode.isPrototypeOf(atom))
    {
      return atom;
    }
    else if (    atom instanceof RegExp
              || atom instanceof Function
            )
    {
      return [ new Atom(atom) ];
    }
    else
    {
      throw "Cannot parse rule: " + atom + " ( " + typeof atom + " )";
    }
  }

  if ( atoms instanceof Array )
  {
    this.atoms = _.flatten(_.map(atoms, mk_atom));
  }
  else
  {
    this.atoms = mk_atom(atoms);
  }

  this.is_left_rec = false;
  if (this.atoms[0].sym == sym)
  {
    //console.log('this.is_left_rec == ' + sym);
    this.is_left_rec = true;
  }

  this.match = function(input, gnode)
  {
    //var tmp = input.dup(sym);
    //var is_left_rec = false;
    var return_matches = true;
    var last_rec_sym = input.memory.recursive_sym;
    input.debug("+Rule.matchin " + this.atoms);

    for (var i in this.atoms)
    {
      var atom = this.atoms[i];
      //input.debug("+Rule.match atom " + atom, atom.sym, input.is_left_recursive(atom.sym), input.last_sym(atom.sym), '-' + input.short);
      input.debug("+Rule.match atom " + atom, atom.sym, '-' + input.short);
      //if (i == 0 && this.atoms.length > 1 && atom.sym != null)
      if (i == 0 && atom.sym != null)
      {
        var is_left_rec = last_rec_sym != null && last_rec_sym.sym == atom.sym;
        input.debug('is_left_rec: ' + is_left_rec, atom.sym, input.sym);
        //if (is_left_rec && atom.sym == input.sym)
        if (is_left_rec)
        {
          input.debug("+Rule.match cont " + atom);

          // We do not add the match if we are directly left recursive
          if (atom.sym != sym)
          {
            input.memory.recursive_sym = null;
            input.matched(last_rec_sym);
          }
          continue;
        }

        if (input.is_match_recursive(atom.sym))
        {
          input.debug("+Rule.match false " + atom, input.is_match_recursive(atom.sym));
          input.memory.recursive_sym = last_rec_sym;
          return;
        }
        //is_left_rec = input.is_left_recursive(atom.sym);
        /*
        if (is_left_rec)
        {
          if (input.last_sym(atom.sym))
          {
            input.debug("+Rule.match cont " + atom, input.is_left_recursive(atom.sym), input.last_sym(atom.sym));
            return_matches = false;
            continue;
          }

          input.debug("+Rule.match false " + atom, input.is_left_recursive(atom.sym), input.last_sym(atom.sym));
          return;
        }
        */
      }

      if (GNode.isPrototypeOf(atom))
      {
        gnode = atom;
        continue;
      }

      var n = atom.match(input.dup(atom.sym));
      if (n == null)
      {
        input.debug("+Rule.match end " + atom + " on '" + input.short + "'");
        input.debug("+Rule.match end " + n);
        input.memory.recursive_sym = last_rec_sym;
        return;
      }

      if (n instanceof Input)
      {
        n = n.produce(gnode);
        input.matched_snode(n);
      }
      else
      {
        if (n instanceof SymMatched && n.sym == null)
        {
          n.sym = sym;
        }
        input.matched(n);
      }
      input.debug("+Rule.matched " + n + " '" + input.short);
      return_matches = true;
    }

    if (!return_matches)
    {
      input.debug("+Rule.!return_matches " + input.produce());
      input.memory.recursive_sym = last_rec_sym;
      return;
    }

    return gnode || true;//tmp.produce(gnode);
  }
}
Rule.prototype.toString = function()
{
  return this.atoms.join(' ');
}

/*
var SymOutput = function(sym, input)
{
  this.input   = input;
  this.current = sym;
  this.length  = 0;
  this.matches = [];
}
SymOutput.prototype.reset = function()
{
  this.length  = 0;
  this.matches = [];
}
SymOutput.prototype.match = function(sym, len)
{
  this.length += len;
  this.matches.unshift({ length: len, sym: sym });
  return this;
}
SymOutput.prototype.toString = function()
{
  return [this.current, this.length].join(' => ');
}
*/

var Input = function(src, nodes, sym)
{
  var index = 0;
  var indent = "";
  var memory = { max_length: 0, lex: {}, recursive_sym: null };
  //var matches = new SNode();
  var matches = [];

  if (_.isObject(src) && src instanceof Input)
  {
    /*
    if (nodes instanceof SNode)
    {
      matches = nodes;
    }
    */
    sym = nodes;
    index = src.index;
    nodes = src.nodes;
    indent = src.indent + "  ";
    memory = src.memory;
    this.parent = src;
    src   = src.src;
  }

  this._index = index;
  this.sym   = sym;
  this.nodes = nodes;
  this.indent = indent;
  this.memory = memory;
  this._matches = matches;
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
    'eof':
    {
      configurable: false,
      enumerable: true,
      get: function() { return this.length <= 0 },
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
      get: function() { return this._index + this._match_len() },
      //set: function(v) { this._index = v; /*this.symstk[0].index = v*/ },
    },
    'lex_memory':
    {
      configurable: false,
      enumerable: true,
      get: function() { return this.memory.lex },
    },
  }
);
Input.prototype.produce = function(gnode)
{
  //console.log(new this._snode(this._matches));
  //snode = snode || SNode;
  return new SNode(this._matches, this.sym, gnode);
  return this._matches;
}
Input.prototype.debug = function()
{
  arguments[0] = this.indent + arguments[0];
  //console.log.apply(console, arguments);
}
Input.prototype.advance = function(len)
{
  if (this._matches.length > 0)
  {
    throw "Cannot advance and use matches";
  }
  this._index += len;
}
Input.prototype._match_len = function(addl)
{
  return this._len_of(this._matches);
}
Input.prototype._len_of = function(matches)
{
  var result = 0;
  for (var i in matches)
  {
    if (matches[i] == null)
      continue;
    if (matches[i].len == undefined)
    {
      console.trace();
      throw('asdf');
    }
    result += matches[i].len;
  }
  return result;
}
Input.prototype.toString = function()
{
  return this.src.slice(this.index);
}
Input.prototype.dup = function(sym)
{
  return new Input(this, sym);
}
Input.prototype.matched_snode = function(match)
{
  if ( match instanceof SNode )
  {
    match = _.reverse(_.toArray(match));
  }
  this.matched(match);
}
Input.prototype.matched = function(match)
{
  //this.debug(this.indent + "Adding match " , match);
  if (!(match instanceof Array) )
  {
    match = [match];
  }
  for (var i=match.length-1; i>=0; i--)
  {
    var n = match[i];
    if (!(n instanceof SymMatched) && !(n instanceof SNode))
    {
      n = new SymMatched(null, n);
    }

    if (n.len != 0)
    {
      n.set_matched(this.src.substr(this.index, n.len));
    }
    this._matches.unshift(n);
  }

  if (this.nodes['$ws_trim'] != undefined)
  {
    var ws_len = this.nodes['$ws_trim'](this);
    if (ws_len > 0)
    {
      this._matches.unshift(new SymWS(ws_len));
    }
  }
}

// The last symbol matched
Input.prototype.last_sym = function(sym)
{
  if (sym == null)
  {
    //return this.matches[0].sym;
    return //this.symstk[0].last;
  }

  var src = this;
  var lastidx = this.index;
  var idx = lastidx;
  while (src != undefined )
  {
    if (src.sym == sym)
    {
      return true;
    }
    for (var i in src._matches)
    {
      if (lastidx == idx)
      {
        if (src._matches[i].sym == sym)
        {
          return true;
        }
      }

      if (src._matches[i] instanceof SymWS)
      {
        lastidx -= src._matches[i].len;
      }
      idx -= src._matches[i].len;
    }
    if (lastidx != idx)
    {
      return false;
    }
    src = src.parent;
  }
    /*
    if (i == 0)
    {
      continue;
    }
    var symstk = this.symstk[i];
    if (symstk.index != this.symstk[0].index)
    {
      return false;
    }
    if (symstk.last == sym)
    {
      return true;
    }
    */
  this.debug('M: false');
  return false;
}
Input.prototype.is_match_recursive = function(sym)
{
  var src = this;
  while (src != undefined && src._index == this._index)
  {
    if (src.sym == sym)
    {
      return true;
    }
    src = src.parent;
  }
  return false;
  /*
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
  */
}
Input.prototype._match_rules = function(rules, is_left_rec)
{
  var gnode;
  for (var i in rules)
  {
    if (GNode.isPrototypeOf(rules[i]))
    {
      gnode = rules[i];
    }
  }

  var local_rec_sym = this.memory.recursive_sym;

  for (var i in rules)
  {
    var rule = rules[i];

    if (GNode.isPrototypeOf(rule))
    {
      continue;
    }

    if (is_left_rec == false && rule.is_left_rec == true)
    {
      continue;
    }

    this.debug("-Attempting match for " + rule + " on '" + this.short + "'", is_left_rec);

    var tmp = this.dup(this.sym);
    this.memory.recursive_sym = local_rec_sym;
    var n = rule.match(tmp, gnode);

    if (n != null)
    {
      //var this_len = this.index + n.len;
      this.debug("-Yep " + rule + " " + " +(" + n + ")=(" + this.index +")(" + tmp._match_len() + ") - " + this.short + ' == ');
      //this.matched(n);
      this.matched(tmp._matches);
      this.memory.max_length = Math.max(this.index, this.memory.max_length);

      //console.log(this.indent + "Saved memory for " + memory_key + " (" + n + ") on '" + this.short + "' ");
      //this.memory[memory_key] = n;
      return n;
    }
    this.debug("-Noo " + rule + " on '" + this.short + "'");
  }
}

Input.prototype.parse = function(sym)
{
  var recursive_sym = this.memory.recursive_sym != null ? this.memory.recursive_sym.sym : '';
  var memory_key = [sym, this.index, recursive_sym, this.last_sym()].join('-');
  if (memory_key in this.memory)
  {
    this.debug("Found memory for " + memory_key + " (" + this.memory[memory_key] + ") on '" + this.short + "' ");
    return this.memory[memory_key];
  }
  this.debug("Checked memory for " + memory_key + " (" + result + ") on '" + this.short + "' ");

  var tmp = this.dup(sym);
  var rules = this.nodes[sym];
  var result;
  var gnode;

  if (rules == null)
  {
    throw "Cannot find symbol: " + sym;
  }

  this.debug("Attempting descent for " + memory_key + " on '" + tmp.short + "' " + tmp._matches);

  result = tmp._match_rules(rules, false);

  if (result == null)
  {
    this.debug("-Nope " + rules + " " + memory_key + " - " + this.short);
    this.memory[memory_key] = result;
    return;
  }

  if (GNode.isPrototypeOf(result))
  {
    gnode = result;
  }

  if (sym in this.nodes._left_rec)
  {
    var last_index = -1;

    this.debug('RECURSIVE');
    //tmp.matched(result);
    //tmp.matched(new SymMatched(sym, 0));

    var local_rec_sym = this.memory.recursive_sym;

    while (last_index != tmp.index)
    {
      this.debug("Attempting recursion for " + memory_key + " on '" + tmp.short + "' " + tmp._matches);
      this.debug("Attempting recursion indexs " + last_index + " != " + tmp.index);

      last_index = tmp.index;
      var last_match_index = tmp._matches.length-1;
      var last_match = tmp._matches[last_match_index];
      var rec_snode = new SNode(last_match, sym, null, 0);
      rec_snode.set_matched(last_match.matched);

      this.debug(last_match.len, rec_snode.len, rec_snode);
      this.memory.recursive_sym = rec_snode;

      var result = tmp._match_rules(rules, true);

      if (last_index > tmp.index)
      {
        throw "Recursive rule went awry: " + last_index + " > " + tmp.index;
      }
      if (this.memory.recursive_sym != null && this.memory.recursive_sym != rec_snode)
      {
        console.log(this.memory.recursive_sym, rec_snode);
        throw "Recursive rule went awry: this.memory.recursive_sym != rec_snode";
      }
      if (result == null)
      {
        break;
      }

      // if it was used in a recursion, don't leave it here
      if (this.memory.recursive_sym == null)
      {
        var new_match_index;
        for (var i=tmp._matches.length-1; i>=0; i--)
        {
          if (tmp._matches[i] == last_match)
          {
            new_match_index = i;
            break;
          }
        }
        if (tmp._matches[new_match_index] != last_match)
        {
          throw "Could not refind last match";
        }
        this.debug('rec_sym was used', tmp.index, tmp._matches[new_match_index]);
        tmp._matches[new_match_index] = new SNode([], last_match.sym, null, last_match.len);
        this.debug('rec_sym was used', tmp.index, tmp._matches[new_match_index]);
      }
      //tmp.matched(result);
      //last_matched = result;
      if (GNode.isPrototypeOf(result))
      {
        gnode = result;
      }
    }

    //result = tmp.produce(gnode);
    this.debug('Finlen: ' + this._len_of(tmp._matches) + ' : '  + tmp.short);
    this.memory.recursive_sym = local_rec_sym;
    /*
    console.log(this.indent + "Saved memory for " + memory_key + " (" + tmp.matches + ") on '" + this.short + "' ");
    this.memory[memory_key] = tmp.matches;
    return tmp.matches;
    */
  }

  /*
  if (result.length > 1)
  {
    result.push(new SymMatched(">"+sym, 0));
    result.unshift(new SymMatched("<"+sym, 0));
  }
  */
  var result = tmp.produce(gnode);
  this.debug("Saved memory for " + memory_key + " (" + result + ") on '" + this.short + "' ");
  this.memory[memory_key] = result;

  return result;
}

module.exports = function(start, gmr)
{
  var nodes = _.merge({}, gmr);
  var left_recs = {};

  if (nodes['$get_GNode'] != undefined)
  {
    GNode = nodes['$get_GNode']();
  }

  _.each(nodes,
    function(node, sym)
    {
      if (sym[0] == '$')
      {
        nodes[sym] = node;
        return;
      }
      nodes[sym] = _.map(node,
        function(rule, i)
        {
          if (GNode.isPrototypeOf(rule))
          {
            return rule;
          }
          return new Rule(rule, sym);
        }
      );
      _.each(nodes[sym],
        function(rule)
        {
          if (rule.is_left_rec)
          {
            left_recs[sym] = true;
            return false;
          }
        }
      );
    }
  );

  nodes._left_rec = left_recs;

  var parser = function(source)
  {
    //console.log(_.keys(nodes).length);
    var input = new Input(source, nodes);
    var result = input.parse(start);

    var max_len = input.memory.max_length;
    var tot_len = input.length;

    if (max_len > tot_len)
    {
      throw "Parsing went arwy: max parsed > total length";
    }
    if (max_len != tot_len)
    {
      var s = input.toString();
      var lead_size = Math.min(max_len, 20);
      var lead = s.substr(max_len-lead_size, lead_size).replace(/\n/g, "\\n");
      var post = s.substr(max_len, lead_size).replace(/\n/g, "\\n");
      var arrow = new Array(lead.length-1).join(" ");
      throw "Unable to parse:\n"+lead+post + "\n"+arrow+"^\n  max_len:" + input.memory.max_length;
    }
    /*
    console.log('max_len: ' + input.memory.max_length);
    console.log('final_len: ' + input.length);
    var a = {};
    //console.log(util.inspect(result, false, null));
    console.log(result.dump());
    _.each(result, function(v) { var b = v.sym; if (b != undefined) {
      if (b[0] != '<' && b[0] != '>')
      {
        a[b] = 1;
      }
    }});
    console.log(_.keys(a).length);
    console.log('used', _.keys(a).length);
    var b = {};
    _.each(nodes, function(v) { if (a[v]==null) { b[v] = 1}});
    console.log('unused', _.keys(b).length);
    */
    return result;
  }

  var preamble = [
    "'use strict'",
    'if (runtime == null) { runtime = {} }',
    'if (typeof runtime != "object") { throw "Invalid runtime" }',
    ''
  ].join(';\n');
  var eval_source = function(source, runtime)
  {
    if (!(source instanceof SNode))
    {
      source = parser(source);
    }

    var output = source.to_code('js');
    var f = new Function('runtime', preamble + output);
    f(runtime);
  }

  return {
    parse: parser,
    eval: eval_source,
  };
}
