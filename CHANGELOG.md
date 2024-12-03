# Changelog

## [3.0.0](https://github.com/storacha/hoverboard/compare/v2.0.7...v3.0.0) (2024-12-03)


### ⚠ BREAKING CHANGES

* hoverboard no longer uses R2 binding, and does not talk to DynamoDB or S3. Instead it uses content claims to determine block locations.

### Features

* add metrics and filter subrequest errors ([#11](https://github.com/storacha/hoverboard/issues/11)) ([29b2fee](https://github.com/storacha/hoverboard/commit/29b2fee5aa955f64867af1941da589d227b04846))
* add release process ([#5](https://github.com/storacha/hoverboard/issues/5)) ([71fd1b8](https://github.com/storacha/hoverboard/commit/71fd1b87362ed6ed308ac9514c05d2e2a03c4092))
* add test for bitswap roundtrip ([#3](https://github.com/storacha/hoverboard/issues/3)) ([ee0b73b](https://github.com/storacha/hoverboard/commit/ee0b73b1db76d0b3d53ca2df48e613b680aaddc6))
* denylist and caching ([#4](https://github.com/storacha/hoverboard/issues/4)) ([d48b9e1](https://github.com/storacha/hoverboard/commit/d48b9e118987de149f56f85b00440d0849d524d6))
* DynamoBlockFinder and DagHausBlockStore ([b6a2d21](https://github.com/storacha/hoverboard/commit/b6a2d2112ffb40c7bba747aa9713af18c7996cc9))
* enable yamux ([#13](https://github.com/storacha/hoverboard/issues/13)) ([da749a0](https://github.com/storacha/hoverboard/commit/da749a0f78b4944851aabeebc39390c1f8224640))
* r2 and s3 blockstore ([b24dd8e](https://github.com/storacha/hoverboard/commit/b24dd8e769b024fce73a4c7f618d8309c6d92b6f))
* ship logs to loki ([#17](https://github.com/storacha/hoverboard/issues/17)) ([9e106d2](https://github.com/storacha/hoverboard/commit/9e106d25c8a50b0cf7df3fd6a4b9ca82758b426b))
* show deployments on repo ([#9](https://github.com/storacha/hoverboard/issues/9)) ([18f2581](https://github.com/storacha/hoverboard/commit/18f2581571435ae090f6a26b57e896498f314061))
* use content claims ([#26](https://github.com/storacha/hoverboard/issues/26)) ([c25860c](https://github.com/storacha/hoverboard/commit/c25860c31ca41f328468c034c42cd8b75182c466))


### Bug Fixes

* add missing dial script ([d8dbe23](https://github.com/storacha/hoverboard/commit/d8dbe23e0c437ca59d6c4d59a087b1f8a3cd5e4e))
* await stream close ([54d8fa9](https://github.com/storacha/hoverboard/commit/54d8fa934e88ef5833d2359e57c4926fbf1457ae))
* batching blob fetcher ([150de87](https://github.com/storacha/hoverboard/commit/150de874596922f451a610c63a831ea83499266a))
* cached locator response ([6944afc](https://github.com/storacha/hoverboard/commit/6944afcc6db8c43696fa03eb2973f4abd98c7f06))
* dont batch requests to s3 (yet) ([#10](https://github.com/storacha/hoverboard/issues/10)) ([64e3382](https://github.com/storacha/hoverboard/commit/64e3382ac1bfba9c177f3aec34508271d26f714c))
* read blobs ([#24](https://github.com/storacha/hoverboard/issues/24)) ([016faa1](https://github.com/storacha/hoverboard/commit/016faa198bae483a7087252806fe8ef203e3e242))
* return cached block ([88798f0](https://github.com/storacha/hoverboard/commit/88798f0508fa2aeb42523f3f14835f2f91035bf3))
* set local listen addr from request ([#15](https://github.com/storacha/hoverboard/issues/15)) ([b3d402b](https://github.com/storacha/hoverboard/commit/b3d402ba84889b4926b92e4a802bbeade03eded6))
* temporary fix to support blobs ([#23](https://github.com/storacha/hoverboard/issues/23)) ([6dca448](https://github.com/storacha/hoverboard/commit/6dca448dbb507dfa2a98b95451a0ae2ff15587fb))
* upgrade blob-fetcher dependency ([c48b8f7](https://github.com/storacha/hoverboard/commit/c48b8f75be2b56583ecfdd6114bb53970c80b0b5))
* upgrade dependencies ([#34](https://github.com/storacha/hoverboard/issues/34)) ([61c9ed8](https://github.com/storacha/hoverboard/commit/61c9ed85ba8cb485582d3c9dbd92b5d07440c5f8))
* upgrade to latest content-claims ([23ea45e](https://github.com/storacha/hoverboard/commit/23ea45e489ec51551da6ad81bdfd8026b2085289))

## [2.0.7](https://github.com/storacha/hoverboard/compare/v2.0.6...v2.0.7) (2024-12-03)


### Bug Fixes

* await stream close ([54d8fa9](https://github.com/storacha/hoverboard/commit/54d8fa934e88ef5833d2359e57c4926fbf1457ae))

## [2.0.6](https://github.com/storacha/hoverboard/compare/v2.0.5...v2.0.6) (2024-10-10)


### Bug Fixes

* upgrade dependencies ([#34](https://github.com/storacha/hoverboard/issues/34)) ([61c9ed8](https://github.com/storacha/hoverboard/commit/61c9ed85ba8cb485582d3c9dbd92b5d07440c5f8))

## [2.0.5](https://github.com/web3-storage/hoverboard/compare/v2.0.4...v2.0.5) (2024-06-13)


### Bug Fixes

* upgrade blob-fetcher dependency ([c48b8f7](https://github.com/web3-storage/hoverboard/commit/c48b8f75be2b56583ecfdd6114bb53970c80b0b5))

## [2.0.4](https://github.com/web3-storage/hoverboard/compare/v2.0.3...v2.0.4) (2024-05-29)


### Bug Fixes

* upgrade to latest content-claims ([23ea45e](https://github.com/web3-storage/hoverboard/commit/23ea45e489ec51551da6ad81bdfd8026b2085289))


### Other Changes

* move content-claims to devDep ([3676487](https://github.com/web3-storage/hoverboard/commit/3676487d2a61247c012781a5a7d2ea45887aa340))

## [2.0.3](https://github.com/web3-storage/hoverboard/compare/v2.0.2...v2.0.3) (2024-05-29)


### Bug Fixes

* return cached block ([88798f0](https://github.com/web3-storage/hoverboard/commit/88798f0508fa2aeb42523f3f14835f2f91035bf3))

## [2.0.2](https://github.com/web3-storage/hoverboard/compare/v2.0.1...v2.0.2) (2024-05-29)


### Bug Fixes

* cached locator response ([6944afc](https://github.com/web3-storage/hoverboard/commit/6944afcc6db8c43696fa03eb2973f4abd98c7f06))

## [2.0.1](https://github.com/web3-storage/hoverboard/compare/v2.0.0...v2.0.1) (2024-05-28)


### Bug Fixes

* batching blob fetcher ([150de87](https://github.com/web3-storage/hoverboard/commit/150de874596922f451a610c63a831ea83499266a))

## [2.0.0](https://github.com/web3-storage/hoverboard/compare/v1.3.2...v2.0.0) (2024-05-28)


### ⚠ BREAKING CHANGES

* hoverboard no longer uses R2 binding, and does not talk to DynamoDB or S3. Instead it uses content claims to determine block locations.

### Features

* use content claims ([#26](https://github.com/web3-storage/hoverboard/issues/26)) ([c25860c](https://github.com/web3-storage/hoverboard/commit/c25860c31ca41f328468c034c42cd8b75182c466))

## [1.3.2](https://github.com/web3-storage/hoverboard/compare/v1.3.1...v1.3.2) (2024-05-17)


### Bug Fixes

* read blobs ([#24](https://github.com/web3-storage/hoverboard/issues/24)) ([016faa1](https://github.com/web3-storage/hoverboard/commit/016faa198bae483a7087252806fe8ef203e3e242))

## [1.3.1](https://github.com/web3-storage/hoverboard/compare/v1.3.0...v1.3.1) (2024-05-17)


### Bug Fixes

* temporary fix to support blobs ([#23](https://github.com/web3-storage/hoverboard/issues/23)) ([6dca448](https://github.com/web3-storage/hoverboard/commit/6dca448dbb507dfa2a98b95451a0ae2ff15587fb))


### Other Changes

* README says to 'npm install' ([#19](https://github.com/web3-storage/hoverboard/issues/19)) ([f7c5328](https://github.com/web3-storage/hoverboard/commit/f7c5328fa14c567482a3dc9f039bc4bc18d4ff87))

## [1.3.0](https://github.com/web3-storage/hoverboard/compare/v1.2.1...v1.3.0) (2023-07-25)


### Features

* ship logs to loki ([#17](https://github.com/web3-storage/hoverboard/issues/17)) ([9e106d2](https://github.com/web3-storage/hoverboard/commit/9e106d25c8a50b0cf7df3fd6a4b9ca82758b426b))

## [1.2.1](https://github.com/web3-storage/hoverboard/compare/v1.2.0...v1.2.1) (2023-07-24)


### Bug Fixes

* set local listen addr from request ([#15](https://github.com/web3-storage/hoverboard/issues/15)) ([b3d402b](https://github.com/web3-storage/hoverboard/commit/b3d402ba84889b4926b92e4a802bbeade03eded6))

## [1.2.0](https://github.com/web3-storage/hoverboard/compare/v1.1.0...v1.2.0) (2023-07-24)


### Features

* enable yamux ([#13](https://github.com/web3-storage/hoverboard/issues/13)) ([da749a0](https://github.com/web3-storage/hoverboard/commit/da749a0f78b4944851aabeebc39390c1f8224640))

## [1.1.0](https://github.com/web3-storage/hoverboard/compare/v1.0.0...v1.1.0) (2023-07-21)


### Features

* add metrics and filter subrequest errors ([#11](https://github.com/web3-storage/hoverboard/issues/11)) ([29b2fee](https://github.com/web3-storage/hoverboard/commit/29b2fee5aa955f64867af1941da589d227b04846))

## 1.0.0 (2023-07-19)


### Features

* add release process ([#5](https://github.com/web3-storage/hoverboard/issues/5)) ([71fd1b8](https://github.com/web3-storage/hoverboard/commit/71fd1b87362ed6ed308ac9514c05d2e2a03c4092))
* add test for bitswap roundtrip ([#3](https://github.com/web3-storage/hoverboard/issues/3)) ([ee0b73b](https://github.com/web3-storage/hoverboard/commit/ee0b73b1db76d0b3d53ca2df48e613b680aaddc6))
* denylist and caching ([#4](https://github.com/web3-storage/hoverboard/issues/4)) ([d48b9e1](https://github.com/web3-storage/hoverboard/commit/d48b9e118987de149f56f85b00440d0849d524d6))
* DynamoBlockFinder and DagHausBlockStore ([b6a2d21](https://github.com/web3-storage/hoverboard/commit/b6a2d2112ffb40c7bba747aa9713af18c7996cc9))
* r2 and s3 blockstore ([b24dd8e](https://github.com/web3-storage/hoverboard/commit/b24dd8e769b024fce73a4c7f618d8309c6d92b6f))
* show deployments on repo ([#9](https://github.com/web3-storage/hoverboard/issues/9)) ([18f2581](https://github.com/web3-storage/hoverboard/commit/18f2581571435ae090f6a26b57e896498f314061))


### Bug Fixes

* add missing dial script ([d8dbe23](https://github.com/web3-storage/hoverboard/commit/d8dbe23e0c437ca59d6c4d59a087b1f8a3cd5e4e))
* dont batch requests to s3 (yet) ([#10](https://github.com/web3-storage/hoverboard/issues/10)) ([64e3382](https://github.com/web3-storage/hoverboard/commit/64e3382ac1bfba9c177f3aec34508271d26f714c))


### Other Changes

* fix ci ([#8](https://github.com/web3-storage/hoverboard/issues/8)) ([503397c](https://github.com/web3-storage/hoverboard/commit/503397c0c0580fb56190bdead519a0009e5d7bd3))
* fix release workflow ([#6](https://github.com/web3-storage/hoverboard/issues/6)) ([9501aa2](https://github.com/web3-storage/hoverboard/commit/9501aa2add1f1903855b8c23d981a6d455d6cff0))
