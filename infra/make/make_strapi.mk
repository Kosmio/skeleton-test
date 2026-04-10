VERSION = $(shell cat VERSION)

SKELETON_TEST_STRAPI_DOCKERFILE	:= infra/docker/strapi/Dockerfile
SKELETON_TEST_STRAPI_NAME		:= skeleton-test-strapi
SKELETON_TEST_STRAPI_IMG			:= ${SKELETON_TEST_STRAPI_NAME}:${VERSION}

.PHONY: lint build test stage promote

lint: docker-skeleton-test-strapi-lint

build: docker-skeleton-test-strapi-build

test:
	echo 'No Test'

stage: docker-skeleton-test-strapi-stage

promote:
	echo 'No Promote'

docker-skeleton-test-strapi-lint:
	@docker run --rm -i hadolint/hadolint hadolint - < ${SKELETON_TEST_STRAPI_DOCKERFILE}

docker-skeleton-test-strapi-build:
	@docker build --no-cache=true \
		--build-arg ADMIN_URL=$${ADMIN_URL} \
		--build-arg STRAPI_ADMIN_BACKEND_URL=$${STRAPI_ADMIN_BACKEND_URL} \
		-f ${SKELETON_TEST_STRAPI_DOCKERFILE} -t ${SKELETON_TEST_STRAPI_IMG} .

docker-skeleton-test-strapi-stage:
	@docker tag ${SKELETON_TEST_STRAPI_IMG} ${CI_REGISTRY_URL}/${SKELETON_TEST_STRAPI_IMG}
	@docker push ${CI_REGISTRY_URL}/${SKELETON_TEST_STRAPI_IMG}
