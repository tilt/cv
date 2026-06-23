SHELL := /bin/bash

NVM_DIR ?= $(HOME)/.nvm
NODE_VERSION := $(shell cat .nvmrc)
NVM := . "$(NVM_DIR)/nvm.sh" && nvm use >/dev/null &&

.PHONY: ensure-node install install-browser build build-brief pdf build-prod watch serve check check-prod deploy clean

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
	$(NVM) npx playwright install chromium

install-browser: ensure-node
	$(NVM) npx playwright install chromium

build: ensure-node
	$(NVM) npm run build

build-brief: ensure-node
	$(NVM) npm run build:css
	$(NVM) npm run build:html -- --variant brief

# Build the web output, then render both PDFs from it with Playwright.
pdf: build
	$(NVM) npm run pdf

# Complete production build: web output + bilingual PDFs into dist/.
build-prod: ensure-node
	$(NVM) npm run build:prod

watch: ensure-node
	$(NVM) npm run watch:css

serve: build
	$(NVM) npx serve dist

# Fast check: web build + HTML validation.
check: build
	$(NVM) npm run validate

# Canonical pre-push check of the complete deployed artifact:
# data validation + web build + HTML validation + both PDFs.
check-prod: build-prod
	$(NVM) npm run validate

deploy: check-prod
	git push origin HEAD

clean:
	rm -rf node_modules
