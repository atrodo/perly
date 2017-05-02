"use strict";
var _ = require('lodash');
var util = require('util');

var list_ctx = 'LIST';
var scalar_ctx = 'SCALAR';

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
      var lexpad = mem.lexpad;
      var vname = args[1];
      if (mem.in_declare)
      {
        return vname;
      }
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
                       /[A-Za-z0-9_](?:[A-Za-z0-9_]|::|')*/i,
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
                       /\d(_?\d)*(\.(\d(_?\d)*)?)?([Ee][\+\-]?(\d(_?\d)*))?/i,
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
		       /DOTDOT/i,
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
  "FUNCTERM"       : [
		       "<PKGWORD> <expr>",
		       "<PKGWORD> ( <expr> )",
		       "<PKGWORD> ( )",
                       "<PKGWORD>",
                       mk_gen({
                         js: function(args, snode)
                         {
                           var mem = args.genmem;
                           var lexpad = mem.lexpad;
                           var funcname = lexpad[args[0]];
                           if (funcname == null)
                           {
                             throw "Unknown function name: " + funcname;
                           }
                           return funcname + ('(' + (args[1] || '') + ')');
                         },
                       }),
		     ],

  "UNIOP"          : [
		       /UNIOP/i,
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
		       [
                         /MY/i,
                         mk_gen({
                           js: function(args, snode)
                           {
                             return 'my';
                           }
                         }),
                       ],
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
                           var lexpadi = 1

                           Object.setPrototypeOf(lexpad, builtins);
                           mem.lexpad  = lexpad;
                           mem.clexpad = 'LEXPAD'+lexpadi++;
                           mem.lexpadi = lexpadi;

                           var result = 'var ' + mem.clexpad + ' = {};\n';
                           result += 'var tmp;\n';
                           return result + _.toArray(args).join('');
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
                           js: function(args, snode)
                           {
                             var result = [];
                             for (var i = 0; i < snode.length; i++)
                             {
                               if (snode[i].is_snode == true)
                               {
                                 result.push(args[i]);
                               }
                             }
                             return result.join(';\n');
                           }
                         }),
                         "<fullstmt>*",
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
		       "<SUB> <subname> <startsub> <remember> <subsignature>? <subattrlist>? { <stmtseq> }",
                       "<SUB> <subname> <startsub> <remember> <proto>? <subattrlist>? { <stmtseq> }",
		       "<PACKAGE> <PKGWORD> <WORD>? ;",
		       "<USE> <startsub> <PKGWORD> <WORD>? <listexpr>? ;",
		       "<IF> ( <remember> <mexpr> ) <mblock> <else>",
		       "<UNLESS> ( <remember> <miexpr> ) <mblock> <else>",
		       "<GIVEN> ( <remember> <mexpr> ) <mblock>",
		       "<WHEN> ( <remember> <mexpr> ) <mblock>",
		       "<DEFAULT> <block>",
		       "<WHILE> ( <remember> <texpr> ) <mintro> <mblock> <cont>",
		       "<UNTIL> ( <remember> <iexpr> ) <mintro> <mblock> <cont>",
		       "<FOR> ( <remember> <mnexpr> ; <texpr> ; <mintro> <mnexpr> ) <mblock>",
		       "<FOR> <MY> <remember> <my_scalar> ( <mexpr> ) <mblock> <cont>",
		       "<FOR> <scalar> ( <remember> <mexpr> ) <mblock> <cont>",
		       "<FOR> <REFGEN> <MY> <remember> <my_var> ( <mexpr> ) <mblock> <cont>",
		       "<FOR> <REFGEN> <refgen_topic> ( <remember> <mexpr> ) <mblock> <cont>",
		       "<FOR> ( <remember> <mexpr> ) <mblock> <cont>",
		       "<block> <cont>",
		       "<PACKAGE> <PKGWORD> <WORD>? { <remember> <stmtseq> }",
		       [ "<sideff> ;", GNodes.single ],
		       ";",
		     ],

  "block"          : [
		       "{ <remember> <stmtseq> }",
                       mk_js(function(args)
                       {
                         var mem = args.genmem;
                         var lexpad = {};
                         var lexpadi = mem.lexpadi;
                         var clexpad = mem.clexpad;

                         Object.setPrototypeOf(lexpad, mem.lexpad);
                         mem.lexpad = lexpad;
                         mem.clexpad = 'LEXPAD' + mem.lexpadi++;

                         var result= [
                           '(function(){',
                           'var ' + mem.clexpad + ' = {};',
                           'var tmp;',
                           args[2],
                           '})()',
                         ].join('\n');

                         mem.clexpad = clexpad;
                         return result;
                       }),
		     ],

  "mblock"         : [
		       "{ <mremember> <stmtseq> }",
		     ],

  "else"           : [
		       "<ELSE> <mblock>",
		       "<ELSIF> ( <mexpr> ) <mblock> <else>",
		       "",
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
		       "<expr>",
		       "<expr> <IF> <expr>",
		       "<expr> <UNLESS> <expr>",
		       "<expr> <WHILE> <expr>",
		       "<expr> <UNTIL> <iexpr>",
		       "<expr> <FOR> <expr>",
		       "<expr> <WHEN> <expr>",
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

                             result.push(args[i]);
                           }
                           result.context = list_ctx;
                           return result;
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
                         var lexpad = mem.lexpad;

                         mem.in_declare = true;
                         var items = args[1];

                         if (!(items instanceof Array))
                         {
                           items = [items];
                           items.context = scalar_ctx;
                         }
                         delete mem.in_declare;

                         if (args[0] == 'my')
                         {
                           var result = [];
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
                         return { lhs: args[0], op: args[1], rhs: args[2] };
                       }),
                       "<term> <MATCHOP> <term>",
                       [
                         "<term> <ASSIGNOP> <term>",
                         mk_js(function(args)
                         {
                           var lhs = args[0];
                           var rhs = args[2];
                           var mem = args.genmem;

                           var result = [];
                           if (lhs.context == list_ctx)
                           {
                             rhs = '[' + rhs.join(',') + ']';
                             var tmpvar = 'tmp';
                             var tmp = tmpvar + ' = ' + rhs + ',';
                             for (var i = 0; i < lhs.length; i++)
                             {
                               tmp += lhs[i] + '=' + tmpvar + '[' + i + '],';
                             }
                             result.push( '(' + tmp + tmpvar + ')' );
                           }
                           else
                           {
                             result.push([ lhs, args[1], rhs].join(' '));
                           }
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
		       "<term> <DOTDOT> <term>",
		       "<term> <ANDAND> <term>",
		       "<term> <OROR> <term>",
		       "<term> <DORDOR> <term>",
		     ],

  "termunop"       : [
		       "<UMINUS> <term> {prec UMINUS}",
		       "+ <term> {prec UMINUS}",
		       "! <term>",
		       "~ <term>",
		       "<term> <POSTINC>",
		       "<term> <POSTDEC>",
		       "<term> <POSTJOIN>",
		       "<PREINC> <term>",
		       "<PREDEC> <term>",
		     ],

  "anonymous"      : [
		       "[ <expr> ]",
		       "[ ]",
		       "{ <expr> } {prec (}",
		       "{ } {prec (}",
		       "<ANONSUB> <startanonsub> <subattrlist> <block> {prec (}",
		       "<ANONSUB> <startanonsub> <remember> <subsignature> <subattrlist> { <stmtseq> } {prec (}",
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
                           if (_.isArray(item))
                           {
                             if (item.length > 1)
                             {
                               console.log(item);
                               throw "cannot handle array result terms";
                             }
                             result.push(item[0]);
                           }
                           else if (_.isObject(item))
                           {
                             result.push([ item.op, item.rhs].join(' '));
                           }
                           else
                           {
                             result.push(item);
                           }
                         }

                         return result.join(' ');
                       }),
                       "<termbinop>",
		       "<termunop>",
		       "<anonymous>",
		       "<termdo>",
		       "<ternary>",
		       "<REFGEN> <term>",
		       [ "<myattrterm> {prec UNIOP}", GNodes.single ],
		       "<LOCAL> <term> {prec UNIOP}",
                       [
                         "( <expr> )",
                         mk_js(function(args)
                         {
                           return args[1];
                         }),
                       ],
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
		       "<THING> {prec (}",
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
		       "<UNIOP> <block>",
		       "<UNIOP> <term>",
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
