#!./perly.js
my $s = 'ok 2 - global scope output happens';
{
  my $s = 'ok 1 - new scope output happens';
  say $s;
}
say $s;
say '1..2';
