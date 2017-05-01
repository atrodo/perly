#!./perly.js
my $s = 'ok 1 - interpolation happens';
say "$s\nok 2 - static string exists";
say "ok 3 - multiple line construct
# Comment";
say "ok \x34 - Can do x style escapes";
say "ok \x{35} - Can do x{} style escapes";
say '1..3';
