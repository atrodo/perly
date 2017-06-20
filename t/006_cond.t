#!./perly.js
if (1)
{
  say 'ok 1 - conditionals works';
}
else
{
  say 'nok 1 - conditionals works';
}

if (0)
{
  say 'nok 2 - negative conditionals works';
}
else
{
  say 'ok 2 - negative conditionals works';
}

if (1)
{
  say 'ok 3 - conditionals works without else';
}

if (1 == 1)
{
  say 'ok 4 - == works';
}
else
{
  say 'nok 4 - == works';
}

if (1 == 0)
{
  say 'nok 5 - == can be false';
}
else
{
  say 'ok 5 - == can be false';
}

if (1 != 1)
{
  say 'nok 6 - != works';
}
else
{
  say 'ok 6 - != works';
}

if ('' == 0)
{
  say 'ok 7 - == will cast to a number';
}
else
{
  say 'nok 7 - == will cast to a number';
}

say '1..7';
