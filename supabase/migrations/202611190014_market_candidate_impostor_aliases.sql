begin;

alter table public.market_candidates
    add column impostor_aliases text[] not null default '{}',
    add constraint market_candidates_impostor_aliases_valid check (
        array_position(impostor_aliases, null) is null
        and cardinality(impostor_aliases) <= 20
    );

do $$
begin
    if to_regclass('public.market_candidate_identity_observations') is not null then
        alter table public.market_candidate_identity_observations
            drop constraint market_candidate_identity_observations_source_kind_check;

        alter table public.market_candidate_identity_observations
            add constraint market_candidate_identity_observations_source_kind_check check (source_kind in (
                'robinhood_asset_registry','robinhood_contract_registry','onchain_registry',
                'bytecode','deployer','interface','chainlink_feed','operator_review','impostor_scan'
            ));
    end if;
end
$$;

commit;
