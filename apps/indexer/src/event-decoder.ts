import type { Address, Hex } from "./types.ts";

type SolidityType = "address" | "bool" | "bytes32" | `int${number}` | `uint${number}`;

interface EventInput {
  readonly name: string;
  readonly type: SolidityType;
  readonly indexed: boolean;
}

interface EventDefinition {
  readonly name: string;
  readonly topic: Hex;
  readonly inputs: readonly EventInput[];
}

export interface RawEvmLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export interface DecodedLogPayload {
  readonly eventName: string;
  readonly payload: Readonly<Record<string, string | boolean>>;
}

const input = (name: string, type: SolidityType, indexed = false): EventInput => ({
  name,
  type,
  indexed,
});

const EVENTS: readonly EventDefinition[] = [
  { name: "PerpsPositionModified", topic: "0x0d50504f7163ee98c4b39b6ff598acda6b7e7f0b3859885b43b073f29f8fb7a9", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("sizeDelta18", "int256"), input("resultingSize18", "int256"), input("executionPriceUsd18", "uint256"), input("realizedPnlUsd18", "int256"), input("fundingPaymentUsd18", "int256"), input("feeUsd6", "uint256")] },
  { name: "PerpsPositionLiquidated", topic: "0x450910c3f3c40aac7dde5bef15676877e9c90f48cb18a002d9a2fde0cd33e165", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("keeper", "address", true), input("closedSize18", "uint256"), input("markPriceUsd18", "uint256"), input("settlementUsd18", "int256"), input("liquidationFee6", "uint256"), input("badDebt6", "uint256")] },
  { name: "PerpsPositionAutoDeleveraged", topic: "0x38c6f2cd36803e47dcac9ac5c75981ab7e49ec90a2d190c8a65639944f715f0d", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("closedSize18", "uint256"), input("markPriceUsd18", "uint256"), input("foregoneProfit6", "uint256"), input("resultingSize18", "int256")] },
  { name: "PerpsMarketCreated", topic: "0x73088b3c6aadd5f61c7ed353ff5e8b50dfc042512001a5b3696e2a7322f968b8", inputs: [input("marketId", "bytes32", true), input("underlying", "address", true), input("underlyingUid", "bytes32", true), input("symbol", "bytes32"), input("priceFeed", "address"), input("isolatedOnly", "bool")] },
  { name: "PerpsMarketConfigurationUpdated", topic: "0xa58cd41b611f5133e6dc830579a34a182f5d12a603d535c584034f08a604be07", inputs: [input("marketId", "bytes32", true)] },
  { name: "PerpsMarketStateChanged", topic: "0x81920b01fede175cfe8268cb52e9145f247a839c8dbe0f637651262b1aa52e12", inputs: [input("marketId", "bytes32", true), input("previousState", "uint8"), input("newState", "uint8"), input("caller", "address", true)] },
  { name: "PerpsSessionStateChanged", topic: "0x24ea3f3326c266060ff0c31d0494820125b128f3997044125ef36ddbeae21a35", inputs: [input("marketId", "bytes32", true), input("previousState", "uint8"), input("newState", "uint8"), input("caller", "address", true)] },
  { name: "PerpsLiquidationEngineSet", topic: "0x3b0968e13fd8c056155795f1e4e6e6ecfe1a011135caa8bb22b7f850a0d5265c", inputs: [input("liquidationEngine", "address", true)] },
  { name: "PerpsFundingUpdated", topic: "0x085e80c4e03b6b2c4c37e8bd35e9d4bcc94a05c9ee9ebaec75edbf09a7045fc9", inputs: [input("marketId", "bytes32", true), input("fundingRate18", "int256"), input("cumulativeFundingIndex18", "int256"), input("longOpenInterestUsd18", "uint256"), input("shortOpenInterestUsd18", "uint256"), input("updatedAt", "uint48")] },
  { name: "PerpsFundingConfigurationSet", topic: "0x9d6f0bb247c9d6f895d1f8c9656b4f0a0a685c0f5f0ecfd231b342d8aa9d3e7d", inputs: [input("marketId", "bytes32", true), input("skewCoefficient18", "uint256"), input("maximumRate18", "uint256")] },
  { name: "PerpsFundingPositionSourceSet", topic: "0x6971219021cf9751c612a3add7d1b1bc423133a43c376787c5c28dc6c7abddbf", inputs: [input("positionSource", "address", true)] },
  { name: "PerpsFundingSettled", topic: "0x90aab708e734cf9680d539c0b328b46cd73bf0f77c693c7391d26e9dead7acab", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("paymentUsd18", "int256"), input("transferredAssets6", "uint256")] },
  { name: "PerpsDeposited", topic: "0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4", inputs: [input("account", "address", true), input("assets", "uint256")] },
  { name: "PerpsWithdrawn", topic: "0xd1c19fbcd4551a5edfb66d43d2e337c04837afda3482b42bdf569a8fccdae5fb", inputs: [input("account", "address", true), input("receiver", "address", true), input("assets", "uint256")] },
  { name: "PerpsCrossCollateralAdded", topic: "0x2791729d657c1f127449e2fca32bef0a56a3e475711632e2f18d71265bcf20bd", inputs: [input("account", "address", true), input("assets", "uint256")] },
  { name: "PerpsCrossCollateralRemoved", topic: "0x617e6984704ce62e457eed311e7261086a01d6982734f3ccaf443389691bd73e", inputs: [input("account", "address", true), input("assets", "uint256")] },
  { name: "PerpsIsolatedMarginAdded", topic: "0x5750715fde63ba3c837558e3c789e380c26e1a1f60b3be2e2e0b9fc95a68db06", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("assets", "uint256")] },
  { name: "PerpsIsolatedMarginRemoved", topic: "0x440d1372af5e13172a476fdb129c78bf0ba1762feb3ac7760928705d14d4f0c0", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("assets", "uint256")] },
  { name: "PerpsMarginModeChanged", topic: "0x8c6add1f07f73ca4c4aa3b948237e1e9a1d1d98fd9a934fe369a6f86c5bceee8", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("previousMode", "uint8"), input("newMode", "uint8")] },
  { name: "PerpsMarginCredited", topic: "0x6a20c731c5bba58832470aa98590ba0044af26ccf1d00f277e2fed1725aa785f", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("assets", "uint256")] },
  { name: "PerpsMarginPaid", topic: "0x7af4ba796a2c1a261e1e7de3541ccbd24ff82ae915a03e7b4da2043b66a5622d", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("receiver", "address", true), input("assets", "uint256")] },
  { name: "PerpsMarginSeized", topic: "0x1ede22bb456b466cf6690bd18f95ae097d7317a38c3d0c53cc5f0ee9e46a0c8d", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("receiver", "address", true), input("requestedAssets", "uint256"), input("paidAssets", "uint256")] },
  { name: "PerpsPositionStatusChanged", topic: "0x68ef2aae5dd89e2296c7c0a408afef49f661f7070e243aaded1de59b5d8a4dd5", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("positionOpen", "bool")] },
  { name: "PerpsRiskEngineSet", topic: "0x9ceba4c2372abca6b9ba0f8ca4dfb6d663c37a6a0bf61ad02e135d785b341a4a", inputs: [input("riskEngine", "address", true)] },
  { name: "PerpsLiabilityReserved", topic: "0x5562fd8c003bebf78f1c010c645c870c9e09a6543e9b6600e749772032a3cf38", inputs: [input("assets", "uint256"), input("totalReserved", "uint256")] },
  { name: "PerpsLiabilityReleased", topic: "0x8193575de79bf8348d0ca964b3a57ffd9bac4dc6568bfd3b3d9d12a6dd98850a", inputs: [input("assets", "uint256"), input("totalReserved", "uint256")] },
  { name: "PerpsBadDebtRecorded", topic: "0x8a02d53cceb0b6106e524a866d28fa8841ce3a647aa89fd7932ac96d2bde667f", inputs: [input("assets", "uint256"), input("totalBadDebt", "uint256")] },
  { name: "PerpsBadDebtCovered", topic: "0x242e1f451f8c7015bf7d048b163e3aad53106aa7042dba8ba77adbdcc21c02d9", inputs: [input("assets", "uint256"), input("totalBadDebt", "uint256")] },
  { name: "PerpsProtocolRevenueReceived", topic: "0x72d2852e14af5e5f0ecc20954fa175a74d80cc332e0b686d7b5a050b331a260a", inputs: [input("assets", "uint256")] },
  { name: "PerpsTraderProfitPaid", topic: "0x590fdbd85324c203dad812154d9a8c267fe84441dc242967c95b2dfc2cea280b", inputs: [input("receiver", "address", true), input("assets", "uint256"), input("totalReserved", "uint256")] },
  { name: "PerpsInsuranceFunded", topic: "0x5af8184bef8e4b45eb9f6ed7734d04da38ced226495548f46e0c8ff8d7d9a524", inputs: [input("sender", "address", true), input("assets", "uint256")] },
  { name: "PerpsInsuranceBadDebtCovered", topic: "0x4e4393f5597b7480bc7e6aa0c8f8a1fd1475ec3daaa9825aef7089280f98119d", inputs: [input("receiver", "address", true), input("assets", "uint256")] },
  { name: "PerpsInsuranceRecovered", topic: "0x8c1256b8896378cd5044f80c202f9772b9d77dc85c8a6eb51967210b09bfaa28", inputs: [input("receiver", "address", true), input("assets", "uint256")] },
  { name: "PerpsIsolatedLiquidationExecuted", topic: "0x79b9dbec1a5d9f26357cf658b79dea1d2226d66760156df96955a75c0457dd30", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("keeper", "address", true), input("closedSize18", "uint256"), input("badDebt6", "uint256"), input("insuranceCovered6", "uint256"), input("liquidationFeePaid6", "uint256"), input("fullLiquidation", "bool")] },
  { name: "PerpsCrossLiquidationExecuted", topic: "0xa646b5f0773ea031774d7fef0444f32fd1cdab1b074545205b7859040a2780a3", inputs: [input("account", "address", true), input("marketId", "bytes32", true), input("keeper", "address", true), input("closedSize18", "uint256"), input("badDebt6", "uint256"), input("insuranceCovered6", "uint256"), input("liquidationFeePaid6", "uint256"), input("fullLiquidation", "bool")] },
  { name: "PerpsAdlDeficitQueued", topic: "0xea8ea29c7c4f813f38986371fb702c53d434b53d21a807fd9c8535a55b2823d4", inputs: [input("marketId", "bytes32", true), input("targetLong", "bool", true), input("deficit6", "uint256"), input("totalPendingDeficit6", "uint256")] },
  { name: "PerpsAdlExecuted", topic: "0x5fc21e09e5c0682308968c3c63a715f90ac91b3b51af1e9a5b9b46f81ec08da7", inputs: [input("marketId", "bytes32", true), input("account", "address", true), input("keeper", "address", true), input("targetLong", "bool"), input("closedSize18", "uint256"), input("coveredDeficit6", "uint256"), input("remainingDeficit6", "uint256")] },
  { name: "PerpsWithdrawalRequested", topic: "0xb79e7550b9c848eda97ad21f2e1c2736c4a1d876e671810090eee926da103d7c", inputs: [input("requestId", "uint256", true), input("owner", "address", true), input("receiver", "address", true), input("shares", "uint256"), input("unlockAt", "uint48")] },
  { name: "PerpsWithdrawalCancelled", topic: "0xe3db0c7bb54dbc952074f8c31f0ad281b6a4c3e458f2e9fc2dc2fafe6975f9f0", inputs: [input("requestId", "uint256", true)] },
  { name: "PerpsWithdrawalProcessed", topic: "0x177b9b65877b3bbb97d28f1a7bd7d95601c8f2b96a6866d6fa8e274b6d378752", inputs: [input("requestId", "uint256", true), input("shares", "uint256"), input("assets", "uint256")] },
  { name: "PerpsWithdrawalClaimed", topic: "0xffb9d31cf96839cc5cd4d27c12dc3ed51b0a28af638f50074301388b97cc6313", inputs: [input("requestId", "uint256", true), input("receiver", "address", true), input("assets", "uint256")] },
  { name: "FUSDBufferTargetSet", topic: "0x5de463dea7c9888f4ebf937739a89e12678e31d131cce389505ed65a6a1599bf", inputs: [input("previousBps", "uint256"), input("newBps", "uint256")] },
  { name: "FUSDDepositsPauseSet", topic: "0x08bd9c8c7b5ea82dca14f90a1886bda334ce700851493967956a874ce17c3fe4", inputs: [input("paused", "bool"), input("caller", "address", true)] },
  { name: "FUSDPerformanceFeeAccrued", topic: "0xb2866d2b84a5b91437cb8a33627e1b4a1fa5b0ea64db842c449648a8e0b9fdcd", inputs: [input("feeAssets", "uint256"), input("feeShares", "uint256"), input("highWatermark18", "uint256")] },
  { name: "FUSDStrategyConfigured", topic: "0xb65e29ac886b6daff193da0b9528453149af4dc16576457af06b0f28d0642574", inputs: [input("strategy", "address", true)] },
  { name: "FUSDStrategyEmergencyExited", topic: "0x3f59eabbe50dc016b357bda403e77d6948eae8421ef23b4844ea3464693d3231", inputs: [input("caller", "address", true), input("assetsRecovered", "uint256")] },
  { name: "FUSDStrategyStatusSet", topic: "0xad17490f8dedc56ca6528e75c9d121914f8952500c74630653889cd1dfd391a8", inputs: [input("active", "bool"), input("caller", "address", true)] },
  { name: "FUSDStrategyInvested", topic: "0xd043680d428fc2dcd7caedf64cee767254c5d61209d38ba534529cf2c39d7052", inputs: [input("assets", "uint256"), input("shares", "uint256")] },
  { name: "FUSDStrategyWithdrawn", topic: "0x27683c8889e99eaeb6f7c9e177d5d70bcfc8ab059b36c61ed4a51fa26dddb7cb", inputs: [input("assets", "uint256"), input("shares", "uint256")] },
  { name: "FUSDWithdrawalRequested", topic: "0x00ae2c76ca218353c7995e13a4af773a35837cb6ebb8288092d8190bcd9c8f68", inputs: [input("requestId", "uint256", true), input("owner", "address", true), input("receiver", "address", true), input("shares", "uint256")] },
  { name: "FUSDWithdrawalProcessed", topic: "0x09d1133a9dce4226227ae7068990b4fedb07582402d626c0638b282584e6b190", inputs: [input("requestId", "uint256", true), input("shares", "uint256"), input("assets", "uint256")] },
  { name: "IssuerRoleGranted", topic: "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d", inputs: [input("role", "bytes32", true), input("account", "address", true), input("sender", "address", true)] },
  { name: "IssuerRoleRevoked", topic: "0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b", inputs: [input("role", "bytes32", true), input("account", "address", true), input("sender", "address", true)] },
  { name: "IssuerImplementationUpgraded", topic: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b", inputs: [input("implementation", "address", true)] },
  { name: "IssuerPaused", topic: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258", inputs: [input("account", "address")] },
  { name: "IssuerUnpaused", topic: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa", inputs: [input("account", "address")] },
  { name: "CashOperationsPauseSet", topic: "0x1c029cd8546058b632883c8d772f93d2ceb63372643cd0abdfe85a1ca99db028", inputs: [input("paused", "bool")] },
  { name: "Deposit", topic: "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7", inputs: [input("sender", "address", true), input("owner", "address", true), input("assets", "uint256"), input("shares", "uint256")] },
  { name: "DepositsPauseSet", topic: "0xc4c5fe831919701973bb88552e707619b78efcd47308ccfbf666b97262111146", inputs: [input("paused", "bool")] },
  { name: "FeeModuleSet", topic: "0xed77a117a5df89639cce58296b7a06a099531fba2e55e1381162c0f9216f3c64", inputs: [input("previousModule", "address", true), input("newModule", "address", true)] },
  { name: "InKindRedeemed", topic: "0xd178b2b91f28dc928f228f3a16b3df6eb91b483099f8a0632d7a399d27b0fc15", inputs: [input("caller", "address", true), input("receiver", "address", true), input("owner", "address", true), input("shares", "uint256")] },
  { name: "TransactionFeeCharged", topic: "0xf9688c89b442738ef6269df03d91bfb4c1233c0dcf1f31be1dfa6073c7478b9f", inputs: [input("payer", "address", true), input("token", "address", true), input("amount", "uint256"), input("paidInShares", "bool")] },
  { name: "RebalancerSet", topic: "0x64187bd7b97e66658c91904f3021d7c28de967281d18b1a20742348afdd6a6b3", inputs: [input("previousRebalancer", "address", true), input("newRebalancer", "address", true)] },
  { name: "TvlCapSet", topic: "0x3998a969459814a9349f6fc0f83811b6504bd355b816b95976af3e4dc02f3d5d", inputs: [input("previousCap", "uint256"), input("newCap", "uint256")] },
  { name: "Withdraw", topic: "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db", inputs: [input("sender", "address", true), input("receiver", "address", true), input("owner", "address", true), input("assets", "uint256"), input("shares", "uint256")] },
  { name: "ConfigurationCancelled", topic: "0xe241dd64c49b8c6caa230df8e27c1ec09bb8149c937360b27c56d681b0f82892", inputs: [input("configurationHash", "bytes32", true)] },
  { name: "ConfigurationExecuted", topic: "0x890b12fc42967b4050918f5b07dc0814215816be7ab2d07211a75a15889d9a42", inputs: [input("configurationHash", "bytes32", true), input("version", "uint64", true)] },
  { name: "ConfigurationProposed", topic: "0x6221c68756c3775c36c65198e7aadf48806db2c0748c734c7346a558c99a04cf", inputs: [input("configurationHash", "bytes32", true), input("validAfter", "uint48")] },
  { name: "ConstituentConfigured", topic: "0x3805f6b9eeb9a2f9cb354438b55b37beae08459672b9cc160366892fb690a5db", inputs: [input("token", "address", true), input("feed", "address", true), input("uid", "bytes32", true), input("targetWeightBps", "uint16"), input("eligibleFrom", "uint48"), input("exitAfter", "uint48"), input("version", "uint64")] },
  { name: "ConstituentRemoved", topic: "0x9e7dda9b8761b0e585637a2ccc6afb81fefb9df964c5f92ed99676026abf6412", inputs: [input("token", "address", true), input("version", "uint64", true)] },
  { name: "FeesAccrued", topic: "0x3f0efd667efe2a4e661231bb42b65ce017c3326fb50d12aa6f936500d58c1c02", inputs: [input("timestamp", "uint256", true), input("elapsed", "uint256"), input("sharesMinted", "uint256")] },
  { name: "RatesSet", topic: "0x9af2e94c19992d3f918ea9b2f0b12e8f76db636d960bc86a3c03f2736519fe3c", inputs: [input("managementBps", "uint16"), input("cashBps", "uint16"), input("inKindBps", "uint16"), input("offHoursBps", "uint16")] },
  { name: "TreasurySet", topic: "0x21eb548722a564f6e09f039f7aa858ae94c911910f3823b37af2250eeca4f403", inputs: [input("previousTreasury", "address", true), input("newTreasury", "address", true)] },
  { name: "ChunkLimitSet", topic: "0x27fa6dc3bec86b414c5c360d945a23681831e527a8273e06309e00fb0029b89f", inputs: [input("token", "address", true), input("previousLimit", "uint256"), input("newLimit", "uint256")] },
  { name: "InstructionAuthorized", topic: "0x1334b376052c8489506e855ae1f597cee3aa4e25058b1459e07db88d70f75a7b", inputs: [input("instructionHash", "bytes32", true), input("validAfter", "uint48"), input("deadline", "uint48")] },
  { name: "InstructionCancelled", topic: "0xb07cb16596c341e185f27947e60626883841e592815516fd06768118bb6b4476", inputs: [input("instructionHash", "bytes32", true)] },
  { name: "InstructionExecuted", topic: "0xab96402b40e21945409c45fbe054db07b0189c17f2dd15416c83ef8aebe33c89", inputs: [input("instructionHash", "bytes32", true), input("instructionId", "bytes32", true), input("keeper", "address", true), input("amountIn", "uint256"), input("amountOut", "uint256")] },
  { name: "KeeperSet", topic: "0x8dd62d4e1f60b96148552898e743aa2b571686baa26f4f1b647565dc3996c1a7", inputs: [input("keeper", "address", true), input("allowed", "bool")] },
  { name: "SeriesCreated", topic: "0xf3a5a850451915d9f6b59eacecae48e62546cbe616dc14c4cdef9c622245900a", inputs: [input("seriesId", "bytes32", true), input("underlying", "address", true), input("priceSource", "address", true), input("kind", "uint8"), input("strikeUsd18", "uint256"), input("capUsd18", "uint256"), input("expiry", "uint48"), input("contractSize18", "uint256"), input("underlyingUid", "bytes32"), input("corporateActionPolicyVersion", "uint32")] },
  { name: "SeriesStateChanged", topic: "0x2263d66ab41645c25c40571d625ecd5402e154ce3ae3d70064c32191c484b820", inputs: [input("seriesId", "bytes32", true), input("previousState", "uint8"), input("newState", "uint8"), input("caller", "address", true)] },
  { name: "OptionBought", topic: "0x62ec400cdc3fcaee22524ed3b7ab07a8fc1b96e9f499ba5fbf450a9a3254ca3c", inputs: [input("quoteHash", "bytes32", true), input("seriesId", "bytes32", true), input("buyer", "address", true), input("size18", "uint256"), input("premium6", "uint256"), input("maximumLiability6", "uint256")] },
  { name: "OptionSoldBack", topic: "0x1e93007fb0823cd9001a5f60c168e42e821405ac48c8cec677da7556625c9ad5", inputs: [input("quoteHash", "bytes32", true), input("seriesId", "bytes32", true), input("buyer", "address", true), input("size18", "uint256"), input("payout6", "uint256"), input("releasedLiability6", "uint256")] },
  { name: "OptionClaimed", topic: "0xa827f24ed9d84467c81caea2dd28e3bc1bc341671a6d365c83476f60adf7ed57", inputs: [input("seriesId", "bytes32", true), input("account", "address", true), input("size18", "uint256"), input("payout6", "uint256")] },
  { name: "PositionOpened", topic: "0x236aac4ca7753e6c685d9c0c1586bb4a18ef362f53626522bec45af7bcaa1abf", inputs: [input("seriesId", "bytes32", true), input("size18", "uint256"), input("maximumLiability6", "uint256"), input("totalOpenSize18", "uint256")] },
  { name: "PositionClosed", topic: "0x4a962d7e607739bc46b1326d1dcd2138054534811e46fa90fec07cb26317f8d8", inputs: [input("seriesId", "bytes32", true), input("size18", "uint256"), input("releasedLiability6", "uint256"), input("totalOpenSize18", "uint256")] },
  { name: "SeriesSettled", topic: "0x9fdf9e80bca7d5296861a3d14305568b6fa96917057e1f1ea283826f1d7b1367", inputs: [input("seriesId", "bytes32", true), input("settlementPriceUsd18", "uint256"), input("payoffPerUnitUsd18", "uint256"), input("totalClaimable6", "uint256"), input("manual", "bool")] },
  { name: "PositionClaimed", topic: "0xd730983c6fa8c546218a84601dd88b38e8023efa674dc20fcc255673b89c93af", inputs: [input("seriesId", "bytes32", true), input("account", "address", true), input("size18", "uint256"), input("payout6", "uint256")] },
  { name: "OperationsPauseSet", topic: "0xf5dc1732e030b9d73e8d65a24a07e924a33878845f2921361c90acf2e2e9310f", inputs: [input("paused", "bool"), input("caller", "address", true)] },
  { name: "CollateralReserved", topic: "0x180781f8d05752e395efcf9d13bcde6ac9570c965af2ae8f329245c686fba200", inputs: [input("amount", "uint256"), input("totalReserved", "uint256")] },
  { name: "CollateralReleased", topic: "0xd6513284110ca9c03fb9099da6d3e2c1c34761de7886e2185080cc9a91a46307", inputs: [input("amount", "uint256"), input("totalReserved", "uint256")] },
  { name: "CollateralSettled", topic: "0x304a2464e4353ab4a5a97256fd5fcd627cdfcc82a09e92030184e20bbad7169c", inputs: [input("maximumLiability", "uint256"), input("claimableLiability", "uint256"), input("totalReserved", "uint256"), input("totalClaimable", "uint256")] },
  { name: "ClaimPaid", topic: "0x2426c2fe4ecc089361233f90d45067fd7ba45a260b464b8e920ad9b78969161a", inputs: [input("receiver", "address", true), input("amount", "uint256"), input("remainingClaimable", "uint256")] },
  { name: "SellBackPaid", topic: "0x5d558e91e6b4f270d6e1d5e639db7e33d5c2de6975687ab9a800ea9b8d8b0492", inputs: [input("receiver", "address", true), input("amount", "uint256")] },
  { name: "WithdrawalRequested", topic: "0xad14bfa7b76c7063e518e175fd9a307f5174f2ba038aa973fe2f59eec18036b0", inputs: [input("requestId", "uint256", true), input("owner", "address", true), input("receiver", "address", true), input("shares", "uint256"), input("unlockAt", "uint48")] },
  { name: "WithdrawalCancelled", topic: "0xe8de1e631ea541ac8e6cb398aafb71b991eb58d489298f7bc93ba7e17fa2042b", inputs: [input("requestId", "uint256", true)] },
  { name: "WithdrawalFinalized", topic: "0xc139b6bef6eff640ae01043c46bffa44eb7a231cb2483cc5b320925396daa234", inputs: [input("requestId", "uint256", true), input("shares", "uint256"), input("assets", "uint256")] },
  { name: "WithdrawalClaimed", topic: "0x8adb7a84b2998a8d11cd9284395f95d5a99f160be785ae79998c654979bd3d9a", inputs: [input("requestId", "uint256", true), input("receiver", "address", true), input("assets", "uint256")] },
  { name: "LimitsSet", topic: "0xf04a9be9e3ddf19f6833bac1101df2556b629bab8bde168fd804cbcbcaa49d6c", inputs: [input("utilizationBps", "uint16"), input("underlyingBps", "uint16"), input("expiryBps", "uint16"), input("seriesBps", "uint16")] },
  { name: "ExposureOpened", topic: "0x8c98a09b7c857361e8094d9931448eef72afe7187acaf4f1dddcba2d50a0f1c6", inputs: [input("seriesId", "bytes32", true), input("underlying", "address", true), input("expiry", "uint48", true), input("liability6", "uint256")] },
  { name: "ExposureClosed", topic: "0x74f5e3a6b42b395112df0910ec260afaede04f6c2e41794caf8ba3378e625907", inputs: [input("seriesId", "bytes32", true), input("liability6", "uint256")] },
  { name: "ExposureSettled", topic: "0x156ca5bae75ce4d5395cf436b518f373938258e8a3aeae904008f140a90ecfb5", inputs: [input("seriesId", "bytes32", true), input("liability6", "uint256")] },
];

const BY_TOPIC = new Map(EVENTS.map((event) => [event.topic.toLowerCase(), event]));

export const FLOATS_CORE_EVENT_TOPICS: readonly Hex[] = EVENTS.map((event) => event.topic);

export function decodeFloatsCoreLog(log: RawEvmLog): DecodedLogPayload | undefined {
  const topic0 = log.topics[0];
  if (!topic0) throw new Error("LOG_MISSING_EVENT_TOPIC");
  const definition = BY_TOPIC.get(topic0.toLowerCase());
  if (!definition) return undefined;

  const dataWords = splitWords(log.data);
  const expectedTopics = definition.inputs.filter((item) => item.indexed).length + 1;
  const expectedWords = definition.inputs.length - expectedTopics + 1;
  if (log.topics.length !== expectedTopics || dataWords.length !== expectedWords) {
    throw new Error("MALFORMED_EVENT_DATA");
  }

  let topicIndex = 1;
  let dataIndex = 0;
  const payload: Record<string, string | boolean> = {};
  for (const eventInput of definition.inputs) {
    const word = eventInput.indexed ? log.topics[topicIndex++] : dataWords[dataIndex++];
    if (!word) throw new Error("MALFORMED_EVENT_DATA");
    payload[eventInput.name] = decodeWord(word, eventInput.type);
  }
  return { eventName: definition.name, payload };
}

function splitWords(data: Hex): Hex[] {
  const raw = data.slice(2);
  if (raw.length % 64 !== 0 || !/^[0-9a-fA-F]*$/.test(raw)) throw new Error("MALFORMED_EVENT_DATA");
  return Array.from({ length: raw.length / 64 }, (_, index) => `0x${raw.slice(index * 64, (index + 1) * 64)}` as Hex);
}

function decodeWord(word: Hex, type: SolidityType): string | boolean {
  if (!/^0x[0-9a-fA-F]{64}$/.test(word)) throw new Error("MALFORMED_EVENT_WORD");
  if (type === "bytes32") return word.toLowerCase();
  if (type === "address") return `0x${word.slice(-40).toLowerCase()}`;
  const value = BigInt(word);
  if (type === "bool") {
    if (value !== 0n && value !== 1n) throw new Error("INVALID_BOOLEAN_WORD");
    return value === 1n;
  }
  if (type.startsWith("int")) {
    const signed = value >= 1n << 255n ? value - (1n << 256n) : value;
    return signed.toString();
  }
  return value.toString();
}
