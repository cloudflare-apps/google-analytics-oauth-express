NAME := google-analytics-oauth-service
TARGET := google-analytics-oauth-service
IMPORT_PATH := code.cfops.it/apps/$(TARGET)
V := 1 # When V is 1, print commands and build progress.
IGNORED_PACKAGES := /vendor/
BUILD_DEPS := go

.PHONY: all
all: $(TARGET)

.PHONY: $(TARGET)
$(TARGET):

MARATHON_CURL = curl -s -X PUT -H "Content-type: application/json" -d @-
YAML2JSON = ( python -c 'import sys, yaml, json; json.dump(yaml.load(sys.stdin), sys.stdout, indent=4)' 2>/dev/null || ruby -ryaml -rjson -e 'puts JSON.pretty_generate(YAML.load(ARGF))' )

.PHONY: check-auth
check-auth:
ifndef AUTH_HEADERS
	$(error Please set your AUTH_HEADERS from https://appstore.marathon.cfdata.org/_token.curl)
endif

.PHONY: print-builddeps
print-builddeps:
	@echo $(BUILD_DEPS)

.PHONY: build-container
build-container:
	docker build -t docker.cfops.it/$(NAME):$(VERSION) .

.PHONY:publish-container
publish-container: build-container
	docker push docker.cfops.it/$(NAME):$(VERSION)

# If you don't have the PDX vpn profile, you can deploy to Marathon
# from the VPN using Oauth to authenticate yourself. Grab auth headers
# from https://appstore.marathon.cfdata.org/_token.curl and put them in
# the variable above.
.PHONY: deploy
deploy: check-auth publish-container
	cat marathon.yaml | sed -e "s/\$${VERSION}/${VERSION}/" | sed -e "s/\$${ADMIN_SECRET}/${ADMIN_SECRET}/" | $(YAML2JSON) | \
		$(MARATHON_CURL) $(AUTH_HEADERS) https://appstore.marathon.cfdata.org/v2/groups | jq .

# This target allows you to avoid needing Oauth headers but requires
# that you have the PDX vpn profile.
.PHONY: deploy-in-pdx
deploy-in-pdx: publish-container
	cat marathon.yaml | sed -e "s/\$${VERSION}/${VERSION}/" | $(YAML2JSON) | \
		$(MARATHON_CURL) https://appstore.marathon.in.pdx.cfdata.org/v2/groups | jq .

.PHONY: deploy-staging-in-pdx
deploy-staging-in-pdx: publish-container
	cat marathon.staging.yaml | sed -e "s/\$${VERSION}/${VERSION}/" | $(YAML2JSON) | \
		$(MARATHON_CURL) https://appstore.marathon.in.pdx.cfdata.org/v2/groups | jq .


.PHONY: deploy-staging
deploy-staging: check-auth publish-container
	cat marathon.staging.yaml | sed -e "s/\$${VERSION}/${VERSION}/" | sed -e "s/\$${ADMIN_SECRET}/${ADMIN_SECRET}/" | $(YAML2JSON) | \
		$(MARATHON_CURL) $(AUTH_HEADERS) https://appstore.marathon.cfdata.org/v2/groups | jq .

##### ^^^^^^ EDIT ABOVE ^^^^^^ #####

##### =====> Packaging <===== #####

TMP_ROOT         := $(CURDIR)/tmp
PACKAGE_ROOT     := $(TMP_ROOT)/packaging
INSTALL_PREFIX   := usr/local
INSTALL_BINDIR   := $(INSTALL_PREFIX)/bin
INSTALL_DATADIR  := $(INSTALL_PREFIX)/$(TARGET)

FPM := fakeroot fpm -C $(PACKAGE_ROOT) -s dir \
	-t deb --deb-compression bzip2 \
	-v $(VERSION)

.PHONY: cf-package
cf-package:
	$(MAKE) clean
	$(MAKE) $(TARGET)

list: .GOPATH/.ok
	@echo $(allpackages)

cover: bin/gocovmerge .GOPATH/.ok
	$Q rm -f .GOPATH/cover/*.out .GOPATH/cover/all.merged
	$(if $V,@echo "-- go test -coverpkg=./... -coverprofile=.GOPATH/cover/... ./...")
	$Q for MOD in $(allpackages); do \
		go test -coverpkg=`echo $(allpackages)|tr " " ","` \
			-coverprofile=.GOPATH/cover/unit-`echo $$MOD|tr "/" "_"`.out \
			$$MOD 2>&1 | grep -v "no packages being tested depend on" || exit 1; \
	done
	$Q ./bin/gocovmerge .GOPATH/cover/*.out > .GOPATH/cover/all.merged
ifndef CI
	$Q go tool cover -html .GOPATH/cover/all.merged
else
	$Q go tool cover -html .GOPATH/cover/all.merged -o .GOPATH/cover/all.html
endif
	@echo ""
	@echo "=====> Total test coverage: <====="
	@echo ""
	$Q go tool cover -func .GOPATH/cover/all.merged

format: bin/goimports .GOPATH/.ok
	$Q find .GOPATH/src/$(IMPORT_PATH)/ -iname \*.go | grep -v -e "^$$" $(addprefix -e ,$(IGNORED_PACKAGES)) | xargs ./bin/goimports -w

##### =====> Internals <===== #####

.PHONY: setup
setup: clean .GOPATH/.ok
	@if ! grep "/.GOPATH" .gitignore > /dev/null 2>&1; then \
	    echo "/.GOPATH" >> .gitignore; \
	    echo "/bin" >> .gitignore; \
	fi
	go get -u github.com/FiloSottile/gvt
	- ./bin/gvt fetch golang.org/x/tools/cmd/goimports
	- ./bin/gvt fetch github.com/wadey/gocovmerge

VERSION          ?= $(shell git describe --tags --always --dirty="-dev")
DATE             := $(shell date -u '+%Y-%m-%d-%H%M UTC')
VERSION_FLAGS    := -ldflags='-X "main.Version=$(VERSION)" -X "main.BuildTime=$(DATE)"'

# cd into the GOPATH to workaround ./... not following symlinks
_allpackages = $(shell ( cd $(CURDIR)/.GOPATH/src/$(IMPORT_PATH) && \
    GOPATH=$(CURDIR)/.GOPATH go list ./... 2>&1 1>&3 | \
    grep -v -e "^$$" $(addprefix -e ,$(IGNORED_PACKAGES)) 1>&2 ) 3>&1 | \
    grep -v -e "^$$" $(addprefix -e ,$(IGNORED_PACKAGES)))

# memoize allpackages, so that it's executed only once and only if used
allpackages = $(if $(__allpackages),,$(eval __allpackages := $$(_allpackages)))$(__allpackages)

export GOPATH := $(CURDIR)/.GOPATH

Q := $(if $V,,@)

.GOPATH/.ok:
	$Q mkdir -p "$(dir .GOPATH/src/$(IMPORT_PATH))"
	$Q ln -s ../../../.. ".GOPATH/src/$(IMPORT_PATH)"
	$Q mkdir -p .GOPATH/test .GOPATH/cover
	$Q mkdir -p bin
	$Q ln -s ../bin .GOPATH/bin
	$Q touch $@

.PHONY: bin/gocovmerge bin/goimports
bin/gocovmerge: .GOPATH/.ok
	$Q go install $(IMPORT_PATH)/vendor/github.com/wadey/gocovmerge
bin/goimports: .GOPATH/.ok
	$Q go install $(IMPORT_PATH)/vendor/golang.org/x/tools/cmd/goimports
