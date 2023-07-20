export class Metrics {
  /** all blocks read (r2 + s3 + cache) */
  blocks = 0
  /** count of blocks read from R2 */
  blocksR2 = 0
  /** count of blocks read from S3 */
  blocksS3 = 0
  /** count of blocks read from Cache */
  blocksCached = 0
  /** total block bytes read (r2 + s3 + cache) */
  blockBytes = 0
  /** block bytes read from R2 */
  blockBytesR2 = 0
  /** block bytes read from S3 */
  blockBytesS3 = 0
  /** block bytes read from Cloudflare Cache */
  blockBytesCached = 0
  /** count of all index read operations (dynamo + cache) */
  indexes = 0
  /** count of indexes read from Cache */
  indexesCached = 0
}
