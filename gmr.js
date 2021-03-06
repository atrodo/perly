"use strict";
var _ = require('lodash');
var util = require('util');

var list_ctx = 'LIST';
var scalar_ctx = 'SCALAR';
var reserved_pkgwords = {
  "if": "expr",
  "unless": "expr",
  "given": "expr",
  "when": "expr",
  "default": "expr",
  "while": "expr",
  "until": "expr",
  "for": "expr",
};

var GNode = {};
var mk_js = function(f)
{
  return mk_gen({
    js: f,
  });
}

var mk_gen = function(props)
{
  var result = props || {};
  Object.setPrototypeOf(result, GNode);
  return result;
}

var mk_argi = function(i)
{
  return mk_gen({
    js: function(args)
    {
      return args[i];
    }
  });
}

var mk_snode = function(syms, symbol, gen, len_override)
{
  return {
    syms: syms.reverse(),
    symbol: symbol,
    gen: gen,
    len: len_override,
  }
}

var esc_lookup = [];
(function()
{
  for (var i = 0; i < 32; i++)
  {
    esc_lookup[i] = '\\u' + (i < 16 ? '000' : '00') + i.toString(16);
  }

  var simple = {
    '\0': '0', '\n': 'n', '\r': 'r',
    '\v': 'v', '\t': 't', '\b': 'b',
    '\f': 'f',
    '\'': '\'', '\"': '\"', '\\': '\\',
  }

  _.each(simple,
    function(esc, k)
    {
      var o = k.codePointAt(0);
      esc_lookup[o] = '\\' + esc;
    }
  );
})();

var esc_str = function(str)
{
  var result = [];
  for (var i = 0; i < str.length; i++)
  {
    var o = str.codePointAt(i);
    var esc = esc_lookup[o];
    result.push( esc != undefined ? esc : str[i]);
  }
  return result.join('');
}

var new_scope = function(block_fn, mem, opts)
{
  var lexpad = {};
  var lexpadi = mem.lexpadi;
  var clexpad = mem.clexpad;
  var tmpi    = mem.tmpi;

  if ( opts == null )
  {
    opts = {};
  }

  Object.setPrototypeOf(lexpad, mem.lexpad);

  mem.lexpad  = lexpad;
  mem.clexpad = 'LEXPAD' + mem.lexpadi++;
  mem.tmpi    = 0;

  var topic_define = '';
  if ( opts.need_topic )
  {
    lexpad['_'] = 'topic';
    topic_define = 'var topic;';
  }
  lexpad['a'] = '1';

  var stmtseq = block_fn();
  if ( stmtseq.implicit_return )
  {
    stmtseq.implicit_return();
  }

  var result= [
    'function(){',
    'var ' + mem.clexpad + ' = {};',
    'var tmp=[];',
    topic_define,
    stmtseq,
    '}'
  ].join('\n');

  if (opts.iife)
  {
    result = '(' + result + ')()';
  }

  mem.tmpi    = tmpi;
  mem.clexpad = clexpad;
  return result;

                           var mem = args.genmem
                           var builtins = require('./builtin');
                           var lexpad = {};
                           var lexpadi = 1

                           Object.setPrototypeOf(lexpad, builtins);
                           mem.builtins = builtins;
                           mem.lexpad   = lexpad;
                           mem.clexpad  = 'LEXPAD'+lexpadi++;
                           //mem.nspad    = lexpad;
                           //mem.nscpad   = mem.clexpad;
                           mem.nslexpad = mem.clexpad;
                           mem.lexpadi  = lexpadi;
                           mem.tmpi     = 0;
                           mem.iife     = true;

                           var result = 'var ' + mem.clexpad + ' = {};\n';
                           result += 'var tmp=[];\n';
                           return result + _.toArray(args).join('');
}

var define_var = function(scope, vname, mem)
{
  var lexpad = mem.lexpad;

  if (scope == 'my')
  {
    if (lexpad.hasOwnProperty(vname))
    {
      //console.log(util.inspect(lexpad, false, null));
      throw "Variable " + vname + " masks same variable earlier in scope";
    }
    lexpad[vname] = [ mem.clexpad, vname ].join('.');
    return lexpad[vname];
  }
}

var mgc_nodes = {
  stmtseq: function(stmts)
  {
     var last_expr = stmts[ stmts.length - 1 ];

     this.toString = function() { return stmts.join(';\n') };
     this.implicit_return = function()
     {
       if ( !( last_expr instanceof mgc_nodes.result ) )
       {
         stmts[ stmts.length - 1 ] = new mgc_nodes.result( last_expr );
       }
     }
  },
  block: function(block_fn, mem)
  {
    var opts = { iife: true };

    this.no_iife = function() { opts.iife = false };
    this.toString = function() { return new_scope(block_fn, mem, opts); };
  },
  term: function(lhs, op, rhs)
  {
    this.toString = function() { return [ lhs, op, rhs].join(' ') };
  },
  list: function(items)
  {
    if ( items instanceof mgc_nodes.list)
    {
      return items;
    }
    this.toString = function() { return items.join(',') };
    for (var i = 0; i < items.length; i++)
    {
      this[i] = items[i];
    }
    this.length = items.length;
    this.context = list_ctx;
  },
  cond: function(cond, block, elseblock, invert)
  {
    var result = [
      'if (',
      invert ? '!' : '!!',
      '(',
      cond,
      ')',
      ' )\n{',
      block,
      '}',
    ];

    if (elseblock != undefined)
    {
      result.push('\nelse\n{');
      result.push(elseblock);
      result.push('}');
    }
    result.push('\n');
    this.toString = function()
    {
      return result.join(' ');
    };
  },
  foreach: function(scalar, expr, block, cont)
  {
    var expr_assign = "" + expr;
    if ( expr.context == list_ctx )
    {
      expr_assign = '[' + expr + ']';
    }

    var tmpvar    = 'loop_expr';
    var tmpi      = 'loop_i';
    var tmpassign = tmpvar + ' = ' + expr_assign;

    var result = [
      '//\n', 'for ( var',
        tmpassign, ',', tmpi + ' = 0;',
        scalar, '=', tmpvar + '[' + tmpi + '],',
        tmpi, '<' + tmpvar + '.length',
        ';',
        tmpi + '++',
        ')', '\n',
        '{\n',
        block, '\n',
        '}\n',
    ];
    this.toString = function()
    {
      return result.join(' ');
    };
  },
  result: function(result)
  {
    if (result == null)
    {
      result = '';
    }
    this.toString = function() { return 'return ' + result };
  },
};

var GNodes = {
  empty: mk_gen({ js: function() { return '' } }),
  single: mk_gen({
    js: function(args, snode)
    {
      var argnum;
      for (var i = 0; i < snode.length; i++)
      {
        if (snode[i].is_snode == true)
        {
          if (argnum != null)
          {
            throw "Too man arguments";
          }
          argnum = i;
        }
      }
      return args[argnum];
    }
  }),
  constant: mk_js(function(args)
  {
    var v = args[0];
    return v;
  }),
  asis: mk_gen({
    js: function(args)
    {
      return _.toArray(args).join('');
    }
  }),
  str: mk_gen({
    js: function(args)
    {
       return "'" + esc_str(args[0]) + "'";
     },
  }),
  scalar: mk_gen({
    js: function(args, snode)
    {
      var mem = args.genmem;
      var vname = args[1];
      if (mem.in_declare)
      {
        return vname;
      }
      var lexpad = mem.lexpad;
      if (lexpad[vname] == null)
      {
        throw "Variable " + vname + " was never declared";
      }
      return lexpad[vname];
    }
  }),
  concat: mk_gen({
    js: function(args, snode)
    {
      var elements = [];
      for (var i = 0; i < args.length; i++)
      {
        elements[i] = args[i];
      }
      return elements.join(' + ');
    }
  }),
};

/*
var builtins = require('./builtin');
var lexpad = {};
Object.setPrototypeOf(lexpad, builtins);
*/

var interpol_escape = {
  t: function() { return '\t' },
  n: function() { return '\n' },
  r: function() { return '\r' },
  f: function() { return '\f' },
  b: function() { return '\b' },
  a: function() { return '\u0007' },
  e: function() { return '\u001B' },

  x: function(state)
    {
      var str = state[0];
      var i   = state[1];

      var point = str.substr(i+1, 2);
      var o = i+2;

      if (str[i+1] == '{')
      {
        for (var o = i+2; o < str.length; o++)
        {
          if (str[o] == '}')
          {
            break;
          }
        }
        point = str.substr(i+2, o-1 - i+2);
      }

      var result = parseInt(point, 16);
      if (isNaN(result))
      {
        result = 0;
      }
      result = String.fromCodePoint(result);

      state[1] = o;
      return result;
    },

  /*
  N {name}     [3]    named Unicode character or character sequence
  N {U+263D}   [4,8]  Unicode character (example: FIRST QUARTER MOON)
  c [          [5]    control char      (example: chr(27))
  o {23072}    [6,8]  octal char        (example: SMILEY)
  0 33         [7,8]  restricted range octal char  (example: ESC)
  */
};

var gen_interpolate = function(str, flags, len)
{
  var result = [];
  var current = '';
  for (var i = 0; i < str.length; i++)
  {
    switch (str[i])
    {
      case '$':
        var vname = '';
        i++;
        for (; i < str.length; i++)
        {
          if (!str[i].match(/\w/))
          {
            break;
          }
          vname += str[i];
        }
        i--;

        if (vname.length == 0)
        {
          current += str[i];
          break;
        }

        result.push(mk_snode([current], '', GNodes.str));
        result.push(mk_snode(['$', vname], '', GNodes.scalar));

        current = '';

        break
      case '\\':
        i++;
        if (interpol_escape[ str[i] ] != undefined)
        {
          var state = [str, i];
          current += interpol_escape[ str[i] ](state);
          i = state[1];
          break;
        }
      default:
        current += str[i];
        break;
    }
  }

  if (result.length == 0)
  {
    return mk_snode([current], '', GNodes.str, len);
  }

  result.push(mk_snode([current], '', GNodes.str));
  result = mk_snode(result, '"', GNodes.concat, len);
  //console.log(util.inspect(result, false, null));
  return result;
}

var grammar = {
  $get_GNode: function()
  {
    return GNode;
  },
  $ws_trim: function(input)
  {
    var eol_re     = /^\s*[\n\r\u2028\u2029]/;
    var comment_re = /^(\s*(?:#.*?[\n\r\u2028\u2029]))/;
    var pod_re     = /^\s*[\n\r\u2028\u2029]=/;
    var line_re    = /^.*[\n\r\u2028\u2029]/;
    var pod_end_re = /^=cut\s*[\n\r\u2028\u2029]/;
    var result = 0;
    var comment;
    var working = input.dup();
    var check_heredoc = false;

    while (1)
    {
      if (check_heredoc)
      {
        if (input.lex_memory.heredoc == null)
        {
          input.lex_memory.heredoc = [];
        }
        if (input.lex_memory.heredoc.length == 0)
        {
          check_heredoc = false;
          continue;
        }

        var heredoc = input.lex_memory.heredoc.shift();
        var term_re = new RegExp('^' + heredoc.term + '[\n\r\u2028\u2029]');
        while (comment = line_re.exec(working))
        {
          var is_term = term_re.test(working);
          result += comment[0].length;
          working.advance(comment[0].length);
          input.debug('heredoc :' + comment[0].replace(/\n/g, "\\n"));
          if (is_term)
          {
            break;
          }
        }
        continue;
      }

      if (comment = pod_re.exec(working))
      {
        while (comment = line_re.exec(working))
        {
          var is_cut = pod_end_re.test(working);
          result += comment[0].length;
          working.advance(comment[0].length);
          input.debug('ws :' + comment[0].replace(/\n/g, "\\n"));
          if (is_cut)
          {
            break;
          }
        }
      }
      else if ( (comment = comment_re.exec(working)) || (comment = eol_re.exec(working)))
      {
        result += comment[0].length;
        working.advance(comment[0].length);
        input.debug('ws :' + comment[0].replace(/\n/g, "\\n"));
        check_heredoc = true;
      }
      else
      {
        break;
      }
    }

    var ws = /^\s*/.exec(working);
    result += ws[0].length;

    return result;
  },

  "GRAMPROG"       : [
                       GNodes.empty,
		       /^/i,
		     ],

  "GRAMEXPR"       : [
		       /GRAMEXPR/i,
		     ],

  "GRAMBLOCK"      : [
		       /GRAMBLOCK/i,
		     ],

  "GRAMBARESTMT"   : [
		       /GRAMBARESTMT/i,
		     ],

  "GRAMFULLSTMT"   : [
		       /GRAMFULLSTMT/i,
		     ],

  "GRAMSTMTSEQ"    : [
		       /GRAMSTMTSEQ/i,
		     ],

  "PKGWORD"        : [
                       [
                         function pkgword_scan(input)
                         {
                           var tmp = input.dup();
                           var result = /^[A-Za-z_](?:[A-Za-z0-9_]|::|')*/i.exec(tmp);

                           if ( result == null )
                           {
                             return false;
                           }
                           result = result[0];

                           if (result in reserved_pkgwords)
                           {
                             return false;
                           }
                           return result;
                         },
                       ]
                     ],
  "WORD"           : [
		       /[A-Za-z0-9_]+/i,
		     ],

  "METHOD"         : [
		       "<PKGWORD>",
		     ],

  "FUNCMETH"       : [
		       "<PKGWORD>",
		     ],

  "THING"          : [
                       /\d(_?\d)*(\.(?!\.)(\d(_?\d)*)?)?([Ee][\+\-]?(\d(_?\d)*))?/i,
                       /\.\d(_?\d)*([Ee][\+\-]?(\d(_?\d)*))?/i,
                       /0b[01](_?[01])*/i,
                       /0[0-7](_?[0-7])*/i,
                       /0x[0-9A-Fa-f](_?[0-9A-Fa-f])*/i,
                       /0x[0-9A-Fa-f](_?[0-9A-Fa-f])*(?:\.\d*)?p[+-]?[0-9]+/i,
                       /inf/i,
                       /nan/i,
                       [
                         function str_scan(input)
                         {
                           var tmp = input.dup();
                           var spaces = /^\s*/.exec(tmp);
                           var i = spaces[0].length;
                           tmp = tmp.toString();

                           var delim;
                           var mean;
                           var flags;
                           switch (tmp[i])
                           {
                             case "'":
                             case '"':
                             case '/':
                               delim = i;
                               mean  = tmp[i];
                               break;
                             case 'm':
                             case 's':
                             case 'y':
                               delim = i+1;
                               mean  = tmp[i];
                               flags = true;
                               break;
                             case 't':
                               if (tmp[i+1] == 'r')
                               {
                                 delim = i+2;
                                 mean  = 'tr';
                                 flags = true;
                               }
                               break;
                             case 'q':
                               switch (tmp[i+1])
                               {
                                 case 'r':
                                   flags = true;
                                 case 'q':
                                 case 'w':
                                   delim = i+2;
                                   mean  = tmp[i+0] + tmp[i+1];
                                   break;
                                 default:
                                   delim = i+1;
                                   mean  = "q";
                               }
                               break;
                           };

                           mean = mean == 'qq' ? '"'
                                : mean == 'q'  ? "'"
                                :                mean;

                           if (delim == null)
                           {
                             return false;
                           }
                           while (/\s/.test(tmp[delim]))
                           {
                             delim++;
                           }

                           var i = delim;
                           var open = tmp[delim];
                           var close = open;

                           if (/\w/.test(open))
                           {
                             return false;
                           }


                           var inverts = "([{< )]}> )]}>";
                           var n = inverts.indexOf(open);
                           if (n != -1)
                           {
                             close = inverts[n + 5];
                           }

                           var result = '';
                           var lhs, rhs;

                           var stack_read = function()
                           {
                             var stack = [close];
                             input.debug('thing', stack, tmp[i], i);
                             while( stack.length )
                             {
                               i++;
                               if ( i > tmp.length)
                               {
                                 //throw "Unterminated string, started at: " + input.short;
                                 return false;
                               }

                               if (close != open && tmp[i] == open)
                               {
                                 stack.unshift(close);
                                 continue;
                               }
                               if (tmp[i] == stack[0])
                               {
                                 stack.shift();
                               }
                               if (tmp[i] == '\\')
                               {
                                 i++;
                               }
                               if (stack.length > 0)
                               {
                                 result = result + tmp[i];
                               }
                             }
                           }

                           stack_read()
                           lhs = tmp.slice(delim+1, i);
                           //input.debug(tmp[i], i);
                           delim = i;

                           if (mean == 's' || mean == 'y' || mean == 'tr')
                           {
                             if (open != close)
                             {
                               var empty_space = /\s*/.exec(tmp.substr(i+1));
                               i += empty_space[0].length + 1;
                               if (tmp[i] != open)
                               {
                                 return false;
                               }
                             }
                             stack_read();
                             rhs = tmp.slice(delim+1, i);
                           }

                           if (flags)
                           {
                             flags = /^\w*/.exec(tmp.substr(i+1));
                             flags = flags[0];
                             i += flags.length;
                           }

                           switch (mean)
                           {
                             case '"':
                               return gen_interpolate(lhs, flags, i+1);
                             case "'":
                               return mk_snode([lhs], '', GNodes.str, i+1);
                             default:
                               return {
                                 len: i + 1,
                                 matched: {
                                   lhs: lhs,
                                   rhs: rhs,
                                   mean: mean,
                                   flags: flags,
                                 },
                               };
                           }
                         },
                         /*
                         mk_gen({
                           js: function(args)
                           {
                             var $1 = args[0];
                             switch ($1.mean)
                             {
                               case "'":
                                 return "'" + $1.lhs + "'";
                                 break;
                               case '"':
                                 return gen_interpolate($1.lhs, 'js');
                                 break;
                               default:
                                 throw "Bad meaning: " + $1.mean;
                             }
                             throw $1;
                           },
                         }),
                         */
                       ],

                       function heredoc_scan(input)
                       {
                         var tmp = input.dup().toString();
                         var heredoc_start = /^\s*[<][<]/.exec(tmp);
                         if (heredoc_start == null)
                         {
                           return false;
                         }

                         var i = heredoc_start[0].length;
                         var delim = '';
                         if (tmp[i] == "'" || tmp[i] == '"')
                         {
                           delim = tmp[i];
                           i++;
                         }
                         var heredoc_term = /^(\w*)/.exec(tmp.substr(i));
                         i += heredoc_term[0].length;

                         if (delim && tmp[i] != delim)
                         {
                           return false;
                         }
                         
                         i += delim.length;

                         if ( input.lex_memory.heredoc == null )
                         {
                           input.lex_memory.heredoc = [];
                         }
                         input.lex_memory.heredoc.push({
                           term: heredoc_term[1],
                           delim: delim, 
                         });

                         return i;
                       },
		     ],

  "KEYWORD"        : [
                       GNodes.constant,
                       'undef',
                       'true',
                       'false',
                     ],

  "PMFUNC"         : [
		       /PMFUNC/i,
		     ],

  "PRIVATEREF"     : [
		       /PRIVATEREF/i,
		     ],

  "QWLIST"         : [
		       /QWLIST/i,
		     ],

  "FUNC0OP"        : [
		       /FUNC0OP/i,
		     ],

  "FUNC0SUB"       : [
		       /FUNC0SUB/i,
		     ],

  "UNIOPSUB"       : [
		       /UNIOPSUB/i,
		     ],

  "LSTOPSUB"       : [
		       /LSTOPSUB/i,
		     ],

  "PLUGEXPR"       : [
		       /PLUGEXPR/i,
		     ],

  "PLUGSTMT"       : [
		       /PLUGSTMT/i,
		     ],

  "LABEL"          : [
		       /LABEL/i,
		     ],

  "FORMAT"         : [
		       /FORMAT\b/i,
		     ],

  "SUB"            : [
		       /SUB\b/i,
		     ],

  "ANONSUB"        : [
		       "",
		     ],

  "PACKAGE"        : [
		       /PACKAGE\b/i,
		     ],

  "USE"            : [
		       /USE\b/i,
		     ],

  "WHILE"          : [
		       /WHILE\b/i,
		     ],

  "UNTIL"          : [
		       /UNTIL\b/i,
		     ],

  "IF"             : [
		       /IF\b/i,
		     ],

  "UNLESS"         : [
		       /UNLESS\b/i,
		     ],

  "ELSE"           : [
		       /ELSE\b/i,
		     ],

  "ELSIF"          : [
		       /ELSIF\b/i,
		     ],

  "CONTINUE"       : [
		       /CONTINUE\b/i,
		     ],

  "FOR"            : [
		       /FOREACH\b/i,
		       /FOR\b/i,
		     ],

  "GIVEN"          : [
		       /GIVEN\b/i,
		     ],

  "WHEN"           : [
		       /WHEN\b/i,
		     ],

  "DEFAULT"        : [
		       /DEFAULT\b/i,
		     ],

  "LOOPEX"         : [
		       /LOOPEX/i,
		     ],

  "DOTDOT"         : [
		       /[.][.]/i,
		     ],

  "YADAYADA"       : [
		       /YADAYADA/i,
		     ],

  "FUNC0"          : [
		       /FUNC0/i,
		     ],

  "FUNC1"          : [
		       /FUNC1/i,
		     ],

  "FUNC"           : [
		       "<PKGWORD>",
		     ],
  "FUNCEXPR"       : [
		       [ "( )", mk_js(function(args) { return '' }) ],
		       [ "( <expr> )", mk_js(function(args) { return args[1] }) ],
		       [ "<expr>", mk_js(function(args) { return args[0] }) ],
                     ],
  "FUNCTERM"       : [
                       "<PKGWORD> <FUNCEXPR>",
                       mk_js(
                         function(args, snode)
                         {
                           var mem = args.genmem;
                           var lexpad = mem.lexpad;
                           var funcname = lexpad[args[0]];
                           var call = '(' + (args[1]) + ')';
                           if (funcname == null)
                           {
                             //console.log(util.inspect(lexpad, false, null));
                             //throw "Unknown function name: " + args[0];
                             var nspad  = mem.nslexpad;
                             var builtins = mem.builtins;
                             var funcarg = nspad+'["' + args[0] + '"]';

                             // Look up the func at run time in the ns lexpad,
                             // we know it's not local since we'd see it in
                             // expad if it was
                             return [
                               '(',
                                 funcarg, '==null ?',
                                 builtins.die,
                                 '("Unknown function: ' + args[0] + '")',
                                 ':', funcarg, call,
                               ')',
                             ].join(' ');
                           }
                           return funcname + call;
                         }
                       ),
		     ],

  "EVAL"           : [
                       /eval/i,
                       // /try/i,
                     ],
  "RETURN"         : [
                       /return/i,
                     ],
  "UNIOP"          : [
                       [
                         "<EVAL> <block>",
                         mk_js(function(args, snode)
                         {
                           var mem = args.genmem
                           var builtins = mem.builtins;
                           var block = args[1];

                           block.no_iife();


                           var result = [
                             builtins.eval+'(',
                             block,
                             ')',
                           ].join('\n');

                           return result;
                         }),
                       ],
                       [
                         "<RETURN> <term>?",
                         mk_js(function(args, snode)
                         {
                           return new mgc_nodes.result(args[1]);
                         }),
                       ],
		     ],

  "LSTOP"          : [
		       /LSTOP/i,
		     ],

  "RELOP"          : [
		       /[<](?!<)/i,
		       /[<][=]/i,
		       /[>](?!>)/i,
		       /[>][=]/i,
		       /lt/i,
		       /gt/i,
		       /le/i,
		       /ge/i,
		     ],

  "EQOP"           : [
		       /[=][=]/i,
		       /[!][=]/i,
		       /[<][=][>]/i,
		       /eq/i,
		       /ne/i,
		       /cmp/i,
		       /[~][~]/i,
		     ],

  "MULOP"          : [
		       /[*]/i,
		       /[/]/i,
		       /[%]/i,
		       /[x]/i,
		     ],

  "ADDOP"          : [
		       /[+]/i,
		       /[-](?!>)/i,
		       /[.]/i,
		     ],

  "PREC_LOW"       : [
		       ///PREC_LOW/i,
		     ],

  "OROP"           : [
		       /OR\b/i,
		     ],

  "DOROP"          : [
		     ],

  "ANDOP"          : [
		       /AND\b/i,
		     ],

  "NOTOP"          : [
		       /NOT\b/i,
		     ],

  "ASSIGNOP"       : [
		       '=',
                       /(?:[*][*]|[+]|[*]|[-]|[\/]|[%])=/,
                       /(?:[&]|[|]|^|[<][<]|[>][>])=/,
                       /(?:[&][&]|[|][|]|[\/][\/])=/,
                       /(?:[.]|[&][.]|[|][.]|^[.]|[x])=/,
		     ],

  "OROR"           : [
		       /[|][|]/i,
		     ],

  "DORDOR"         : [
		       /[/][/]/i,
		     ],

  "ANDAND"         : [
		       /[&][&]/i,
		     ],

  "BITOROP"        : [
		       /[|]/i,
		     ],

  "BITANDOP"       : [
		       /[&]/i,
		     ],

  "SHIFTOP"        : [
		       /[>][>]/i,
		     ],

  "MATCHOP"        : [
		       /[=][~]/i,
		     ],

  "UMINUS"         : [
		       /[-](?!>)/i,
		     ],

  "REFGEN"         : [
		       /\\/i,
		     ],

  "POWOP"          : [
		       /[*][*]/i,
		     ],

  "PREINC"         : [
		       /[+][+]/i,
		     ],

  "PREDEC"         : [
		       /[-][-]/i,
		     ],

  "POSTINC"        : [
		       /[+][+]/i,
		     ],

  "POSTDEC"        : [
		       /[-][-]/i,
		     ],

  "POSTJOIN"       : [
		       /POSTJOIN/i,
		     ],

  "ARROW"          : [
		       /[-][>]/i,
		     ],

  "DOLSHARP"       : [
		       '$#',
		     ],

  "DO"             : [
		       /DO\b/i,
		     ],

  "HASHBRACK"      : [
		       /HASHBRACK/i,
		     ],

  "NOAMP"          : [
		       /NOAMP/i,
		     ],

  "LOCAL"          : [
		       /LOCAL/i,
		     ],

  "MY"             : [
                         mk_gen({
                           js: function(args, snode)
                           {
                             return args[0].toLowerCase();
                           }
                         }),
                         /(?:MY|OUR|STATE)/i,
		     ],

  "REQUIRE"        : [
		       /REQUIRE\b/i,
		     ],

  "COLONATTR"      : [
		       /COLONATTR/i,
		     ],

  "FORMLBRACK"     : [
		       /FORMLBRACK/i,
		     ],

  "FORMRBRACK"     : [
		       /FORMRBRACK/i,
		     ],

  "grammar"        : [
                       mk_gen({
                         js: function(args)
                         {
                           var mem = args.genmem
                           var builtins = require('./builtin');
                           var lexpad = {};

                           Object.setPrototypeOf(lexpad, builtins);
                           mem.builtins = builtins;
                           mem.lexpad   = builtins;
                           mem.lexpadi  = 1;
                           mem.tmpi     = 0;

                           return new_scope(args.getters[1], mem, { iife: true });
                         }
                       }),
		       "<GRAMPROG> <stmtseq>",
		       "<GRAMEXPR> <optexpr>",
		       "<GRAMBLOCK> <block>",
		       "<GRAMBARESTMT> <barestmt>",
		       "<GRAMFULLSTMT> <fullstmt>",
		       "<GRAMSTMTSEQ> <stmtseq>",
		     ],

  "remember"       : [
		       "",
                       GNodes.empty,
		     ],

  "mremember"      : [
		       "",
		     ],

  "startsub"       : [
		       "",
		     ],

  "startanonsub"   : [
		       "",
		     ],

  "startformsub"   : [
		       "",
		     ],

  "mintro"         : [
		       "",
		     ],

  "stmtseq"        : [
                       [
                         mk_gen({
                           js: function stmtseq_js(args, snode)
                           {
                             global.depth = (global.depth || 0)+1;
                             var depth = global.depth;
                             var result = [];
                             for (var i = 0; i < snode.length; i++)
                             {
                               if (snode[i].is_snode == true)
                               {
                                 result.push(args[i]);
                               }
                             }
                             return new mgc_nodes.stmtseq( result );
                           }
                         }),
                         "<fullstmt>* <sideff>?",
                       ]
		     ],

  "fullstmt"       : [
                       GNodes.single,
		       "<barestmt>",
		       "<labfullstmt>",
		     ],

  "labfullstmt"    : [
		       "<LABEL> <barestmt>",
		       "<LABEL> <labfullstmt>",
		     ],

  "barestmt"       : [
		       "<PLUGSTMT>",
		       "<FORMAT> <startformsub> <formname> <formblock>",
		       //"<SUB> <subname> <startsub> <proto>? <subattrlist>? <optsubbody>",
		       "<SUB> <subname> <startsub> <subsignature>? <subattrlist>? { <stmtseq> }",
                       "<SUB> <subname> <startsub> <proto>? <subattrlist>? { <stmtseq> }",
		       "<PACKAGE> <PKGWORD> <WORD>? ;",
		       "<USE> <startsub> <PKGWORD> <WORD>? <listexpr>? ;",
                       [
                         "<IF> ( <expr> ) <mblock> <else>?",
                         mk_js(function(args)
                         {
                           return new mgc_nodes.cond(args[2], args[4], args[5]);
                         }),
                       ],
		       "<UNLESS> ( <miexpr> ) <mblock> <else>?",
		       "<GIVEN> ( <mexpr> ) <mblock>",
		       "<WHEN> ( <mexpr> ) <mblock>",
		       "<DEFAULT> <block>",
		       "<WHILE> ( <texpr> ) <mintro> <mblock> <cont>",
		       "<UNTIL> ( <iexpr> ) <mintro> <mblock> <cont>",
		       "<FOR> ( <mnexpr> ; <texpr> ; <mintro> <mnexpr> ) <mblock>",
                       [
                         "<FOR> <->   <->      ( <mexpr> ) <mblock> <cont>",
                         "<FOR> <MY>? <scalar> ( <mexpr> ) <mblock> <cont>",
                         mk_js(function(args)
                         {
                           var mem = args.genmem
                           var gen_block = function()
                           {
                             var scalar;
                             if (args[1] != '')
                             {
                               mem.in_declare = true;
                               scalar = define_var(args[1], args[2], mem);
                               mem.in_declare = false;
                             }
                             scalar = scalar == null ? args[2] : scalar;

                             if (scalar == '')
                             {
                               scalar = 'topic';
                             }

                             return new mgc_nodes.foreach(scalar, args[4], args[6], args[7]);
                           }

                           return new_scope(gen_block, mem, { need_topic: true, iife: true});
                         }),
                       ],
		       //"<FOR> <scalar> ( <mexpr> ) <mblock> <cont>",
		       "<FOR> <REFGEN> <MY> <my_var> ( <mexpr> ) <mblock> <cont>",
		       "<FOR> <REFGEN> <refgen_topic> ( <mexpr> ) <mblock> <cont>",
		       "<block> <cont>",
                       [
                         "<PACKAGE> <PKGWORD> <WORD>? { <stmtseq> }",
                         mk_js(function(args)
                         {
                           return '';
                         }),
                       ],
		       [ "<sideff> ;", GNodes.single ],
		       ";",
		     ],

  "block"          : [
		       "{ <stmtseq> }",
                       mk_js(function(args)
                       {
                         var mem = args.genmem
                         return new mgc_nodes.block(args.getters[1], mem);
                       }),
		     ],

  "mblock"         : [
		       "{ <stmtseq> }",
                       mk_argi(1),
		     ],

  "else"           : [
		       [ "<ELSE> <mblock>", mk_argi(1), ],
		       "<ELSIF> ( <mexpr> ) <mblock> <else>?",
		     ],

  "expr"           : [
		       "<expr> <ANDOP> <expr>",
		       "<expr> <OROP> <expr>",
		       "<expr> <DOROP> <expr>",
		       "<listexpr> {prec PREC_LOW}",
		     ],

  "subscripted"    : [
                       /*
                       "<subscripteditem>+",
		     ],
  "subscripteditem": [
                       */
		       "<gelem> { <expr> }",
		       "<scalar> [ <expr> ]",
		       "<term> <ARROW> [ <expr> ]",
		       "<subscripted> [ <expr> ]",
		       "<scalar> { <expr> }",
		       "<term> <ARROW> { <expr> }",
		       "<subscripted> { <expr> }",
		       "<term> <ARROW> ( )",
		       "<term> <ARROW> ( <expr> )",
		       "<subscripted> ( <expr> )",
		       "<subscripted> ( )",
		       "( <expr> ) [ <expr> ]",
		       "<QWLIST> [ <expr> ]",
		       "( ) [ <expr> ]",
		     ],

  "scalar"         : [
		       "$ <indirob>",
                       GNodes.scalar,
		     ],

  "ary"            : [
		       "@ <indirob>",
		     ],

  "hsh"            : [
		       "% <indirob>",
		     ],

  "arylen"         : [
		       "<DOLSHARP> <indirob>",
		       "<term> <ARROW> <DOLSHARP> *",
		     ],

  "star"           : [
		       "* <indirob>",
		     ],

  "amper"          : [
		       "& <indirob>",
		     ],

  "sideff"         : [
		       "error",
                       [
                         "<expr> <IF> <expr>",
                         mk_js(function(args)
                         {
                           return new mgc_nodes.cond(args[2], args[0]);
                         }),
                       ],
                       [
                         "<expr> <UNLESS> <expr>",
                         mk_js(function(args)
                         {
                           return new mgc_nodes.cond(args[2], args[0], null, true);
                         }),
                       ],
		       "<expr> <WHILE> <expr>",
		       "<expr> <UNTIL> <iexpr>",
		       "<expr> <FOR> <expr>",
		       "<expr> <WHEN> <expr>",
		       "<expr>",
		     ],

  "sliceme"        : [
		       "<ary>",
		       "<term> <ARROW> @",
		     ],

  "kvslice"        : [
		       "<hsh>",
		       "<term> <ARROW> %",
		     ],

  "gelem"          : [
		       "<star>",
		       "<term> <ARROW> *",
		     ],

  "listexpr"       : [
                       "<WORD> => <listexpr>",
		       "<listexpr> , <term>?",
                       "<listexpr> => <term>",
		       "<term> {prec PREC_LOW}",
                       mk_gen({
                         js: function(args, snode)
                         {
                           var result = [];
                           for (var i = 0; i < snode.length; i++)
                           {
                             if (snode[i].is_snode == false)
                             {
                               continue;
                             }

                             if (snode[i].sym == 'WORD')
                             {
                               result.push("'" + esc_str(args[i]) + "'");
                               continue;
                             }

                             if (_.isArray(args[i]) && args[i].length == 1)
                             {
                               result.push(args[i][0]);
                             }
                             else
                             {
                               result.push(args[i]);
                             }
                           }
                           result.context = list_ctx;
                           return new mgc_nodes.list(result);
                         }
                       }),
		     ],

  "nexpr"          : [
		       "<sideff>",
		       "",
		     ],

  "texpr"          : [
		       "<expr>",
		       "",
		     ],

  "iexpr"          : [
		       "<expr>",
		     ],

  "mexpr"          : [
		       "<expr>",
		     ],

  "mnexpr"         : [
		       "<nexpr>",
		     ],

  "miexpr"         : [
		       "<iexpr>",
		     ],

  "optlistexpr"    : [
		       "{prec PREC_LOW}",
		       "<listexpr> {prec PREC_LOW}",
		     ],

  "optexpr"        : [
		       "<expr>?",
		     ],

  "optrepl"        : [
		       "",
		       "/ <expr>",
		     ],

  "indirob"        : [
		       "<PKGWORD>",
		       "<scalar> {prec PREC_LOW}",
		       "<block>",
		       "<PRIVATEREF>",
                       /^\^[_\w]/,
                       /^{\^[_\w+]}/,
                       /^{\w+}/,
                       /^[!-~]/,
		     ],

  "listop"         : [
		       "<LSTOP> <indirob> <listexpr>",
		       "<FUNC> ( <indirob> <expr> )",
		       "<term> <ARROW> <method> ( <optexpr> )",
		       "<term> <ARROW> <method>",
		       "<METHOD> <indirob> <optlistexpr>",
		       "<FUNCMETH> <indirob> ( <optexpr> )",
		       "<LSTOP> <optlistexpr>",
		       "<FUNC> ( <optexpr> )",
		       "<LSTOPSUB> <startanonsub> <block> <optlistexpr> {prec LSTOP}",
		     ],

  "method"         : [
		       "<METHOD>",
		       "<scalar>",
		     ],

  "formname"       : [
		       "<WORD>",
		       "",
		     ],

  "subname"        : [
		       "<WORD>",
		       "<PRIVATEREF>",
		     ],

  "proto"          : [
		       /[(][$@%&;+]*[)]/
		     ],

  "optsubbody"     : [
		       "<block>",
		       ";",
		     ],

  "cont"           : [
		       [ "", GNodes.empty ],
		       "<CONTINUE> <block>",
		     ],

  "my_scalar"      : [
		       "<scalar>",
		     ],

  "my_var"         : [
		       "<scalar>",
		       "<ary>",
		       "<hsh>",
		     ],

  "refgen_topic"   : [
		       "<my_var>",
		       "<amper>",
		     ],

  "formblock"      : [
		       "= <remember> ; <FORMRBRACK> <formstmtseq> ; .",
		     ],

  "subattrlist"    : [
		       "",
		       "<COLONATTR> <THING>",
		       "<COLONATTR>",
		     ],

  "myattrlist"     : [
		       "<COLONATTR> <THING>",
		       "<COLONATTR>",
		     ],

  "myattrterm"     : [
		       "<MY> <myterm> <myattrlist>?",
                       mk_js(function(args, snode)
                       {
                         var mem = args.genmem;

                         mem.in_declare = true;
                         var items = args[1];

                         if (_.isString(items) || !_.isArrayLike(items))
                         {
                           items = [items];
                           items.context = scalar_ctx;
                         }
                         delete mem.in_declare;

                         result = [];
                         for (var i=0; i<items.length; i++)
                         {
                           result[i] = define_var(args[0], items[i], mem);
                         }

                         if ( items.context == list_ctx )
                         {
                           result = new mgc_nodes.list( result );
                         }
                         return result;

                         if (args[0] == 'my')
                         {
                           var result = [];
                           var lexpad = mem.lexpad;
                           for (var i=0; i<items.length; i++)
                           {
                             var vname = items[i];
                             if (lexpad.hasOwnProperty(vname))
                             {
                               throw "Variable " + vname + " masks same variable earlier in scope";
                             }
                             lexpad[vname] = [ mem.clexpad, vname ].join('.');
                             result[i] = lexpad[vname];
                           }
                           if ( items.context == list_ctx )
                           {
                             result = new mgc_nodes.list( result );
                           }
                           return result;

                           result.context = items.context;
                           return result;
                         }
                       }),
		     ],

  "myterm"         : [
		       [
                         "( <expr>? )",
                         mk_js(function(args)
                           {
                             return args[1];
                           }
                         ),
                       ],
		       "<scalar> {prec (}",
		       "<hsh> {prec (}",
		       "<ary> {prec (}",
		     ],

  "subsignature"   : [
		       "( )",
		     ],

  "termbinop"      : [
                       mk_js(function(args)
                       {
                         return new mgc_nodes.term( args[0], args[1], args[2] );
                       }),
                       "<term> <MATCHOP> <term>",
                       [
                         "<term> <ASSIGNOP> <term>",
                         mk_js(function(args)
                         {
                           var lhs = args[0];
                           var rhs = args[2];
                           var mem = args.genmem;

                           if (lhs.context != list_ctx)
                           {
                             return new mgc_nodes.term( args[0], args[1], args[2] );
                           }

                           rhs = '[' + rhs + ']';
                           var tmpvar = 'tmp[' + (mem.tmpi++) + ']';
                           var tmp = tmpvar + ' = ' + rhs + ',';
                           for (var i = 0; i < lhs.length; i++)
                           {
                             tmp += lhs[i] + '=' + tmpvar + '[' + i + '],';
                           }

                           return [ '(' + tmp + tmpvar + ')' ];
                         }),
                       ],
                       [
                         "<term> <DOTDOT> <term>",
                         mk_js(function(args)
                         {
                           var lhs = args[0] |0;
                           var rhs = args[2] |0;
                           var items = [];
                           for (var i = lhs; i <= rhs; i++)
                           {
                             items.push(i);
                           }
                           var result = new mgc_nodes.list(items);
                           console.log('asdf', result);
                           return result;
                         }),
                       ],
		       "<term> <POWOP> <term>",
		       "<term> <MULOP> <term>",
		       "<term> <ADDOP> <term>",
		       "<term> <SHIFTOP> <term>",
		       "<term> <RELOP> <term>",
		       "<term> <EQOP> <term>",
		       "<term> <BITANDOP> <term>",
		       "<term> <BITOROP> <term>",
		       "<term> <ANDAND> <term>",
		       "<term> <OROR> <term>",
		       "<term> <DORDOR> <term>",
		     ],

  "termunop"       : [
		       "<UMINUS> <term> {prec UMINUS}",
		       "+ <term> {prec UMINUS}",
		       [
                         "! <term>",
                         mk_js(function(args)
                         {
                           return '!(' + args[1] + ')';
                         })
                       ],
		       "~ <term>",
		       "<term> <POSTINC>",
		       "<term> <POSTDEC>",
		       "<term> <POSTJOIN>",
		       "<PREINC> <term>",
		       "<PREDEC> <term>",
		     ],

  "anonymous"      : [
                       GNodes.empty,
		       "[ <expr> ]",
		       "[ ]",
		       "{ <expr> } {prec (}",
		       "<ANONSUB> <startanonsub> <subattrlist> <block> {prec (}",
		       "<ANONSUB> <startanonsub> <subsignature> <subattrlist> { <stmtseq> } {prec (}",
		     ],

  "termdo"         : [
		       "<DO> <term> {prec UNIOP}",
		       "<DO> <block> {prec (}",
		     ],

  "ternary"        : [
		       "<term> ? <term> : <term>",
		     ],
  "term"           : [
                       mk_js(function(args, snode)
                       {
                         var result = [];
                         for (var i = 0; i < snode.length; i++)
                         {
                           var item = args[i];

                           if (!item)
                           {
                             continue;
                           }

                           if (_.isArray(item))
                           {
                             if (item.length > 1)
                             {
                               console.log(item);
                               throw "cannot handle array result terms";
                             }
                             result.push(item[0]);
                           }
                           /*
                           else if (_.isObject(item))
                           {
                             result.push([ item.lhs, item.op, item.rhs].join(' '));
                           }
                           */
                           else
                           {
                             result.push(item);
                           }
                         }

                         return result;//.join(' ');
                       }),
                       "<termbinop>",
		       "<termunop>",
		       "<anonymous>",
		       "<termdo>",
		       "<ternary>",
		       "<REFGEN> <term>",
		       [ "<myattrterm> {prec UNIOP}", GNodes.single ],
		       "<LOCAL> <term> {prec UNIOP}",
                       [ "( <expr> )", mk_argi(1), ],
		       "<QWLIST>",
		       "( )",
		       "<subscripted>",
		       "<arylen> {prec (}",
		       "<scalar> {prec (}",
		       "<star> {prec (}",
		       "<hsh> {prec (}",
		       "<ary> {prec (}",
		       "<sliceme> [ <expr> ]",
		       "<kvslice> [ <expr> ]",
		       "<sliceme> { <expr> ; }",
		       "<kvslice> { <expr> ; }",
		       [ "<KEYWORD> {prec (}", GNodes.single ],
		       [ "<THING> {prec (}", GNodes.single ],
		       "<amper> ( )",
		       "<amper> ( <expr> )",
		       "<amper>",
		       "<NOAMP> <subname> <optlistexpr>",
		       "<term> <ARROW> $ *",
		       "<term> <ARROW> @ *",
		       "<term> <ARROW> % *",
		       "<term> <ARROW> & *",
		       "<term> <ARROW> * * {prec (}",
		       "<LOOPEX> <term>",
		       "<LOOPEX>",
		       "<NOTOP> <listexpr>",
                       "<UNIOP>",
		       "<REQUIRE> <term>",
                       "<FUNCTERM>",
		       "<PKGWORD>",
		       "<listop>",
		       "<YADAYADA>",
		       "<PLUGEXPR>",
		     ],

  "formstmtseq"    : [
		       "",
		       "<formstmtseq> <formline>",
		     ],

  "formline"       : [
		       "<THING> <formarg>",
		     ],

  "formarg"        : [
		       "",
		       "<FORMLBRACK> <stmtseq> <FORMRBRACK>",
		     ],
};

module.exports = grammar
