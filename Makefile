.PHONY: check coverage env-schema format gas lint test test-env

check: env-schema format lint test-env test

env-schema:
	./scripts/validate-env.sh --schema .env.testnet.example
	./scripts/validate-env.sh --schema .env.mainnet.example

format:
	forge fmt --check

lint:
	forge lint

test-env:
	./scripts/test-validate-env.sh

test:
	forge test

coverage:
	forge coverage

gas:
	forge snapshot --check
