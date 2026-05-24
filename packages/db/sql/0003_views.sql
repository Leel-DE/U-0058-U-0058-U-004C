-- Aggregate views used by the dashboard. Plain views (not materialized) for MVP —
-- they're cheap because of the indexes we already have. Switch to materialized
-- + REFRESH on cron once volume grows past a few million snapshots.

create or replace view public.v_latest_snapshot as
select distinct on (s.competitor_product_id)
  s.id,
  s.competitor_product_id,
  s.org_id,
  s.price,
  s.old_price,
  s.currency,
  s.availability,
  s.status,
  s.scraped_at
from public.price_snapshots s
order by s.competitor_product_id, s.scraped_at desc;

create or replace view public.v_org_dashboard as
select
  o.id                                                         as org_id,
  (select count(*) from public.competitor_products cp
     where cp.org_id = o.id and cp.active)                     as monitored_products,
  (select count(*) from public.stores st
     where st.org_id = o.id and st.status = 'active')          as active_stores,
  (select count(*) from public.alert_rules ar
     where ar.org_id = o.id and ar.active)                     as active_alerts,
  (select count(*) from public.notifications n
     where n.org_id = o.id and n.read_at is null)              as unread_notifications,
  (select count(*) from public.price_snapshots ps
     where ps.org_id = o.id
       and ps.scraped_at >= now() - interval '24 hours')       as snapshots_24h,
  (select count(*) from public.price_snapshots ps
     where ps.org_id = o.id
       and ps.scraped_at >= now() - interval '7 days')         as snapshots_7d
from public.organizations o;

-- Top price movers — last 7 days delta per competitor product
create or replace view public.v_price_movers as
with recent as (
  select
    cp.id          as competitor_product_id,
    cp.org_id,
    cp.title,
    cp.store_id,
    first_value(ps.price) over w               as last_price,
    last_value(ps.price)  over w               as old_price,
    first_value(ps.currency) over w            as currency,
    first_value(ps.scraped_at) over w          as last_at,
    row_number() over w                        as rn
  from public.competitor_products cp
  join public.price_snapshots ps
    on ps.competitor_product_id = cp.id
   and ps.scraped_at >= now() - interval '7 days'
   and ps.status = 'ok'
   and ps.price is not null
  window w as (
    partition by cp.id
    order by ps.scraped_at desc
    rows between unbounded preceding and unbounded following
  )
)
select competitor_product_id, org_id, title, store_id, currency,
       last_price, old_price, last_at,
       case when old_price > 0
            then ((last_price - old_price) / old_price * 100)::numeric(10,2)
            else null end as pct_change
from recent
where rn = 1;
