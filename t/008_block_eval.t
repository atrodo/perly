#!./perly.js
eval {
  say 'ok 1 - block eval runs';
};
eval {
  foo();
  say 'nok 2 - block eval errors out';
};
say 'ok 2 - block eval errors out and contiues';

my $i = 10;
$i = eval { 3; };
say "ok $i - block eval returns its value";

eval { $i = 4; };
say "ok $i - block eval can set outside variables";

$i = eval { 5; };
say "ok $i - block eval returns its value";

$i = eval { 6 };
say "ok $i - block eval end semicolons optional";

#$i = eval { return 7 };
#say "ok $i - block eval can call return safely";

say '1..6';
