var _ = require('lodash');
var util = require('util');

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
  asis: mk_gen({
    js: function(args)
    {
      return _.toArray(args).join('');
    }
  }),
};

/*
var builtins = require('./builtin');
var lexpad = {};
Object.setPrototypeOf(lexpad, builtins);
*/

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

  /*
    $GRAMPROG1 = {
      'sym' => 'GRAMPROG',
      'type' => 'token'
    };
  */

  "GRAMPROG"       : [
                       GNodes.empty,
		       /^/i,
		     ],
  /*
    $GRAMEXPR1 = {
      'sym' => 'GRAMEXPR',
      'type' => 'token'
    };
  */

  "GRAMEXPR"       : [
		       /GRAMEXPR/i,
		     ],
  /*
    $GRAMBLOCK1 = {
      'sym' => 'GRAMBLOCK',
      'type' => 'token'
    };
  */

  "GRAMBLOCK"      : [
		       /GRAMBLOCK/i,
		     ],
  /*
    $GRAMBARESTMT1 = {
      'sym' => 'GRAMBARESTMT',
      'type' => 'token'
    };
  */

  "GRAMBARESTMT"   : [
		       /GRAMBARESTMT/i,
		     ],
  /*
    $GRAMFULLSTMT1 = {
      'sym' => 'GRAMFULLSTMT',
      'type' => 'token'
    };
  */

  "GRAMFULLSTMT"   : [
		       /GRAMFULLSTMT/i,
		     ],
  /*
    $GRAMSTMTSEQ1 = {
      'sym' => 'GRAMSTMTSEQ',
      'type' => 'token'
    };
  */

  "GRAMSTMTSEQ"    : [
		       /GRAMSTMTSEQ/i,
		     ],

  "PKGWORD"        : [
                       /[A-Za-z0-9_](?:[A-Za-z0-9_]|::|')*/i,
                     ],
  "WORD"           : [
		       /[A-Za-z0-9_]+/i,
		     ],
  /*
    $METHOD1 = {
      'sym' => 'METHOD',
      'type' => 'token'
    };
  */

  "METHOD"         : [
		       "<PKGWORD>",
		     ],
  /*
    $FUNCMETH1 = {
      'sym' => 'FUNCMETH',
      'type' => 'token'
    };
  */

  "FUNCMETH"       : [
		       "<PKGWORD>",
		     ],
  /*
    $THING1 = {
      'sym' => 'THING',
      'type' => 'token'
    };
  */

  "THING"          : [
                       /\d(_?\d)*(\.(\d(_?\d)*)?)?[Ee][\+\-]?(\d(_?\d)*)/i,
                       /\.\d(_?\d)*[Ee][\+\-]?(\d(_?\d)*)/i,
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
                                 result[result.length] = tmp[i];
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

                           return {
                             len: i + 1,
                             matched: {
                               lhs: lhs,
                               rhs: rhs,
                               mean: mean,
                               flags: flags,
                             },
                           };
                         },
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
  /*
    $PMFUNC1 = {
      'sym' => 'PMFUNC',
      'type' => 'token'
    };
  */

  "PMFUNC"         : [
		       /PMFUNC/i,
		     ],
  /*
    $PRIVATEREF1 = {
      'sym' => 'PRIVATEREF',
      'type' => 'token'
    };
  */

  "PRIVATEREF"     : [
		       /PRIVATEREF/i,
		     ],
  /*
    $QWLIST1 = {
      'sym' => 'QWLIST',
      'type' => 'token'
    };
  */

  "QWLIST"         : [
		       /QWLIST/i,
		     ],
  /*
    $FUNC0OP1 = {
      'sym' => 'FUNC0OP',
      'type' => 'token'
    };
  */

  "FUNC0OP"        : [
		       /FUNC0OP/i,
		     ],
  /*
    $FUNC0SUB1 = {
      'sym' => 'FUNC0SUB',
      'type' => 'token'
    };
  */

  "FUNC0SUB"       : [
		       /FUNC0SUB/i,
		     ],
  /*
    $UNIOPSUB1 = {
      'sym' => 'UNIOPSUB',
      'type' => 'nonassoc'
    };
  */

  "UNIOPSUB"       : [
		       /UNIOPSUB/i,
		     ],
  /*
    $LSTOPSUB1 = {
      'sym' => 'LSTOPSUB',
      'type' => 'nonassoc'
    };
  */

  "LSTOPSUB"       : [
		       /LSTOPSUB/i,
		     ],
  /*
    $PLUGEXPR1 = {
      'sym' => 'PLUGEXPR',
      'type' => 'token'
    };
  */

  "PLUGEXPR"       : [
		       /PLUGEXPR/i,
		     ],
  /*
    $PLUGSTMT1 = {
      'sym' => 'PLUGSTMT',
      'type' => 'token'
    };
  */

  "PLUGSTMT"       : [
		       /PLUGSTMT/i,
		     ],
  /*
    $LABEL1 = {
      'sym' => 'LABEL',
      'type' => 'token'
    };
  */

  "LABEL"          : [
		       /LABEL/i,
		     ],
  /*
    $FORMAT1 = {
      'sym' => 'FORMAT',
      'type' => 'token'
    };
  */

  "FORMAT"         : [
		       /FORMAT\b/i,
		     ],
  /*
    $SUB1 = {
      'sym' => 'SUB',
      'type' => 'token'
    };
  */

  "SUB"            : [
		       /SUB\b/i,
		     ],
  /*
    $ANONSUB1 = {
      'sym' => 'ANONSUB',
      'type' => 'token'
    };
  */

  "ANONSUB"        : [
		       "",
		     ],
  /*
    $PACKAGE1 = {
      'sym' => 'PACKAGE',
      'type' => 'token'
    };
  */

  "PACKAGE"        : [
		       /PACKAGE\b/i,
		     ],
  /*
    $USE1 = {
      'sym' => 'USE',
      'type' => 'token'
    };
  */

  "USE"            : [
		       /USE\b/i,
		     ],
  /*
    $WHILE1 = {
      'sym' => 'WHILE',
      'type' => 'token'
    };
  */

  "WHILE"          : [
		       /WHILE\b/i,
		     ],
  /*
    $UNTIL1 = {
      'sym' => 'UNTIL',
      'type' => 'token'
    };
  */

  "UNTIL"          : [
		       /UNTIL\b/i,
		     ],
  /*
    $IF1 = {
      'sym' => 'IF',
      'type' => 'token'
    };
  */

  "IF"             : [
		       /IF\b/i,
		     ],
  /*
    $UNLESS1 = {
      'sym' => 'UNLESS',
      'type' => 'token'
    };
  */

  "UNLESS"         : [
		       /UNLESS\b/i,
		     ],
  /*
    $ELSE1 = {
      'sym' => 'ELSE',
      'type' => 'token'
    };
  */

  "ELSE"           : [
		       /ELSE\b/i,
		     ],
  /*
    $ELSIF1 = {
      'sym' => 'ELSIF',
      'type' => 'token'
    };
  */

  "ELSIF"          : [
		       /ELSIF\b/i,
		     ],
  /*
    $CONTINUE1 = {
      'sym' => 'CONTINUE',
      'type' => 'token'
    };
  */

  "CONTINUE"       : [
		       /CONTINUE\b/i,
		     ],
  /*
    $FOR1 = {
      'sym' => 'FOR',
      'type' => 'token'
    };
  */

  "FOR"            : [
		       /FOREACH\b/i,
		       /FOR\b/i,
		     ],
  /*
    $GIVEN1 = {
      'sym' => 'GIVEN',
      'type' => 'token'
    };
  */

  "GIVEN"          : [
		       /GIVEN\b/i,
		     ],
  /*
    $WHEN1 = {
      'sym' => 'WHEN',
      'type' => 'token'
    };
  */

  "WHEN"           : [
		       /WHEN\b/i,
		     ],
  /*
    $DEFAULT1 = {
      'sym' => 'DEFAULT',
      'type' => 'token'
    };
  */

  "DEFAULT"        : [
		       /DEFAULT\b/i,
		     ],
  /*
    $LOOPEX1 = {
      'sym' => 'LOOPEX',
      'type' => 'nonassoc'
    };
  */

  "LOOPEX"         : [
		       /LOOPEX/i,
		     ],
  /*
    $DOTDOT1 = {
      'sym' => 'DOTDOT',
      'type' => 'nonassoc'
    };
  */

  "DOTDOT"         : [
		       /DOTDOT/i,
		     ],
  /*
    $YADAYADA1 = {
      'sym' => 'YADAYADA',
      'type' => 'nonassoc'
    };
  */

  "YADAYADA"       : [
		       /YADAYADA/i,
		     ],
  /*
    $FUNC01 = {
      'sym' => 'FUNC0',
      'type' => 'token'
    };
  */

  "FUNC0"          : [
		       /FUNC0/i,
		     ],
  /*
    $FUNC11 = {
      'sym' => 'FUNC1',
      'type' => 'token'
    };
  */

  "FUNC1"          : [
		       /FUNC1/i,
		     ],
  /*
    $FUNC1 = {
      'sym' => 'FUNC',
      'type' => 'token'
    };
  */

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
                           return funcname + (args[1] || '()');
                         },
                       }),
		     ],
  /*
    $UNIOP1 = {
      'sym' => 'UNIOP',
      'type' => 'nonassoc'
    };
  */

  "UNIOP"          : [
		       /UNIOP/i,
		     ],
  /*
    $LSTOP1 = {
      'sym' => 'LSTOP',
      'type' => 'nonassoc'
    };
  */

  "LSTOP"          : [
		       /LSTOP/i,
		     ],
  /*
    $RELOP1 = {
      'sym' => 'RELOP',
      'type' => 'nonassoc'
    };
  */

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
  /*
    $EQOP1 = {
      'sym' => 'EQOP',
      'type' => 'nonassoc'
    };
  */

  "EQOP"           : [
		       /[=][=]/i,
		       /[!][=]/i,
		       /[<][=][>]/i,
		       /eq/i,
		       /ne/i,
		       /cmp/i,
		       /[~][~]/i,
		     ],
  /*
    $MULOP1 = {
      'sym' => 'MULOP',
      'type' => 'left'
    };
  */

  "MULOP"          : [
		       /[*]/i,
		       /[/]/i,
		       /[%]/i,
		       /[x]/i,
		     ],
  /*
    $ADDOP1 = {
      'sym' => 'ADDOP',
      'type' => 'left'
    };
  */

  "ADDOP"          : [
		       /[+]/i,
		       /[-](?!>)/i,
		       /[.]/i,
		     ],
  /*
    $PREC_LOW1 = {
      'sym' => 'PREC_LOW',
      'type' => 'nonassoc'
    };
  */

  "PREC_LOW"       : [
		       ///PREC_LOW/i,
		     ],
  /*
    $OROP1 = {
      'sym' => 'OROP',
      'type' => 'left'
    };
  */

  "OROP"           : [
		       /OR\b/i,
		     ],
  /*
    $DOROP1 = {
      'sym' => 'DOROP',
      'type' => 'left'
    };
  */

  "DOROP"          : [
		     ],
  /*
    $ANDOP1 = {
      'sym' => 'ANDOP',
      'type' => 'left'
    };
  */

  "ANDOP"          : [
		       /AND\b/i,
		     ],
  /*
    $NOTOP1 = {
      'sym' => 'NOTOP',
      'type' => 'right'
    };
  */

  "NOTOP"          : [
		       /NOT\b/i,
		     ],
  /*
    $ASSIGNOP1 = {
      'sym' => 'ASSIGNOP',
      'type' => 'right'
    };
  */

  "ASSIGNOP"       : [
		       '=',
                       /(?:[*][*]|[+]|[*]|[-]|[\/]|[%])=/,
                       /(?:[&]|[|]|^|[<][<]|[>][>])=/,
                       /(?:[&][&]|[|][|]|[\/][\/])=/,
                       /(?:[.]|[&][.]|[|][.]|^[.]|[x])=/,
		     ],
  /*
    $OROR1 = {
      'sym' => 'OROR',
      'type' => 'left'
    };
  */

  "OROR"           : [
		       /[|][|]/i,
		     ],
  /*
    $DORDOR1 = {
      'sym' => 'DORDOR',
      'type' => 'left'
    };
  */

  "DORDOR"         : [
		       /[/][/]/i,
		     ],
  /*
    $ANDAND1 = {
      'sym' => 'ANDAND',
      'type' => 'left'
    };
  */

  "ANDAND"         : [
		       /[&][&]/i,
		     ],
  /*
    $BITOROP1 = {
      'sym' => 'BITOROP',
      'type' => 'left'
    };
  */

  "BITOROP"        : [
		       /[|]/i,
		     ],
  /*
    $BITANDOP1 = {
      'sym' => 'BITANDOP',
      'type' => 'left'
    };
  */

  "BITANDOP"       : [
		       /[&]/i,
		     ],
  /*
    $SHIFTOP1 = {
      'sym' => 'SHIFTOP',
      'type' => 'left'
    };
  */

  "SHIFTOP"        : [
		       /[>][>]/i,
		     ],
  /*
    $MATCHOP1 = {
      'sym' => 'MATCHOP',
      'type' => 'left'
    };
  */

  "MATCHOP"        : [
		       /[=][~]/i,
		     ],
  /*
    $UMINUS1 = {
      'sym' => 'UMINUS',
      'type' => 'right'
    };
  */

  "UMINUS"         : [
		       /[-](?!>)/i,
		     ],
  /*
    $REFGEN1 = {
      'sym' => 'REFGEN',
      'type' => 'right'
    };
  */

  "REFGEN"         : [
		       /\\/i,
		     ],
  /*
    $POWOP1 = {
      'sym' => 'POWOP',
      'type' => 'right'
    };
  */

  "POWOP"          : [
		       /[*][*]/i,
		     ],
  /*
    $PREINC1 = {
      'sym' => 'PREINC',
      'type' => 'nonassoc'
    };
  */

  "PREINC"         : [
		       /[+][+]/i,
		     ],
  /*
    $PREDEC1 = {
      'sym' => 'PREDEC',
      'type' => 'nonassoc'
    };
  */

  "PREDEC"         : [
		       /[-][-]/i,
		     ],
  /*
    $POSTINC1 = {
      'sym' => 'POSTINC',
      'type' => 'nonassoc'
    };
  */

  "POSTINC"        : [
		       /[+][+]/i,
		     ],
  /*
    $POSTDEC1 = {
      'sym' => 'POSTDEC',
      'type' => 'nonassoc'
    };
  */

  "POSTDEC"        : [
		       /[-][-]/i,
		     ],
  /*
    $POSTJOIN1 = {
      'sym' => 'POSTJOIN',
      'type' => 'nonassoc'
    };
  */

  "POSTJOIN"       : [
		       /POSTJOIN/i,
		     ],
  /*
    $ARROW1 = {
      'sym' => 'ARROW',
      'type' => 'left'
    };
  */

  "ARROW"          : [
		       /[-][>]/i,
		     ],
  /*
    $DOLSHARP1 = {
      'sym' => 'DOLSHARP',
      'type' => 'token'
    };
  */

  "DOLSHARP"       : [
		       '$#',
		     ],
  /*
    $DO1 = {
      'sym' => 'DO',
      'type' => 'token'
    };
  */

  "DO"             : [
		       /DO\b/i,
		     ],
  /*
    $HASHBRACK1 = {
      'sym' => 'HASHBRACK',
      'type' => 'token'
    };
  */

  "HASHBRACK"      : [
		       /HASHBRACK/i,
		     ],
  /*
    $NOAMP1 = {
      'sym' => 'NOAMP',
      'type' => 'token'
    };
  */

  "NOAMP"          : [
		       /NOAMP/i,
		     ],
  /*
    $LOCAL1 = {
      'sym' => 'LOCAL',
      'type' => 'token'
    };
  */

  "LOCAL"          : [
		       /LOCAL/i,
		     ],
  /*
    $MY1 = {
      'sym' => 'MY',
      'type' => 'token'
    };
  */

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
  /*
    $REQUIRE1 = {
      'sym' => 'REQUIRE',
      'type' => 'nonassoc'
    };
  */

  "REQUIRE"        : [
		       /REQUIRE\b/i,
		     ],
  /*
    $COLONATTR1 = {
      'sym' => 'COLONATTR',
      'type' => 'token'
    };
  */

  "COLONATTR"      : [
		       /COLONATTR/i,
		     ],
  /*
    $FORMLBRACK1 = {
      'sym' => 'FORMLBRACK',
      'type' => 'token'
    };
  */

  "FORMLBRACK"     : [
		       /FORMLBRACK/i,
		     ],
  /*
    $FORMRBRACK1 = {
      'sym' => 'FORMRBRACK',
      'type' => 'token'
    };
  */

  "FORMRBRACK"     : [
		       /FORMRBRACK/i,
		     ],
  /*
    $grammar1 = {
      'rules' => [
        {
          'code' => '{ parser->expect = XSTATE } { newPROG(block_end($3,$4)) PL_compiling.cop_seq = 0 $$ = 0 } ',
          'comment' => '',
          'line' => ' GRAMPROG { parser->expect = XSTATE } remember stmtseq { newPROG(block_end($3,$4)) PL_compiling.cop_seq = 0 $$ = 0 } ',
          'raw_rule' => ' GRAMPROG  remember stmtseq ',
          'rule' => '<GRAMPROG> <remember> <stmtseq>'
        },
        {
          'code' => '{ parser->expect = XTERM } { PL_eval_root = $3 $$ = 0 } ',
          'comment' => '',
          'line' => ' GRAMEXPR { parser->expect = XTERM } optexpr { PL_eval_root = $3 $$ = 0 } ',
          'raw_rule' => ' GRAMEXPR  optexpr ',
          'rule' => '<GRAMEXPR> <optexpr>'
        },
        {
          'code' => '{ parser->expect = XBLOCK } { PL_pad_reset_pending = TRUE PL_eval_root = $3 $$ = 0 yyunlex() parser->yychar = YYEOF } ',
          'comment' => '',
          'line' => ' GRAMBLOCK { parser->expect = XBLOCK } block { PL_pad_reset_pending = TRUE PL_eval_root = $3 $$ = 0 yyunlex() parser->yychar = YYEOF } ',
          'raw_rule' => ' GRAMBLOCK  block ',
          'rule' => '<GRAMBLOCK> <block>'
        },
        {
          'code' => '{ parser->expect = XSTATE } { PL_pad_reset_pending = TRUE PL_eval_root = $3 $$ = 0 yyunlex() parser->yychar = YYEOF } ',
          'comment' => '',
          'line' => ' GRAMBARESTMT { parser->expect = XSTATE } barestmt { PL_pad_reset_pending = TRUE PL_eval_root = $3 $$ = 0 yyunlex() parser->yychar = YYEOF } ',
          'raw_rule' => ' GRAMBARESTMT  barestmt ',
          'rule' => '<GRAMBARESTMT> <barestmt>'
        },
        {
          'code' => '{ parser->expect = XSTATE } { PL_pad_reset_pending = TRUE PL_eval_root = $3 $$ = 0 yyunlex() parser->yychar = YYEOF } ',
          'comment' => '',
          'line' => ' GRAMFULLSTMT { parser->expect = XSTATE } fullstmt { PL_pad_reset_pending = TRUE PL_eval_root = $3 $$ = 0 yyunlex() parser->yychar = YYEOF } ',
          'raw_rule' => ' GRAMFULLSTMT  fullstmt ',
          'rule' => '<GRAMFULLSTMT> <fullstmt>'
        },
        {
          'code' => '{ parser->expect = XSTATE } { PL_eval_root = $3 $$ = 0 } ',
          'comment' => '',
          'line' => ' GRAMSTMTSEQ { parser->expect = XSTATE } stmtseq { PL_eval_root = $3 $$ = 0 } ',
          'raw_rule' => ' GRAMSTMTSEQ  stmtseq ',
          'rule' => '<GRAMSTMTSEQ> <stmtseq>'
        }
      ],
      'sym' => 'grammar',
      'type' => 'nonterm'
    };
  */

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
  /*
    $remember1 = {
      'rules' => [
        {
          'code' => '{ $$ = block_start(TRUE) parser->parsed_sub = 0; } ',
          'comment' => '/* NULL \*\//* start a full lexical scope \*\/',
          'line' => ' /* NULL \*\/ /* start a full lexical scope \*\/ { $$ = block_start(TRUE) parser->parsed_sub = 0; } ',
          'raw_rule' => '   ',
          'rule' => ''
        }
      ],
      'sym' => 'remember',
      'type' => 'nonterm'
    };
  */

  "remember"       : [
		       "",
                       GNodes.empty,
		     ],
  /*
    $mremember1 = {
      'rules' => [
        {
          'code' => '{ $$ = block_start(FALSE) parser->parsed_sub = 0; } ',
          'comment' => '/* NULL \*\//* start a partial lexical scope \*\/',
          'line' => ' /* NULL \*\/ /* start a partial lexical scope \*\/ { $$ = block_start(FALSE) parser->parsed_sub = 0; } ',
          'raw_rule' => '   ',
          'rule' => ''
        }
      ],
      'sym' => 'mremember',
      'type' => 'nonterm'
    };
  */

  "mremember"      : [
		       "",
		     ],
  /*
    $startsub1 = {
      'rules' => [
        {
          'code' => '{ $$ = start_subparse(FALSE, 0) SAVEFREESV(PL_compcv); } ',
          'comment' => '/* NULL \*\//* start a regular subroutine scope \*\/',
          'line' => ' /* NULL \*\/ /* start a regular subroutine scope \*\/ { $$ = start_subparse(FALSE, 0) SAVEFREESV(PL_compcv); } ',
          'raw_rule' => '   ',
          'rule' => ''
        }
      ],
      'sym' => 'startsub',
      'type' => 'nonterm'
    };
  */

  "startsub"       : [
		       "",
		     ],
  /*
    $startanonsub1 = {
      'rules' => [
        {
          'code' => '{ $$ = start_subparse(FALSE, CVf_ANON) SAVEFREESV(PL_compcv); } ',
          'comment' => '/* NULL \*\//* start an anonymous subroutine scope \*\/',
          'line' => ' /* NULL \*\/ /* start an anonymous subroutine scope \*\/ { $$ = start_subparse(FALSE, CVf_ANON) SAVEFREESV(PL_compcv); } ',
          'raw_rule' => '   ',
          'rule' => ''
        }
      ],
      'sym' => 'startanonsub',
      'type' => 'nonterm'
    };
  */

  "startanonsub"   : [
		       "",
		     ],
  /*
    $startformsub1 = {
      'rules' => [
        {
          'code' => '{ $$ = start_subparse(TRUE, 0) SAVEFREESV(PL_compcv); } ',
          'comment' => '/* NULL \*\//* start a format subroutine scope \*\/',
          'line' => ' /* NULL \*\/ /* start a format subroutine scope \*\/ { $$ = start_subparse(TRUE, 0) SAVEFREESV(PL_compcv); } ',
          'raw_rule' => '   ',
          'rule' => ''
        }
      ],
      'sym' => 'startformsub',
      'type' => 'nonterm'
    };
  */

  "startformsub"   : [
		       "",
		     ],
  /*
    $mintro1 = {
      'rules' => [
        {
          'code' => '{ $$ = (PL_min_intro_pending && PL_max_intro_pending >= PL_min_intro_pending) intro_my(); } ',
          'comment' => '/* NULL \*\//* Normal expression \*\/',
          'line' => ' /* NULL \*\/ { $$ = (PL_min_intro_pending && PL_max_intro_pending >= PL_min_intro_pending) intro_my(); } /* Normal expression \*\/ ',
          'raw_rule' => '   ',
          'rule' => ''
        }
      ],
      'sym' => 'mintro',
      'type' => 'nonterm'
    };
  */

  "mintro"         : [
		       "",
		     ],
  /*
    $stmtseq1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = op_append_list(OP_LINESEQ, $1, $2) PL_pad_reset_pending = TRUE if ($1 && $2) PL_hints |= HINT_BLOCK_SCOPE } ',
          'comment' => '',
          'line' => ' stmtseq fullstmt { $$ = op_append_list(OP_LINESEQ, $1, $2) PL_pad_reset_pending = TRUE if ($1 && $2) PL_hints |= HINT_BLOCK_SCOPE } ',
          'raw_rule' => ' stmtseq fullstmt ',
          'rule' => '<stmtseq> <fullstmt>'
        }
      ],
      'sym' => 'stmtseq',
      'type' => 'nonterm'
    };
  */

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
  /*
    $fullstmt1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1 ? newSTATEOP(0, NULL, $1) : NULL } ',
          'comment' => '',
          'line' => ' barestmt { $$ = $1 ? newSTATEOP(0, NULL, $1) : NULL } ',
          'raw_rule' => ' barestmt ',
        'rule' => '<barestmt>'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' labfullstmt { $$ = $1; } ',
          'raw_rule' => ' labfullstmt ',
          'rule' => '<labfullstmt>'
        }
      ],
      'sym' => 'fullstmt',
      'type' => 'nonterm'
    };
  */

  "fullstmt"       : [
		       "<barestmt>",
		       "<labfullstmt>",
		     ],
  /*
    $labfullstmt1 = {
      'rules' => [
        {
          'code' => '{ $$ = newSTATEOP(SVf_UTF8 * $1[strlen($1)+1], $1, $2) } ',
          'comment' => '',
          'line' => ' LABEL barestmt { $$ = newSTATEOP(SVf_UTF8 * $1[strlen($1)+1], $1, $2) } ',
          'raw_rule' => ' LABEL barestmt ',
          'rule' => '<LABEL> <barestmt>'
        },
        {
          'code' => '{ $$ = newSTATEOP(SVf_UTF8 * $1[strlen($1)+1], $1, $2) } ',
          'comment' => '',
          'line' => ' LABEL labfullstmt { $$ = newSTATEOP(SVf_UTF8 * $1[strlen($1)+1], $1, $2) } ',
          'raw_rule' => ' LABEL labfullstmt ',
          'rule' => '<LABEL> <labfullstmt>'
        }
      ],
      'sym' => 'labfullstmt',
      'type' => 'nonterm'
    };
  */

  "labfullstmt"    : [
		       "<LABEL> <barestmt>",
		       "<LABEL> <labfullstmt>",
		     ],
  /*
    $barestmt1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' PLUGSTMT { $$ = $1; } ',
          'raw_rule' => ' PLUGSTMT ',
          'rule' => '<PLUGSTMT>'
        },
        {
          'code' => '{ CV *fmtcv = PL_compcv newFORM($2, $3, $4) $$ = (OP*)NULL if (CvOUTSIDE(fmtcv) && !CvEVAL(CvOUTSIDE(fmtcv))) { pad_add_weakref(fmtcv) } parser->parsed_sub = 1 } ',
          'comment' => '',
          'line' => ' FORMAT startformsub formname formblock { CV *fmtcv = PL_compcv newFORM($2, $3, $4) $$ = (OP*)NULL if (CvOUTSIDE(fmtcv) && !CvEVAL(CvOUTSIDE(fmtcv))) { pad_add_weakref(fmtcv) } parser->parsed_sub = 1 } ',
          'raw_rule' => ' FORMAT startformsub formname formblock ',
          'rule' => '<FORMAT> <startformsub> <formname> <formblock>'
        },
        {
          'code' => '{ if ($2->op_type == OP_CONST) { const char *const name = SvPV_nolen_const(((SVOP*)$2)->op_sv) if (strEQ(name, "BEGIN") || strEQ(name, "END") || strEQ(name, "INIT") || strEQ(name, "CHECK") || strEQ(name, "UNITCHECK")) CvSPECIAL_on(PL_compcv) } else / if (CvANON(CvOUTSIDE(PL_compcv)) || CvCLONE(CvOUTSIDE(PL_compcv)) || !PadnameIsSTATE(PadlistNAMESARRAY(CvPADLIST( CvOUTSIDE(PL_compcv) ))[$2->op_targ])) CvCLONE_on(PL_compcv) parser->in_my = 0 parser->in_my_stash = NULL } { SvREFCNT_inc_simple_void(PL_compcv) $2->op_type == OP_CONST ? newATTRSUB($3, $2, $5, $6, $7) : newMYSUB($3, $2, $5, $6, $7) $$ = (OP*)NULL intro_my() parser->parsed_sub = 1 } ',
          'comment' => '/* State subs inside anonymous subs need to be clonable themselves. \*\/',
          'line' => ' SUB subname startsub { if ($2->op_type == OP_CONST) { const char *const name = SvPV_nolen_const(((SVOP*)$2)->op_sv) if (strEQ(name, "BEGIN") || strEQ(name, "END") || strEQ(name, "INIT") || strEQ(name, "CHECK") || strEQ(name, "UNITCHECK")) CvSPECIAL_on(PL_compcv) } else /* State subs inside anonymous subs need to be clonable themselves. \*\/ if (CvANON(CvOUTSIDE(PL_compcv)) || CvCLONE(CvOUTSIDE(PL_compcv)) || !PadnameIsSTATE(PadlistNAMESARRAY(CvPADLIST( CvOUTSIDE(PL_compcv) ))[$2->op_targ])) CvCLONE_on(PL_compcv) parser->in_my = 0 parser->in_my_stash = NULL } proto subattrlist optsubbody { SvREFCNT_inc_simple_void(PL_compcv) $2->op_type == OP_CONST ? newATTRSUB($3, $2, $5, $6, $7) : newMYSUB($3, $2, $5, $6, $7) $$ = (OP*)NULL intro_my() parser->parsed_sub = 1 } ',
          'raw_rule' => ' SUB subname startsub  proto subattrlist optsubbody ',
          'rule' => '<SUB> <subname> <startsub> <proto> <subattrlist> <optsubbody>'
        },
        {
          'code' => '{ if ($2->op_type == OP_CONST) { const char *const name = SvPV_nolen_const(((SVOP*)$2)->op_sv) if (strEQ(name, "BEGIN") || strEQ(name, "END") || strEQ(name, "INIT") || strEQ(name, "CHECK") || strEQ(name, "UNITCHECK")) CvSPECIAL_on(PL_compcv) } else / if (CvANON(CvOUTSIDE(PL_compcv)) || CvCLONE(CvOUTSIDE(PL_compcv)) || !PadnameIsSTATE(PadlistNAMESARRAY(CvPADLIST( CvOUTSIDE(PL_compcv) ))[$2->op_targ])) CvCLONE_on(PL_compcv) parser->in_my = 0 parser->in_my_stash = NULL } { OP *body if (parser->copline > (line_t)$8) parser->copline = (line_t)$8 body = block_end($5, op_append_list(OP_LINESEQ, $6, $9)) SvREFCNT_inc_simple_void(PL_compcv) $2->op_type == OP_CONST ? newATTRSUB($3, $2, NULL, $7, body) : newMYSUB($3, $2, NULL, $7, body) $$ = (OP*)NULL intro_my() parser->parsed_sub = 1 } ',
          'comment' => '/* State subs inside anonymous subs need to be clonable themselves. \*\/',
          'line' => ' SUB subname startsub { if ($2->op_type == OP_CONST) { const char *const name = SvPV_nolen_const(((SVOP*)$2)->op_sv) if (strEQ(name, "BEGIN") || strEQ(name, "END") || strEQ(name, "INIT") || strEQ(name, "CHECK") || strEQ(name, "UNITCHECK")) CvSPECIAL_on(PL_compcv) } else /* State subs inside anonymous subs need to be clonable themselves. \*\/ if (CvANON(CvOUTSIDE(PL_compcv)) || CvCLONE(CvOUTSIDE(PL_compcv)) || !PadnameIsSTATE(PadlistNAMESARRAY(CvPADLIST( CvOUTSIDE(PL_compcv) ))[$2->op_targ])) CvCLONE_on(PL_compcv) parser->in_my = 0 parser->in_my_stash = NULL } remember subsignature subattrlist \'{\' stmtseq \'}\' { OP *body if (parser->copline > (line_t)$8) parser->copline = (line_t)$8 body = block_end($5, op_append_list(OP_LINESEQ, $6, $9)) SvREFCNT_inc_simple_void(PL_compcv) $2->op_type == OP_CONST ? newATTRSUB($3, $2, NULL, $7, body) : newMYSUB($3, $2, NULL, $7, body) $$ = (OP*)NULL intro_my() parser->parsed_sub = 1 } ',
          'raw_rule' => ' SUB subname startsub  remember subsignature subattrlist { stmtseq } ',
          'rule' => '<SUB> <subname> <startsub> <remember> <subsignature> <subattrlist> { <stmtseq> }'
        },
        {
          'code' => '{ package($3) if ($2) package_version($2) $$ = (OP*)NULL } ',
          'comment' => '',
          'line' => ' PACKAGE WORD WORD \';\' { package($3) if ($2) package_version($2) $$ = (OP*)NULL } ',
          'raw_rule' => ' PACKAGE WORD WORD ; ',
          'rule' => '<PACKAGE> <WORD> <WORD> ;'
        },
        {
          'code' => '{ CvSPECIAL_on(PL_compcv); / } { SvREFCNT_inc_simple_void(PL_compcv) utilize($1, $2, $4, $5, $6) parser->parsed_sub = 1 $$ = (OP*)NULL } ',
          'comment' => '/* It\'s a BEGIN {} \*\/',
          'line' => ' USE startsub { CvSPECIAL_on(PL_compcv); /* It\'s a BEGIN {} \*\/ } WORD WORD optlistexpr \';\' { SvREFCNT_inc_simple_void(PL_compcv) utilize($1, $2, $4, $5, $6) parser->parsed_sub = 1 $$ = (OP*)NULL } ',
          'raw_rule' => ' USE startsub  WORD WORD optlistexpr ; ',
          'rule' => '<USE> <startsub> <WORD> <WORD> <optlistexpr> ;'
        },
        {
          'code' => '{ $$ = block_end($3, newCONDOP(0, $4, op_scope($6), $7)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' IF \'(\' remember mexpr \')\' mblock else { $$ = block_end($3, newCONDOP(0, $4, op_scope($6), $7)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' IF ( remember mexpr ) mblock else ',
          'rule' => '<IF> ( <remember> <mexpr> ) <mblock> <else>'
        },
        {
          'code' => '{ $$ = block_end($3, newCONDOP(0, $4, op_scope($6), $7)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' UNLESS \'(\' remember miexpr \')\' mblock else { $$ = block_end($3, newCONDOP(0, $4, op_scope($6), $7)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' UNLESS ( remember miexpr ) mblock else ',
          'rule' => '<UNLESS> ( <remember> <miexpr> ) <mblock> <else>'
        },
        {
          'code' => '{ const PADOFFSET offset = pad_findmy_pvs("$_", 0) $$ = block_end($3, newGIVENOP($4, op_scope($6), offset == NOT_IN_PAD || PAD_COMPNAME_FLAGS_isOUR(offset) ? 0 : offset)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' GIVEN \'(\' remember mexpr \')\' mblock { const PADOFFSET offset = pad_findmy_pvs("$_", 0) $$ = block_end($3, newGIVENOP($4, op_scope($6), offset == NOT_IN_PAD || PAD_COMPNAME_FLAGS_isOUR(offset) ? 0 : offset)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' GIVEN ( remember mexpr ) mblock ',
          'rule' => '<GIVEN> ( <remember> <mexpr> ) <mblock>'
        },
        {
          'code' => '{ $$ = block_end($3, newWHENOP($4, op_scope($6))); } ',
          'comment' => '',
          'line' => ' WHEN \'(\' remember mexpr \')\' mblock { $$ = block_end($3, newWHENOP($4, op_scope($6))); } ',
          'raw_rule' => ' WHEN ( remember mexpr ) mblock ',
          'rule' => '<WHEN> ( <remember> <mexpr> ) <mblock>'
        },
        {
          'code' => '{ $$ = newWHENOP(0, op_scope($2)); } ',
          'comment' => '',
          'line' => ' DEFAULT block { $$ = newWHENOP(0, op_scope($2)); } ',
          'raw_rule' => ' DEFAULT block ',
          'rule' => '<DEFAULT> <block>'
        },
        {
          'code' => '{ $$ = block_end($3, newWHILEOP(0, 1, (LOOP*)(OP*)NULL, $4, $7, $8, $6)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' WHILE \'(\' remember texpr \')\' mintro mblock cont { $$ = block_end($3, newWHILEOP(0, 1, (LOOP*)(OP*)NULL, $4, $7, $8, $6)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' WHILE ( remember texpr ) mintro mblock cont ',
          'rule' => '<WHILE> ( <remember> <texpr> ) <mintro> <mblock> <cont>'
        },
        {
          'code' => '{ $$ = block_end($3, newWHILEOP(0, 1, (LOOP*)(OP*)NULL, $4, $7, $8, $6)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' UNTIL \'(\' remember iexpr \')\' mintro mblock cont { $$ = block_end($3, newWHILEOP(0, 1, (LOOP*)(OP*)NULL, $4, $7, $8, $6)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' UNTIL ( remember iexpr ) mintro mblock cont ',
          'rule' => '<UNTIL> ( <remember> <iexpr> ) <mintro> <mblock> <cont>'
        },
        {
          'code' => '{ parser->expect = XTERM; } { parser->expect = XTERM; } { OP *initop = $4 OP *forop = newWHILEOP(0, 1, (LOOP*)(OP*)NULL, scalar($7), $13, $11, $10) if (initop) { forop = op_prepend_elem(OP_LINESEQ, initop, op_append_elem(OP_LINESEQ, newOP(OP_UNSTACK, OPf_SPECIAL), forop)) } PL_hints |= HINT_BLOCK_SCOPE $$ = block_end($3, forop) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' FOR \'(\' remember mnexpr \';\' { parser->expect = XTERM; } texpr \';\' { parser->expect = XTERM; } mintro mnexpr \')\' mblock { OP *initop = $4 OP *forop = newWHILEOP(0, 1, (LOOP*)(OP*)NULL, scalar($7), $13, $11, $10) if (initop) { forop = op_prepend_elem(OP_LINESEQ, initop, op_append_elem(OP_LINESEQ, newOP(OP_UNSTACK, OPf_SPECIAL), forop)) } PL_hints |= HINT_BLOCK_SCOPE $$ = block_end($3, forop) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' FOR ( remember mnexpr ;  texpr ;  mintro mnexpr ) mblock ',
          'rule' => '<FOR> ( <remember> <mnexpr> ; <texpr> ; <mintro> <mnexpr> ) <mblock>'
        },
        {
          'code' => '{ $$ = block_end($3, newFOROP(0, $4, $6, $8, $9)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' FOR MY remember my_scalar \'(\' mexpr \')\' mblock cont { $$ = block_end($3, newFOROP(0, $4, $6, $8, $9)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' FOR MY remember my_scalar ( mexpr ) mblock cont ',
          'rule' => '<FOR> <MY> <remember> <my_scalar> ( <mexpr> ) <mblock> <cont>'
        },
        {
          'code' => '{ $$ = block_end($4, newFOROP(0, op_lvalue($2, OP_ENTERLOOP), $5, $7, $8)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' FOR scalar \'(\' remember mexpr \')\' mblock cont { $$ = block_end($4, newFOROP(0, op_lvalue($2, OP_ENTERLOOP), $5, $7, $8)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' FOR scalar ( remember mexpr ) mblock cont ',
          'rule' => '<FOR> <scalar> ( <remember> <mexpr> ) <mblock> <cont>'
        },
        {
          'code' => '{ parser->in_my = 0; $<opval>$ = my($5); } { $$ = block_end( $4, newFOROP(0, op_lvalue( newUNOP(OP_REFGEN, 0, $<opval>6), OP_ENTERLOOP), $8, $10, $11) ) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' FOR REFGEN MY remember my_var { parser->in_my = 0; $<opval>$ = my($5); } \'(\' mexpr \')\' mblock cont { $$ = block_end( $4, newFOROP(0, op_lvalue( newUNOP(OP_REFGEN, 0, $<opval>6), OP_ENTERLOOP), $8, $10, $11) ) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' FOR REFGEN MY remember my_var  ( mexpr ) mblock cont ',
          'rule' => '<FOR> <REFGEN> <MY> <remember> <my_var> ( <mexpr> ) <mblock> <cont>'
        },
        {
          'code' => '{ $$ = block_end($5, newFOROP( 0, op_lvalue(newUNOP(OP_REFGEN, 0, $3), OP_ENTERLOOP), $6, $8, $9)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' FOR REFGEN refgen_topic \'(\' remember mexpr \')\' mblock cont { $$ = block_end($5, newFOROP( 0, op_lvalue(newUNOP(OP_REFGEN, 0, $3), OP_ENTERLOOP), $6, $8, $9)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' FOR REFGEN refgen_topic ( remember mexpr ) mblock cont ',
          'rule' => '<FOR> <REFGEN> <refgen_topic> ( <remember> <mexpr> ) <mblock> <cont>'
        },
        {
          'code' => '{ $$ = block_end($3, newFOROP(0, (OP*)NULL, $4, $6, $7)) parser->copline = (line_t)$1 } ',
          'comment' => '',
          'line' => ' FOR \'(\' remember mexpr \')\' mblock cont { $$ = block_end($3, newFOROP(0, (OP*)NULL, $4, $6, $7)) parser->copline = (line_t)$1 } ',
          'raw_rule' => ' FOR ( remember mexpr ) mblock cont ',
          'rule' => '<FOR> ( <remember> <mexpr> ) <mblock> <cont>'
        },
        {
          'code' => '{ / $$ = newWHILEOP(0, 1, (LOOP*)(OP*)NULL, (OP*)NULL, $1, $2, 0) } ',
          'comment' => '/* a block is a loop that happens once \*\/',
          'line' => ' block cont { /* a block is a loop that happens once \*\/ $$ = newWHILEOP(0, 1, (LOOP*)(OP*)NULL, (OP*)NULL, $1, $2, 0) } ',
          'raw_rule' => ' block cont ',
          'rule' => '<block> <cont>'
        },
        {
          'code' => '{ package($3) if ($2) { package_version($2) } } { / $$ = newWHILEOP(0, 1, (LOOP*)(OP*)NULL, (OP*)NULL, block_end($5, $7), (OP*)NULL, 0) if (parser->copline > (line_t)$4) parser->copline = (line_t)$4 } ',
          'comment' => '/* a block is a loop that happens once \*\/',
          'line' => ' PACKAGE WORD WORD \'{\' remember { package($3) if ($2) { package_version($2) } } stmtseq \'}\' { /* a block is a loop that happens once \*\/ $$ = newWHILEOP(0, 1, (LOOP*)(OP*)NULL, (OP*)NULL, block_end($5, $7), (OP*)NULL, 0) if (parser->copline > (line_t)$4) parser->copline = (line_t)$4 } ',
          'raw_rule' => ' PACKAGE WORD WORD { remember  stmtseq } ',
          'rule' => '<PACKAGE> <WORD> <WORD> { <remember> <stmtseq> }'
        },
        {
          'code' => '{ $$ = $1 } ',
          'comment' => '',
          'line' => ' sideff \';\' { $$ = $1 } ',
          'raw_rule' => ' sideff ; ',
          'rule' => '<sideff> ;'
        },
        {
          'code' => '{ $$ = (OP*)NULL parser->copline = NOLINE } ',
          'comment' => '',
          'line' => ' \';\' { $$ = (OP*)NULL parser->copline = NOLINE } ',
          'raw_rule' => ' ; ',
          'rule' => ';'
        }
      ],
      'sym' => 'barestmt',
      'type' => 'nonterm'
    };
  */

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
  /*
    $block1 = {
      'rules' => [
        {
          'code' => '{ if (parser->copline > (line_t)$1) parser->copline = (line_t)$1 $$ = block_end($2, $3) } ',
          'comment' => '',
          'line' => ' \'{\' remember stmtseq \'}\' { if (parser->copline > (line_t)$1) parser->copline = (line_t)$1 $$ = block_end($2, $3) } ',
          'raw_rule' => ' { remember stmtseq } ',
          'rule' => '{ <remember> <stmtseq> }'
        }
      ],
      'sym' => 'block',
      'type' => 'nonterm'
    };
  */

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
                           args[2],
                           '})()',
                         ].join('\n');

                         mem.clexpad = clexpad;
                         return result;
                       }),
		     ],
  /*
    $mblock1 = {
      'rules' => [
        {
          'code' => '{ if (parser->copline > (line_t)$1) parser->copline = (line_t)$1 $$ = block_end($2, $3) } ',
          'comment' => '',
          'line' => ' \'{\' mremember stmtseq \'}\' { if (parser->copline > (line_t)$1) parser->copline = (line_t)$1 $$ = block_end($2, $3) } ',
          'raw_rule' => ' { mremember stmtseq } ',
          'rule' => '{ <mremember> <stmtseq> }'
        }
      ],
      'sym' => 'mblock',
      'type' => 'nonterm'
    };
  */

  "mblock"         : [
		       "{ <mremember> <stmtseq> }",
		     ],
  /*
    $else1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ ($2)->op_flags |= OPf_PARENS $$ = op_scope($2) } ',
          'comment' => '',
          'line' => ' ELSE mblock { ($2)->op_flags |= OPf_PARENS $$ = op_scope($2) } ',
          'raw_rule' => ' ELSE mblock ',
          'rule' => '<ELSE> <mblock>'
        },
        {
          'code' => '{ parser->copline = (line_t)$1 $$ = newCONDOP(0, newSTATEOP(OPf_SPECIAL,NULL,$3), op_scope($5), $6) PL_hints |= HINT_BLOCK_SCOPE } ',
          'comment' => '',
          'line' => ' ELSIF \'(\' mexpr \')\' mblock else { parser->copline = (line_t)$1 $$ = newCONDOP(0, newSTATEOP(OPf_SPECIAL,NULL,$3), op_scope($5), $6) PL_hints |= HINT_BLOCK_SCOPE } ',
          'raw_rule' => ' ELSIF ( mexpr ) mblock else ',
          'rule' => '<ELSIF> ( <mexpr> ) <mblock> <else>'
        }
      ],
      'sym' => 'else',
      'type' => 'nonterm'
    };
  */

  "else"           : [
		       "<ELSE> <mblock>",
		       "<ELSIF> ( <mexpr> ) <mblock> <else>",
		       "",
		     ],
  /*
    $expr1 = {
      'rules' => [
        {
          'code' => '{ $$ = newLOGOP(OP_AND, 0, $1, $3); } ',
          'comment' => '',
          'line' => ' expr ANDOP expr { $$ = newLOGOP(OP_AND, 0, $1, $3); } ',
          'raw_rule' => ' expr ANDOP expr ',
          'rule' => '<expr> <ANDOP> <expr>'
        },
        {
          'code' => '{ $$ = newLOGOP($2, 0, $1, $3); } ',
          'comment' => '',
          'line' => ' expr OROP expr { $$ = newLOGOP($2, 0, $1, $3); } ',
          'raw_rule' => ' expr OROP expr ',
          'rule' => '<expr> <OROP> <expr>'
        },
        {
          'code' => '{ $$ = newLOGOP(OP_DOR, 0, $1, $3); } ',
          'comment' => '',
          'line' => ' expr DOROP expr { $$ = newLOGOP(OP_DOR, 0, $1, $3); } ',
          'raw_rule' => ' expr DOROP expr ',
          'rule' => '<expr> <DOROP> <expr>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' listexpr %prec PREC_LOW ',
          'raw_rule' => ' listexpr %prec PREC_LOW',
          'rule' => '<listexpr> {prec PREC_LOW}'
        }
      ],
      'sym' => 'expr',
      'type' => 'nonterm'
    };
  */

  "expr"           : [
		       "<expr> <ANDOP> <expr>",
		       "<expr> <OROP> <expr>",
		       "<expr> <DOROP> <expr>",
		       "<listexpr> {prec PREC_LOW}",
		     ],
  /*
    $subscripted1 = {
      'rules' => [
        {
          'code' => '{ $$ = newBINOP(OP_GELEM, 0, $1, scalar($3)); } ',
          'comment' => '/* *main::{something} \*\//* In this and all the hash accessors, \';\' is * provided by the tokeniser \*\/',
          'line' => ' gelem \'{\' expr \';\' \'}\' /* *main::{something} \*\/ /* In this and all the hash accessors, \';\' is * provided by the tokeniser \*\/ { $$ = newBINOP(OP_GELEM, 0, $1, scalar($3)); } ',
          'raw_rule' => ' gelem { expr ; }   ',
          'rule' => '<gelem> { <expr> ; }'
        },
        {
          'code' => '{ $$ = newBINOP(OP_AELEM, 0, oopsAV($1), scalar($3)) } ',
          'comment' => '/* $array[$element] \*\/',
          'line' => ' scalar \'[\' expr \']\' /* $array[$element] \*\/ { $$ = newBINOP(OP_AELEM, 0, oopsAV($1), scalar($3)) } ',
          'raw_rule' => ' scalar [ expr ]  ',
          'rule' => '<scalar> [ <expr> ]'
        },
        {
          'code' => '{ $$ = newBINOP(OP_AELEM, 0, ref(newAVREF($1),OP_RV2AV), scalar($4)) } ',
          'comment' => '/* somearef->[$element] \*\/',
          'line' => ' term ARROW \'[\' expr \']\' /* somearef->[$element] \*\/ { $$ = newBINOP(OP_AELEM, 0, ref(newAVREF($1),OP_RV2AV), scalar($4)) } ',
          'raw_rule' => ' term ARROW [ expr ]  ',
          'rule' => '<term> <ARROW> [ <expr> ]'
        },
        {
          'code' => '{ $$ = newBINOP(OP_AELEM, 0, ref(newAVREF($1),OP_RV2AV), scalar($3)) } ',
          'comment' => '/* $foo->[$bar]->[$baz] \*\/',
          'line' => ' subscripted \'[\' expr \']\' /* $foo->[$bar]->[$baz] \*\/ { $$ = newBINOP(OP_AELEM, 0, ref(newAVREF($1),OP_RV2AV), scalar($3)) } ',
          'raw_rule' => ' subscripted [ expr ]  ',
          'rule' => '<subscripted> [ <expr> ]'
        },
        {
          'code' => '{ $$ = newBINOP(OP_HELEM, 0, oopsHV($1), jmaybe($3)) } ',
          'comment' => '/* $foo{bar();} \*\/',
          'line' => ' scalar \'{\' expr \';\' \'}\' /* $foo{bar();} \*\/ { $$ = newBINOP(OP_HELEM, 0, oopsHV($1), jmaybe($3)) } ',
          'raw_rule' => ' scalar { expr ; }  ',
          'rule' => '<scalar> { <expr> ; }'
        },
        {
          'code' => '{ $$ = newBINOP(OP_HELEM, 0, ref(newHVREF($1),OP_RV2HV), jmaybe($4)); } ',
          'comment' => '/* somehref->{bar();} \*\/',
          'line' => ' term ARROW \'{\' expr \';\' \'}\' /* somehref->{bar();} \*\/ { $$ = newBINOP(OP_HELEM, 0, ref(newHVREF($1),OP_RV2HV), jmaybe($4)); } ',
          'raw_rule' => ' term ARROW { expr ; }  ',
          'rule' => '<term> <ARROW> { <expr> ; }'
        },
        {
          'code' => '{ $$ = newBINOP(OP_HELEM, 0, ref(newHVREF($1),OP_RV2HV), jmaybe($3)); } ',
          'comment' => '/* $foo->[bar]->{baz;} \*\/',
          'line' => ' subscripted \'{\' expr \';\' \'}\' /* $foo->[bar]->{baz;} \*\/ { $$ = newBINOP(OP_HELEM, 0, ref(newHVREF($1),OP_RV2HV), jmaybe($3)); } ',
          'raw_rule' => ' subscripted { expr ; }  ',
          'rule' => '<subscripted> { <expr> ; }'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, newCVREF(0, scalar($1))); } ',
          'comment' => '/* $subref->() \*\/',
          'line' => ' term ARROW \'(\' \')\' /* $subref->() \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, newCVREF(0, scalar($1))); } ',
          'raw_rule' => ' term ARROW ( )  ',
          'rule' => '<term> <ARROW> ( )'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $4, newCVREF(0, scalar($1)))); } ',
          'comment' => '/* $subref->(@args) \*\/',
          'line' => ' term ARROW \'(\' expr \')\' /* $subref->(@args) \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $4, newCVREF(0, scalar($1)))); } ',
          'raw_rule' => ' term ARROW ( expr )  ',
          'rule' => '<term> <ARROW> ( <expr> )'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $3, newCVREF(0, scalar($1)))); } ',
          'comment' => '/* $foo->{bar}->(@args) \*\/',
          'line' => ' subscripted \'(\' expr \')\' /* $foo->{bar}->(@args) \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $3, newCVREF(0, scalar($1)))); } ',
          'raw_rule' => ' subscripted ( expr )  ',
          'rule' => '<subscripted> ( <expr> )'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, newCVREF(0, scalar($1))); } ',
          'comment' => '/* $foo->{bar}->() \*\/',
          'line' => ' subscripted \'(\' \')\' /* $foo->{bar}->() \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, newCVREF(0, scalar($1))); } ',
          'raw_rule' => ' subscripted ( )  ',
          'rule' => '<subscripted> ( )'
        },
        {
          'code' => '{ $$ = newSLICEOP(0, $5, $2); } ',
          'comment' => '/* list slice \*\/',
          'line' => ' \'(\' expr \')\' \'[\' expr \']\' /* list slice \*\/ { $$ = newSLICEOP(0, $5, $2); } ',
          'raw_rule' => ' ( expr ) [ expr ]  ',
          'rule' => '( <expr> ) [ <expr> ]'
        },
        {
          'code' => '{ $$ = newSLICEOP(0, $3, $1); } ',
          'comment' => '/* list literal slice \*\/',
          'line' => ' QWLIST \'[\' expr \']\' /* list literal slice \*\/ { $$ = newSLICEOP(0, $3, $1); } ',
          'raw_rule' => ' QWLIST [ expr ]  ',
          'rule' => '<QWLIST> [ <expr> ]'
        },
        {
          'code' => '{ $$ = newSLICEOP(0, $4, (OP*)NULL); } ',
          'comment' => '/* empty list slice! \*\//* Binary operators between terms \*\/',
          'line' => ' \'(\' \')\' \'[\' expr \']\' /* empty list slice! \*\/ { $$ = newSLICEOP(0, $4, (OP*)NULL); } /* Binary operators between terms \*\/ ',
          'raw_rule' => ' ( ) [ expr ]   ',
          'rule' => '( ) [ <expr> ]'
        }
      ],
      'sym' => 'subscripted',
      'type' => 'nonterm'
    };
  */

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
  /*
    $scalar1 = {
      'rules' => [
        {
          'code' => '{ $$ = newSVREF($2); } ',
          'comment' => '',
          'line' => ' \'$\' indirob { $$ = newSVREF($2); } ',
          'raw_rule' => ' $ indirob ',
          'rule' => '$ <indirob>'
        }
      ],
      'sym' => 'scalar',
      'type' => 'nonterm'
    };
  */

  "scalar"         : [
		       "$ <indirob>",
                       mk_gen({
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
		     ],
  /*
    $ary1 = {
      'rules' => [
        {
          'code' => '{ $$ = newAVREF($2) if ($$) $$->op_private |= $1 } ',
          'comment' => '',
          'line' => ' \'@\' indirob { $$ = newAVREF($2) if ($$) $$->op_private |= $1 } ',
          'raw_rule' => ' @ indirob ',
          'rule' => '@ <indirob>'
        }
      ],
      'sym' => 'ary',
      'type' => 'nonterm'
    };
  */

  "ary"            : [
		       "@ <indirob>",
		     ],
  /*
    $hsh1 = {
      'rules' => [
        {
          'code' => '{ $$ = newHVREF($2) if ($$) $$->op_private |= $1 } ',
          'comment' => '',
          'line' => ' \'%\' indirob { $$ = newHVREF($2) if ($$) $$->op_private |= $1 } ',
          'raw_rule' => ' % indirob ',
          'rule' => '% <indirob>'
        }
      ],
      'sym' => 'hsh',
      'type' => 'nonterm'
    };
  */

  "hsh"            : [
		       "% <indirob>",
		     ],
  /*
    $arylen1 = {
      'rules' => [
        {
          'code' => '{ $$ = newAVREF($2); } ',
          'comment' => '',
          'line' => ' DOLSHARP indirob { $$ = newAVREF($2); } ',
          'raw_rule' => ' DOLSHARP indirob ',
          'rule' => '<DOLSHARP> <indirob>'
        },
        {
          'code' => '{ $$ = newAVREF($1); } ',
          'comment' => '',
          'line' => ' term ARROW DOLSHARP \'*\' { $$ = newAVREF($1); } ',
          'raw_rule' => ' term ARROW DOLSHARP * ',
          'rule' => '<term> <ARROW> <DOLSHARP> *'
        }
      ],
      'sym' => 'arylen',
      'type' => 'nonterm'
    };
  */

  "arylen"         : [
		       "<DOLSHARP> <indirob>",
		       "<term> <ARROW> <DOLSHARP> *",
		     ],
  /*
    $star1 = {
      'rules' => [
        {
          'code' => '{ $$ = newGVREF(0,$2); } ',
          'comment' => '',
          'line' => ' \'*\' indirob { $$ = newGVREF(0,$2); } ',
          'raw_rule' => ' * indirob ',
          'rule' => '* <indirob>'
        }
      ],
      'sym' => 'star',
      'type' => 'nonterm'
    };
  */

  "star"           : [
		       "* <indirob>",
		     ],
  /*
    $amper1 = {
      'rules' => [
        {
          'code' => '{ $$ = newCVREF($1,$2); } ',
          'comment' => '',
          'line' => ' \'&\' indirob { $$ = newCVREF($1,$2); } ',
          'raw_rule' => ' & indirob ',
          'rule' => '& <indirob>'
        }
      ],
      'sym' => 'amper',
      'type' => 'nonterm'
    };
  */

  "amper"          : [
		       "& <indirob>",
		     ],
  /*
    $sideff1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '',
          'line' => ' error { $$ = (OP*)NULL; } ',
          'raw_rule' => ' error ',
          'rule' => 'error'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' expr { $$ = $1; } ',
          'raw_rule' => ' expr ',
          'rule' => '<expr>'
        },
        {
          'code' => '{ $$ = newLOGOP(OP_AND, 0, $3, $1); } ',
          'comment' => '',
          'line' => ' expr IF expr { $$ = newLOGOP(OP_AND, 0, $3, $1); } ',
          'raw_rule' => ' expr IF expr ',
          'rule' => '<expr> <IF> <expr>'
        },
        {
          'code' => '{ $$ = newLOGOP(OP_OR, 0, $3, $1); } ',
          'comment' => '',
          'line' => ' expr UNLESS expr { $$ = newLOGOP(OP_OR, 0, $3, $1); } ',
          'raw_rule' => ' expr UNLESS expr ',
          'rule' => '<expr> <UNLESS> <expr>'
        },
        {
          'code' => '{ $$ = newLOOPOP(OPf_PARENS, 1, scalar($3), $1); } ',
          'comment' => '',
          'line' => ' expr WHILE expr { $$ = newLOOPOP(OPf_PARENS, 1, scalar($3), $1); } ',
          'raw_rule' => ' expr WHILE expr ',
          'rule' => '<expr> <WHILE> <expr>'
        },
        {
          'code' => '{ $$ = newLOOPOP(OPf_PARENS, 1, $3, $1); } ',
          'comment' => '',
          'line' => ' expr UNTIL iexpr { $$ = newLOOPOP(OPf_PARENS, 1, $3, $1); } ',
          'raw_rule' => ' expr UNTIL iexpr ',
          'rule' => '<expr> <UNTIL> <iexpr>'
        },
        {
          'code' => '{ $$ = newFOROP(0, (OP*)NULL, $3, $1, (OP*)NULL) parser->copline = (line_t)$2; } ',
          'comment' => '',
          'line' => ' expr FOR expr { $$ = newFOROP(0, (OP*)NULL, $3, $1, (OP*)NULL) parser->copline = (line_t)$2; } ',
          'raw_rule' => ' expr FOR expr ',
          'rule' => '<expr> <FOR> <expr>'
        },
        {
          'code' => '{ $$ = newWHENOP($3, op_scope($1)); } ',
          'comment' => '',
          'line' => ' expr WHEN expr { $$ = newWHENOP($3, op_scope($1)); } ',
          'raw_rule' => ' expr WHEN expr ',
          'rule' => '<expr> <WHEN> <expr>'
        }
      ],
      'sym' => 'sideff',
      'type' => 'nonterm'
    };
  */

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
  /*
    $sliceme1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' ary ',
          'raw_rule' => ' ary',
          'rule' => '<ary>'
        },
        {
          'code' => '{ $$ = newAVREF($1); } ',
          'comment' => '',
          'line' => ' term ARROW \'@\' { $$ = newAVREF($1); } ',
          'raw_rule' => ' term ARROW @ ',
          'rule' => '<term> <ARROW> @'
        }
      ],
      'sym' => 'sliceme',
      'type' => 'nonterm'
    };
  */

  "sliceme"        : [
		       "<ary>",
		       "<term> <ARROW> @",
		     ],
  /*
    $kvslice1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' hsh ',
          'raw_rule' => ' hsh',
          'rule' => '<hsh>'
        },
        {
          'code' => '{ $$ = newHVREF($1); } ',
          'comment' => '',
          'line' => ' term ARROW \'%\' { $$ = newHVREF($1); } ',
          'raw_rule' => ' term ARROW % ',
          'rule' => '<term> <ARROW> %'
        }
      ],
      'sym' => 'kvslice',
      'type' => 'nonterm'
    };
  */

  "kvslice"        : [
		       "<hsh>",
		       "<term> <ARROW> %",
		     ],
  /*
    $gelem1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' star ',
          'raw_rule' => ' star',
          'rule' => '<star>'
        },
        {
          'code' => '{ $$ = newGVREF(0,$1); } ',
          'comment' => '',
          'line' => ' term ARROW \'*\' { $$ = newGVREF(0,$1); } ',
          'raw_rule' => ' term ARROW * ',
          'rule' => '<term> <ARROW> *'
        }
      ],
      'sym' => 'gelem',
      'type' => 'nonterm'
    };
  */

  "gelem"          : [
		       "<star>",
		       "<term> <ARROW> *",
		     ],
  /*
    $listexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' listexpr \',\' { $$ = $1; } ',
          'raw_rule' => ' listexpr , ',
          'rule' => '<listexpr> ,'
        },
        {
          'code' => '{ OP* term = $3 $$ = op_append_elem(OP_LIST, $1, term) } ',
          'comment' => '',
          'line' => ' listexpr \',\' term { OP* term = $3 $$ = op_append_elem(OP_LIST, $1, term) } ',
          'raw_rule' => ' listexpr , term ',
          'rule' => '<listexpr> , <term>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' term %prec PREC_LOW ',
          'raw_rule' => ' term %prec PREC_LOW',
          'rule' => '<term> {prec PREC_LOW}'
        }
      ],
      'sym' => 'listexpr',
      'type' => 'nonterm'
    };
  */

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
                               result.push("'" + args[i] + "'");
                               continue;
                             }

                             result.push(args[i]);
                           }
                           return '(' + result.join(', ') + ')';
                         }
                       }),
		     ],
  /*
    $nexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' sideff ',
          'raw_rule' => ' sideff',
          'rule' => '<sideff>'
        }
      ],
      'sym' => 'nexpr',
      'type' => 'nonterm'
    };
  */

  "nexpr"          : [
		       "<sideff>",
		       "",
		     ],
  /*
    $texpr1 = {
      'rules' => [
        {
          'code' => '{ YYSTYPE tmplval (void)scan_num("1", &tmplval) $$ = tmplval.opval; } ',
          'comment' => '/* NULL means true \*\/',
          'line' => ' /* NULL means true \*\/ { YYSTYPE tmplval (void)scan_num("1", &tmplval) $$ = tmplval.opval; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' expr ',
          'raw_rule' => ' expr',
          'rule' => '<expr>'
        }
      ],
      'sym' => 'texpr',
      'type' => 'nonterm'
    };
  */

  "texpr"          : [
		       "<expr>",
		       "",
		     ],
  /*
    $iexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = invert(scalar($1)); } ',
          'comment' => '',
          'line' => ' expr { $$ = invert(scalar($1)); } ',
          'raw_rule' => ' expr ',
          'rule' => '<expr>'
        }
      ],
      'sym' => 'iexpr',
      'type' => 'nonterm'
    };
  */

  "iexpr"          : [
		       "<expr>",
		     ],
  /*
    $mexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1; intro_my(); } ',
          'comment' => '',
          'line' => ' expr { $$ = $1; intro_my(); } ',
          'raw_rule' => ' expr ',
          'rule' => '<expr>'
        }
      ],
      'sym' => 'mexpr',
      'type' => 'nonterm'
    };
  */

  "mexpr"          : [
		       "<expr>",
		     ],
  /*
    $mnexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1; intro_my(); } ',
          'comment' => '',
          'line' => ' nexpr { $$ = $1; intro_my(); } ',
          'raw_rule' => ' nexpr ',
          'rule' => '<nexpr>'
        }
      ],
      'sym' => 'mnexpr',
      'type' => 'nonterm'
    };
  */

  "mnexpr"         : [
		       "<nexpr>",
		     ],
  /*
    $miexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1; intro_my(); } ',
          'comment' => '',
          'line' => ' iexpr { $$ = $1; intro_my(); } ',
          'raw_rule' => ' iexpr ',
          'rule' => '<iexpr>'
        }
      ],
      'sym' => 'miexpr',
      'type' => 'nonterm'
    };
  */

  "miexpr"         : [
		       "<iexpr>",
		     ],
  /*
    $optlistexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ %prec PREC_LOW { $$ = (OP*)NULL; } ',
          'raw_rule' => '  %prec PREC_LOW ',
          'rule' => '{prec PREC_LOW}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' listexpr %prec PREC_LOW { $$ = $1; } ',
          'raw_rule' => ' listexpr %prec PREC_LOW ',
          'rule' => '<listexpr> {prec PREC_LOW}'
        }
      ],
      'sym' => 'optlistexpr',
      'type' => 'nonterm'
    };
  */

  "optlistexpr"    : [
		       "{prec PREC_LOW}",
		       "<listexpr> {prec PREC_LOW}",
		     ],
  /*
    $optexpr1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' expr { $$ = $1; } ',
          'raw_rule' => ' expr ',
          'rule' => '<expr>'
        }
      ],
      'sym' => 'optexpr',
      'type' => 'nonterm'
    };
  */

  "optexpr"        : [
		       "<expr>?",
		     ],
  /*
    $optrepl1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = $2; } ',
          'comment' => '',
          'line' => ' \'/\' expr { $$ = $2; } ',
          'raw_rule' => ' / expr ',
          'rule' => '/ <expr>'
        }
      ],
      'sym' => 'optrepl',
      'type' => 'nonterm'
    };
  */

  "optrepl"        : [
		       "",
		       "/ <expr>",
		     ],
  /*
    $indirob1 = {
      'rules' => [
        {
          'code' => '{ $$ = scalar($1); } ',
          'comment' => '',
          'line' => ' WORD { $$ = scalar($1); } ',
          'raw_rule' => ' WORD ',
          'rule' => '<WORD>'
        },
        {
          'code' => '{ $$ = scalar($1); } ',
          'comment' => '',
          'line' => ' scalar %prec PREC_LOW { $$ = scalar($1); } ',
          'raw_rule' => ' scalar %prec PREC_LOW ',
          'rule' => '<scalar> {prec PREC_LOW}'
        },
        {
          'code' => '{ $$ = op_scope($1); } ',
          'comment' => '',
          'line' => ' block { $$ = op_scope($1); } ',
          'raw_rule' => ' block ',
          'rule' => '<block>'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' PRIVATEREF { $$ = $1; } ',
          'raw_rule' => ' PRIVATEREF ',
          'rule' => '<PRIVATEREF>'
        }
      ],
      'sym' => 'indirob',
      'type' => 'nonterm'
    };
  */

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
  /*
    $listop1 = {
      'rules' => [
        {
          'code' => '{ $$ = op_convert_list($1, OPf_STACKED, op_prepend_elem(OP_LIST, newGVREF($1,$2), $3) ) } ',
          'comment' => '/* map {...} @args or print $fh @args \*\/',
          'line' => ' LSTOP indirob listexpr /* map {...} @args or print $fh @args \*\/ { $$ = op_convert_list($1, OPf_STACKED, op_prepend_elem(OP_LIST, newGVREF($1,$2), $3) ) } ',
          'raw_rule' => ' LSTOP indirob listexpr  ',
          'rule' => '<LSTOP> <indirob> <listexpr>'
        },
        {
          'code' => '{ $$ = op_convert_list($1, OPf_STACKED, op_prepend_elem(OP_LIST, newGVREF($1,$3), $4) ) } ',
          'comment' => '/* print ($fh @args \*\/',
          'line' => ' FUNC \'(\' indirob expr \')\' /* print ($fh @args \*\/ { $$ = op_convert_list($1, OPf_STACKED, op_prepend_elem(OP_LIST, newGVREF($1,$3), $4) ) } ',
          'raw_rule' => ' FUNC ( indirob expr )  ',
          'rule' => '<FUNC> ( <indirob> <expr> )'
        },
        {
          'code' => '{ $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, scalar($1), $5), newMETHOP(OP_METHOD, 0, $3))) } ',
          'comment' => '/* $foo->bar(list) \*\/',
          'line' => ' term ARROW method \'(\' optexpr \')\' /* $foo->bar(list) \*\/ { $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, scalar($1), $5), newMETHOP(OP_METHOD, 0, $3))) } ',
          'raw_rule' => ' term ARROW method ( optexpr )  ',
          'rule' => '<term> <ARROW> <method> ( <optexpr> )'
        },
        {
          'code' => '{ $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, scalar($1), newMETHOP(OP_METHOD, 0, $3))) } ',
          'comment' => '/* $foo->bar \*\/',
          'line' => ' term ARROW method /* $foo->bar \*\/ { $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, scalar($1), newMETHOP(OP_METHOD, 0, $3))) } ',
          'raw_rule' => ' term ARROW method  ',
          'rule' => '<term> <ARROW> <method>'
        },
        {
          'code' => '{ $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, $2, $3), newMETHOP(OP_METHOD, 0, $1))) } ',
          'comment' => '/* new Class @args \*\/',
          'line' => ' METHOD indirob optlistexpr /* new Class @args \*\/ { $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, $2, $3), newMETHOP(OP_METHOD, 0, $1))) } ',
          'raw_rule' => ' METHOD indirob optlistexpr  ',
          'rule' => '<METHOD> <indirob> <optlistexpr>'
        },
        {
          'code' => '{ $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, $2, $4), newMETHOP(OP_METHOD, 0, $1))) } ',
          'comment' => '/* method $object (@args) \*\/',
          'line' => ' FUNCMETH indirob \'(\' optexpr \')\' /* method $object (@args) \*\/ { $$ = op_convert_list(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, $2, $4), newMETHOP(OP_METHOD, 0, $1))) } ',
          'raw_rule' => ' FUNCMETH indirob ( optexpr )  ',
          'rule' => '<FUNCMETH> <indirob> ( <optexpr> )'
        },
        {
          'code' => '{ $$ = op_convert_list($1, 0, $2); } ',
          'comment' => '/* print @args \*\/',
          'line' => ' LSTOP optlistexpr /* print @args \*\/ { $$ = op_convert_list($1, 0, $2); } ',
          'raw_rule' => ' LSTOP optlistexpr  ',
          'rule' => '<LSTOP> <optlistexpr>'
        },
        {
          'code' => '{ $$ = op_convert_list($1, 0, $3); } ',
          'comment' => '/* print (@args) \*\/',
          'line' => ' FUNC \'(\' optexpr \')\' /* print (@args) \*\/ { $$ = op_convert_list($1, 0, $3); } ',
          'raw_rule' => ' FUNC ( optexpr )  ',
          'rule' => '<FUNC> ( <optexpr> )'
        },
        {
          'code' => '{ SvREFCNT_inc_simple_void(PL_compcv) $<opval>$ = newANONATTRSUB($2, 0, (OP*)NULL, $3); } { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, $<opval>4, $5), $1)) } ',
          'comment' => '/* sub f(&@); f { foo } ... \*\//* ... @bar \*\/',
          'line' => ' LSTOPSUB startanonsub block /* sub f(&@); f { foo } ... \*\/ { SvREFCNT_inc_simple_void(PL_compcv) $<opval>$ = newANONATTRSUB($2, 0, (OP*)NULL, $3); } optlistexpr %prec LSTOP /* ... @bar \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, op_prepend_elem(OP_LIST, $<opval>4, $5), $1)) } ',
          'raw_rule' => ' LSTOPSUB startanonsub block   optlistexpr %prec LSTOP  ',
          'rule' => '<LSTOPSUB> <startanonsub> <block> <optlistexpr> {prec LSTOP}'
        }
      ],
      'sym' => 'listop',
      'type' => 'nonterm'
    };
  */

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
  /*
    $method1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' METHOD ',
          'raw_rule' => ' METHOD',
          'rule' => '<METHOD>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' scalar ',
          'raw_rule' => ' scalar',
          'rule' => '<scalar>'
        }
      ],
      'sym' => 'method',
      'type' => 'nonterm'
    };
  */

  "method"         : [
		       "<METHOD>",
		       "<scalar>",
		     ],
  /*
    $formname1 = {
      'rules' => [
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' WORD { $$ = $1; } ',
          'raw_rule' => ' WORD ',
          'rule' => '<WORD>'
        },
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        }
      ],
      'sym' => 'formname',
      'type' => 'nonterm'
    };
  */

  "formname"       : [
		       "<WORD>",
		       "",
		     ],
  /*
    $subname1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' WORD ',
          'raw_rule' => ' WORD',
          'rule' => '<WORD>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' PRIVATEREF ',
          'raw_rule' => ' PRIVATEREF',
          'rule' => '<PRIVATEREF>'
        }
      ],
      'sym' => 'subname',
      'type' => 'nonterm'
    };
  */

  "subname"        : [
		       "<WORD>",
		       "<PRIVATEREF>",
		     ],
  /*
    $proto1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' THING ',
          'raw_rule' => ' THING',
          'rule' => '<THING>'
        }
      ],
      'sym' => 'proto',
      'type' => 'nonterm'
    };
  */

  "proto"          : [
		       /[(][$@%&;+]*[)]/
		     ],
  /*
    $optsubbody1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' block ',
          'raw_rule' => ' block',
          'rule' => '<block>'
        },
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '',
          'line' => ' \';\' { $$ = (OP*)NULL; } ',
          'raw_rule' => ' ; ',
          'rule' => ';'
        }
      ],
      'sym' => 'optsubbody',
      'type' => 'nonterm'
    };
  */

  "optsubbody"     : [
		       "<block>",
		       ";",
		     ],
  /*
    $cont1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = op_scope($2); } ',
          'comment' => '',
          'line' => ' CONTINUE block { $$ = op_scope($2); } ',
          'raw_rule' => ' CONTINUE block ',
          'rule' => '<CONTINUE> <block>'
        }
      ],
      'sym' => 'cont',
      'type' => 'nonterm'
    };
  */

  "cont"           : [
		       [ "", GNodes.empty ],
		       "<CONTINUE> <block>",
		     ],
  /*
    $my_scalar1 = {
      'rules' => [
        {
          'code' => '{ parser->in_my = 0; $$ = my($1); } ',
          'comment' => '',
          'line' => ' scalar { parser->in_my = 0; $$ = my($1); } ',
          'raw_rule' => ' scalar ',
          'rule' => '<scalar>'
        }
      ],
      'sym' => 'my_scalar',
      'type' => 'nonterm'
    };
  */

  "my_scalar"      : [
		       "<scalar>",
		     ],
  /*
    $my_var1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' scalar ',
          'raw_rule' => ' scalar',
          'rule' => '<scalar>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' ary ',
          'raw_rule' => ' ary',
          'rule' => '<ary>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' hsh ',
          'raw_rule' => ' hsh',
          'rule' => '<hsh>'
        }
      ],
      'sym' => 'my_var',
      'type' => 'nonterm'
    };
  */

  "my_var"         : [
		       "<scalar>",
		       "<ary>",
		       "<hsh>",
		     ],
  /*
    $refgen_topic1 = {
      'rules' => [
        {
          'code' => '',
          'comment' => '',
          'line' => ' my_var ',
          'raw_rule' => ' my_var',
          'rule' => '<my_var>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' amper ',
          'raw_rule' => ' amper',
          'rule' => '<amper>'
        }
      ],
      'sym' => 'refgen_topic',
      'type' => 'nonterm'
    };
  */

  "refgen_topic"   : [
		       "<my_var>",
		       "<amper>",
		     ],
  /*
    $formblock1 = {
      'rules' => [
        {
          'code' => '{ if (parser->copline > (line_t)$1) parser->copline = (line_t)$1 $$ = block_end($2, $5) } ',
          'comment' => '',
          'line' => ' \'=\' remember \';\' FORMRBRACK formstmtseq \';\' \'.\' { if (parser->copline > (line_t)$1) parser->copline = (line_t)$1 $$ = block_end($2, $5) } ',
          'raw_rule' => ' = remember ; FORMRBRACK formstmtseq ; . ',
          'rule' => '= <remember> ; <FORMRBRACK> <formstmtseq> ; .'
        }
      ],
      'sym' => 'formblock',
      'type' => 'nonterm'
    };
  */

  "formblock"      : [
		       "= <remember> ; <FORMRBRACK> <formstmtseq> ; .",
		     ],
  /*
    $subattrlist1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = $2; } ',
          'comment' => '',
          'line' => ' COLONATTR THING { $$ = $2; } ',
          'raw_rule' => ' COLONATTR THING ',
          'rule' => '<COLONATTR> <THING>'
        },
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '',
          'line' => ' COLONATTR { $$ = (OP*)NULL; } ',
          'raw_rule' => ' COLONATTR ',
          'rule' => '<COLONATTR>'
        }
      ],
      'sym' => 'subattrlist',
      'type' => 'nonterm'
    };
  */

  "subattrlist"    : [
		       "",
		       "<COLONATTR> <THING>",
		       "<COLONATTR>",
		     ],
  /*
    $myattrlist1 = {
      'rules' => [
        {
          'code' => '{ $$ = $2; } ',
          'comment' => '',
          'line' => ' COLONATTR THING { $$ = $2; } ',
          'raw_rule' => ' COLONATTR THING ',
          'rule' => '<COLONATTR> <THING>'
        },
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '',
          'line' => ' COLONATTR { $$ = (OP*)NULL; } ',
          'raw_rule' => ' COLONATTR ',
          'rule' => '<COLONATTR>'
        }
      ],
      'sym' => 'myattrlist',
      'type' => 'nonterm'
    };
  */

  "myattrlist"     : [
		       "<COLONATTR> <THING>",
		       "<COLONATTR>",
		     ],
  /*
    $myattrterm1 = {
      'rules' => [
        {
          'code' => '{ $$ = my_attrs($2,$3); } ',
          'comment' => '',
          'line' => ' MY myterm myattrlist { $$ = my_attrs($2,$3); } ',
          'raw_rule' => ' MY myterm myattrlist ',
          'rule' => '<MY> <myterm> <myattrlist>'
        },
        {
          'code' => '{ $$ = localize($2,$1); } ',
          'comment' => '',
          'line' => ' MY myterm { $$ = localize($2,$1); } ',
          'raw_rule' => ' MY myterm ',
          'rule' => '<MY> <myterm>'
        }
      ],
      'sym' => 'myattrterm',
      'type' => 'nonterm'
    };
  */

  "myattrterm"     : [
		       "<MY> <myterm> <myattrlist>?",
                       mk_js(function(args, snode)
                       {
                         var mem = args.genmem;
                         var lexpad = mem.lexpad;

                         mem.in_declare = true;
                         var items = args[1];
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

                           if (result.length == 1)
                           {
                             return result[0];
                           }
                           return result;
                         }
                       }),
		     ],
  /*
    $myterm1 = {
      'rules' => [
        {
          'code' => '{ $$ = sawparens($2); } ',
          'comment' => '',
          'line' => ' \'(\' expr \')\' { $$ = sawparens($2); } ',
          'raw_rule' => ' ( expr ) ',
          'rule' => '( <expr> )'
        },
        {
          'code' => '{ $$ = sawparens(newNULLLIST()); } ',
          'comment' => '',
          'line' => ' \'(\' \')\' { $$ = sawparens(newNULLLIST()); } ',
          'raw_rule' => ' ( ) ',
          'rule' => '( )'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' scalar %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' scalar %prec ( ',
          'rule' => '<scalar> {prec (}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' hsh %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' hsh %prec ( ',
          'rule' => '<hsh> {prec (}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' ary %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' ary %prec ( ',
          'rule' => '<ary> {prec (}'
        }
      ],
      'sym' => 'myterm',
      'type' => 'nonterm'
    };
  */

  "myterm"         : [
		       "( <expr> )",
		       "( )",
		       "<scalar> {prec (}",
		       "<hsh> {prec (}",
		       "<ary> {prec (}",
		     ],
  /*
    $subsignature1 = {
      'rules' => [
        {
          'code' => '{ / assert(FEATURE_SIGNATURES_IS_ENABLED) Perl_ck_warner_d(aTHX_ packWARN(WARN_EXPERIMENTAL__SIGNATURES), "The signatures feature is experimental") $<opval>$ = parse_subsignature() } { $$ = op_append_list(OP_LINESEQ, $<opval>2, newSTATEOP(0, NULL, sawparens(newNULLLIST()))) parser->expect = XATTRBLOCK } ',
          'comment' => '/* We shouldn\'t get here otherwise \*\/',
          'line' => ' \'(\' { /* We shouldn\'t get here otherwise \*\/ assert(FEATURE_SIGNATURES_IS_ENABLED) Perl_ck_warner_d(aTHX_ packWARN(WARN_EXPERIMENTAL__SIGNATURES), "The signatures feature is experimental") $<opval>$ = parse_subsignature() } \')\' { $$ = op_append_list(OP_LINESEQ, $<opval>2, newSTATEOP(0, NULL, sawparens(newNULLLIST()))) parser->expect = XATTRBLOCK } ',
          'raw_rule' => ' (  ) ',
          'rule' => '( )'
        }
      ],
      'sym' => 'subsignature',
      'type' => 'nonterm'
    };
  */

  "subsignature"   : [
		       "( )",
		     ],
  /*
    $termbinop1 = {
      'rules' => [
        {
          'code' => '{ $$ = newASSIGNOP(OPf_STACKED, $1, $2, $3); } ',
          'comment' => '/* $x = $y \*\/',
          'line' => ' term ASSIGNOP term /* $x = $y \*\/ { $$ = newASSIGNOP(OPf_STACKED, $1, $2, $3); } ',
          'raw_rule' => ' term ASSIGNOP term  ',
          'rule' => '<term> <ASSIGNOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x ** $y \*\/',
          'line' => ' term POWOP term /* $x ** $y \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term POWOP term  ',
          'rule' => '<term> <POWOP> <term>'
        },
        {
          'code' => '{ if ($2 != OP_REPEAT) scalar($1) $$ = newBINOP($2, 0, $1, scalar($3)) } ',
          'comment' => '/* $x * $y, $x x $y \*\/',
          'line' => ' term MULOP term /* $x * $y, $x x $y \*\/ { if ($2 != OP_REPEAT) scalar($1) $$ = newBINOP($2, 0, $1, scalar($3)) } ',
          'raw_rule' => ' term MULOP term  ',
          'rule' => '<term> <MULOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x + $y \*\/',
          'line' => ' term ADDOP term /* $x + $y \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term ADDOP term  ',
          'rule' => '<term> <ADDOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x >> $y, $x << $y \*\/',
          'line' => ' term SHIFTOP term /* $x >> $y, $x << $y \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term SHIFTOP term  ',
          'rule' => '<term> <SHIFTOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x > $y, etc. \*\/',
          'line' => ' term RELOP term /* $x > $y, etc. \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term RELOP term  ',
          'rule' => '<term> <RELOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x == $y, $x eq $y \*\/',
          'line' => ' term EQOP term /* $x == $y, $x eq $y \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term EQOP term  ',
          'rule' => '<term> <EQOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x & $y \*\/',
          'line' => ' term BITANDOP term /* $x & $y \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term BITANDOP term  ',
          'rule' => '<term> <BITANDOP> <term>'
        },
        {
          'code' => '{ $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'comment' => '/* $x | $y \*\/',
          'line' => ' term BITOROP term /* $x | $y \*\/ { $$ = newBINOP($2, 0, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term BITOROP term  ',
          'rule' => '<term> <BITOROP> <term>'
        },
        {
          'code' => '{ $$ = newRANGE($2, scalar($1), scalar($3)); } ',
          'comment' => '/* $x..$y, $x...$y \*\/',
          'line' => ' term DOTDOT term /* $x..$y, $x...$y \*\/ { $$ = newRANGE($2, scalar($1), scalar($3)); } ',
          'raw_rule' => ' term DOTDOT term  ',
          'rule' => '<term> <DOTDOT> <term>'
        },
        {
          'code' => '{ $$ = newLOGOP(OP_AND, 0, $1, $3); } ',
          'comment' => '/* $x && $y \*\/',
          'line' => ' term ANDAND term /* $x && $y \*\/ { $$ = newLOGOP(OP_AND, 0, $1, $3); } ',
          'raw_rule' => ' term ANDAND term  ',
          'rule' => '<term> <ANDAND> <term>'
        },
        {
          'code' => '{ $$ = newLOGOP(OP_OR, 0, $1, $3); } ',
          'comment' => '/* $x || $y \*\/',
          'line' => ' term OROR term /* $x || $y \*\/ { $$ = newLOGOP(OP_OR, 0, $1, $3); } ',
          'raw_rule' => ' term OROR term  ',
          'rule' => '<term> <OROR> <term>'
        },
        {
          'code' => '{ $$ = newLOGOP(OP_DOR, 0, $1, $3); } ',
          'comment' => '/* $x // $y \*\/',
          'line' => ' term DORDOR term /* $x // $y \*\/ { $$ = newLOGOP(OP_DOR, 0, $1, $3); } ',
          'raw_rule' => ' term DORDOR term  ',
          'rule' => '<term> <DORDOR> <term>'
        },
        {
          'code' => '{ $$ = bind_match($2, $1, $3); } ',
          'comment' => '/* $x =~ /$y/ \*\//* Unary operators and terms \*\/',
          'line' => ' term MATCHOP term /* $x =~ /$y/ \*\/ { $$ = bind_match($2, $1, $3); } /* Unary operators and terms \*\/ ',
          'raw_rule' => ' term MATCHOP term   ',
          'rule' => '<term> <MATCHOP> <term>'
        }
      ],
      'sym' => 'termbinop',
      'type' => 'nonterm'
    };
  */

  "termbinop"      : [
                       mk_js(function(args)
                       {
                         console.log(args[0]);
                         console.log(args[1]);
                         console.log(args[2]);
                         return { op: args[1], rhs: args[2] };
                       }),
                       "<term> <MATCHOP> <term>",
		       "<term> <ASSIGNOP> <term>",
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
  /*
    $termunop1 = {
      'rules' => [
        {
          'code' => '{ $$ = newUNOP(OP_NEGATE, 0, scalar($2)); } ',
          'comment' => '/* -$x \*\/',
          'line' => ' \'-\' term %prec UMINUS /* -$x \*\/ { $$ = newUNOP(OP_NEGATE, 0, scalar($2)); } ',
          'raw_rule' => ' - term %prec UMINUS  ',
          'rule' => '- <term> {prec UMINUS}'
        },
        {
          'code' => '{ $$ = $2; } ',
          'comment' => '/* +$x \*\/',
          'line' => ' \'+\' term %prec UMINUS /* +$x \*\/ { $$ = $2; } ',
          'raw_rule' => ' + term %prec UMINUS  ',
          'rule' => '+ <term> {prec UMINUS}'
        },
        {
          'code' => '{ $$ = newUNOP(OP_NOT, 0, scalar($2)); } ',
          'comment' => '/* !$x \*\/',
          'line' => ' \'!\' term /* !$x \*\/ { $$ = newUNOP(OP_NOT, 0, scalar($2)); } ',
          'raw_rule' => ' ! term  ',
          'rule' => '! <term>'
        },
        {
          'code' => '{ $$ = newUNOP($1, 0, scalar($2)); } ',
          'comment' => '/* ~$x \*\/',
          'line' => ' \'~\' term /* ~$x \*\/ { $$ = newUNOP($1, 0, scalar($2)); } ',
          'raw_rule' => ' ~ term  ',
          'rule' => '~ <term>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_POSTINC, 0, op_lvalue(scalar($1), OP_POSTINC)); } ',
          'comment' => '/* $x++ \*\/',
          'line' => ' term POSTINC /* $x++ \*\/ { $$ = newUNOP(OP_POSTINC, 0, op_lvalue(scalar($1), OP_POSTINC)); } ',
          'raw_rule' => ' term POSTINC  ',
          'rule' => '<term> <POSTINC>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_POSTDEC, 0, op_lvalue(scalar($1), OP_POSTDEC));} ',
          'comment' => '/* $x-- \*\/',
          'line' => ' term POSTDEC /* $x-- \*\/ { $$ = newUNOP(OP_POSTDEC, 0, op_lvalue(scalar($1), OP_POSTDEC));} ',
          'raw_rule' => ' term POSTDEC  ',
          'rule' => '<term> <POSTDEC>'
        },
        {
          'code' => '{ $$ = op_convert_list(OP_JOIN, 0, op_append_elem( OP_LIST, newSVREF(scalar( newSVOP(OP_CONST,0, newSVpvs("\\"")) )), $1 )) } ',
          'comment' => '/* implicit join after interpolated ->@ \*\/',
          'line' => ' term POSTJOIN /* implicit join after interpolated ->@ \*\/ { $$ = op_convert_list(OP_JOIN, 0, op_append_elem( OP_LIST, newSVREF(scalar( newSVOP(OP_CONST,0, newSVpvs("\\"")) )), $1 )) } ',
          'raw_rule' => ' term POSTJOIN  ',
          'rule' => '<term> <POSTJOIN>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_PREINC, 0, op_lvalue(scalar($2), OP_PREINC)); } ',
          'comment' => '/* ++$x \*\/',
          'line' => ' PREINC term /* ++$x \*\/ { $$ = newUNOP(OP_PREINC, 0, op_lvalue(scalar($2), OP_PREINC)); } ',
          'raw_rule' => ' PREINC term  ',
          'rule' => '<PREINC> <term>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_PREDEC, 0, op_lvalue(scalar($2), OP_PREDEC)); } ',
          'comment' => '/* --$x \*\//* Constructors for anonymous data \*\/',
          'line' => ' PREDEC term /* --$x \*\/ { $$ = newUNOP(OP_PREDEC, 0, op_lvalue(scalar($2), OP_PREDEC)); } /* Constructors for anonymous data \*\/ ',
          'raw_rule' => ' PREDEC term   ',
          'rule' => '<PREDEC> <term>'
        }
      ],
      'sym' => 'termunop',
      'type' => 'nonterm'
    };
  */

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
  /*
    $anonymous1 = {
      'rules' => [
        {
          'code' => '{ $$ = newANONLIST($2); } ',
          'comment' => '',
          'line' => ' \'[\' expr \']\' { $$ = newANONLIST($2); } ',
          'raw_rule' => ' [ expr ] ',
          'rule' => '[ <expr> ]'
        },
        {
          'code' => '{ $$ = newANONLIST((OP*)NULL);} ',
          'comment' => '',
          'line' => ' \'[\' \']\' { $$ = newANONLIST((OP*)NULL);} ',
          'raw_rule' => ' [ ] ',
          'rule' => '[ ]'
        },
        {
          'code' => '{ $$ = newANONHASH($2); } ',
          'comment' => '/* { foo => "Bar" } \*\/',
          'line' => ' HASHBRACK expr \';\' \'}\' %prec \'(\' /* { foo => "Bar" } \*\/ { $$ = newANONHASH($2); } ',
          'raw_rule' => ' HASHBRACK expr ; } %prec (  ',
          'rule' => '<HASHBRACK> <expr> ; } {prec (}'
        },
        {
          'code' => '{ $$ = newANONHASH((OP*)NULL); } ',
          'comment' => '/* { } (\';\' by tokener) \*\/',
          'line' => ' HASHBRACK \';\' \'}\' %prec \'(\' /* { } (\';\' by tokener) \*\/ { $$ = newANONHASH((OP*)NULL); } ',
          'raw_rule' => ' HASHBRACK ; } %prec (  ',
          'rule' => '<HASHBRACK> ; } {prec (}'
        },
        {
          'code' => '{ SvREFCNT_inc_simple_void(PL_compcv) $$ = newANONATTRSUB($2, $3, $4, $5); } ',
          'comment' => '',
          'line' => ' ANONSUB startanonsub proto subattrlist block %prec \'(\' { SvREFCNT_inc_simple_void(PL_compcv) $$ = newANONATTRSUB($2, $3, $4, $5); } ',
          'raw_rule' => ' ANONSUB startanonsub proto subattrlist block %prec ( ',
          'rule' => '<ANONSUB> <startanonsub> <proto> <subattrlist> <block> {prec (}'
        },
        {
          'code' => '{ OP *body if (parser->copline > (line_t)$6) parser->copline = (line_t)$6 body = block_end($3, op_append_list(OP_LINESEQ, $4, $7)) SvREFCNT_inc_simple_void(PL_compcv) $$ = newANONATTRSUB($2, NULL, $5, body) } ',
          'comment' => '/* Things called with "do" \*\/',
          'line' => ' ANONSUB startanonsub remember subsignature subattrlist \'{\' stmtseq \'}\' %prec \'(\' { OP *body if (parser->copline > (line_t)$6) parser->copline = (line_t)$6 body = block_end($3, op_append_list(OP_LINESEQ, $4, $7)) SvREFCNT_inc_simple_void(PL_compcv) $$ = newANONATTRSUB($2, NULL, $5, body) } /* Things called with "do" \*\/ ',
          'raw_rule' => ' ANONSUB startanonsub remember subsignature subattrlist { stmtseq } %prec (  ',
          'rule' => '<ANONSUB> <startanonsub> <remember> <subsignature> <subattrlist> { <stmtseq> } {prec (}'
        }
      ],
      'sym' => 'anonymous',
      'type' => 'nonterm'
    };
  */

  "anonymous"      : [
		       "[ <expr> ]",
		       "[ ]",
		       "{ <expr> } {prec (}",
		       "{ } {prec (}",
		       "<ANONSUB> <startanonsub> <subattrlist> <block> {prec (}",
		       "<ANONSUB> <startanonsub> <remember> <subsignature> <subattrlist> { <stmtseq> } {prec (}",
		     ],
  /*
    $termdo1 = {
      'rules' => [
        {
          'code' => '{ $$ = dofile($2, $1);} ',
          'comment' => '/* do $filename \*\/',
          'line' => ' DO term %prec UNIOP /* do $filename \*\/ { $$ = dofile($2, $1);} ',
          'raw_rule' => ' DO term %prec UNIOP  ',
          'rule' => '<DO> <term> {prec UNIOP}'
        },
        {
          'code' => '{ $$ = newUNOP(OP_NULL, OPf_SPECIAL, op_scope($2));} ',
          'comment' => '/* do { code \*\/',
          'line' => ' DO block %prec \'(\' /* do { code \*\/ { $$ = newUNOP(OP_NULL, OPf_SPECIAL, op_scope($2));} term : termbinop ',
          'raw_rule' => ' DO block %prec (   term : termbinop',
          'rule' => '<DO> <block> {prec (} <term> : <termbinop>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' termunop ',
          'raw_rule' => ' termunop',
          'rule' => '<termunop>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' anonymous ',
          'raw_rule' => ' anonymous',
          'rule' => '<anonymous>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' termdo ',
          'raw_rule' => ' termdo',
          'rule' => '<termdo>'
        },
        {
          'code' => '{ $$ = newCONDOP(0, $1, $3, $5); } ',
          'comment' => '',
          'line' => ' term \'?\' term \':\' term { $$ = newCONDOP(0, $1, $3, $5); } ',
          'raw_rule' => ' term ? term : term ',
          'rule' => '<term> ? <term> : <term>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_REFGEN, 0, $2); } ',
          'comment' => '/* \\$x, \\@y, \\%z \*\/',
          'line' => ' REFGEN term /* \\$x, \\@y, \\%z \*\/ { $$ = newUNOP(OP_REFGEN, 0, $2); } ',
          'raw_rule' => ' REFGEN term  ',
          'rule' => '<REFGEN> <term>'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' myattrterm %prec UNIOP { $$ = $1; } ',
          'raw_rule' => ' myattrterm %prec UNIOP ',
          'rule' => '<myattrterm> {prec UNIOP}'
        },
        {
          'code' => '{ $$ = localize($2,$1); } ',
          'comment' => '',
          'line' => ' LOCAL term %prec UNIOP { $$ = localize($2,$1); } ',
          'raw_rule' => ' LOCAL term %prec UNIOP ',
          'rule' => '<LOCAL> <term> {prec UNIOP}'
        },
        {
          'code' => '{ $$ = sawparens($2); } ',
          'comment' => '',
          'line' => ' \'(\' expr \')\' { $$ = sawparens($2); } ',
          'raw_rule' => ' ( expr ) ',
          'rule' => '( <expr> )'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' QWLIST { $$ = $1; } ',
          'raw_rule' => ' QWLIST ',
          'rule' => '<QWLIST>'
        },
        {
          'code' => '{ $$ = sawparens(newNULLLIST()); } ',
          'comment' => '',
          'line' => ' \'(\' \')\' { $$ = sawparens(newNULLLIST()); } ',
          'raw_rule' => ' ( ) ',
          'rule' => '( )'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' scalar %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' scalar %prec ( ',
          'rule' => '<scalar> {prec (}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' star %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' star %prec ( ',
          'rule' => '<star> {prec (}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' hsh %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' hsh %prec ( ',
          'rule' => '<hsh> {prec (}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' ary %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' ary %prec ( ',
          'rule' => '<ary> {prec (}'
        },
        {
          'code' => '{ $$ = newUNOP(OP_AV2ARYLEN, 0, ref($1, OP_AV2ARYLEN));} ',
          'comment' => '/* $#x, $#{ something } \*\/',
          'line' => ' arylen %prec \'(\' /* $#x, $#{ something } \*\/ { $$ = newUNOP(OP_AV2ARYLEN, 0, ref($1, OP_AV2ARYLEN));} ',
          'raw_rule' => ' arylen %prec (  ',
          'rule' => '<arylen> {prec (}'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' subscripted { $$ = $1; } ',
          'raw_rule' => ' subscripted ',
          'rule' => '<subscripted>'
        },
        {
          'code' => '{ $$ = op_prepend_elem(OP_ASLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_ASLICE, 0, list($3), ref($1, OP_ASLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'comment' => '/* array slice \*\/',
          'line' => ' sliceme \'[\' expr \']\' /* array slice \*\/ { $$ = op_prepend_elem(OP_ASLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_ASLICE, 0, list($3), ref($1, OP_ASLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'raw_rule' => ' sliceme [ expr ]  ',
          'rule' => '<sliceme> [ <expr> ]'
        },
        {
          'code' => '{ $$ = op_prepend_elem(OP_KVASLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_KVASLICE, 0, list($3), ref(oopsAV($1), OP_KVASLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'comment' => '/* array key/value slice \*\/',
          'line' => ' kvslice \'[\' expr \']\' /* array key/value slice \*\/ { $$ = op_prepend_elem(OP_KVASLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_KVASLICE, 0, list($3), ref(oopsAV($1), OP_KVASLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'raw_rule' => ' kvslice [ expr ]  ',
          'rule' => '<kvslice> [ <expr> ]'
        },
        {
          'code' => '{ $$ = op_prepend_elem(OP_HSLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_HSLICE, 0, list($3), ref(oopsHV($1), OP_HSLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'comment' => '/* @hash{@keys} \*\/',
          'line' => ' sliceme \'{\' expr \';\' \'}\' /* @hash{@keys} \*\/ { $$ = op_prepend_elem(OP_HSLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_HSLICE, 0, list($3), ref(oopsHV($1), OP_HSLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'raw_rule' => ' sliceme { expr ; }  ',
          'rule' => '<sliceme> { <expr> ; }'
        },
        {
          'code' => '{ $$ = op_prepend_elem(OP_KVHSLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_KVHSLICE, 0, list($3), ref($1, OP_KVHSLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'comment' => '/* %hash{@keys} \*\/',
          'line' => ' kvslice \'{\' expr \';\' \'}\' /* %hash{@keys} \*\/ { $$ = op_prepend_elem(OP_KVHSLICE, newOP(OP_PUSHMARK, 0), newLISTOP(OP_KVHSLICE, 0, list($3), ref($1, OP_KVHSLICE))) if ($$ && $1) $$->op_private |= $1->op_private & OPpSLICEWARNING } ',
          'raw_rule' => ' kvslice { expr ; }  ',
          'rule' => '<kvslice> { <expr> ; }'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' THING %prec \'(\' { $$ = $1; } ',
          'raw_rule' => ' THING %prec ( ',
          'rule' => '<THING> {prec (}'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, 0, scalar($1)); } ',
          'comment' => '/* &foo; \*\/',
          'line' => ' amper /* &foo; \*\/ { $$ = newUNOP(OP_ENTERSUB, 0, scalar($1)); } ',
          'raw_rule' => ' amper  ',
          'rule' => '<amper>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, scalar($1)) } ',
          'comment' => '/* &foo() or foo() \*\/',
          'line' => ' amper \'(\' \')\' /* &foo() or foo() \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, scalar($1)) } ',
          'raw_rule' => ' amper ( )  ',
          'rule' => '<amper> ( )'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $3, scalar($1))) } ',
          'comment' => '/* &foo(@args) or foo(@args) \*\/',
          'line' => ' amper \'(\' expr \')\' /* &foo(@args) or foo(@args) \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $3, scalar($1))) } ',
          'raw_rule' => ' amper ( expr )  ',
          'rule' => '<amper> ( <expr> )'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $3, scalar($2))) } ',
          'comment' => '/* foo @args (no parens) \*\/',
          'line' => ' NOAMP subname optlistexpr /* foo @args (no parens) \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $3, scalar($2))) } ',
          'raw_rule' => ' NOAMP subname optlistexpr  ',
          'rule' => '<NOAMP> <subname> <optlistexpr>'
        },
        {
          'code' => '{ $$ = newSVREF($1); } ',
          'comment' => '',
          'line' => ' term ARROW \'$\' \'*\' { $$ = newSVREF($1); } ',
          'raw_rule' => ' term ARROW $ * ',
          'rule' => '<term> <ARROW> $ *'
        },
        {
          'code' => '{ $$ = newAVREF($1); } ',
          'comment' => '',
          'line' => ' term ARROW \'@\' \'*\' { $$ = newAVREF($1); } ',
          'raw_rule' => ' term ARROW @ * ',
          'rule' => '<term> <ARROW> @ *'
        },
        {
          'code' => '{ $$ = newHVREF($1); } ',
          'comment' => '',
          'line' => ' term ARROW \'%\' \'*\' { $$ = newHVREF($1); } ',
          'raw_rule' => ' term ARROW % * ',
          'rule' => '<term> <ARROW> % *'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, 0, scalar(newCVREF($3,$1))); } ',
          'comment' => '',
          'line' => ' term ARROW \'&\' \'*\' { $$ = newUNOP(OP_ENTERSUB, 0, scalar(newCVREF($3,$1))); } ',
          'raw_rule' => ' term ARROW & * ',
          'rule' => '<term> <ARROW> & *'
        },
        {
          'code' => '{ $$ = newGVREF(0,$1); } ',
          'comment' => '',
          'line' => ' term ARROW \'*\' \'*\' %prec \'(\' { $$ = newGVREF(0,$1); } ',
          'raw_rule' => ' term ARROW * * %prec ( ',
          'rule' => '<term> <ARROW> * * {prec (}'
        },
        {
          'code' => '{ $$ = newOP($1, OPf_SPECIAL) PL_hints |= HINT_BLOCK_SCOPE; } ',
          'comment' => '/* loop exiting command (goto, last, dump, etc) \*\/',
          'line' => ' LOOPEX /* loop exiting command (goto, last, dump, etc) \*\/ { $$ = newOP($1, OPf_SPECIAL) PL_hints |= HINT_BLOCK_SCOPE; } ',
          'raw_rule' => ' LOOPEX  ',
          'rule' => '<LOOPEX>'
        },
        {
          'code' => '{ $$ = newLOOPEX($1,$2); } ',
          'comment' => '',
          'line' => ' LOOPEX term { $$ = newLOOPEX($1,$2); } ',
          'raw_rule' => ' LOOPEX term ',
          'rule' => '<LOOPEX> <term>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_NOT, 0, scalar($2)); } ',
          'comment' => '/* not $foo \*\/',
          'line' => ' NOTOP listexpr /* not $foo \*\/ { $$ = newUNOP(OP_NOT, 0, scalar($2)); } ',
          'raw_rule' => ' NOTOP listexpr  ',
          'rule' => '<NOTOP> <listexpr>'
        },
        {
          'code' => '{ $$ = newOP($1, 0); } ',
          'comment' => '/* Unary op, $_ implied \*\/',
          'line' => ' UNIOP /* Unary op, $_ implied \*\/ { $$ = newOP($1, 0); } ',
          'raw_rule' => ' UNIOP  ',
          'rule' => '<UNIOP>'
        },
        {
          'code' => '{ $$ = newUNOP($1, 0, $2); } ',
          'comment' => '/* eval { foo }* \*\/',
          'line' => ' UNIOP block /* eval { foo }* \*\/ { $$ = newUNOP($1, 0, $2); } ',
          'raw_rule' => ' UNIOP block  ',
          'rule' => '<UNIOP> <block>'
        },
        {
          'code' => '{ $$ = newUNOP($1, 0, $2); } ',
          'comment' => '/* Unary op \*\/',
          'line' => ' UNIOP term /* Unary op \*\/ { $$ = newUNOP($1, 0, $2); } ',
          'raw_rule' => ' UNIOP term  ',
          'rule' => '<UNIOP> <term>'
        },
        {
          'code' => '{ $$ = newOP(OP_REQUIRE, $1 ? OPf_SPECIAL : 0); } ',
          'comment' => '/* require, $_ implied \*\/',
          'line' => ' REQUIRE /* require, $_ implied \*\/ { $$ = newOP(OP_REQUIRE, $1 ? OPf_SPECIAL : 0); } ',
          'raw_rule' => ' REQUIRE  ',
          'rule' => '<REQUIRE>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_REQUIRE, $1 ? OPf_SPECIAL : 0, $2); } ',
          'comment' => '/* require Foo \*\/',
          'line' => ' REQUIRE term /* require Foo \*\/ { $$ = newUNOP(OP_REQUIRE, $1 ? OPf_SPECIAL : 0, $2); } ',
          'raw_rule' => ' REQUIRE term  ',
          'rule' => '<REQUIRE> <term>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, scalar($1)); } ',
          'comment' => '',
          'line' => ' UNIOPSUB { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, scalar($1)); } ',
          'raw_rule' => ' UNIOPSUB ',
          'rule' => '<UNIOPSUB>'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $2, scalar($1))); } ',
          'comment' => '/* Sub treated as unop \*\/',
          'line' => ' UNIOPSUB term /* Sub treated as unop \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, op_append_elem(OP_LIST, $2, scalar($1))); } ',
          'raw_rule' => ' UNIOPSUB term  ',
          'rule' => '<UNIOPSUB> <term>'
        },
        {
          'code' => '{ $$ = newOP($1, 0); } ',
          'comment' => '/* Nullary operator \*\/',
          'line' => ' FUNC0 /* Nullary operator \*\/ { $$ = newOP($1, 0); } ',
          'raw_rule' => ' FUNC0  ',
          'rule' => '<FUNC0>'
        },
        {
          'code' => '{ $$ = newOP($1, 0);} ',
          'comment' => '',
          'line' => ' FUNC0 \'(\' \')\' { $$ = newOP($1, 0);} ',
          'raw_rule' => ' FUNC0 ( ) ',
          'rule' => '<FUNC0> ( )'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '/* Same as above, but op created in toke.c \*\/',
          'line' => ' FUNC0OP /* Same as above, but op created in toke.c \*\/ { $$ = $1; } ',
          'raw_rule' => ' FUNC0OP  ',
          'rule' => '<FUNC0OP>'
        },
        {
          'code' => '{ $$ = $1; } ',
          'comment' => '',
          'line' => ' FUNC0OP \'(\' \')\' { $$ = $1; } ',
          'raw_rule' => ' FUNC0OP ( ) ',
          'rule' => '<FUNC0OP> ( )'
        },
        {
          'code' => '{ $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, scalar($1)); } ',
          'comment' => '/* Sub treated as nullop \*\/',
          'line' => ' FUNC0SUB /* Sub treated as nullop \*\/ { $$ = newUNOP(OP_ENTERSUB, OPf_STACKED, scalar($1)); } ',
          'raw_rule' => ' FUNC0SUB  ',
          'rule' => '<FUNC0SUB>'
        },
        {
          'code' => '{ $$ = ($1 == OP_NOT) ? newUNOP($1, 0, newSVOP(OP_CONST, 0, newSViv(0))) : newOP($1, OPf_SPECIAL); } ',
          'comment' => '/* not () \*\/',
          'line' => ' FUNC1 \'(\' \')\' /* not () \*\/ { $$ = ($1 == OP_NOT) ? newUNOP($1, 0, newSVOP(OP_CONST, 0, newSViv(0))) : newOP($1, OPf_SPECIAL); } ',
          'raw_rule' => ' FUNC1 ( )  ',
          'rule' => '<FUNC1> ( )'
        },
        {
          'code' => '{ $$ = newUNOP($1, 0, $3); } ',
          'comment' => '/* not($foo) \*\/',
          'line' => ' FUNC1 \'(\' expr \')\' /* not($foo) \*\/ { $$ = newUNOP($1, 0, $3); } ',
          'raw_rule' => ' FUNC1 ( expr )  ',
          'rule' => '<FUNC1> ( <expr> )'
        },
        {
          'code' => '{ if ( $1->op_type != OP_TRANS && $1->op_type != OP_TRANSR && (((PMOP*)$1)->op_pmflags & PMf_HAS_CV)) { $<ival>$ = start_subparse(FALSE, CVf_ANON) SAVEFREESV(PL_compcv) } else $<ival>$ = 0 } { $$ = pmruntime($1, $4, $5, 1, $<ival>2); } ',
          'comment' => '/* m//, s///, qr//, tr/// \*\/',
          'line' => ' PMFUNC /* m//, s///, qr//, tr/// \*\/ { if ( $1->op_type != OP_TRANS && $1->op_type != OP_TRANSR && (((PMOP*)$1)->op_pmflags & PMf_HAS_CV)) { $<ival>$ = start_subparse(FALSE, CVf_ANON) SAVEFREESV(PL_compcv) } else $<ival>$ = 0 } \'(\' listexpr optrepl \')\' { $$ = pmruntime($1, $4, $5, 1, $<ival>2); } ',
          'raw_rule' => ' PMFUNC   ( listexpr optrepl ) ',
          'rule' => '<PMFUNC> ( <listexpr> <optrepl> )'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' WORD ',
          'raw_rule' => ' WORD',
          'rule' => '<WORD>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' listop ',
          'raw_rule' => ' listop',
          'rule' => '<listop>'
        },
        {
          'code' => '{ $$ = newLISTOP(OP_DIE, 0, newOP(OP_PUSHMARK, 0), newSVOP(OP_CONST, 0, newSVpvs("Unimplemented"))) } ',
          'comment' => '',
          'line' => ' YADAYADA { $$ = newLISTOP(OP_DIE, 0, newOP(OP_PUSHMARK, 0), newSVOP(OP_CONST, 0, newSVpvs("Unimplemented"))) } ',
          'raw_rule' => ' YADAYADA ',
          'rule' => '<YADAYADA>'
        },
        {
          'code' => '',
          'comment' => '',
          'line' => ' PLUGEXPR ',
          'raw_rule' => ' PLUGEXPR',
          'rule' => '<PLUGEXPR>'
        }
      ],
      'sym' => 'termdo',
      'type' => 'nonterm'
    };
  */

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
                           if (_.isObject(item))
                           {
                             result.push([ item.op, item.rhs].join(' '));
                           }
                           else if (_.isArray(item))
                           {
                             throw "cannot handle array result terms";
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
		       "<myattrterm> {prec UNIOP}",
		       "<LOCAL> <term> {prec UNIOP}",
		       "( <expr> )",
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
  /*
    $formstmtseq1 = {
      'rules' => [
        {
          'code' => '{ $$ = (OP*)NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = (OP*)NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = op_append_list(OP_LINESEQ, $1, $2) PL_pad_reset_pending = TRUE if ($1 && $2) PL_hints |= HINT_BLOCK_SCOPE } ',
          'comment' => '',
          'line' => ' formstmtseq formline { $$ = op_append_list(OP_LINESEQ, $1, $2) PL_pad_reset_pending = TRUE if ($1 && $2) PL_hints |= HINT_BLOCK_SCOPE } ',
          'raw_rule' => ' formstmtseq formline ',
          'rule' => '<formstmtseq> <formline>'
        }
      ],
      'sym' => 'formstmtseq',
      'type' => 'nonterm'
    };
  */

  "formstmtseq"    : [
		       "",
		       "<formstmtseq> <formline>",
		     ],
  /*
    $formline1 = {
      'rules' => [
        {
          'code' => '{ OP *list if ($2) { OP *term = $2 list = op_append_elem(OP_LIST, $1, term) } else { list = $1 } if (parser->copline == NOLINE) parser->copline = CopLINE(PL_curcop)-1 else parser->copline-- $$ = newSTATEOP(0, NULL, op_convert_list(OP_FORMLINE, 0, list)) } ',
          'comment' => '',
          'line' => ' THING formarg { OP *list if ($2) { OP *term = $2 list = op_append_elem(OP_LIST, $1, term) } else { list = $1 } if (parser->copline == NOLINE) parser->copline = CopLINE(PL_curcop)-1 else parser->copline-- $$ = newSTATEOP(0, NULL, op_convert_list(OP_FORMLINE, 0, list)) } ',
          'raw_rule' => ' THING formarg ',
          'rule' => '<THING> <formarg>'
        }
      ],
      'sym' => 'formline',
      'type' => 'nonterm'
    };
  */

  "formline"       : [
		       "<THING> <formarg>",
		     ],
  /*
    $formarg1 = {
      'rules' => [
        {
          'code' => '{ $$ = NULL; } ',
          'comment' => '/* NULL \*\/',
          'line' => ' /* NULL \*\/ { $$ = NULL; } ',
          'raw_rule' => '  ',
          'rule' => ''
        },
        {
          'code' => '{ $$ = op_unscope($2); } ',
          'comment' => '',
          'line' => ' FORMLBRACK stmtseq FORMRBRACK { $$ = op_unscope($2); } ',
          'raw_rule' => ' FORMLBRACK stmtseq FORMRBRACK ',
          'rule' => '<FORMLBRACK> <stmtseq> <FORMRBRACK>'
        }
      ],
      'sym' => 'formarg',
      'type' => 'nonterm'
    };
  */

  "formarg"        : [
		       "",
		       "<FORMLBRACK> <stmtseq> <FORMRBRACK>",
		     ],
};

module.exports = grammar
