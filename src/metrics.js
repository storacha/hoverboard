export class Metrics {
  /** all blocks read (network + cache) */
  blocks = 0
  /** count of blocks fetched from the network */
  blocksFetched = 0
  /** count of blocks read from Cache */
  blocksCached = 0
  /** total block bytes read (network + cache) */
  blockBytes = 0
  /** block bytes read from the network */
  blockBytesFetched = 0
  /** block bytes read from Cloudflare Cache */
  blockBytesCached = 0
  /** count of all index read operations (dynamo + cache) */
  indexes = 0
  /** count of indexes read from Cache */
  indexesCached = 0
}
