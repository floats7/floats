begin;

create or replace function public.take_api_rate_limit(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_key_hash text,
    p_limit integer,
    p_window_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_now timestamptz := clock_timestamp();
    current_count integer;
    current_window timestamptz;
    reset_time timestamptz;
begin
    if p_key_hash !~ '^[a-f0-9]{64}$'
        or p_limit < 1 or p_limit > 10000
        or p_window_seconds < 1 or p_window_seconds > 86400 then
        raise exception 'invalid rate limit input';
    end if;

    insert into public.api_rate_limits (
        environment, chain_id, key_hash, request_count, window_started_at, updated_at
    ) values (
        p_environment, p_chain_id, p_key_hash, 1, v_now, v_now
    )
    on conflict (environment, chain_id, key_hash) do update
    set request_count = case
            when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
            else public.api_rate_limits.request_count + 1
        end,
        window_started_at = case
            when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
            else public.api_rate_limits.window_started_at
        end,
        updated_at = v_now
    returning request_count, window_started_at
    into current_count, current_window;

    reset_time := current_window + make_interval(secs => p_window_seconds);
    return jsonb_build_object(
        'allowed', current_count <= p_limit,
        'remaining', greatest(0, p_limit - current_count),
        'resetAt', floor(extract(epoch from reset_time) * 1000)::bigint
    );
end;
$$;

notify pgrst, 'reload schema';

commit;
