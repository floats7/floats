begin;

alter table public.market_candidates
    add constraint market_candidates_announced_ticker_evidence check (
        ipo_stage is null or not ticker_announced or exchange is not null
    );

commit;
