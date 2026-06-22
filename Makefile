SHELL := /bin/bash

NVM_DIR ?= $(HOME)/.nvm
NODE_VERSION := $(shell cat .nvmrc)
NVM := . "$(NVM_DIR)/nvm.sh" && nvm use >/dev/null &&

.PHONY: ensure-node install build watch check deploy clean

ensure-node:
	@if [ ! -s "$(NVM_DIR)/nvm.sh" ]; then \
		echo "nvm is required but was not found at $(NVM_DIR)/nvm.sh."; \
		echo "Install nvm, then run: nvm install $(NODE_VERSION)"; \
		exit 1; \
	fi
	@. "$(NVM_DIR)/nvm.sh"; \
	if ! nvm use >/dev/null 2>&1; then \
		echo "Node $(NODE_VERSION) is required but is not installed."; \
		echo "Run: nvm install $(NODE_VERSION)"; \
		exit 1; \
	fi

install: ensure-node
	$(NVM) npm install

build: ensure-node
	$(NVM) npm run build

watch: ensure-node
	$(NVM) npm run watch

check: build
	$(NVM) npm run validate
	git diff --check
	git diff --exit-code assets/styles.css

deploy: check
	git push origin HEAD

clean:
	rm -rf node_modules
