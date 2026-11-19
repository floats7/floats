
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "api_rate_limits": {
                  Row: {
                    "chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"key_hash": string,"request_count": number,"updated_at": string,"window_started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"key_hash": string,"request_count": number,"updated_at"?: string,"window_started_at": string
                  }
                  Update: {
                    "chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"key_hash"?: string,"request_count"?: number,"updated_at"?: string,"window_started_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"assets": {
                  Row: {
                    "active": boolean,"asset_uid": string,"chain_id": number,"decimals": number,"eligible_from": number,"environment": Database["public"]['Enums']["network_environment"],"exit_after": number,"feed_address": string | null,"registry_status": string,"registry_version": number,"source_block": number,"symbol": string,"target_weight_bps": number,"token_address": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"asset_uid": string,"chain_id": number,"decimals": number,"eligible_from"?: number,"environment": Database["public"]['Enums']["network_environment"],"exit_after"?: number,"feed_address"?: string | null,"registry_status"?: string,"registry_version": number,"source_block": number,"symbol": string,"target_weight_bps"?: number,"token_address": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"asset_uid"?: string,"chain_id"?: number,"decimals"?: number,"eligible_from"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"exit_after"?: number,"feed_address"?: string | null,"registry_status"?: string,"registry_version"?: number,"source_block"?: number,"symbol"?: string,"target_weight_bps"?: number,"token_address"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"chain_checkpoints": {
                  Row: {
                    "chain_id": number,"consumer": string,"environment": Database["public"]['Enums']["network_environment"],"last_finalized_block": number | null,"last_finalized_hash": string | null,"next_block": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chain_id": number,"consumer": string,"environment": Database["public"]['Enums']["network_environment"],"last_finalized_block"?: number | null,"last_finalized_hash"?: string | null,"next_block": number,"updated_at"?: string
                  }
                  Update: {
                    "chain_id"?: number,"consumer"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"last_finalized_block"?: number | null,"last_finalized_hash"?: string | null,"next_block"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"holding_snapshots": {
                  Row: {
                    "block_hash": string | null,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"normalized_price_usd_18": number | null,"observed_at": string | null,"oracle_health": string | null,"oracle_updated_at": number | null,"raw_balance": number,"token_address": string,"ui_multiplier_18": number,"value_usd_18": number | null,"vault_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash"?: string | null,"block_number": number,"canonical"?: boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"normalized_price_usd_18"?: number | null,"observed_at"?: string | null,"oracle_health"?: string | null,"oracle_updated_at"?: number | null,"raw_balance": number,"token_address": string,"ui_multiplier_18": number,"value_usd_18"?: number | null,"vault_address": string
                  }
                  Update: {
                    "block_hash"?: string | null,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"normalized_price_usd_18"?: number | null,"observed_at"?: string | null,"oracle_health"?: string | null,"oracle_updated_at"?: number | null,"raw_balance"?: number,"token_address"?: string,"ui_multiplier_18"?: number,"value_usd_18"?: number | null,"vault_address"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingestion_health": {
                  Row: {
                    "chain_id": number,"checked_at": string,"consumer": string,"environment": Database["public"]['Enums']["network_environment"],"lag_blocks": number | null,"last_error": string | null,"latest_seen_block": number | null,"status": Database["public"]['Enums']["ingestion_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "chain_id": number,"checked_at": string,"consumer": string,"environment": Database["public"]['Enums']["network_environment"],"lag_blocks"?: number | null,"last_error"?: string | null,"latest_seen_block"?: number | null,"status": Database["public"]['Enums']["ingestion_status"]
                  }
                  Update: {
                    "chain_id"?: number,"checked_at"?: string,"consumer"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"lag_blocks"?: number | null,"last_error"?: string | null,"latest_seen_block"?: number | null,"status"?: Database["public"]['Enums']["ingestion_status"]
                  }
                  Relationships: [
                    
                  ]
                },"keeper_jobs": {
                  Row: {
                    "attempt_count": number,"chain_id": number,"created_at": string,"environment": Database["public"]['Enums']["network_environment"],"idempotency_key": string,"job_name": string,"last_error": string | null,"next_attempt_at": string | null,"payload": NonNullable<Json>,"status": Database["public"]['Enums']["keeper_job_status"],"transaction_hash": string | null,"transaction_nonce": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count"?: number,"chain_id": number,"created_at"?: string,"environment": Database["public"]['Enums']["network_environment"],"idempotency_key": string,"job_name": string,"last_error"?: string | null,"next_attempt_at"?: string | null,"payload": NonNullable<Json>,"status": Database["public"]['Enums']["keeper_job_status"],"transaction_hash"?: string | null,"transaction_nonce"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "attempt_count"?: number,"chain_id"?: number,"created_at"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"idempotency_key"?: string,"job_name"?: string,"last_error"?: string | null,"next_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["keeper_job_status"],"transaction_hash"?: string | null,"transaction_nonce"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"market_candidate_alerts": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"acknowledgement_note": string | null,"alert_code": string,"candidate_id": string,"chain_id": number,"detected_at": string,"environment": Database["public"]['Enums']["network_environment"],"fingerprint": string,"id": number,"payload": NonNullable<Json>,"severity": string,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"acknowledgement_note"?: string | null,"alert_code": string,"candidate_id": string,"chain_id": number,"detected_at": string,"environment": Database["public"]['Enums']["network_environment"],"fingerprint": string,"id"?: never,"payload": NonNullable<Json>,"severity": string,"state"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"acknowledgement_note"?: string | null,"alert_code"?: string,"candidate_id"?: string,"chain_id"?: number,"detected_at"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"fingerprint"?: string,"id"?: never,"payload"?: NonNullable<Json>,"severity"?: string,"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_alerts_environment_chain_id_candidate_id_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_filing_observations": {
                  Row: {
                    "accession_number": string,"candidate_id": string,"chain_id": number,"cik": string,"environment": Database["public"]['Enums']["network_environment"],"filing_date": string,"form_type": string,"primary_document": string,"recorded_at": string,"registrant_name": string,"reviewed_at": string | null,"reviewed_by": string | null,"source_url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accession_number": string,"candidate_id": string,"chain_id": number,"cik": string,"environment": Database["public"]['Enums']["network_environment"],"filing_date": string,"form_type": string,"primary_document": string,"recorded_at"?: string,"registrant_name": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_url": string
                  }
                  Update: {
                    "accession_number"?: string,"candidate_id"?: string,"chain_id"?: number,"cik"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"filing_date"?: string,"form_type"?: string,"primary_document"?: string,"recorded_at"?: string,"registrant_name"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_filing_obser_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_identity_approvals": {
                  Row: {
                    "approval_transaction_hash": string,"approved_at": string,"approved_by": string,"candidate_id": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"multisig_address": string,"recorded_at": string,"token_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_transaction_hash": string,"approved_at": string,"approved_by": string,"candidate_id": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"multisig_address": string,"recorded_at"?: string,"token_address": string
                  }
                  Update: {
                    "approval_transaction_hash"?: string,"approved_at"?: string,"approved_by"?: string,"candidate_id"?: string,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"multisig_address"?: string,"recorded_at"?: string,"token_address"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_identity_app_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_identity_observations": {
                  Row: {
                    "candidate_id": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"evidence": NonNullable<Json>,"evidence_hash": string,"observed_at": string,"passed": boolean,"recorded_at": string,"source_kind": string,"source_url": string | null,"token_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"evidence"?: NonNullable<Json>,"evidence_hash": string,"observed_at": string,"passed": boolean,"recorded_at"?: string,"source_kind": string,"source_url"?: string | null,"token_address": string
                  }
                  Update: {
                    "candidate_id"?: string,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"evidence"?: NonNullable<Json>,"evidence_hash"?: string,"observed_at"?: string,"passed"?: boolean,"recorded_at"?: string,"source_kind"?: string,"source_url"?: string | null,"token_address"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_identity_obs_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_ipo_stage_events": {
                  Row: {
                    "candidate_id": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_id": number,"evidence_observed_at": string,"next_stage": Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"next_ticker_announced": boolean,"previous_stage": Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"previous_ticker_announced": boolean,"recorded_at": string,"source_url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_id"?: never,"evidence_observed_at": string,"next_stage"?: Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"next_ticker_announced": boolean,"previous_stage"?: Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"previous_ticker_announced": boolean,"recorded_at"?: string,"source_url": string
                  }
                  Update: {
                    "candidate_id"?: string,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"event_id"?: never,"evidence_observed_at"?: string,"next_stage"?: Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"next_ticker_announced"?: boolean,"previous_stage"?: Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"previous_ticker_announced"?: boolean,"recorded_at"?: string,"source_url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_ipo_stage_ev_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_lifecycle_events": {
                  Row: {
                    "candidate_id": string,"chain_id": number,"detected_token_address": string | null,"environment": Database["public"]['Enums']["network_environment"],"event_id": number,"next_identity_approval_status": string,"next_status": string,"occurred_at": string,"previous_identity_approval_status": string | null,"previous_status": string | null,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"chain_id": number,"detected_token_address"?: string | null,"environment": Database["public"]['Enums']["network_environment"],"event_id"?: never,"next_identity_approval_status": string,"next_status": string,"occurred_at"?: string,"previous_identity_approval_status"?: string | null,"previous_status"?: string | null,"reason"?: string | null
                  }
                  Update: {
                    "candidate_id"?: string,"chain_id"?: number,"detected_token_address"?: string | null,"environment"?: Database["public"]['Enums']["network_environment"],"event_id"?: never,"next_identity_approval_status"?: string,"next_status"?: string,"occurred_at"?: string,"previous_identity_approval_status"?: string | null,"previous_status"?: string | null,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_lifecycle_ev_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_liquidity_observations": {
                  Row: {
                    "buy_price_impact_bps": number | null,"candidate_id": string,"chain_id": number,"created_at": string,"dex_buy_price_18": number | null,"environment": Database["public"]['Enums']["network_environment"],"failure_code": string | null,"id": number,"notional_usdg_6": number,"observed_at": string,"oracle_deviation_bps": number | null,"passed": boolean,"pool_address": string,"sell_price_impact_bps": number | null,"token_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buy_price_impact_bps"?: number | null,"candidate_id": string,"chain_id": number,"created_at"?: string,"dex_buy_price_18"?: number | null,"environment": Database["public"]['Enums']["network_environment"],"failure_code"?: string | null,"id"?: never,"notional_usdg_6": number,"observed_at": string,"oracle_deviation_bps"?: number | null,"passed": boolean,"pool_address": string,"sell_price_impact_bps"?: number | null,"token_address": string
                  }
                  Update: {
                    "buy_price_impact_bps"?: number | null,"candidate_id"?: string,"chain_id"?: number,"created_at"?: string,"dex_buy_price_18"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"],"failure_code"?: string | null,"id"?: never,"notional_usdg_6"?: number,"observed_at"?: string,"oracle_deviation_bps"?: number | null,"passed"?: boolean,"pool_address"?: string,"sell_price_impact_bps"?: number | null,"token_address"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_liquidity_ob_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_operator_signoffs": {
                  Row: {
                    "candidate_id": string,"chain_id": number,"decision": string,"environment": Database["public"]['Enums']["network_environment"],"evidence_references": NonNullable<Json>,"governance_or_canary_reference": string | null,"id": number,"operator_reference": string,"rationale": string,"readiness_snapshot": NonNullable<Json>,"reviewer_reference": string,"signed_at": string,"tier": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"chain_id": number,"decision": string,"environment": Database["public"]['Enums']["network_environment"],"evidence_references": NonNullable<Json>,"governance_or_canary_reference"?: string | null,"id"?: never,"operator_reference": string,"rationale": string,"readiness_snapshot": NonNullable<Json>,"reviewer_reference": string,"signed_at"?: string,"tier": string
                  }
                  Update: {
                    "candidate_id"?: string,"chain_id"?: number,"decision"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"evidence_references"?: NonNullable<Json>,"governance_or_canary_reference"?: string | null,"id"?: never,"operator_reference"?: string,"rationale"?: string,"readiness_snapshot"?: NonNullable<Json>,"reviewer_reference"?: string,"signed_at"?: string,"tier"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_operator_sig_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_options_risk_observations": {
                  Row: {
                    "candidate_id": string,"cap_utilization_bps": number,"capital_6": number,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"exposure_6": number,"id": number,"maximum_exposure_6": number,"observed_at": string,"risk_manager_address": string,"token_address": string,"warning": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"cap_utilization_bps": number,"capital_6": number,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"exposure_6": number,"id"?: never,"maximum_exposure_6": number,"observed_at": string,"risk_manager_address": string,"token_address": string,"warning": boolean
                  }
                  Update: {
                    "candidate_id"?: string,"cap_utilization_bps"?: number,"capital_6"?: number,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"exposure_6"?: number,"id"?: never,"maximum_exposure_6"?: number,"observed_at"?: string,"risk_manager_address"?: string,"token_address"?: string,"warning"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_options_risk_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_oracle_observations": {
                  Row: {
                    "answered_in_round": number | null,"candidate_id": string,"chain_id": number,"created_at": string,"environment": Database["public"]['Enums']["network_environment"],"failure_code": string | null,"feed_address": string,"feed_updated_at": string | null,"id": number,"observed_at": string,"passed": boolean,"price_18": number | null,"round_id": number | null,"token_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_in_round"?: number | null,"candidate_id": string,"chain_id": number,"created_at"?: string,"environment": Database["public"]['Enums']["network_environment"],"failure_code"?: string | null,"feed_address": string,"feed_updated_at"?: string | null,"id"?: never,"observed_at": string,"passed": boolean,"price_18"?: number | null,"round_id"?: number | null,"token_address": string
                  }
                  Update: {
                    "answered_in_round"?: number | null,"candidate_id"?: string,"chain_id"?: number,"created_at"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"failure_code"?: string | null,"feed_address"?: string,"feed_updated_at"?: string | null,"id"?: never,"observed_at"?: string,"passed"?: boolean,"price_18"?: number | null,"round_id"?: number | null,"token_address"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_oracle_obser_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidate_product_control_events": {
                  Row: {
                    "candidate_id": string,"chain_id": number,"changed_at": string,"environment": Database["public"]['Enums']["network_environment"],"id": number,"operator_reference": string,"paused": boolean,"product": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"chain_id": number,"changed_at"?: string,"environment": Database["public"]['Enums']["network_environment"],"id"?: never,"operator_reference": string,"paused": boolean,"product": string,"reason": string
                  }
                  Update: {
                    "candidate_id"?: string,"chain_id"?: number,"changed_at"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"id"?: never,"operator_reference"?: string,"paused"?: boolean,"product"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_candidate_product_cont_environment_chain_id_candida_fkey"
      columns: ["environment","chain_id","candidate_id"]
isOneToOne: false
      referencedRelation: "market_candidates"
      referencedColumns: ["environment","chain_id","candidate_id"]
    }
                  ]
                },"market_candidates": {
                  Row: {
                    "asset_uid": string | null,"candidate_id": string,"chain_id": number,"company_name": string,"current_multiplier": string | null,"detected_token_address": string | null,"dex_reference_price_18": number | null,"disabled_reason": string | null,"eligible_from": string | null,"environment": Database["public"]['Enums']["network_environment"],"exchange": string | null,"expected_listing_date": string | null,"governance_approved": boolean,"identity_approval_reference": string | null,"identity_approval_status": string,"identity_approved_at": string | null,"impostor_aliases": (string)[],"ipo_date": string | null,"ipo_price": number | null,"ipo_stage": Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"isin": string | null,"last_checked_at": string | null,"lifecycle_status": string,"liquidity_observed_at": string | null,"liquidity_ready": boolean,"logo_url": string | null,"official_feed_address": string | null,"official_metadata_observed_at": string | null,"official_quote_generated_at": string | null,"official_token_detected_at": string | null,"official_token_name": string | null,"options_exposure_warning": boolean,"options_paused": boolean,"oracle_healthy_since": string | null,"oracle_last_failure": string | null,"oracle_last_price_18": number | null,"oracle_ready": boolean,"pending_multiplier": string | null,"price_range_high": number | null,"price_range_low": number | null,"product_control_updated_at": string | null,"product_pause_reason": string | null,"public_available_at": string | null,"publication_sla_seconds": number | null,"source_url": string | null,"spot_paused": boolean,"stage_source_url": string | null,"stage_updated_at": string | null,"symbol": string,"ticker_announced": boolean,"token_address": string | null,"token_decimals": number | null,"token_live": boolean,"trading_capabilities": Json | null,"trading_halted": boolean | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_uid"?: string | null,"candidate_id": string,"chain_id": number,"company_name": string,"current_multiplier"?: string | null,"detected_token_address"?: string | null,"dex_reference_price_18"?: number | null,"disabled_reason"?: string | null,"eligible_from"?: string | null,"environment": Database["public"]['Enums']["network_environment"],"exchange"?: string | null,"expected_listing_date"?: string | null,"governance_approved"?: boolean,"identity_approval_reference"?: string | null,"identity_approval_status"?: string,"identity_approved_at"?: string | null,"impostor_aliases"?: (string)[],"ipo_date"?: string | null,"ipo_price"?: number | null,"ipo_stage"?: Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"isin"?: string | null,"last_checked_at"?: string | null,"lifecycle_status": string,"liquidity_observed_at"?: string | null,"liquidity_ready"?: boolean,"logo_url"?: string | null,"official_feed_address"?: string | null,"official_metadata_observed_at"?: string | null,"official_quote_generated_at"?: string | null,"official_token_detected_at"?: string | null,"official_token_name"?: string | null,"options_exposure_warning"?: boolean,"options_paused"?: boolean,"oracle_healthy_since"?: string | null,"oracle_last_failure"?: string | null,"oracle_last_price_18"?: number | null,"oracle_ready"?: boolean,"pending_multiplier"?: string | null,"price_range_high"?: number | null,"price_range_low"?: number | null,"product_control_updated_at"?: string | null,"product_pause_reason"?: string | null,"public_available_at"?: string | null,"publication_sla_seconds"?: number | null,"source_url"?: string | null,"spot_paused"?: boolean,"stage_source_url"?: string | null,"stage_updated_at"?: string | null,"symbol": string,"ticker_announced"?: boolean,"token_address"?: string | null,"token_decimals"?: number | null,"token_live"?: boolean,"trading_capabilities"?: Json | null,"trading_halted"?: boolean | null,"updated_at"?: string
                  }
                  Update: {
                    "asset_uid"?: string | null,"candidate_id"?: string,"chain_id"?: number,"company_name"?: string,"current_multiplier"?: string | null,"detected_token_address"?: string | null,"dex_reference_price_18"?: number | null,"disabled_reason"?: string | null,"eligible_from"?: string | null,"environment"?: Database["public"]['Enums']["network_environment"],"exchange"?: string | null,"expected_listing_date"?: string | null,"governance_approved"?: boolean,"identity_approval_reference"?: string | null,"identity_approval_status"?: string,"identity_approved_at"?: string | null,"impostor_aliases"?: (string)[],"ipo_date"?: string | null,"ipo_price"?: number | null,"ipo_stage"?: Database["public"]['Enums']["market_candidate_ipo_stage"] | null,"isin"?: string | null,"last_checked_at"?: string | null,"lifecycle_status"?: string,"liquidity_observed_at"?: string | null,"liquidity_ready"?: boolean,"logo_url"?: string | null,"official_feed_address"?: string | null,"official_metadata_observed_at"?: string | null,"official_quote_generated_at"?: string | null,"official_token_detected_at"?: string | null,"official_token_name"?: string | null,"options_exposure_warning"?: boolean,"options_paused"?: boolean,"oracle_healthy_since"?: string | null,"oracle_last_failure"?: string | null,"oracle_last_price_18"?: number | null,"oracle_ready"?: boolean,"pending_multiplier"?: string | null,"price_range_high"?: number | null,"price_range_low"?: number | null,"product_control_updated_at"?: string | null,"product_pause_reason"?: string | null,"public_available_at"?: string | null,"publication_sla_seconds"?: number | null,"source_url"?: string | null,"spot_paused"?: boolean,"stage_source_url"?: string | null,"stage_updated_at"?: string | null,"symbol"?: string,"ticker_announced"?: boolean,"token_address"?: string | null,"token_decimals"?: number | null,"token_live"?: boolean,"trading_capabilities"?: Json | null,"trading_halted"?: boolean | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"nav_snapshots": {
                  Row: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"nav_usd_18": number,"observed_at": string,"oracle_health": NonNullable<Json>,"share_price_usd_18": number | null,"total_supply_18": number,"vault_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash": string,"block_number": number,"canonical"?: boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"nav_usd_18": number,"observed_at": string,"oracle_health": NonNullable<Json>,"share_price_usd_18"?: number | null,"total_supply_18": number,"vault_address": string
                  }
                  Update: {
                    "block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"nav_usd_18"?: number,"observed_at"?: string,"oracle_health"?: NonNullable<Json>,"share_price_usd_18"?: number | null,"total_supply_18"?: number,"vault_address"?: string
                  }
                  Relationships: [
                    
                  ]
                },"operational_actions": {
                  Row: {
                    "action": string,"block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"log_index": number,"module": string,"observed_at": string,"payload": NonNullable<Json>,"transaction_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"block_hash": string,"block_number": number,"canonical"?: boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"log_index": number,"module": string,"observed_at": string,"payload": NonNullable<Json>,"transaction_hash": string
                  }
                  Update: {
                    "action"?: string,"block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"log_index"?: number,"module"?: string,"observed_at"?: string,"payload"?: NonNullable<Json>,"transaction_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_market_events": {
                  Row: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"cash_amount_6": number,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"payload": NonNullable<Json>,"series_id": string,"size_18": number,"transaction_hash": string,"wallet_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"cash_amount_6": number,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"payload": NonNullable<Json>,"series_id": string,"size_18": number,"transaction_hash": string,"wallet_address": string
                  }
                  Update: {
                    "block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"cash_amount_6"?: number,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"event_name"?: string,"log_index"?: number,"observed_at"?: string,"payload"?: NonNullable<Json>,"series_id"?: string,"size_18"?: number,"transaction_hash"?: string,"wallet_address"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_quote_audit": {
                  Row: {
                    "buyer": string,"chain_id": number,"created_at": string,"decision": string,"environment": Database["public"]['Enums']["network_environment"],"id": number,"policy_input": NonNullable<Json>,"pricing_result": Json | null,"reason": string | null,"request_id": string,"series_id": string,"side": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer": string,"chain_id": number,"created_at"?: string,"decision": string,"environment": Database["public"]['Enums']["network_environment"],"id"?: never,"policy_input": NonNullable<Json>,"pricing_result"?: Json | null,"reason"?: string | null,"request_id": string,"series_id": string,"side": string
                  }
                  Update: {
                    "buyer"?: string,"chain_id"?: number,"created_at"?: string,"decision"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"id"?: never,"policy_input"?: NonNullable<Json>,"pricing_result"?: Json | null,"reason"?: string | null,"request_id"?: string,"series_id"?: string,"side"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_quote_nonces": {
                  Row: {
                    "buyer": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"next_nonce": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer": string,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"next_nonce": number,"updated_at"?: string
                  }
                  Update: {
                    "buyer"?: string,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"next_nonce"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_series_events": {
                  Row: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"payload": NonNullable<Json>,"series_id": string,"transaction_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"payload": NonNullable<Json>,"series_id": string,"transaction_hash": string
                  }
                  Update: {
                    "block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"event_name"?: string,"log_index"?: number,"observed_at"?: string,"payload"?: NonNullable<Json>,"series_id"?: string,"transaction_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_settlement_events": {
                  Row: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"log_index": number,"manual": boolean,"observed_at": string,"payoff_per_unit_usd_18": number,"series_id": string,"settlement_price_usd_18": number,"total_claimable_6": number,"transaction_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"log_index": number,"manual": boolean,"observed_at": string,"payoff_per_unit_usd_18": number,"series_id": string,"settlement_price_usd_18": number,"total_claimable_6": number,"transaction_hash": string
                  }
                  Update: {
                    "block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"log_index"?: number,"manual"?: boolean,"observed_at"?: string,"payoff_per_unit_usd_18"?: number,"series_id"?: string,"settlement_price_usd_18"?: number,"total_claimable_6"?: number,"transaction_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_volatility_observations": {
                  Row: {
                    "annualized_volatility": number,"chain_id": number,"created_at": string,"environment": Database["public"]['Enums']["network_environment"],"id": number,"observed_at": string,"source": string,"underlying": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annualized_volatility": number,"chain_id": number,"created_at"?: string,"environment": Database["public"]['Enums']["network_environment"],"id"?: never,"observed_at": string,"source": string,"underlying": string
                  }
                  Update: {
                    "annualized_volatility"?: number,"chain_id"?: number,"created_at"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"id"?: never,"observed_at"?: string,"source"?: string,"underlying"?: string
                  }
                  Relationships: [
                    
                  ]
                },"options_withdrawal_events": {
                  Row: {
                    "assets_6": number | null,"block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"owner_address": string | null,"payload": NonNullable<Json>,"receiver_address": string | null,"request_id": number,"shares": number | null,"transaction_hash": string,"unlock_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assets_6"?: number | null,"block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"owner_address"?: string | null,"payload": NonNullable<Json>,"receiver_address"?: string | null,"request_id": number,"shares"?: number | null,"transaction_hash": string,"unlock_at"?: string | null
                  }
                  Update: {
                    "assets_6"?: number | null,"block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"event_name"?: string,"log_index"?: number,"observed_at"?: string,"owner_address"?: string | null,"payload"?: NonNullable<Json>,"receiver_address"?: string | null,"request_id"?: number,"shares"?: number | null,"transaction_hash"?: string,"unlock_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"protocol_events": {
                  Row: {
                    "block_hash": string,"block_number": number,"block_timestamp": string,"canonical": boolean,"chain_id": number,"contract_address": string,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"ingested_at": string,"log_index": number,"payload": NonNullable<Json>,"transaction_hash": string,"transaction_index": number
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash": string,"block_number": number,"block_timestamp": string,"canonical"?: boolean,"chain_id": number,"contract_address": string,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"ingested_at"?: string,"log_index": number,"payload": NonNullable<Json>,"transaction_hash": string,"transaction_index": number
                  }
                  Update: {
                    "block_hash"?: string,"block_number"?: number,"block_timestamp"?: string,"canonical"?: boolean,"chain_id"?: number,"contract_address"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"event_name"?: string,"ingested_at"?: string,"log_index"?: number,"payload"?: NonNullable<Json>,"transaction_hash"?: string,"transaction_index"?: number
                  }
                  Relationships: [
                    
                  ]
                },"registry_changes": {
                  Row: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"change_kind": string,"configuration_hash": string | null,"environment": Database["public"]['Enums']["network_environment"],"log_index": number,"observed_at": string,"payload": NonNullable<Json>,"registry_version": number | null,"token_address": string | null,"transaction_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_hash": string,"block_number": number,"canonical"?: boolean,"chain_id": number,"change_kind": string,"configuration_hash"?: string | null,"environment": Database["public"]['Enums']["network_environment"],"log_index": number,"observed_at": string,"payload": NonNullable<Json>,"registry_version"?: number | null,"token_address"?: string | null,"transaction_hash": string
                  }
                  Update: {
                    "block_hash"?: string,"block_number"?: number,"canonical"?: boolean,"chain_id"?: number,"change_kind"?: string,"configuration_hash"?: string | null,"environment"?: Database["public"]['Enums']["network_environment"],"log_index"?: number,"observed_at"?: string,"payload"?: NonNullable<Json>,"registry_version"?: number | null,"token_address"?: string | null,"transaction_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_transactions": {
                  Row: {
                    "action": string,"asset_amount": number | null,"block_number": number | null,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"failure_code": string | null,"finalized_at": string | null,"share_amount": number | null,"source_block_hash": string | null,"source_log_index": number | null,"status": Database["public"]['Enums']["transaction_status"],"submitted_at": string,"transaction_hash": string,"wallet_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"asset_amount"?: number | null,"block_number"?: number | null,"canonical"?: boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"failure_code"?: string | null,"finalized_at"?: string | null,"share_amount"?: number | null,"source_block_hash"?: string | null,"source_log_index"?: number | null,"status": Database["public"]['Enums']["transaction_status"],"submitted_at": string,"transaction_hash": string,"wallet_address": string
                  }
                  Update: {
                    "action"?: string,"asset_amount"?: number | null,"block_number"?: number | null,"canonical"?: boolean,"chain_id"?: number,"environment"?: Database["public"]['Enums']["network_environment"],"failure_code"?: string | null,"finalized_at"?: string | null,"share_amount"?: number | null,"source_block_hash"?: string | null,"source_log_index"?: number | null,"status"?: Database["public"]['Enums']["transaction_status"],"submitted_at"?: string,"transaction_hash"?: string,"wallet_address"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wallet_auth_challenges": {
                  Row: {
                    "chain_id": number,"consumed_at": string | null,"created_at": string,"environment": Database["public"]['Enums']["network_environment"],"expires_at": string,"nonce": string,"wallet_address": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chain_id": number,"consumed_at"?: string | null,"created_at"?: string,"environment": Database["public"]['Enums']["network_environment"],"expires_at": string,"nonce": string,"wallet_address": string
                  }
                  Update: {
                    "chain_id"?: number,"consumed_at"?: string | null,"created_at"?: string,"environment"?: Database["public"]['Enums']["network_environment"],"expires_at"?: string,"nonce"?: string,"wallet_address"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "api_holding_snapshots": {
                  Row: {
                    "block_hash": string | null,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"normalized_price_usd_18": string | null,"observed_at": string | null,"oracle_health": string | null,"oracle_updated_at": number | null,"raw_balance": string | null,"token_address": string,"ui_multiplier_18": string | null,"value_usd_18": string | null,"vault_address": string
                  }
                  ComputedFields: never
                  Insert: {
                           "block_hash"?: string | null,"block_number"?: number | null,"canonical"?: boolean | null,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"normalized_price_usd_18"?: never,"observed_at"?: string | null,"oracle_health"?: string | null,"oracle_updated_at"?: number | null,"raw_balance"?: never,"token_address"?: string | null,"ui_multiplier_18"?: never,"value_usd_18"?: never,"vault_address"?: string | null
                         }
                        Update: {
                           "block_hash"?: string | null,"block_number"?: number | null,"canonical"?: boolean | null,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"normalized_price_usd_18"?: never,"observed_at"?: string | null,"oracle_health"?: string | null,"oracle_updated_at"?: number | null,"raw_balance"?: never,"token_address"?: string | null,"ui_multiplier_18"?: never,"value_usd_18"?: never,"vault_address"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"api_nav_snapshots": {
                  Row: {
                    "block_hash": string,"block_number": number,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"nav_usd_18": string | null,"observed_at": string,"oracle_health": NonNullable<Json>,"share_price_usd_18": string | null,"total_supply_18": string | null,"vault_address": string
                  }
                  ComputedFields: never
                  Insert: {
                           "block_hash"?: string | null,"block_number"?: number | null,"canonical"?: boolean | null,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"nav_usd_18"?: never,"observed_at"?: string | null,"oracle_health"?: Json | null,"share_price_usd_18"?: never,"total_supply_18"?: never,"vault_address"?: string | null
                         }
                        Update: {
                           "block_hash"?: string | null,"block_number"?: number | null,"canonical"?: boolean | null,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"nav_usd_18"?: never,"observed_at"?: string | null,"oracle_health"?: Json | null,"share_price_usd_18"?: never,"total_supply_18"?: never,"vault_address"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"api_options_activity": {
                  Row: {
                    "block_number": number,"cash_amount_6": string | null,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"event_name": string,"log_index": number,"observed_at": string,"series_id": string,"size_18": string | null,"transaction_hash": string,"wallet_address": string
                  }
                  ComputedFields: never
                  Insert: {
                           "block_number"?: number | null,"cash_amount_6"?: never,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"event_name"?: string | null,"log_index"?: number | null,"observed_at"?: string | null,"series_id"?: string | null,"size_18"?: never,"transaction_hash"?: string | null,"wallet_address"?: string | null
                         }
                        Update: {
                           "block_number"?: number | null,"cash_amount_6"?: never,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"event_name"?: string | null,"log_index"?: number | null,"observed_at"?: string | null,"series_id"?: string | null,"size_18"?: never,"transaction_hash"?: string | null,"wallet_address"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"api_options_positions": {
                  Row: {
                    "chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"net_cash_flow_6": string | null,"series_id": string,"size_18": string | null,"underlying": string | null,"underlying_symbol": string | null,"updated_at": string | null,"wallet_address": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"api_options_series": {
                  Row: {
                    "cap_usd_18": string | null,"chain_id": number,"contract_size_18": string | null,"corporate_action_policy_version": string | null,"created_at": string,"environment": Database["public"]['Enums']["network_environment"],"expiry": string | null,"kind": string | null,"manual": boolean | null,"payoff_per_unit_usd_18": string | null,"price_source": string | null,"series_id": string,"settlement_price_usd_18": string | null,"state": string | null,"strike_usd_18": string | null,"total_claimable_6": string | null,"underlying": string | null,"underlying_symbol": string | null,"underlying_uid": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"api_options_withdrawals": {
                  Row: {
                    "assets_6": string | null,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"owner_address": string | null,"receiver_address": string | null,"request_id": string | null,"shares": string | null,"state": string,"unlock_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"api_user_transactions": {
                  Row: {
                    "action": string,"asset_amount": string | null,"block_number": number | null,"canonical": boolean,"chain_id": number,"environment": Database["public"]['Enums']["network_environment"],"failure_code": string | null,"finalized_at": string | null,"share_amount": string | null,"status": Database["public"]['Enums']["transaction_status"],"submitted_at": string,"transaction_hash": string,"wallet_address": string
                  }
                  ComputedFields: never
                  Insert: {
                           "action"?: string | null,"asset_amount"?: never,"block_number"?: number | null,"canonical"?: boolean | null,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"failure_code"?: string | null,"finalized_at"?: string | null,"share_amount"?: never,"status"?: Database["public"]['Enums']["transaction_status"] | null,"submitted_at"?: string | null,"transaction_hash"?: string | null,"wallet_address"?: string | null
                         }
                        Update: {
                           "action"?: string | null,"asset_amount"?: never,"block_number"?: number | null,"canonical"?: boolean | null,"chain_id"?: number | null,"environment"?: Database["public"]['Enums']["network_environment"] | null,"failure_code"?: string | null,"finalized_at"?: string | null,"share_amount"?: never,"status"?: Database["public"]['Enums']["transaction_status"] | null,"submitted_at"?: string | null,"transaction_hash"?: string | null,"wallet_address"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "acknowledge_market_candidate_alert":
{ Args: { "p_acknowledged_by": string,"p_alert_id": number,"p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_note": string }; Returns: undefined
                           },
"allocate_options_quote_nonce":
{ Args: { "target_buyer": string,"target_chain_id": number,"target_environment": Database["public"]['Enums']["network_environment"] }; Returns: string
                           },
"approve_market_candidate_identity":
{ Args: { "p_approval_transaction_hash": string,"p_approved_at": string,"p_approved_by": string,"p_candidate_id": string,"p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_multisig_address": string,"p_token_address": string }; Returns: undefined
                           },
"approve_market_candidate_public_filing":
{ Args: { "p_accession_number": string,"p_candidate_id": string,"p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_reviewed_by": string }; Returns: boolean
                           },
"commit_core_snapshot":
{ Args: { "p_block_hash": string,"p_block_number": number,"p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_holdings": Json,"p_nav_usd_18": number,"p_observed_at": string,"p_share_price_usd_18": number,"p_total_supply_18": number,"p_vault_address": string }; Returns: undefined
                           },
"commit_core_snapshot_v2":
{ Args: { "p_block_hash": string,"p_block_number": number,"p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_holdings": Json,"p_nav_usd_18": number,"p_observed_at": string,"p_share_price_usd_18": number,"p_total_supply_18": number,"p_vault_address": string }; Returns: undefined
                           },
"commit_indexer_batch":
{ Args: { "p_chain_id": number,"p_consumer": string,"p_environment": Database["public"]['Enums']["network_environment"],"p_events": Json,"p_finalized_hash": string,"p_from_block": number,"p_to_block": number }; Returns: undefined
                           },
"consume_wallet_auth_challenge":
{ Args: { "p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_nonce": string,"p_wallet_address": string }; Returns: boolean
                           },
"issue_wallet_auth_challenge":
{ Args: { "p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_expires_at": string,"p_nonce": string,"p_wallet_address": string }; Returns: undefined
                           },
"record_market_candidate_operator_signoff":
{ Args: { "p_candidate_id": string,"p_chain_id": number,"p_decision": string,"p_environment": Database["public"]['Enums']["network_environment"],"p_evidence_references": Json,"p_governance_or_canary_reference": string,"p_operator_reference": string,"p_rationale": string,"p_readiness_snapshot": Json,"p_reviewer_reference": string,"p_tier": string }; Returns: number
                           },
"report_ingestion_health":
{ Args: { "p_chain_id": number,"p_consumer": string,"p_environment": Database["public"]['Enums']["network_environment"],"p_lag_blocks"?: number,"p_last_error"?: string,"p_latest_seen_block"?: number,"p_status": Database["public"]['Enums']["ingestion_status"] }; Returns: undefined
                           },
"rewind_indexer":
{ Args: { "p_chain_id": number,"p_consumer": string,"p_environment": Database["public"]['Enums']["network_environment"],"p_replay_from_block": number }; Returns: undefined
                           },
"set_market_candidate_product_pause":
{ Args: { "p_candidate_id": string,"p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_operator_reference": string,"p_paused": boolean,"p_product": string,"p_reason": string }; Returns: undefined
                           },
"take_api_rate_limit":
{ Args: { "p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_key_hash": string,"p_limit": number,"p_window_seconds": number }; Returns: Json
                           }
          }
          Enums: {
            "ingestion_status": "healthy"|"degraded"|"halted","keeper_job_status": "ready"|"simulated"|"broadcast"|"confirmed"|"failed"|"abandoned","market_candidate_ipo_stage": "confidential_filed"|"public_s1"|"roadshow"|"priced"|"trading"|"withdrawn","network_environment": "testnet"|"mainnet","transaction_status": "pending"|"confirmed"|"failed"|"replaced"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "ingestion_status": ["healthy", "degraded", "halted"],"keeper_job_status": ["ready", "simulated", "broadcast", "confirmed", "failed", "abandoned"],"market_candidate_ipo_stage": ["confidential_filed", "public_s1", "roadshow", "priced", "trading", "withdrawn"],"network_environment": ["testnet", "mainnet"],"transaction_status": ["pending", "confirmed", "failed", "replaced"]
          }
        }
} as const
