begin;

alter table public.market_candidate_identity_observations
    drop constraint market_candidate_identity_observations_source_kind_check;

alter table public.market_candidate_identity_observations
    add constraint market_candidate_identity_observations_source_kind_check check (source_kind in (
        'robinhood_asset_registry','robinhood_contract_registry','onchain_registry',
        'bytecode','deployer','interface','chainlink_feed','operator_review','impostor_scan'
    ));

commit;
