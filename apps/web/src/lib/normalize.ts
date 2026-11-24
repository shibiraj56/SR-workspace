/**
 * SR WORKSPACE - API Data Normalization Utilities
 *
 * Safely extracts arrays of records from varied API response structures:
 * - Paginated envelope: { items: T[], total, page, pageSize, totalPages }
 * - Direct array: T[]
 * - Raw HTTP JSON envelope: { data: { items: T[] } } or { data: T[] }
 *
 * Guarantees an array is returned, preventing 'TypeError: ...map is not a function'.
 */

export function extractItems<T>(response: unknown): T[] {
  if (!response) {
    return [];
  }

  // Already an array
  if (Array.isArray(response)) {
    return response;
  }

  // Object shape checks
  if (typeof response === 'object') {
    const obj = response as Record<string, any>;

    // Standard paginated response: { items: [...] }
    if (Array.isArray(obj.items)) {
      return obj.items;
    }

    // Direct data array: { data: [...] }
    if (Array.isArray(obj.data)) {
      return obj.data;
    }

    // Nested data envelope: { data: { items: [...] } }
    if (obj.data && typeof obj.data === 'object' && Array.isArray(obj.data.items)) {
      return obj.data.items;
    }
  }

  return [];
}
