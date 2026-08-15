# Authentik deployment - operational targets.
# Requires Docker Compose v2 (docker compose ...).

SHELL := /bin/bash
COMPOSE := docker compose
STACK   := -f compose.yml
# Include the dev override only when explicitly requested.
DEV_STACK := -f compose.yml -f compose.override.yml

.PHONY: help init secrets pull up up-dev down restart logs status health \
        apply-blueprint verify backup restore upgrade

help:
	@echo "Targets:"
	@echo "  init             - create .env from .env.example (does not overwrite)"
	@echo "  secrets          - generate strong PG password + AUTHENTIK_SECRET_KEY"
	@echo "  pull             - pull pinned images"
	@echo "  up               - start stack (production compose only)"
	@echo "  up-dev           - start stack with dev override (exposes 9000/9443)"
	@echo "  down             - stop stack"
	@echo "  restart          - restart server + worker"
	@echo "  logs             - tail logs (all services)"
	@echo "  status           - docker compose ps"
	@echo "  health           - hit /-/health/live/ and /-/health/ready/"
	@echo "  apply-blueprint  - trigger blueprint reconcile in worker"
	@echo "  verify           - run scripts/verify-oidc.sh"
	@echo "  backup           - run scripts/backup.sh"
	@echo "  restore FILE=... - run scripts/restore.sh with a backup archive"
	@echo "  upgrade          - pull new images and recreate server+worker"

init:
	@if [ -f .env ]; then \
		echo ".env already exists - refusing to overwrite"; exit 1; \
	fi
	cp .env.example .env
	chmod 600 .env
	@echo ".env created. Now run: make secrets"

secrets:
	./scripts/generate-secrets.sh

pull:
	$(COMPOSE) $(STACK) pull

up:
	$(COMPOSE) $(STACK) up -d

up-dev:
	$(COMPOSE) $(DEV_STACK) up -d

down:
	$(COMPOSE) $(STACK) down

restart:
	$(COMPOSE) $(STACK) restart server worker

logs:
	$(COMPOSE) $(STACK) logs -f --tail=200

status:
	$(COMPOSE) $(STACK) ps

health:
	@set -a; . ./.env; set +a; \
	curl -fsS "https://$${AUTH_DOMAIN}/-/health/live/"  && echo " live: OK";  \
	curl -fsS "https://$${AUTH_DOMAIN}/-/health/ready/" && echo " ready: OK"

apply-blueprint:
	# Blueprints under /blueprints/custom are auto-loaded by the worker.
	# This target forces a reconcile by restarting the worker.
	$(COMPOSE) $(STACK) restart worker
	@echo "Watch: make logs | grep -i blueprint"

verify:
	./scripts/verify-oidc.sh

backup:
	./scripts/backup.sh

restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=backups/authentik-YYYYmmdd-HHMMSS.tar.gz"; exit 1; fi
	./scripts/restore.sh "$(FILE)"

upgrade:
	$(COMPOSE) $(STACK) pull
	$(COMPOSE) $(STACK) up -d --force-recreate server worker
	@echo "Verify after upgrade: make health && make verify"
