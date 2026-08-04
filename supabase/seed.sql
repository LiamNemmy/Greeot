insert into public.forum_posts (title, handle, votes, article_key)
select *
from (
  values
    ('Did the blackout economy dispatch miss any key fuel brokers?', '@nightbureau', 84, 'lagos-after-dark'),
    ('Mural wars: is preservation possible without gentrification?', '@wallwriter', 61, 'mural-wars-joburg'),
    ('Silicon Savannah layoffs: correction or collapse?', '@stacktraceafrica', 47, 'nairobi-silicon-savannah-villain-arc')
) as seed(title, handle, votes, article_key)
where not exists (select 1 from public.forum_posts);
