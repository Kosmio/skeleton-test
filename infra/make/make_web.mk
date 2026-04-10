VERSION = $(shell cat VERSION)

SKELETON_TEST_WEB_DOCKERFILE	:= infra/docker/website/Dockerfile
SKELETON_TEST_WEB_NAME		:= skeleton-test-web
SKELETON_TEST_WEB_IMG		:= ${SKELETON_TEST_WEB_NAME}:${VERSION}

.PHONY: lint build test stage promote

lint: docker-skeleton-test-web-lint

build: docker-skeleton-test-web-build

test:
	echo 'No Test'

stage: docker-skeleton-test-web-stage

promote:
	echo 'No Promote'

docker-skeleton-test-web-lint:
	@docker run --rm -i hadolint/hadolint hadolint - < ${SKELETON_TEST_WEB_DOCKERFILE}

docker-skeleton-test-web-build:
	@docker build --no-cache=true \
		-f ${SKELETON_TEST_WEB_DOCKERFILE} -t ${SKELETON_TEST_WEB_IMG} .

docker-skeleton-test-web-stage:
	@docker tag ${SKELETON_TEST_WEB_IMG} ${CI_REGISTRY_URL}/${SKELETON_TEST_WEB_IMG}
	@docker push ${CI_REGISTRY_URL}/${SKELETON_TEST_WEB_IMG}
