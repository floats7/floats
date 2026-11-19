
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
                },"market_candidates": {
                  Row: {
                    "asset_uid": string | null,"candidate_id": string,"chain_id": number,"company_name": string,"current_multiplier": string | null,"detected_token_address": string | null,"disabled_reason": string | null,"eligible_from": string | null,"environment": Database["public"]['Enums']["network_environment"],"expected_listing_date": string | null,"governance_approved": boolean,"identity_approval_reference": string | null,"identity_approval_status": string,"identity_approved_at": string | null,"ipo_date": string | null,"isin": string | null,"last_checked_at": string | null,"lifecycle_status": string,"liquidity_ready": boolean,"logo_url": string | null,"official_metadata_observed_at": string | null,"official_quote_generated_at": string | null,"official_token_name": string | null,"oracle_ready": boolean,"pending_multiplier": string | null,"source_url": string | null,"symbol": string,"token_address": string | null,"token_decimals": number | null,"token_live": boolean,"trading_capabilities": Json | null,"trading_halted": boolean | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_uid"?: string | null,"candidate_id": string,"chain_id": number,"company_name": string,"current_multiplier"?: string | null,"detected_token_address"?: string | null,"disabled_reason"?: string | null,"eligible_from"?: string | null,"environment": Database["public"]['Enums']["network_environment"],"expected_listing_date"?: string | null,"governance_approved"?: boolean,"identity_approval_reference"?: string | null,"identity_approval_status"?: string,"identity_approved_at"?: string | null,"ipo_date"?: string | null,"isin"?: string | null,"last_checked_at"?: string | null,"lifecycle_status": string,"liquidity_ready"?: boolean,"logo_url"?: string | null,"official_metadata_observed_at"?: string | null,"official_quote_generated_at"?: string | null,"official_token_name"?: string | null,"oracle_ready"?: boolean,"pending_multiplier"?: string | null,"source_url"?: string | null,"symbol": string,"token_address"?: string | null,"token_decimals"?: number | null,"token_live"?: boolean,"trading_capabilities"?: Json | null,"trading_halted"?: boolean | null,"updated_at"?: string
                  }
                  Update: {
                    "asset_uid"?: string | null,"candidate_id"?: string,"chain_id"?: number,"company_name"?: string,"current_multiplier"?: string | null,"detected_token_address"?: string | null,"disabled_reason"?: string | null,"eligible_from"?: string | null,"environment"?: Database["public"]['Enums']["network_environment"],"expected_listing_date"?: string | null,"governance_approved"?: boolean,"identity_approval_reference"?: string | null,"identity_approval_status"?: string,"identity_approved_at"?: string | null,"ipo_date"?: string | null,"isin"?: string | null,"last_checked_at"?: string | null,"lifecycle_status"?: string,"liquidity_ready"?: boolean,"logo_url"?: string | null,"official_metadata_observed_at"?: string | null,"official_quote_generated_at"?: string | null,"official_token_name"?: string | null,"oracle_ready"?: boolean,"pending_multiplier"?: string | null,"source_url"?: string | null,"symbol"?: string,"token_address"?: string | null,"token_decimals"?: number | null,"token_live"?: boolean,"trading_capabilities"?: Json | null,"trading_halted"?: boolean | null,"updated_at"?: string
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
"report_ingestion_health":
{ Args: { "p_chain_id": number,"p_consumer": string,"p_environment": Database["public"]['Enums']["network_environment"],"p_lag_blocks"?: number,"p_last_error"?: string,"p_latest_seen_block"?: number,"p_status": Database["public"]['Enums']["ingestion_status"] }; Returns: undefined
                           },
"rewind_indexer":
{ Args: { "p_chain_id": number,"p_consumer": string,"p_environment": Database["public"]['Enums']["network_environment"],"p_replay_from_block": number }; Returns: undefined
                           },
"take_api_rate_limit":
{ Args: { "p_chain_id": number,"p_environment": Database["public"]['Enums']["network_environment"],"p_key_hash": string,"p_limit": number,"p_window_seconds": number }; Returns: Json
                           }
          }
          Enums: {
            "ingestion_status": "healthy"|"degraded"|"halted","keeper_job_status": "ready"|"simulated"|"broadcast"|"confirmed"|"failed"|"abandoned","network_environment": "testnet"|"mainnet","transaction_status": "pending"|"confirmed"|"failed"|"replaced"
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
            "ingestion_status": ["healthy", "degraded", "halted"],"keeper_job_status": ["ready", "simulated", "broadcast", "confirmed", "failed", "abandoned"],"network_environment": ["testnet", "mainnet"],"transaction_status": ["pending", "confirmed", "failed", "replaced"]
          }
        }
} as const
