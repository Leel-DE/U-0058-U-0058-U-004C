alter table scraping_rules
  add column if not exists brand_selector text,
  add column if not exists sku_selector text,
  add column if not exists breadcrumbs_selector text,
  add column if not exists product_card_selector text,
  add column if not exists card_title_selector text,
  add column if not exists card_price_selector text,
  add column if not exists card_old_price_selector text,
  add column if not exists card_image_selector text,
  add column if not exists card_link_selector text,
  add column if not exists card_availability_selector text,
  add column if not exists pagination_next_selector text,
  add column if not exists load_more_selector text;
