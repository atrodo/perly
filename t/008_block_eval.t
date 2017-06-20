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

say '1..3';
