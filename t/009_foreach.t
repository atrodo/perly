#!./perly.js
foreach my $i1 (1, 2, 3)
{
  say "ok $i1 - foreach works for list";
}

{
  my $i2;
  foreach $i2 (4, 5, 6)
  {
    say "ok $i2 - foreach without my works";
  }
}

#my @a = (7, 8, 9);
#foreach my $i3 (@a)
#{
#  say "ok $i3 - foreach works for array";
#}
#
foreach my $i4 ( 10..12 )
{
  say "ok $i4 - foreach works for range";
}

#say "ok $i5 - foreach works for postfix"
#  foreach my $i5 ( 13..15 );

my $l;
foreach ( 16..18 )
{
  my $s;
  say "ok $_ - foreach works with topic";
}

say '1..18';
